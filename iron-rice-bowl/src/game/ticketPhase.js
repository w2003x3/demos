// 站務員:坐在臺北車站鈦鐵售票窗口,依旅客需求售票。
//   流程:旅客說出需求(預錄語音 + 對話框)→ 售票終端選「目的地 → 車次 → 票種張數 → 座位」→ 系統算出票價 → 旅客付現 → 輸入找零 → 出票
//   錯誤:目的地/張數/票種錯 → 劃錯(記點)+ 客訴;座位不合偏好(靠窗/靠走道/坐一起)→ 劃錯 + 客訴;
//         多找錢 → 帳款短少;少找錢 → 客訴;排太久 → 客訴離開。其他窗口同時在劃位,座位隨時會被搶走。
import * as THREE from 'three';
import { loadNetwork, findLine, lineStations, haversine } from '../core/network.js';
import { TICKET_LEVELS, TICKET_DESTS, EAST, FARE_RATE, TYPE_NAME } from '../config/ticket.js';
import { TRAIN_TYPES } from '../config/trains.js';
import { pickPerson } from '../core/assets.js';
import { buildBooth } from '../world/ticketBooth.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CARS = 6, ROWS = 13, COLS = ['A', 'B', 'C', 'D'];   // A、D 靠窗;B、C 靠走道
const hm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

export class TicketPhase {
  constructor(game, cfg) {
    this.g = game;
    this.cfg = cfg;
    this.L = TICKET_LEVELS.find((l) => l.id === cfg.level) || TICKET_LEVELS[0];
    this.ownHud = true;
  }

  prepTitle() { return { title: `售票窗口・${this.L.title}`, sub: '開窗前準備', go: '開窗售票' }; }
  prepItems() {
    return [
      { id: 'a', name: '票價', price: 0, desc: '自強 2.27、莒光 1.75、區間 1.46 元/公里(由終端機自動計算);半票、敬老票為全票的一半', dishes: [] },
      { id: 'b', name: '座位', price: 0, desc: 'A、D 靠窗,B、C 靠走道;「坐一起」= 同一排相鄰(A-B 或 C-D)', dishes: [] },
      { id: 'c', name: '找零', price: 0, desc: '多找 → 帳款短少;少找 → 旅客客訴', dishes: [] },
    ];
  }
  async prepThumbs() { return {}; }

  async init() {
    const g = this.g, L = this.L;
    this.R = mulberry(Date.now() % 100000);
    this.assets = await g.loadAssets(TRAIN_TYPES.EMU3000);
    const net = await loadNetwork();
    this.dist = destDistances(net);
    this.root = new THREE.Group(); g.scene.add(this.root);
    this._env = { bg: g.scene.background, fog: g.scene.fog };
    g.scene.background = new THREE.Color('#d8d2c4'); g.scene.fog = null;
    this.root.add(buildBooth());
    // 時刻表與座位
    const [h0, m0] = L.startClock.split(':').map(Number);
    this.clock0 = h0 * 60 + m0;
    this.trains = makeTrains(this.clock0, this.R, L);
    // 旅客
    this.customers = Array.from({ length: L.customers }, (_, i) => this._makeCustomer(i));
    this.queue = []; this.served = []; this.left = L.time; this.time = 0;
    this.stats = { sold: 0, seatErrors: 0, cashShort: 0, cashOver: 0, complaints: 0, log: [], servedN: 0, leftN: 0 };
    this.cur = null;
    this.sel = this._blankSel();
    this._spawnQueue();
    this._buildHud();
    // 下方 47% 是售票終端:畫面中心上移到可見區
    g.camera.position.set(0, 1.45, 1.1);
    g.camera.lookAt(0, 1.25, -6);
    g.camera.setViewOffset(innerWidth, innerHeight * 0.53, 0, 0, innerWidth, innerHeight);
    g.camera.fov = 50; g.camera.updateProjectionMatrix();
  }

