// 創意滑翔翼:設計選項、性能計算、3D 模型,以及 101 頂樓起飛跳台。
import * as THREE from 'three';
import { ROOF_Y } from '../config.js';
import { createCharacter } from './character.js';
import { canvasTex, textTexture } from './textures.js';

export const OPTS = {
  wing: [
    { id: 'straight', name: '直翼', desc: '升力好、操控穩定', k: 0.045, clmax: 1.35, cd0: 0, stab: 1 },
    { id: 'swept', name: '後掠翼', desc: '飛得快、阻力小', k: 0.052, clmax: 1.15, cd0: -0.005, stab: 1.25 },
    { id: 'delta', name: '三角翼', desc: '很穩、不易失速', k: 0.068, clmax: 1.6, cd0: 0.004, stab: 1.45 },
    { id: 'biplane', name: '雙翼', desc: '面積大、慢速飄', k: 0.05, clmax: 1.6, cd0: 0.018, stab: 1.1, area: 1.7 }
  ],
  material: [
    { id: 'wood', name: '輕木', desc: '便宜但較重', mass: 22, cd0: 0.006 },
    { id: 'alu', name: '鋁合金', desc: '堅固標準', mass: 30, cd0: 0 },
    { id: 'carbon', name: '碳纖維', desc: '最輕最滑順', mass: 14, cd0: -0.004 }
  ],
  tail: [
    { id: 'yes', name: '有尾翼', desc: '穩定好控制', stab: 1.3, cd0: 0.004 },
    { id: 'no', name: '無尾翼', desc: '阻力小但會晃', stab: 0.65, cd0: 0 }
  ],
  theme: [
    { id: 'classic', name: '經典滑翔翼', cd0: 0, mass: 0, creat: 1 },
    { id: 'boba', name: '珍珠奶茶號', cd0: 0.012, mass: 6, creat: 4 },
    { id: 'pineapple', name: '鳳梨酥號', cd0: 0.008, mass: 9, creat: 3 },
    { id: 'xlb', name: '小籠包號', cd0: 0.01, mass: 5, creat: 4 },
    { id: 'mini101', name: '迷你101號', cd0: 0.014, mass: 8, creat: 5 }
  ],
  colors: ['#c62828', '#f5c76a', '#2f7a80', '#3b5b8c', '#f4f4f2', '#7b3fa0', '#1d1d1f']
};

export const DEFAULT_DESIGN = { name: '台北一號', wing: 'straight', span: 10, material: 'alu', tail: 'yes', theme: 'classic', color: '#c62828' };

const find = (list, id) => list.find((o) => o.id === id) || list[0];

/** 由設計算出飛行參數。 */
export function performance(d) {
  const w = find(OPTS.wing, d.wing), mt = find(OPTS.material, d.material), t = find(OPTS.tail, d.tail), th = find(OPTS.theme, d.theme);
  const chord = w.id === 'delta' ? d.span * 0.32 : 1.25;
  const S = d.span * chord * (w.area || 1) * (w.id === 'delta' ? 0.55 : 1);
  const AR = (d.span * d.span) / S;
  const k = w.k * (8 / Math.max(3, AR));
  const cd0 = 0.048 + w.cd0 + mt.cd0 + t.cd0 + th.cd0 + (d.span > 12 ? 0.003 : 0);
  const mass = 72 + mt.mass * (d.span / 10) + th.mass;
  const stab = w.stab * t.stab;
  const ld = 1 / (2 * Math.sqrt(cd0 * k));
  const clBest = Math.sqrt(cd0 / k);
  const vBest = Math.sqrt((2 * mass * 9.8) / (1.225 * S * clBest));
  return { S, k, cd0, mass, stab, clmax: w.clmax, ld, clBest, vBest, creat: th.creat, est: Math.round(ROOF_Y * ld * 0.85) };
}

