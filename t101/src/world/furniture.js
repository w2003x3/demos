// 室內家具與道具。每個建構函式回傳 Group(原點在地面),由 interiors.js 擺放。
import * as THREE from 'three';
import { canvasTex, textTexture } from './textures.js?v=6ba67c5';

const std = (color, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
export const MAT = {
  wood: std(0x7a5236, 0.55),
  woodLight: std(0xb48a5e, 0.6),
  woodDark: std(0x3e2a1d, 0.5),
  steel: std(0xc0c4c8, 0.3, 0.9),
  blackMetal: std(0x222326, 0.45, 0.7),
  brass: std(0xb8893c, 0.3, 1),
  leather: std(0x5a3a2a, 0.6),
  fabric: std(0x48544e, 0.95),
  fabric2: std(0x8a7d6b, 0.95),
  white: std(0xf1efe9, 0.5),
  stone: std(0xd8d2c6, 0.35),
  darkStone: std(0x2e2f31, 0.25),
  plant: std(0x2f5d2c, 0.8),
  soil: std(0x3b2b1f, 1),
  glassClear: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.35, thickness: 0.02 }),
  emissiveWarm: new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffd9a0, emissiveIntensity: 2.2 }),
  emissiveCool: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f7ff, emissiveIntensity: 1.6 })
};

function mesh(geo, mat, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

export function roundTable(r = 0.4, h = 0.74, top = MAT.stone) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(r, r, 0.03, 28), top, 0, h, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 10), MAT.blackMetal, 0, h / 2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.03, 20), MAT.blackMetal, 0, 0.015, 0));
  return g;
}

export function squareTable(w = 0.75, d = 0.75, h = 0.74, top = MAT.wood) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w, 0.04, d), top, 0, h, 0));
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    g.add(mesh(new THREE.BoxGeometry(0.04, h, 0.04), MAT.blackMetal, sx * (w / 2 - 0.05), h / 2, sz * (d / 2 - 0.05)));
  }
  return g;
}

/** 椅子,面向 +Z。 */
export function chair(seat = MAT.woodLight) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.44, 0.04, 0.42), seat, 0, 0.46, 0));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.42, 0.03), seat, 0, 0.7, -0.2));
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.46, 6), MAT.blackMetal, sx * 0.19, 0.23, sz * 0.18));
  }
  return g;
}

export function stool(h = 0.75) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 18), MAT.leather, 0, h, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, h, 8), MAT.steel, 0, h / 2, 0));
  { const _m = mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 18), MAT.steel, 0, 0.3, 0); _m.rotation.x = Math.PI / 2; g.add(_m); }
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.02, 18), MAT.steel, 0, 0.01, 0));
  return g;
}

/** 單人沙發,面向 +Z。 */
export function armchair(mat = MAT.leather) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.8, 0.22, 0.75), mat, 0, 0.3, 0));
  g.add(mesh(new THREE.BoxGeometry(0.8, 0.5, 0.18), mat, 0, 0.6, -0.3));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.15, 0.32, 0.75), mat, sx * 0.36, 0.48, 0));
  g.add(mesh(new THREE.BoxGeometry(0.76, 0.18, 0.7), MAT.woodDark, 0, 0.1, 0));
  return g;
}

export function sofa(w = 1.9, mat = MAT.fabric) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w, 0.2, 0.85), mat, 0, 0.32, 0));
  g.add(mesh(new THREE.BoxGeometry(w, 0.48, 0.2), mat, 0, 0.62, -0.33));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.18, 0.36, 0.85), mat, sx * (w / 2 - 0.09), 0.5, 0));
  for (let i = 0; i < Math.round(w / 0.65); i++) {
    const cw = (w - 0.36) / Math.round(w / 0.65);
    g.add(mesh(new THREE.BoxGeometry(cw - 0.03, 0.12, 0.62), mat, -w / 2 + 0.18 + cw * (i + 0.5), 0.48, 0.06));
  }
  g.add(mesh(new THREE.BoxGeometry(w - 0.1, 0.22, 0.75), MAT.woodDark, 0, 0.11, 0));
  return g;
}

