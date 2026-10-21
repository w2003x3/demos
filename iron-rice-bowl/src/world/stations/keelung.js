// 基隆車站(第五代,2015-06-29 啟用):縱貫線北端起點,半地下化的頭端式車站,背山面海。
//   北站 — 港西街側、面向基隆港;地面是玻璃帷幕量體(雞籠意象的斜交格子),大廳與月台在地下層,天井掛公共藝術「燦流」。
//   南站 — 跨站式站房(架在軌道上方),玻璃帷幕,樓梯下到月台。
//   月台 — 2 座頭端式島式月台、4 股道;北段上方為舊站址改建的城際轉運站(公車),兩側天窗採光通風;
//          南段露天,第一月台末端保留約 30 m 的鐵鑄雕花棚架與「縱貫線起點」指標。
//   周邊 — 北側港邊步行 1 分鐘:基隆港、海港大樓、郵輪;西側虎仔山上的 KEELUNG 地標字。
// 關卡變化:'maze' 轉運站與月台以圍欄隔出迂迴動線;'obstacle' 行李、貨物推車、排隊人潮。
// 座標:x 沿軌道(+x 北,往港口)、z 橫向;街道 y = 0,月台層 y = -6。
import * as THREE from 'three';
import { Builder, T, baseMats, textTex, sign, crowd, escalator, shopfront, wallBox, trainSet, platformEdge, hills, FONT } from './common.js';
import { canvasTexture, rng } from '../../core/textures.js';
import { barrier } from './taipei.js';

const B1 = -6;
const ISL = [[-11.9, -3.1], [3.1, 11.9]];         // 島式月台
const TRK = [-13.6, -1.4, 1.4, 13.6];             // 股道
const PX0 = -108, PX1 = 26;                       // 月台長度範圍
const LOB = [24, -16, 62, 16];                    // 北站地下大廳
const NS = [44, -15, 64, 15];                     // 北站地面玻璃量體
const SS = [-126, -24, -108, 24];                 // 南站(跨站)
const COV = [-60, 24];                            // 轉運站樓板覆蓋段