  begin() {
    this.g.ui.showHud(false);
    this.el.classList.remove('pre');
    this._next();
  }

  _blankSel() { return { dest: null, train: null, car: 1, n: { full: 0, half: 0, senior: 0 }, seats: [], change: '' }; }

  _makeCustomer(i) {
    const R = this.R, L = this.L;
    const east = L.east && R() < L.east;
    const pool = east ? EAST : TICKET_DESTS.filter((d) => !EAST.includes(d));
    const dest = pool[Math.floor(R() * pool.length)];
    const fam = R() < (L.east ? 0.5 : 0.25);
    const n = { full: 1 + (R() < 0.35 ? 1 : 0) + (fam && R() < 0.4 ? 1 : 0), half: fam ? 1 + (R() < 0.4 ? 1 : 0) : 0, senior: R() < (fam ? 0.35 : 0.12) ? 1 : 0 };
    const total = n.full + n.half + n.senior;
    const pref = {};
    if (R() < L.pref) pref.type = R() < 0.7 ? 'exp' : 'loc';
    if (pref.type === 'loc' && !['板橋', '桃園', '中壢', '新竹', '宜蘭'].includes(dest)) pref.type = 'exp';
    if (R() < L.pref * 0.6) pref.after = this.clock0 + 15 + Math.floor(R() * 4) * 15;
    if (R() < L.pref) pref.seat = total >= 2 && R() < 0.55 ? 'together' : R() < 0.6 ? 'window' : 'aisle';
    const voice = ['m', 'f', 'f2'][i % 3];
    return { id: i, dest, n, total, pref, voice, patience: L.patience, wait: 0, state: 'queue' };
  }

  _spawnQueue() {
    const ppl = this.assets.people;
    this.figs = [];
    this.customers.forEach((c, i) => {
      if (!ppl) return;
      const p = ppl[pickPerson(ppl, this.R)];
      const f = p.stand.clone(true);
      f.rotation.y = Math.PI;   // 面向窗口(+z)
      const g = new THREE.Group(); g.add(f);
      this.root.add(g);
      c.fig = g;
      this._place(c, i);
    });
  }

  /** 排隊位置:第 k 位(0 = 站在窗口前) */
  _place(c, k, smooth = false) {
    const z = k === 0 ? -0.75 : -1.9 - (k - 1) * 0.95, x = k === 0 ? 0 : (k % 2 ? 0.12 : -0.12);
    c.target = new THREE.Vector3(x, 0, z);
    if (!smooth && c.fig) c.fig.position.copy(c.target);
    if (c.fig) c.fig.visible = k < this.L.rush + 1;
  }

  _next() {
    const waiting = this.customers.filter((c) => c.state === 'queue');
    waiting.forEach((c, k) => this._place(c, k, true));
    this.cur = waiting[0] || null;
    this.sel = this._blankSel();
    if (!this.cur) return;
    this.cur.state = 'window';
    this.cur.wait = 0;
    const c = this.cur, v = c.voice;
    const lines = [`tk_greet_${v}`, `tk_dest_${TICKET_DESTS.indexOf(c.dest)}_${v}`];
    if (c.pref.type) lines.push(`tk_${c.pref.type}_${v}`);
    if (c.pref.seat) lines.push(`tk_${c.pref.seat}_${v}`);
    setTimeout(() => this.g.voice.talk(lines, c.fig?.children[0]), 350);
    this._render();
  }

