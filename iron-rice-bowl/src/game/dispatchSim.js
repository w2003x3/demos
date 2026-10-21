// 行控調度模擬(純運算,可在 node 測試):雙線鐵路 + 自動閉塞 + 待避線 + 單線雙向運轉 + 事故。
// 時間單位:分鐘(模擬時間);位置:公里。軌道:'S' 南下(dir +1)、'N' 北上(dir -1)。
//
// 規則:
//   - 閉塞:同一軌道的同一站間區間同時只能有一列車;進站要月台(正線或待避線)空著
//   - 自強號只停大站,區間車每站停;沒有調度時列車依序行駛(快車會被前方慢車擋住而延誤)
//   - 調度指令:扣車 / 放行 / 待避(在有待避線的車站讓後車先過)/ 單線雙向運轉(兩個有渡線的車站之間共用一條軌道,
//     進入該區間須逐列放行;若放行時對向列車還在區間內 → 險些相撞)
//   - 事故:列車故障(堵住所在區間)、號誌故障(該站發車須人工放行)、路線異物(某方向區間封鎖)、月台人潮(停站變長)
export const SPEED = { exp: 1.95, loc: 1.5 };      // 公里 / 分
export const DWELL = { exp: 1.0, loc: 0.6 };       // 停站分鐘

export class DispatchSim {
  /** line: { stations:[{name, km, siding, express}] };level: DISPATCH_LEVELS 的一項 */
  constructor(line, level) {
    this.st = line.stations;
    this.n = this.st.length;
    this.L = level;
    this.t = 0;
    this.slow = level.slow || 1;
    this.log = [];            // { t, text, kind }
    this.events = [];         // 給介面播語音/特效:{ kind, train, ... }
    this.conflicts = 0;
    this.slw = [];            // 單線雙向運轉區間 { a, b, track, by }
    this.signalFail = {};     // 站 index → 結束時間
    this.crowd = {};          // 站 index → 結束時間
    this.blocked = [];        // { track, a, b, until, why }
    this.incidents = (level.incidents || []).map((x, i) => ({ ...x, id: i, state: 'pending' }));
    const idx = (name) => this.st.findIndex((s) => s.name === name);
    this.idx = idx;
    // 列車與時刻表(自由行駛的預定時刻)
    this.trains = level.trains.map((d) => {
      const dir = d.dir, from = dir > 0 ? 0 : this.n - 1, to = dir > 0 ? this.n - 1 : 0;
      const stops = this.st.map((s, k) => k === from || k === to || d.type === 'loc' || s.express);
      const sched = new Array(this.n).fill(null);
      let tt = d.at;
      for (let k = from; ; k += dir) {
        sched[k] = { arr: tt, dep: tt + (k === from ? 0 : stops[k] ? DWELL[d.type] : 0) };
        if (k === from) sched[k].arr = d.at;
        tt = sched[k].dep;
        if (k === to) break;
        tt += Math.abs(this.st[k + dir].km - this.st[k].km) / (SPEED[d.type] * this.slow);
      }
      return {
        ...d, from, to, stops, sched, track: dir > 0 ? 'S' : 'N',
        state: 'wait-start', at0: d.at, k: from, x: this.st[from].km, slot: null, dwell: 0,
        hold: false, release: false, siding: null, broken: 0, delay: 0, arrived: null, log: [],
      };
    });
    // 班次結束時間:最後一班預定到站後再 20 分鐘(或全部列車到站)
    this.endTime = Math.max(...this.trains.map((t) => t.sched[t.to].arr)) + 20;
  }

  // ---------------------------------------------------------------- 查詢
  trainBy(no) { return this.trains.find((t) => t.no === no); }
  segOf(t) { return t.dir > 0 ? t.k : t.k - 1; }   // 行駛中所在區間(k 為出發站)
  /** 區間 seg(站 seg ↔ seg+1)在軌道 tr 上的列車 */
  inSeg(seg, tr) { return this.trains.filter((t) => t.state === 'run' && t.runTrack === tr && this.segOf(t) === seg); }
  atStation(k, tr, slot) { return this.trains.filter((t) => t.state === 'dwell' && t.k === k && t.trackAt === tr && t.slot === slot); }
  isBlocked(tr, seg) { return this.blocked.some((b) => b.track === tr && seg >= Math.min(b.a, b.b) && seg < Math.max(b.a, b.b)); }
  slwFor(seg) { return this.slw.find((s) => seg >= s.a && seg < s.b); }
  /** 站間時刻表上的延誤(分) */
  delayOf(t) {
    if (t.state === 'done') return t.delay;
    const s = t.sched[t.k];
    if (!s) return 0;
    if (t.state === 'run') return Math.max(0, this.t - s.dep - Math.abs(t.x - this.st[t.k].km) / (SPEED[t.type] * this.slow));
    return Math.max(0, Math.max(this.t, s.dep) - s.dep);
  }

