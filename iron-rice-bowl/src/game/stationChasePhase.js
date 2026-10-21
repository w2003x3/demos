// 車站追逐:站長 vs 不良乘客(玩家選一方,另一方由 AI 控制),共用六座車站場景。
//   兩邊都能奔跑(Shift,耗體力)與跳躍(Space,跳過閘門、長椅、行李等低矮障礙)。
//   不良乘客:噴漆罐(噴人看不見 / 在牆上地上塗鴉)、香蕉皮(踩到滑倒)、煙霧彈(畫面一片灰)、橡皮筋(射人)
//             → 目標:在時限內塗鴉達標並且不被抓。
//   站長    :刺股(對方倒地/暈眩/靜止時叉住即逮捕,否則先叉住壓制)、電擊棒(近身暈眩)、BB 槍(打中減速)、
//             閃光彈(範圍內靜止 5 秒)→ 目標:時限內逮捕不良乘客。
//   口頭禪預先錄音(src/config/voice.js 的 CHASE_LINES)。
// AI 以每層 1 m 網格 + 樓梯連結做 A* 尋路,能跨樓層追 / 逃,遇低矮障礙自動跳。
import * as THREE from 'three';
import { StationExplorePhase, R_P, SPEED } from './stationExplorePhase.js';
import { pickPerson, workerFigure } from '../core/assets.js';
import { CHASE_WEAPONS } from '../config/chase.js';

export { CHASE_WEAPONS };
const ROLE_TITLE = { stationmaster: '站長', troublemaker: '不良乘客' };
const G = 13, JUMP_V = 5.3, RUN = 1.85;
const STATUS = ['stun', 'freeze', 'slip', 'pin', 'slow', 'blind', 'smoke'];

export class StationChasePhase extends StationExplorePhase {
  constructor(game, cfg) {
    super(game, { variant: 'obstacle', ...cfg });
    this.role = cfg.role;                                  // 玩家角色
    this.foe = cfg.role === 'stationmaster' ? 'troublemaker' : 'stationmaster';
    this.timeLimit = cfg.time ?? (this.role === 'stationmaster' ? 180 : 150);
    this.tagGoal = cfg.tags ?? 5;
  }

  prepTitle() { return { title: `${this.cfg.title}・${ROLE_TITLE[this.role]}整裝中`, sub: `${ROLE_TITLE[this.role]}的裝備`, go: '開始' }; }
  prepItems() { return CHASE_WEAPONS[this.role].map((w, i) => ({ id: w.id, name: `${w.icon} ${w.name}`, price: 0, desc: `按 ${i + 1}:${w.desc}`, dishes: [] })); }

  async init() {
    await super.init();
    this.left = this.timeLimit;
    this.tags = { stationmaster: 0, troublemaker: 0 };
    this.tagSpots = [];
    this.fx = new THREE.Group(); this.root.add(this.fx);
    this.peels = []; this.shots = []; this.throws = []; this.clouds = []; this.sparks = [];
    this.result = null;
    // 玩家外觀換成角色造型
    this.me.clear();
    this.me.add(this._figure(this.role, 1));
    this._agentInit(this.p, this.role, this.me);
    // AI 對手
    this.aiObj = new THREE.Group();
    this.aiObj.add(this._figure(this.foe, 2));
    this.root.add(this.aiObj);
    this.ai = { floor: this.p.floor, x: this.p.x, z: this.p.z, y: this.p.y, angle: 0, stair: null, vel: 0 };
    this._agentInit(this.ai, this.foe, this.aiObj);
    this._buildNav();
    this._placeAi();
    this.ai.brain = { path: [], repath: 0, wander: null, last: { x: this.ai.x, z: this.ai.z, t: 0 }, sayCd: 4, startDelay: this.foe === 'stationmaster' ? 4 : 0 };
    this._overlays();
  }

