// 鈦鐵行車控制中心(OCC)場景:挑高控制室、28 m × 7 m 的巨大車次資訊牆(LCD 拼接,即時路線圖 + 車次資訊表)、
// 三排弧形調度台(每席多螢幕)、值班調度員、後方主任台。玩家坐在第一排正中央的調度台。
// 座標:資訊牆在 -z 方向(z = -14),玩家座位約在 (0, 0, 1.5)。
import * as THREE from 'three';
import { Builder, T, baseMats, textTex, sign, crowd } from './stations/common.js';
import { canvasTexture, rng } from '../core/textures.js';

export const WALL = { w: 36, h: 9, z: -14, y0: 1.2, cw: 2048, ch: 512 };

export function buildOCC({ assets, quality = {} }) {
  const b = new Builder(), R = rng(88);
  const M = baseMats();
  Object.assign(M, {
    carpet: M.tex(carpetTex(), 0.95),
    wall: new THREE.MeshStandardMaterial({ color: '#2a3038', roughness: 0.85 }),
    panel: M.tex(T.plaster('#3a424c'), 0.8),
    ceiling: M.tex(T.ceilingGrid(), 0.8),
    desk: new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.45 }),
    deskDark: new THREE.MeshStandardMaterial({ color: '#2b2f35', roughness: 0.5 }),
    bezel: new THREE.MeshStandardMaterial({ color: '#0a0b0d', roughness: 0.4 }),
    chair: new THREE.MeshStandardMaterial({ color: '#1d2027', roughness: 0.7 }),
    glow: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#e8f1ff', emissiveIntensity: 1.6 }),
    accent: new THREE.MeshStandardMaterial({ color: '#1f4e9a', roughness: 0.5, emissive: '#0d2a5e', emissiveIntensity: 0.4 }),
  });
  const W = 46, D = 32, H = 12.5;
  // 房間
  b.floor(M.carpet, -W / 2, -D / 2, W / 2, D / 2, 0, 2);
  b.floor(M.ceiling, -W / 2, -D / 2, W / 2, D / 2, H, 1.2, false);
  b.box(M.panel, W, H, 0.3, 0, 0, -D / 2, 0, 1.5);
  b.box(M.panel, W, H, 0.3, 0, 0, D / 2, 0, 1.5);
  b.box(M.panel, 0.3, H, D, -W / 2, 0, 0, 0, 1.5);
  b.box(M.panel, 0.3, H, D, W / 2, 0, 0, 0, 1.5);
  // 吸音牆條紋
  for (let x = -W / 2 + 1; x < W / 2; x += 1.2) { b.box(M.wall, 0.08, H - 1, 0.06, x, 0.5, D / 2 - 0.18); }
  // 天花燈帶
  for (let z = -10; z <= 12; z += 4) b.box(M.glow, W - 6, 0.05, 0.25, 0, H - 0.05, z);

  // ---- 巨大車次資訊牆(LCD 拼接 8 × 2)
  const cv = document.createElement('canvas'); cv.width = WALL.cw; cv.height = WALL.ch;
  const wallTex = new THREE.CanvasTexture(cv); wallTex.colorSpace = THREE.SRGBColorSpace; wallTex.anisotropy = 8;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(WALL.w, WALL.h), new THREE.MeshBasicMaterial({ map: wallTex, toneMapped: false }));
  wall.position.set(0, WALL.y0 + WALL.h / 2, WALL.z);
  b.extra.push(wall);
  b.box(M.bezel, WALL.w + 0.6, WALL.h + 0.6, 0.4, 0, WALL.y0 - 0.3, WALL.z - 0.25);
  for (let i = 1; i < 10; i++) b.box(M.bezel, 0.035, WALL.h, 0.02, -WALL.w / 2 + i * WALL.w / 10, WALL.y0, WALL.z + 0.01);
  for (const f of [1 / 3, 2 / 3]) b.box(M.bezel, WALL.w, 0.035, 0.02, 0, WALL.y0 + WALL.h * f, WALL.z + 0.01);

  // 牆下的設備櫃與牆上標誌
  b.box(M.deskDark, WALL.w + 0.6, WALL.y0 - 0.3, 0.8, 0, 0, WALL.z + 0.1);
  sign(b, textTex('鈦鐵 行車控制中心', { sub: 'TZR Operation Control Center · 鈦直鐵路有限公司', bg: '#0e1a2e', fg: '#e8eef5', h: 120, w: 900 }), 7.5, 1.0, 0, WALL.y0 + WALL.h + 0.9, WALL.z + 0.05, 0, { double: false });
  // 兩側輔助螢幕(CCTV 監視畫面)
  for (const sx of [-1, 1]) for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.25), new THREE.MeshBasicMaterial({ map: cctvTex(R, sx * 10 + r * 2 + c), toneMapped: false }));
    m.position.set(sx * (W / 2 - 0.2), 4.2 + r * 1.4, -9 + c * 2.4);
    m.rotation.y = -sx * Math.PI / 2;
    b.extra.push(m);
    b.box(M.bezel, 0.05, 1.33, 2.28, sx * (W / 2 - 0.17), 4.2 + r * 1.4 - 0.66, -9 + c * 2.4);
  }

  // ---- 弧形調度台(三排)+ 主任台
  const seats = [];
  const rows = [{ r: 16, n: 7, y: 0 }, { r: 20, n: 8, y: 0.35 }, { r: 24, n: 9, y: 0.7 }];
  const cz = WALL.z - 0;   // 弧心在資訊牆
  rows.forEach(({ r, n, y }, ri) => {
    if (y) b.box(M.carpet, 30, y, 3.6, 0, 0, cz + r + 0.6);
    const span = 0.9;
    for (let i = 0; i < n; i++) {
      const a = -span / 2 + span * (i + 0.5) / n, x = Math.sin(a) * r, z = cz + Math.cos(a) * r;
      const player = ri === 0 && i === (n >> 1);
      desk(b, M, x, y, z, a, R, player);
      seats.push({ x: x + Math.sin(a) * 0.95, y, z: z + Math.cos(a) * 0.95, ry: a, player });
    }
  });
  // 主任台(後方高台)
  b.box(M.carpet, 10, 1.1, 4, 0, 0, 13);
  desk(b, M, -1.8, 1.1, 12, 0, R); desk(b, M, 1.8, 1.1, 12, 0, R);
  sign(b, textTex('值班主任', { sub: 'Duty Chief', bg: '#1f4e9a', h: 90, w: 360 }), 1.6, 0.4, 0, 2.9, 11.2, 0, { double: false });

  // ---- 值班調度員(坐姿,耳機)
  const spots = seats.filter((s) => !s.player && R() < 0.8).map((s) => ({ x: s.x, z: s.z, y: s.y, ry: s.ry, sit: true }));
  spots.push({ x: -1.8, z: 12.95, y: 1.1, ry: 0, sit: true }, { x: 6, z: 9, ry: R() * 6 }, { x: -9, z: 2, ry: R() * 6 });
  b.extra.push(crowd(assets.people, spots, R));

  // ---- 燈光
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight('#c9d6e6', '#2a2a30', 0.55));
  const key = new THREE.DirectionalLight('#ffffff', 0.8); key.position.set(4, 10, 8); lights.add(key);
  for (const [x, z] of [[-8, 6], [8, 6], [0, 0], [0, 12], [-10, -6], [10, -6]]) { const p = new THREE.PointLight('#fff1dc', 14, 18, 1.6); p.position.set(x, H - 1, z); lights.add(p); }
  const wl = new THREE.PointLight('#9ec6ff', 22, 22, 1.4); wl.position.set(0, 4, WALL.z + 3); lights.add(wl);
  b.extra.push(lights);
  b.finish();
  const player = seats.find((s) => s.player);
  return { group: b.group, wall, wallCanvas: cv, wallTex, seat: player };
}

