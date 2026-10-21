// 高雄車站(鐵路地下化後新站,Mecanoo 設計):
//   地面 — 「綠之丘」天棚:淨高 6 m 以上的起伏圓頂,上方種植台灣原生植物;由造型各異的「花柱」支撐(最高 15 m);
//          天棚下方是雲朵造型的白色鋁板天花(全區約 2,700 片),並開圓形天窗讓陽光灑下;
//          中軸線上保留帝冠式舊站(1941,灰白外牆、深灰屋瓦的廡殿式屋頂)。
//   B1 — 下沉式廣場進入地下大廳:大跨距圓拱天花,天花以雲朵線條勾勒,照明取自廟埕燈籠意象,天窗引入陽光。
// 關卡變化:'maze' 以臨時圍欄與展覽隔板把廣場隔成動線迷宮;'obstacle' 擺放市集攤位、排隊人潮、清潔車。
// 座標:x 東、z 南;地面 y = 0,B1 地板 y = -7。舊站在北側(z < 0)面向南方廣場。
import * as THREE from 'three';
import { Builder, T, baseMats, textTex, sign, crowd, escalator, FONT } from './common.js';
import { canvasTexture, rng } from '../../core/textures.js';
import { barrier } from './taipei.js';

const B1 = -7;
// 天棚範圍與高度場(起伏的「丘」):h(x,z) 為天棚下緣高度
const CX0 = -80, CX1 = 80, CZ0 = -8, CZ1 = 70;
const roofH = (x, z) => 11 + 3.2 * Math.sin(x * 0.045 + 0.6) * Math.cos(z * 0.06) + 2.2 * Math.cos(x * 0.09 - z * 0.05);
// 天棚外形:有機的圓角輪廓(超橢圓 + 起伏),rho < 1 在天棚內;rho 對 (x, z-中心) 為一次齊次 → 可沿徑向投影到邊界
const CCX = (CX0 + CX1) / 2, CCZ = (CZ0 + CZ1) / 2, CAX = (CX1 - CX0) / 2, CAZ = (CZ1 - CZ0) / 2;
const canopyRho = (x, z) => {
  const dx = (x - CCX) / CAX, dz = (z - CCZ) / CAZ, th = Math.atan2(dz, dx);
  return Math.pow(dx ** 4 + dz ** 4, 0.25) / (1 + 0.05 * Math.sin(3 * th + 0.4) + 0.035 * Math.cos(5 * th + 1.3));
};
// 邊緣往下收:離輪廓約 14 m 內由 6.2 m 升到 roofH
const canopyEdge = (x, z) => Math.max(0, Math.min(1, (1 - canopyRho(x, z)) * CAZ / 14));
const canopyY = (x, z) => 6.2 + (roofH(x, z) - 6.2) * Math.sin(canopyEdge(x, z) * Math.PI / 2);
// 圓形天窗(圓心、半徑)
const OCULI = [[-52, 12, 6], [-20, 34, 7.5], [16, 8, 5], [44, 30, 8], [-40, 52, 6], [60, 56, 5.5], [8, 56, 6.5], [-66, 30, 4.5]];
// 下沉廣場(B1 入口開口)
const SUNK = [-18, 14, 18, 40];

