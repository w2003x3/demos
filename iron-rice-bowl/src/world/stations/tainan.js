// 臺南車站(鐵路地下化新站,2026-10 啟用)+ 1936 年古蹟站房(第二代,折衷主義):
//   地面 — 西側北門路:古蹟站房(兩層、淺米色面磚、下段厚重洗石、正面三拱門車寄、二樓七扇圓拱長窗,
//          中央三扇夾在四根壁柱間、上方電子鐘、平屋頂中央小山形牆);新站啟用後古蹟封閉修復。
//          古蹟後方保留舊月台與棚架(軌道已移入地下,改為綠地)、南北轉車台遺構回原址展示。
//          東側 2 號出入口(大學路/前鋒路):挑高 14 m 大頂棚,以臺南市樹「鳳凰木」為意象,薄膜天花透光,下方半戶外穿廊。
//          3 號出入口(前鋒路南側):黃花崗石 + 玻璃帷幕。
//   中央 — 東西貫穿的下沉廣場,串聯地面與 B1。
//   B1 — 大廳層:售票、旅客服務、鈦鐵便當本舖、便利商店、地下商店街;北側付費區閘門;中英日韓四語指標。
//   B2 — 月台層:2 座島式月台、4 股道(1A、1B、2A、2B)。
// 座標:x 沿軌道(+x 北)、z 橫向(+z 東);地面 y = 0,B1 y = -7,B2 y = -14。
import * as THREE from 'three';
import { Builder, T, baseMats, textTex, sign, crowd, escalator, shopfront, wallBox, facadeGeo, maskFloor, trainSet, platformEdge, FONT } from './common.js';
import { canvasTexture, rng } from '../../core/textures.js';
import { barrier } from './taipei.js';

const B1 = -7, B2 = -14;
const PL = [-11, 60, -28, 34];               // 下沉廣場:x -11..11、z -28..34(含東西兩端大階梯)
const SX0 = -11, SX1 = 11, SW0 = -28, SW1 = -14, SE0 = 20, SE1 = 34;   // 西階梯 z[-28,-14]、東階梯 z[20,34]
const HZ0 = -14, HZ1 = 20;                   // B1 大廳的 z 範圍(下沉廣場兩側)
const HX = 70;                               // B1 大廳 x 半長
const ISL = [[-4.5, 4.5], [13.5, 22.5]];     // B2 島式月台
const TRK = [[-6.6, '1A'], [6.6, '1B'], [11.4, '2A'], [24.6, '2B']];