  // ---------------------------------------------------------------- 調度指令
  cmdHold(no, on = true) {
    const t = this.trainBy(no); if (!t || t.state === 'done') return false;
    t.hold = on; if (!on) t.release = true;
    this._log(on ? `扣車:${t.no} 次在${this.st[this.nextStop(t)].name}站等候` : `放行:${t.no} 次`, 'cmd');
    this.events.push({ kind: on ? 'hold' : 'release', train: t.no });
    return true;
  }
  cmdRelease(no) { return this.cmdHold(no, false); }
  /** 待避:在下一個(或目前所在)有待避線的車站進待避線,等後方下一列同向列車通過 */
  cmdSiding(no) {
    const t = this.trainBy(no); if (!t || t.state === 'done') return false;
    let k = t.state === 'run' ? t.k + t.dir : t.k;
    if (t.state !== 'run' && t.slot === 'side') return false;
    while (k >= 0 && k < this.n && !this.st[k].siding) { k += t.dir; }
    if (k < 0 || k >= this.n || k === t.to) { this._log(`${t.no} 次前方沒有可待避的車站`, 'warn'); return false; }
    t.siding = k;
    this._log(`待避:${t.no} 次在${this.st[k].name}站進待避線,讓後車先行`, 'cmd');
    this.events.push({ kind: 'siding', train: t.no, station: this.st[k].name });
    return true;
  }
  /** 單線雙向運轉:a、b 為有渡線的車站 index(a < b),track = 共用的軌道 */
  cmdSLW(a, b, track) {
    if (this.slw.some((s) => s.a === a && s.b === b)) { this.slw = this.slw.filter((s) => !(s.a === a && s.b === b)); this._log(`解除單線雙向運轉:${this.st[a].name}—${this.st[b].name}`, 'cmd'); this.events.push({ kind: 'slw-off' }); return true; }
    this.slw.push({ a, b, track });
    this._log(`啟用單線雙向運轉:${this.st[a].name}—${this.st[b].name}(共用${track === 'S' ? '南下' : '北上'}線),進入區間須逐列放行`, 'cmd');
    this.events.push({ kind: 'slw-on' });
    return true;
  }

  nextStop(t) { if (t.state !== 'run') return t.k; return t.k + t.dir; }

  // ---------------------------------------------------------------- 推進
  step(dt) {
    this.t += dt;
    // 事故觸發與結束
    for (const I of this.incidents) {
      if (I.state === 'pending' && this.t >= I.at) this._startIncident(I);
      if (I.state === 'active' && I.until && this.t >= I.until) this._endIncident(I);
    }
    this.blocked = this.blocked.filter((b) => b.until > this.t);
    for (const t of this.trains) this._stepTrain(t, dt);
  }