export function buildKeelung({ assets, variant = 'normal', quality = {} }) {
  const b = new Builder(), R = rng(2015);
  const M = baseMats();
  Object.assign(M, {
    paving: M.tex(T.granite('#a9a49c'), 0.6),
    asphalt: M.tex(T.terrazzo('#4f5154', false), 0.9),
    concrete: M.tex(T.plaster('#b4b1aa'), 0.85),
    floor: M.tex(T.granite('#cfcac0'), 0.35),
    floorB: M.tex(T.terrazzo('#c4c0b8'), 0.4),
    wall: M.tex(T.plaster('#e3e1dc'), 0.6),
    ballast: M.tex(T.terrazzo('#6b665f', false), 0.95),
    sleeper: new THREE.MeshStandardMaterial({ color: '#8b8882', roughness: 0.85 }),
    frame: new THREE.MeshStandardMaterial({ color: '#4b5157', roughness: 0.35, metalness: 0.7 }),
    castIron: new THREE.MeshStandardMaterial({ color: '#2f3a35', roughness: 0.5, metalness: 0.6 }),
    water: new THREE.MeshStandardMaterial({ color: '#2d4f5e', roughness: 0.12, metalness: 0.35 }),
    hill: new THREE.MeshStandardMaterial({ color: '#4d6b3e', roughness: 0.95, flatShading: true }),
    hillFar: new THREE.MeshStandardMaterial({ color: '#6f8a70', roughness: 1, flatShading: true }),
    harbourBld: M.tex(T.plaster('#e6e1d4'), 0.75),
    ship: new THREE.MeshStandardMaterial({ color: '#f6f7f8', roughness: 0.4, metalness: 0.2 }),
    shipDark: new THREE.MeshStandardMaterial({ color: '#1e2a3a', roughness: 0.4 }),
    red: new THREE.MeshStandardMaterial({ color: '#b8312f', roughness: 0.5 }),
    glow: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.2 }),
    bus: new THREE.MeshStandardMaterial({ color: '#2e7bc4', roughness: 0.35, metalness: 0.3 }),
    busWin: new THREE.MeshStandardMaterial({ color: '#1a1f26', roughness: 0.1 }),
    art: new THREE.MeshStandardMaterial({ color: '#e9d38e', roughness: 0.15, metalness: 1.0, side: THREE.DoubleSide }),
  });
  const exits = [];

  // ================================================================ 背景:山、虎仔山 KEELUNG 字、港口
  hills(b, M.hill, -260, 120, -170, 90, 55, 3);
  hills(b, M.hillFar, -510, -90, -300, 120, 80, 5, Math.PI / 2);
  // 山坡上的住宅(基隆的山城聚落)
  const houseCols = ['#d9d2c5', '#c9b8a0', '#e6e0d2', '#b9c2c4', '#d6c2a6', '#e8d9b8'];
  for (let i = 0; i < 70; i++) {
    const x = -220 + R() * 300, z = -150 - R() * 50, h = 6 + R() * 12;
    b.box(new THREE.MeshStandardMaterial({ color: houseCols[i % 6], roughness: 0.9 }), 6 + R() * 6, h, 6 + R() * 4, x, (z + 150) * -0.45 - 4, z);
  }
  keelungSign(b, M, -40, 42, -168);
  // 港口:水面、碼頭、郵輪、海港大樓
  b.add(M.water, new THREE.PlaneGeometry(500, 700), 330, -1.6, 0, 0, -Math.PI / 2);
  b.box(M.concrete, 8, 1.6, 300, 84, -1.6, 0, 0, 2);   // 碼頭岸壁
  for (let z = -120; z <= 120; z += 12) b.add(M.darkSteel, new THREE.CylinderGeometry(0.3, 0.35, 0.6, 12), 87.2, 0.3, z);
  cruiseShip(b, M, 120, 0);
  harbourBuilding(b, M, 102, -70);
  for (let i = 0; i < 10; i++) b.box(M.harbourBld, 20 + R() * 20, 20 + R() * 50, 18, 420 + R() * 40, 0, -200 + i * 45);   // 對岸
  // 市區街廓(東側,中山一路/港西街一帶)
  for (let i = 0; i < 14; i++) {
    const w = 12 + R() * 12, h = 14 + R() * 34;
    b.box(M.concrete, w, h, 14, -120 + i * 13, 0, 72 + R() * 8);
  }

  // ================================================================ 地面街道(G)
  b.area('G', 0, -126, 18, 88, 66);                 // 東側街道(城市側)
  b.area('G', 0, -126, -66, 88, -18);               // 西側(港西街往海港大樓)
  b.area('G', 0, COV[0], -18, 88, 18);              // 轉運站樓板 + 北站前
  b.area('G', 0, SS[0], SS[1], SS[2], SS[3]);       // 南站跨站大廳
  b.floor(M.paving, -126, 18, 88, 66, 0, 1.6);
  b.floor(M.paving, -126, -66, 88, -18, 0, 1.6);
  b.floor(M.asphalt, 64, -66, 82, 66, 0.01, 2);     // 港西街
  for (let z = -64; z < 64; z += 6) b.floor(M.light, 72.9, z, 73.1, z + 3, 0.02);
  b.floor(M.paving, 82, -66, 88, 66, 0.01, 1.6);    // 港邊步道
  b.solid('G', 87.6, -66, 88, 66);
  // 軌道溝(南段露天):擋土牆與欄杆
  for (const z of [-18, 18]) {
    b.box(M.concrete, COV[0] - SS[2], 6.4, 0.6, (COV[0] + SS[2]) / 2, B1 - 0.4, z + Math.sign(z) * 0.3, 0, 2);
    b.box(M.steel, COV[0] - SS[2], 0.07, 0.07, (COV[0] + SS[2]) / 2, 1.1, z);
    for (let x = SS[2]; x < COV[0]; x += 2) b.box(M.steel, 0.05, 1.1, 0.05, x, 0, z);
    b.solid('G', SS[2], z - 0.3, COV[0], z + 0.3);
  }
  // 南端隧道口(往八堵)
  b.box(M.concrete, 6, 14, 40, -132, B1 - 1, 0, 0, 2);
  b.box(new THREE.MeshStandardMaterial({ color: '#0d0e10' }), 0.2, 5.6, 30, -128.9, B1 - 1, 0);
  hills(b, M.hill, -210, -130, 0, 80, 22, 9, Math.PI / 2);

  // ================================================================ 月台層
  for (const [z0, z1] of ISL) {
    b.area('B1', B1, PX0, z0, PX1, z1);
    b.box(M.floorB, PX1 - PX0, 1.1, z1 - z0, (PX0 + PX1) / 2, B1 - 1.1, (z0 + z1) / 2);
    platformEdge(b, M, PX0, PX1, z0, B1, -1); platformEdge(b, M, PX0, PX1, z1, B1, 1);
  }
  b.floor(M.ballast, -130, -17.6, PX1, 17.6, B1 - 1.1, 2);
  for (const z of TRK) {
    for (const s of [-0.53, 0.53]) b.box(M.rail, PX1 + 130, 0.16, 0.07, (PX1 - 130) / 2, B1 - 1.1, z + s);
    for (let x = -129; x < PX1 - 2; x += 0.62) b.box(M.sleeper, 0.24, 0.1, 2.4, x, B1 - 1.12, z);
    // 頭端車擋
    b.box(M.red, 0.6, 1.2, 2.6, PX1 - 1.6, B1 - 1.1, z);
    b.box(M.glow, 0.05, 0.2, 0.2, PX1 - 1.92, B1 - 0.1, z);
  }
  // 頭端側的月台連通(島式月台北端接大廳)
  b.area('B1', B1, PX1 - 2, -16, LOB[2], 16);
  b.floor(M.floor, PX1 - 2, -16, LOB[2], 16, B1, 1.2);
  b.box(M.floorB, 2, 1.1, 32, PX1 - 1, B1 - 1.1, 0);
  // 轉運站樓板(北段覆蓋):天花、柱、天窗
  const [C0, C1] = COV;
  b.box(M.concrete, C1 - C0, 0.8, 36, (C0 + C1) / 2, -0.8, 0);
  b.floor(M.wall, C0, -18, C1, 18, -0.82, 3, false);
  for (let x = C0 + 6; x < C1; x += 12) for (const z of [-7.5, 7.5]) { b.box(M.wall, 0.9, 5.2, 0.9, x, B1, z); b.solid('B1', x - 0.5, z - 0.5, x + 0.5, z + 0.5); }
  for (let x = C0 + 3; x < C1 - 2; x += 6) for (const z of [-7.5, 7.5]) b.box(M.light, 4, 0.05, 0.4, x, -0.86, z);
  // 兩側天窗(玻璃條帶,樓板上看是低矮天窗)
  for (const z of [-15.5, 15.5]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(C1 - C0 - 4, 3), M.glass);
    g.rotation.x = -Math.PI / 2; g.position.set((C0 + C1) / 2, 0.9, z); b.extra.push(g);
    b.box(M.frame, C1 - C0 - 4, 0.9, 0.12, (C0 + C1) / 2, 0, z - 1.5); b.box(M.frame, C1 - C0 - 4, 0.9, 0.12, (C0 + C1) / 2, 0, z + 1.5);
    b.solid('G', C0 + 2, z - 1.6, C1 - 2, z + 1.6);
  }
  // 露天段的月台雨棚(現代鋼構)
  for (const [z0, z1] of ISL) {
    const zc = (z0 + z1) / 2;
    for (let x = -92; x < C0; x += 8) if (!(z0 < 0 && x < -60 && x > -94)) b.box(M.frame, 0.3, 4.4, 0.3, x, B1, zc);
    b.box(M.frame, C0 + 92, 0.15, z1 - z0 + 1, (C0 - 92) / 2, B1 + 4.4, zc);
    for (let x = -92; x < C0; x += 8) b.solid('B1', x - 0.2, zc - 0.2, x + 0.2, zc + 0.2);
  }
  // 第一月台(z<0 島)末端:鐵鑄雕花棚架(約 30 m)+ 縱貫線起點
  castIronCanopy(b, M, -100, -70, (ISL[0][0] + ISL[0][1]) / 2);
  const ks = new THREE.Group();
  b.box(M.wall, 0.25, 1.6, 0.25, -66, B1, -7.5);
  sign(b, textTex('縱貫線起點', { sub: '0K+000 · Western Line Start', bg: '#f4f1e8', fg: '#1d2f5a', h: 110, w: 520, border: '#1d2f5a' }), 1.8, 0.4, -66, B1 + 1.95, -7.5, Math.PI / 2, { glow: false });
  b.solid('B1', -66.3, -7.8, -65.7, -7.2);
  // 站名牌、月台號碼
  ISL.forEach(([z0, z1], i) => {
    const zc = (z0 + z1) / 2;
    for (const x of [-80, -30, 10]) sign(b, textTex('基隆 Keelung', { sub: `第 ${i + 1} 月台 · 往 七堵 / 樹林 / 蘇澳`, bg: '#0e3a6b', h: 110, w: 720 }), 3.6, 0.55, x, B1 + 2.9, zc, Math.PI / 2);
    for (let x = -96; x <= 16; x += 22) { b.box(M.steelPaint, 3, 0.45, 0.5, x, B1, zc); b.solid('B1', x - 1.5, zc - 0.3, x + 1.5, zc + 0.3, 0.45); }
  });
  // 列車:1、4 股道各一列(區間車藍帶 / 自強號橙帶)
  trainSet(b, M, PX1 - 3, 8, B1 - 1.0, TRK[0], { stripe: '#2a6bd1', dir: -1 });
  trainSet(b, M, PX1 - 3, 6, B1 - 1.0, TRK[3], { stripe: '#e8730c', dir: -1 });

  // ================================================================ 北站:地下大廳 + 地面玻璃量體(雞籠格子)
  const [L0, LZ0, L1, LZ1] = LOB;
  b.area('B1', B1, L0, LZ0, L1, LZ1);
  b.floor(M.floor, L0, LZ0, L1, LZ1, B1 + 0.001, 1.2);
  wallBox(b, M.wall, 'B1', L0, LZ0 - 0.4, L1, LZ0, B1, 6); wallBox(b, M.wall, 'B1', L0, LZ1, L1, LZ1 + 0.4, B1, 6);
  wallBox(b, M.wall, 'B1', L1, LZ0, L1 + 0.4, LZ1, B1, 6);
  b.floor(M.wall, L0, LZ0, NS[0], LZ1, -0.82, 3, false);   // 大廳天花(街道下方),北段為挑空天井
  // 閘門線(x = 34)
  for (let k = 0; k < 16; k++) {
    const z = LZ0 + 3 + k * 1.6; if (z > LZ1 - 3) break;
    b.box(M.steelPaint, 1.4, 1.0, 0.28, 34, B1, z); b.box(M.darkSteel, 1.4, 0.05, 0.3, 34, B1 + 1, z);
    b.solid('B1', 33.3, z - 0.14, 34.7, z + 0.14, 1.0);
  }
  b.solid('B1', 33.3, LZ0, 34.7, LZ0 + 2.6); b.solid('B1', 33.3, LZ1 - 2.6, 34.7, LZ1);
  sign(b, textTex('剪票口 · 往月台', { sub: 'Ticket Gates · To Platforms', bg: '#1f4e9a', h: 100, w: 600 }), 5.2, 0.85, 34, B1 + 3.2, 0, -Math.PI / 2);
  // 售票、商店
  for (let i = 0; i < 5; i++) b.box(M.steelPaint, 0.9, 1.7, 0.6, 40 + i * 1.3, B1, LZ0 + 0.7);
  b.solid('B1', 39.4, LZ0, 46.6, LZ0 + 1.1);
  sign(b, textTex('售票 · 旅客服務', { sub: 'Tickets · Information', bg: '#1f4e9a', h: 100, w: 520 }), 3.8, 0.7, 43, B1 + 2.8, LZ0 + 0.45, 0, { double: false });
  shopfront(b, M, '臺鐵便當本舖', 'TRA Bento', '#b23a2a', 38, 46, LZ1 - 0.1, B1, 4.2, -1, R); b.solid('B1', 38, LZ1 - 1, 46, LZ1);
  shopfront(b, M, '全家便利商店', 'FamilyMart', '#00a0e9', 48, 56, LZ1 - 0.1, B1, 4.2, -1, R); b.solid('B1', 48, LZ1 - 1, 56, LZ1);
  // 往地面的大樓梯(北站量體內,沿 +x 上升到港西街側)+ 手扶梯
  const sa = 46, sb2 = 60;
  for (let i = 0; i < 30; i++) b.box(M.floor, (sb2 - sa) / 30 + 0.02, 0.22, 6, sa + (i + 0.5) * (sb2 - sa) / 30, B1 - B1 * (i + 1) / 30 - 0.22, 0);
  b.stairs.push({ box: [sa, -3, sb2, 3], axis: 'x', a: sa, b: sb2, yA: B1, yB: 0, fromFloor: 'B1', toFloor: 'G', label: '北站出口(港西街)' });
  for (const z of [-4.6, 4.6]) { const g = new THREE.BoxGeometry(sb2 - sa, 0.08, 1.2); b.add(M.darkSteel, g, (sa + sb2) / 2, B1 / 2, z, 0, 0, Math.atan2(-B1, sb2 - sa)); }
  b.solid('B1', sa + 1.5, -6, sb2, -3); b.solid('B1', sa + 1.5, 3, sb2, 6); b.solid('B1', sa + 2, -3, L1, 3);
  b.solid('G', NS[0], -6, sb2, 6);   // 地面層的樓梯開口
  northStation(b, M, R);
  exits.push({ name: '北站(港西街)', floor: 'G', x: 70, z: 0 }, { name: '基隆港邊', floor: 'G', x: 85, z: -30 });

  // ================================================================ 南站:跨站式大廳(架在軌道上方)
  southStation(b, M);
  ISL.forEach(([z0, z1], i) => {
    const zc = (z0 + z1) / 2, a = SS[2], c = SS[2] + 14;
    for (let k = 0; k < 30; k++) b.box(M.floorB, (c - a) / 30 + 0.02, 0.2, 3, a + (k + 0.5) * (c - a) / 30, B1 * (k + 1) / 30 - 0.2 + 0, zc);
    b.stairs.push({ box: [a, zc - 1.5, c, zc + 1.5], axis: 'x', a, b: c, yA: 0, yB: B1, fromFloor: 'G', toFloor: 'B1', label: `南站 · 第 ${i + 1} 月台` });
    b.solid('B1', PX0, zc - 1.7, c - 0.6, zc - 1.5); b.solid('B1', PX0, zc + 1.5, c - 0.6, zc + 1.7);
    b.solid('B1', PX0, zc - 1.7, c - 1, zc + 1.7);   // 樓梯下方
    b.box(M.frame, c - a, 0.05, 3.4, (a + c) / 2, 4.2, zc);   // 樓梯雨棚
    b.solid('G', a, zc - 1.8, a + 0.2, zc - 1.5); b.solid('G', a, zc + 1.5, a + 0.2, zc + 1.8);
  });
  // 南站大廳與兩側街道之間的開口:欄杆擋住 z 在月台樓梯以外的邊緣
  b.solid('G', SS[2] - 0.2, -18, SS[2] + 0.2, ISL[0][0] + 2.2); b.solid('G', SS[2] - 0.2, ISL[0][1] - 2.2, SS[2] + 0.2, ISL[1][0] + 2.2); b.solid('G', SS[2] - 0.2, ISL[1][1] - 2.2, SS[2] + 0.2, 18);
  exits.push({ name: '南站', floor: 'G', x: -117, z: 30 });

  // ================================================================ 城際轉運站(樓板上方)
  for (let k = 0; k < 4; k++) {
    const x = -46 + k * 16;
    bus(b, M, x, -6); bus(b, M, x, 6);
    b.solid('G', x - 6, -7.4, x + 6, -4.6); b.solid('G', x - 6, 4.6, x + 6, 7.4);
  }
  b.box(M.frame, 70, 0.3, 30, -18, 6, 0); // 候車棚
  for (let x = -50; x <= 14; x += 16) for (const z of [-13, 13]) { b.box(M.frame, 0.35, 6, 0.35, x, 0, z); b.solid('G', x - 0.3, z - 0.3, x + 0.3, z + 0.3); }
  sign(b, textTex('基隆城際轉運站', { sub: 'Keelung Intercity Bus Terminal', bg: '#0e3a6b', h: 100, w: 640 }), 6, 0.9, 20, 4.8, 0, -Math.PI / 2);
  exits.push({ name: '城際轉運站', floor: 'G', x: -20, z: 0 });

  // ================================================================ 關卡變化
  const spots = [];
  if (variant === 'maze') {
    const ws = [[-40, 20, -40, 50], [-10, 24, -10, 60], [20, 20, 20, 44], [-70, 30, -20, 30], [0, 40, 50, 40], [-50, -18, -50, -50], [0, -24, 0, -60], [40, -30, 60, -30]];
    for (const [x0, z0, x1, z1] of ws) { const bx = x0 === x1 ? [x0 - 0.3, z0, x1 + 0.3, z1] : [x0, z0 - 0.3, x1, z1 + 0.3]; barrier(b, M, ...bx, 0, '動線管制'); b.solid('G', ...bx); }
    for (const [z0, z1] of ISL) for (const x of [-40, -10, 14]) { barrier(b, M, x - 0.3, z0 + 1.6, x + 0.3, z1 - 0.2, B1, '施工中'); b.solid('B1', x - 0.3, z0 + 1.6, x + 0.3, z1 - 0.2); }
  }
  if (variant === 'obstacle') {
    for (let i = 0; i < 18; i++) {
      const isl = ISL[i % 2], x = -90 + R() * 105, z = isl[0] + 2 + R() * (isl[1] - isl[0] - 4);
      b.box(new THREE.MeshStandardMaterial({ color: ['#c0392b', '#2471a3', '#d4ac0d', '#7f8c8d'][i % 4], roughness: 0.4 }), 0.5, 0.7, 0.3, x, B1, z, R() * 6);
      b.solid('B1', x - 0.4, z - 0.4, x + 0.4, z + 0.4, 0.7);
    }
    for (let i = 0; i < 20; i++) spots.push({ x: 40 + (i % 10) * 0.9, z: LZ0 + 2.6 + Math.floor(i / 10), y: B1, ry: Math.PI });
    for (const [x, z] of [[50, 8], [-80, -8], [-30, 8]]) { b.box(M.darkSteel, 1.8, 1.1, 0.9, x, B1, z); b.solid('B1', x - 1, z - 0.5, x + 1, z + 0.5, 1.1); }
  }
  for (let i = 0; i < 30; i++) { const isl = ISL[i % 2]; spots.push({ x: -95 + R() * 115, z: isl[0] + 1.8 + R() * (isl[1] - isl[0] - 3.6), y: B1 }); }
  for (let i = 0; i < 14; i++) spots.push({ x: 36 + R() * 8, z: -12 + R() * 24, y: B1 });
  for (let i = 0; i < 40; i++) spots.push({ x: -110 + R() * 190, z: (R() < 0.5 ? -1 : 1) * (22 + R() * 38) });
  for (let i = 0; i < 12; i++) spots.push({ x: 84 + R() * 3, z: -60 + R() * 120 });
  b.extra.push(crowd(assets.people, spots, R));

  // ================================================================ 燈光(雨港:偏冷的天光)
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight('#e2ecf5', '#6f6c66', 1.15));
  const sun = new THREE.DirectionalLight('#f4f2ec', 2.2);
  sun.position.set(40, 70, 40);
  sun.target.position.set(0, 0, 0);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -140, right: 120, top: 90, bottom: -90, near: 1, far: 260 });
    sun.shadow.bias = -0.0006;
  }
  lights.add(sun, sun.target);
  for (const x of [-50, -26, -2, 20]) for (const z of [-7.5, 7.5]) { const p = new THREE.PointLight('#f4f8ff', 12, 18, 1.5); p.position.set(x, -1.5, z); lights.add(p); }
  for (const x of [32, 48]) { const p = new THREE.PointLight('#fff2dc', 20, 24, 1.5); p.position.set(x, -1.5, 0); lights.add(p); }
  b.extra.push(lights);
  b.finish();
  return {
    group: b.group, solids: b.solids, floors: b.floors, stairs: b.stairs, exits,
    spawn: { floor: 'G', x: 76, z: 6, yaw: -Math.PI / 2 },
    name: '基隆車站', sky: 'day', variant, ceil: { G: 99, B1: -1.9 },
    poi: [{ name: '北站大廳 · 燦流', floor: 'B1', x: 52, z: 8 }, { name: '縱貫線起點', floor: 'B1', x: -68, z: -7.5 }, { name: '鐵鑄雕花棚架', floor: 'B1', x: -85, z: -7.5 }, { name: '南站', floor: 'G', x: -117, z: 0 }],
  };
}

