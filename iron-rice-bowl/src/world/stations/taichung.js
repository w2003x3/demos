// 臺中車站(第三代高架站,2016 啟用)+ 第二代紅磚站房(1917,國定古蹟):
//   1F — 出入口、公車轉運站;西側站前廣場,東側復興路;紅磚舊站在西南側
//   2F — 大廳與穿堂(售票、閘門、商店),兩側為半開放平台,上方就是挑高的大屋頂 → 2 樓出口的遼闊感
//   3F — 月台層(2 座島式 + 1 座側式,5 股道)
//   屋頂 — 「蝴蝶展翅」造型,最高 37 m,鋼構、太陽能板,自然通風與採光(不裝空調)
// 出口:東側 1~3 號(復興路)、西側 5~6 號(站前廣場)、北端 4 號。
// 關卡變化:'maze' 2F 平台以施工圍籬與展示架隔出迂迴動線;'obstacle' 擺放行李箱、排隊人龍、清潔車。
// 座標:x 沿軌道(東西向的長邊)、z 橫向;地面 y = 0,2F 地板 y = 8,3F 月台面 y = 16。
import * as THREE from 'three';
import { Builder, T, baseMats, textTex, sign, crowd, escalator, shopfront } from './common.js';
import { rng } from '../../core/textures.js';
import { barrier } from './taipei.js';

const F2 = 8, F3 = 16, TOP = 37;
const LX = 66;                    // 2F 半長
const DZ = 13;                    // 3F 月台層(覆蓋 2F 中段)半寬
const PZ = 34;                    // 2F 平台外緣
const wing = (z) => 29 + 8 * Math.pow(Math.min(1, Math.abs(z) / 46), 1.3);   // 蝴蝶屋頂:中央 29 m,外緣 37 m