  // ================================================================ 主迴圈
  update(dt) {
    if (this._leave) return this._finish(true);
    this.time += dt; this.left -= dt;
    // 旅客走位
    for (const c of this.customers) if (c.fig && c.target) {
      c.fig.position.lerp(c.target, Math.min(1, dt * 3));
      if (c.state === 'gone' && c.fig.position.distanceTo(c.target) < 0.3) c.fig.visible = false;
    }
    // 耐心
    for (const c of this.customers) {
      if (c.state !== 'queue' && c.state !== 'window') continue;
      c.wait += dt;
      if (c.wait > c.patience * (c.state === 'window' ? 1.4 : 2.2)) {
        c.state = 'gone'; this.stats.leftN++; this.stats.complaints++;
        this.stats.log.push(`旅客等太久離開(到${c.dest})`);
        this.g.voice.talk(`tk_angry_wait_${c.voice}`, c.fig?.children[0]);
        this._leaveFig(c);
        if (c === this.cur) this._next();
      }
    }
    // 其他窗口同時劃位:座位被搶
    this.otherT = (this.otherT || 0) - dt;
    if (this.otherT <= 0) {
      this.otherT = this.L.id === 't3' ? 0.7 : 2.2;
      const t = this.trains[Math.floor(this.R() * this.trains.length)];
      const k = Math.floor(this.R() * t.seats.length);
      if (!t.seats[k]) {
        t.seats[k] = 2;   // 2 = 剛被其他窗口售出
        const mine = this.sel.train === t && this.sel.seats.includes(k);
        if (mine) { this.sel.seats = this.sel.seats.filter((x) => x !== k); this._toast('您選的座位剛被其他窗口售出,請重新選位!', true); this.g.voice.talk('tk_sold_clerk'); }
        if (this.sel.train === t) this._renderSeats();
      }
    }
    if (this.cur) {
      const p = 1 - this.cur.wait / (this.cur.patience * 1.4);
      this.$('pat').style.width = `${Math.max(0, p * 100).toFixed(0)}%`;
      this.$('pat').className = p < 0.3 ? 'bad' : p < 0.6 ? 'warn' : '';
    }
    this.$('time').textContent = `${hm(this.clock0 + this.time / 60 * 6)} ・ 剩 ${Math.max(0, Math.ceil(this.left))} 秒`;
    this.g.ui.updateBubbles(this.g.camera);
    if (this.left <= 0 || !this.customers.some((c) => c.state === 'queue' || c.state === 'window')) return this._finish();
    return null;
  }

  _leaveFig(c) { c.target = new THREE.Vector3(c.fig?.position.x > 0 ? 4 : -4, 0, -3); }

  // ================================================================ 出票
  _issue() {
    const c = this.cur, s = this.sel, st = this.stats;
    if (!c) return;
    const tickets = s.n.full + s.n.half + s.n.senior;
    if (!s.dest || !s.train || !tickets) { this._toast('請先選目的地、車次與票種張數', true); return; }
    if (s.seats.length !== tickets) { this._toast(`座位要選 ${tickets} 個(目前 ${s.seats.length})`, true); return; }
    const fare = this._fare();
    const paid = c.paid;
    if (paid == null) { this._toast('請先按「收款」,等旅客付錢', true); return; }
    const change = Number(s.change || 0);
    // 檢查需求
    const errs = [];
    if (s.dest !== c.dest) errs.push(['dest', `目的地錯了(旅客要到${c.dest})`]);
    if (s.n.full !== c.n.full || s.n.half !== c.n.half || s.n.senior !== c.n.senior) errs.push(['count', '票種或張數不對']);
    if (c.pref.type && s.train.type !== c.pref.type) errs.push(['type', `旅客要搭${TYPE_NAME[c.pref.type]}號`]);
    if (c.pref.after && s.train.time < c.pref.after) errs.push(['time', `旅客要 ${hm(c.pref.after)} 以後的車`]);
    const seatOk = checkSeats(s.seats, c.pref.seat);
    if (!seatOk) errs.push(['seat', { window: '旅客要靠窗', aisle: '旅客要靠走道', together: '旅客要坐在一起' }[c.pref.seat]]);
    // 售出座位
    s.seats.forEach((k) => { s.train.seats[k] = 1; });
    st.sold += tickets;
    const v = c.voice, anchor = c.fig?.children[0];
    if (errs.length) {
      st.seatErrors++; st.complaints++;
      st.log.push(`${c.dest} ${tickets} 張:${errs.map((e) => e[1]).join('、')}`);
      const e0 = errs[0][0];
      this.g.voice.talk(e0 === 'dest' ? `tk_wrong_dest_${v}` : e0 === 'seat' ? `tk_angry_seat_${v}` : `tk_wrong_${v}`, anchor);
      this._toast(`劃錯:${errs.map((e) => e[1]).join('、')}`, true);
      this.g.sfx.bad();
    }
    const right = paid - fare;
    if (change > right) { st.cashShort += change - right; st.log.push(`多找 ${change - right} 元(帳款短少)`); this._toast(`多找了 ${change - right} 元,帳款短少!`, true); }
    else if (change < right) { st.cashOver += right - change; st.complaints++; st.log.push(`少找 ${right - change} 元(客訴)`); this.g.voice.talk(`tk_angry_change_${v}`, anchor); this._toast(`少找了 ${right - change} 元,旅客客訴!`, true); }
    if (!errs.length && change === right) { this.g.voice.talk(['tk_done_clerk', `tk_thanks_${v}`], anchor); this.g.sfx.cash(); }
    c.state = 'gone'; st.servedN++;
    this._leaveFig(c);
    this._next();
  }

