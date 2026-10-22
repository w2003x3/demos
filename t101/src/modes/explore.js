// 樓層導覽:在 5F/35F/88F/89F 走動、互動,搭高速電梯往返。跨年夜可在窗邊看煙火。
import * as THREE from 'three';
import { DESTS, floorY } from '../config.js';
import { createCharacter, poseIdle, poseWalk, poseLean } from '../world/character.js';
import { makeRide } from '../world/elevator.js';
import { OrbitCam } from './common.js';

const clamp = THREE.MathUtils.clamp;
const ARRIVE = { 5: 'arrive_5', 35: 'arrive_35', 88: 'arrive_88', 89: 'arrive_89' };

export class ExploreMode {
  constructor(game) {
    this.g = game;
    this.char = createCharacter({ shirt: 0x3b5b8c, pants: 0x22252b, hair: 0x1b1612, shoes: 0xeeeeee });
    this.cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.13, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
    this.cup.position.set(0, -0.32, 0.05);
    this.cup.visible = false;
    this.char.arms.R.elbow.children[0].add(this.cup);
    this.cam = new OrbitCam(game.camera, { dist: 4.2, min: 1.2, max: 9, pitch: 0.25, pitchMin: -0.3, pitchMax: 1.1 });
  }

  enter(opts = {}) {
    const g = this.g;
    g.scene.add(this.char.root);
    this.cup.visible = false;
    this.state = 'walk';
    this.arrive(opts.floor || 5, true);
    this.buildHud();
  }
  exit() {
    const g = this.g;
    g.scene.remove(this.char.root);
    g.interiors.setActive(null);
    g.camera.fov = 55;
    g.camera.updateProjectionMatrix();
    g.audio.setHum(0);
    g.audio.setMurmur(0);
  }