  _startIncident(I) {
    const k = I.station ? this.idx(I.station) : null;
    if (I.kind === 'signal') { this.signalFail[k] = this.t + I.mins; I.state = 'active'; I.until = this.t + I.mins; this._log(`⚠ ${I.station}站號誌故障:列車發車須人工放行(約 ${I.mins} 分鐘)`, 'alert'); this.events.push({ kind: 'incident', sub: 'signal' }); }
    if (I.kind === 'crowd') { this.crowd[k] = this.t + I.mins; I.state = 'active'; I.until = this.t + I.mins; this._log(`⚠ ${I.station}站月台人潮擁擠,停站時間延長`, 'alert'); this.events.push({ kind: 'incident', sub: 'crowd' }); }
    if (I.kind === 'obstacle') {
      const a = this.idx(I.between[0]), b = this.idx(I.between[1]);
      const tr = I.dir > 0 ? 'S' : 'N';
      this.blocked.push({ track: tr, a: Math.min(a, b), b: Math.max(a, b), until: this.t + I.mins, why: '路線異物' });
      I.state = 'active'; I.until = this.t + I.mins;
      this._log(`⚠ ${I.between[0]}—${I.between[1]} ${tr === 'S' ? '南下' : '北上'}線發現路線異物,封鎖約 ${I.mins} 分鐘`, 'alert');
      this.events.push({ kind: 'incident', sub: 'obstacle' });
    }
    if (I.kind === 'breakdown') {
      const t = this.trainBy(I.train);
      const a = this.idx(I.between[0]), b = this.idx(I.between[1]);
      if (!t || t.state === 'done') { I.state = 'done'; return; }
      // 列車進到該區間時故障(還沒到就等它到)
      const seg = this.segOf(t);
      if (t.state === 'run' && seg >= Math.min(a, b) && seg < Math.max(a, b)) {
        t.broken = this.t + I.mins; I.state = 'active'; I.until = t.broken;
        this._log(`⚠ ${t.no} 次在${this.st[seg].name}—${this.st[seg + 1].name}間故障停車,約 ${I.mins} 分鐘無法移動`, 'alert');
        this.events.push({ kind: 'incident', sub: 'breakdown', train: t.no });
      }
    }
  }

  _endIncident(I) {
    I.state = 'done';
    const name = { signal: '號誌修復', crowd: '人潮紓解', obstacle: '異物排除,路線恢復通行', breakdown: '故障列車修復,恢復行駛' }[I.kind];
    this._log(`✓ ${name}`, 'ok');
    this.events.push({ kind: 'resolved', sub: I.kind });
  }

  _stepTrain(t, dt) {
    if (t.state === 'done') return;
    if (t.state === 'wait-start') {
      t.trackAt = t.track; t.slot = 'main';
      if (this.t < t.at0) return;
      t.state = 'dwell'; t.dwell = 0; t.k = t.from;
    }
    if (t.state === 'dwell') {
      t.dwell -= dt;
      if (t.dwell > 0) return;
      if (t.k === t.to) { t.state = 'done'; t.delay = Math.max(0, this.t - t.sched[t.to].arr); this._log(`${t.no} 次抵達終點${this.st[t.to].name}${t.delay >= 1 ? `,延誤 ${Math.round(t.delay)} 分` : ',準點'}`, t.delay > 5 ? 'warn' : 'ok'); return; }
      if (this.t < t.sched[t.k].dep - 0.001 && t.stops[t.k]) return;     // 不早開
      this._tryDepart(t);
      return;
    }
    if (t.state === 'run') {
      if (t.broken > this.t) return;
      if (t.broken && t.broken <= this.t) t.broken = 0;
      const nk = t.k + t.dir, target = this.st[nk].km;
      t.x += t.dir * SPEED[t.type] * this.slow * dt;
      if ((t.dir > 0 && t.x >= target) || (t.dir < 0 && t.x <= target)) {
        t.x = target; t.k = nk;
        t.state = 'dwell';
        t.trackAt = t.nkTrack || t.track;
        t.slot = t.siding === nk ? 'side' : 'main';
        if (t.inSlw && (nk === t.inSlw.a || nk === t.inSlw.b)) t.inSlw = null;   // 出了單線區間
        const crowd = this.crowd[nk] > this.t ? 3 : 1;
        t.dwell = t.stops[nk] ? DWELL[t.type] * crowd : 0;
        if (t.slot === 'side') { t.waitPass = this._followerOf(t); t.siding = null; }
      }
    }
  }

  /** 後方下一列同方向列車(待避時要讓它先通過) */
  _followerOf(t) {
    const behind = this.trains.filter((o) => o !== t && o.dir === t.dir && o.state !== 'done' && (o.x - t.x) * t.dir < 0);
    behind.sort((a, b) => (b.x - a.x) * t.dir);
    return behind[0]?.no || null;
  }