  _fare() {
    const s = this.sel;
    if (!s.dest || !s.train) return 0;
    const full = Math.round(this.dist[s.dest] * FARE_RATE[s.train.type]);
    const half = Math.round(full / 2);
    return s.n.full * full + (s.n.half + s.n.senior) * half;
  }

  _finish(quit = false) {
    if (this.done) return null;
    this.done = true;
    const st = this.stats, L = this.L;
    const ok = !quit && st.servedN >= Math.ceil(L.customers * 0.75) && st.complaints <= L.maxComplaints;
    const ranked = this.g.career.rank.id === 'ticket';
    return {
      kind: 'ticket', success: ok, level: L.title, quit, ...st, customers: L.customers, maxComplaints: L.maxComplaints,
      reason: quit ? '中途離開窗口' : !ok ? (st.complaints > L.maxComplaints ? `客訴 ${st.complaints} 件,超過上限 ${L.maxComplaints} 件。` : `只服務了 ${st.servedN} / ${L.customers} 位旅客。`) : null,
      careerDelta: !ranked ? {} : { ticketsSold: st.sold, successes: ok ? 1 : 0, balanced: !st.cashShort && !st.cashOver ? 1 : 0, seatErrors: st.seatErrors, cashShort: st.cashShort, complaints: st.complaints },
    };
  }