/** 一個調度席:弧形桌面、三個螢幕(播放即時畫面)、鍵盤、椅子 */
function desk(b, M, x, y, z, ry, R, player = false) {
  const g = new THREE.Group();
  const add = (geo, mat, px, py, pz, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.x = rx; g.add(m); return m; };
  add(new THREE.BoxGeometry(2.1, 0.06, 0.9), M.desk, 0, 0.74, 0);
  add(new THREE.BoxGeometry(2.1, 0.72, 0.06), M.deskDark, 0, 0.36, -0.42);
  add(new THREE.BoxGeometry(0.06, 0.72, 0.8), M.deskDark, -1.02, 0.36, 0); add(new THREE.BoxGeometry(0.06, 0.72, 0.8), M.deskDark, 1.02, 0.36, 0);
  add(new THREE.BoxGeometry(2.1, 0.03, 0.06), M.accent, 0, 0.76, 0.44);
  const n = player ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const sx = (i - (n - 1) / 2) * 0.62;
    add(new THREE.BoxGeometry(0.58, 0.36, 0.03), M.bezel, sx, 1.05, -0.3, -0.08);
    const scr = add(new THREE.PlaneGeometry(0.55, 0.32), new THREE.MeshBasicMaterial({ map: screenTex(R, i + (player ? 50 : 0)), toneMapped: false }), sx, 1.05, -0.283, -0.08);
    scr.userData.screen = true;
    add(new THREE.BoxGeometry(0.05, 0.22, 0.05), M.deskDark, sx, 0.86, -0.32);
  }
  add(new THREE.BoxGeometry(0.45, 0.02, 0.15), M.deskDark, -0.2, 0.78, 0.12);
  add(new THREE.BoxGeometry(0.07, 0.02, 0.1), M.deskDark, 0.25, 0.78, 0.14);
  // 無線電話筒
  add(new THREE.BoxGeometry(0.08, 0.04, 0.22), M.chair, 0.7, 0.79, 0.05);
  // 椅子
  add(new THREE.BoxGeometry(0.55, 0.08, 0.5), M.chair, 0, 0.46, 0.95);
  add(new THREE.BoxGeometry(0.55, 0.65, 0.07), M.chair, 0, 0.82, 1.2, -0.1);
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 8), M.deskDark, 0, 0.21, 0.95);
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.updateMatrixWorld(true);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  b.extra.push(g);
}