export function buildTainan({ assets, variant = 'normal', quality = {} }) {
  const b = new Builder(), R = rng(1936);
  const M = baseMats();
  Object.assign(M, {
    paving: M.tex(T.granite('#c4bcb0'), 0.6),
    pavingRed: M.tex(T.granite('#a8665a'), 0.65),
    asphalt: M.tex(T.terrazzo('#55575a', false), 0.9),
    cream: M.tex(creamTile(), 0.7),
    stoneBase: M.tex(T.plaster('#b8ad9c'), 0.85),
    ornament: M.tex(T.plaster('#efe6d4'), 0.7),
    yellowGranite: M.tex(T.granite('#d9b66a'), 0.45),
    floorB1: M.tex(T.granite('#d8d3ca'), 0.3),
    floorB2: M.tex(T.terrazzo('#c9c5bd'), 0.4),
    wallB: M.tex(T.plaster('#ece9e2'), 0.6),
    ceilB: new THREE.MeshStandardMaterial({ map: phoenixCeiling(), roughness: 0.7, side: THREE.DoubleSide }),
    membrane: new THREE.MeshStandardMaterial({ map: leafMembrane(), color: '#ffffff', emissive: '#fff6ea', emissiveIntensity: 0.35, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.94 }),
    canopyTop: new THREE.MeshStandardMaterial({ color: '#d7d9db', roughness: 0.5, metalness: 0.3 }),
    treeWhite: new THREE.MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.45, metalness: 0.2 }),
    flame: new THREE.MeshStandardMaterial({ color: '#e0452b', roughness: 0.6 }),
    grass: M.tex(T.greenery(), 0.95),
    window: new THREE.MeshStandardMaterial({ color: '#44515a', roughness: 0.12, metalness: 0.4 }),
    woodCanopy: new THREE.MeshStandardMaterial({ color: '#5f5a52', roughness: 0.6, metalness: 0.4 }),
    ballast: M.tex(T.terrazzo('#6f6a63', false), 0.95),
    sleeper: new THREE.MeshStandardMaterial({ color: '#8d8a84', roughness: 0.85 }),
  });
  const exits = [];

  // ================================================================ 地面
  b.area('G', 0, -95, -95, 95, 90);
  const inPlaza = (x, z) => x > SX0 && x < SX1 && z > SW0 && z < SE1;
  maskFloor(b, M.paving, -95, -70, 95, 70, 0, (x, z) => !inPlaza(x, z), 1.6);
  b.floor(M.asphalt, -95, -95, 95, -70, 0, 2);   // 北門路
  b.floor(M.asphalt, -95, 70, 95, 90, 0, 2);     // 前鋒路
  for (let x = -92; x < 92; x += 6) { b.floor(M.light, x, -82.6, x + 3, -82.4, 0.01); b.floor(M.light, x, 79.9, x + 3, 80.1, 0.01); }
  // 遠方街區
  for (let i = 0; i < 16; i++) {
    const w = 14 + R() * 16, h = 14 + R() * 40;
    b.box(M.stoneBase, w, h, 14, -90 + i * 12 + R() * 4, 0, i % 2 ? -110 - R() * 10 : 106 + R() * 10);
  }

  // ---- 古蹟站房(正面朝 -z = 北門路)
  oldStation(b, M, 0, -60);
  b.solid('G', -33, -68, 33, -44);
  // 修復中圍籬
  barrier(b, M, -30, -73, 30, -72.6, 0, '古蹟修復中');
  b.solid('G', -30, -73, 30, -72.6);
  // 古蹟後方:舊第一、二月台(保留棚架)+ 軌道改為綠地
  for (const [z0, z1] of [[-40, -35], [-29, -24]]) {
    for (const [x0, x1] of [[-60, -3], [3, 60]]) {
      b.box(M.stoneBase, x1 - x0, 0.9, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0, 1.4);
      b.floor(M.paving, x0, z0, x1, z1, 0.902, 1.6);
      b.solid('G', x0, z0, x1, z1);   // 月台(高 0.9 m)只看不走,旅客走中間穿越道
    }
    oldCanopy(b, M, -50, 50, (z0 + z1) / 2, 0.9);
  }
  for (const [z0, z1] of [[-44, -40], [-35, -29], [-24, -19]]) b.floor(M.grass, -95, z0, 95, z1, 0.02, 3);
  // 穿越道(1 號出入口:經舊月台通往新站下沉廣場)
  b.floor(M.pavingRed, -3, -44, 3, -19, 0.03, 1.6);
  sign(b, textTex('往 新站 · 下沉廣場', { sub: 'To New Station · 新駅 · 신역', bg: '#1f4e9a', h: 100, w: 600 }), 4.2, 0.7, 0, 3.4, -19.5, 0);
  // 南北轉車台遺構(回原址展示)
  for (const x of [-72, 72]) turntable(b, M, x, -32);

  // ---- 下沉廣場(東西貫穿):西、東兩端大階梯,中段 B1 地坪
  const nSteps = 34;
  for (const [a, c, dir] of [[SW0, SW1, 1], [SE1, SE0, -1]]) {
    const run = Math.abs(c - a) / nSteps;
    for (let i = 0; i < nSteps; i++) b.box(M.paving, SX1 - SX0 - 7, B1 / nSteps * -1 + 0.02, run + 0.02, 0, B1 * (i + 1) / nSteps, a + dir * (i + 0.5) * run, 0, 1.4);
    // 階梯旁手扶梯 + 綠化槽
    escalator(b, M, SX1 - 2.2, c, a, B1, 0, 1.2);
    b.box(M.grass, 2.6, 0.8, Math.abs(c - a), SX0 + 1.6, B1 / 2 - 0.4, (a + c) / 2);
    b.stairs.push({ box: [SX0 + 3.4, Math.min(a, c), SX1 - 3.4, Math.max(a, c)], axis: 'z', a, b: c, yA: 0, yB: B1, fromFloor: 'G', toFloor: 'B1', label: dir > 0 ? '下沉廣場(西)' : '下沉廣場(東)' });
  }
  b.floor(M.floorB1, SX0, SW1, SX1, SE0, B1, 1.2);
  // 廣場邊緣:玻璃欄杆 + 擋土牆(石材)
  for (const x of [SX0, SX1]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(SE1 - SW0, 1.1), M.glass);
    g.position.set(x, 0.55, (SW0 + SE1) / 2); g.rotation.y = Math.PI / 2; b.extra.push(g);
    b.box(M.steel, 0.07, 0.07, SE1 - SW0, x, 1.1, (SW0 + SE1) / 2);
    b.solid('G', x - 0.25, SW0, x + 0.25, SE1);
  }
  // 階梯外側(手扶梯、綠化槽)不可走
  for (const [a, c] of [[SW0, SW1], [SE0, SE1]]) { b.solid('G', SX0, a, SX0 + 3.4, c); b.solid('G', SX1 - 3.4, a, SX1, c); b.solid('B1', SX0, a, SX0 + 3.4, c); b.solid('B1', SX1 - 3.4, a, SX1, c); }
  b.area('B1', B1, SX0, SW0, SX1, SE1);

  // ---- 2 號出入口:14 m 大頂棚(鳳凰木意象)
  phoenixCanopy(b, M, R);
  sign(b, textTex('臺南車站', { sub: 'Tainan Station · 台南駅 · 타이난역', bg: '#7a2318', h: 110, w: 720 }), 7, 1.1, 0, 7.5, 62, Math.PI);
  exits.push({ name: '1 號出口(北門路)', floor: 'G', x: 0, z: -78 }, { name: '2 號出口(大學路)', floor: 'G', x: 0, z: 66 });

  // ---- 3 號出入口(前鋒路南側):黃花崗石 + 玻璃帷幕量體,內有樓梯往 B1
  const E3 = [-62, 40, -40, 58];
  exit3(b, M, E3);
  exits.push({ name: '3 號出口(前鋒路)', floor: 'G', x: -51, z: 64 });

  // ================================================================ B1 大廳層
  // 範圍:南廳 x[-HX,-11]、北廳 x[11,HX],z[HZ0,HZ1];3 號出口連通道 x[-60,-42] z[HZ1,52]
  b.area('B1', B1, -HX, HZ0, SX0 + 0.1, HZ1);
  b.area('B1', B1, SX1 - 0.1, HZ0, HX, HZ1);
  b.area('B1', B1, -58, HZ1 - 0.1, -44, 54);
  const holes = [[38, -1.5, 52, 1.5], [38, 16.5, 52, 19.5]];   // 往 B2 的樓梯井(北廳付費區)
  const inHole = (x, z) => holes.some(([a, c, d, e]) => x > a && x < d && z > c && z < e);
  maskFloor(b, M.floorB1, -HX, HZ0, HX, HZ1, B1, (x, z) => !(x > SX0 && x < SX1) && !inHole(x, z), 1.2);
  b.floor(M.floorB1, -58, HZ1, -44, 54, B1, 1.2);
  // 天花(鳳凰木羽狀複葉線條)+ 燈帶
  b.floor(M.ceilB, -HX, HZ0, SX0, HZ1, B1 + 4.6, 4, false);
  b.floor(M.ceilB, SX1, HZ0, HX, HZ1, B1 + 4.6, 4, false);
  b.floor(M.ceilB, -58, HZ1, -44, 54, B1 + 4.0, 4, false);
  for (let x = -HX + 4; x < HX - 2; x += 8) if (Math.abs(x) > 14) for (const z of [-8, 2, 12]) b.box(M.light, 5, 0.05, 0.35, x, B1 + 4.55, z);
  // 外牆
  wallBox(b, M.wallB, 'B1', -HX, HZ0 - 0.4, SX0, HZ0, B1, 4.6); wallBox(b, M.wallB, 'B1', SX1, HZ0 - 0.4, HX, HZ0, B1, 4.6);
  wallBox(b, M.wallB, 'B1', -HX, HZ1, -58, HZ1 + 0.4, B1, 4.6);
  wallBox(b, M.wallB, 'B1', -44, HZ1, SX0, HZ1 + 0.4, B1, 4.6); wallBox(b, M.wallB, 'B1', SX1, HZ1, HX, HZ1 + 0.4, B1, 4.6);
  wallBox(b, M.wallB, 'B1', -HX - 0.4, HZ0, -HX, HZ1, B1, 4.6);
  wallBox(b, M.wallB, 'B1', HX, HZ0, HX + 0.4, HZ1, B1, 4.6);
  wallBox(b, M.wallB, 'B1', -58.4, HZ1, -58, 54, B1, 4.0);
  wallBox(b, M.wallB, 'B1', -44, HZ1, -43.6, 54, B1, 4.0);
  // 廣場兩側玻璃帷幕(各留 2 處自動門)
  for (const x of [SX0, SX1]) {
    for (const [z0, z1] of [[HZ0, -8], [-4, 10], [14, HZ1]]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, 4.6), M.glass);
      g.position.set(x, B1 + 2.3, (z0 + z1) / 2); g.rotation.y = Math.PI / 2; b.extra.push(g);
      b.box(M.darkSteel, 0.12, 4.6, 0.12, x, B1, z0); b.box(M.darkSteel, 0.12, 4.6, 0.12, x, B1, z1);
      b.solid('B1', x - 0.15, z0, x + 0.15, z1);
    }
    b.box(M.darkSteel, 0.14, 0.2, HZ1 - HZ0, x, B1 + 4.4, (HZ0 + HZ1) / 2);
  }
  // 柱(樹形柱頭)
  for (let x = -HX + 10; x < HX - 4; x += 12) if (Math.abs(x) > 16) for (const z of [-4, 10]) {
    b.add(M.treeWhite, new THREE.CylinderGeometry(0.45, 0.45, 3.6, 20), x, B1 + 1.8, z);
    b.add(M.treeWhite, new THREE.CylinderGeometry(1.6, 0.45, 1.0, 20, 1, true), x, B1 + 4.1, z);
    b.solid('B1', x - 0.5, z - 0.5, x + 0.5, z + 0.5);
  }
  // ---- 南廳:售票、旅服、商店街
  for (let i = 0; i < 6; i++) b.box(M.steelPaint, 0.9, 1.7, 0.6, -60 + i * 1.3, B1, HZ0 + 0.7);
  sign(b, textTex('售票機', { sub: 'Ticket Machines · 券売機 · 발매기', bg: '#2d3a48', h: 90, w: 520 }), 3.6, 0.62, -56.8, B1 + 2.7, HZ0 + 0.5, 0, { double: false });
  b.solid('B1', -61, HZ0, -52.6, HZ0 + 1.1);
  b.box(M.yellowGranite, 10, 1.1, 1.0, -36, B1, HZ0 + 1.6);
  for (let i = 0; i < 4; i++) b.box(M.window, 1.8, 1.6, 0.06, -40 + i * 2.6, B1 + 1.1, HZ0 + 0.3);
  sign(b, textTex('售票 / 旅客服務', { sub: 'Tickets & Information · きっぷ · 매표소', bg: '#1f4e9a', h: 100, w: 600 }), 5, 0.85, -36, B1 + 3.3, HZ0 + 0.5, 0, { double: false });
  b.solid('B1', -41.2, HZ0, -30.8, HZ0 + 2.2);
  const shops = [['鈦鐵便當本舖', 'TZR Bento', '#b23a2a'], ['7-ELEVEN', '便利商店', '#e26a12'], ['府城伴手禮', 'Souvenirs', '#9a6a2a'], ['咖啡', 'Café', '#5a3b2a'], ['書店', 'Books', '#2f5d50']];
  [-69, -42, -31.5, -21, 13].forEach((x0, i) => {
    const [n, s, c] = shops[i];
    shopfront(b, M, n, s, c, x0, x0 + 9, HZ1 - 0.1, B1, 4.2, -1, R);
    b.solid('B1', x0, HZ1 - 1, x0 + 9, HZ1);
  });
  // ---- 北廳:閘門(x = 26)與付費區、往 B2 樓梯
  for (let k = 0; k < 14; k++) {
    const z = HZ0 + 3 + k * 1.6;
    if (z > HZ1 - 2) break;
    b.box(M.steelPaint, 1.4, 1.0, 0.28, 26, B1, z);
    b.box(M.darkSteel, 1.4, 0.05, 0.3, 26, B1 + 1.0, z);
    b.solid('B1', 25.3, z - 0.14, 26.7, z + 0.14, 1.0);
  }
  b.solid('B1', 25.3, HZ0, 26.7, HZ0 + 2.6);
  sign(b, textTex('剪票口 · 往月台', { sub: 'Ticket Gates · 改札口 · 개찰구', bg: '#1f4e9a', h: 100, w: 640 }), 6, 0.95, 25.6, B1 + 3.4, 3, -Math.PI / 2);
  // 樓梯井(往 1、2 號月台)
  holes.forEach(([x0, z0, x1, z1], i) => {
    const zc = (z0 + z1) / 2;
    const n = 30;
    for (let k = 0; k < n; k++) b.box(M.floorB2, 1.0 * (x1 - x0) / n + 0.02, 0.2, z1 - z0 - 0.2, x1 - (k + 0.5) * (x1 - x0) / n, B1 + (B2 - B1) * (k + 1) / n, zc);
    b.stairs.push({ box: [x0, z0, x1, z1], axis: 'x', a: x1, b: x0, yA: B1, yB: B2, fromFloor: 'B1', toFloor: 'B2', label: `往 ${i + 1} 號月台` });
    for (const zz of [z0 - 0.15, z1 + 0.15]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 1.1), M.glass); g.position.set((x0 + x1) / 2, B1 + 0.55, zz); b.extra.push(g);
      b.solid('B1', x0, zz - 0.15, x1, zz + 0.15);
    }
    b.solid('B2', x0 + 2, z0 - 0.2, x1, z1 + 0.2);   // 樓梯下方
    b.solid('B1', x0 - 0.3, z0, x0 + 0.3, z1);       // 樓梯井低端(B1 不可從這端走進)
    sign(b, textTex(`${i + 1}A · ${i + 1}B 月台`, { sub: 'Platform · ホーム · 승강장', bg: '#0e6b4f', h: 100, w: 520 }), 3.6, 0.7, x1 + 0.3, B1 + 3.2, zc, Math.PI / 2);
  });
  sign(b, textTex('廁所 · 哺乳室 · 祈禱室', { sub: 'Restrooms · Nursing · Prayer Room', bg: '#2d3a48', h: 90, w: 600 }), 4.6, 0.7, 62, B1 + 3, HZ1 - 0.3, Math.PI, { double: false });
  exits.push({ name: 'B1 大廳', floor: 'B1', x: -20, z: 3 });

  // ================================================================ B2 月台層
  for (const [z0, z1] of ISL) {
    b.area('B2', B2, -90, z0, 90, z1);
    b.box(M.floorB2, 180, 1.1, z1 - z0, 0, B2 - 1.1, (z0 + z1) / 2);
    platformEdge(b, M, -90, 90, z0, B2, -1); platformEdge(b, M, -90, 90, z1, B2, 1);
  }
  b.floor(M.ballast, -95, -9, 95, 27, B2 - 1.1, 2);
  for (const [z, n] of TRK) {
    for (const s of [-0.53, 0.53]) b.box(M.rail, 190, 0.16, 0.07, 0, B2 - 1.1, z + s);
    for (let x = -94; x < 94; x += 0.62) b.box(M.sleeper, 0.24, 0.1, 2.4, x, B2 - 1.12, z);
  }
  // 牆、天花、柱
  b.box(M.wallB, 190, 7, 0.5, 0, B2 - 1.1, -9.2); b.box(M.wallB, 190, 7, 0.5, 0, B2 - 1.1, 27.2);
  b.floor(M.ceilB, -95, -9, 95, 27, B1 - 1.4, 4, false);
  for (let x = -84; x <= 84; x += 12) for (const z of [0, 18]) {
    if (x > 30 && x < 56) continue;   // 樓梯落地處不設柱
    b.box(M.treeWhite, 0.9, B1 - 1.4 - B2, 0.9, x, B2, z);
    b.solid('B2', x - 0.5, z - 0.5, x + 0.5, z + 0.5);
  }
  for (let x = -88; x < 88; x += 6) for (const z of [0, 18]) b.box(M.light, 4, 0.05, 0.3, x, B1 - 1.45, z - 2.5), b.box(M.light, 4, 0.05, 0.3, x, B1 - 1.45, z + 2.5);
  // 站名牆(四語)與月台號碼
  for (const x of [-60, -20, 20, 60]) {
    for (const z of [-8.9, 26.9]) sign(b, textTex('臺南 Tainan', { sub: '台南 タイナン · 타이난', bg: '#0e6b4f', h: 110, w: 720 }), 5.4, 0.85, x, B2 + 2.4, z, z < 0 ? 0 : Math.PI, { double: false });
  }
  ISL.forEach(([z0, z1], i) => {
    for (const x of [-50, 0, 50]) sign(b, textTex(`${i + 1}A   ←→   ${i + 1}B`, { sub: '往 高雄 · 往 嘉義 / 新營', bg: '#141820', fg: '#ffd23a', h: 100, w: 600 }), 3.2, 0.55, x, B2 + 3.1, (z0 + z1) / 2, Math.PI / 2);
  });
  // 列車:1B 股道(區間車,白車體藍帶)、2B 股道(自強號 EMU3000,橙帶)
  trainSet(b, M, -60, 4, B2 - 1.0, 6.6, { stripe: '#2a6bd1' });
  trainSet(b, M, -80, 6, B2 - 1.0, 24.6, { stripe: '#e8730c' });
  // 月台上的候車椅
  for (const [z0, z1] of ISL) for (let x = -70; x <= 70; x += 20) if (Math.abs(x - 45) > 12) {
    b.box(M.steelPaint, 3, 0.45, 0.5, x, B2, (z0 + z1) / 2); b.solid('B2', x - 1.5, (z0 + z1) / 2 - 0.3, x + 1.5, (z0 + z1) / 2 + 0.3, 0.45);
  }
  exits.push({ name: '1 號月台', floor: 'B2', x: 30, z: 0 }, { name: '2 號月台', floor: 'B2', x: 30, z: 18 });

  // ================================================================ 關卡變化
  const spots = [];
  if (variant === 'maze') {
    const walls = [[-60, -8, -60, 12], [-50, -14, -50, 4], [-40, 2, -40, 20], [-30, -14, -30, 8], [-22, -2, -22, 20], [32, -14, 32, 6], [44, 4, 44, 14], [56, -8, 56, 20], [-80, 40, -14, 40], [14, 40, 80, 40], [20, -60, 20, -48]];
    for (const [x0, z0, x1, z1] of walls) {
      const t = 0.3, floor = z0 > 30 || z0 < -40 ? 'G' : 'B1', y = floor === 'G' ? 0 : B1;
      const bx = x0 === x1 ? [x0 - t, z0, x1 + t, z1] : [x0, z0 - t, x1, z1 + t];
      barrier(b, M, ...bx, y, '動線管制'); b.solid(floor, ...bx);
    }
  }
  if (variant === 'obstacle') {
    for (let i = 0; i < 16; i++) {
      const x = -64 + R() * 128, z = HZ0 + 2 + R() * (HZ1 - HZ0 - 4);
      if (Math.abs(x) < 14 || Math.abs(x - 26) < 2 || inHole(x, z)) continue;
      b.box(new THREE.MeshStandardMaterial({ color: ['#c0392b', '#2471a3', '#d4ac0d', '#7f8c8d'][i % 4], roughness: 0.4 }), 0.5, 0.7, 0.3, x, B1, z, R() * 6);
      b.solid('B1', x - 0.4, z - 0.4, x + 0.4, z + 0.4, 0.7);
    }
    for (let i = 0; i < 26; i++) spots.push({ x: -36 + (i % 13) * 0.9 - 6, z: HZ0 + 3.2 + Math.floor(i / 13) * 1.1, y: B1, ry: Math.PI });
    for (const [x, z] of [[-20, -50], [30, 50], [-30, 48], [50, -4]]) { const y = Math.abs(z) > 30 ? 0 : B1, f = y ? 'B1' : 'G'; b.box(M.darkSteel, 1.8, 1.1, 0.9, x, y, z); b.solid(f, x - 1, z - 0.5, x + 1, z + 0.5, 1.1); }
  }
  // 人群
  for (let i = 0; i < 50; i++) { const x = -60 + R() * 120, z = HZ0 + 1.5 + R() * (HZ1 - HZ0 - 3); if (Math.abs(x) > 13 && !inHole(x, z) && Math.abs(x - 26) > 1) spots.push({ x, z, y: B1 }); }
  for (let i = 0; i < 40; i++) { const x = -80 + R() * 160, z = (R() < 0.5 ? -1 : 1) * (40 + R() * 25); if (!(Math.abs(x) < 34 && z < -42 && z > -70)) spots.push({ x, z }); }
  for (let i = 0; i < 24; i++) { const isl = ISL[i % 2]; spots.push({ x: -70 + R() * 140, z: isl[0] + 1.8 + R() * (isl[1] - isl[0] - 3.6), y: B2 }); }
  for (let i = 0; i < 12; i++) spots.push({ x: -8 + R() * 16, z: -12 + R() * 30, y: B1 });
  b.extra.push(crowd(assets.people, spots, R));

  // ================================================================ 燈光
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight('#eef4ff', '#857c70', 1.05));
  const sun = new THREE.DirectionalLight('#fff1d8', 2.7);
  sun.position.set(-40, 70, -30);
  sun.target.position.set(0, 0, 0);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 220 });
    sun.shadow.bias = -0.0006;
  }
  lights.add(sun, sun.target);
  for (const x of [-50, -28, 30, 52]) { const p = new THREE.PointLight('#fff2dc', 18, 24, 1.5); p.position.set(x, B1 + 3.8, 3); lights.add(p); }
  for (const x of [-60, -20, 20, 60]) { const p = new THREE.PointLight('#f4f8ff', 22, 30, 1.5); p.position.set(x, B2 + 4.5, 9); lights.add(p); }
  b.extra.push(lights);
  b.finish();
  return {
    group: b.group, solids: b.solids, floors: b.floors, stairs: b.stairs, exits,
    spawn: { floor: 'G', x: 0, z: -77, yaw: Math.PI },
    name: '臺南車站', sky: 'day', variant, ceil: { G: 99, B1: B1 + 4.4, B2: B1 - 1.6 },
    poi: [{ name: '古蹟站房', floor: 'G', x: 0, z: -80 }, { name: '下沉廣場', floor: 'B1', x: 0, z: 3 }, { name: '鳳凰木大頂棚', floor: 'G', x: 0, z: 48 }, { name: '轉車台遺構', floor: 'G', x: 72, z: -20 }],
  };
}

