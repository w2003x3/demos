// 跨年煙火:101 外牆倒數 + 從各節竹節施放的煙火秀。
import * as THREE from 'three';
import { BASE_TOP, SEG_H, SEG_COUNT, SEG_HW1, halfWidthAt } from '../config.js?v=4ec109e';
import { canvasTex } from './textures.js?v=4ec109e';

const MAX = 40000;
const COUNTDOWN = 30; // 倒數階段長度(秒)
const SHOW = 200; // 煙火秀長度
const PAUSE = 25;
export const NEW_YEAR = 2027;

const PALETTE = [
  [1, 0.25, 0.2], [1, 0.75, 0.25], [0.3, 0.6, 1], [0.4, 1, 0.5], [1, 0.4, 0.9], [1, 1, 1], [1, 0.85, 0.5], [0.6, 0.4, 1]
];

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** 產生整場煙火的發射排程:[{ t, seg, face, x, type, color }]。 */
function makeSchedule() {
  const r = rng(2027);
  const ev = [];
  const faces = [0, 1, 2, 3];
  let t = 0.2;
  while (t < SHOW - 6) {
    const phase = t / SHOW;
    const pattern = Math.floor(r() * 5);
    const color = Math.floor(r() * PALETTE.length);
    const type = ['peony', 'ring', 'willow', 'glitter', 'peony', 'chrys'][Math.floor(r() * 6)];
    if (pattern === 0) {
      // 由下往上逐節施放(四面同時)
      for (let s = 0; s < SEG_COUNT; s++) for (const f of faces) ev.push({ t: t + s * 0.35, seg: s, face: f, x: 0, type, color });
      t += 3.6;
    } else if (pattern === 1) {
      // 單節環繞
      const s = Math.floor(r() * SEG_COUNT);
      for (let k = 0; k < 12; k++) ev.push({ t: t + k * 0.18, seg: s, face: k % 4, x: ((k % 3) - 1) * 14, type: 'peony', color: (color + k) % PALETTE.length });
      t += 3;
    } else if (pattern === 2) {
      // 隨機齊放
      const n = 6 + Math.floor(r() * 10 + phase * 10);
      for (let k = 0; k < n; k++) ev.push({ t: t + r() * 1.5, seg: Math.floor(r() * SEG_COUNT), face: Math.floor(r() * 4), x: (r() - 0.5) * 30, type, color: Math.floor(r() * PALETTE.length) });
      t += 2.2;
    } else if (pattern === 3) {
      // 金色瀑布(從平台灑下)
      for (let s = 0; s < SEG_COUNT; s++) ev.push({ t, seg: s, face: -1, x: 0, type: 'falls', color: 6, dur: 4 });
      t += 4.5;
    } else {
      // 由上往下
      for (let s = SEG_COUNT - 1; s >= 0; s--) for (const f of faces) ev.push({ t: t + (SEG_COUNT - 1 - s) * 0.3, seg: s, face: f, x: (r() - 0.5) * 20, type: 'chrys', color });
      t += 3.4;
    }
    t += 0.3 + r() * 0.8;
  }
  // 壓軸:全部齊放
  for (let k = 0; k < 80; k++) ev.push({ t: SHOW - 6 + r() * 4, seg: Math.floor(r() * SEG_COUNT), face: Math.floor(r() * 4), x: (r() - 0.5) * 30, type: ['peony', 'willow', 'glitter'][k % 3], color: k % PALETTE.length });
  ev.sort((a, b) => a.t - b.t);
  return ev;
}

/** 某節某面的發射點與外法線。 */
export function launchPoint(seg, face, x) {
  const y = BASE_TOP + (seg + 1) * SEG_H - 2;
  const hw = SEG_HW1 + 0.8;
  const a = face * Math.PI / 2;
  const n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  const t = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
  const p = n.clone().multiplyScalar(hw).addScaledVector(t, x);
  p.y = y;
  return { p, n };
}