function carpetTex() {
  const R = rng(12);
  return canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#2c3442'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { c.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.08)'; c.fillRect(R() * w, R() * h, 2, 2); }
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.strokeRect(0, 0, w, h);
  });
}

/** 調度席螢幕:路線圖、列表、CCTV 之類的靜態畫面 */
function screenTex(R, seed) {
  return canvasTexture(256, 150, (c, w, h) => {
    const kind = seed % 3;
    c.fillStyle = '#04070c'; c.fillRect(0, 0, w, h);
    if (kind === 0) {   // 路線圖
      c.strokeStyle = '#3a7bd5'; c.lineWidth = 3; c.beginPath(); c.moveTo(10, 60); c.lineTo(246, 60); c.moveTo(10, 90); c.lineTo(246, 90); c.stroke();
      for (let i = 0; i < 9; i++) { c.fillStyle = '#9fb6d6'; c.fillRect(14 + i * 28, 70, 4, 10); }
      for (let i = 0; i < 4; i++) { c.fillStyle = R() < 0.5 ? '#ff9a1f' : '#4fc3ff'; c.fillRect(20 + R() * 210, R() < 0.5 ? 54 : 84, 18, 12); }
    } else if (kind === 1) {   // 表格
      c.fillStyle = '#1f4e9a'; c.fillRect(0, 0, w, 18);
      for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#0c1422' : '#08101b'; c.fillRect(0, 20 + i * 16, w, 16); c.fillStyle = R() < 0.2 ? '#ff6b5a' : '#9fe0b5'; c.fillRect(8, 25 + i * 16, 30 + R() * 60, 5); c.fillRect(120, 25 + i * 16, 20 + R() * 40, 5); }
    } else {   // CCTV
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#46505a'); g.addColorStop(1, '#1d2228'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = '#7d8790'; c.fillRect(0, h * 0.62, w, h * 0.38); c.fillStyle = '#e8c840'; c.fillRect(0, h * 0.62, w, 3);
      c.fillStyle = '#fff'; c.font = '10px monospace'; c.fillText(`CAM ${10 + seed}`, 6, 12);
    }
  }, { wrap: false });
}

function cctvTex(R, seed) {
  return canvasTexture(320, 180, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3e4852'); g.addColorStop(1, '#14181c'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#6d7680'; c.beginPath(); c.moveTo(0, h); c.lineTo(w * 0.42, h * 0.45); c.lineTo(w * 0.58, h * 0.45); c.lineTo(w, h); c.fill();
    c.fillStyle = '#e8c840'; c.fillRect(w * 0.3, h * 0.7, w * 0.4, 3);
    for (let i = 0; i < 5; i++) { c.fillStyle = 'rgba(20,20,20,0.8)'; c.fillRect(w * (0.3 + R() * 0.4), h * (0.5 + R() * 0.3), 5, 14); }
    c.fillStyle = '#fff'; c.font = '12px monospace'; c.fillText(`CCTV ${seed + 20}  月台`, 8, 16);
  }, { wrap: false });
}