export function buildKaohsiung({ assets, variant = 'normal', quality = {} }) {
  const b = new Builder(), R = rng(1941);
  const M = baseMats();
  Object.assign(M, {
    paving: M.tex(T.granite('#c9c4ba'), 0.55),
    pavingDark: M.tex(T.granite('#8f8a82'), 0.6),
    plaster: M.tex(T.plaster('#d9d6ce'), 0.85),
    roof: M.tex(T.rooftile('#4a4d50'), 0.7),
    green: M.tex(T.greenery(), 0.95),
    white: new THREE.MeshStandardMaterial({ color: '#f4f5f2', roughness: 0.5, metalness: 0.15 }),
    // 雲朵鋁板:從下方看(背光)也要是白的 → 加一點自發光
    cloud: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#e8eef2', emissiveIntensity: 0.45, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide }),
    under: new THREE.MeshStandardMaterial({ color: '#f2f3f0', emissive: '#d9dee2', emissiveIntensity: 0.25, roughness: 0.6, side: THREE.DoubleSide }),
    terrazzo: M.tex(T.terrazzo('#d6d2c8'), 0.3),
    vault: (() => { const t = cloudLines(); return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.7, side: THREE.DoubleSide }); })(),
    lantern: new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffd99a', emissiveIntensity: 1.6, roughness: 0.6 }),
    window: new THREE.MeshStandardMaterial({ color: '#5d6e7a', roughness: 0.15, metalness: 0.3 }),
    sky: new THREE.MeshBasicMaterial({ color: '#cfe6ff' }),
  });
  const exits = [];

  // ================================================================ 地面:廣場鋪面
  b.area('G', 0, -95, -60, 95, 85);
  // 鋪面(下沉廣場開口除外)
  const [sx0, sz0, sx1, sz1] = SUNK;
  for (const [x0, z0, x1, z1] of [[-95, -60, 95, sz0], [-95, sz1, 95, 85], [-95, sz0, sx0, sz1], [sx1, sz0, 95, sz1]]) b.floor(M.paving, x0, z0, x1, z1, 0, 1.6);
  // 鋪面分割線(深色石材帶)
  for (let x = -90; x <= 90; x += 12) b.floor(M.pavingDark, x - 0.2, -60, x + 0.2, 85, 0.002, 1.6);
  // 遠方街區(背景建築:灰白大樓,呼應舊站色彩)
  for (let i = 0; i < 18; i++) {
    const w = 14 + R() * 18, h = 25 + R() * 60, side = i % 2 ? 1 : -1;
    b.box(M.plaster, w, h, 14 + R() * 10, side * (100 + R() * 40), 0, -50 + (i >> 1) * 18);
  }
  for (let i = 0; i < 8; i++) b.box(M.plaster, 20 + R() * 20, 30 + R() * 70, 16, -80 + i * 22, 0, 100 + R() * 10);

  // ================================================================ 帝冠式舊站(中軸線北側)
  oldStation(b, M, 0, -34);
  b.solid('G', -26, -46, 26, -24);
  sign(b, textTex('高雄驛', { sub: '舊站 · 高雄願景館', bg: '#3b3d40', fg: '#f2e7c9', h: 100, w: 420 }), 3.2, 0.78, 0, 11.0, -24.9, 0, { double: false, glow: false });

  // ================================================================ 綠之丘天棚
  canopy(b, M, R);
  // 花柱:沿天棚分布,造型各異(喇叭花、分枝、鬱金香)
  const cols = [[-60, 4], [-34, 6], [-6, 4], [30, 2], [62, 6], [-70, 44], [-46, 28], [-22, 54], [0, 46], [26, 46], [52, 40], [70, 22], [-58, 64], [36, 64]];
  cols.forEach(([x, z], i) => {
    if (x > sx0 - 2 && x < sx1 + 2 && z > sz0 - 2 && z < sz1 + 2) return;
    if (canopyEdge(x, z) < 0.35) return;
    flowerColumn(b, M, x, z, canopyY(x, z), i % 3);
    b.solid('G', x - 0.9, z - 0.9, x + 0.9, z + 0.9);
  });
  // 天棚邊緣入口指標
  sign(b, textTex('高雄車站', { sub: 'Kaohsiung Station · 臺鐵 TRA · 捷運 MRT', bg: '#1f5a3a', h: 110, w: 720 }), 7, 1.1, 0, 4.2, 12, 0);
  exits.push({ name: '中山一路側', floor: 'G', x: 0, z: 82 }, { name: '舊站前', floor: 'G', x: 0, z: -20 }, { name: '建國路側', floor: 'G', x: -90, z: 30 }, { name: '九如路側', floor: 'G', x: 90, z: 30 });

  // ================================================================ 下沉廣場 → B1 地下大廳
  // 階梯廣場(南北向,往南下降)+ 兩側手扶梯
  const steps = 28, drop = B1 / steps, len = (sz1 - sz0 - 6) / steps;
  for (let i = 0; i < steps; i++) b.box(M.paving, sx1 - sx0 - 8, 0.25, len + 0.02, (sx0 + sx1) / 2, i * drop + drop - 0.25, sz0 + len * (i + 0.5));
  escalator(b, M, sx0 + 2.5, sz0 + len * steps, sz0, B1, 0, 1.3);
  escalator(b, M, sx1 - 2.5, sz0, sz0 + len * steps, 0, B1, 1.3);
  // 開口周邊的玻璃欄杆
  for (const [ax, az, bx, bz] of [[sx0, sz0, sx0, sz1], [sx1, sz0, sx1, sz1]]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(bz - az, 1.1), M.glass);
    g.position.set(ax, 0.55, (az + bz) / 2); g.rotation.y = Math.PI / 2;
    b.extra.push(g);
    b.box(M.steel, 0.07, 0.07, bz - az, ax, 1.1, (az + bz) / 2);
    b.solid('G', ax - 0.2, az, ax + 0.2, bz);
  }
  b.solid('G', sx0, sz1 - 0.2, sx1, sz1 + 0.2);
  // 開口兩側的手扶梯區不可走(只走中央階梯)
  b.solid('G', sx0, sz0, sx0 + 4, sz1); b.solid('G', sx1 - 4, sz0, sx1, sz1);
  b.stairs.push({ box: [sx0 + 4, sz0, sx1 - 4, sz0 + len * steps], axis: 'z', a: sz0, b: sz0 + len * steps, yA: 0, yB: B1, fromFloor: 'G', toFloor: 'B1', label: '地下大廳' });
  // B1:地下大廳(圓拱天花)
  const BX0 = -40, BX1 = 40, BZ0 = sz0 + len * steps, BZ1 = 76;
  b.area('B1', B1, BX0, sz0, BX1, BZ1);
  b.floor(M.terrazzo, BX0, BZ0, BX1, BZ1, B1, 1.4);
  b.floor(M.terrazzo, sx0, sz0, sx1, BZ0, B1, 1.4);
  // 大跨距圓拱(沿南北向,跨 80 m)
  // 大跨距扁圓拱:跨 80 m、拱高 6.8 m(拱頂在廣場鋪面下 0.2 m)
  // 圓柱繞 x 轉 90° 後 y = -r·cosθ,取 θ ∈ [π-φ, π+φ] 為頂部一段弧
  const VR = (40 * 40 + 6.8 * 6.8) / (2 * 6.8), VY = B1 + 6.8 - VR, PHI = Math.asin(40 / VR);
  const vault = new THREE.CylinderGeometry(VR, VR, BZ1 - BZ0, 48, 1, true, Math.PI - PHI, 2 * PHI);
  const uv = vault.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * (BZ1 - BZ0) / 14);
  b.add(M.vault, vault, 0, VY, (BZ0 + BZ1) / 2, 0, Math.PI / 2, 0, 1, 1, 1);
  const vaultY = (x) => VY + Math.sqrt(VR * VR - x * x);
  // 拱頂天窗(縱向條帶)與燈籠
  for (let z = BZ0 + 6; z < BZ1 - 2; z += 10) b.box(new THREE.MeshStandardMaterial({ color: '#eaf6ff', emissive: '#d6ecff', emissiveIntensity: 1.2 }), 8, 0.05, 4, 0, vaultY(0) - 0.06, z);
  const lanternGeo = new THREE.SphereGeometry(1, 20, 14);
  const lanterns = [];
  // 只掛在拱頂較高處,燈籠底離地至少 4.2 m(不擋人、不撞鏡頭)
  for (let x = -22.5; x <= 22.5; x += 7.5) for (let z = BZ0 + 5; z < BZ1 - 3; z += 7.5) {
    const y = Math.max(B1 + 5.2, vaultY(x) - 0.9 - R() * 0.7);
    if (vaultY(x) - y > 0.6) lanterns.push([x, y, z]);
  }
  const lm = new THREE.InstancedMesh(lanternGeo, M.lantern, lanterns.length);
  const m4 = new THREE.Matrix4();
  lanterns.forEach(([x, y, z], i) => lm.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(0.55, 0.7, 0.55))));
  b.extra.push(lm);
  for (const [x, y, z] of lanterns) b.box(M.darkSteel, 0.02, vaultY(x) - y - 0.65, 0.02, x, y + 0.65, z);
  // 地下大廳設施:閘門、售票機、服務台、往月台指標
  for (let k = 0; k < 10; k++) { const x = -9 + k * 2; b.box(M.white, 0.3, 1.0, 1.5, x, B1, BZ0 + 20); b.solid('B1', x - 0.15, BZ0 + 19.2, x + 0.15, BZ0 + 20.8, 1.0); }
  sign(b, textTex('臺鐵 月台 Platforms', { sub: '往 1-4 月台 · To Platforms', bg: '#1f4e9a', h: 100, w: 640 }), 6, 0.95, 0, B1 + 3.6, BZ0 + 19.5, 0);
  sign(b, textTex('捷運 R11 高雄車站', { sub: 'MRT Red Line', bg: '#d22630', h: 100, w: 640 }), 5, 0.8, -26, B1 + 3.2, BZ0 + 8, Math.PI / 2);
  for (let i = 0; i < 6; i++) b.box(M.steelPaint, 0.9, 1.7, 0.6, 28 - i * 1.2, B1, BZ0 + 6);
  sign(b, textTex('售票機', { sub: 'Ticket Machines', bg: '#2d3a48', h: 90, w: 400 }), 2.8, 0.6, 25, B1 + 2.6, BZ0 + 5.6, 0);
  b.solid('B1', 21, BZ0 + 5.6, 29, BZ0 + 6.4);
  // 四周牆(拱腳)
  b.box(M.white, 0.6, 4, BZ1 - sz0, BX0, B1, (sz0 + BZ1) / 2); b.box(M.white, 0.6, 4, BZ1 - sz0, BX1, B1, (sz0 + BZ1) / 2);
  b.box(M.white, BX1 - BX0, 7, 0.6, 0, B1, BZ1);
  b.solid('B1', BX0 - 1, sz0, BX0 + 0.3, BZ1); b.solid('B1', BX1 - 0.3, sz0, BX1 + 1, BZ1); b.solid('B1', BX0, BZ1 - 0.3, BX1, BZ1 + 1);
  b.solid('B1', BX0, sz0, sx0, BZ0); b.solid('B1', sx1, sz0, BX1, BZ0);
  exits.push({ name: '臺鐵月台', floor: 'B1', x: 0, z: BZ0 + 23 }, { name: '捷運 R11', floor: 'B1', x: -36, z: BZ0 + 8 });

  // ================================================================ 關卡變化
  if (variant === 'maze') {
    // 臨時圍欄與展覽隔板把天棚下的廣場隔成迂迴動線
    const fences = [[-60, 18, -24, 18.6], [-30, 24, -29.4, 60], [-24, 44, 10, 44.6], [24, 18, 60, 18.6], [30, 24, 30.6, 62], [-70, 32, -40, 32.6], [44, 48, 76, 48.6], [-8, 62, 24, 62.6], [-52, 24, -51.4, 46], [52, 24, 52.6, 44]];
    for (const f of fences) { barrier(b, M, ...f, 0, '動線管制'); b.solid('G', ...f); }
  }
  const spots = [];
  if (variant === 'obstacle') {
    for (let i = 0; i < 10; i++) {
      const x = -60 + (i % 5) * 26 + R() * 6, z = 22 + Math.floor(i / 5) * 26;
      if (x > sx0 - 4 && x < sx1 + 4 && z > sz0 - 4 && z < sz1 + 4) continue;
      stall(b, M, x, z, R);
      b.solid('G', x - 1.6, z - 1.2, x + 1.6, z + 1.2);
      for (let k = 0; k < 4; k++) spots.push({ x: x - 1.5 + k, z: z + 2.2, ry: Math.PI });
    }
  }
  // 人群:廣場與地下大廳
  for (let i = 0; i < 70; i++) {
    const x = -70 + R() * 140, z = -14 + R() * 90;
    if (x > sx0 - 1 && x < sx1 + 1 && z > sz0 - 1 && z < sz1 + 1) continue;
    if (z < -22 && Math.abs(x) < 28) continue;
    spots.push({ x, z });
  }
  for (let i = 0; i < 40; i++) spots.push({ x: -34 + R() * 68, z: BZ0 + 2 + R() * (BZ1 - BZ0 - 4), y: B1 });
  b.extra.push(crowd(assets.people, spots, R));

  // ================================================================ 燈光
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight('#eaf3ff', '#7a7468', 1.0));
  const sun = new THREE.DirectionalLight('#fff3df', 2.6);
  sun.position.set(-30, 60, 40);
  sun.target.position.set(0, 0, 20);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 80, bottom: -80, near: 1, far: 200 });
    sun.shadow.bias = -0.0006;
  }
  lights.add(sun, sun.target);
  for (const [x, z] of [[-20, BZ0 + 10], [20, BZ0 + 10], [-20, BZ0 + 30], [20, BZ0 + 30], [0, BZ0 + 45]]) {
    const p = new THREE.PointLight('#ffe2b0', 22, 26, 1.5); p.position.set(x, B1 + 5, z); lights.add(p);
  }
  b.extra.push(lights);
  b.finish();
  return {
    group: b.group, solids: b.solids, floors: b.floors, stairs: b.stairs, exits,
    spawn: { floor: 'G', x: 0, z: -14, ry: -Math.PI / 2 },
    name: '高雄車站', sky: 'day', variant, ceil: { G: 99, B1: 99 },
    poi: [{ name: '帝冠式舊站', floor: 'G', x: 0, z: -20 }, { name: '綠之丘天棚', floor: 'G', x: 30, z: 30 }, { name: '地下大廳', floor: 'B1', x: 0, z: 50 }],
  };
}