export function planter(h = 1.4) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.55, 16), MAT.darkStone, 0, 0.275, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), MAT.soil, 0, 0.54, 0));
  const leaf = std(0x2f6b31, 0.8);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const l = mesh(new THREE.SphereGeometry(0.28, 8, 6), leaf, Math.cos(a) * 0.15, 0.6 + (i / 9) * (h - 0.5), Math.sin(a) * 0.15);
    l.scale.set(1, 1.4, 0.5);
    l.rotation.y = a;
    g.add(l);
  }
  return g;
}

/** 吊燈(掛在天花板高度 ceil)。 */
export function pendant(ceil, drop = 1.2, warm = true) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, drop, 4), MAT.blackMetal, 0, ceil - drop / 2, 0, false));
  const shade = mesh(new THREE.ConeGeometry(0.2, 0.22, 20, 1, true), MAT.blackMetal, 0, ceil - drop - 0.06, 0, false);
  shade.material = MAT.brass;
  g.add(shade);
  g.add(mesh(new THREE.SphereGeometry(0.07, 12, 8), warm ? MAT.emissiveWarm : MAT.emissiveCool, 0, ceil - drop - 0.14, 0, false));
  return g;
}

/** 咖啡吧台,長 len,面向 +Z(客人在 +Z 側)。 */
export function coffeeCounter(len, { front = MAT.woodDark, top = MAT.stone, brand = 0x0f5132 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(len, 1.05, 0.75), front, 0, 0.525, 0));
  g.add(mesh(new THREE.BoxGeometry(len + 0.06, 0.05, 0.85), top, 0, 1.075, 0.02));
  // 吧台面板直紋
  for (let x = -len / 2 + 0.15; x < len / 2; x += 0.15) {
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.9, 0.02), MAT.wood, x, 0.5, 0.385, false));
  }
  // 義式咖啡機
  for (const mx of [-len * 0.28, len * 0.05]) {
    const m = new THREE.Group();
    m.add(mesh(new THREE.BoxGeometry(0.85, 0.48, 0.55), MAT.steel, 0, 0.24, 0));
    m.add(mesh(new THREE.BoxGeometry(0.87, 0.06, 0.57), std(brand, 0.4, 0.3), 0, 0.5, 0));
    for (const gx of [-0.25, 0, 0.25]) {
      m.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 10), MAT.blackMetal, gx, 0.12, 0.3));
      m.add(mesh(new THREE.BoxGeometry(0.02, 0.02, 0.14), MAT.blackMetal, gx, 0.08, 0.36));
    }
    m.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.25, 6), MAT.steel, 0.38, 0.15, 0.28));
    m.position.set(mx, 1.1, -0.1);
    g.add(m);
  }
  // 磨豆機
  for (const gx of [-len * 0.42, len * 0.2]) {
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.32, 0.22), MAT.blackMetal, gx, 1.26, -0.15));
    { const _m = mesh(new THREE.ConeGeometry(0.09, 0.2, 14), new THREE.MeshPhysicalMaterial({ color: 0x5a3a20, roughness: 0.1, transparent: true, opacity: 0.7 }), gx, 1.52, -0.15); _m.rotation.x = Math.PI; g.add(_m); }
  }
  // 收銀機
  g.add(mesh(new THREE.BoxGeometry(0.34, 0.08, 0.26), MAT.blackMetal, len * 0.38, 1.14, 0.1));
  const scr = mesh(new THREE.BoxGeometry(0.3, 0.22, 0.02), new THREE.MeshStandardMaterial({ color: 0x0b0f14, emissive: 0x3a7bd5, emissiveIntensity: 0.6 }), len * 0.38, 1.3, 0.05);
  scr.rotation.x = -0.4;
  g.add(scr);
  // 杯架
  for (let i = 0; i < 6; i++) {
    g.add(mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.11, 12), MAT.white, len * 0.28 + (i % 3) * 0.11, 1.155, -0.2 + Math.floor(i / 3) * 0.11));
  }
  return g;
}

