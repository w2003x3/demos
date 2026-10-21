// 行控人員(調度員):坐在鈦鐵行車控制中心,看著巨大車次資訊牆調度西部幹線北段(臺北—新竹)的列車。
//   - 資訊牆:即時路線圖(南下/北上雙線、待避線、列車位置與延誤、封鎖區間、單線雙向區間、號誌故障站)+ 車次資訊表
//   - 控制面板(玩家):車次清單、選定列車的指令(扣車 / 放行 / 待避 / 無線電)、單線雙向運轉開關、模擬速度、事件紀錄
//   - 無線電:指令與司機員回覆皆為預錄語音(radio_*)
//   - 目標:加權平均延誤低於門檻,且不可發生險些相撞
import * as THREE from 'three';
import { loadNetwork, haversine } from '../core/network.js';
import { DispatchSim, buildDispatchLine } from './dispatchSim.js';
import { DISPATCH_LINE, DISPATCH_LEVELS } from '../config/dispatch.js';
import { buildOCC, WALL } from '../world/occ.js';
import { TRAIN_TYPES } from '../config/trains.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FONT = '"Noto Sans TC","Microsoft JhengHei",sans-serif';
const clock = (m) => { const t = 6 * 60 + Math.floor(m); return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

export class DispatchPhase {
  constructor(game, cfg) {
    this.g = game;
    this.cfg = cfg;
    this.L = DISPATCH_LEVELS.find((l) => l.id === cfg.level) || DISPATCH_LEVELS[0];
    this.ownHud = true;
    this.speed = 20;          // 1 秒 = 20 秒模擬時間
  }

  prepTitle() { return { title: `行控中心・${this.L.title}`, sub: '交班簡報', go: '就座' }; }
  prepItems() {
    return [
      { id: 'a', name: '待避', price: 0, desc: '讓區間車在有待避線的車站停到旁邊,後方自強號先通過', dishes: [] },
      { id: 'b', name: '扣車 / 放行', price: 0, desc: '讓列車在站等候或出發;號誌故障、單線區間都要人工放行', dishes: [] },
      { id: 'c', name: '單線雙向運轉', price: 0, desc: '一條軌道被堵住時,兩個有渡線的車站之間共用另一條軌道;同時只能放行一個方向', dishes: [] },
    ];
  }
  async prepThumbs() { return {}; }

  async init() {
    const g = this.g;
    this.assets = await g.loadAssets(TRAIN_TYPES.EMU3000);
    const net = await loadNetwork();
    this.line = buildDispatchLine(net, DISPATCH_LINE, haversine);
    this.sim = new DispatchSim(this.line, this.L);
    this.root = new THREE.Group();
    g.scene.add(this.root);
    this._env = { bg: g.scene.background, fog: g.scene.fog };
    g.scene.background = new THREE.Color('#0b0d11');
    g.scene.fog = null;
    this.occ = buildOCC({ assets: this.assets, quality: g.quality });
    this.root.add(this.occ.group);
    const s = this.occ.seat;
    // 鏡頭:玩家座位後上方(看得到前排調度台、調度員與整面資訊牆;下方 1/3 是控制面板)
    this.cam = { x: s.x, y: 4.8, z: 10.5, yaw: 0, pitch: 0 };
    this.sel = null;
    this._buildHud();
    this._bindLook();
    this._drawWall();
    this.wallTimer = 0;
  }

  begin() {
    this.g.ui.showHud(false);
    this.el.classList.remove('pre');
    this.g.voice.talk('radio_start');
    this._toast(`班表上線:${this.sim.trains.length} 個車次。目標:加權平均延誤 ≤ ${this.L.goal.wDelay} 分,不可險些相撞`);
  }

  // ================================================================ 主迴圈
  update(dt) {
    const g = this.g, inp = g.input;
    if (inp.wasPressed('Space')) this.paused = !this.paused;
    if (inp.wasPressed('Digit1')) this.speed = 10;
    if (inp.wasPressed('Digit2')) this.speed = 20;
    if (inp.wasPressed('Digit3')) this.speed = 40;
    if (!this.paused) {
      const simDt = dt * this.speed / 60;   // 分鐘
      const n = Math.max(1, Math.ceil(simDt / 0.05));
      for (let i = 0; i < n; i++) this.sim.step(simDt / n);
    }
    // 事件 → 無線電語音與提示
    for (const e of this.sim.events.splice(0)) this._onEvent(e);
    // 鏡頭
    const c = this.cam, cam = g.camera;
    cam.position.set(c.x, c.y, c.z);
    const target = new THREE.Vector3(c.x + Math.sin(c.yaw) * -10, c.y + Math.tan(c.pitch) * 10 + 1.8, c.z - Math.cos(c.yaw) * 10);
    // 預設看資訊牆中央
    const look = new THREE.Vector3(0, 2.0, WALL.z);
    const dir = look.sub(cam.position).normalize();
    const yawM = new THREE.Matrix4().makeRotationY(-c.yaw);
    dir.applyMatrix4(yawM); dir.y += c.pitch;
    cam.lookAt(cam.position.clone().add(dir));
    // 下方 36% 是控制面板:畫面中心上移到可見區的中央
    const W = innerWidth, Hh = innerHeight, vis = 1 - Math.min(0.5, this.el.querySelector('.occ-panel').offsetHeight / Hh);
    cam.setViewOffset(W, Hh * vis, 0, 0, W, Hh);
    cam.fov = 56; cam.updateProjectionMatrix();
    void target;
    this.wallTimer -= dt;
    if (this.wallTimer <= 0) { this.wallTimer = 0.25; this._drawWall(); this._renderPanel(); }
    if (this.sim.t >= this.sim.endTime || this.sim.trains.every((t) => t.state === 'done')) return this._finish();
    if (this._leave) return this._finish(true);
    return null;
  }

  _onEvent(e) {
    const v = this.g.voice;
    const say = (a, b) => { v.talk(b ? [`radio_${a}`, `radio_${b}`] : `radio_${a}`); };
    if (e.kind === 'hold') say('hold', 'hold_ack');
    if (e.kind === 'release') say('release', 'release_ack');
    if (e.kind === 'siding') say('siding', 'siding_ack');
    if (e.kind === 'slw-on') say('slw', 'slw_ack');
    if (e.kind === 'slw-off') say('slw_off');
    if (e.kind === 'incident') { say(e.sub); this.g.sfx.bad(); this._toast(this.sim.log.at(-1)?.text || '事故', true); }
    if (e.kind === 'resolved') { say('resolved'); this._toast(this.sim.log.at(-1)?.text || '狀況排除'); }
    if (e.kind === 'conflict') { say('conflict'); this.g.sfx.bad(); this._toast(this.sim.log.at(-1)?.text, true); this.flash = 1.2; }
  }

  _finish(quit = false) {
    if (this.done) return null;
    this.done = true;
    const S = this.sim.summary();
    const ok = !quit && S.conflicts === 0 && S.wDelay <= this.L.goal.wDelay;
    this.g.voice.talk(ok ? 'radio_good' : 'radio_bad');
    const ranked = this.g.career.rank.id === 'dispatcher';
    return {
      kind: 'dispatch', success: ok, level: this.L.title, quit,
      reason: quit ? '中途離席' : S.conflicts ? `發生 ${S.conflicts} 次險些相撞!` : !ok ? `加權平均延誤 ${S.wDelay.toFixed(1)} 分,超過目標 ${this.L.goal.wDelay} 分。` : null,
      ...S, goal: this.L.goal.wDelay,
      careerDelta: !ranked ? {} : { onTimeShifts: ok ? 1 : 0, resolvedIncidents: S.conflicts ? 0 : S.resolved, majorDelays: S.major, conflicts: S.conflicts },
    };
  }

  // ================================================================ 資訊牆(2048 × 512)
  _drawWall() {
    const cv = this.occ.wallCanvas, c = cv.getContext('2d'), sim = this.sim, st = sim.st;
    const W = cv.width, H = cv.height;
    c.fillStyle = '#05080d'; c.fillRect(0, 0, W, H);
    // 標題列
    c.fillStyle = '#0e1a2e'; c.fillRect(0, 0, W, 44);
    c.fillStyle = '#e8eef5'; c.font = `900 26px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(`鈦鐵 行車控制中心 ・ 西部幹線 臺北—新竹 ・ ${this.L.title}`, 16, 23);
    c.textAlign = 'right'; c.font = `700 30px Consolas, monospace`; c.fillStyle = '#7CFFB2';
    c.fillText(`${clock(sim.t)}  ×${this.speed}${this.paused ? ' ❚❚' : ''}`, 1500, 24);
    // 路線圖
    const X0 = 60, X1 = 1460, kmMax = st[st.length - 1].km;
    const px = (km) => X0 + (X1 - X0) * km / kmMax;
    const yS = 165, yN = 255, ySideS = 125, ySideN = 295;
    const segX = (k) => [px(st[k].km), px(st[k + 1].km)];
    // 單線雙向區間底色
    for (const s of sim.slw) { c.fillStyle = 'rgba(255,190,40,0.18)'; c.fillRect(px(st[s.a].km), yS - 30, px(st[s.b].km) - px(st[s.a].km), yN - yS + 60); c.fillStyle = '#ffbe28'; c.font = `700 16px ${FONT}`; c.textAlign = 'center'; c.fillText('單線雙向運轉', (px(st[s.a].km) + px(st[s.b].km)) / 2, yS - 38); }
    // 軌道
    for (const [y, tr] of [[yS, 'S'], [yN, 'N']]) {
      for (let k = 0; k < st.length - 1; k++) {
        const [a, b] = segX(k);
        const blocked = sim.isBlocked(tr, k);
        const occ = sim.inSeg(k, tr).length;
        c.strokeStyle = blocked ? '#ff3b3b' : occ ? '#ffd23a' : '#3a7bd5';
        c.lineWidth = blocked ? 7 : 5;
        c.setLineDash(blocked ? [10, 6] : []);
        c.beginPath(); c.moveTo(a, y); c.lineTo(b, y); c.stroke();
      }
      c.setLineDash([]);
      c.fillStyle = '#7f93ad'; c.font = `700 15px ${FONT}`; c.textAlign = 'left';
      c.fillText(tr === 'S' ? '南下線 ▶ 新竹' : '◀ 北上線 往臺北', X0, tr === 'S' ? yS - 16 : yN + 24);
    }
    // 車站與待避線
    st.forEach((s, k) => {
      const x = px(s.km);
      c.fillStyle = sim.signalFail[k] > sim.t ? (Math.floor(sim.t * 20) % 2 ? '#ff3b3b' : '#601010') : s.express ? '#e8eef5' : '#8fa3bd';
      c.fillRect(x - 3, yS - 12, 6, yN - yS + 24);
      if (s.siding) {
        c.strokeStyle = '#5b8fd8'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(x - 22, yS); c.lineTo(x - 12, ySideS); c.lineTo(x + 12, ySideS); c.lineTo(x + 22, yS); c.stroke();
        c.beginPath(); c.moveTo(x - 22, yN); c.lineTo(x - 12, ySideN); c.lineTo(x + 12, ySideN); c.lineTo(x + 22, yN); c.stroke();
        c.strokeStyle = 'rgba(160,190,230,.5)'; c.beginPath(); c.moveTo(x - 16, yS); c.lineTo(x + 16, yN); c.stroke();   // 渡線
      }
      c.save(); c.translate(x, yN + 40); c.rotate(-Math.PI / 4);
      c.fillStyle = s.express ? '#ffffff' : '#a9b8cc'; c.font = `${s.express ? 900 : 600} ${s.express ? 19 : 15}px ${FONT}`; c.textAlign = 'right';
      c.fillText(s.name, 0, 0);
      c.restore();
      if (sim.crowd[k] > sim.t) { c.fillStyle = '#ff9a1f'; c.font = `700 14px ${FONT}`; c.textAlign = 'center'; c.fillText('人潮', x, ySideS - 14); }
    });
    // 列車
    this.hit = [];
    for (const t of sim.trains) {
      if (t.state === 'done' || t.state === 'wait-start') continue;
      const x = px(t.x);
      const onTrack = t.state === 'run' ? t.runTrack : t.trackAt;
      let y = onTrack === 'S' ? yS : yN;
      if (t.state === 'dwell' && t.slot === 'side') y = onTrack === 'S' ? ySideS : ySideN;
      const d = sim.delayOf(t), sel = this.sel === t.no;
      const w = 54, h = 22;
      c.fillStyle = t.type === 'exp' ? '#ff8a1f' : '#2fa4ff';
      if (t.broken > sim.t) c.fillStyle = '#ff3b3b';
      c.fillRect(x - w / 2, y - h / 2, w, h);
      c.strokeStyle = sel ? '#ffffff' : d > 5 ? '#ff3b3b' : '#000'; c.lineWidth = sel ? 4 : 2; c.strokeRect(x - w / 2, y - h / 2, w, h);
      // 行進方向箭頭
      c.fillStyle = '#fff'; c.beginPath();
      const ax = x + t.dir * (w / 2 + 2);
      c.moveTo(ax, y - 7); c.lineTo(ax + t.dir * 9, y); c.lineTo(ax, y + 7); c.fill();
      c.fillStyle = '#05080d'; c.font = `900 15px Consolas, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(t.no, x, y + 1);
      const ly = onTrack === 'S' ? y - 26 : y + 27;
      c.font = `700 14px ${FONT}`; c.fillStyle = d > 5 ? '#ff6b5a' : d > 1 ? '#ffd23a' : '#7CFFB2';
      c.fillText(t.waitReason && t.state !== 'run' ? `${d >= 1 ? `+${Math.round(d)}′ ` : ''}${t.waitReason.slice(0, 8)}` : d >= 1 ? `+${Math.round(d)}′` : '準點', x, ly);
      this.hit.push({ no: t.no, x, y, w, h });
    }
    // 車次資訊表(右側)
    const TX = 1520;
    c.fillStyle = '#0e1a2e'; c.fillRect(TX, 50, W - TX - 10, 30);
    c.fillStyle = '#e8eef5'; c.font = `900 18px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle';
    const cols = [['車次', 0], ['種類', 70], ['往', 130], ['位置', 190], ['延誤', 330], ['狀態', 390]];
    cols.forEach(([t, dx]) => c.fillText(t, TX + 8 + dx, 65));
    const rows = sim.trains.filter((t) => t.state !== 'done').sort((a, b) => sim.delayOf(b) - sim.delayOf(a)).slice(0, 13);
    rows.forEach((t, i) => {
      const y = 98 + i * 30, d = sim.delayOf(t);
      c.fillStyle = this.sel === t.no ? '#1f4e9a' : i % 2 ? '#0a1220' : '#070d18'; c.fillRect(TX, y - 14, W - TX - 10, 30);
      c.font = `700 17px Consolas, monospace`; c.fillStyle = t.type === 'exp' ? '#ff9a3f' : '#5cc0ff';
      c.fillText(t.no, TX + 8, y);
      c.font = `600 16px ${FONT}`; c.fillStyle = '#d8e2ee';
      c.fillText(t.type === 'exp' ? '自強' : '區間', TX + 78, y);
      c.fillText(st[t.to].name, TX + 138, y);
      const where = t.state === 'wait-start' ? `${clock(t.at0)} 發` : t.state === 'run' ? `${st[t.k].name}→${st[t.k + t.dir].name}` : `${st[t.k].name}${t.slot === 'side' ? '(待避)' : ''}`;
      c.fillText(where.slice(0, 9), TX + 198, y);
      c.fillStyle = d > 5 ? '#ff6b5a' : d >= 1 ? '#ffd23a' : '#7CFFB2';
      c.fillText(d >= 1 ? `+${Math.round(d)}` : '0', TX + 338, y);
      c.fillStyle = t.broken > sim.t ? '#ff6b5a' : '#9fb3c8';
      c.fillText((t.broken > sim.t ? '故障' : t.hold ? '扣車' : t.waitReason || (t.state === 'run' ? '運行' : t.state === 'wait-start' ? '待發' : '停站')).slice(0, 8), TX + 398, y);
    });
    // 下方:事件跑馬
    c.fillStyle = '#0a1018'; c.fillRect(0, H - 92, 1500, 92);
    sim.log.slice(-3).forEach((l, i) => {
      c.fillStyle = l.kind === 'alert' ? '#ff6b5a' : l.kind === 'ok' ? '#7CFFB2' : l.kind === 'cmd' ? '#9ec6ff' : '#d8e2ee';
      c.font = `700 19px ${FONT}`; c.textAlign = 'left';
      c.fillText(`${clock(l.t)}  ${l.text}`, 16, H - 72 + i * 28);
    });
    if (this.flash > 0) { this.flash -= 0.25; c.fillStyle = 'rgba(255,40,40,0.25)'; c.fillRect(0, 0, W, H); }
    this.occ.wallTex.needsUpdate = true;
  }

  // ================================================================ 控制面板(HTML)
  _buildHud() {
    const el = this.el = document.createElement('div');
    el.className = 'k-hud pre occ-hud';
    el.innerHTML = `
      <div class="occ-top"><b>鈦鐵 行車控制中心</b><span data-o="clock"></span><span data-o="goal"></span>
        <div class="occ-speed"><button data-sp="0">❚❚</button><button data-sp="10">×10</button><button data-sp="20">×20</button><button data-sp="40">×40</button></div>
        <button class="occ-leave" data-leave>離席</button></div>
      <div class="occ-panel">
        <div class="occ-col occ-list"><div class="occ-h">車次</div><div data-o="list"></div></div>
        <div class="occ-col occ-sel"><div class="occ-h">選定列車</div><div data-o="sel"></div>
          <div class="occ-btns"><button data-cmd="hold">⛔ 扣車</button><button data-cmd="release">✅ 放行</button><button data-cmd="siding">↪ 待避</button></div></div>
        <div class="occ-col occ-slw"><div class="occ-h">單線雙向運轉(渡線車站之間)</div><div data-o="slw"></div></div>
        <div class="occ-col occ-log"><div class="occ-h">事件紀錄 / 無線電</div><div data-o="log"></div></div>
      </div>
      <div class="occ-toast" data-o="toast" hidden></div>`;
    this.g.ui.root.appendChild(el);
    this.$ = (k) => el.querySelector(`[data-o="${k}"]`);
    el.addEventListener('click', (e) => {
      const tr = e.target.closest('[data-train]'); if (tr) { this.sel = tr.dataset.train; this._renderPanel(); this._drawWall(); }
      const sp = e.target.closest('[data-sp]'); if (sp) { const v = +sp.dataset.sp; if (v) { this.speed = v; this.paused = false; } else this.paused = !this.paused; }
      const cmd = e.target.closest('[data-cmd]');
      if (cmd && this.sel) {
        const ok = { hold: () => this.sim.cmdHold(this.sel), release: () => this.sim.cmdRelease(this.sel), siding: () => this.sim.cmdSiding(this.sel) }[cmd.dataset.cmd]();
        if (!ok) this._toast(this.sim.log.at(-1)?.text || '無法執行', true);
        this._renderPanel();
      } else if (cmd) this._toast('先在左側清單或資訊牆上點選一個車次', true);
      const sl = e.target.closest('[data-slw]');
      if (sl) { const [a, b, tr] = sl.dataset.slw.split('|'); this.sim.cmdSLW(+a, +b, tr); this._renderPanel(); }
      if (e.target.closest('[data-leave]')) this._leave = true;
    });
    // 點資訊牆上的列車
    this._click = (e) => {
      if (e.target !== this.g.renderer.domElement || this._dragged) return;
      const r = this.g.renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.g.camera);
      const hit = ray.intersectObject(this.occ.wall)[0];
      if (!hit) return;
      const u = hit.uv.x * WALL.cw, v = (1 - hit.uv.y) * WALL.ch;
      const t = this.hit?.find((h) => Math.abs(h.x - u) < h.w / 2 + 6 && Math.abs(h.y - v) < h.h / 2 + 8);
      if (t) { this.sel = t.no; this._renderPanel(); this._drawWall(); }
    };
    addEventListener('click', this._click);
  }

  _renderPanel() {
    const sim = this.sim, st = sim.st;
    this.$('clock').textContent = `${clock(sim.t)} ・ 速度 ×${this.speed}${this.paused ? '(暫停)' : ''}`;
    const S = sim.summary();
    this.$('goal').innerHTML = `加權平均延誤 <b class="${S.wDelay > this.L.goal.wDelay ? 'bad' : 'ok'}">${S.wDelay.toFixed(1)}</b> / ${this.L.goal.wDelay} 分 ・ 險些相撞 <b class="${S.conflicts ? 'bad' : 'ok'}">${S.conflicts}</b>`;
    const list = sim.trains.filter((t) => t.state !== 'done');
    const html = list.map((t) => {
      const d = sim.delayOf(t);
      return `<button class="occ-tr ${this.sel === t.no ? 'sel' : ''} ${t.type}" data-train="${t.no}"><b>${t.no}</b><span>${t.type === 'exp' ? '自強' : '區間'} 往${st[t.to].name}</span><em class="${d > 5 ? 'bad' : d >= 1 ? 'warn' : 'ok'}">${d >= 1 ? `+${Math.round(d)}` : '準'}</em>${t.waitReason && t.state === 'dwell' ? '<i>!</i>' : ''}</button>`;
    }).join('') || '<p class="muted-txt">全部列車已到站</p>';
    if (this._listHtml !== html) { this.$('list').innerHTML = html; this._listHtml = html; }
    const t = this.sel && sim.trainBy(this.sel);
    const selHtml = !t ? '<p class="muted-txt">點選左側車次或資訊牆上的列車</p>' : t.state === 'done' ? `<p><b>${t.no} 次</b> 已到站(延誤 ${Math.round(t.delay)} 分)</p>` :
      `<p class="occ-big"><b>${t.no}</b> ${t.type === 'exp' ? '自強號' : '區間車'} ${t.dir > 0 ? '南下' : '北上'} 往${st[t.to].name}</p>
       <p>位置:${t.state === 'wait-start' ? `${st[t.from].name}(${clock(t.at0)} 發車)` : t.state === 'run' ? `${st[t.k].name} → ${st[t.k + t.dir].name}` : `${st[t.k].name}站${t.slot === 'side' ? '待避線' : ''}`}</p>
       <p>延誤:<b>${Math.round(sim.delayOf(t))}</b> 分 ・ ${t.broken > sim.t ? '<span class="bad">故障停車中</span>' : esc(t.hold ? '扣車中' : t.waitReason || (t.state === 'run' ? '運行中' : '停站'))}</p>
       ${t.siding != null ? `<p>已指示:${st[t.siding].name}站待避</p>` : ''}`;
    if (this._selHtml !== selHtml) { this.$('sel').innerHTML = selHtml; this._selHtml = selHtml; }
    // 單線雙向:相鄰渡線車站的區間;建議與事故相關的區段標示
    const sid = st.map((s, k) => (s.siding ? k : -1)).filter((k) => k >= 0);
    const hot = new Set();
    for (const b of sim.blocked) for (let i = 0; i < sid.length - 1; i++) if (sid[i] <= b.a && sid[i + 1] >= b.b) hot.add(`${sid[i]}|${sid[i + 1]}|${b.track === 'S' ? 'N' : 'S'}`);
    for (const tr of sim.trains) if (tr.broken > sim.t && tr.state === 'run') { const seg = sim.segOf(tr); for (let i = 0; i < sid.length - 1; i++) if (sid[i] <= seg && sid[i + 1] > seg) hot.add(`${sid[i]}|${sid[i + 1]}|${tr.runTrack === 'S' ? 'N' : 'S'}`); }
    const slwHtml = [...hot, ...sim.slw.map((s) => `${s.a}|${s.b}|${s.track}`)].filter((v, i, a) => a.indexOf(v) === i).map((k) => {
      const [a, b, tr] = k.split('|'), on = sim.slw.some((s) => s.a === +a && s.b === +b);
      return `<button class="occ-slwb ${on ? 'on' : ''}" data-slw="${k}">${on ? '■ 解除' : '▶ 啟用'} ${st[+a].name}—${st[+b].name}<small>共用${tr === 'S' ? '南下' : '北上'}線</small></button>`;
    }).join('') || '<p class="muted-txt">目前沒有封鎖區間。發生列車故障或路線異物時,這裡會出現可啟用的區段。</p>';
    if (this._slwHtml !== slwHtml) { this.$('slw').innerHTML = slwHtml; this._slwHtml = slwHtml; }
    const logHtml = sim.log.slice(-9).reverse().map((l) => `<p class="${l.kind}">${clock(l.t)} ${esc(l.text)}</p>`).join('');
    if (this._logHtml !== logHtml) { this.$('log').innerHTML = logHtml; this._logHtml = logHtml; }
  }

  _toast(text, bad = false) {
    const t = this.$('toast');
    t.textContent = text; t.classList.toggle('bad', bad); t.hidden = false;
    clearTimeout(this._tt); this._tt = setTimeout(() => { t.hidden = true; }, 4200);
  }

  _bindLook() {
    const el = this.g.renderer.domElement;
    let drag = null;
    this._dn = (e) => { drag = { x: e.clientX, y: e.clientY, yaw: this.cam.yaw, pitch: this.cam.pitch }; this._dragged = false; };
    this._mv = (e) => {
      if (!drag) return;
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) this._dragged = true;
      this.cam.yaw = Math.max(-1.2, Math.min(1.2, drag.yaw + (e.clientX - drag.x) * 0.004));
      this.cam.pitch = Math.max(-0.6, Math.min(0.5, drag.pitch - (e.clientY - drag.y) * 0.003));
    };
    this._up = () => { drag = null; };
    el.addEventListener('pointerdown', this._dn);
    addEventListener('pointermove', this._mv);
    addEventListener('pointerup', this._up);
  }

  dispose() {
    const g = this.g;
    g.scene.remove(this.root);
    g.scene.background = this._env.bg; g.scene.fog = this._env.fog;
    g.camera.clearViewOffset(); g.camera.fov = 62; g.camera.updateProjectionMatrix();
    this.el?.remove();
    removeEventListener('click', this._click);
    removeEventListener('pointermove', this._mv); removeEventListener('pointerup', this._up);
    g.renderer.domElement.removeEventListener('pointerdown', this._dn);
  }
}