/** 北站地面量體:玻璃帷幕 + 斜交格子(雞籠意象),天井掛「燦流」 */
function northStation(b, M, R) {
  const [x0, z0, x1, z1] = NS, H = 12;
  lattice(b, M, x1, z0, x1, z1, H, [[-3.2, 3.2]]);     // 面港西街(中央留入口)
  lattice(b, M, x0, z0, x1, z0, H); lattice(b, M, x0, z1, x1, z1, H);
  lattice(b, M, x0, z0, x0, z1, H);
  // 屋頂:斜交格子 + 玻璃
  const g = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), M.glass);
  g.rotation.x = -Math.PI / 2; g.position.set((x0 + x1) / 2, H, (z0 + z1) / 2); b.extra.push(g);
  // 屋頂斜交格子:x = t + s·(z - z0),裁切到屋頂矩形
  for (let t = x0 - (z1 - z0); t < x1 + (z1 - z0); t += 2.4) for (const s of [1, -1]) {
    const za = Math.max(z0, Math.min(z0 + (x0 - t) / s, z0 + (x1 - t) / s)), zb = Math.min(z1, Math.max(z0 + (x0 - t) / s, z0 + (x1 - t) / s));
    if (zb - za < 0.2) continue;
    const zm = (za + zb) / 2, xm = t + s * (zm - z0);
    b.add(M.frame, new THREE.BoxGeometry((zb - za) * Math.SQRT2, 0.14, 0.14), xm, H, zm, -s * Math.PI / 4);
  }
  b.box(M.frame, x1 - x0, 0.6, 0.6, (x0 + x1) / 2, H, z0); b.box(M.frame, x1 - x0, 0.6, 0.6, (x0 + x1) / 2, H, z1);
  // 碰撞:三面牆實心,港西街面留門;內部樓梯開口在主程式處理
  b.solid('G', x0, z0 - 0.2, x1, z0 + 0.2); b.solid('G', x0, z1 - 0.2, x1, z1 + 0.2); b.solid('G', x0 - 0.2, z0, x0 + 0.2, z1);
  b.solid('G', x1 - 0.2, z0, x1 + 0.2, -3.2); b.solid('G', x1 - 0.2, 3.2, x1 + 0.2, z1);
  b.solid('G', x0, z0, 60, -6); b.solid('G', x0, 6, 60, z1);   // 量體內樓梯以外是挑空
  sign(b, textTex('基隆車站', { sub: 'Keelung Station · 北站 North', bg: '#0e3a6b', h: 110, w: 640 }), 6.4, 1.1, x1 + 0.4, H - 1.6, 0, Math.PI / 2, { double: false });
  // 「燦流」:天井裡如水流般的金色金屬片(大廳上方懸吊)
  const geo = new THREE.PlaneGeometry(0.85, 0.5);
  const n = 1600, im = new THREE.InstancedMesh(geo, M.art, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < n; i++) {
    const t = i / n, x = 45 + t * 17, z = Math.sin(t * 7) * 4 + (R() - 0.5) * 3.2 - 1, y = -2.5 + Math.sin(t * Math.PI * 2) * 2.2 + (R() - 0.5) * 2.2 + 8 * t;
    e.set(R() * 6, R() * 6, R() * 6); q.setFromEuler(e);
    im.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z + 8), q, new THREE.Vector3(1, 1, 1)));
  }
  b.extra.push(im);
  for (let i = 0; i < 20; i++) b.box(M.steel, 0.01, 6, 0.01, 46 + i * 0.8, 6, 8 + Math.sin(i) * 4);
  sign(b, textTex('燦流', { sub: '公共藝術 Public Art', bg: '#2a2a2a', fg: '#f1d98a', h: 90, w: 320 }), 1.6, 0.45, 47, B1 + 1.6, LOB[3] - 0.3, Math.PI, { glow: false, double: false });
}