/** 甜點冷藏櫃,面向 +Z。 */
export function pastryCase(len = 1.6) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(len, 0.85, 0.75), MAT.woodDark, 0, 0.425, 0));
  const glass = mesh(new THREE.BoxGeometry(len - 0.04, 0.5, 0.6), MAT.glassClear, 0, 1.1, 0, false);
  g.add(glass);
  g.add(mesh(new THREE.BoxGeometry(len - 0.1, 0.02, 0.55), MAT.white, 0, 0.95, 0, false));
  g.add(mesh(new THREE.BoxGeometry(len - 0.1, 0.02, 0.55), MAT.white, 0, 1.15, 0, false));
  { const _m = mesh(new THREE.BoxGeometry(len - 0.04, 0.4, 0.04), std(0xfff4dd, 0.5), 0, 1.12, -0.28, false); _m.material.emissive = new THREE.Color(0x66553a); g.add(_m); }
  const cols = [0xc98a4b, 0x6b3e26, 0xf0d9a8, 0xd94f4f, 0xe8c56f, 0x8a5a3a];
  for (let i = 0; i < 12; i++) {
    const lv = i < 6 ? 0.98 : 1.18;
    const k = mesh(i % 2 ? new THREE.CylinderGeometry(0.07, 0.07, 0.06, 14) : new THREE.BoxGeometry(0.12, 0.06, 0.09), std(cols[i % 6], 0.7), -len / 2 + 0.18 + (i % 6) * ((len - 0.3) / 5), lv + 0.03, 0.05, false);
    g.add(k);
  }
  return g;
}

/** 直立菜單看板(牆面),w×h,畫上品項。 */
export function menuBoard(w, h, title, items, { bg = '#1f2a24', fg = '#f3efe4', accent = '#c9a96e' } = {}) {
  const tex = canvasTex(512, Math.round(512 * h / w), (g, W, H) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = accent;
    g.font = '700 34px "Noto Sans TC", sans-serif';
    g.fillText(title, 28, 52);
    g.fillRect(28, 68, W - 56, 2);
    g.font = '500 24px "Noto Sans TC", sans-serif';
    items.forEach(([name, price], i) => {
      const y = 112 + i * 40;
      if (y > H - 20) return;
      g.fillStyle = fg;
      g.textAlign = 'left';
      g.fillText(name, 28, y);
      g.textAlign = 'right';
      g.fillText(price, W - 28, y);
    });
    g.textAlign = 'left';
  }, { repeat: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 }));
  return m;
}

/** 招牌平面(發光字)。 */
export function signPlane(w, h, text, opts = {}) {
  const tex = textTexture(text, { w: 1024, h: Math.round(1024 * h / w), ...opts });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: opts.glow ?? 0.5, transparent: !opts.bg }));
}

/** 投幣式望遠鏡,面向 +Z。 */
export function telescope() {
  const g = new THREE.Group();
  const body = std(0x2c6e74, 0.4, 0.6);
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.0, 14), MAT.steel, 0, 0.5, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.04, 20), MAT.steel, 0, 0.02, 0));
  const head = new THREE.Group();
  head.position.y = 1.15;
  head.add(mesh(new THREE.BoxGeometry(0.36, 0.3, 0.42), body, 0, 0, 0));
  for (const sx of [-0.09, 0.09]) {
    const t = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 14), body, sx, 0.02, 0.32);
    t.rotation.x = Math.PI / 2;
    head.add(t);
    { const _m = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 14), std(0x0a1020, 0.05, 0.2), sx, 0.02, 0.47); _m.rotation.x = Math.PI / 2; head.add(_m); }
    const e = mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.08, 10), MAT.blackMetal, sx, 0.04, -0.25);
    e.rotation.x = Math.PI / 2;
    head.add(e);
  }
  head.add(mesh(new THREE.BoxGeometry(0.1, 0.16, 0.06), MAT.brass, 0.24, -0.02, 0));
  head.rotation.x = -0.08;
  g.add(head);
  return g;
}

/** 玻璃欄杆(沿圓周,半徑 r,高 h)。 */
export function glassRailCircle(r, h = 1.1, seg = 48, gaps = []) {
  const g = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xd8f0f0, roughness: 0.05, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
  const panel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h - 0.1, seg, 1, true), glass);
  panel.position.y = (h - 0.1) / 2;
  g.add(panel);
  const top = mesh(new THREE.TorusGeometry(r, 0.035, 8, seg * 2), MAT.steel, 0, h, 0, false);
  top.rotation.x = Math.PI / 2;
  g.add(top);
  const base = mesh(new THREE.TorusGeometry(r, 0.05, 6, seg * 2), MAT.blackMetal, 0, 0.03, 0, false);
  base.rotation.x = Math.PI / 2;
  g.add(base);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, h, 8), MAT.steel, Math.cos(a) * r, h / 2, Math.sin(a) * r, false));
  }
  return g;
}