export class Fireworks {
  constructor(scene, audio) {
    this.audio = audio;
    this.active = false;
    this.clock = 0;
    this.schedule = makeSchedule();
    this.next = 0;
    this.shells = [];
    this.listeners = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.flick = new Uint8Array(MAX);
    this.cursor = 0;
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 250, 0), 1200);
    const mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha;
        uniform float scale;
        void main() {
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(1.0, size * scale / -mv.z);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        varying vec3 vColor; varying float vAlpha;
        void main() {
          #include <logdepthbuf_fragment>
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          a = a * a;
          if (vAlpha * a < 0.01) discard;
          gl_FragColor = vec4(vColor * (1.0 + 2.0 * a), vAlpha * a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);

    // 爆炸照明
    this.flash = new THREE.PointLight(0xffffff, 0, 280, 1.6);
    scene.add(this.flash);

    // 外牆倒數 LED(四面,第 5~6 節)
    this.ledTex = canvasTex(512, 512, () => {}, { repeat: false });
    const ledMat = new THREE.MeshBasicMaterial({ map: this.ledTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.led = new THREE.Group();
    const y = BASE_TOP + 4.5 * SEG_H;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      const hw = halfWidthAt(y) + 0.6;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), ledMat);
      m.position.set(Math.sin(a) * hw, y, Math.cos(a) * hw);
      m.rotation.y = a;
      this.led.add(m);
    }
    this.led.visible = false;
    scene.add(this.led);
    this.ledShown = null;
  }

  onLaunch(fn) { this.listeners.push(fn); }

  setActive(on) {
    this.active = on;
    this.points.visible = on;
    this.led.visible = on;
    if (on) { this.clock = 0; this.next = 0; }
    else { this.alpha.fill(0); this.points.geometry.attributes.alpha.needsUpdate = true; this.flash.intensity = 0; }
  }

  /** 目前狀態:phase = countdown | show | pause,remain = 距離零時的秒數。 */
  status() {
    const c = this.clock;
    if (c < COUNTDOWN) return { phase: 'countdown', remain: COUNTDOWN - c };
    if (c < COUNTDOWN + SHOW) return { phase: 'show', t: c - COUNTDOWN };
    return { phase: 'pause', remain: COUNTDOWN + SHOW + PAUSE - c };
  }

  /** 未來 within 秒內將發射的位置(攀爬模式用來預警)。 */
  upcoming(within) {
    const st = this.status();
    if (st.phase !== 'show') return [];
    const out = [];
    for (let i = this.next; i < this.schedule.length; i++) {
      const e = this.schedule[i];
      if (e.t > st.t + within) break;
      if (e.face >= 0) out.push({ ...launchPoint(e.seg, e.face, e.x), dt: e.t - st.t });
    }
    return out;
  }

  _emit(x, y, z, vx, vy, vz, life, size, c, drag = 0.98, flick = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    this.life[i] = this.maxLife[i] = life;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.drag[i] = drag;
    this.flick[i] = flick;
  }

  _launch(e, camPos) {
    if (e.type === 'falls') {
      this.shells.push({ falls: true, seg: e.seg, t: 0, dur: e.dur || 4 });
      return;
    }
    const { p, n } = launchPoint(e.seg, e.face, e.x);
    const speed = 75 + Math.random() * 40;
    const v = n.clone().multiplyScalar(speed);
    v.y = 18 + Math.random() * 28;
    v.x += (Math.random() - 0.5) * 6;
    v.z += (Math.random() - 0.5) * 6;
    this.shells.push({ p: p.clone(), v, fuse: 1.6 + Math.random() * 0.8, type: e.type, color: PALETTE[e.color] });
    for (let k = 0; k < 18; k++) this._emit(p.x, p.y, p.z, n.x * 6 + (Math.random() - 0.5) * 6, (Math.random() - 0.3) * 5, n.z * 6 + (Math.random() - 0.5) * 6, 0.5, 2.2, [1, 0.8, 0.5], 0.9);
    for (const fn of this.listeners) fn(p, n);
    if (camPos && this.audio) this.audio.fireworkLaunch(camPos.distanceTo(p));
  }

  _burst(s, camPos) {
    const { p, color, type } = s;
    const n = type === 'willow' ? 320 : type === 'ring' ? 180 : 300;
    const speed = type === 'willow' ? 38 : 62;
    const c2 = PALETTE[(PALETTE.indexOf(color) + 3) % PALETTE.length];
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize();
    const u = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(1, 0, 0)).normalize();
    const w = new THREE.Vector3().crossVectors(axis, u);
    for (let k = 0; k < n; k++) {
      let dx, dy, dz;
      if (type === 'ring') {
        const a = (k / n) * Math.PI * 2;
        dx = u.x * Math.cos(a) + w.x * Math.sin(a); dy = u.y * Math.cos(a) + w.y * Math.sin(a); dz = u.z * Math.cos(a) + w.z * Math.sin(a);
      } else {
        const zz = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, rr = Math.sqrt(1 - zz * zz);
        dx = rr * Math.cos(a); dy = zz; dz = rr * Math.sin(a);
      }
      const sp = speed * (0.85 + Math.random() * 0.3);
      const c = type === 'willow' ? [1, 0.72, 0.3] : type === 'chrys' && k % 2 ? c2 : color;
      const life = type === 'willow' ? 3.2 + Math.random() : 1.6 + Math.random() * 0.8;
      this._emit(p.x, p.y, p.z, dx * sp, dy * sp, dz * sp, life, type === 'glitter' ? 4 : 6, c, type === 'willow' ? 0.968 : 0.972, type === 'glitter' ? 1 : 0);
    }
    this.flash.position.copy(p);
    this.flash.color.setRGB(color[0], color[1], color[2]);
    this.flash.intensity = 2500;
    if (camPos && this.audio) this.audio.fireworkBoom(camPos.distanceTo(p));
  }

  _drawLed(text, sub) {
    if (this.ledShown === text) return;
    this.ledShown = text;
    const g = this.ledTex.image.getContext('2d');
    g.clearRect(0, 0, 512, 512);
    if (text) {
      g.fillStyle = '#fff2c8';
      g.shadowColor = '#ffb347';
      g.shadowBlur = 30;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `700 ${text.length > 2 ? 190 : 330}px "Barlow Condensed", sans-serif`;
      g.fillText(text, 256, sub ? 230 : 270);
      if (sub) { g.font = '700 70px "Noto Sans TC", sans-serif'; g.fillText(sub, 256, 420); }
    }
    this.ledTex.needsUpdate = true;
  }

  update(dt, camPos) {
    if (!this.active) return;
    this.clock += dt;
    const total = COUNTDOWN + SHOW + PAUSE;
    if (this.clock > total) { this.clock -= total; this.next = 0; }
    const st = this.status();
    if (st.phase === 'countdown') {
      const r = Math.ceil(st.remain);
      this._drawLed(r <= 10 ? String(r) : '');
    } else if (st.phase === 'show') {
      this._drawLed(st.t < 60 ? String(NEW_YEAR) : '', st.t < 60 ? '新年快樂' : '');
      while (this.next < this.schedule.length && this.schedule[this.next].t <= st.t) {
        this._launch(this.schedule[this.next], camPos);
        this.next++;
      }
    } else this._drawLed('');

    // 砲彈
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      if (s.falls) {
        s.t += dt;
        const y = BASE_TOP + (s.seg + 1) * SEG_H - 0.5;
        for (let k = 0; k < 40 * dt * 60 / 4; k++) {
          const a = Math.random() * Math.PI * 2;
          const side = Math.floor(Math.random() * 4);
          const along = (Math.random() - 0.5) * 2 * SEG_HW1 * 0.8;
          const nx = [0, 1, 0, -1][side], nz = [1, 0, -1, 0][side];
          const x = nx * (SEG_HW1 + 0.4) + nz * along, z = nz * (SEG_HW1 + 0.4) - nx * along;
          this._emit(x, y, z, nx * 1.5 + Math.cos(a) * 0.4, -2, nz * 1.5 + Math.sin(a) * 0.4, 2.2, 1.8, [1, 0.78, 0.4], 0.97, 1);
        }
        if (s.t > s.dur) this.shells.splice(i, 1);
        continue;
      }
      s.v.y -= 9.8 * dt;
      s.v.multiplyScalar(Math.pow(0.985, dt * 60));
      s.p.addScaledVector(s.v, dt);
      this._emit(s.p.x, s.p.y, s.p.z, 0, -1, 0, 0.5, 2.6, [1, 0.75, 0.45], 0.9);
      s.fuse -= dt;
      if (s.fuse <= 0) { this._burst(s, camPos); this.shells.splice(i, 1); }
    }
    this.flash.intensity *= Math.pow(0.02, dt);

    // 粒子
    const k = Math.pow(1, 1);
    void k;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      const d = Math.pow(this.drag[i], dt * 60);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - 6.5 * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, f * 1.8) * (this.flick[i] ? (Math.random() < 0.5 ? 1 : 0.15) : 1);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.alpha.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = true;
  }
}