/** 帝冠式舊站:中央高起的主屋(廡殿頂、深灰瓦)+ 兩翼平屋頂;灰白洗石子外牆、直條窗、正面雨庇 */
function oldStation(b, M, cx, cz) {
  // 兩翼
  for (const sx of [-1, 1]) {
    b.box(M.plaster, 16, 8, 14, cx + sx * 17, 0, cz, 0, 2);
    b.box(M.plaster, 16.6, 0.5, 14.6, cx + sx * 17, 8, cz);          // 屋簷線腳
    for (let i = 0; i < 4; i++) { const x = cx + sx * (11 + i * 3.4); b.box(M.window, 1.2, 4.2, 0.08, x, 2.2, cz + 7.02); b.box(M.plaster, 1.6, 0.25, 0.3, x, 6.5, cz + 7.1); }
  }
  // 中央主屋(較高)
  b.box(M.plaster, 18, 12, 18, cx, 0, cz, 0, 2);
  for (let i = 0; i < 4; i++) { const x = cx - 5.4 + i * 3.6; b.box(M.window, 1.4, 6.5, 0.08, x, 3.6, cz + 9.02); }
  b.box(M.plaster, 18.6, 0.6, 18.6, cx, 12, cz);
  // 廡殿頂(四坡,深灰瓦)+ 正脊與鬼瓦
  const roof = new THREE.ConeGeometry(14.5, 7.5, 4, 1, false, Math.PI / 4);
  const ruv = roof.attributes.uv;
  for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * 8, ruv.getY(i) * 5);
  b.add(M.roof, roof, cx, 12.6 + 3.75, cz, 0, 0, 0, 1.0, 1, 0.95);
  b.box(M.roof, 6, 0.6, 0.6, cx, 19.6, cz);
  for (const sx of [-1, 1]) b.box(M.roof, 0.6, 1.2, 0.8, cx + sx * 3, 19.6, cz);
  // 正面入口雨庇與柱
  b.box(M.plaster, 12, 0.6, 4, cx, 5, cz + 11);
  for (const x of [-5, -1.7, 1.7, 5]) b.box(M.plaster, 0.7, 5, 0.7, cx + x, 0, cz + 12.6);
  b.box(M.window, 8, 3.6, 0.08, cx, 0, cz + 9.05);
}

