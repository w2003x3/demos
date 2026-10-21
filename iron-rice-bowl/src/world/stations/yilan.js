// 宜蘭車站(幾米主題車站):平面車站,前站在光復路(西)、後站在林森路(東)。
//   站房 — 外牆彩繪幾米《星空》繪本的森林與星空,站體上方一隻巨大的長頸鹿(閉著眼、伸長脖子)擔任「守門員」。
//   站前對面 — 丟丟噹森林:9 株高約 14 m 的鋼構巨樹(象徵九芎城),樹間懸吊「星空列車」(約 30 m,多節車廂,乘客是動物)。
//   站南 — 幾米廣場/幾米公園:舊宿舍群、《向左走向右走》男女主角、散落的行李箱。
//   月台 — 第 1 月台(側式,緊鄰站房)、第 2 月台(島式),以地下道連通後站。
// 關卡變化:'maze' 廣場以圍欄與展覽牆隔成迂迴動線;'obstacle' 遊客排隊拍長頸鹿、行李箱、攤車。
// 座標:x 沿軌道(+x 北)、z 橫向(+z 東);地面與月台面 y = 0(道床低 1.1 m),地下道 y = -4.5。
import * as THREE from 'three';
import { Builder, T, baseMats, textTex, sign, crowd, wallBox, trainSet, platformEdge, hills, FONT } from './common.js';
import { canvasTexture, rng } from '../../core/textures.js';
import { barrier } from './taipei.js';

const UG = -4.5;
const SIDE = [0, 4.5], ISL = [16.9, 24.9];
const TRK = [6.2, 10.7, 15.2, 26.6];               // 1 股、通過線、2 股、3 股
const BLD = [-22, -16, 22, 0];                     // 前站站房 x0, z0, x1, z1