/** 說明看板(立牌),面向 +Z。 */
export function infoStand(title, lines, w = 1.0, h = 0.7) {
  const tex = canvasTex(512, Math.round(512 * h / w), (g, W, H) => {
    g.fillStyle = '#10202c';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#d9b25a';
    g.fillRect(0, 0, W, 8);
    g.font = '900 38px "Noto Sans TC", sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText(title, 26, 60);
    g.font = '500 24px "Noto Sans TC", sans-serif';
    g.fillStyle = '#c8d6e0';
    lines.forEach((l, i) => g.fillText(l, 26, 108 + i * 36));
  }, { repeat: false });
  const g = new THREE.Group();
  const board = mesh(new THREE.BoxGeometry(w, h, 0.04), MAT.blackMetal, 0, 1.1, 0);
  g.add(board);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, h - 0.04), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.5 }));
  face.position.set(0, 1.1, 0.021);
  face.rotation.x = 0;
  g.add(face);
  board.rotation.x = face.rotation.x = -0.2;
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), MAT.blackMetal, 0, 0.4, -0.05));
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.03, 0.3), MAT.blackMetal, 0, 0.015, -0.05));
  return g;
}

/** 排隊紅龍柱 + 帶子(從 a 到 b)。 */
export function stanchions(points) {
  const g = new THREE.Group();
  const belt = std(0x8c1c2c, 0.7);
  points.forEach((p, i) => {
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 10), MAT.steel, p[0], 0.475, p[1]));
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 16), MAT.steel, p[0], 0.02, p[1]));
    if (i > 0) {
      const q = points[i - 1];
      const len = Math.hypot(p[0] - q[0], p[1] - q[1]);
      const b = mesh(new THREE.BoxGeometry(len, 0.05, 0.005), belt, (p[0] + q[0]) / 2, 0.88, (p[1] + q[1]) / 2, false);
      b.rotation.y = -Math.atan2(p[1] - q[1], p[0] - q[0]);
      g.add(b);
    }
  });
  return g;
}

/** 電梯門(面向 +Z),寬 1.6、高 2.5,含門框與樓層顯示。回傳 { group, setOpen(t) }。 */
export function elevatorDoor(label = '89F 觀景台') {
  const g = new THREE.Group();
  const frame = std(0x2c2a27, 0.35, 0.8);
  g.add(mesh(new THREE.BoxGeometry(2.3, 0.25, 0.25), frame, 0, 2.62, 0.05));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.25, 2.75, 0.25), frame, sx * 1.025, 1.375, 0.05));
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xb79a63, metalness: 1, roughness: 0.22 });
  const L = mesh(new THREE.BoxGeometry(0.9, 2.5, 0.05), doorMat, -0.45, 1.25, 0);
  const R = mesh(new THREE.BoxGeometry(0.9, 2.5, 0.05), doorMat, 0.45, 1.25, 0);
  g.add(L, R);
  // 門上的紋飾(如意雲紋 → 簡化為細線)
  for (const d of [L, R]) {
    for (let k = 0; k < 5; k++) d.add(mesh(new THREE.BoxGeometry(0.7, 0.012, 0.005), MAT.brass, 0, -0.9 + k * 0.45, 0.028, false));
  }
  const ind = signPlane(1.2, 0.22, label, { bg: '#050505', fg: '#ff9a3c', font: '700 92px "Noto Sans TC", sans-serif', glow: 1 });
  ind.position.set(0, 2.95, 0.06);
  g.add(ind);
  // 呼叫鈕
  const panel = mesh(new THREE.BoxGeometry(0.12, 0.28, 0.03), MAT.steel, 1.4, 1.15, 0.03);
  g.add(panel);
  const btn = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffa040, emissiveIntensity: 0.8 }), 1.4, 1.15, 0.05);
  btn.rotation.x = Math.PI / 2;
  g.add(btn);
  return {
    group: g,
    setOpen(t) { L.position.x = -0.45 - t * 0.88; R.position.x = 0.45 + t * 0.88; }
  };
}