  buildHud() {
    const g = this.g;
    g.ui.hud(`
      <div class="pnl tl" style="display:flex;flex-direction:column;gap:4px;min-width:220px">
        <div class="small">目前位置</div>
        <div style="font-size:22px;font-weight:900" id="e-name"></div>
        <div class="kv small"><span id="e-alt"></span><span id="e-nye" style="color:var(--gold)"></span></div>
      </div>
      <div class="pnl br desk-only small" style="line-height:1.8"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 走動 · <kbd>Shift</kbd> 快走 · <kbd>E</kbd> 互動 · 拖曳轉視角</div>
      <div class="dpad touch">
        <span></span><button data-code="KeyW" aria-label="前">▲</button><span></span>
        <button data-code="KeyA" aria-label="左">◀</button><button data-code="KeyE" aria-label="互動">E</button><button data-code="KeyD" aria-label="右">▶</button>
        <span></span><button data-code="KeyS" aria-label="後">▼</button><span></span>
      </div>`);
    g.ui.hudEl.querySelectorAll('[data-code]').forEach((el) => {
      const code = el.dataset.code;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); g.input.virtual(code, true); });
      const up = () => g.input.virtual(code, false);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
    });
    this.refreshHud();
  }
  refreshHud() {
    const f = this.floor;
    this.g.ui.set('e-name', f.name);
    this.g.ui.set('e-alt', `${f.n}F · 海拔約 ${Math.round(f.y)} 公尺`);
  }

  arrive(n, instant = false) {
    const g = this.g;
    this.floor = g.interiors.floors[n];
    g.interiors.setActive(n);
    const sp = this.floor.spawn;
    this.pos = new THREE.Vector3(sp.x, this.floor.y, sp.z);
    this.heading = 0;
    this.cam.yaw = Math.PI; // 從角色後方看
    this.cam.first = true;
    this.doorT = instant ? 0 : 1;
    this.openDoor = this.floor.doors[0];
    if (!instant) {
      g.audio.ding();
      g.audio.say(ARRIVE[n]);
      g.ui.banner(this.floor.name, false, 3);
    }
    g.audio.setMurmur(n === 35 || n === 88 ? 1 : 0.5);
    if (this.hudReady !== false) this.refreshHud?.();
  }

  // ── 碰撞 ──
  blocked(x, z, r = 0.3) {
    const f = this.floor;
    if (Math.abs(x) > f.hw - 0.45 - r || Math.abs(z) > f.hw - 0.45 - r) return true;
    for (const c of f.colliders) {
      if (c.type === 'box') { if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true; }
      else if (Math.hypot(x - c.x, z - c.z) < c.r + r) return true;
    }
    return false;
  }

  update(dt, rawDt) {
    const g = this.g, input = g.input, ui = g.ui;
    if (this.state === 'ride') return this.updateRide(dt, rawDt);
    if (this.state === 'telescope') return this.updateTelescope(dt);
    if (this.state === 'menu') { this.cam.update(rawDt, this.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), this.heading); return null; }

    // 電梯門開啟動畫
    if (this.doorT > 0) {
      this.doorT = Math.max(0, this.doorT - dt * 0.8);
      for (const d of this.floor.doors) d.setOpen(d === this.openDoor ? Math.min(1, this.doorT * 2) : 0);
    }
    // 移動(相對攝影機方向)
    this.cam.handle(input);
    const fwd = (input.is('KeyW', 'ArrowUp') ? 1 : 0) - (input.is('KeyS', 'ArrowDown') ? 1 : 0);
    const side = (input.is('KeyD', 'ArrowRight') ? 1 : 0) - (input.is('KeyA', 'ArrowLeft') ? 1 : 0);
    const camYaw = this.cam.yaw + this.heading0();
    const moving = fwd || side;
    if (moving) {
      const ang = Math.atan2(side, fwd);
      const dir = camYaw + Math.PI - ang;
      const sp = (input.is('ShiftLeft', 'ShiftRight') ? 2.6 : 1.4) * dt;
      const nx = this.pos.x + Math.sin(dir) * sp, nz = this.pos.z + Math.cos(dir) * sp;
      if (!this.blocked(nx, this.pos.z)) this.pos.x = nx;
      if (!this.blocked(this.pos.x, nz)) this.pos.z = nz;
      let d = dir - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 10);
      this.walkPhase = (this.walkPhase || 0) + sp * 4.2;
      if (Math.floor(this.walkPhase / Math.PI) !== Math.floor((this.walkPhase - sp * 4.2) / Math.PI)) g.audio.step();
      poseWalk(this.char, this.walkPhase, input.is('ShiftLeft', 'ShiftRight') ? 0.6 : 0.15);
    } else if (this.leaning) poseLean(this.char, g.t);
    else poseIdle(this.char, g.t);
    if (moving) this.leaning = false;
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.set(0, this.heading, 0);

    // 互動
    let best = null, bd = 1e9;
    for (const it of this.floor.interact) {
      const d = Math.hypot(this.pos.x - it.x, this.pos.z - it.z);
      if (d < it.r && d < bd) { best = it; bd = d; }
    }
    ui.prompt(best ? `<kbd>E</kbd> ${best.label}` : '');
    if (best && input.hit('KeyE')) this.interact(best);

    // 攝影機(限制在室內)
    const head = this.pos.clone().add(new THREE.Vector3(0, 1.55, 0));
    this.cam.update(rawDt, head, this.heading0());
    this.clampCamera(head);
    g.focusShadow(this.pos);

    // 跨年
    const fw = g.fireworks;
    if (fw.active) {
      const st = fw.status();
      const txt = st.phase === 'countdown' ? `跨年倒數 ${Math.ceil(st.remain)} 秒` : st.phase === 'show' ? '跨年煙火施放中 · 到窗邊欣賞' : `下一輪倒數 ${Math.ceil(st.remain)} 秒`;
      ui.set('e-nye', txt);
      this.nyeVoice(st);
    }
    return null;
  }

  heading0() { return 0; }

  nyeVoice(st) {
    const g = this.g;
    if (st.phase === 'countdown' && st.remain < 10.6 && !this.saidCount) { this.saidCount = true; g.audio.say('nye_10'); }
    if (st.phase === 'countdown' && st.remain <= 10) g.ui.big(String(Math.ceil(st.remain)));
    if (st.phase === 'show' && !this.saidHappy) { this.saidHappy = true; g.ui.big(''); g.audio.say('nye_happy'); g.audio.cheer(); g.ui.banner('新年快樂!2027', false, 4); }
    if (st.phase === 'pause') { this.saidCount = false; this.saidHappy = false; }
  }

  clampCamera(head) {
    const cam = this.g.camera, f = this.floor;
    const p = cam.position;
    // 由頭部往攝影機逐步檢查,碰到牆或障礙就拉近
    const dir = p.clone().sub(head);
    const len = dir.length();
    dir.normalize();
    let ok = len;
    for (let s = 0.3; s < len; s += 0.15) {
      const x = head.x + dir.x * s, z = head.z + dir.z * s, y = head.y + dir.y * s;
      if (Math.abs(x) > f.hw - 0.2 || Math.abs(z) > f.hw - 0.2 || y > f.y + f.ceil - 0.15 || y < f.y + 0.2 || this.inBox(x, z)) { ok = s - 0.15; break; }
    }
    p.copy(head).addScaledVector(dir, Math.max(0.25, ok));
    cam.lookAt(head);
  }
  inBox(x, z) {
    for (const c of this.floor.colliders) if (c.type === 'box' && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && (c.maxX - c.minX) > 3) return true;
    return false;
  }

  interact(it) {
    const g = this.g, ui = g.ui;
    switch (it.id) {
      case 'elevator': this.openLiftMenu(it); break;
      case 'order-sbux':
        g.audio.steam();
        ui.subtitle(g.audio.say('sbux_order') || '歡迎光臨!您的那堤好了,請慢用。');
        this.cup.visible = true;
        ui.banner('獲得:那堤(大杯)', false, 2.5);
        break;
      case 'order-kaffa':
        g.audio.steam();
        ui.subtitle(g.audio.say('kaffa_order') || '這是我們的招牌手沖咖啡。');
        this.cup.visible = true;
        ui.banner('獲得:興波招牌手沖', false, 2.5);
        break;
      case 'damper':
        ui.subtitle(g.audio.say('damper_info'), 8);
        this.leaning = true;
        break;
      case 'typhoon':
        g.interiors.sway.boost = 0.9;
        ui.subtitle(g.audio.say('typhoon'), 4);
        ui.banner('颱風模擬:阻尼器擺幅放大', true, 3);
        break;
      case 'telescope':
        this.state = 'telescope';
        this.scope = { yaw: it.look + Math.PI, pitch: -0.08, it };
        ui.prompt('');
        ui.hud(`<div class="pnl tc">望遠鏡 · 拖曳轉動、滾輪變焦 · 按 <kbd>E</kbd> 離開</div>
          <div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 50%, transparent 0 36%, rgba(0,0,0,.92) 38%)"></div>`);
        this.scopeFov = 14;
        break;
      case 'stamp': {
        const n = g.store.get('stamps', 0) + 1;
        g.store.set('stamps', n);
        ui.subtitle(g.audio.say('stamp'));
        ui.banner(`蓋好紀念章(累計 ${n} 枚)`, false, 2.5);
        break;
      }
      case 'ticket':
        ui.subtitle(g.audio.say('ticket'));
        ui.banner('已購買觀景台門票', false, 2);
        break;
      case 'window':
        this.leaning = true;
        ui.banner('35 樓的信義區街景', false, 2);
        break;
    }
  }

  updateTelescope(dt) {
    const g = this.g, input = g.input, cam = g.camera, s = this.scope;
    s.yaw -= input.drag.dx * 0.002 * (this.scopeFov / 40);
    s.pitch = clamp(s.pitch - input.drag.dy * 0.002 * (this.scopeFov / 40), -0.7, 0.3);
    if (input.wheel) this.scopeFov = clamp(this.scopeFov * (input.wheel > 0 ? 1.15 : 0.87), 3, 40);
    const it = s.it;
    cam.position.set(it.x + Math.sin(it.look) * 0.6, this.floor.y + 1.6, it.z + Math.cos(it.look) * 0.6);
    cam.fov = this.scopeFov;
    cam.updateProjectionMatrix();
    cam.lookAt(cam.position.clone().add(new THREE.Vector3(Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), Math.cos(s.yaw) * Math.cos(s.pitch))));
    poseLean(this.char, g.t);
    if (input.hit('KeyE')) this.leaveTelescope();
    void dt;
    return null;
  }
  leaveTelescope() {
    const cam = this.g.camera;
    cam.fov = 55;
    cam.updateProjectionMatrix();
    this.state = 'walk';
    this.buildHud();
  }

  openLiftMenu(it) {
    const g = this.g;
    this.state = 'menu';
    this.openDoor = it.door;
    g.ui.prompt('');
    const layer = g.ui.modal(`
      <div class="modal" role="dialog" aria-label="高速電梯">
        <h2>高速電梯</h2>
        <div style="color:var(--muted);font-size:14px">上行分速 1010 公尺 · 5F → 89F 約 37 秒</div>
        <div class="lift-panel">
          ${DESTS.map((d) => `<button class="lift-btn ${d.floor === this.floor.n ? 'cur' : ''}" data-f="${d.floor}" ${d.floor === this.floor.n ? 'disabled' : ''}>${d.floor}F<small>${d.short}</small></button>`).join('')}
        </div>
        <button class="btn" id="l-cancel">取消</button>
      </div>`);
    layer.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { g.ui.modal(''); this.startRide(Number(b.dataset.f)); }));
    layer.querySelector('#l-cancel').addEventListener('click', () => { g.ui.modal(''); this.state = 'walk'; });
    layer.querySelector('[data-f]:not([disabled])').focus();
  }

  startRide(to) {
    const g = this.g;
    this.ride = makeRide(this.floor.n, to);
    this.rideT = -2.2; // 關門 + 起步前
    this.state = 'ride';
    this.cup.visible = this.cup.visible && Math.random() < 1;
    g.elevator.setDoors(1);
    g.ui.hud(`
      <div class="pnl tl" style="display:flex;flex-direction:column;gap:6px;width:260px">
        <div class="small">高速電梯 ${this.ride.from}F → ${to}F</div>
        <div style="display:flex;align-items:baseline;gap:8px"><span class="big" style="font-size:64px" id="v-f">${this.ride.from}</span><span class="big" style="font-size:28px;color:var(--muted)">F</span></div>
        <div class="kv"><span>速度</span><span class="num" style="font-size:20px;color:var(--gold)" id="v-s">0 m/min</span></div>
        <div class="kv"><span>剩餘</span><span class="num" style="font-size:20px" id="v-r">${this.ride.T.toFixed(0)} 秒</span></div>
        <div class="meter"><i id="v-p" style="width:0%"></i></div>
      </div>`);
    const line = to > this.floor.n ? (this.floor.n === 5 && to === 89 ? 'elev_up' : 'elev_up_short') : 'elev_down';
    setTimeout(() => this.state === 'ride' && g.ui.subtitle(g.audio.say(line)), 600);
    this.earSaid = false;
  }

  updateRide(dt, rawDt) {
    const g = this.g, ui = g.ui, E = g.elevator;
    this.rideT += dt;
    const r = this.ride;
    // 0~-2.2:關門
    if (this.rideT < 0) E.setDoors(clamp(-this.rideT / 2.2 - 0.1, 0, 1));
    else E.setDoors(0);
    const st = r.state(Math.max(0, this.rideT));
    const speedK = st.v / 16.8;
    g.audio.setHum(this.rideT > 0 && !st.done ? speedK : 0);
    if (!this.earSaid && this.rideT > 9 && r.dir > 0 && r.T > 25) { this.earSaid = true; ui.subtitle(g.audio.say('elev_ear'), 6); }
    if ((this._dT = (this._dT || 0) + rawDt) > 0.1) {
      this._dT = 0;
      E.drawDisplay(st.floor, st.v * 60, this.rideT > 0 && !st.done ? r.dir : 0);
    }
    E.update(g.t, speedK);
    ui.set('v-f', st.floor);
    ui.set('v-s', `${Math.round(st.v * 60)} m/min`);
    ui.set('v-r', `${Math.max(0, r.T - Math.max(0, this.rideT)).toFixed(0)} 秒`);
    ui.style('v-p', 'width', `${clamp(this.rideT / r.T, 0, 1) * 100}%`);
    // 到站:開門 → 淡出 → 抵達樓層
    if (st.done) {
      const after = this.rideT - r.T;
      E.setDoors(clamp(after / 1.5, 0, 1));
      if (after > 0.05 && !this.dinged) { this.dinged = true; g.audio.ding(); }
      if (after > 1.6) ui.fade(clamp((after - 1.6) / 0.5, 0, 1));
      if (after > 2.2) {
        this.dinged = false;
        this.state = 'walk';
        this.arrive(r.to);
        this.buildHud();
        g.audio.setHum(0);
        setTimeout(() => ui.fade(0), 50);
      }
    }
    return { scene: E.scene, camera: E.camera };
  }
}