export function buildYilan({ assets, variant = 'normal', quality = {} }) {
  const b = new Builder(), R = rng(1919);
  const M = baseMats();
  Object.assign(M, {
    paving: M.tex(T.granite('#b9b1a4'), 0.6),
    brickPave: M.tex(T.brick(), 0.85),
    asphalt: M.tex(T.terrazzo('#505255', false), 0.9),
    wall: M.tex(T.plaster('#efece4'), 0.7),
    mural: new THREE.MeshStandardMaterial({ map: muralTex(), roughness: 0.8 }),
    muralSide: new THREE.MeshStandardMaterial({ map: muralTex(2), roughness: 0.8 }),
    roof: M.tex(T.rooftile('#3d4a52'), 0.65),
    floorB: M.tex(T.terrazzo('#c8c3ba'), 0.4),
    ballast: M.tex(T.terrazzo('#6d675f', false), 0.95),
    sleeper: new THREE.MeshStandardMaterial({ color: '#8b8882', roughness: 0.85 }),
    grass: M.tex(T.greenery(), 0.95),
    steelTree: new THREE.MeshStandardMaterial({ color: '#6b6f68', roughness: 0.55, metalness: 0.7 }),
    leafMesh: new THREE.MeshStandardMaterial({ color: '#5f8f3a', roughness: 0.9, side: THREE.DoubleSide }),
    giraffe: new THREE.MeshStandardMaterial({ map: giraffeTex(), roughness: 0.75 }),
    giraffePlain: new THREE.MeshStandardMaterial({ color: '#f2c35a', roughness: 0.75 }),
    giraffeDark: new THREE.MeshStandardMaterial({ color: '#7a4a22', roughness: 0.7 }),
    ink: new THREE.MeshStandardMaterial({ color: '#2a1d16', roughness: 0.6 }),
    blush: new THREE.MeshStandardMaterial({ color: '#f29a8a', roughness: 0.8 }),
    trainBlue: new THREE.MeshStandardMaterial({ color: '#25507a', roughness: 0.45, metalness: 0.3 }),
    trainCream: new THREE.MeshStandardMaterial({ color: '#efe4c8', roughness: 0.5 }),
    warmWin: new THREE.MeshStandardMaterial({ color: '#ffe3a0', emissive: '#ffc96a', emissiveIntensity: 0.9 }),
    wood: M.tex(T.plaster('#5b4636'), 0.8),
    blackTile: M.tex(T.rooftile('#2c2e30'), 0.7),
    coatM: new THREE.MeshStandardMaterial({ color: '#3d5a80', roughness: 0.7 }),
    coatF: new THREE.MeshStandardMaterial({ color: '#c0504d', roughness: 0.7 }),
    skin: new THREE.MeshStandardMaterial({ color: '#f1d4b8', roughness: 0.7 }),
    hill: new THREE.MeshStandardMaterial({ color: '#4f6e42', roughness: 0.95, flatShading: true }),
  });
  const exits = [];

  // ================================================================ 背景:蘭陽平原後方的雪山山脈/遠方街屋
  hills(b, M.hill, -300, 300, -330, 160, 120, 11);
  hills(b, M.hill, -300, 300, 330, 160, 90, 13, Math.PI);
  for (let i = 0; i < 22; i++) {
    const w = 8 + R() * 10, h = 8 + R() * 22, x = -150 + i * 14 + R() * 4;
    b.box(M.wall, w, h, 12, x, 0, -150 - R() * 30);
    b.box(M.wall, w, h, 12, x, 0, 72 + R() * 30);
  }

  // ================================================================ 地面
  b.area('G', 0, -130, -120, 130, -16);             // 站前(廣場、光復路、丟丟噹森林、幾米廣場)
  b.floor(M.brickPave, -130, -26, 130, -16, 0, 2.2);
  b.floor(M.asphalt, -130, -42, 130, -26, 0, 2);    // 光復路
  for (let x = -126; x < 126; x += 6) b.floor(M.light, x, -34.1, x + 3, -33.9, 0.01);
  for (let x = -6; x < 6; x += 1.2) b.floor(M.light, x, -41, x + 0.6, -27, 0.012);   // 斑馬線
  b.floor(M.paving, -130, -120, 130, -42, 0, 1.8);
  // 站前樹(小葉欖仁感:圓冠)
  for (const x of [-50, -36, 36, 50]) tree(b, M, x, -21, 5);
  b.solid('G', -130, -16.2, BLD[0], -15.8); b.solid('G', BLD[2], -16.2, 130, -15.8);   // 站房兩側圍牆

  // ================================================================ 前站站房 + 長頸鹿
  station(b, M);
  giraffe(b, M, 8, 10.8, -6);
  exits.push({ name: '前站(光復路)', floor: 'G', x: 0, z: -30 });

  // ================================================================ 月台與軌道
  b.area('G', 0, BLD[0], BLD[1], BLD[2], BLD[3]);   // 站房大廳
  b.area('G', 0, -110, SIDE[0], 110, SIDE[1]);
  b.area('G', 0, -110, ISL[0], 110, ISL[1]);
  b.floor(M.floorB, BLD[0], BLD[1], BLD[2], BLD[3], 0.002, 1.2);
  for (const [z0, z1] of [SIDE, ISL]) b.box(M.floorB, 220, 1.1, z1 - z0, 0, -1.1, (z0 + z1) / 2);
  platformEdge(b, M, -110, 110, SIDE[1], 0, 1);
  platformEdge(b, M, -110, 110, ISL[0], 0, -1); platformEdge(b, M, -110, 110, ISL[1], 0, 1);
  b.floor(M.ballast, -130, SIDE[1], 130, ISL[0], -1.1, 2);
  b.floor(M.ballast, -130, ISL[1], 130, 30, -1.1, 2);
  for (const z of TRK) {
    for (const s of [-0.53, 0.53]) b.box(M.rail, 260, 0.16, 0.07, 0, -1.1, z + s);
    for (let x = -128; x < 128; x += 0.62) b.box(M.sleeper, 0.24, 0.1, 2.4, x, -1.12, z);
  }
  // 月台雨棚(側式 + 島式)
  for (const [z0, z1] of [SIDE, ISL]) {
    const zc = (z0 + z1) / 2;
    for (let x = -60; x <= 60; x += 10) if (Math.abs(x - 18) > 4) { b.box(M.darkSteel, 0.25, 4.8, 0.25, x, 0, zc); b.solid('G', x - 0.2, zc - 0.2, x + 0.2, zc + 0.2); }
    b.box(M.roof, 130, 0.15, z1 - z0 + 1.2, 0, 4.8, zc);
    for (const x of [-40, 0, 40]) sign(b, textTex('宜蘭 Yilan', { sub: z0 > 5 ? '第 2 月台 · 往 羅東 / 蘇澳 · 往 礁溪 / 臺北' : '第 1 月台 · Platform 1', bg: '#0e3a6b', h: 110, w: 720 }), 3.6, 0.55, x, 3.6, zc, Math.PI / 2);
    for (let x = -50; x <= 50; x += 20) if (Math.abs(x - 18) > 6) { b.box(M.steelPaint, 3, 0.45, 0.5, x, 0, zc); b.solid('G', x - 1.5, zc - 0.3, x + 1.5, zc + 0.3, 0.45); }
  }
  // 列車:1 股區間車、3 股自強號
  trainSet(b, M, -70, 4, -1.0, TRK[0], { stripe: '#2a6bd1' });
  trainSet(b, M, 80, 6, -1.0, TRK[3], { stripe: '#e8730c', dir: -1 });

  // ---- 地下道(站房/第 1 月台 ↔ 第 2 月台 ↔ 後站)
  const UX0 = 14, UX1 = 22;
  b.area('UG', UG, UX1 - 0.1, -1, UX1 + 4, 40);
  b.floor(M.floorB, UX1 - 1, -1, UX1 + 4, 40, UG, 1.2);
  b.floor(M.wall, UX1 - 1, -1, UX1 + 4, 40, UG + 2.8, 3, false);
  wallBox(b, M.wall, 'UG', UX1 + 4, -1, UX1 + 4.3, 40, UG, 2.8);
  wallBox(b, M.wall, 'UG', UX1 - 1, -1.3, UX1 + 4, -1, UG, 2.8);
  wallBox(b, M.wall, 'UG', UX1 - 1, 40, UX1 + 4, 40.3, UG, 2.8);
  for (let z = 0; z < 40; z += 5) b.box(M.light, 2, 0.05, 0.3, UX1 + 1.5, UG + 2.75, z + 2);
  // 地下道兩側牆:幾米插畫磁磚
  muralPlane(b, M.muralSide, UX1 + 3.95, UG + 1.4, 19.5, 41, 2.8, -Math.PI / 2, 4);
  const stairsTo = [[(SIDE[0] + SIDE[1]) / 2, '第 1 月台 · 前站'], [(ISL[0] + ISL[1]) / 2, '第 2 月台'], [36, '後站(林森路)']];
  stairsTo.forEach(([zc, label]) => {
    const n = 26;
    for (let k = 0; k < n; k++) b.box(M.floorB, (UX1 - UX0) / n + 0.02, 0.2, 2.6, UX0 + (k + 0.5) * (UX1 - UX0) / n, UG * (k + 1) / n - 0.2, zc);
    b.stairs.push({ box: [UX0, zc - 1.3, UX1, zc + 1.3], axis: 'x', a: UX0, b: UX1, yA: 0, yB: UG, fromFloor: 'G', toFloor: 'UG', label });
    b.solid('G', UX0 + 1.5, zc - 1.6, UX1 + 0.3, zc - 1.3); b.solid('G', UX0 + 1.5, zc + 1.3, UX1 + 0.3, zc + 1.6);
    b.solid('G', UX1 - 0.4, zc - 1.6, UX1 + 0.3, zc + 1.6);
    b.box(M.steel, UX1 - UX0, 0.06, 0.06, (UX0 + UX1) / 2, 1.0, zc - 1.4); b.box(M.steel, UX1 - UX0, 0.06, 0.06, (UX0 + UX1) / 2, 1.0, zc + 1.4);
    b.solid('UG', UX1 - 1, zc - 1.6, UX1 - 0.1, zc + 1.6);
    sign(b, textTex('地下道', { sub: label, bg: '#1f4e9a', h: 90, w: 420 }), 2.2, 0.48, UX0 + 1, 2.6, zc, -Math.PI / 2);
  });
  // 後站(林森路):小站房與出口
  b.area('G', 0, 4, 32, 40, 52);
  b.floor(M.paving, 4, 32, 40, 52, 0, 1.6);
  b.box(M.wall, 16, 5, 8, 26, 0, 46);
  b.solid('G', 18, 42, 34, 50);
  sign(b, textTex('宜蘭車站 後站', { sub: 'Yilan Station · Rear (Linsen Rd.)', bg: '#0e3a6b', h: 100, w: 560 }), 4.6, 0.8, 26, 4, 41.9, Math.PI, { double: false });
  exits.push({ name: '後站(林森路)', floor: 'G', x: 12, z: 48 });

  // ================================================================ 丟丟噹森林(站前對面)
  forest(b, M, R);
  exits.push({ name: '丟丟噹森林', floor: 'G', x: 0, z: -60 });

  // ================================================================ 幾米廣場(站南)
  jimmyPlaza(b, M, R);
  exits.push({ name: '幾米廣場', floor: 'G', x: -80, z: -30 });

  // ================================================================ 關卡變化
  const spots = [];
  if (variant === 'maze') {
    const ws = [[-30, -50, 30, -50], [-20, -62, -20, -100], [0, -55, 0, -80], [20, -64, 20, -100], [-40, -70, -10, -70], [10, -86, 40, -86], [-60, -24, -60, -60], [-90, -46, -66, -46], [40, -24, 40, -40]];
    for (const [x0, z0, x1, z1] of ws) { const bx = x0 === x1 ? [x0 - 0.3, Math.min(z0, z1), x1 + 0.3, Math.max(z0, z1)] : [x0, z0 - 0.3, x1, z1 + 0.3]; barrier(b, M, ...bx, 0, '動線管制'); b.solid('G', ...bx); }
  }
  if (variant === 'obstacle') {
    // 排隊拍長頸鹿的人龍 + 行李箱 + 攤車
    for (let i = 0; i < 30; i++) spots.push({ x: -14 + (i % 15) * 0.9, z: -22 - Math.floor(i / 15) * 1.1, ry: Math.PI });
    for (let i = 0; i < 16; i++) {
      const x = -60 + R() * 120, z = -20 - R() * 5;
      b.box(new THREE.MeshStandardMaterial({ color: ['#c0392b', '#2471a3', '#d4ac0d', '#7f8c8d'][i % 4], roughness: 0.4 }), 0.5, 0.7, 0.3, x, 0, z, R() * 6);
      b.solid('G', x - 0.4, z - 0.4, x + 0.4, z + 0.4, 0.7);
    }
    for (const x of [-30, -12, 12, 30]) { b.box(M.wood, 2.4, 1.0, 1.2, x, 0, -47); b.box(M.coatF, 2.8, 0.1, 1.6, x, 2.2, -47); b.solid('G', x - 1.3, -47.7, x + 1.3, -46.3); }
  }
  for (let i = 0; i < 50; i++) spots.push({ x: -80 + R() * 160, z: -18 - R() * 8 - (R() < 0.5 ? 0 : 26 + R() * 60) });
  for (let i = 0; i < 24; i++) { const [z0, z1] = i % 2 ? ISL : SIDE; spots.push({ x: -50 + R() * 100, z: z0 + 1.6 + R() * (z1 - z0 - 3.2) }); }
  for (let i = 0; i < 10; i++) spots.push({ x: -16 + R() * 32, z: -13 + R() * 10 });
  b.extra.push(crowd(assets.people, spots.filter((s) => !(s.z < -42 && s.z > -100 && Math.abs(s.x) < 34 && TREES.some(([tx, tz]) => Math.hypot(s.x - tx, s.z - tz) < 1.5))), R));

  // ================================================================ 燈光
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight('#eaf2ff', '#7d7a6e', 1.1));
  const sun = new THREE.DirectionalLight('#fff2dc', 2.7);
  sun.position.set(-30, 70, -50);
  sun.target.position.set(0, 0, -20);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 90, bottom: -90, near: 1, far: 230 });
    sun.shadow.bias = -0.0006;
  }
  lights.add(sun, sun.target);
  for (const z of [4, 18, 32]) { const p = new THREE.PointLight('#f4f8ff', 10, 14, 1.5); p.position.set(UX1 + 1.5, UG + 2.4, z); lights.add(p); }
  { const p = new THREE.PointLight('#fff2dc', 16, 24, 1.5); p.position.set(0, 5, -8); lights.add(p); }
  b.extra.push(lights);
  b.finish();
  return {
    group: b.group, solids: b.solids, floors: b.floors, stairs: b.stairs, exits,
    spawn: { floor: 'G', x: -4, z: -36, yaw: Math.PI },
    name: '宜蘭車站', sky: 'day', variant, ceil: { G: 99, UG: UG + 2.6 },
    poi: [{ name: '長頸鹿車站', floor: 'G', x: 0, z: -40 }, { name: '星空列車', floor: 'G', x: 4, z: -64 }, { name: '向左走向右走', floor: 'G', x: -78, z: -38 }, { name: '地下道', floor: 'UG', x: UX1 + 1.5, z: 10 }],
  };
}