  _tryDepart(t) {
    const k = t.k, nk = k + t.dir, seg = t.dir > 0 ? k : k - 1;
    t.waitReason = null;
    if (t.hold) { t.waitReason = '扣車中'; return; }
    // 待避線:等指定的後車通過本站
    if (t.slot === 'side' && t.waitPass) {
      const f = this.trainBy(t.waitPass);
      const passed = !f || f.state === 'done' || (f.x - this.st[k].km) * t.dir > 0.05 || (f.k !== k && (f.k - k) * t.dir > 0);
      if (!passed && !t.release) { t.waitReason = `待避中(等 ${t.waitPass} 次通過)`; return; }
      t.waitPass = null;
    }
    if (this.signalFail[k] > this.t && !t.release) { t.waitReason = '號誌故障:等候人工放行'; return; }
    // 軌道:在單線雙向區間內共用 slw.track;區間兩端的車站各走本線月台(經渡線進出)
    const slw = this.slwFor(seg);
    const tr = slw ? slw.track : t.track;
    const entering = slw && t.inSlw !== slw;
    if (this.isBlocked(tr, seg)) { t.waitReason = `前方${tr === 'S' ? '南下' : '北上'}線封鎖`; return; }
    if (this.trains.some((o) => o !== t && o.state === 'run' && o.runTrack === tr && this.segOf(o) === seg && o.broken > this.t)) { t.waitReason = '前方有故障列車'; return; }
    if (entering && !t.release) { t.waitReason = '單線雙向區間:等候放行'; return; }
    // 放行進入單線區間:對向列車還在區間內 → 險些相撞
    // 放行時對向列車還在單線區間內 → 險些相撞(ATP 緊急停車攔下,放行作廢)
    if (entering) {
      const opp = this.trains.find((o) => o !== t && o.dir !== t.dir && o.state !== 'done' && o.inSlw === slw);
      if (opp) {
        this.conflicts++;
        t.release = false; t.dwell = 3;
        this._log(`✖ 險些相撞!${t.no} 次被放行進入單線區間,但對向 ${opp.no} 次還在區間內,ATP 緊急停車`, 'alert');
        this.events.push({ kind: 'conflict', train: t.no, other: opp.no });
        t.waitReason = '險些相撞!等候對向列車離開';
        return;
      }
    }
    // 閉塞:同軌道同區間有車就等(單線區間內含對向列車)
    const occ = this.inSeg(seg, tr).filter((o) => o.dir === t.dir || slw);
    if (occ.length) { t.waitReason = `閉塞:前方區間有 ${occ[0].no} 次`; return; }
    // 下一站月台(進待避線或正線)要空著
    const wantSide = t.siding === nk;
    const nkTrack = slw && nk !== slw.a && nk !== slw.b ? slw.track : t.track;
    const busy = this.atStation(nk, nkTrack, wantSide ? 'side' : 'main').filter((o) => o !== t);
    if (busy.length) { t.waitReason = `${this.st[nk].name}站${wantSide ? '待避線' : '月台'}有 ${busy[0].no} 次`; return; }
    t.release = false;
    t.state = 'run'; t.runTrack = tr; t.slot = null; t.nkTrack = nkTrack;
    t.inSlw = slw || null;
    if (t.siding === k) t.siding = null;
  }

  _log(text, kind = 'info') { this.log.push({ t: this.t, text, kind }); if (this.log.length > 80) this.log.shift(); }

  // ---------------------------------------------------------------- 結算
  summary() {
    const list = this.trains.map((t) => ({ no: t.no, type: t.type, dir: t.dir, done: t.state === 'done', delay: t.state === 'done' ? t.delay : this.delayOf(t) }));
    const ontime = list.filter((x) => x.delay <= 5).length / Math.max(1, list.length);
    return {
      list, ontime, conflicts: this.conflicts,
      major: list.filter((x) => x.delay > 10).length,
      resolved: this.incidents.filter((I) => I.state === 'done').length,
      incidents: this.incidents.length,
      avgDelay: list.reduce((a, x) => a + x.delay, 0) / Math.max(1, list.length),
      // 加權平均延誤:自強號(旅客多)權重 2
      wDelay: list.reduce((a, x) => a + x.delay * (x.type === 'exp' ? 2 : 1), 0) / Math.max(1, list.reduce((a, x) => a + (x.type === 'exp' ? 2 : 1), 0)),
    };
  }
}

/** 由路網資料建立調度路段(公里數依站間大圓距離累計) */
export function buildDispatchLine(net, cfg, haversine) {
  const byName = Object.fromEntries(net.stations.map((s) => [s.name, s]));
  let km = 0, prev = null;
  const stations = cfg.stations.map((name) => {
    const s = byName[name];
    if (prev) km += haversine(prev, s) / 1000;
    prev = s;
    return { name, sub: s.sub, km, siding: cfg.sidings.includes(name), express: cfg.express.includes(name) };
  });
  return { stations };
}