export function buildTaichung({ assets, variant = 'normal', quality = {} }) {
  const b = new Builder(), R = rng(2016);
  const M = baseMats();
  Object.assign(M, {
    tile: M.tex(T.terrazzo('#cfcbc2'), 0.45),
    tileDark: M.tex(T.granite('#7d7a74'), 0.5),
    concrete: M.tex(T.plaster('#bdbab3'), 0.85),
    paving: M.tex(T.granite('#b9b2a6'), 0.6),
    brick: M.tex(T.brick(), 0.85),
    whiteBand: M.tex(T.plaster('#ece7dc'), 0.7),
    slate: M.tex(T.rooftile('#3b4045'), 0.6),
    solar: M.tex(T.solar(), 0.25, 0.5),
    roofUnder: new THREE.MeshStandardMaterial({ color: '#dfe2e4', roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide }),
    truss: new THREE.MeshStandardMaterial({ color: '#f2f3f3', roughness: 0.4, metalness: 0.35 }),
    tactile: M.tex(T.tactile(), 0.6),
    asphalt: M.tex(T.terrazzo('#55575a', false), 0.9),
    green: M.tex(T.greenery(), 0.95),
    trainWhite: new THREE.MeshStandardMaterial({ color: '#f1f2f2', roughness: 0.35, metalness: 0.4 }),
    trainBand: new THREE.MeshStandardMaterial({ color: '#1b1d22', roughness: 0.3 }),
  });
  const exits = [];

  // ================================================================ 1F 地面
  b.area('1F', 0, -100, -95, 100, 90);
  b.floor(M.paving, -100, -95, 100, -PZ - 14, 0, 1.6);           // 西側站前廣場
  b.floor(M.asphalt, -100, PZ + 14, 100, 90, 0, 2);               // 東側道路
  b.floor(M.tile, -100, -PZ - 14, 100, PZ + 14, 0, 1.2);          // 站體下方
  // 道路標線
  for (let x = -96; x < 96; x += 6) b.floor(new THREE.MeshStandardMaterial({ color: '#f0f0ea' }), x, 66, x + 3, 66.25, 0.01);
  // 公車轉運月台(東側 1F,A~D)
  ['A', 'B', 'C', 'D'].forEach((n, i) => {
    const x = -42 + i * 26;
    b.box(M.concrete, 20, 0.2, 4, x, 0, PZ + 22);
    b.box(M.steelPaint, 20, 0.15, 5, x, 3.4, PZ + 22);
    for (const dx of [-9, 9]) b.box(M.darkSteel, 0.2, 3.4, 0.2, x + dx, 0, PZ + 22);
    sign(b, textTex(`公車月台 ${n}`, { sub: `Bus Bay ${n}`, bg: '#1d6f42', h: 90, w: 380 }), 2, 0.48, x, 2.9, PZ + 22, 0);
  });
  // 站前廣場:彩色裝置藝術(高 8.5 m)與植栽
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const col = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#e67e22', '#1abc9c'][k];
    b.add(new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 }), new THREE.CylinderGeometry(0.35, 0.5, 8.5, 12), 10 + Math.cos(a) * 1.6, 4.25, -PZ - 30 + Math.sin(a) * 1.6, 0, Math.cos(a) * 0.16, Math.sin(a) * 0.16);
  }
  b.solid('1F', 7.5, -PZ - 32.5, 12.5, -PZ - 27.5);
  for (const [x, z] of [[-30, -60], [-10, -70], [30, -62], [50, -70], [70, -58]]) { b.box(M.green, 8, 0.6, 8, x, 0, z); b.solid('1F', x - 4, z - 4, x + 4, z + 4); }

  // ---- 紅磚舊站(第二代,西南側;面向西側廣場)
  oldStation(b, M, -52, -78);
  b.solid('1F', -76, -88, -28, -70);

  // ================================================================ 結構:柱、2F 樓板、3F 月台層
  // 2F 樓板(兩側平台外緣到 ±PZ)
  b.box(M.concrete, 2 * LX, 1, 2 * PZ, 0, F2 - 1, 0);
  b.area('2F', F2, -LX + 0.5, -PZ + 0.5, LX - 0.5, PZ - 0.5);
  b.floor(M.tile, -LX, -PZ, LX, PZ, F2 + 0.002, 1.2);
  // 2F 導盲磚(往出口)
  for (const z of [-PZ + 6, PZ - 6]) b.floor(M.tactile, -LX + 4, z - 0.15, LX - 4, z + 0.15, F2 + 0.004, 0.3);
  // 柱列(穿越 1F/2F,撐月台層)
  for (let x = -LX + 6; x <= LX - 6; x += 12) for (const z of [-DZ + 1, DZ - 1]) {
    b.box(M.concrete, 1.6, F3, 1.6, x, 0, z, 0, 1.5);
    b.solid('1F', x - 0.8, z - 0.8, x + 0.8, z + 0.8); b.solid('2F', x - 0.8, z - 0.8, x + 0.8, z + 0.8);
  }
  // 3F 月台層樓板(底面 = 2F 中段的天花)
  b.box(M.concrete, 2 * LX + 20, 1.4, 2 * DZ, 0, F3 - 1.4, 0);
  b.floor(M.ceiling ?? M.roofUnder, -LX, -DZ, LX, DZ, F3 - 1.42, 2, false);
  for (let x = -LX + 3; x < LX; x += 6) b.box(M.light, 4, 0.06, 0.4, x, F3 - 1.5, -6), b.box(M.light, 4, 0.06, 0.4, x, F3 - 1.5, 6);
  // 月台(2 座島式 + 1 座側式)與軌道、列車
  const tracks = [-10.5, -4.5, -1.5, 4.5, 10.5];
  for (const [z0, z1] of [[-9, -6], [-0.3, 3.3], [12, DZ]]) b.box(M.tile, 2 * LX, 1.1, z1 - z0, 0, F3, (z0 + z1) / 2);   // 島式 ×2 + 側式
  for (const z of tracks) for (const s of [-0.53, 0.53]) b.box(M.steel, 2 * LX + 20, 0.16, 0.07, 0, F3, z + s);
  // 列車(EMU 白色車體 + 黑窗帶):停在 4.5 股道
  for (let k = 0; k < 6; k++) {
    const x = -55 + k * 20.5;
    b.box(M.trainWhite, 20, 3.4, 2.9, x, F3 + 0.6, 4.5);
    b.box(M.trainBand, 20.02, 0.9, 2.92, x, F3 + 2.0, 4.5);
  }
  // 月台邊緣欄杆(2F 平台看上去)
  for (const z of [-DZ, DZ]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(2 * LX, 1.2), M.glass); g.position.set(0, F3 + 0.6, z); b.extra.push(g); }

  // ================================================================ 屋頂:蝴蝶展翅(太陽能板)+ 鋼構桁架 + 樹狀鋼柱
  const RX = LX + 14, RZ = 48;
  const roof = new THREE.PlaneGeometry(2 * RX, 2 * RZ, 4, 48);
  roof.rotateX(-Math.PI / 2);
  const rp = roof.attributes.position;
  for (let i = 0; i < rp.count; i++) rp.setY(i, wing(rp.getZ(i)));
  roof.computeVertexNormals();
  const ruv = roof.attributes.uv;
  for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * 2 * RX / 4, ruv.getY(i) * 2 * RZ / 2.5);
  b.add(M.solar, roof, 0, 0.35, 0);
  b.add(M.roofUnder, roof.clone(), 0, 0, 0);
  // 屋頂下方的縱向鋁格柵(線條感)
  for (let z = -RZ + 1; z < RZ; z += 1.4) b.box(M.roofUnder, 2 * RX, 0.08, 0.18, 0, wing(z) - 0.25, z);
  // 主桁架(每 12 m 一榀,弧形上弦 + 下弦 + 斜腹桿)
  for (let x = -RX + 4; x <= RX - 4; x += 12) {
    for (let z = -RZ; z < RZ; z += 2) {
      const y1 = wing(z), y2 = wing(z + 2);
      const L = Math.hypot(2, y2 - y1), ang = Math.atan2(y2 - y1, 2);
      b.add(M.truss, new THREE.BoxGeometry(0.35, 0.45, L), x, (y1 + y2) / 2 - 0.4, z + 1, 0, -ang);
      b.add(M.truss, new THREE.BoxGeometry(0.25, 0.3, L), x, (y1 + y2) / 2 - 2.6, z + 1, 0, -ang);
      b.add(M.truss, new THREE.BoxGeometry(0.15, 2.4, 0.15), x, (y1 + y2) / 2 - 1.5, z + 1, 0, 0, z % 4 ? 0 : 0.6);
    }
  }
  // 樹狀鋼柱(在平台外緣,地面直上屋頂)
  for (let x = -RX + 16; x <= RX - 16; x += 24) for (const z of [-PZ - 4, PZ + 4]) {
    const h = wing(z) - 2.8;
    b.add(M.truss, new THREE.CylinderGeometry(0.5, 0.75, h * 0.62, 20), x, h * 0.31, z);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4, L = h * 0.45;
      const g = new THREE.CylinderGeometry(0.22, 0.38, L, 12);
      g.rotateZ(-Math.cos(a) * 0.42); g.rotateX(Math.sin(a) * 0.42);
      b.add(M.truss, g, x + Math.cos(a) * L * 0.2, h * 0.62 + L * 0.42, z + Math.sin(a) * L * 0.2);
    }
    b.solid('1F', x - 0.8, z - 0.8, x + 0.8, z + 0.8);
  }

  // ================================================================ 2F 大廳(中段,月台層下方)
  // 閘門線(x = 0):付費區在東半部的手扶梯往 3F
  for (let k = 0; k < 12; k++) {
    const z = -8.8 + k * 1.6;
    b.box(M.steelPaint, 0.28, 1.0, 1.4, 0, F2, z);
    b.box(M.darkSteel, 0.3, 0.05, 1.4, 0, F2 + 1.0, z);
    b.solid('2F', -0.7, z - 0.14, 0.7, z + 0.14);
  }
  b.solid('2F', -0.7, -DZ, 0.7, -9.6); b.solid('2F', -0.7, 9.6, 0.7, DZ);
  sign(b, textTex('剪票口 進站', { sub: 'Ticket Gates · 往月台 To Platforms', bg: '#1f4e9a', h: 100, w: 640 }), 6, 0.95, -0.4, F2 + 3.4, 0, Math.PI / 2);
  // 往月台手扶梯(付費區)
  for (const z of [-7, 7]) { escalator(b, M, 30, z > 0 ? 10 : -10, z > 0 ? -2 : 2, F2, F3); }
  for (const z of [-7, 7]) b.solid('2F', 26, z - 3, 34, z + 3);
  // 售票處與旅客服務(西半部)、商店
  for (let i = 0; i < 6; i++) { const z = -9 + i * 3.6; b.box(M.tileDark, 2.6, 1.1, 0.8, -LX + 8, F2, z); }
  b.solid('2F', -LX + 6.5, -10, -LX + 9.5, 10);
  sign(b, textTex('售票處', { sub: 'Ticket Office', bg: '#1f4e9a', h: 100, w: 420 }), 4, 0.9, -LX + 8, F2 + 3.2, 0, Math.PI / 2);
  const shops = [['全家便利商店', 'FamilyMart', '#00a0e9'], ['臺鐵便當本舖', 'TRA Bento', '#b23a2a'], ['太陽餅', '伴手禮', '#c58a1b'], ['星巴克', 'Coffee', '#00704a'], ['旅遊服務中心', 'Tourist Info', '#2a7d4f'], ['書報', 'News', '#555']];
  shops.forEach((s, i) => {
    const x0 = -46 + i * 14;
    shopfront(b, M, s[0], s[1], s[2], x0, x0 + 9, -DZ + 0.2, F2, 4.2, 1, R);
    b.box(M.concrete, 9, 4.2, 0.4, x0 + 4.5, F2, -DZ + 0.0);
  });
  b.solid('2F', -46, -DZ - 0.5, 38, -DZ + 0.5);
  // 2F 大廳時刻看板
  sign(b, textTex('臺中 Taichung', { sub: '區間 1172 往新竹 14:06 · 自強 112 往高雄 14:15', bg: '#050505', fg: '#ffb21f', h: 110, w: 900 }), 9, 1.1, -14, F2 + 4.6, DZ - 0.6, Math.PI, { frame: '#111' });

  // ================================================================ 2F 平台外緣:欄杆、往 1F 的出口樓梯
  for (const z of [-PZ, PZ]) {
    for (const [x0, x1] of [[-LX, -7], [7, LX]]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 1.2), M.glass);
      g.position.set((x0 + x1) / 2, F2 + 0.6, z);
      b.extra.push(g);
      b.box(M.steel, x1 - x0, 0.07, 0.07, (x0 + x1) / 2, F2 + 1.2, z);
      b.solid('2F', x0, z - 0.3, x1, z + 0.3);
    }
    // 出口大樓梯(中央)往外側下降到 1F,兩側手扶梯
    const dir = Math.sign(z), n = 40, run = 14;
    for (let i = 0; i < n; i++) b.box(M.tile, 8, 0.2, run / n + 0.02, 0, F2 - (i + 1) * F2 / n, z + dir * (i + 0.5) * run / n);
    escalator(b, M, -6, z + dir * run, z, 0, F2, 1.2);
    escalator(b, M, 6, z, z + dir * run, F2, 0, 1.2);
    b.stairs.push({ box: [-4, Math.min(z, z + dir * run), 4, Math.max(z, z + dir * run)], axis: 'z', a: z, b: z + dir * run, yA: F2, yB: 0, fromFloor: '2F', toFloor: '1F', label: dir > 0 ? '1~3 號出口(復興路)' : '5~6 號出口(站前廣場)' });
    b.solid('1F', -8, Math.min(z, z + dir * run), -4, Math.max(z, z + dir * run)); b.solid('1F', 4, Math.min(z, z + dir * run), 8, Math.max(z, z + dir * run));
    sign(b, textTex(dir > 0 ? '出口 1 · 2 · 3' : '出口 5 · 6', { sub: dir > 0 ? 'Exit · 復興路 Fuxing Rd.' : 'Exit · 站前廣場 Station Plaza', bg: '#f0a020', fg: '#111', h: 100, w: 520 }), 4.4, 0.85, 0, F2 + 3.6, z - dir * 0.6, dir > 0 ? Math.PI : 0);
    exits.push({ name: dir > 0 ? '1~3 號出口' : '5~6 號出口', floor: '1F', x: 0, z: z + dir * (run + 3) });
  }
  // 4 號出口(北端)
  sign(b, textTex('出口 4', { sub: 'Exit 4', bg: '#f0a020', fg: '#111', h: 100, w: 300 }), 2, 0.6, LX - 1, F2 + 3.2, 20, -Math.PI / 2);
  exits.push({ name: '4 號出口', floor: '2F', x: LX - 2, z: 20 });

  // ================================================================ 關卡變化
  const spots = [];
  if (variant === 'maze') {
    const walls = [[-50, 14, -49.4, 30], [-36, 18, -10, 18.6], [-20, 24, -19.4, PZ - 1], [10, 16, 10.6, 30], [16, 26, 44, 26.6], [44, 16, 44.6, 24], [-50, -30, -49.4, -14], [-36, -18.6, -6, -18], [-20, -PZ + 1, -19.4, -24], [10, -30, 10.6, -16], [18, -26.6, 46, -26], [50, -24, 50.6, -14]];
    for (const w of walls) { barrier(b, M, ...w, F2, '施工中'); b.solid('2F', ...w); }
  }
  if (variant === 'obstacle') {
    for (let i = 0; i < 14; i++) {
      const x = -50 + R() * 100, z = (R() < 0.5 ? -1 : 1) * (16 + R() * 14);
      b.box(new THREE.MeshStandardMaterial({ color: ['#c0392b', '#2471a3', '#d4ac0d', '#7f8c8d'][i % 4], roughness: 0.4 }), 0.45, 0.68, 0.28, x, F2, z, R() * 6);
      b.solid('2F', x - 0.4, z - 0.4, x + 0.4, z + 0.4);
    }
    for (let i = 0; i < 24; i++) spots.push({ x: -LX + 11 + (i % 12) * 0.9, z: -6 + Math.floor(i / 12) * 1.2, y: F2, ry: Math.PI / 2 });
  }
  // 人群
  for (let i = 0; i < 80; i++) {
    const x = -60 + R() * 120, z = -PZ + 2 + R() * (2 * PZ - 4);
    if (Math.abs(x) < 1.2) continue;
    spots.push({ x, z, y: F2 });
  }
  for (let i = 0; i < 30; i++) spots.push({ x: -80 + R() * 160, z: -PZ - 20 - R() * 30 });
  for (let i = 0; i < 20; i++) spots.push({ x: -50 + R() * 100, z: (i % 2 ? -1 : 1) * (7.5 + R()), y: F3 + 1.1 });
  b.extra.push(crowd(assets.people, spots, R));

  // ================================================================ 燈光(自然採光為主)
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight('#eef5ff', '#8a8278', 1.2));
  const sun = new THREE.DirectionalLight('#fff2dc', 2.8);
  sun.position.set(-40, 70, -50);
  sun.target.position.set(0, 0, 0);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 220 });
    sun.shadow.bias = -0.0006;
  }
  lights.add(sun, sun.target);
  for (const x of [-40, -10, 20, 50]) { const p = new THREE.PointLight('#fff4e4', 24, 26, 1.5); p.position.set(x, F3 - 3, 0); lights.add(p); }
  b.extra.push(lights);
  b.finish();
  return {
    group: b.group, solids: b.solids, floors: b.floors, stairs: b.stairs, exits,
    spawn: { floor: '2F', x: -30, z: 24, ry: 0 },
    name: '臺中車站', sky: 'day', variant, ceil: { '1F': 99, '2F': 99 },
    poi: [{ name: '2F 平台', floor: '2F', x: 0, z: 26 }, { name: '紅磚舊站', floor: '1F', x: -52, z: -66 }],
  };
}