/** 前站站房:兩層白牆 + 深灰斜屋頂,中央入口山牆朝 -z(光復路);立面彩繪幾米森林星空 */
function station(b, M) {
  const [x0, z0, x1, z1] = BLD, H = 8.5;
  // 牆體(背面朝月台留出入口)
  for (const [a, c] of [[x0, -5], [5, x1]]) b.box(M.wall, c - a, H, 0.4, (a + c) / 2, 0, z1 - 0.2, 0, 1.4);
  b.box(M.wall, 10, H - 4.2, 0.4, 0, 4.2, z1 - 0.2, 0, 1.4);
  b.box(M.wall, 0.4, H, z1 - z0, x0 + 0.2, 0, (z0 + z1) / 2, 0, 1.4);
  b.box(M.wall, 0.4, H, z1 - z0, x1 - 0.2, 0, (z0 + z1) / 2, 0, 1.4);
  // 正面:彩繪牆面(中央入口 8 m 寬)
  for (const [a, c] of [[x0, -4], [4, x1]]) {
    b.box(M.wall, c - a, H, 0.4, (a + c) / 2, 0, z0 + 0.2, 0, 1.4);
    muralPlane(b, M.mural, (a + c) / 2, H / 2, z0 - 0.01, c - a, H, Math.PI, (c - a) / 18);
  }
  b.box(M.wall, 8, H - 4.2, 0.4, 0, 4.2, z0 + 0.2, 0, 1.4);
  muralPlane(b, M.mural, 0, (4.2 + H) / 2, z0 - 0.01, 8, H - 4.2, Math.PI, 0.45);
  // 入口雨庇
  b.box(M.darkSteel, 12, 0.35, 3.6, 0, 3.9, z0 - 1.8);
  for (const x of [-5.6, 5.6]) b.box(M.darkSteel, 0.2, 3.9, 0.2, x, 0, z0 - 3.4);
  // 斜屋頂(脊沿 x)+ 正面三角山牆
  const roofW = z1 - z0 + 2, half = roofW / 2, pitch = 0.42;
  for (const s of [-1, 1]) b.add(M.roof, new THREE.BoxGeometry(x1 - x0 + 2, 0.25, half / Math.cos(pitch) + 0.2), 0, H + Math.tan(pitch) * half / 2, (z0 + z1) / 2 + s * half / 2, 0, s * pitch);
  const tri = new THREE.Shape(); tri.moveTo(-half + 1, 0); tri.lineTo(half - 1, 0); tri.lineTo(0, Math.tan(pitch) * (half - 1)); tri.lineTo(-half + 1, 0);
  for (const x of [x0 + 0.2, x1 - 0.2]) b.add(M.wall, new THREE.ExtrudeGeometry(tri, { depth: 0.3, bevelEnabled: false }), x, H, (z0 + z1) / 2, Math.PI / 2);
  // 中央入口的山牆(朝 -z)
  const g2 = new THREE.Shape(); g2.moveTo(-7, 0); g2.lineTo(7, 0); g2.lineTo(0, 4); g2.lineTo(-7, 0);
  b.add(M.wall, new THREE.ExtrudeGeometry(g2, { depth: 2.4, bevelEnabled: false }), 0, H, z0 - 0.4);
  for (const s of [-1, 1]) b.add(M.roof, new THREE.BoxGeometry(8.4, 0.22, 3.2), s * 3.5, H + 2.05, z0 + 0.8, 0, 0, -s * 0.52);
  sign(b, textTex('宜蘭車站', { sub: 'Yilan Station', bg: '#f7f3e6', fg: '#2c5a2e', h: 110, w: 520, border: '#2c5a2e' }), 4.6, 1.0, 0, 5.6, z0 - 0.45, Math.PI, { double: false, glow: false });
  // 入口玻璃門
  const door = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.2), M.glass); door.position.set(0, 2.1, z0 + 0.05); b.extra.push(door);
  // 室內:售票、閘門(往月台出口 x[-4,4] 於 z1)
  b.box(M.wood, 8, 1.1, 1.0, -14, 0, z0 + 3);
  sign(b, textTex('售票', { sub: 'Tickets', bg: '#1f4e9a', h: 90, w: 300 }), 1.8, 0.5, -14, 2.8, z0 + 2.4, Math.PI);
  b.solid('G', -18, z0 + 2.4, -10, z0 + 3.6);
  for (let k = 0; k < 6; k++) { const x = -4 + k * 1.6; b.box(M.steelPaint, 0.28, 1, 1.4, x, 0, z1 - 3); b.solid('G', x - 0.14, z1 - 3.7, x + 0.14, z1 - 2.3, 1.0); }
  b.floor(M.wall, x0, z0, x1, z1, 4.4, 3, false);
  // 碰撞:正面牆(門口除外)、側牆、背牆(閘門後的出口除外)
  b.solid('G', x0, z0 - 0.1, -4, z0 + 0.4); b.solid('G', 4, z0 - 0.1, x1, z0 + 0.4);
  b.solid('G', x0, z0, x0 + 0.4, z1); b.solid('G', x1 - 0.4, z0, x1, z1);
  b.solid('G', x0, z1 - 0.4, -5, z1); b.solid('G', 5, z1 - 0.4, x1, z1);
  b.solid('G', -5.6, z0 - 3.5, -5.4, z0 - 3.3); b.solid('G', 5.4, z0 - 3.5, 5.6, z0 - 3.3);
}