  // ================================================================ 售票終端(HTML)
  _buildHud() {
    const el = this.el = document.createElement('div');
    el.className = 'k-hud pre tk-hud';
    el.innerHTML = `
      <div class="tk-top"><b>鈦鐵 臺北車站 售票窗口</b><span data-t="time"></span><span data-t="stat"></span><button data-t-act="leave">關窗離開</button></div>
      <div class="tk-req"><div class="tk-h">旅客需求</div><div data-t="req"></div><div class="tk-pat"><i data-t="pat"></i></div><div class="tk-q" data-t="q"></div></div>
      <div class="tk-term">
        <div class="tk-col"><div class="tk-h">① 目的地</div><div class="tk-dests">${TICKET_DESTS.map((d) => `<button data-dest="${d}">${d}<small>${Math.round(this.dist[d])} km</small></button>`).join('')}</div>
          <div class="tk-h">③ 票種張數</div>
          ${[['full', '全票'], ['half', '半票(孩童)'], ['senior', '敬老 / 愛心']].map(([k, n]) => `<div class="tk-step"><span>${n}</span><button data-n="${k}|-1">−</button><b data-nv="${k}">0</b><button data-n="${k}|1">+</button></div>`).join('')}
        </div>
        <div class="tk-col"><div class="tk-h">② 車次(臺北發車)</div><div data-t="trains" class="tk-trains"></div></div>
        <div class="tk-col tk-seatcol"><div class="tk-h">④ 座位 <span class="tk-cars" data-t="cars"></span></div><div data-t="seats" class="tk-seats"></div>
          <div class="tk-legend"><i class="w"></i>靠窗 A/D <i class="a"></i>靠走道 B/C <i class="x"></i>已售 <i class="s"></i>已選</div></div>
        <div class="tk-col tk-pay"><div class="tk-h">⑤ 收款找零</div><div data-t="sum"></div>
          <button class="tk-big" data-t-act="collect">收款</button>
          <div class="tk-change">找零 <b data-t="change">0</b> 元</div>
          <div class="tk-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⌫'].map((k) => `<button data-key-n="${k}">${k}</button>`).join('')}</div>
          <button class="tk-big go" data-t-act="issue">🎫 出票</button></div>
      </div>
      <div class="tk-toast" data-t="toast" hidden></div>`;
    this.g.ui.root.appendChild(el);
    this.$ = (k) => el.querySelector(`[data-t="${k}"]`);
    el.addEventListener('click', (e) => {
      const s = this.sel, t = e.target;
      const d = t.closest('[data-dest]'); if (d) { s.dest = d.dataset.dest; s.train = null; s.seats = []; this._render(); }
      const tr = t.closest('[data-train]'); if (tr) { s.train = this.trains[+tr.dataset.train]; s.seats = []; s.car = 1; this._render(); }
      const n = t.closest('[data-n]'); if (n) { const [k, dv] = n.dataset.n.split('|'); s.n[k] = Math.max(0, Math.min(6, s.n[k] + +dv)); this._render(); }
      const car = t.closest('[data-car]'); if (car) { s.car = +car.dataset.car; this._renderSeats(); }
      const seat = t.closest('[data-seat]');
      if (seat && s.train) {
        const k = +seat.dataset.seat;
        if (s.train.seats[k]) { this._toast('這個座位已經售出', true); return; }
        if (s.seats.includes(k)) s.seats = s.seats.filter((x) => x !== k);
        else if (s.seats.length < s.n.full + s.n.half + s.n.senior) s.seats.push(k);
        else this._toast('已選滿張數,請先取消一個座位或增加張數', true);
        this._render();
      }
      const key = t.closest('[data-key-n]');
      if (key) { const v = key.dataset.keyN; s.change = v === 'C' ? '' : v === '⌫' ? s.change.slice(0, -1) : (s.change + v).replace(/^0+(?=\d)/, '').slice(0, 5); this.$('change').textContent = s.change || '0'; }
      const a = t.closest('[data-t-act]');
      if (a) {
        if (a.dataset.tAct === 'leave') this._leave = true;
        if (a.dataset.tAct === 'issue') this._issue();
        if (a.dataset.tAct === 'collect') this._collect();
      }
    });
    this._render();
  }

  /** 收款:旅客依票價付整數鈔票 */
  _collect() {
    const c = this.cur; if (!c) return;
    const fare = this._fare();
    if (!fare) { this._toast('先選好目的地、車次與張數,終端機才會算出票價', true); return; }
    c.paid = payWith(fare, this.R);
    this.g.voice.talk(`tk_pay_${c.voice}`, c.fig?.children[0]);
    this._render();
  }