/** 滑翔翼模型。原點在飛行員髖部附近,機頭 +Z。 */
export function buildGlider(d) {
  const g = new THREE.Group();
  const w = find(OPTS.wing, d.wing);
  const sail = new THREE.MeshStandardMaterial({ color: new THREE.Color(d.color), roughness: 0.7, side: THREE.DoubleSide });
  const tube = new THREE.MeshStandardMaterial({ color: d.material === 'carbon' ? 0x1b1b1d : d.material === 'wood' ? 0x9a6b3e : 0xc0c4c8, roughness: 0.4, metalness: d.material === 'wood' ? 0 : 0.8 });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const span = d.span, wy = 1.25;
  const stripe = canvasTex(256, 32, (c, W, H) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); c.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 8; i++) c.fillRect(i * 32, 0, 2, H); });
  void stripe;
  const wingHalf = (side, y, sweep = 0) => {
    const half = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(span / 2, 0.06, 1.25), sail);
    m.position.x = side * span / 4;
    m.castShadow = true;
    half.add(m);
    const le = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, span / 2, 8), tube);
    le.rotation.z = Math.PI / 2;
    le.position.set(side * span / 4, 0, 0.62);
    half.add(le);
    half.position.y = y;
    half.rotation.z = side * 0.06; // 上反角
    half.rotation.y = -side * sweep;
    g.add(half);
  };
  if (w.id === 'delta') {
    const sh = new THREE.Shape();
    const L = span * 0.42;
    sh.moveTo(0, L * 0.55); sh.lineTo(span / 2, -L * 0.45); sh.lineTo(0, -L * 0.25); sh.lineTo(-span / 2, -L * 0.45); sh.closePath();
    const geo = new THREE.ShapeGeometry(sh);
    geo.rotateX(-Math.PI / 2);
    const m = add(geo, sail, 0, wy, 0);
    m.scale.z = -1;
    for (const s of [-1, 1]) {
      const le = add(new THREE.CylinderGeometry(0.04, 0.04, Math.hypot(span / 2, L), 8), tube, s * span / 4, wy, 0.05 * L);
      le.rotation.set(Math.PI / 2, 0, -s * Math.atan2(span / 2, L));
    }
  } else if (w.id === 'biplane') {
    wingHalf(-1, wy, 0); wingHalf(1, wy, 0); wingHalf(-1, wy + 1.0, 0); wingHalf(1, wy + 1.0, 0);
    for (const x of [-span * 0.35, -span * 0.12, span * 0.12, span * 0.35]) add(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), tube, x, wy + 0.5, 0);
  } else {
    const sweep = w.id === 'swept' ? 0.38 : 0;
    wingHalf(-1, wy, sweep); wingHalf(1, wy, sweep);
  }
  // 龍骨與 A 字控制架
  const keel = add(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 8), tube, 0, wy - 0.05, -0.4);
  keel.rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    const a = add(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), tube, s * 0.38, wy - 0.7, 0.45);
    a.rotation.z = s * 0.5;
  }
  add(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), tube, 0, wy - 1.35, 0.45).rotation.z = Math.PI / 2;
  // 尾翼
  if (d.tail === 'yes') {
    const boom = add(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 8), tube, 0, wy, -2.8);
    boom.rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(2.2, 0.04, 0.6), sail, 0, wy, -3.9);
    add(new THREE.BoxGeometry(0.04, 0.8, 0.6), sail, 0, wy + 0.4, -3.9);
  }
  // 飛行員(俯臥吊在翼下)
  const pilot = createCharacter({ shirt: 0x1d2433, pants: 0x1d2433, helmet: d.color === '#f5c76a' ? 0xc62828 : 0xf5c76a, harness: true, longSleeve: true, gloves: 0x222222 });
  pilot.root.rotation.x = Math.PI / 2;
  pilot.root.position.set(0, 0.35, -0.95);
  for (const s of ['L', 'R']) { pilot.arms[s].upper.rotation.x = -2.6; pilot.arms[s].elbow.rotation.x = -0.6; }
  g.add(pilot.root);
  // 造型主題
  const th = d.theme;
  if (th === 'boba') {
    const cup = new THREE.Group();
    cup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 1.0, 20), new THREE.MeshPhysicalMaterial({ color: 0xd9b48a, roughness: 0.2, transmission: 0.3, transparent: true, opacity: 0.85 })));
    for (let i = 0; i < 14; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.2 })); b.position.set((Math.random() - 0.5) * 0.5, -0.38 + Math.random() * 0.12, (Math.random() - 0.5) * 0.5); cup.add(b); }
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.43, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    lid.position.y = 0.5; lid.scale.y = 0.3; cup.add(lid);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8), new THREE.MeshStandardMaterial({ color: 0x2f7a80 }));
    straw.position.set(0.12, 0.85, 0); straw.rotation.z = -0.25; cup.add(straw);
    cup.position.set(0, wy + 0.55, 0.9);
    g.add(cup);
  } else if (th === 'pineapple') {
    const tex = canvasTex(128, 64, (c, W, H) => { c.fillStyle = '#d9a23c'; c.fillRect(0, 0, W, H); c.strokeStyle = '#a8701f'; c.lineWidth = 3; c.strokeRect(6, 6, W - 12, H - 12); c.fillStyle = '#7a4a12'; c.font = '700 26px "Noto Sans TC"'; c.fillText('鳳梨酥', 26, 42); });
    const box = add(new THREE.BoxGeometry(1.1, 0.4, 0.7), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), 0, wy + 0.3, 1.0);
    void box;
  } else if (th === 'xlb') {
    const bun = add(new THREE.SphereGeometry(0.55, 20, 14), new THREE.MeshStandardMaterial({ color: 0xf3ece0, roughness: 0.9 }), 0, wy + 0.45, 0.9);
    bun.scale.y = 0.72;
    add(new THREE.ConeGeometry(0.2, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0xece3d4, roughness: 0.9 }), 0, wy + 0.85, 0.9);
  } else if (th === 'mini101') {
    const mm = new THREE.MeshStandardMaterial({ color: 0x3d7f86, metalness: 0.6, roughness: 0.25 });
    for (let k = 0; k < 6; k++) { const s = add(new THREE.CylinderGeometry(0.22, 0.17, 0.26, 4), mm, 0, wy + 0.25 + k * 0.26, 0.2); s.rotation.y = Math.PI / 4; }
    add(new THREE.CylinderGeometry(0.01, 0.03, 0.5, 6), tube, 0, wy + 2.0, 0.2);
  }
  // 機名旗
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.3), new THREE.MeshStandardMaterial({ map: textTexture(d.name || '無名號', { w: 512, h: 140, bg: '#0b1626', fg: '#ffffff', font: '700 80px "Noto Sans TC", sans-serif' }), side: THREE.DoubleSide }));
  flag.position.set(span * 0.3, wy + 0.06, -0.3);
  flag.rotation.x = -Math.PI / 2;
  g.add(flag);
  return { group: g, pilot };
}