/** 1936 古蹟站房:正面朝 -z。cx 中心、fz 正面牆的 z */
function oldStation(b, M, cx, fz) {
  const D = 16, zc = fz + D / 2;
  // 主體:下段洗石(1F)+ 上段淺米色面磚(2F)
  for (const [x0, x1, h] of [[-32, -10, 11], [10, 32, 11], [-10, 10, 12.5]]) {
    const w = x1 - x0, xc = cx + (x0 + x1) / 2;
    b.box(M.stoneBase, w, 4.6, D, xc, 0, zc, 0, 1.6);
    b.box(M.cream, w, h - 4.6, D, xc, 4.6, zc, 0, 1.2);
    b.box(M.ornament, w + 0.5, 0.6, D + 0.5, xc, h - 0.6, zc);        // 簷口浮雕帶
    b.box(M.ornament, w + 0.3, 0.9, D + 0.3, xc, h, zc);               // 女兒牆
    b.box(M.ornament, w + 0.2, 0.35, D + 0.2, xc, 4.5, zc);            // 腰線
  }
  // 中央小山形牆
  const gable = new THREE.Shape(); gable.moveTo(-4, 0); gable.lineTo(4, 0); gable.lineTo(0, 1.8); gable.lineTo(-4, 0);
  b.add(M.ornament, new THREE.ExtrudeGeometry(gable, { depth: 0.6, bevelEnabled: false }), cx, 13.4, fz - 0.2);
  // 2F 正面七扇圓拱長窗:中央三扇在中央量體(夾在四根壁柱間),兩側各兩扇
  const ups = [-24, -16, -6, 0, 6, 16, 24];
  for (const x of ups) {
    const w = Math.abs(x) <= 6 ? 2.6 : 2.0;
    const panel = facadeGeo(w + 0.9, 6.2, [{ x: 0, y: 0.4, w, h: 5.6, arch: true }], 0.25);
    b.add(M.ornament, panel, cx + x, 5.0, fz - 0.15);
    b.box(M.window, w, 5.4, 0.05, cx + x, 5.4, fz + 0.06);
    for (let k = 1; k < 4; k++) b.box(M.ornament, w, 0.06, 0.08, cx + x, 5.4 + k * 1.3, fz);
  }
  for (const x of [-8.6, -3, 3, 8.6]) b.box(M.ornament, 0.8, 7.6, 0.6, cx + x, 4.6, fz - 0.2);   // 壁柱
  // 電子鐘(覆蓋原圓鐘位置)
  b.box(M.trim, 2.6, 0.9, 0.2, cx, 11.3, fz - 0.15);
  sign(b, textTex('10:18', { bg: '#0b0d10', fg: '#ff5a3a', h: 90, w: 240 }), 2.3, 0.7, cx, 11.75, fz - 0.27, Math.PI, { double: false, frame: '#111' });
  // 1F 窗(方窗)
  for (const x of [-28, -22, -16, 16, 22, 28]) b.box(M.window, 2.2, 2.4, 0.05, cx + x, 1.4, fz - 0.03);
  // 車寄(三拱門入口廊)
  const porch = facadeGeo(17, 6, [-5.2, 0, 5.2].map((x) => ({ x, y: 0, w: 4, h: 4.8, arch: true })), 0.7);
  b.add(M.ornament, porch, cx, 0, fz - 6.2);
  b.box(M.ornament, 17.6, 0.6, 6.6, cx, 6, fz - 3.1);
  b.box(M.stoneBase, 0.7, 6, 6, cx - 8.15, 0, fz - 3.1); b.box(M.stoneBase, 0.7, 6, 6, cx + 8.15, 0, fz - 3.1);
  sign(b, textTex('臺南驛', { sub: '1936 · 市定古蹟', bg: '#3b3d40', fg: '#f2e7c9', h: 100, w: 420 }), 3.2, 0.78, cx, 7.1, fz - 6.6, Math.PI, { double: false, glow: false });
  b.box(M.window, 14, 3.8, 0.05, cx, 0, fz - 0.02);   // 入口大玻璃門
  b.solid('G', cx - 8.6, fz - 6.6, cx - 7.8, fz); b.solid('G', cx + 7.8, fz - 6.6, cx + 8.6, fz);
}

