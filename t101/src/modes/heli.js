// 直升機環景:自動環繞 101 飛行。W/S 高度、A/D 半徑、Q/E 速度、Space 懸停。跨年夜可看煙火。
import * as THREE from 'three';
import { buildHelicopter } from '../world/helicopter.js';
import { OrbitCam } from './common.js';
import { VIS } from '../ui/tutorial.js';

const clamp = THREE.MathUtils.clamp;
const SECTORS = [
  { id: 'heli_north', from: 315, to: 45 },
  { id: 'heli_east', from: 45, to: 135 },
  { id: 'heli_south', from: 135, to: 225 },
  { id: 'heli_west', from: 225, to: 315 }
];

export class HeliMode {
  constructor(game) {
    this.g = game;
    this.heli = buildHelicopter();
    this.cam = new OrbitCam(game.camera, { dist: 24, min: 10, max: 120, pitch: 0.18, pitchMin: -0.6, pitchMax: 1.3 });
    this.views = [{ name: '機艙內' }, { name: '機外追蹤' }, { name: '電影遠景' }, { name: '俯瞰' }];
    this.view = 0;
    this.look = { yaw: 0, pitch: 0 };
  }

  setView(i) {
    this.view = i;
    this.look.yaw = this.look.pitch = 0;
    this.cam.first = true;
    this.cam.yaw = 0;
    this.cam.pitch = i === 3 ? 1.2 : 0.18;
    this.cam.dist = i === 3 ? 70 : 24;
  }

  enter() {
    const g = this.g;
    g.scene.add(this.heli.group);
    g.interiors.setActive(null);
    this.a = 0.6;
    this.R = 420; this.Rs = 420;
    this.alt = 330; this.alts = 330;
    this.speed = 24; this.speeds = 24;
    this.hover = false;
    this.sector = null;
    this.saidNye = false;
    this.narrT = 6;
    this.setView(this.view);
    this.buildHud();
    const start = () => {
      g.ui.subtitle(g.audio.say('heli_welcome'), 6);
      if (g.fireworks.active) { this.R = 480; this.alt = 300; }
    };
    if (!g.tutorial.seen('heli')) this.tutorial(false, start); else start();
  }
  exit() {
    const g = this.g;
    g.scene.remove(this.heli.group);
    g.audio.setRotor(0);
    g.camera.fov = 55;
    g.camera.updateProjectionMatrix();
  }

  tutorial(force, onDone) {
    this.g.tutorial.pages('heli', [
      { title: '環景直升機', html: '直升機會<b>自動環繞台北101</b>飛行,導覽員會介紹四周的景點。選「<b>跨年夜</b>」時段時,可以在空中欣賞 101 的跨年煙火。' },
      { title: '操作', visual: VIS.heli, html: '高度 120~600 公尺、與 101 距離 140~1200 公尺都可以調整。手機請用右下角按鈕。' },
      { title: '視角', html: '右上角切換<b>機艙內/機外追蹤/電影遠景/俯瞰</b>(或按 <kbd>V</kbd>、<kbd>1</kbd>~<kbd>4</kbd>)。<br>機艙內可以<b>拖曳滑鼠</b>轉頭看四周,滾輪變焦。' }
    ], { finishLabel: force ? '繼續飛行' : '起飛', onDone });
  }