/** 長頸鹿:站在站房屋頂上,閉著眼、伸長脖子往廣場探頭(幾米《走向春天的下午》的微笑長頸鹿) */
function giraffe(b, M, x, y, z) {
  const G = new THREE.Group();
  const add = (geo, mat, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); m.castShadow = true; G.add(m); return m;
  };
  // 身體(橢球),朝 -z(廣場)
  add(new THREE.SphereGeometry(1, 32, 20), M.giraffe, 0, 4.8, 0, 0, 0, 0, 2.0, 1.7, 3.4);
  // 四腿(稍微埋入屋頂,像從屋頂上站起)
  for (const [lx, lz] of [[-1.2, -2.2], [1.2, -2.2], [-1.2, 2.2], [1.2, 2.2]]) {
    add(new THREE.CylinderGeometry(0.38, 0.32, 4.4, 14), M.giraffe, lx, 2.3, lz);
    add(new THREE.CylinderGeometry(0.36, 0.42, 0.5, 14), M.giraffeDark, lx, 0.15, lz);
  }
  // 脖子:往前上方伸長(往 -z 傾)
  const neckLen = 9.5, tilt = 0.42;
  const neck = new THREE.CylinderGeometry(0.55, 1.05, neckLen, 20, 6);
  add(neck, M.giraffe, 0, 5.6 + Math.cos(tilt) * neckLen / 2, -2.4 - Math.sin(tilt) * neckLen / 2, -tilt);
  // 鬃毛
  for (let k = 0; k < 10; k++) {
    const t = k / 10, py = 6.2 + Math.cos(tilt) * neckLen * t, pz = -1.6 - Math.sin(tilt) * neckLen * t;
    add(new THREE.BoxGeometry(0.22, 0.6, 0.5), M.giraffeDark, 0, py, pz + 0.6, -tilt);
  }
  // 頭:長橢球 + 吻部,微低頭看廣場
  const hx = 0, hy = 5.6 + Math.cos(tilt) * neckLen + 0.6, hz = -2.4 - Math.sin(tilt) * neckLen - 0.4;
  add(new THREE.SphereGeometry(1, 28, 18), M.giraffePlain, hx, hy, hz, 0.5, 0, 0, 0.95, 0.9, 1.6);
  add(new THREE.SphereGeometry(1, 24, 16), M.giraffePlain, hx, hy - 0.6, hz - 1.3, 0.5, 0, 0, 0.75, 0.62, 0.9);
  // 鼻孔、微笑
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.09, 10, 8), M.ink, hx + s * 0.3, hy - 0.55, hz - 2.15);
  add(new THREE.TorusGeometry(0.42, 0.045, 8, 24, Math.PI), M.ink, hx, hy - 0.95, hz - 1.95, Math.PI + 0.5, 0, 0);
  // 閉著的眼睛(彎彎的弧線)+ 腮紅
  for (const s of [-1, 1]) {
    add(new THREE.TorusGeometry(0.22, 0.045, 8, 20, Math.PI), M.ink, hx + s * 0.62, hy + 0.25, hz - 0.95, Math.PI - 0.3, s * 0.5, 0);
    add(new THREE.SphereGeometry(0.2, 12, 8), M.blush, hx + s * 0.72, hy - 0.2, hz - 1.0, 0, 0, 0, 1, 0.6, 0.3);
    // 耳朵
    add(new THREE.SphereGeometry(0.5, 14, 10), M.giraffePlain, hx + s * 1.1, hy + 0.55, hz + 0.3, 0, 0, s * 0.9, 1, 0.35, 0.55);
    // 角(皮骨角)
    add(new THREE.CylinderGeometry(0.1, 0.12, 0.9, 10), M.giraffePlain, hx + s * 0.4, hy + 1.1, hz + 0.3, -0.25, 0, s * 0.15);
    add(new THREE.SphereGeometry(0.18, 12, 10), M.giraffeDark, hx + s * 0.46, hy + 1.6, hz + 0.18);
  }
  // 尾巴
  add(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 8), M.giraffePlain, 0, 4.4, 3.6, 0.5);
  add(new THREE.SphereGeometry(0.22, 10, 8), M.giraffeDark, 0, 3.4, 4.2, 0, 0, 0, 1, 1.6, 1);
  G.position.set(x, y, z);
  b.extra.push(G);
}