/** 舊月台棚架(鋼柱 + 雙坡屋頂) */
function oldCanopy(b, M, x0, x1, z, y) {
  for (let x = x0; x <= x1; x += 8) if (Math.abs(x) > 4) b.box(M.woodCanopy, 0.25, 3.4, 0.25, x, y, z);
  const roof = new THREE.BoxGeometry(x1 - x0 + 4, 0.12, 3.4);
  b.add(M.woodCanopy, roof, (x0 + x1) / 2, y + 3.6, z - 1.5, 0, 0.18);
  b.add(M.woodCanopy, roof, (x0 + x1) / 2, y + 3.6, z + 1.5, 0, -0.18);
  b.box(M.woodCanopy, x1 - x0 + 4, 0.3, 0.25, (x0 + x1) / 2, y + 3.4, z);
}

/** 轉車台遺構:圓形坑 + 鋼橋 + 鋼軌 */
function turntable(b, M, x, z) {
  const r = 9;
  b.add(M.stoneBase, new THREE.CylinderGeometry(r + 0.4, r + 0.4, 0.5, 48, 1, true), x, 0.0, z);
  b.add(M.ballast, new THREE.CircleGeometry(r, 48), x, -0.2, z, 0, -Math.PI / 2);
  b.box(M.darkSteel, 2 * r - 0.4, 0.5, 2.2, x, -0.2, z, 0.5);
  for (const s of [-0.53, 0.53]) b.box(M.rail, 2 * r - 0.4, 0.14, 0.07, x - Math.sin(0.5) * s, 0.3, z - Math.cos(0.5) * s, 0.5);
  b.add(M.steel, new THREE.TorusGeometry(r - 0.6, 0.06, 6, 64), x, 0.05, z, 0, Math.PI / 2);
  b.solid('G', x - r - 0.5, z - r - 0.5, x + r + 0.5, z + r + 0.5);
  sign(b, textTex('轉車台遺構', { sub: 'Turntable Remains', bg: '#3b3d40', fg: '#f2e7c9', h: 90, w: 360 }), 2, 0.5, x, 1.2, z + r + 1, Math.PI, { glow: false });
}