  /** 角色造型:站長 = 深藍制服 + 大盤帽;不良乘客 = 深色帽 T + 反戴紅色棒球帽 */
  _figure(role, seed) {
    const ra = this.assets.rail;
    const g = new THREE.Group();
    let body = null;
    if (role === 'stationmaster') body = workerFigure(ra, ['male-business-02', 'male-adult-10', 'male-adult-08', 'male-adult-03'], '#16233f', false);
    else {
      const ppl = this.assets.people;
      const ids = ppl ? [ppl[pickPerson(ppl, () => (seed * 0.37) % 1)].id, 'male-adult-09', 'male-adult-03'] : [];
      body = workerFigure(ra, ids, '#2c2f36', false);
    }
    if (!body) { body = this.assets.passengerStand.clone(true); }
    g.add(body);
    // 帽子
    const capMat = new THREE.MeshStandardMaterial({ color: role === 'stationmaster' ? '#141c30' : '#c0392b', roughness: 0.6 });
    const cap = new THREE.Group();
    if (role === 'stationmaster') {
      cap.add(new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.115, 0.09, 20), capMat));
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 20), capMat); top.position.y = 0.05; cap.add(top);
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: '#0b0b0b', roughness: 0.2 }));
      visor.position.set(0.08, -0.04, 0); cap.add(visor);
      const badge = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.9, roughness: 0.3 }));
      badge.position.set(0.13, 0.0, 0); cap.add(badge);
    } else {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMat); cap.add(dome);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.16), capMat); visor.position.set(-0.13, 0, 0); cap.add(visor);   // 反戴:帽簷朝後
    }
    cap.position.set(0.0, 1.7, 0);
    g.add(cap);
    // 手上的道具(依選擇切換)
    const hand = new THREE.Group(); hand.position.set(0.32, 1.0, 0.22); g.add(hand);
    g.userData.hand = hand;
    // 狀態特效:暈眩星星
    const stars = new THREE.Group(); stars.position.y = 1.95; stars.visible = false;
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshBasicMaterial({ color: '#ffd23a' })); s.position.set(Math.cos(i * 1.256) * 0.25, 0, Math.sin(i * 1.256) * 0.25); stars.add(s); }
    g.add(stars); g.userData.stars = stars;
    g.userData.body = body;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  _agentInit(A, role, obj) {
    Object.assign(A, { role, obj, jy: 0, vy: 0, stamina: 1, sel: 0, cd: {}, uses: 0, captured: false });
    for (const k of STATUS) A[k] = 0;
    this._equip(A, 0);
  }

  /** 手上道具的模型 */
  _equip(A, idx) {
    A.sel = idx;
    const w = CHASE_WEAPONS[A.role][idx], hand = A.obj.children[0].userData.hand;
    hand.clear();
    const m = (geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, extra = {}) => {
      const o = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra }));
      o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; hand.add(o); return o;
    };
    if (w.id === 'spray') { m(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 14), '#d93a7a', 0, 0, 0, 0, 0, 0, { metalness: 0.6 }); m(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), '#eee', 0, 0.115, 0); }
    if (w.id === 'banana') { for (let i = 0; i < 3; i++) m(new THREE.CapsuleGeometry(0.025, 0.12, 4, 8), '#f2d03b', 0, 0, (i - 1) * 0.03, 0, 0, 0.5 + i * 0.2); }
    if (w.id === 'smoke') { m(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 14), '#6f7a6a'); m(new THREE.TorusGeometry(0.02, 0.006, 6, 12), '#ccc', 0, 0.09, 0); }
    if (w.id === 'band') { m(new THREE.TorusGeometry(0.05, 0.006, 6, 20), '#d9822b', 0.05, 0.03, 0, 0, Math.PI / 2, 0); }
    if (w.id === 'fork') {
      // 刺股:長柄 + U 形叉頭(帶倒刺),手持往前伸
      const pole = new THREE.Group(); hand.add(pole); pole.rotation.z = -1.45; pole.position.set(0.1, 0, 0);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.1, 10), new THREE.MeshStandardMaterial({ color: '#c9ced3', metalness: 0.8, roughness: 0.3 }));
      p.position.y = 0.6; pole.add(p);
      const u = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.016, 8, 24, Math.PI), p.material); u.position.y = 1.65; u.rotation.z = Math.PI; pole.add(u);
      for (const s of [-1, 1]) { const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.18, 8), p.material); tip.position.set(s * 0.2, 1.74, 0); pole.add(tip); }
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.4, 10), new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.7 })); grip.position.y = -0.25; pole.add(grip);
    }
    if (w.id === 'baton') { m(new THREE.CylinderGeometry(0.022, 0.026, 0.45, 12), '#1b1d22', 0.15, 0, 0, 0, 0, -1.3); m(new THREE.SphereGeometry(0.028, 10, 8), '#5ab4ff', 0.37, 0.05, 0, 0, 0, 0, { emissive: '#3aa0ff', emissiveIntensity: 1.5 }); }
    if (w.id === 'bb') { m(new THREE.BoxGeometry(0.28, 0.06, 0.05), '#22252a', 0.12, 0.02, 0); m(new THREE.BoxGeometry(0.06, 0.12, 0.045), '#22252a', 0.0, -0.06, 0, 0, 0, 0.25); }
    if (w.id === 'flash') { m(new THREE.CylinderGeometry(0.04, 0.04, 0.13, 14), '#3d4a33'); m(new THREE.BoxGeometry(0.02, 0.06, 0.02), '#999', 0.03, 0.08, 0); }
    if (A === this.p) this._renderWeapons?.();
  }

  // ================================================================ 尋路網格(每層 1 m)+ 樓梯連結
  _buildNav() {
    this.nav = {};
    const C = 1;
    for (const [fl, f] of Object.entries(this.st.floors)) {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const b of f.bounds) { x0 = Math.min(x0, b[0]); z0 = Math.min(z0, b[1]); x1 = Math.max(x1, b[2]); z1 = Math.max(z1, b[3]); }
      x0 = Math.floor(x0); z0 = Math.floor(z0);
      const nx = Math.ceil(x1 - x0) + 1, nz = Math.ceil(z1 - z0) + 1, walk = new Uint8Array(nx * nz);
      const inAny = (px, pz) => f.bounds.some((b) => px > b[0] && px < b[2] && pz > b[1] && pz < b[3]);
      for (const b of f.bounds) {
        for (let j = Math.max(0, Math.floor(b[1] - z0)); j < Math.min(nz, Math.ceil(b[3] - z0)); j++) for (let i = Math.max(0, Math.floor(b[0] - x0)); i < Math.min(nx, Math.ceil(b[2] - x0)); i++) {
          const k = j * nx + i; if (walk[k]) continue;
          const cx = x0 + i + 0.5, cz = z0 + j + 0.5;
          if (inAny(cx - R_P, cz) && inAny(cx + R_P, cz) && inAny(cx, cz - R_P) && inAny(cx, cz + R_P)) walk[k] = 1;
        }
      }
      // 牆(不能跳過的)擋住;低矮障礙在網格上可通行(AI 會跳)
      const hard = new Uint8Array(nx * nz);
      for (const s of this.st.solids[fl] || []) {
        if (s[4] != null && s[4] <= 1.15) continue;
        for (let j = Math.max(0, Math.floor(s[1] - R_P - z0)); j < Math.min(nz, Math.ceil(s[3] + R_P - z0)); j++) for (let i = Math.max(0, Math.floor(s[0] - R_P - x0)); i < Math.min(nx, Math.ceil(s[2] + R_P - x0)); i++) {
          const cx = x0 + i + 0.5, cz = z0 + j + 0.5;
          if (cx > s[0] - R_P - 0.05 && cx < s[2] + R_P + 0.05 && cz > s[1] - R_P - 0.05 && cz < s[3] + R_P + 0.05) { walk[j * nx + i] = 0; hard[j * nx + i] = 1; }
        }
      }
      this.nav[fl] = { x0, z0, nx, nz, C, walk, hard };
    }
    // 樓梯範圍在兩層的網格上都不可走(只能經由樓梯連結通過,避免路徑「穿越」樓梯井)
    for (const s of this.st.stairs) for (const fl of [s.fromFloor, s.toFloor]) {
      const n = this.nav[fl]; if (!n) continue;
      for (let j = Math.max(0, Math.floor(s.box[1] - 0.3 - n.z0)); j < Math.min(n.nz, Math.ceil(s.box[3] + 0.3 - n.z0)); j++) for (let i = Math.max(0, Math.floor(s.box[0] - 0.3 - n.x0)); i < Math.min(n.nx, Math.ceil(s.box[2] + 0.3 - n.x0)); i++) n.walk[j * n.nx + i] = 0;
    }
    // 樓梯:兩端外側各取一個可走格,連成一條邊
    this.links = [];
    for (const s of this.st.stairs) {
      const dir = Math.sign(s.b - s.a), lat = s.axis === 'x' ? (s.box[1] + s.box[3]) / 2 : (s.box[0] + s.box[2]) / 2;
      const pt = (along) => (s.axis === 'x' ? { x: along, z: lat } : { x: lat, z: along });
      const A = this._nearCell(s.fromFloor, pt(s.a - dir * 0.9)), B = this._nearCell(s.toFloor, pt(s.b + dir * 0.9));
      if (A != null && B != null) this.links.push({ s, A: { fl: s.fromFloor, k: A }, B: { fl: s.toFloor, k: B }, cost: Math.abs(s.b - s.a) + 2 });
    }
  }

  _cell(fl, x, z) { const n = this.nav[fl]; if (!n) return null; const i = Math.floor(x - n.x0), j = Math.floor(z - n.z0); return i < 0 || j < 0 || i >= n.nx || j >= n.nz ? null : j * n.nx + i; }
  _cellPos(fl, k) { const n = this.nav[fl]; return { x: n.x0 + (k % n.nx) + 0.5, z: n.z0 + Math.floor(k / n.nx) + 0.5 }; }
  _walkable(fl, x, z) { const k = this._cell(fl, x, z); return k != null && this.nav[fl].walk[k] === 1; }
  _nearCell(fl, p, r = 4) {
    const n = this.nav[fl]; if (!n) return null;
    let best = null, bd = Infinity;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const k = this._cell(fl, p.x + dx, p.z + dz);
      if (k == null || !n.walk[k]) continue;
      const c = this._cellPos(fl, k), d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  /** A*(跨樓層);回傳 [{fl, x, z}] */
  _path(fromFl, from, toFl, to) {
    const s = this._nearCell(fromFl, from), t = this._nearCell(toFl, to);
    if (s == null || t == null) return null;
    const fls = Object.keys(this.nav), fi = Object.fromEntries(fls.map((f, i) => [f, i])), BIG = 1 << 22;
    const id = (fl, k) => fi[fl] * BIG + k, unid = (v) => [fls[Math.floor(v / BIG)], v % BIG];
    const goal = id(toFl, t), tp = this._cellPos(toFl, t);
    const h = (fl, k) => { const p = this._cellPos(fl, k); return Math.hypot(p.x - tp.x, p.z - tp.z) + (fl === toFl ? 0 : 6); };
    const linkAt = new Map();
    for (const L of this.links) { for (const [a, b] of [[L.A, L.B], [L.B, L.A]]) { const key = id(a.fl, a.k); if (!linkAt.has(key)) linkAt.set(key, []); linkAt.get(key).push({ to: id(b.fl, b.k), cost: L.cost }); } }
    const g = new Map([[id(fromFl, s), 0]]), came = new Map();
    const heap = [[h(fromFl, s), id(fromFl, s)]];
    const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    let it = 0, found = false;
    while (heap.length && it++ < 60000) {
      const [, cur] = pop();
      if (cur === goal) { found = true; break; }
      const [fl, k] = unid(cur), n = this.nav[fl], gc = g.get(cur);
      const i = k % n.nx, j = Math.floor(k / n.nx);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const ii = i + dx, jj = j + dz;
        if (ii < 0 || jj < 0 || ii >= n.nx || jj >= n.nz) continue;
        const kk = jj * n.nx + ii;
        if (!n.walk[kk]) continue;
        if (dx && dz && (!n.walk[j * n.nx + ii] || !n.walk[jj * n.nx + i])) continue;
        const nid = id(fl, kk), ng = gc + (dx && dz ? 1.414 : 1);
        if (ng < (g.get(nid) ?? Infinity)) { g.set(nid, ng); came.set(nid, cur); push([ng + h(fl, kk), nid]); }
      }
      for (const L of linkAt.get(cur) || []) {
        const ng = gc + L.cost;
        if (ng < (g.get(L.to) ?? Infinity)) { g.set(L.to, ng); came.set(L.to, cur); const [f2, k2] = unid(L.to); push([ng + h(f2, k2), L.to]); }
      }
    }
    if (!found) return null;
    const out = [];
    for (let v = goal; v != null; v = came.get(v)) { const [fl, k] = unid(v); out.push({ fl, ...this._cellPos(fl, k) }); }
    return out.reverse();
  }

  /** 網格上的直線可視(只看牆) */
  _los(fl, a, b) {
    const n = this.nav[fl]; if (!n) return false;
    const d = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(d / 0.5);
    for (let s = 1; s < steps; s++) {
      const x = a.x + (b.x - a.x) * s / steps, z = a.z + (b.z - a.z) * s / steps, k = this._cell(fl, x, z);
      if (k == null || n.hard[k]) return false;
      if (!n.walk[k] && !this._lowAt(fl, x, z)) return false;
    }
    return true;
  }
  _lowAt(fl, x, z) { return (this.st.solids[fl] || []).some((s) => s[4] != null && x > s[0] - R_P && x < s[2] + R_P && z > s[1] - R_P && z < s[3] + R_P); }

  _placeAi() {
    const P = this.p, fls = Object.keys(this.nav);
    const cands = [];
    for (let t = 0; t < 600 && cands.length < 80; t++) {
      const fl = fls[(Math.random() * fls.length) | 0], n = this.nav[fl], k = (Math.random() * n.walk.length) | 0;
      if (!n.walk[k]) continue;
      const c = this._cellPos(fl, k);
      if (this._lowAt(fl, c.x, c.z)) continue;
      const d = Math.hypot(c.x - P.x, c.z - P.z) + (fl === P.floor ? 0 : 12);
      const want = this.foe === 'stationmaster' ? 30 : 22;   // 站長從遠處出發;不良乘客在中距離
      cands.push({ fl, ...c, score: -Math.abs(d - want) });
    }
    cands.sort((a, b) => b.score - a.score);
    // 分數最好且走得到玩家那裡的位置
    const best = cands.slice(0, 8).find((c) => this._path(c.fl, c, P.floor, P)) || cands[0];
    if (best) Object.assign(this.ai, { floor: best.fl, x: best.x, z: best.z, y: this.st.floors[best.fl].y });
  }

  // ================================================================ 移動與物理(玩家、AI 共用)
  _moveAgent(A, x, z) {
    const keep = this.p;
    this.p = A; this._quiet = A !== keep;
    this._tryMove(x, z);
    this.p = keep; this._quiet = false;
  }

  _ground(A) {
    let g = 0;
    if (A.stair) return 0;
    for (const s of this.st.solids[A.floor] || []) if (s[4] != null && s[4] <= A.jy + 0.06 && A.x > s[0] - 0.1 && A.x < s[2] + 0.1 && A.z > s[1] - 0.1 && A.z < s[3] + 0.1) g = Math.max(g, s[4]);
    return g;
  }

  _down(A) { return A.stun > 0 || A.freeze > 0 || A.slip > 0 || A.pin > 0 || A.captured; }

  /** dir = 想走的方向(單位向量或 null);run、jump 布林 */
  _stepAgent(A, dt, dir, run, jump) {
    for (const k of STATUS) if (A[k] > 0) A[k] = Math.max(0, A[k] - dt);
    for (const k in A.cd) A.cd[k] = Math.max(0, A.cd[k] - dt);
    const down = this._down(A);
    // 跳躍與重力
    const ground = this._ground(A);
    if (jump && !down && !A.stair && A.jy <= ground + 0.02) { A.vy = JUMP_V; if (A !== this.p) this._say(A, 'jump'); }
    A.vy -= G * dt; A.jy += A.vy * dt;
    if (A.jy <= ground) { A.jy = ground; A.vy = 0; }
    if (A.stair) { A.jy = 0; A.vy = 0; }
    // 移動
    let v = 0;
    if (dir && !down) {
      const running = run && A.stamina > 0.05;
      v = SPEED * (running ? RUN : 1) * (A.slow > 0 ? 0.55 : 1) * (A.smoke > 0 && A !== this.p ? 0.7 : 1);
      A.stamina = running ? Math.max(0, A.stamina - dt * 0.16) : Math.min(1, A.stamina + dt * 0.12);
      this._moveAgent(A, A.x + dir.x * v * dt, A.z + dir.z * v * dt);
      const target = Math.atan2(-dir.z, dir.x);
      let da = target - A.angle; da = Math.atan2(Math.sin(da), Math.cos(da));
      A.angle += da * Math.min(1, dt * 12);
    } else A.stamina = Math.min(1, A.stamina + dt * 0.18);
    A.vel = v;
    // 香蕉皮
    for (const p of [...this.peels]) {
      if (p.floor !== A.floor || A.jy > 0.15 || A.stair || (p.owner === A && p.safe > 0)) continue;
      if (Math.hypot(p.x - A.x, p.z - A.z) < 0.55) {
        A.slip = 2.0; A.vy = 0; this._removePeel(p);
        this._hitFx(A, '滑倒!');
        if (p.owner !== A) this._say(p.owner, 'taunt');
      }
    }
    // 外觀:位置、朝向、倒地、暈眩星星
    const o = A.obj, fig = o.children[0];
    o.position.set(A.x, A.y + A.jy + (v ? Math.abs(Math.sin(this.time * (v > 4 ? 14 : 9))) * 0.04 : 0), A.z);
    o.rotation.y = A.angle;
    const lying = A.slip > 0 || A.captured;
    fig.rotation.z = THREE.MathUtils.lerp(fig.rotation.z, lying ? Math.PI / 2 : 0, Math.min(1, dt * 12));
    fig.position.y = THREE.MathUtils.lerp(fig.position.y, lying ? 0.25 : 0, Math.min(1, dt * 12));
    fig.userData.stars.visible = A.stun > 0 || A.freeze > 0 || A.pin > 0;
    fig.userData.stars.rotation.y += dt * 5;
    fig.userData.stars.children.forEach((s) => s.material.color.set(A.freeze > 0 ? '#ffffff' : A.pin > 0 ? '#ff5a5a' : '#ffd23a'));
  }

  // ================================================================ 道具
  _fwd(A) { return { x: Math.cos(A.angle), z: -Math.sin(A.angle) }; }
  _other(A) { return A === this.p ? this.ai : this.p; }

  _use(A, idx) {
    const w = CHASE_WEAPONS[A.role][idx];
    if (!w || A.cd[w.id] > 0 || this._down(A) || this.result) return false;
    if (A.sel !== idx) this._equip(A, idx);
    A.cd[w.id] = w.cd;
    A.uses++;
    const T = this._other(A), f = this._fwd(A);
    const dist = Math.hypot(T.x - A.x, T.z - A.z), same = T.floor === A.floor && !T.stair && !A.stair;
    const inCone = (r, cone) => same && dist < r && ((T.x - A.x) * f.x + (T.z - A.z) * f.z) / Math.max(dist, 0.01) > Math.cos(cone);
    const sfx = this.g.sfx;
    this._swing(A);
    switch (w.id) {
      case 'spray': {
        this._mist(A, f);
        if (inCone(3.4, 0.6)) { T.blind = 3.5; this._hitFx(T, '被噴漆!'); this._say(A, 'taunt'); }
        else this._tag(A, f);
        sfx.blip();
        break;
      }
      case 'banana': {
        const mine = this.peels.filter((p) => p.owner === A);
        if (mine.length >= 4) this._removePeel(mine[0]);
        this._peel(A, A.x - f.x * 0.9, A.z - f.z * 0.9);
        break;
      }
      case 'smoke': this._throw(A, f, 'smoke'); break;
      case 'flash': this._throw(A, f, 'flash'); this._say(A, 'flash'); break;
      case 'band': this._shoot(A, f, 'band'); sfx.blip(); break;
      case 'bb': this._shoot(A, f, 'bb'); sfx.blip(); break;
      case 'baton': {
        this._spark(A, f);
        if (inCone(2.0, 0.8)) { T.stun = Math.max(T.stun, 2.5); T.vy = 0; this._hitFx(T, '電擊!'); sfx.bad(); }
        break;
      }
      case 'fork': {
        if (inCone(2.9, 0.75)) {
          if (T.stun > 0 || T.freeze > 0 || T.slip > 0) { this._capture(T); }
          else { T.pin = 1.2; T.vy = 0; this._hitFx(T, '被叉住!'); this._say(A, 'pin'); }
        }
        break;
      }
    }
    return true;
  }

  _capture(T) {
    if (T.captured) return;
    T.captured = true;
    const sm = T === this.p ? this.ai : this.p;
    this._say(sm, 'capture', true);
    this._hitFx(T, '逮捕!');
    this.g.sfx.ok();
    this.result = { captured: true, t: 1.8 };
  }

  // ---- 投射物 / 投擲物 / 地面物
  _shoot(A, f, kind) {
    const geo = kind === 'bb' ? new THREE.SphereGeometry(0.035, 8, 6) : new THREE.TorusGeometry(0.05, 0.008, 6, 14);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: kind === 'bb' ? '#ffcc33' : '#d9822b' }));
    const y = A.y + A.jy + 1.2;
    mesh.position.set(A.x + f.x * 0.6, y, A.z + f.z * 0.6);
    this.fx.add(mesh);
    this.shots.push({ A, kind, mesh, floor: A.floor, x: mesh.position.x, z: mesh.position.z, vx: f.x * (kind === 'bb' ? 42 : 26), vz: f.z * (kind === 'bb' ? 42 : 26), life: kind === 'bb' ? 0.65 : 0.75 });
  }

  _throw(A, f, kind) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 12), new THREE.MeshStandardMaterial({ color: kind === 'flash' ? '#3d4a33' : '#6f7a6a' }));
    this.fx.add(mesh);
    // 拋物線:飛 0.8 秒,最遠約 10 m(撞牆就停在牆前)
    const range = kind === 'flash' ? 10 : 9;
    let land = { x: A.x, z: A.z };
    for (let d = 0.5; d <= range; d += 0.5) {
      const x = A.x + f.x * d, z = A.z + f.z * d, k = this._cell(A.floor, x, z);
      if (k == null || this.nav[A.floor].hard[k]) break;
      land = { x, z };
    }
    this.throws.push({ A, kind, mesh, floor: A.floor, y0: A.y + A.jy + 1.3, from: { x: A.x, z: A.z }, to: land, t: 0, dur: 0.8, fuse: kind === 'flash' ? 0.7 : 0 });
  }

  _peel(A, x, z) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 8), new THREE.MeshStandardMaterial({ color: i ? '#f2d03b' : '#f6e7a8', roughness: 0.6 }));
      s.rotation.set(Math.PI / 2, 0, i * 1.57 + 0.3); s.position.set(Math.cos(i * 1.57) * 0.08, 0.03, Math.sin(i * 1.57) * 0.08); g.add(s);
    }
    const fl = A.floor, y = this.st.floors[fl].y;
    g.position.set(x, (A.stair ? A.y : y) + 0.01, z); g.scale.setScalar(1.8);
    this.fx.add(g);
    this.peels.push({ owner: A, floor: fl, x, z, mesh: g, safe: 1.2, life: 60 });
  }
  _removePeel(p) { this.fx.remove(p.mesh); this.peels.splice(this.peels.indexOf(p), 1); }

  _smokeCloud(fl, x, z, y, owner) {
    const g = new THREE.Group(), tex = this._puffTex();
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#b7bcc0', transparent: true, opacity: 0.85, depthWrite: false }));
      const a = Math.random() * 6.28, r = Math.random() * 4;
      s.position.set(x + Math.cos(a) * r, y + 0.6 + Math.random() * 2.2, z + Math.sin(a) * r);
      s.scale.setScalar(2.5 + Math.random() * 2.5); s.userData.v = 0.2 + Math.random() * 0.4;
      g.add(s);
    }
    this.fx.add(g);
    this.clouds.push({ floor: fl, x, z, r: 5, life: 9, mesh: g, owner });
  }

  _flashBang(T0, fl, x, z, y) {
    const light = new THREE.PointLight('#ffffff', 400, 30, 1.2); light.position.set(x, y + 1.2, z); this.fx.add(light);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 })); ball.position.copy(light.position); this.fx.add(ball);
    this.sparks.push({ mesh: light, life: 0.35, kind: 'light' }, { mesh: ball, life: 0.35, kind: 'ball' });
    this.g.sfx.bad();
    for (const A of [this.p, this.ai]) {
      if (A.floor !== fl || A.stair) continue;
      const d = Math.hypot(A.x - x, A.z - z);
      if (d < 8 && (A !== T0.A || d < 3)) { A.freeze = 5; A.vy = 0; if (A === this.p) this.flashT = 5; this._hitFx(A, '閃光!靜止 5 秒'); }
    }
  }

  _tag(A, f) {
    // 前方 2.5 m 內有牆 → 牆上塗鴉,否則噴在地上
    let wall = null;
    for (let d = 0.4; d <= 2.6; d += 0.2) { const k = this._cell(A.floor, A.x + f.x * d, A.z + f.z * d); if (k == null || this.nav[A.floor].hard[k]) { wall = d - 0.15; break; } }
    const fy = this.st.floors[A.floor].y;
    const x = A.x + f.x * (wall ?? 1.4), z = A.z + f.z * (wall ?? 1.4);
    const near = this.tagSpots.some((t) => t.floor === A.floor && Math.hypot(t.x - x, t.z - z) < 3);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wall ? 2.2 : 1.8, wall ? 1.3 : 1.8), new THREE.MeshBasicMaterial({ map: this._tagTex(this.tagSpots.length), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    if (wall) { mesh.position.set(x, fy + 1.5, z); mesh.rotation.y = Math.atan2(-f.x, -f.z); }
    else { mesh.position.set(x, (A.stair ? A.y : fy) + 0.02, z); mesh.rotation.set(-Math.PI / 2, 0, Math.random() * 6); }
    this.fx.add(mesh);
    if (!near && A.role === 'troublemaker') {
      this.tagSpots.push({ floor: A.floor, x, z });
      this.tags[A.role]++;
      if (A === this.p) this.g.ui.toast(`塗鴉 ${this.tags.troublemaker} / ${this.tagGoal}`, this.tags.troublemaker >= this.tagGoal ? 'good' : 'info');
    }
  }

  _mist(A, f) {
    const tex = this._puffTex(), col = ['#ff3d7f', '#3dd5ff', '#ffe03d', '#7dff6a'][(Math.random() * 4) | 0];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: 0.7, depthWrite: false }));
      const d = 0.6 + i * 0.35;
      s.position.set(A.x + f.x * d, A.y + A.jy + 1.2 + (Math.random() - 0.5) * 0.3, A.z + f.z * d);
      s.scale.setScalar(0.3 + i * 0.12);
      this.fx.add(s); this.sparks.push({ mesh: s, life: 0.6, kind: 'puff' });
    }
  }

  _spark(A, f) {
    const l = new THREE.PointLight('#5ab4ff', 30, 5, 1.5);
    l.position.set(A.x + f.x * 0.9, A.y + A.jy + 1.1, A.z + f.z * 0.9);
    this.fx.add(l); this.sparks.push({ mesh: l, life: 0.18, kind: 'light' });
  }

  _swing(A) { A.swing = 0.25; }

  _hitFx(A, text) {
    this.g.ui.bubble({ text, anchor: A.obj, duration: 1100 });
    if (A === this.p) { this.hurtT = 0.4; }
  }

  // ---- 貼圖
  _puffTex() {
    return this._puff ??= (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
  }

  _tagTex(i) {
    this._tags ??= [];
    const words = ['肉腳', '嗚耶!', 'TM', '我來過', 'YO!', '肉~腳', '阿嬤贏'];
    const k = i % words.length;
    return this._tags[k] ??= (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 160;
      const x = c.getContext('2d');
      const cols = ['#ff2d7a', '#2de0ff', '#ffe02d', '#7dff3a', '#b45cff'];
      for (let n = 0; n < 40; n++) { x.fillStyle = cols[n % 5] + '55'; x.beginPath(); x.arc(30 + Math.random() * 196, 30 + Math.random() * 100, 4 + Math.random() * 12, 0, 6.3); x.fill(); }
      x.font = `900 ${words[k].length > 3 ? 54 : 74}px "Noto Sans TC","Microsoft JhengHei",sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 10; x.strokeStyle = '#111'; x.strokeText(words[k], 128, 82);
      x.fillStyle = cols[k % 5]; x.fillText(words[k], 128, 82);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
  }

  // ================================================================ 口頭禪
  /** kind:taunt / jump / pin / flash / capture / start;force 忽略冷卻 */
  _say(A, kind, force = false) {
    if (!A || A.captured) return;
    A.sayCd ??= 0;
    if (!force && (A.sayCd > this.time || Math.random() < 0.35)) return;
    A.sayCd = this.time + 5;
    const L = A.role === 'stationmaster'
      ? { pin: [1, 0], flash: [0], capture: [2, 3], taunt: [0, 1], jump: [], start: [3] }
      : { taunt: [2, 3, 0], jump: [1], start: [0], pin: [], flash: [], capture: [] };
    const opts = L[kind] || [];
    if (!opts.length) return;
    const i = opts[(Math.random() * opts.length) | 0];
    this.g.voice.talk(`chase_${A.role === 'stationmaster' ? 'sm' : 'tm'}_${i}`, A.obj);
  }

  // ================================================================ AI
  _aiThink(dt) {
    const A = this.ai, P = this.p, B = A.brain;
    if (B.startDelay > 0) { B.startDelay -= dt; return { dir: null }; }
    if (this._down(A)) return { dir: null };
    const sameFl = A.floor === P.floor && !A.stair && !P.stair;
    const dist = Math.hypot(P.x - A.x, P.z - A.z);
    const blind = A.blind > 0 || A.smoke > 0;
    const sees = !blind && sameFl && dist < 40 && this._los(A.floor, A, P);
    if (sees) B.seen = { fl: P.floor, x: P.x, z: P.z, t: this.time };
    let goal = null, run = false;
    if (A.role === 'stationmaster') {
      // 追:看得到就直追;看不到就去最後看到的位置,再不行就繞到玩家附近(站長熟悉車站)
      if (!blind) goal = sees || !B.seen || this.time - B.seen.t > 6 ? { fl: P.stair ? P.stair.fromFloor : P.floor, x: P.x, z: P.z } : B.seen;
      run = !blind && dist > 3;
      // 武器
      if (sameFl && !blind) {
        this._face(A, P);
        if ((P.stun > 0 || P.freeze > 0 || P.slip > 0) && dist < 2.7) this._use(A, 0);
        else if (P.pin > 0 && dist < 1.9 && !A.cd.baton) this._use(A, 1);
        else if (dist < 1.8 && !A.cd.baton) this._use(A, 1);
        else if (dist < 2.6 && !A.cd.fork) this._use(A, 0);
        else if (sees && dist > 5 && dist < 11 && !A.cd.flash && Math.random() < dt * 0.6) this._use(A, 3);
        else if (sees && dist > 3.5 && dist < 16 && !A.cd.bb && Math.random() < dt * 1.6) this._aimAndUse(A, P, 2);
      }
    } else {
      // 逃:被追近了就找遠離玩家的地點;否則四處塗鴉
      const threat = !blind && (dist < 16 || (sees && dist < 24));
      if (threat) {
        if (!B.flee || this.time > B.fleeUntil || Math.hypot(B.flee.x - A.x, B.flee.z - A.z) < 2) { B.flee = this._fleeSpot(); B.fleeUntil = this.time + 4; B.repath = 0; }
        goal = B.flee; run = true;
        if (sameFl) {
          const behind = ((P.x - A.x) * Math.cos(A.angle) + (P.z - A.z) * -Math.sin(A.angle)) < 0;
          if (behind && dist < 8 && !A.cd.banana && Math.random() < dt * 1.2) this._use(A, 1);
          if (dist < 7 && !A.cd.smoke && Math.random() < dt * 0.5) { this._face(A, P); this._use(A, 2); }
          if (sees && dist < 3.2 && !A.cd.spray) { this._face(A, P); this._use(A, 0); }
          if (sees && dist > 4 && dist < 13 && !A.cd.band && Math.random() < dt * 0.9) this._aimAndUse(A, P, 3);
        }
      } else {
        if (!B.wander || Math.hypot(B.wander.x - A.x, B.wander.z - A.z) < 1.5 || this.time > B.wanderUntil) {
          // 到了就噴一下塗鴉,再換下一個點
          if (B.wander && !A.cd.spray) { A.angle += (Math.random() - 0.5) * 3; this._use(A, 0); }
          B.wander = this._randomSpot(A.floor, 30); B.wanderUntil = this.time + 12; B.repath = 0;
        }
        goal = B.wander;
      }
      if ((B.tauntAt ?? 0) < this.time && sameFl && dist < 14) { B.tauntAt = this.time + 9; this._say(A, 'taunt'); }
    }
    if (blind) { // 看不見:慢慢亂走
      if (!B.wander || this.time > B.wanderUntil) { B.wander = this._randomSpot(A.floor, 6); B.wanderUntil = this.time + 2; B.repath = 0; }
      goal = B.wander; run = false;
    }
    if (!goal) return { dir: null };
    // 重新規劃路徑
    B.repath -= dt;
    if (!A.stair && (B.repath <= 0 || !B.path?.length)) {
      B.repath = 0.5;
      B.path = this._path(A.floor, A, goal.fl || A.floor, goal) || [];
      B.pi = 0;
    }
    // 沿路徑:跳過已到的點、往前看幾個點走直線
    const path = B.path;
    while (B.pi < path.length - 1 && path[B.pi].fl === A.floor && !A.stair && Math.hypot(path[B.pi].x - A.x, path[B.pi].z - A.z) < 0.7) B.pi++;
    if (!A.stair && B.stairOn) { B.stairOn = null; B.stairToB = null; B.repath = 0; }
    let tgt = path[B.pi];
    if (!tgt && !A.stair) return { dir: null };
    if (!A.stair) for (let k = Math.min(path.length - 1, B.pi + 6); k > B.pi; k--) {
      if (path[k].fl === A.floor && path.slice(B.pi, k + 1).every((p) => p.fl === A.floor) && this._los(A.floor, A, path[k])) { tgt = path[k]; B.pi = k; break; }
    }
    if (A.stair) {   // 樓梯上:方向在踏上樓梯時決定,走完才重新規劃
      const s = A.stair;
      if (B.stairToB == null || B.stairOn !== s) { B.stairOn = s; B.stairToB = path.slice(B.pi).some((p) => p.fl === s.toFloor) && A.floor === s.fromFloor || (A.floor === s.toFloor && !path.slice(B.pi).some((p) => p.fl === s.fromFloor)); }
      const toB = B.stairToB;
      const end = toB ? s.b + Math.sign(s.b - s.a) : s.a - Math.sign(s.b - s.a);
      tgt = s.axis === 'x' ? { x: end, z: (s.box[1] + s.box[3]) / 2 } : { x: (s.box[0] + s.box[2]) / 2, z: end };
    }
    let dx = tgt.x - A.x, dz = tgt.z - A.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.05) return { dir: null };
    dx /= l; dz /= l;
    // 前方有低矮障礙 → 跳;卡住 → 跳 + 重新規劃
    let jump = false;
    const ahead = { x: A.x + dx * 0.7, z: A.z + dz * 0.7 };
    if (!A.stair && this._lowAt(A.floor, ahead.x, ahead.z) && A.jy < 0.05) jump = true;
    if (this.time - B.last.t > 0.8) {
      if (Math.hypot(A.x - B.last.x, A.z - B.last.z) < 0.25 && A.vel > 0) { jump = true; B.repath = 0; B.wander = null; }
      B.last = { x: A.x, z: A.z, t: this.time };
    }
    return { dir: { x: dx, z: dz }, run, jump };
  }

  _face(A, T) { A.angle = Math.atan2(-(T.z - A.z), T.x - A.x); }
  _aimAndUse(A, T, idx) {
    // 簡單的提前量 + 手不穩(誤差)
    const lead = 0.25, err = (Math.random() - 0.5) * 0.18;
    const tx = T.x + (T.vel ? Math.cos(T.angle) * T.vel * lead : 0), tz = T.z + (T.vel ? -Math.sin(T.angle) * T.vel * lead : 0);
    A.angle = Math.atan2(-(tz - A.z), tx - A.x) + err;
    this._use(A, idx);
  }

  _randomSpot(fl, r) {
    const n = this.nav[fl], A = this.ai;
    for (let t = 0; t < 60; t++) {
      const x = A.x + (Math.random() - 0.5) * 2 * r, z = A.z + (Math.random() - 0.5) * 2 * r;
      if (this._walkable(fl, x, z)) return { fl, x, z };
    }
    const k = this._nearCell(fl, A, 3);
    return k != null ? { fl, ...this._cellPos(fl, k) } : null;
    void n;
  }

  _fleeSpot() {
    const A = this.ai, P = this.p, fls = Object.keys(this.nav);
    let best = null, bs = -Infinity;
    for (let t = 0; t < 40; t++) {
      const fl = Math.random() < 0.7 ? A.floor : fls[(Math.random() * fls.length) | 0], n = this.nav[fl];
      const x = A.x + (Math.random() - 0.5) * 70, z = A.z + (Math.random() - 0.5) * 70;
      if (!this._walkable(fl, x, z)) continue;
      const dp = Math.hypot(x - P.x, z - P.z) + (fl !== P.floor ? 15 : 0), da = Math.hypot(x - A.x, z - A.z);
      // 遠離玩家、不要穿過玩家(方向與玩家相反)
      const away = ((x - A.x) * (A.x - P.x) + (z - A.z) * (A.z - P.z)) / Math.max(1, da * Math.hypot(A.x - P.x, A.z - P.z));
      const s = dp - da * 0.35 + away * 10;
      if (s > bs) { bs = s; best = { fl, x, z }; }
      void n;
    }
    return best || this._randomSpot(A.floor, 20);
  }

  // ================================================================ 主迴圈
  update(dt) {
    const inp = this.g.input, P = this.p, c = this.cam;
    this.time += dt;
    if (this._leave) return this._finish(false, '中途離開');
    if (inp.wasPressed('KeyV')) c.mode = c.mode === 'first' ? 'third' : 'first';
    // 結束倒數(逮捕後停一下再結算)
    if (this.result) {
      this.result.t -= dt;
      this._stepAgent(P, dt, null, false, false); this._stepAgent(this.ai, dt, null, false, false);
      this._updateFx(dt); this._camera(dt); this._hud(); this.g.ui.updateBubbles(this.g.camera);
      if (this.result.t <= 0) {
        const caught = this.result.captured;
        return this.role === 'stationmaster'
          ? this._finish(caught, caught ? null : '')
          : this._finish(false, '被站長用刺股逮捕了!');
      }
      return null;
    }
    this.left -= dt;
    if (this.left <= 0) {
      if (this.role === 'stationmaster') return this._finish(false, '時間到,讓不良乘客跑掉了。');
      const ok = this.tags.troublemaker >= this.tagGoal;
      return this._finish(ok, ok ? null : `撐到最後,但塗鴉只有 ${this.tags.troublemaker} / ${this.tagGoal}。`);
    }
    // ---- 玩家輸入
    let f = 0, s = 0;
    const frozen = P.freeze > 0;
    if (!frozen) {
      if (inp.isDown('KeyW', 'ArrowUp')) f += 1;
      if (inp.isDown('KeyS', 'ArrowDown')) f -= 1;
      if (inp.isDown('KeyA', 'ArrowLeft')) s -= 1;
      if (inp.isDown('KeyD', 'ArrowRight')) s += 1;
    }
    let dir = null;
    if (f || s) {
      const yaw = c.yaw;
      let dx = Math.sin(yaw) * f + Math.cos(yaw) * s, dz = -Math.cos(yaw) * f + Math.sin(yaw) * s;
      const l = Math.hypot(dx, dz); dir = { x: dx / l, z: dz / l };
    }
    const run = inp.isDown('ShiftLeft', 'ShiftRight') || this.runToggle;
    const jump = inp.wasPressed('Space');
    this._stepAgent(P, dt, dir, run, jump);
    for (let i = 0; i < 4; i++) {
      if (inp.wasPressed(`Digit${i + 1}`, `Numpad${i + 1}`)) {
        // 朝鏡頭前方出手(站著不動時)
        if (!dir) P.angle = Math.atan2(Math.cos(c.yaw), Math.sin(c.yaw));
        this._use(P, i);
      }
    }
    if (inp.wasPressed('KeyF') && !this._down(P)) { if (!dir) P.angle = Math.atan2(Math.cos(c.yaw), Math.sin(c.yaw)); this._use(P, P.sel); }
    if (inp.wasPressed('KeyT')) this._say(P, 'taunt', true);
    if (inp.wasPressed('KeyQ')) this._equip(P, (P.sel + 1) % 4);
    // ---- AI
    const d = this._aiThink(dt);
    this._stepAgent(this.ai, dt, d.dir, d.run, d.jump);
    if (!this._started) { this._started = true; this._say(this.ai, 'start', true); }
    this._updateFx(dt);
    this._camera(dt);
    this._hud();
    this.g.ui.updateBubbles(this.g.camera);
    return null;
  }

  _updateFx(dt) {
    // 射擊
    for (const s of [...this.shots]) {
      s.life -= dt;
      const nx = s.x + s.vx * dt, nz = s.z + s.vz * dt, k = this._cell(s.floor, nx, nz);
      const T = this._other(s.A);
      let hit = false;
      if (T.floor === s.floor && !T.stair) {
        // 線段與目標的距離
        const ax = T.x - s.x, az = T.z - s.z, L2 = (nx - s.x) ** 2 + (nz - s.z) ** 2, t = Math.max(0, Math.min(1, (ax * (nx - s.x) + az * (nz - s.z)) / Math.max(L2, 1e-6)));
        const dx = s.x + (nx - s.x) * t - T.x, dz = s.z + (nz - s.z) * t - T.z;
        if (dx * dx + dz * dz < 0.45 * 0.45 && T.jy < 1.2) hit = true;
      }
      if (hit) {
        if (s.kind === 'bb') { T.slow = 2; T.stun = Math.max(T.stun, 0.3); this._hitFx(T, '中彈!'); }
        else { T.slow = 1.5; T.stun = Math.max(T.stun, 0.7); this._hitFx(T, '好痛!'); if (s.A !== this.p) this._say(s.A, 'taunt'); }
        this.g.sfx.bad();
      }
      s.x = nx; s.z = nz; s.mesh.position.x = nx; s.mesh.position.z = nz; s.mesh.rotation.y += dt * 20;
      if (hit || s.life <= 0 || k == null || this.nav[s.floor].hard[k]) { this.fx.remove(s.mesh); this.shots.splice(this.shots.indexOf(s), 1); }
    }
    // 投擲
    for (const t of [...this.throws]) {
      if (t.t < t.dur) {
        t.t += dt;
        const u = Math.min(1, t.t / t.dur), fy = this.st.floors[t.floor].y;
        t.mesh.position.set(t.from.x + (t.to.x - t.from.x) * u, THREE.MathUtils.lerp(t.y0, fy + 0.07, u) + Math.sin(u * Math.PI) * 2.2, t.from.z + (t.to.z - t.from.z) * u);
        t.mesh.rotation.x += dt * 12;
        continue;
      }
      t.fuse -= dt;
      if (t.fuse > 0) continue;
      const fy = this.st.floors[t.floor].y;
      if (t.kind === 'smoke') this._smokeCloud(t.floor, t.to.x, t.to.z, fy, t.A);
      else this._flashBang(t, t.floor, t.to.x, t.to.z, fy);
      this.fx.remove(t.mesh); this.throws.splice(this.throws.indexOf(t), 1);
    }
    // 煙霧
    for (const c of [...this.clouds]) {
      c.life -= dt;
      c.mesh.children.forEach((s) => { s.position.y += s.userData.v * dt * 0.3; s.material.opacity = Math.min(0.85, c.life / 2) * 0.85; });
      for (const A of [this.p, this.ai]) if (A !== c.owner && A.floor === c.floor && Math.hypot(A.x - c.x, A.z - c.z) < c.r) A.smoke = Math.max(A.smoke, A === this.p ? 4.5 : 3);
      if (c.life <= 0) { this.fx.remove(c.mesh); this.clouds.splice(this.clouds.indexOf(c), 1); }
    }
    // 香蕉皮
    for (const p of [...this.peels]) { p.safe -= dt; p.life -= dt; if (p.life <= 0) this._removePeel(p); }
    // 短暫特效
    for (const s of [...this.sparks]) {
      s.life -= dt;
      if (s.kind === 'puff') { s.mesh.material.opacity = Math.max(0, s.life); s.mesh.scale.multiplyScalar(1 + dt * 2); }
      if (s.kind === 'ball') { s.mesh.scale.multiplyScalar(1 + dt * 12); s.mesh.material.opacity = Math.max(0, s.life * 2.5); }
      if (s.kind === 'light') s.mesh.intensity *= 0.8;
      if (s.life <= 0) { this.fx.remove(s.mesh); this.sparks.splice(this.sparks.indexOf(s), 1); }
    }
    // 出手的手臂動作(道具往前推)
    for (const A of [this.p, this.ai]) {
      const hand = A.obj.children[0].userData.hand;
      A.swing = Math.max(0, (A.swing || 0) - dt);
      hand.position.x = 0.32 + (A.swing > 0 ? Math.sin((A.swing / 0.25) * Math.PI) * 0.45 : 0);
    }
    // 畫面遮罩
    const P = this.p;
    this.flashT = Math.max(0, (this.flashT || 0) - dt);
    this.hurtT = Math.max(0, (this.hurtT || 0) - dt);
    this.ov.smoke.style.opacity = Math.min(0.92, P.smoke / 2.5).toFixed(3);
    this.ov.paint.style.opacity = Math.min(1, P.blind / 1.5).toFixed(3);
    this.ov.flash.style.opacity = Math.min(1, this.flashT / 2.2).toFixed(3);
    this.ov.hurt.style.opacity = (this.hurtT * 1.5).toFixed(3);
  }

  _finish(success, reason) {
    const sm = this.role === 'stationmaster';
    const ranked = this.g.career.rank.phase === this.role;   // 只有目前職位的對局才計入職涯
    const delta = !ranked ? {} : sm
      ? { caughtEvaders: success ? 1 : 0, missedEvaders: success ? 0 : 1, successes: success ? 1 : 0 }
      : { caught: this.result?.captured ? 1 : 0 };
    return {
      kind: 'chase', success, role: this.role, station: this.st.name, reason: reason || null,
      captured: !!this.result?.captured, time: Math.round(this.timeLimit - Math.max(0, this.left)), timeLimit: this.timeLimit,
      tags: this.tags.troublemaker, tagGoal: this.tagGoal, uses: this.p.uses, careerDelta: delta,
    };
  }

  // ================================================================ 介面
  _overlays() {
    const mk = (cls) => { const d = document.createElement('div'); d.className = `ch-ov ${cls}`; this.el.prepend(d); return d; };
    this.ov = { smoke: mk('smoke'), paint: mk('paint'), flash: mk('flash'), hurt: mk('hurt') };
  }

  _buildHud() {
    const el = this.el = document.createElement('div');
    el.className = 'k-hud pre s-hud ch-hud';
    const ws = CHASE_WEAPONS[this.role];
    el.innerHTML = `
      <div class="s-card"><b data-s="name"></b><span data-s="floor"></span><em data-s="role"></em></div>
      <div class="ch-top"><div class="ch-time" data-s="time"></div><div class="ch-goal" data-s="goal"></div></div>
      <div class="ch-radar" data-s="radar"><i data-s="arrow">➤</i><span data-s="foe"></span></div>
      <div class="ch-bar"><div class="ch-stam"><i data-s="stam"></i></div>
        <div class="ch-ws">${ws.map((w, i) => `<button class="ch-w" data-key="Digit${i + 1}" data-w="${i}"><b>${w.icon}</b><span>${w.name}</span><kbd>${i + 1}</kbd><i class="cd"></i></button>`).join('')}</div></div>
      <div class="k-prompt" data-s="prompt"></div>
      <div class="k-touch">
        <div class="k-pad"><button data-hold="ArrowUp" class="u">▲</button><button data-hold="ArrowLeft" class="l">◀</button>
          <button data-hold="ArrowRight" class="r">▶</button><button data-hold="ArrowDown" class="d">▼</button></div>
        <button class="k-f" data-tg="run">跑<small>Shift</small></button>
        <button class="k-e" data-key="Space">跳<small>Space</small></button>
        <button class="k-mini" data-key="KeyT">💬</button>
        <button class="k-mini" data-key="KeyP">⚙</button>
      </div>`;
    this.g.ui.root.appendChild(el);
    this.$ = (k) => el.querySelector(`[data-s="${k}"]`);
    el.addEventListener('click', (e) => {
      const r = e.target.closest('[data-tg="run"]');
      if (r) { this.runToggle = !this.runToggle; r.classList.toggle('on', this.runToggle); }
    });
    this._renderWeapons();
  }

  _renderWeapons() {
    if (!this.el || !this.p?.cd) return;
    this.el.querySelectorAll('.ch-w').forEach((b) => b.classList.toggle('sel', +b.dataset.w === this.p.sel));
  }
  _renderList() {}

  _hud() {
    const P = this.p, A = this.ai;
    if (!A) return;
    const set = (k, v) => { const e = this.$(k); if (e && e.textContent !== v) e.textContent = v; };
    set('name', this.st.name);
    set('floor', P.stair ? `樓梯 → ${P.stair.label}` : P.floor);
    set('role', `你是:${ROLE_TITLE[this.role]}`);
    const t = Math.max(0, Math.ceil(this.left));
    set('time', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    this.$('time').classList.toggle('warn', t <= 20);
    set('goal', this.role === 'stationmaster'
      ? `用刺股逮捕不良乘客!(先電擊 / 閃光 / 讓他滑倒,再叉住)`
      : `塗鴉 ${this.tags.troublemaker} / ${this.tagGoal} · 別被站長抓到!`);
    // 對手方向(相對鏡頭)與距離、樓層
    const yaw = this.cam.yaw, dx = A.x - P.x, dz = A.z - P.z;
    const ang = Math.atan2(dx * Math.cos(yaw) + dz * Math.sin(yaw), dx * Math.sin(yaw) - dz * Math.cos(yaw));
    this.$('arrow').style.transform = `rotate(${(ang * 180 / Math.PI - 90).toFixed(1)}deg)`;
    const fl = A.stair ? '樓梯' : A.floor;
    set('foe', `${ROLE_TITLE[this.foe]} ${Math.round(Math.hypot(dx, dz))} m · ${fl}${!A.stair && A.floor !== P.floor ? '(不同樓層)' : ''}`);
    this.$('stam').style.width = `${(P.stamina * 100).toFixed(0)}%`;
    this.el.querySelectorAll('.ch-w').forEach((b, i) => {
      const w = CHASE_WEAPONS[this.role][i], cd = P.cd[w.id] || 0;
      b.querySelector('.cd').style.height = `${(cd / w.cd * 100).toFixed(0)}%`;
      b.classList.toggle('sel', i === P.sel);
    });
    const st = P.freeze > 0 ? `被閃光彈閃到,靜止 ${P.freeze.toFixed(1)} 秒` : P.slip > 0 ? '踩到香蕉皮滑倒了!' : P.stun > 0 ? '暈眩中…' : P.pin > 0 ? '被刺股叉住了!' : P.blind > 0 ? '被噴漆,看不見!' : P.smoke > 0 ? '煙霧中,看不清楚' : '';
    const html = st ? `<b>${st}</b>` : '<span><kbd>WASD</kbd> 移動</span><span><kbd>Shift</kbd> 跑</span><span><kbd>Space</kbd> 跳</span><span><kbd>1</kbd>~<kbd>4</kbd> 道具</span><span><kbd>T</kbd> 嗆聲</span>';
    if (this._lastPrompt !== html) { this.$('prompt').innerHTML = html; this._lastPrompt = html; }
  }

  begin() {
    this.g.ui.showHud(false);
    this.el.classList.remove('pre');
    this.g.ui.toast(this.role === 'stationmaster' ? '不良乘客在站內搗亂,把他抓起來!' : `塗鴉 ${this.tagGoal} 處並躲過站長!`, 'info');
  }

  dispose() {
    this.g.ui.clearBubbles?.();
    super.dispose();
  }
}