/** 丟丟噹森林:9 株鋼構巨樹(14 m)+ 樹冠鋼網,樹間懸吊星空列車 */
const TREES = [[-26, -52], [-10, -48], [8, -52], [26, -50], [-20, -70], [0, -68], [20, -72], [-12, -90], [12, -88]];
function forest(b, M, R) {
  b.floor(M.grass, -36, -100, 36, -44, 0.01, 3);
  for (const [x, z] of TREES) {
    const h = 14;
    // 主幹:三根鋼管綁成束
    for (let k = 0; k < 3; k++) { const a = k * 2.09; b.add(M.steelTree, new THREE.CylinderGeometry(0.16, 0.22, h * 0.65, 10), x + Math.cos(a) * 0.3, h * 0.325, z + Math.sin(a) * 0.3); }
    b.solid('G', x - 0.7, z - 0.7, x + 0.7, z + 0.7);
    // 枝:往外斜撐到樹冠
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + R() * 0.3, L = 6 + R() * 2;
      const g = new THREE.CylinderGeometry(0.06, 0.12, L, 8);
      g.rotateZ(-Math.cos(a) * 0.95); g.rotateX(Math.sin(a) * 0.95);
      b.add(M.steelTree, g, x + Math.cos(a) * L * 0.4, h * 0.65 + L * 0.28, z + Math.sin(a) * L * 0.4);
    }
    // 樹冠:鋼網(格子)+ 爬藤綠意
    const crown = new THREE.SphereGeometry(6.5, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42);
    const net = new THREE.Mesh(crown, M._net ??= new THREE.MeshBasicMaterial({ color: '#4d524b', wireframe: true }));
    net.position.set(x, h - 5.2, z); net.scale.set(1, 0.55, 1); b.extra.push(net);
    for (let k = 0; k < 14; k++) {
      const a = R() * Math.PI * 2, r = R() * 5.5;
      b.add(M.leafMesh, new THREE.IcosahedronGeometry(0.9 + R() * 0.8, 0), x + Math.cos(a) * r, h - 1.6 + R() * 1.2 - r * 0.15, z + Math.sin(a) * r, 0, 0, 0, 1, 0.5, 1);
    }
  }
  // 星空列車:4 節車廂(深藍車身 + 米色車頂 + 暖光車窗),由南往北斜斜「飛」起
  const train = new THREE.Group();
  const cars = 4;
  for (let k = 0; k < cars; k++) {
    const car = new THREE.Group();
    const L = 6.8;
    car.add(new THREE.Mesh(new THREE.BoxGeometry(L, 2.4, 2.4), M.trainBlue));
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, L, 20), M.trainCream);
    roof.rotation.z = Math.PI / 2; roof.scale.set(0.42, 1, 1); roof.position.y = 1.2;
    car.add(roof);
    for (let w = 0; w < 4; w++) for (const s of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), M.warmWin);
      win.position.set(-L / 2 + 1 + w * 1.6, 0.35, s * 1.21); if (s < 0) win.rotation.y = Math.PI;
      car.add(win);
      // 窗內的動物乘客(剪影)
      const ani = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), [M.giraffeDark, M.coatF, M.coatM, M.trainCream][(w + k) % 4]);
      ani.position.set(-L / 2 + 1 + w * 1.6, 0.25, s * 1.0); car.add(ani);
    }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(L + 0.02, 0.14, 2.42), M.trainCream); stripe.position.y = -0.55; car.add(stripe);
    for (const s of [-1, 1]) for (const e of [-1, 1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 14), M.ink); wh.rotation.x = Math.PI / 2; wh.position.set(e * (L / 2 - 1), -1.35, s * 1.0); car.add(wh); }
    car.position.set(-14 + k * 7.4, 9 + k * 0.9, -62 + Math.sin(k * 0.7) * 1.5);
    car.rotation.set(0, Math.sin(k * 0.7) * 0.15, 0.12);
    car.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    train.add(car);
    // 吊索
    for (const e of [-2.5, 2.5]) {
      const top = 13.6, cy = car.position.y + 1.4, cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, top - cy, 4), M.darkSteel);
      cable.position.set(car.position.x + e, (top + cy) / 2, car.position.z); train.add(cable);
    }
  }
  // 車尾的熊列車長(脫帽致意)
  const bear = new THREE.Group();
  bear.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), M.giraffeDark));
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.4, 14), M.ink); hat.position.set(0.4, 0.75, 0); hat.rotation.z = -0.5; bear.add(hat);
  bear.position.set(-17.6, 10.2, -62); train.add(bear);
  b.extra.push(train);
  sign(b, textTex('丟丟噹森林', { sub: '星空列車 · Starry Train', bg: '#2c5a2e', h: 100, w: 520 }), 3.6, 0.7, 0, 2.2, -43.6, Math.PI, { glow: false });
  b.box(M.wood, 0.2, 2.6, 0.2, -1.5, 0, -43.7); b.box(M.wood, 0.2, 2.6, 0.2, 1.5, 0, -43.7);
  b.solid('G', -1.7, -43.9, 1.7, -43.5);
  // 一旁的紅磚屋(百果樹藝文空間)
  b.box(M.brickPave, 14, 5, 9, 50, 0, -60, 0, 1.4);
  b.add(M.blackTile, new THREE.ConeGeometry(9.6, 3, 4, 1, false, Math.PI / 4), 50, 6.5, -60, 0, 0, 0, 1.05, 1, 0.68);
  b.solid('G', 43, -64.5, 57, -55.5);
  sign(b, textTex('百果樹紅磚屋', { sub: 'Old Brick House', bg: '#5a2f22', fg: '#f2e7c9', h: 90, w: 440 }), 2.8, 0.55, 50, 3.6, -55.4, Math.PI, { glow: false, double: false });
}