  _render() {
    const c = this.cur, s = this.sel, st = this.stats;
    this.$('stat').textContent = `已服務 ${st.servedN} / ${this.L.customers} ・ 售出 ${st.sold} 張 ・ 客訴 ${st.complaints} / ${this.L.maxComplaints}`;
    if (c) {
      const parts = [`到 <b>${c.dest}</b>`];
      const nn = [c.n.full && `全票 ${c.n.full} 張`, c.n.half && `半票 ${c.n.half} 張`, c.n.senior && `敬老票 ${c.n.senior} 張`].filter(Boolean).join('、');
      parts.push(nn);
      if (c.pref.type) parts.push(`要搭<b>${TYPE_NAME[c.pref.type]}號</b>`);
      if (c.pref.after) parts.push(`<b>${hm(c.pref.after)} 以後</b>的車`);
      if (c.pref.seat) parts.push({ window: '<b>靠窗</b>', aisle: '<b>靠走道</b>', together: '<b>坐在一起</b>' }[c.pref.seat]);
      this.$('req').innerHTML = `<p class="tk-say">「${parts.join(',')}」</p>${c.paid != null ? `<p>旅客付了 <b class="cash">${c.paid}</b> 元</p>` : ''}`;
    } else this.$('req').innerHTML = '<p>目前沒有旅客</p>';
    this.$('q').textContent = `排隊 ${this.customers.filter((x) => x.state === 'queue').length} 人`;
    this.el.querySelectorAll('[data-dest]').forEach((b) => b.classList.toggle('on', b.dataset.dest === s.dest));
    for (const k of ['full', 'half', 'senior']) this.el.querySelector(`[data-nv="${k}"]`).textContent = s.n[k];
    const reach = s.dest ? this.trains.filter((t) => t.dests.includes(s.dest)) : [];
    this.$('trains').innerHTML = s.dest ? reach.map((t) => {
      const free = t.seats.filter((x) => !x).length, i = this.trains.indexOf(t);
      return `<button data-train="${i}" class="${s.train === t ? 'on' : ''} ${t.type}"><b>${hm(t.time)}</b><span>${TYPE_NAME[t.type]} ${t.no}</span><em>${free ? `剩 ${free} 位` : '客滿'}</em></button>`;
    }).join('') : '<p class="muted-txt">先選目的地</p>';
    this._renderSeats();
    const fare = this._fare();
    this.$('sum').innerHTML = fare ? `<p>票價 <b class="cash">${fare}</b> 元</p><p class="tk-sub">${s.train ? `${TYPE_NAME[s.train.type]} ${Math.round(this.dist[s.dest])} km × ${FARE_RATE[s.train.type]}` : ''}</p>${c?.paid != null ? `<p>應找 <b>?</b>(請自行計算)</p>` : ''}` : '<p class="muted-txt">—</p>';
    this.$('change').textContent = s.change || '0';
  }

  _renderSeats() {
    const s = this.sel;
    this.$('cars').innerHTML = s.train ? Array.from({ length: CARS }, (_, i) => `<button data-car="${i + 1}" class="${s.car === i + 1 ? 'on' : ''}">${i + 1} 車</button>`).join('') : '';
    if (!s.train) { this.$('seats').innerHTML = '<p class="muted-txt">先選車次</p>'; return; }
    let h = '';
    for (let r = 0; r < ROWS; r++) {
      h += `<div class="tk-row"><small>${r + 1}</small>`;
      COLS.forEach((col, ci) => {
        const k = seatIndex(s.car - 1, r, ci), sold = s.train.seats[k], me = s.seats.includes(k);
        h += `${ci === 2 ? '<span class="tk-aisle"></span>' : ''}<button data-seat="${k}" class="${sold ? 'x' : me ? 's' : ci === 0 || ci === 3 ? 'w' : 'a'}">${col}</button>`;
      });
      h += '</div>';
    }
    this.$('seats').innerHTML = h;
  }

  _toast(text, bad = false) {
    const t = this.$('toast'); t.textContent = text; t.classList.toggle('bad', bad); t.hidden = false;
    clearTimeout(this._tt); this._tt = setTimeout(() => { t.hidden = true; }, 3500);
  }

  dispose() {
    const g = this.g;
    g.scene.remove(this.root);
    g.scene.background = this._env.bg; g.scene.fog = this._env.fog;
    g.camera.clearViewOffset(); g.camera.fov = 62; g.camera.updateProjectionMatrix();
    g.ui.clearBubbles?.();
    this.el?.remove();
  }
}