/** 風阻尼器(Tuned Mass Damper)。原點 = 懸吊點(上方),sphereDrop = 懸吊點到球心距離。 */
export function buildDamper(sphereDrop, floorAnchorY) {
  const g = new THREE.Group();
  const stripe = canvasTex(256, 512, (c, W, H) => {
    const grd = c.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, '#9c7426'); grd.addColorStop(0.5, '#e7c06a'); grd.addColorStop(1, '#9c7426');
    c.fillStyle = '#d6a64b';
    c.fillRect(0, 0, W, H);
    // 41 層鋼板
    for (let i = 0; i < 41; i++) {
      const y = (i / 41) * H;
      c.fillStyle = i % 2 ? 'rgba(255,240,200,0.10)' : 'rgba(80,50,10,0.08)';
      c.fillRect(0, y, W, H / 41);
      c.fillStyle = 'rgba(60,35,5,0.45)';
      c.fillRect(0, y, W, 1.5);
    }
  });
  const goldMat = new THREE.MeshStandardMaterial({ map: stripe, color: 0xffffff, metalness: 1, roughness: 0.22, envMapIntensity: 1.4 });
  const pivot = new THREE.Group(); // 擺動的部分
  g.add(pivot);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(2.75, 64, 48), goldMat);
  ball.position.y = -sphereDrop;
  ball.castShadow = true;
  pivot.add(ball);
  const steel = std(0x3a3d42, 0.4, 0.85);
  const cradle = mesh(new THREE.TorusGeometry(2.86, 0.16, 12, 64), steel, 0, -sphereDrop, 0);
  cradle.rotation.x = Math.PI / 2;
  pivot.add(cradle);
  // 8 條鋼索(4 組 × 2)
  for (let k = 0; k < 4; k++) {
    for (const off of [-0.12, 0.12]) {
      const a = k * Math.PI / 2 + Math.PI / 4 + off;
      const x0 = Math.cos(a) * 3.0, z0 = Math.sin(a) * 3.0;
      const cable = mesh(new THREE.CylinderGeometry(0.075, 0.075, sphereDrop, 8), steel, x0, -sphereDrop / 2, z0);
      pivot.add(cable);
    }
    const a = k * Math.PI / 2 + Math.PI / 4;
    const clamp = mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), steel, Math.cos(a) * 3.0, -sphereDrop, Math.sin(a) * 3.0);
    pivot.add(clamp);
  }
  // 頂部吊架
  const top = mesh(new THREE.BoxGeometry(8, 0.8, 8), steel, 0, 0.4, 0);
  g.add(top);
  // 下方 8 支油壓阻尼器(連到地面)
  const pistons = [];
  const bodyMat = std(0x50545a, 0.45, 0.7);
  const rodMat = std(0xe0e4e8, 0.12, 1);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const anchor = new THREE.Vector3(Math.cos(a) * 4.6, floorAnchorY + 0.25, Math.sin(a) * 4.6);
    const body = mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 12), bodyMat);
    const rod = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 10), rodMat);
    const base = mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), steel, anchor.x, floorAnchorY + 0.125, anchor.z);
    g.add(body, rod, base);
    pistons.push({ anchor, a, body, rod });
  }
  // 底部緩衝環
  const bumper = mesh(new THREE.TorusGeometry(1.6, 0.25, 10, 40), std(0x222222, 0.9), 0, floorAnchorY + 0.25, 0);
  bumper.rotation.x = Math.PI / 2;
  g.add(bumper);

  const tmp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  const update = (swayX, swayZ) => {
    // 小角度擺動
    pivot.rotation.z = -swayX / sphereDrop;
    pivot.rotation.x = swayZ / sphereDrop;
    pivot.updateMatrixWorld(true);
    for (const p of pistons) {
      // 阻尼器上端接球下半部
      tmp.set(Math.cos(p.a) * 2.0, -sphereDrop - 1.9, Math.sin(p.a) * 2.0);
      tmp.applyEuler(pivot.rotation);
      dir.subVectors(tmp, p.anchor);
      const len = dir.length();
      dir.normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      const bl = len * 0.55;
      p.body.scale.y = bl;
      p.body.quaternion.copy(q);
      p.body.position.copy(p.anchor).addScaledVector(dir, bl / 2);
      const rl = len * 0.5;
      p.rod.scale.y = rl;
      p.rod.quaternion.copy(q);
      p.rod.position.copy(p.anchor).addScaledVector(dir, len - rl / 2);
    }
  };
  update(0, 0);
  return { group: g, update, ball };
}