/** 綠之丘天棚:起伏曲面(上方綠化、下方白色)+ 圓形天窗 + 雲朵鋁板天花 */
function canopy(b, M, R) {
  const step = 2.5, nx = Math.round((CX1 - CX0) / step), nz = Math.round((CZ1 - CZ0) / step);
  // 網格頂點:外輪廓外的點沿徑向投影到輪廓上、天窗內的點投影到圓周上 → 邊緣是平滑曲線而非鋸齒
  const vx = [], vz = [], outside = [], inHoleV = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    let x = CX0 + i * step, z = CZ0 + j * step;
    const rho = canopyRho(x, z);
    outside.push(rho >= 1);
    if (rho >= 1) { x = CCX + (x - CCX) / rho * 0.9999; z = CCZ + (z - CCZ) / rho * 0.9999; }
    const hole = OCULI.find(([ox, oz, r]) => (x - ox) ** 2 + (z - oz) ** 2 < r * r);
    inHoleV.push(!!hole);
    if (hole) { const [ox, oz, r] = hole, d = Math.hypot(x - ox, z - oz) || 1e-3; x = ox + (x - ox) / d * r; z = oz + (z - oz) / d * r; }
    vx.push(x); vz.push(z);
  }
  const idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, c = a + nx + 1, q4 = [a, a + 1, c, c + 1];
    if (q4.every((k) => outside[k]) || q4.every((k) => inHoleV[k])) continue;
    idx.push(a, c, a + 1, a + 1, c, c + 1);
  }
  // 上下兩層:下緣白色、上方綠化;厚度 0.6 m 在外緣收成一線(像殼的薄邊)
  const mk = (thick) => {
    const pos = [], uvs = [];
    for (let k = 0; k < vx.length; k++) {
      const x = vx[k], z = vz[k];
      pos.push(x, canopyY(x, z) + (thick ? 0.6 * Math.min(1, canopyEdge(x, z) * 5) : 0), z);
      uvs.push(x / 8, z / 8);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  b.add(M.green, mk(true));
  b.add(M.under, mk(false));   // 天棚下緣(雙面:從廣場抬頭看得到)
  // 天窗:白色圓環收邊 + 內側圓筒(上下緣之間)+ 天光
  for (const [ox, oz, r] of OCULI) {
    const y = canopyY(ox, oz);
    b.add(M.white, new THREE.TorusGeometry(r, 0.3, 8, 56), ox, y - 0.05, oz, 0, Math.PI / 2);
    b.add(M.white, new THREE.TorusGeometry(r, 0.18, 8, 56), ox, y + 0.75, oz, 0, Math.PI / 2);
    b.add(M.under, new THREE.CylinderGeometry(r, r, 0.9, 56, 1, true), ox, y + 0.35, oz);
    const sky = new THREE.Mesh(new THREE.CircleGeometry(r - 0.2, 40), new THREE.MeshBasicMaterial({ color: '#d8ecff', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    sky.rotation.x = -Math.PI / 2;
    sky.position.set(ox, y + 1.2, oz);
    b.extra.push(sky);
  }
  // 雲朵鋁板:天棚下緣吊掛的白色雲形板,隨曲面排列(天窗處留空)
  const cloudShape = new THREE.Shape();
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = 1 + 0.18 * Math.sin(a * 5) + 0.08 * Math.sin(a * 9 + 1);
    const p = [Math.cos(a) * r * 1.6, Math.sin(a) * r];
    if (!i) cloudShape.moveTo(...p); else cloudShape.lineTo(...p);
  }
  const cg = new THREE.ExtrudeGeometry(cloudShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 2 });
  cg.rotateX(-Math.PI / 2);
  const list = [];
  for (let z = CZ0 + 3; z < CZ1 - 3; z += 3.2) for (let x = CX0 + 3; x < CX1 - 3; x += 4.2) {
    const jx = x + (R() - 0.5) * 1.4 + ((z / 3.2) % 2 ? 2.1 : 0), jz = z + (R() - 0.5) * 1.0;
    if (OCULI.some(([ox, oz, r]) => (jx - ox) ** 2 + (jz - oz) ** 2 < (r + 1.6) ** 2)) continue;
    if (canopyRho(jx, jz) > 0.97) continue;
    const h = canopyY(jx, jz);
    list.push([jx, h - 0.9 - R() * 0.7, jz, R() * Math.PI, 0.55 + R() * 0.5]);
  }
  const im = new THREE.InstancedMesh(cg, M.cloud, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  list.forEach(([x, y, z, ry, s], i) => { e.set((R() - 0.5) * 0.12, ry, (R() - 0.5) * 0.12); q.setFromEuler(e); im.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, 1, s))); });
  im.castShadow = true;
  b.extra.push(im);
}