/** 斜交格子玻璃牆(雞籠意象):沿 (ax,az)→(bx,bz),高 H;gaps 為沿牆的入口區間(相對牆中心,入口處 4 m 以下不擺斜桿) */
function lattice(b, M, ax, az, bx, bz, H, gaps = []) {
  const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax);
  const cx = (ax + bx) / 2, cz = (az + bz) / 2, ux = (bx - ax) / len, uz = (bz - az) / len;
  const g = new THREE.Mesh(new THREE.PlaneGeometry(len, H), M.glass);
  g.position.set(cx, H / 2, cz); g.rotation.y = ry; b.extra.push(g);
  const step = 2.4, half = len / 2;
  for (let t = -half - H; t < half + H; t += step) for (const s of [1, -1]) {
    // 斜線 u = t + s·y(y ∈ [0, H]),裁切到 u ∈ [-half, half]
    let y0 = 0, y1 = H;
    const ya = (-half - t) / s, yb = (half - t) / s;
    y0 = Math.max(y0, Math.min(ya, yb)); y1 = Math.min(y1, Math.max(ya, yb));
    if (y1 - y0 < 0.2) continue;
    const ym = (y0 + y1) / 2, um = t + s * ym;
    if (gaps.some(([a, c]) => um > a - 1 && um < c + 1) && ym < 4) continue;
    b.add(M.frame, new THREE.BoxGeometry((y1 - y0) * Math.SQRT2, 0.12, 0.12), cx + ux * um, ym, cz + uz * um, ry, 0, s * Math.PI / 4);
  }
  for (const y of [0, H / 2, H - 0.3]) b.box(M.frame, len, 0.3, 0.3, cx, y, cz, ry);
}