/** 幾米廣場:舊宿舍(日式木屋)、向左走向右走的男女主角、行李箱 */
function jimmyPlaza(b, M, R) {
  b.floor(M.paving, -120, -100, -40, -44, 0.01, 1.6);
  for (const [x, z] of [[-110, -60], [-92, -86], [-64, -88]]) {
    b.box(M.wood, 12, 3.6, 9, x, 0.4, z, 0, 1.2);
    b.box(M.wall, 12.2, 0.4, 9.2, x, 0, z);
    b.add(M.blackTile, new THREE.ConeGeometry(9, 3, 4, 1, false, Math.PI / 4), x, 4 + 1.5, z, 0, 0, 0, 0.95, 1, 0.72);
    b.solid('G', x - 6.2, z - 4.7, x + 6.2, z + 4.7);
  }
  // 向左走向右走:背對背走向相反方向的男女(大衣、手提行李箱)
  person(b, M, -82, -40, M.coatM, 0.4, '#3d3d3d');
  person(b, M, -74, -40, M.coatF, Math.PI + 0.4, '#a0522d');
  b.add(M.wall, new THREE.CylinderGeometry(4.5, 4.5, 0.4, 32), -78, 0.2, -52);   // 水池
  b.add(new THREE.MeshStandardMaterial({ color: '#4a7fa0', roughness: 0.1, metalness: 0.3 }), new THREE.CircleGeometry(4.1, 32), -78, 0.41, -52, 0, -Math.PI / 2);
  b.solid('G', -82.5, -56.5, -73.5, -47.5);
  sign(b, textTex('向左走 · 向右走', { sub: '幾米廣場 Jimmy Square', bg: '#2c5a2e', h: 100, w: 520 }), 3.2, 0.62, -78, 1.6, -45.2, Math.PI, { glow: false });
  // 散落的行李箱(大小、顏色各異,有的疊高)
  const cols = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#9b59b6', '#e67e22', '#ecf0f1'];
  for (let i = 0; i < 26; i++) {
    const x = -116 + R() * 70, z = -98 + R() * 50;
    if (x > -84 && x < -72 && z > -58 && z < -36) continue;
    const s = 0.7 + R() * 1.6, stack = R() < 0.3 ? 2 + (R() * 2 | 0) : 1;
    for (let k = 0; k < stack; k++) b.box(new THREE.MeshStandardMaterial({ color: cols[(i + k) % 7], roughness: 0.5 }), s, s * 0.7, s * 0.35, x, k * s * 0.72, z, R() * 3);
    b.solid('G', x - s * 0.6, z - s * 0.6, x + s * 0.6, z + s * 0.6);
  }
}