/** 花柱:三種造型(0 喇叭花 / 1 分枝 / 2 鬱金香),白色鋼構 */
function flowerColumn(b, M, x, z, h, kind) {
  if (kind === 1) {
    b.add(M.white, new THREE.CylinderGeometry(0.45, 0.65, h * 0.55, 20), x, h * 0.275, z);
    // 五支斜撐從柱頭往外張開(像樹枝)撐住天棚
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2, L = h * 0.55;
      const g = new THREE.CylinderGeometry(0.16, 0.3, L, 10);
      g.rotateZ(-Math.cos(a) * 0.5); g.rotateX(Math.sin(a) * 0.5);
      b.add(M.white, g, x + Math.cos(a) * L * 0.24, h * 0.55 + L * 0.44, z + Math.sin(a) * L * 0.24);
    }
    return;
  }
  // 車床曲線:細柱身 → 上端張開成花冠
  const prof = kind === 0
    ? [[0.55, 0], [0.42, h * 0.3], [0.38, h * 0.6], [0.8, h * 0.82], [2.6, h * 0.97], [3.2, h]]
    : [[0.6, 0], [0.45, h * 0.45], [0.7, h * 0.72], [1.8, h * 0.9], [2.4, h * 0.97], [2.2, h]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  b.add(M.white, g, x, 0, z);
  // 花冠的肋條
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.box(M.white, 0.12, 0.12, kind === 0 ? 2.6 : 1.9, x + Math.cos(a) * 1.4, h * 0.93, z + Math.sin(a) * 1.4, -a + Math.PI / 2);
  }
}