/** 2 號出入口大頂棚:14 m 高、鳳凰木樹形柱(白色分枝 + 樹冠薄膜),頂棚外緣微微起伏 */
function phoenixCanopy(b, M, R) {
  const X0 = -34, X1 = 34, Z0 = 14, Z1 = 66, H = 14;
  const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, 34, 26);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, 0.6 * Math.sin(x * 0.12) * Math.cos(z * 0.15)); }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (X1 - X0) / 12, uv.getY(i) * (Z1 - Z0) / 12);
  b.add(M.membrane, g, (X0 + X1) / 2, H, (Z0 + Z1) / 2);
  b.add(M.canopyTop, g.clone(), (X0 + X1) / 2, H + 0.9, (Z0 + Z1) / 2);
  for (const [x0, z0, x1, z1] of [[X0, Z0, X1, Z0], [X0, Z1, X1, Z1]]) b.box(M.canopyTop, x1 - x0, 0.9, 0.3, (x0 + x1) / 2, H, z0);
  for (const x of [X0, X1]) b.box(M.canopyTop, 0.3, 0.9, Z1 - Z0, x, H, (Z0 + Z1) / 2);
  // 鳳凰木樹形柱:主幹 → 四支斜枝 → 枝端小枝(像羽狀複葉的骨架)
  const cols = [[-24, 24], [24, 24], [-24, 54], [24, 54], [-14, 40], [14, 40]];
  for (const [x, z] of cols) {
    b.add(M.treeWhite, new THREE.CylinderGeometry(0.42, 0.62, 7, 20), x, 3.5, z);
    b.solid('G', x - 0.7, z - 0.7, x + 0.7, z + 0.7);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3, L = 6.4;
      const br = new THREE.CylinderGeometry(0.14, 0.3, L, 10);
      br.rotateZ(-Math.cos(a) * 0.85); br.rotateX(Math.sin(a) * 0.85);
      const ex = x + Math.cos(a) * L * 0.38, ez = z + Math.sin(a) * L * 0.38;
      b.add(M.treeWhite, br, ex, 7 + L * 0.33, ez);
      // 小枝
      const tx = x + Math.cos(a) * L * 0.75, tz = z + Math.sin(a) * L * 0.75;
      for (let m = -1; m <= 1; m += 2) {
        const sb = new THREE.CylinderGeometry(0.06, 0.12, 3, 8);
        const aa = a + m * 0.6;
        sb.rotateZ(-Math.cos(aa) * 1.0); sb.rotateX(Math.sin(aa) * 1.0);
        b.add(M.treeWhite, sb, tx + Math.cos(aa) * 1.1, H - 1.3, tz + Math.sin(aa) * 1.1);
      }
    }
    // 鳳凰花點綴(紅橙色小花簇,掛在枝端)
    for (let k = 0; k < 10; k++) {
      const a = R() * Math.PI * 2, r = 3 + R() * 3;
      b.add(M.flame, new THREE.IcosahedronGeometry(0.28 + R() * 0.2, 0), x + Math.cos(a) * r, H - 0.5 - R() * 0.8, z + Math.sin(a) * r);
    }
  }
  // 半戶外穿廊:頂棚下的長椅與植栽
  for (const x of [-26, -18, 18, 26]) { b.box(M.yellowGranite, 4, 0.45, 1.2, x, 0, 34); b.solid('G', x - 2, 33.4, x + 2, 34.6, 0.45); }
  for (const [x, z] of [[-28, 60], [28, 60], [-28, 18], [28, 18]]) {
    b.add(M.stoneBase, new THREE.CylinderGeometry(2.2, 2.2, 0.6, 24), x, 0.3, z);
    b.add(M.grass, new THREE.SphereGeometry(1.9, 14, 10), x, 0.9, z, 0, 0, 0, 1, 0.45, 1);
    b.solid('G', x - 2.2, z - 2.2, x + 2.2, z + 2.2);
  }
}