/** 雕塑人物(大衣 + 圍巾 + 行李箱),放大 1.4 倍 */
function person(b, M, x, z, coat, ry, hair) {
  const G = new THREE.Group();
  const m = (geo, mat, px, py, pz, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, mat); o.position.set(px, py, pz); o.scale.set(sx, sy, sz); o.castShadow = true; G.add(o); return o; };
  m(new THREE.CylinderGeometry(0.32, 0.45, 1.3, 16), coat, 0, 1.25, 0);
  for (const s of [-1, 1]) m(new THREE.CylinderGeometry(0.1, 0.1, 0.65, 10), M.ink, s * 0.15, 0.32, 0);
  m(new THREE.SphereGeometry(0.24, 16, 12), M.skin, 0, 2.15, 0);
  m(new THREE.SphereGeometry(0.26, 16, 12), new THREE.MeshStandardMaterial({ color: hair, roughness: 0.8 }), 0, 2.24, 0.04, 1, 0.8, 1);
  m(new THREE.TorusGeometry(0.2, 0.07, 8, 16), M.trainCream, 0, 1.88, 0).rotation.x = Math.PI / 2;
  m(new THREE.BoxGeometry(0.5, 0.42, 0.18), new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.6 }), 0.5, 0.55, 0);
  m(new THREE.BoxGeometry(0.04, 0.5, 0.04), M.ink, 0.45, 0.95, 0);
  G.position.set(x, 0, z); G.rotation.y = ry; G.scale.setScalar(1.4);
  b.extra.push(G);
  b.solid('G', x - 0.7, z - 0.7, x + 0.7, z + 0.7);
}