/** 第二代紅磚站房(1917):紅磚牆加白色水平飾帶、中央鐘塔與尖頂、兩翼馬薩式斜屋頂 */
function oldStation(b, M, cx, cz) {
  const front = cz + 8;   // 正面朝 +z(面向廣場)
  for (const sx of [-1, 1]) {
    b.box(M.brick, 16, 9, 14, cx + sx * 14, 0, cz, 0, 2);
    for (const y of [0.9, 4.6, 8.4]) b.box(M.whiteBand, 16.2, 0.45, 14.2, cx + sx * 14, y, cz);
    // 兩翼斜屋頂(深灰石板)
    const r = new THREE.ConeGeometry(11, 4, 4, 1, false, Math.PI / 4);
    b.add(M.slate, r, cx + sx * 14, 9 + 2, cz, 0, 0, 0, 0.75, 1, 0.65);
    for (let i = 0; i < 4; i++) { const x = cx + sx * (8 + i * 3.6); b.box(M.window ?? M.trim, 1.3, 3, 0.08, x, 1.4, front - 0.96); b.box(M.whiteBand, 1.7, 0.4, 0.3, x, 4.4, front - 0.9); }
  }
  // 中央入口棟 + 鐘塔
  b.box(M.brick, 12, 12, 16, cx, 0, cz + 1, 0, 2);
  for (const y of [0.9, 5.2, 11.4]) b.box(M.whiteBand, 12.2, 0.5, 16.2, cx, y, cz + 1);
  b.box(M.brick, 5, 9, 5, cx, 12, cz + 2);
  b.box(M.whiteBand, 5.3, 0.5, 5.3, cx, 21, cz + 2);
  const spire = new THREE.ConeGeometry(3.4, 6, 4, 1, false, Math.PI / 4);
  b.add(M.slate, spire, cx, 21.5 + 3, cz + 2);
  b.box(M.steel, 0.1, 2.2, 0.1, cx, 27.5, cz + 2);
  // 時鐘
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), new THREE.MeshStandardMaterial({ color: '#f6f2e6', roughness: 0.5 }));
  face.position.set(cx, 17, cz + 4.52);
  b.extra.push(face);
  b.box(M.trim, 0.1, 0.9, 0.05, cx, 16.9, cz + 4.56);
  b.box(M.trim, 0.7, 0.1, 0.05, cx + 0.3, 17, cz + 4.56);
  // 入口拱廊
  for (const x of [-4, -1.3, 1.3, 4]) b.box(M.whiteBand, 0.8, 5, 0.8, cx + x, 0, front + 1.5);
  b.box(M.brick, 10, 1.2, 1.2, cx, 5, front + 1.5);
  const sgn = textTex('臺中驛', { sub: '舊站 · 國定古蹟', bg: '#3a2a20', fg: '#f2e7c9', h: 100, w: 380 });
  sign(b, sgn, 2.6, 0.7, cx, 7.3, front + 2.15, 0, { double: false, glow: false });
}