/** 3 號出入口:黃花崗石 + 玻璃帷幕的低矮量體(門朝 +z 前鋒路),內有樓梯往 B1 */
function exit3(b, M, [x0, z0, x1, z1]) {
  const H = 6;
  b.box(M.yellowGranite, x1 - x0, H, 0.6, (x0 + x1) / 2, 0, z0 + 0.3, 0, 1.2);   // 背牆
  b.box(M.yellowGranite, 3, H, z1 - z0, x0 + 1.5, 0, (z0 + z1) / 2, 0, 1.2);      // 側牆(石材)
  b.box(M.yellowGranite, x1 - x0, 1, z1 - z0, (x0 + x1) / 2, H, (z0 + z1) / 2, 0, 1.2);   // 屋頂板
  for (const [ax, az, bx, bz, ry] of [[x1, z0, x1, z1, Math.PI / 2], [x0 + 3, z1, x1, z1, 0]]) {
    const len = Math.hypot(bx - ax, bz - az);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(len, H), M.glass);
    g.position.set((ax + bx) / 2, H / 2, (az + bz) / 2); g.rotation.y = ry; b.extra.push(g);
    for (let t = 0; t <= len; t += 2) b.box(M.darkSteel, 0.08, H, 0.08, ax + (bx - ax) * t / len, 0, az + (bz - az) * t / len);
  }
  b.solid('G', x0, z0, x1, z0 + 0.6); b.solid('G', x0, z0, x0 + 3, z1); b.solid('G', x1 - 0.2, z0, x1 + 0.2, z1);
  b.solid('G', x0 + 3, z1 - 0.2, -55, z1 + 0.2); b.solid('G', -47, z1 - 0.2, x1, z1 + 0.2);   // 正面玻璃(中央留門)
  // 樓梯往 B1:沿 -z 下降(z 52 → 38;B1 連通道末端 z = 54)
  const n = 34, sa = 52, sb = 38;
  for (let i = 0; i < n; i++) b.box(M.paving, 5, 0.22, (sa - sb) / n + 0.02, -51, B1 * (i + 1) / n, sa - (i + 0.5) * (sa - sb) / n);
  b.stairs.push({ box: [-53.5, sb, -48.5, sa], axis: 'z', a: sa, b: sb, yA: 0, yB: B1, fromFloor: 'G', toFloor: 'B1', label: '3 號出口' });
  escalator(b, M, -46, sb, sa, B1, 0, 1.2);
  b.solid('G', -48.5, sb, -44, sa); b.solid('G', x0 + 3, sb, -53.5, sa);
  b.solid('B1', -48.5, sb, -44, sa); b.solid('B1', -58, sb, -53.5, sa);
  sign(b, textTex('3 號出入口', { sub: 'Exit 3 · 前鋒路 Qianfeng Rd.', bg: '#f0a020', fg: '#111', h: 100, w: 520 }), 3.4, 0.66, -51, H - 0.6, z1 + 0.35, 0, { double: false });
}