/** 南站:架在軌道上的跨站大廳(玻璃帷幕 + 斜交格子),往兩座月台的樓梯 */
function southStation(b, M) {
  const [x0, z0, x1, z1] = SS, H = 10;
  b.box(M.concrete, x1 - x0, 1, z1 - z0, (x0 + x1) / 2, -1, (z0 + z1) / 2);   // 跨站樓板
  b.floor(M.floor, x0, z0, x1, z1, 0.002, 1.2);
  b.floor(M.wall, x0, z0, x1, z1, B1 - 0.0 + 4.8, 3, false);
  lattice(b, M, x0, z0, x0, z1, H);
  lattice(b, M, x0, z0, x1, z0, H, [[-3, 3]]); lattice(b, M, x0, z1, x1, z1, H, [[-3, 3]]);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color: '#5a6168', roughness: 0.5, metalness: 0.4 }));
  g.rotation.x = Math.PI / 2; g.position.set((x0 + x1) / 2, H, (z0 + z1) / 2); b.extra.push(g);
  b.box(M.frame, x1 - x0 + 1, 0.8, z1 - z0 + 1, (x0 + x1) / 2, H, (z0 + z1) / 2);
  b.solid('G', x0 - 0.2, z0, x0 + 0.2, z1);
  b.solid('G', x0, z0 - 0.2, (x0 + x1) / 2 - 3, z0 + 0.2); b.solid('G', (x0 + x1) / 2 + 3, z0 - 0.2, x1, z0 + 0.2);
  b.solid('G', x0, z1 - 0.2, (x0 + x1) / 2 - 3, z1 + 0.2); b.solid('G', (x0 + x1) / 2 + 3, z1 - 0.2, x1, z1 + 0.2);
  // 閘門(跨站大廳中央,沿 x)
  // 閘門線(z = ±13):街道側 → 付費區(中央往月台樓梯)
  for (const zg of [-13, 13]) {
    for (let k = 0; k < 8; k++) { const x = x0 + 4 + k * 1.6; b.box(M.steelPaint, 0.28, 1, 1.4, x, 0, zg); b.solid('G', x - 0.14, zg - 0.7, x + 0.14, zg + 0.7, 1.0); }
    b.solid('G', x0, zg - 0.7, x0 + 3.6, zg + 0.7); b.solid('G', x0 + 4 + 7 * 1.6 + 0.4, zg - 0.7, x1, zg + 0.7);
  }
  sign(b, textTex('基隆車站 南站', { sub: 'Keelung Station · South', bg: '#0e3a6b', h: 110, w: 640 }), 6, 1, (x0 + x1) / 2, H - 1.6, z1 + 0.4, 0, { double: false });
  sign(b, textTex('往月台', { sub: 'To Platforms 1 · 2', bg: '#1f4e9a', h: 100, w: 420 }), 3, 0.7, x1 - 0.5, 3.2, 0, Math.PI / 2);
}