/** 拱頂的雲朵線條(白底、淡灰流線) */
function cloudLines() {
  const R = rng(9);
  return canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = '#f6f6f2'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(150,160,170,0.55)'; c.lineWidth = 3;
    for (let k = 0; k < 9; k++) {
      c.beginPath();
      const y0 = (k + 0.5) * h / 9;
      c.moveTo(0, y0);
      for (let x = 0; x <= w; x += 16) c.lineTo(x, y0 + Math.sin(x * 0.02 + k) * 18 + Math.sin(x * 0.045 + k * 2) * 8);
      c.stroke();
    }
    c.strokeStyle = 'rgba(190,200,210,0.6)'; c.lineWidth = 2;
    for (let k = 0; k < 14; k++) {   // 雲朵輪廓
      const cx = R() * w, cy = R() * h, r = 20 + R() * 30;
      c.beginPath();
      for (let a = 0; a <= 7; a += 0.2) { const rr = r * (1 + 0.2 * Math.sin(a * 5)); c.lineTo(cx + Math.cos(a) * rr * 1.6, cy + Math.sin(a) * rr); }
      c.stroke();
    }
  });
}

/** 市集攤位(障礙) */
function stall(b, M, x, z, R) {
  const cols = ['#c0392b', '#e67e22', '#2e86c1', '#27ae60'];
  const top = new THREE.MeshStandardMaterial({ color: cols[(R() * 4) | 0], roughness: 0.8 });
  b.box(M.steelPaint, 3, 0.9, 1.6, x, 0, z);
  for (const [dx, dz] of [[-1.45, -0.75], [1.45, -0.75], [-1.45, 0.75], [1.45, 0.75]]) b.box(M.darkSteel, 0.06, 2.4, 0.06, x + dx, 0, z + dz);
  b.box(top, 3.3, 0.1, 2, x, 2.4, z);
}