/** 淺米色面磚(古蹟 2F 牆面) */
function creamTile() {
  const R = rng(36);
  return canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#d9cfba'; c.fillRect(0, 0, w, h);
    const th = 16, tw = 64;
    for (let r = 0; r < h / th; r++) for (let x = (r % 2) * tw / 2 - tw / 2; x < w; x += tw) {
      const v = R();
      c.fillStyle = `rgb(${226 + v * 14},${216 + v * 12},${194 + v * 12})`;
      c.fillRect(x + 1, r * th + 1, tw - 2, th - 2);
    }
  });
}

/** B1/B2 天花:白底、淡灰的鳳凰木羽狀複葉線條 */
function phoenixCeiling() {
  const R = rng(77);
  return canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = '#f4f2ec'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(150,145,135,0.45)'; c.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      const x0 = R() * w, y0 = R() * h, a = R() * Math.PI * 2, L = 120 + R() * 120;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + Math.cos(a) * L, y0 + Math.sin(a) * L); c.stroke();
      for (let t = 0.1; t < 1; t += 0.08) {
        const px = x0 + Math.cos(a) * L * t, py = y0 + Math.sin(a) * L * t;
        for (const s of [-1, 1]) { c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(a + s * 1.2) * 18, py + Math.sin(a + s * 1.2) * 18); c.stroke(); }
      }
    }
    c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(0, 0, w, 3); c.fillRect(0, 0, 3, h);
  });
}

/** 大頂棚薄膜:透光白,隱約的羽狀葉影 */
function leafMembrane() {
  const R = rng(55);
  return canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = '#fbfaf6'; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 220; k++) {
      const x = R() * w, y = R() * h, a = R() * Math.PI;
      c.fillStyle = `rgba(120,140,110,${0.05 + R() * 0.08})`;
      c.beginPath(); c.ellipse(x, y, 14, 4, a, 0, Math.PI * 2); c.fill();
    }
  });
}
