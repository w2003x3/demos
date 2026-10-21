// 車站巡覽:在真實車站場景裡自由走動(站長、不良乘客共用的場景與移動)。
// 操作:WASD/方向鍵移動(相對鏡頭)、滑鼠/手指拖曳轉視角、V 第一/第三人稱、M 切換關卡變化(一般/迷宮化/障礙物)、
//       右側清單可瞬間移動到重點位置;走進樓梯會自動上下樓。Esc/P 暫停,「離開」回選單。
import * as THREE from 'three';
import { TRAIN_TYPES } from '../config/trains.js';
import { buildTaipei } from '../world/stations/taipei.js';
import { buildKaohsiung } from '../world/stations/kaohsiung.js';
import { buildTaichung } from '../world/stations/taichung.js';
import { buildTainan } from '../world/stations/tainan.js';
import { buildKeelung } from '../world/stations/keelung.js';
import { buildYilan } from '../world/stations/yilan.js';
import { pickPerson } from '../core/assets.js';

export const STATION_BUILDERS = { taipei: buildTaipei, kaohsiung: buildKaohsiung, taichung: buildTaichung, tainan: buildTainan, keelung: buildKeelung, yilan: buildYilan };
const VARIANTS = { normal: '一般', maze: '迷宮化', obstacle: '障礙物' };
export const R_P = 0.3, SPEED = 3.2;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class StationExplorePhase {
  constructor(game, cfg) {
    this.g = game;
    this.cfg = cfg;
    this.ownHud = true;
    this.variant = cfg.variant || 'normal';
  }

  prepTitle() { return { title: `${this.cfg.title}・場景載入中`, sub: '車站巡覽', go: '進入車站' }; }
  prepItems() { return [{ id: 'x', name: this.cfg.title, price: 0, desc: this.cfg.desc || '', dishes: this.cfg.features || [] }]; }
  async prepThumbs() { return {}; }

  async init() {
    const g = this.g;
    this.assets = await g.loadAssets(TRAIN_TYPES.EMU3000);
    this.root = new THREE.Group();
    g.scene.add(this.root);
    this._env = { bg: g.scene.background, env: g.scene.environment, ei: g.scene.environmentIntensity, fog: g.scene.fog };
    await this._build();
    // 玩家:寫實人物(面向 -Z → 外層以 angle 轉向,前方 = (cos a, 0, -sin a))
    const ppl = this.assets.people;
    const body = ppl ? ppl[pickPerson(ppl, Math.random)].stand.clone() : this.assets.passengerStand.clone(true);
    body.rotation.y = -Math.PI / 2;
    this.me = new THREE.Group();
    this.me.add(body);
    this.root.add(this.me);
    this.cam = { yaw: this.st.spawn.yaw ?? 0, pitch: 0.32, mode: 'third', dist: 6 };
    this._buildHud();
    this._bindLook();
    this.time = 0;
  }

  async _build() {
    if (this.st) this.root.remove(this.st.group);
    const build = STATION_BUILDERS[this.cfg.station];
    this.st = build({ assets: this.assets, variant: this.variant, quality: this.g.quality });
    this.root.add(this.st.group);
    const g = this.g;
    if (this.st.sky === 'day' && this.assets.rail) {
      const env = await this.assets.rail.environment('day', g.renderer).catch(() => null);
      if (env) { g.scene.background = env.background; g.scene.environment = env.envMap; g.scene.environmentIntensity = 0.7; }
    } else {
      g.scene.background = new THREE.Color('#191b1f');
      g.scene.environmentIntensity = 0.6;
    }
    g.scene.fog = null;
    const s = this.st.spawn;
    this.p = { floor: s.floor, x: s.x, z: s.z, y: this.st.floors[s.floor].y, angle: s.ry ?? 0, stair: null, vel: 0 };
    this.cam && (this.cam.yaw = s.yaw ?? 0);
  }

  begin() {
    this.g.ui.showHud(false);
    this.el.classList.remove('pre');
    this.g.ui.toast(`${this.st.name}:WASD 移動、拖曳轉視角、V 切換視角、M 切換關卡變化`, 'info');
  }

  dispose() {
    const g = this.g;
    g.scene.remove(this.root);
    g.scene.background = this._env.bg; g.scene.environment = this._env.env; g.scene.environmentIntensity = this._env.ei; g.scene.fog = this._env.fog;
    g.camera.fov = 62; g.camera.updateProjectionMatrix();
    this.el.remove();
    removeEventListener('pointermove', this._mv); removeEventListener('pointerup', this._up);
    g.renderer.domElement.removeEventListener('pointerdown', this._dn);
  }

  // ---------------------------------------------------------------- 碰撞與樓層
  _free(floor, x, z) {
    const f = this.st.floors[floor];
    if (!f) return false;
    // 身體四周的點各自落在任一可走範圍內即可(相鄰的範圍可以跨越)
    const inAny = (px, pz) => f.bounds.some(([x0, z0, x1, z1]) => px > x0 && px < x1 && pz > z0 && pz < z1);
    if (!inAny(x - R_P, z) || !inAny(x + R_P, z) || !inAny(x, z - R_P) || !inAny(x, z + R_P)) return false;
    // 低矮障礙(有高度 h)跳到 h 以上就不擋
    const lift = (this.p?.jy || 0) + 0.05;
    return !(this.st.solids[floor] || []).some((s) => (s[4] == null || s[4] > lift) && x > s[0] - R_P && x < s[2] + R_P && z > s[1] - R_P && z < s[3] + R_P);
  }
  _inBox(b, x, z, pad = 0) { return x > b[0] - pad && x < b[2] + pad && z > b[1] - pad && z < b[3] + pad; }

  /** 嘗試移動到 (x,z):處理樓梯進出 */
  _tryMove(x, z) {
    const P = this.p;
    if (P.stair) {
      const s = P.stair;
      if (s.axis === 'z' && (x < s.box[0] + R_P || x > s.box[2] - R_P)) x = P.x;   // 樓梯兩側有扶手
      if (s.axis === 'x' && (z < s.box[1] + R_P || z > s.box[3] - R_P)) z = P.z;
      const c = s.axis === 'z' ? z : x;
      const t = (c - s.a) / (s.b - s.a);
      // 走出樓梯:落點沿樓梯方向再往外推一個身體半徑(避免卡在樓梯口的牆角)
      const out = (end, floor, y, sgn) => {
        const d = Math.sign(s.b - s.a) * sgn * (R_P + 0.05);
        const nx = s.axis === 'x' ? end + d : x, nz = s.axis === 'z' ? end + d : z;
        if (this._free(floor, nx, nz)) { P.stair = null; P.floor = floor; P.y = y; P.x = nx; P.z = nz; return true; }
        return false;
      };
      if (t < 0) { out(s.a, s.fromFloor, s.yA, -1); return; }
      if (t > 1) { if (out(s.b, s.toFloor, s.yB, 1)) this._floorToast(); return; }
      P.x = x; P.z = z; P.y = s.yA + (s.yB - s.yA) * t;
      return;
    }
    // 進入樓梯:在起點或終點那一端(位置夾進樓梯範圍內,避免一進來就判定走出去)
    for (const s of this.st.stairs) {
      if (!this._inBox(s.box, x, z, R_P + 0.05)) continue;
      const c = s.axis === 'z' ? z : x;
      const t = (c - s.a) / (s.b - s.a);
      if ((P.floor === s.fromFloor && t < 0.12) || (P.floor === s.toFloor && t > 0.88)) {
        const tt = Math.min(0.995, Math.max(0.005, t)), along = s.a + (s.b - s.a) * tt;
        const clampX = (v) => Math.min(s.box[2] - R_P - 0.01, Math.max(s.box[0] + R_P + 0.01, v));
        const clampZ = (v) => Math.min(s.box[3] - R_P - 0.01, Math.max(s.box[1] + R_P + 0.01, v));
        P.stair = s;
        P.x = s.axis === 'x' ? along : clampX(x);
        P.z = s.axis === 'z' ? along : clampZ(z);
        P.y = s.yA + (s.yB - s.yA) * tt;
        if (P.floor === s.fromFloor && !this._quiet) this.g.ui.toast(`往 ${s.label}`, 'info');
        return;
      }
    }
    if (this._free(P.floor, x, P.z)) P.x = x;
    if (this._free(P.floor, P.x, z)) P.z = z;
  }

  _floorToast() { if (!this._quiet) this.g.ui.toast(`${this.st.name} · ${this.p.floor}`, 'info'); }

  // ---------------------------------------------------------------- 主更新
  update(dt) {
    const inp = this.g.input, P = this.p, c = this.cam;
    this.time += dt;
    if (inp.wasPressed('KeyV')) c.mode = c.mode === 'first' ? 'third' : 'first';
    if (inp.wasPressed('KeyM')) this._cycleVariant();
    if (this._leave) return { kind: 'explore', success: true };
    let f = 0, s = 0;
    if (inp.isDown('KeyW', 'ArrowUp')) f += 1;
    if (inp.isDown('KeyS', 'ArrowDown')) f -= 1;
    if (inp.isDown('KeyA', 'ArrowLeft')) s -= 1;
    if (inp.isDown('KeyD', 'ArrowRight')) s += 1;
    const yaw = c.yaw;
    if (f || s) {
      // 鏡頭前方 (sin, -cos)、右方 (cos, sin)
      let dx = Math.sin(yaw) * f + Math.cos(yaw) * s, dz = -Math.cos(yaw) * f + Math.sin(yaw) * s;
      const l = Math.hypot(dx, dz);
      dx /= l; dz /= l;
      const v = SPEED * (inp.isDown('ShiftLeft', 'ShiftRight') ? 1.8 : 1);
      this._tryMove(P.x + dx * v * dt, P.z + dz * v * dt);
      const target = Math.atan2(-dz, dx);
      let da = target - P.angle; da = Math.atan2(Math.sin(da), Math.cos(da));
      P.angle += da * Math.min(1, dt * 10);
      P.vel = v;
    } else P.vel = 0;
    this.me.position.set(P.x, P.y + (P.vel ? Math.abs(Math.sin(this.time * 9)) * 0.03 : 0), P.z);
    this.me.rotation.y = P.angle;
    this._camera(dt);
    this._hud();
    return null;
  }

  _camera(dt) {
    const cam = this.g.camera, P = this.p, c = this.cam;
    this.me.visible = c.mode !== 'first';
    const head = new THREE.Vector3(P.x, P.y + 1.6, P.z);
    const fwd = new THREE.Vector3(Math.sin(c.yaw), 0, -Math.cos(c.yaw));
    let pos, look;
    if (c.mode === 'first') {
      pos = head.clone();
      look = head.clone().addScaledVector(fwd, 3).add(new THREE.Vector3(0, -Math.tan(c.pitch - 0.25) * 3, 0));
      cam.fov = 70;
    } else {
      // 室內低天花(如 B1 淨高 3.4 m)時鏡頭拉近、壓低
      const ceil = (this.st.ceil?.[P.stair ? P.stair.toFloor : P.floor] ?? 99) - P.y;
      const dist = ceil < 6 ? 3.6 : c.dist, up = Math.min(ceil - 1.3, 1.2 + Math.sin(c.pitch) * dist);
      pos = head.clone().addScaledVector(fwd, -Math.cos(c.pitch) * dist).add(new THREE.Vector3(0, up - 1.2 + 0.6, 0));
      look = head.clone().add(new THREE.Vector3(0, -0.2, 0));
      cam.fov = 60;
    }
    cam.position.lerp(pos, Math.min(1, dt * 10));
    cam.lookAt(look);
    cam.updateProjectionMatrix();
  }

  _bindLook() {
    const el = this.g.renderer.domElement;
    let drag = null;
    this._dn = (e) => { drag = { x: e.clientX, y: e.clientY, yaw: this.cam.yaw, pitch: this.cam.pitch }; };
    this._mv = (e) => {
      if (!drag) return;
      this.cam.yaw = drag.yaw + (e.clientX - drag.x) * 0.006;
      this.cam.pitch = Math.max(-0.4, Math.min(1.2, drag.pitch + (e.clientY - drag.y) * 0.004));
    };
    this._up = () => { drag = null; };
    el.addEventListener('pointerdown', this._dn);
    addEventListener('pointermove', this._mv);
    addEventListener('pointerup', this._up);
  }

  async _cycleVariant() {
    const keys = Object.keys(VARIANTS);
    this.variant = keys[(keys.indexOf(this.variant) + 1) % keys.length];
    this.g.ui.toast(`關卡變化:${VARIANTS[this.variant]}(重建中…)`, 'info');
    await this._build();
    this._renderList();
  }

  // ---------------------------------------------------------------- 介面
  _buildHud() {
    const el = this.el = document.createElement('div');
    el.className = 'k-hud pre s-hud';
    el.innerHTML = `
      <div class="s-card"><b data-s="name"></b><span data-s="floor"></span><em data-s="var"></em></div>
      <div class="k-stations s-list" data-s="list"></div>
      <div class="k-prompt" data-s="prompt"></div>
      <div class="k-touch">
        <div class="k-pad"><button data-hold="ArrowUp" class="u">▲</button><button data-hold="ArrowLeft" class="l">◀</button>
          <button data-hold="ArrowRight" class="r">▶</button><button data-hold="ArrowDown" class="d">▼</button></div>
        <button class="k-f" data-key="KeyV">V<small>視角</small></button>
        <button class="k-e" data-key="KeyM">M<small>變化</small></button>
        <button class="k-mini k-stbtn" data-tg="st">☰</button>
        <button class="k-mini" data-key="KeyP">⚙</button>
      </div>`;
    this.g.ui.root.appendChild(el);
    this.$ = (k) => el.querySelector(`[data-s="${k}"]`);
    el.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]');
      if (go) {
        const [fl, x, z] = go.dataset.go.split('|');
        Object.assign(this.p, { floor: fl, x: +x, z: +z, y: this.st.floors[fl].y, stair: null });
        el.classList.remove('show-st');
      }
      if (e.target.closest('[data-tg="st"]')) el.classList.toggle('show-st');
      if (e.target.closest('[data-leave]')) this._leave = true;
    });
    this._renderList();
  }

  _renderList() {
    const items = [...this.st.poi.map((p) => ({ ...p, kind: '景點' })), ...this.st.exits.map((p) => ({ ...p, kind: '出口' }))];
    this.$('list').innerHTML = `<div class="lbl">移動到(點一下)</div>${items.map((p) => `<button class="k-st" data-go="${p.floor}|${p.x}|${p.z}"><span>${esc(p.name)}</span><em>${p.kind} · ${p.floor}</em></button>`).join('')}
      <button class="k-st" data-leave="1"><span>離開車站</span><em>回選單</em></button>`;
  }

  _hud() {
    const P = this.p;
    const set = (k, v) => { const e = this.$(k); if (e.textContent !== v) e.textContent = v; };
    set('name', this.st.name);
    set('floor', P.stair ? `樓梯 → ${P.stair.label}` : P.floor);
    set('var', `關卡變化:${VARIANTS[this.variant]}`);
    const near = this.st.exits.find((x) => x.floor === P.floor && Math.hypot(x.x - P.x, x.z - P.z) < 3);
    const html = near ? `<b>${esc(near.name)}</b>` : '<span><kbd>WASD</kbd> 移動</span><span>拖曳 轉視角</span><span><kbd>V</kbd> 視角</span><span><kbd>M</kbd> 關卡變化</span>';
    if (this._lastPrompt !== html) { this.$('prompt').innerHTML = html; this._lastPrompt = html; }
  }
}