// ---------------------------------------------------------------- 輔助
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const seatIndex = (car, row, col) => (car * ROWS + row) * 4 + col;
const seatPos = (k) => ({ car: Math.floor(k / (ROWS * 4)), row: Math.floor((k % (ROWS * 4)) / 4), col: k % 4 });

/** 座位是否符合偏好 */
function checkSeats(seats, pref) {
  if (!pref) return true;
  const P = seats.map(seatPos);
  if (pref === 'window') return P.every((p) => p.col === 0 || p.col === 3);
  if (pref === 'aisle') return P.every((p) => p.col === 1 || p.col === 2);
  if (pref === 'together') {
    // 兩兩成對:同車同排相鄰(A-B 或 C-D);人數為奇數時,多出的一位要在同一車、前後一排內
    const key = (p) => `${p.car}|${p.row}|${p.col < 2 ? 'L' : 'R'}`;
    const groups = new Map();
    P.forEach((p) => groups.set(key(p), (groups.get(key(p)) || 0) + 1));
    const cars = new Set(P.map((p) => p.car)), rows = P.map((p) => p.row);
    return cars.size === 1 && Math.max(...rows) - Math.min(...rows) <= Math.ceil(P.length / 2) && [...groups.values()].filter((v) => v === 2).length >= Math.floor(P.length / 2);
  }
  return true;
}

/** 旅客付款:湊整數鈔票(100 / 500 / 1000) */
function payWith(fare, R) {
  const c = [...new Set([Math.ceil(fare / 100) * 100, Math.ceil(fare / 500) * 500, Math.ceil(fare / 1000) * 1000, Math.ceil(fare / 1000) * 1000 + 1000])];
  return c[Math.floor(R() * c.length)];
}

/** 從臺北到各目的地的里程(西部幹線;宜蘭、花蓮 = 臺北→八堵 + 東部幹線) */
function destDistances(net) {
  const along = (line, from, to) => {
    const st = lineStations(net, line);
    const i = st.findIndex((s) => s.name === from), j = st.findIndex((s) => s.name === to);
    if (i < 0 || j < 0) return 0;
    let km = 0;
    for (let k = Math.min(i, j); k < Math.max(i, j); k++) km += haversine(st[k], st[k + 1]) / 1000;
    return km * 1.12;   // 實際路線比直線長
  };
  const west = findLine(net, '西部幹線'), east = findLine(net, '東部幹線');
  const out = {};
  for (const d of TICKET_DESTS) out[d] = EAST.includes(d) ? along(west, '臺北', '八堵') + along(east, '八堵', d) : along(west, '臺北', d);
  return out;
}

/** 本班可售的列車:每 10~15 分一班,自強/莒光/區間;區間車只到新竹或宜蘭 */
function makeTrains(t0, R, L) {
  const out = [];
  let t = t0 + 8, no = 101;
  const busy = L.id === 't3' ? 0.82 : L.id === 't2' ? 0.6 : L.id === 't4' ? 0.55 : 0.35;
  for (let i = 0; i < 9; i++) {
    const east = i % 3 === 2;
    const type = ['exp', 'loc', 'exp', 'cht', 'exp', 'loc', 'exp', 'cht', 'loc'][i];
    const dests = east ? (type === 'loc' ? ['宜蘭'] : ['宜蘭', '花蓮']) : (type === 'loc' ? ['板橋', '桃園', '中壢', '新竹'] : TICKET_DESTS.filter((d) => !EAST.includes(d)));
    const seats = Array.from({ length: CARS * ROWS * 4 }, () => (R() < busy * (type === 'exp' ? 1.1 : 0.8) ? 1 : 0));
    out.push({ no: `${type === 'loc' ? 1 : type === 'cht' ? 6 : ''}${no + i * 2}`, type, time: t, dests, seats });
    t += 10 + Math.floor(R() * 6);
  }
  return out;
}