  buildHud() {
    const g = this.g;
    g.ui.hud(`
      <div class="pnl tl" style="display:flex;flex-direction:column;gap:6px;width:250px">
        <div class="small">直升機環景 · <span id="h-sec">—</span></div>
        <div style="display:flex;align-items:baseline;gap:6px"><span class="big" style="font-size:48px" id="h-alt">0</span><span class="small" style="font-size:16px">m 高度</span></div>
        <div class="kv"><span>距離 101</span><span class="num" id="h-r" style="font-size:18px">0 m</span></div>
        <div class="kv"><span>速度</span><span class="num" id="h-v" style="font-size:18px;color:var(--gold)">0 km/h</span></div>
        <div class="small" id="h-nye" style="color:var(--gold)"></div>
      </div>
      <div class="pnl br desk-only small" style="line-height:1.9"><kbd>W</kbd><kbd>S</kbd> 高度 · <kbd>A</kbd><kbd>D</kbd> 靠近/遠離 · <kbd>Q</kbd><kbd>E</kbd> 速度 · <kbd>Space</kbd> 懸停 · 拖曳轉頭</div>
      <div class="dpad touch" style="left:auto;right:16px">
        <span></span><button data-code="KeyW" aria-label="升高">▲</button><span></span>
        <button data-code="KeyA" aria-label="靠近">◀</button><button data-code="Space" aria-label="懸停">停</button><button data-code="KeyD" aria-label="遠離">▶</button>
        <button data-code="KeyQ" aria-label="減速">慢</button><button data-code="KeyS" aria-label="降低">▼</button><button data-code="KeyE" aria-label="加速">快</button>
      </div>`);
    g.ui.hudEl.querySelectorAll('[data-code]').forEach((el) => {
      const code = el.dataset.code;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); g.input.virtual(code, true); });
      const up = () => g.input.virtual(code, false);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
    });
  }

  update(dt, rawDt) {
    const g = this.g, input = g.input, ui = g.ui;
    // 控制
    if (input.is('KeyW', 'ArrowUp')) this.alt += 45 * dt;
    if (input.is('KeyS', 'ArrowDown')) this.alt -= 45 * dt;
    if (input.is('KeyA', 'ArrowLeft')) this.R -= 70 * dt;
    if (input.is('KeyD', 'ArrowRight')) this.R += 70 * dt;
    if (input.is('KeyQ')) this.speed -= 12 * dt;
    if (input.is('KeyE')) this.speed += 12 * dt;
    if (input.hit('Space')) { this.hover = !this.hover; ui.banner(this.hover ? '懸停中' : '繼續環繞', false, 1.2); }
    this.alt = clamp(this.alt, 120, 600);
    this.R = clamp(this.R, 140, 1200);
    this.speed = clamp(this.speed, 8, 60);
    const k = 1 - Math.pow(0.15, dt);
    this.alts += (this.alt - this.alts) * k;
    this.Rs += (this.R - this.Rs) * k;
    this.speeds += ((this.hover ? 0 : this.speed) - this.speeds) * (1 - Math.pow(0.3, dt));
    this.a += (this.speeds / this.Rs) * dt;

    // 位置與姿態(機頭朝切線方向,向內側傾斜)
    const pos = new THREE.Vector3(Math.sin(this.a) * this.Rs, this.alts + Math.sin(g.t * 0.8) * 0.6, Math.cos(this.a) * this.Rs);
    const fwd = new THREE.Vector3(Math.cos(this.a), 0, -Math.sin(this.a));
    const inward = pos.clone().setY(0).normalize().negate();
    const bank = Math.atan((this.speeds * this.speeds) / (this.Rs * 9.8));
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(inward, Math.tan(bank)).normalize();
    const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const up2 = new THREE.Vector3().crossVectors(fwd, right);
    const m = new THREE.Matrix4().makeBasis(right, up2, fwd);
    const H = this.heli.group;
    H.position.copy(pos);
    H.quaternion.setFromRotationMatrix(m);
    H.rotateX(0.02 + this.speeds * 0.0025); // 前進時機頭微低
    this.heli.update(g.t);
    g.audio.setRotor(1);
    g.focusShadow(pos);

    // 攝影機
    const cam = g.camera;
    const towerY = clamp(this.alts * 0.9, 80, 470);
    if (this.view === 0) {
      // 機艙內:副駕駛座,預設看向 101
      this.look.yaw -= input.drag.dx * 0.004;
      this.look.pitch = clamp(this.look.pitch - input.drag.dy * 0.004, -1.0, 0.8);
      if (input.wheel) cam.fov = clamp(cam.fov * (input.wheel > 0 ? 1.1 : 0.9), 20, 75);
      H.updateMatrixWorld(true);
      const eye = new THREE.Vector3(0.45, 2.2, 1.0).applyMatrix4(H.matrixWorld);
      const to = new THREE.Vector3(0, towerY, 0).sub(eye).normalize();
      const yaw = Math.atan2(to.x, to.z) + this.look.yaw;
      const pitch = Math.asin(to.y) + this.look.pitch;
      cam.position.copy(eye);
      cam.lookAt(eye.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))));
    } else if (this.view === 1) {
      this.cam.handle(input);
      this.cam.update(rawDt, pos.clone().add(new THREE.Vector3(0, 2, 0)), Math.atan2(fwd.x, fwd.z) + Math.PI);
    } else if (this.view === 2) {
      // 電影遠景:軌道外側,把直升機與 101 一起入鏡
      const outward = inward.clone().negate();
      const want = pos.clone().addScaledVector(outward, 90).addScaledVector(fwd, -60).add(new THREE.Vector3(0, 25, 0));
      if (!this.cineInit) { cam.position.copy(want); this.cineInit = true; }
      cam.position.lerp(want, 1 - Math.pow(0.05, rawDt));
      cam.lookAt(pos.clone().lerp(new THREE.Vector3(0, towerY, 0), 0.35));
    } else {
      this.cam.handle(input);
      this.cam.update(rawDt, pos, Math.atan2(fwd.x, fwd.z) + Math.PI);
    }
    if (this.view !== 2) this.cineInit = false;
    if (this.view !== 0 && cam.fov !== 55) { cam.fov = 55; }
    cam.updateProjectionMatrix();
    H.visible = true;

    // 旁白:依所在方位
    const deg = ((Math.atan2(pos.x, -pos.z) * 180) / Math.PI + 360) % 360;
    const sec = SECTORS.find((s) => (s.from > s.to ? deg >= s.from || deg < s.to : deg >= s.from && deg < s.to));
    const names = { heli_north: '101 北側', heli_east: '101 東側', heli_south: '101 南側', heli_west: '101 西側' };
    ui.set('h-sec', names[sec.id]);
    this.narrT -= rawDt;
    if (sec.id !== this.sector && this.narrT <= 0) {
      this.sector = sec.id;
      this.narrT = 14;
      ui.subtitle(g.audio.say(Math.random() < 0.25 && this.alts > 300 ? 'heli_damper' : sec.id), 7);
    }
    // 跨年
    const fw = g.fireworks;
    if (fw.active) {
      const st = fw.status();
      ui.set('h-nye', st.phase === 'countdown' ? `跨年倒數 ${Math.ceil(st.remain)} 秒` : st.phase === 'show' ? '跨年煙火施放中' : `下一輪倒數 ${Math.ceil(st.remain)} 秒`);
      if (st.phase === 'countdown' && st.remain < 20 && !this.saidNye) { this.saidNye = true; ui.subtitle(g.audio.say('heli_nye'), 6); }
      if (st.phase === 'countdown' && st.remain <= 10) ui.big(String(Math.ceil(st.remain)));
      else if (st.phase === 'show' && st.t < 3) ui.big('2027');
      else ui.big('');
      if (st.phase === 'pause') this.saidNye = false;
    }
    ui.set('h-alt', Math.round(pos.y));
    ui.set('h-r', `${Math.round(this.Rs)} m`);
    ui.set('h-v', `${Math.round(this.speeds * 3.6)} km/h${this.hover ? ' · 懸停' : ''}`);
    return null;
  }
}