// ── 起飛跳台(101 頂樓南側,往 +Z 延伸並微微下傾)──
export const RAMP = { y0: ROOF_Y + 0.4, z0: 10.5, len: 20, slope: 0.14 };
export function rampPoint(t) {
  return new THREE.Vector3(0, RAMP.y0 - Math.sin(RAMP.slope) * RAMP.len * t, RAMP.z0 + Math.cos(RAMP.slope) * RAMP.len * t);
}

export function buildRamp() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x5c6670, metalness: 0.7, roughness: 0.4 });
  const deckTex = canvasTex(256, 256, (c, W, H) => { c.fillStyle = '#3a3f45'; c.fillRect(0, 0, W, H); c.strokeStyle = '#2a2e33'; for (let i = 0; i < W; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, H); c.stroke(); } c.fillStyle = '#f5c76a'; c.fillRect(0, 0, 10, H); c.fillRect(W - 10, 0, 10, H); });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, RAMP.len), new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.8 }));
  const mid = rampPoint(0.5);
  deck.position.set(0, mid.y - 0.12, mid.z);
  deck.rotation.x = RAMP.slope;
  deck.castShadow = deck.receiveShadow = true;
  g.add(deck);
  // 支撐桁架
  for (const x of [-2.2, 2.2]) {
    for (const t of [0.35, 0.7, 1]) {
      const p = rampPoint(t);
      const base = new THREE.Vector3(x, ROOF_Y - 12, 12.5);
      const top = new THREE.Vector3(x, p.y - 0.25, p.z);
      const len = base.distanceTo(top);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, len, 8), steel);
      b.position.copy(base).lerp(top, 0.5);
      b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(base).normalize());
      g.add(b);
    }
    // 欄杆
    const r0 = rampPoint(0), r1 = rampPoint(0.92);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, r0.distanceTo(r1), 6), steel);
    rail.position.set(x * 1.1, (r0.y + r1.y) / 2 + 1.0, (r0.z + r1.z) / 2);
    rail.rotation.x = Math.PI / 2 + RAMP.slope;
    g.add(rail);
  }
  // 標示牌
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.1), new THREE.MeshStandardMaterial({ map: textTexture('創意滑翔賽 · 起飛台', { w: 1024, h: 220, bg: '#c62828', fg: '#ffffff', font: '900 110px "Noto Sans TC", sans-serif' }), emissive: 0xffffff, emissiveIntensity: 0.15, side: THREE.DoubleSide }));
  sign.position.set(0, RAMP.y0 + 4.4, RAMP.z0 + 0.3);
  g.add(sign);
  for (const x of [-2.5, 2.5]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), steel);
    post.position.set(x, RAMP.y0 + 2.5, RAMP.z0 + 0.3);
    g.add(post);
  }
  return g;
}