/** 鐵鑄雕花棚架(第一月台末端保留):鑄鐵柱 + 雕花托架 + 雙坡屋頂 */
function castIronCanopy(b, M, x0, x1, zc) {
  for (let x = x0; x <= x1; x += 6) {
    b.add(M.castIron, new THREE.CylinderGeometry(0.14, 0.2, 3.8, 12), x, B1 + 1.9, zc);
    b.add(M.castIron, new THREE.TorusGeometry(0.6, 0.05, 6, 20, Math.PI), x, B1 + 3.4, zc - 0.6, Math.PI / 2, 0);
    b.add(M.castIron, new THREE.TorusGeometry(0.6, 0.05, 6, 20, Math.PI), x, B1 + 3.4, zc + 0.6, -Math.PI / 2, 0);
    for (const s of [-1, 1]) {
      // 雕花托架:兩個交疊的圓環 + 斜撐
      b.add(M.castIron, new THREE.TorusGeometry(0.35, 0.04, 6, 16), x, B1 + 3.3, zc + s * 1.2, Math.PI / 2);
      b.add(M.castIron, new THREE.BoxGeometry(0.06, 0.06, 2.2), x, B1 + 3.55, zc + s * 1.2, 0, s * 0.35);
    }
    b.solid('B1', x - 0.25, zc - 0.25, x + 0.25, zc + 0.25);
  }
  const roof = new THREE.BoxGeometry(x1 - x0 + 3, 0.08, 4.6);
  b.add(M.castIron, roof, (x0 + x1) / 2, B1 + 4.2, zc - 2.1, 0, 0.16);
  b.add(M.castIron, roof, (x0 + x1) / 2, B1 + 4.2, zc + 2.1, 0, -0.16);
  b.box(M.castIron, x1 - x0, 0.2, 0.2, (x0 + x1) / 2, B1 + 3.8, zc);
  // 簷口垂飾(木雕花邊感)
  for (let x = x0 - 1.4; x < x1 + 1.4; x += 0.5) for (const s of [-1, 1]) b.box(M.castIron, 0.18, 0.28, 0.03, x, B1 + 3.62, zc + s * 4.4);
}