/** 彩繪牆面(平面,UV 橫向重複 rx 次) */
function muralPlane(b, mat, x, y, z, w, h, ry, rx = 1) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * rx);
  b.add(mat, g, x, y, z, ry);
}

/** 站前圓冠樹 */
function tree(b, M, x, z, h) {
  b.add(M.wood, new THREE.CylinderGeometry(0.18, 0.26, h, 10), x, h / 2, z);
  b.add(M.leafMesh, new THREE.IcosahedronGeometry(2.6, 1), x, h + 1.2, z, 0, 0, 0, 1, 0.7, 1);
  b.solid('G', x - 0.4, z - 0.4, x + 0.4, z + 0.4);
}

/** 幾米風彩繪:藍綠漸層夜空 + 星星 + 圓冠樹林 + 小路燈(variant 2:地下道磁磚) */
function muralTex(variant = 1) {
  const R = rng(variant * 31);
  return canvasTexture(1024, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, variant === 1 ? '#7fb8d6' : '#24406b'); g.addColorStop(0.55, variant === 1 ? '#cfe6d2' : '#3d6b7a'); g.addColorStop(1, '#9cc58a');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {   // 星星
      c.fillStyle = `rgba(255,250,220,${0.5 + R() * 0.5})`;
      const x = R() * w, y = R() * h * 0.45, r = 1 + R() * 2.5;
      c.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r * 1.6; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.fill();
    }
    for (let i = 0; i < 26; i++) {   // 圓冠樹
      const x = R() * w, base = h * (0.82 + R() * 0.12), th = h * (0.25 + R() * 0.3), r = 18 + R() * 30;
      c.fillStyle = '#5b4636'; c.fillRect(x - 3, base - th, 6, th);
      c.fillStyle = ['#2f6b3a', '#3f8a46', '#5aa152', '#2a5a35', '#77b25c'][i % 5];
      c.beginPath(); c.arc(x, base - th, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.arc(x - r * 0.3, base - th - r * 0.3, r * 0.4, 0, Math.PI * 2); c.fill();
    }
    for (let i = 0; i < 6; i++) {   // 路燈
      const x = 80 + i * 170;
      c.fillStyle = '#2c2c2c'; c.fillRect(x, h * 0.45, 3, h * 0.5);
      c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(x + 1.5, h * 0.45, 7, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#6b9b58'; c.fillRect(0, h * 0.92, w, h * 0.08);
  }, { wrap: true });
}

/** 長頸鹿斑紋(淡黃底 + 橘褐色不規則斑塊) */
function giraffeTex() {
  const R = rng(5);
  return canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = '#f5d277'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = R() * w, y = R() * h, r = 16 + R() * 18;
      c.fillStyle = ['#d9822b', '#c7702a', '#e0913a'][i % 3];
      c.beginPath();
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, rr = r * (0.75 + R() * 0.4); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      c.fill();
    }
  });
}