/** 公車 */
function bus(b, M, x, z) {
  b.box(M.bus, 11.5, 2.6, 2.5, x, 0.4, z);
  b.box(M.busWin, 11.52, 1.1, 2.52, x, 1.6, z);
  b.box(M.shipDark, 11.4, 0.4, 2.4, x, 0, z);
}

/** 虎仔山 KEELUNG 地標字(白色,立在山坡) */
function keelungSign(b, M, x, y, z) {
  const tex = canvasTexture(1024, 160, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; c.font = `900 140px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('KEELUNG', w / 2, h / 2 + 6);
  }, { wrap: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(48, 7.5), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.y = 0.15;
  b.extra.push(m);
}

/** 郵輪(港內停靠) */
function cruiseShip(b, M, x, z) {
  b.box(M.shipDark, 26, 8, 200, x, -4, z);                 // 船殼
  for (let k = 0; k < 6; k++) b.box(M.ship, 24 - k, 2.8, 170 - k * 12, x, 4 + k * 2.8, z - 6);
  for (let k = 0; k < 5; k++) b.box(M.busWin, 24.2 - k, 0.5, 168 - k * 12, x, 5.2 + k * 2.8, z - 6);
  b.box(M.red, 6, 6, 10, x, 20.8, z - 30);                  // 煙囪
  b.box(M.ship, 26, 3, 30, x, 4, z + 90);
}

/** 海港大樓(1934):灰白外牆、垂直長窗、轉角塔樓 */
function harbourBuilding(b, M, x, z) {
  b.box(M.harbourBld, 24, 16, 46, x, 0, z, 0, 1.4);
  b.box(M.harbourBld, 10, 24, 10, x - 7, 0, z + 18, 0, 1.4);
  for (let i = 0; i < 9; i++) for (let f = 0; f < 3; f++) b.box(new THREE.MeshStandardMaterial({ color: '#4a5560', roughness: 0.2 }), 0.05, 3, 1.5, x - 12.05, 2 + f * 4.6, z - 20 + i * 4.6);
  b.box(M.harbourBld, 25, 0.8, 47, x, 16, z);
  b.solid('G', x - 12, z - 23, x + 12, z + 23);
  sign(b, textTex('海港大樓', { sub: '1934 · Keelung Harbour Building', bg: '#3b3d40', fg: '#f2e7c9', h: 90, w: 480 }), 3.4, 0.62, x - 12.2, 4.6, z, -Math.PI / 2, { glow: false, double: false });
}
