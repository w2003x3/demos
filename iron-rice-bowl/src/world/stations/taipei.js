// 臺北車站(臺鐵/高鐵/捷運共構):1F 中央大廳 + B1 穿堂層與地下街。
// 依實際配置:1F 大廳四面各三個門(東/西/南/北一~三門),黑白棋盤格石材地板,
//   大廳正上方為同面積的挑高天井(玻璃天窗),台鐵售票在西側、高鐵售票在東三門旁,四個角落樓梯通往 B1;
// B1:五條南北向通道(西二、西、中央、東、東二)+ 南北兩條東西向迴廊,中央通道為付費區閘門,
//   西二通道接機場捷運與 K 區地下街,四周連接 Y 區(台北地下街)、Z 區(站前地下街)、捷運站。
// 關卡變化:variant = 'maze' 時 B1 以施工圍籬封閉部分路段成為迷宮(保證仍可走通);
//          'obstacle' 時大廳與通道擺放行李推車、清潔車、排隊人龍等障礙。
// 座標:大廳中心為原點;x 東、z 南;1F 地板 y = 0,B1 地板 y = -6。
import * as THREE from 'three';
import { Builder, T, baseMats, textTex, sign, shopfront, crowd, escalator, maskToBoxes, connectivity, FONT } from './common.js';
import { canvasTexture, rng } from '../../core/textures.js';

const HX = 34, HZ = 22, HH = 18;        // 大廳半寬(東西)、半深(南北)、挑高
const B1 = -6, B1H = 3.4;               // B1 地板高度與淨高
const SQ = 1.25;                         // 棋盤格一格邊長
// 四個角落的樓梯開口(1F 往 B1)
const STAIRS = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ sx, sz, x0: sx > 0 ? 26 : -33, x1: sx > 0 ? 33 : -26, z0: sz > 0 ? 11 : -22, z1: sz > 0 ? 22 : -11 }));

export function buildTaipei({ assets, variant = 'normal', quality = {} }) {
  const b = new Builder(), R = rng(2024);
  const M = baseMats();
  Object.assign(M, {
    checker: new THREE.MeshStandardMaterial({ map: T.checker(), roughness: 0.18, metalness: 0.05, envMapIntensity: 1.2 }),
    granite: M.tex(T.granite('#cdbfa8'), 0.4),
    graniteDark: M.tex(T.granite('#8a7f72'), 0.45),
    plaster: M.tex(T.plaster('#ece6d9'), 0.85),
    ceiling: M.tex(T.ceilingGrid(), 0.9),
    terrazzo: M.tex(T.terrazzo('#c4c1b9'), 0.35),
    tactile: M.tex(T.tactile(), 0.6),
    wallB1: M.tex(T.plaster('#f1eee6'), 0.7),
    skylight: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#dbe9f5', emissiveIntensity: 1.1, roughness: 0.2 }),
    beam: M.tex(T.plaster('#f4f1ea'), 0.8),
  });
  M.checker.map.repeat.set(1 / (2 * SQ), 1 / (2 * SQ));
  M.checker.map.needsUpdate = true;
  // UV 以公尺計,貼圖一張 2×2 格 → uvScale = 2 格邊長
  const CHK = 2 * SQ;

  // ================================================================ 1F 大廳
  b.area('1F', 0, -HX + 0.6, -HZ + 0.6, HX - 0.6, HZ - 0.6);
  // 地板:棋盤格(四角留樓梯開口),外圈米色花崗石收邊
  const holes = STAIRS.map((s) => [s.x0, s.z0, s.x1, s.z1]);
  const floorRects = [[-26, -HZ, 26, HZ], [-HX, -11, -26, 11], [26, -11, HX, 11]];
  for (const [x0, z0, x1, z1] of floorRects) b.floor(M.checker, x0, z0, x1, z1, 0, CHK);
  b.floor(M.granite, -HX - 4, -HZ - 4, HX + 4, -HZ, 0.001, 1.2);
  b.floor(M.granite, -HX - 4, HZ, HX + 4, HZ + 4, 0.001, 1.2);
  // 樓梯開口:欄杆與樓梯
  for (const s of STAIRS) {
    const top = s.sz > 0 ? s.z0 : s.z1;     // 由大廳中間這側下樓
    const bot = s.sz > 0 ? s.z1 : s.z0;
    // 開口三面的玻璃欄杆(入口側留空)
    for (const [ax, az, bx, bz] of [[s.x0, s.z0, s.x0, s.z1], [s.x1, s.z0, s.x1, s.z1], [s.x0, bot, s.x1, bot]]) {
      const len = Math.hypot(bx - ax, bz - az);
      const along = Math.abs(bx - ax) > 0.01;
      const g = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.05), M.glass);
      g.position.set((ax + bx) / 2, 0.55, (az + bz) / 2);
      if (!along) g.rotation.y = Math.PI / 2;
      b.extra.push(g);
      b.box(M.steel, along ? len : 0.06, 0.06, along ? 0.06 : len, (ax + bx) / 2, 1.08, (az + bz) / 2);
      b.solid('1F', ax - 0.15, az - 0.15, bx + 0.15, bz + 0.15);
    }
    // 樓梯(中央)+ 兩側手扶梯,往外側下降到 B1
    const cx = (s.x0 + s.x1) / 2, n = 30, dz = (bot - top) / n, dy = (B1 - 0) / n;
    for (let i = 0; i < n; i++) b.box(M.granite, 2.6, 0.2, Math.abs(dz) + 0.02, cx, i * dy - 0.2 + dy, top + dz * (i + 0.5));
    escalator(b, M, cx - 2.3, bot, top, B1, 0);
    escalator(b, M, cx + 2.3, top, bot, 0, B1);
    for (const ex of [cx - 1.45, cx + 1.45]) b.box(M.steel, 0.08, 0.9, Math.abs(bot - top), ex, 0, (top + bot) / 2);
    // 開口內樓梯以外(手扶梯)不可走
    b.solid('1F', s.x0, s.z0, cx - 1.3, s.z1); b.solid('1F', cx + 1.3, s.z0, s.x1, s.z1);
    b.solid('B1', s.x0, s.z0, cx - 1.3, s.z1); b.solid('B1', cx + 1.3, s.z0, s.x1, s.z1);
    b.stairs.push({ box: [cx - 1.3, Math.min(top, bot), cx + 1.3, Math.max(top, bot)], axis: 'z', a: top, b: bot, yA: 0, yB: B1, fromFloor: '1F', toFloor: 'B1', label: 'B1 穿堂層' });
    // 指標:往 B1(台鐵/高鐵/捷運)
    sign(b, textTex('往 B1 穿堂層', { sub: 'To B1 · TRA / THSR / MRT', bg: '#1d3557', h: 110, w: 520 }), 3.4, 0.72, cx, 3.0, top - s.sz * 0.3, s.sz > 0 ? 0 : Math.PI);
  }

  // ---- 牆、門、柱
  const doorsOf = { N: ['北一門', '北二門', '北三門'], S: ['南一門', '南二門', '南三門'], E: ['東一門', '東二門', '東三門'], W: ['西一門', '西二門', '西三門'] };
  const exits = [];
  const sideWall = (side) => {
    const horiz = side === 'N' || side === 'S';
    const L = horiz ? HX : HZ, fixed = side === 'N' ? -HZ : side === 'S' ? HZ : side === 'W' ? -HX : HX;
    const inward = side === 'N' || side === 'W' ? 1 : -1;
    const doorAt = [-L * 0.55, 0, L * 0.55], DW = 5.2;
    // 下段花崗石牆(門洞以外)與上段牆
    const segs = [];
    let prev = -L;
    for (const d of doorAt) { segs.push([prev, d - DW / 2]); prev = d + DW / 2; }
    segs.push([prev, L]);
    for (const [a, c] of segs) {
      if (horiz) { b.wall(M.granite, a, fixed, c, fixed, 0, 7, 1.2); } else { b.wall(M.granite, fixed, c, fixed, a, 0, 7, 1.2); }
    }
    if (horiz) b.wall(M.plaster, -L, fixed, L, fixed, 7, HH, 2); else b.wall(M.plaster, fixed, L, fixed, -L, 7, HH, 2);
    // 牆在背面也要看得到:另建一層朝內的面(PlaneGeometry 單面)
    const g = horiz ? new THREE.BoxGeometry(2 * L, HH, 0.6) : new THREE.BoxGeometry(0.6, HH, 2 * L);
    const back = new THREE.Mesh(g, M.plaster);
    back.position.set(horiz ? 0 : fixed - inward * 0.31, HH / 2, horiz ? fixed - inward * 0.31 : 0);
    b.extra.push(back);
    b.solid('1F', horiz ? -L : fixed - 0.5, horiz ? fixed - 0.5 : -L, horiz ? L : fixed + 0.5, horiz ? fixed + 0.5 : L);
    // 門:玻璃自動門 + 門楣招牌
    doorAt.forEach((d, i) => {
      const x = horiz ? d : fixed, z = horiz ? fixed : d;
      const ry = horiz ? (side === 'N' ? 0 : Math.PI) : (side === 'W' ? Math.PI / 2 : -Math.PI / 2);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(DW - 0.4, 3.2), M.glass);
      gl.position.set(x, 1.6, z); gl.rotation.y = ry;
      b.extra.push(gl);
      // 門框
      const fr = (w, h, d2, ox, oy) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d2), M.darkSteel);
        m.position.set(x + (horiz ? ox : 0), oy, z + (horiz ? 0 : ox)); m.rotation.y = horiz ? 0 : Math.PI / 2;
        b.extra.push(m);
      };
      fr(DW, 0.2, 0.25, 0, 3.3); fr(0.2, 3.4, 0.25, -DW / 2, 1.7); fr(0.2, 3.4, 0.25, DW / 2, 1.7); fr(0.12, 3.2, 0.2, 0, 1.6);
      // 門楣上方石牆(3.4~7)
      if (horiz) b.wall(M.granite, d - DW / 2, fixed, d + DW / 2, fixed, 3.4, 7, 1.2); else b.wall(M.granite, fixed, d + DW / 2, fixed, d - DW / 2, 3.4, 7, 1.2);
      const name = doorsOf[side][i];
      sign(b, textTex(name, { sub: { N: 'North Gate', S: 'South Gate', E: 'East Gate', W: 'West Gate' }[side] + ` ${i + 1}`, bg: '#0f3a63', h: 100, w: 360 }), 2.2, 0.62, x + (horiz ? 0 : inward * 0.1), 4.0, z + (horiz ? inward * 0.1 : 0), ry, { double: false });
      exits.push({ name, floor: '1F', x: x + (horiz ? 0 : inward * 1.2), z: z + (horiz ? inward * 1.2 : 0) });
    });
  };
  ['N', 'S', 'E', 'W'].forEach(sideWall);

  // 大廳柱列(沿四周,距牆 2.4 m,方柱花崗石)
  const colsX = [-28, -20, -12, -4, 4, 12, 20, 28], colsZ = [-14, -6, 2, 10];
  for (const x of colsX) for (const z of [-HZ + 2.4, HZ - 2.4]) { b.box(M.granite, 1.5, HH, 1.5, x, 0, z, 0, 1.2); b.solid('1F', x - 0.75, z - 0.75, x + 0.75, z + 0.75); }
  for (const z of [-14, -6, 6, 14]) for (const x of [-HX + 2.4, HX - 2.4]) { b.box(M.granite, 1.5, HH, 1.5, x, 0, z, 0, 1.2); b.solid('1F', x - 0.75, z - 0.75, x + 0.75, z + 0.75); }
  // 2F 迴廊(商場樓層,沿大廳四周,玻璃欄杆俯瞰大廳)
  const G2 = 7.2, GD = 4.2;
  for (const [x0, z0, x1, z1] of [[-HX, -HZ, HX, -HZ + GD], [-HX, HZ - GD, HX, HZ], [-HX, -HZ + GD, -HX + GD, HZ - GD], [HX - GD, -HZ + GD, HX, HZ - GD]]) {
    b.box(M.plaster, x1 - x0, 0.6, z1 - z0, (x0 + x1) / 2, G2 - 0.6, (z0 + z1) / 2);
    b.floor(M.terrazzo, x0, z0, x1, z1, G2 + 0.001, 1.2);
  }
  for (const [ax, az, bx, bz] of [[-HX + GD, -HZ + GD, HX - GD, -HZ + GD], [-HX + GD, HZ - GD, HX - GD, HZ - GD], [-HX + GD, -HZ + GD, -HX + GD, HZ - GD], [HX - GD, -HZ + GD, HX - GD, HZ - GD]]) {
    const len = Math.hypot(bx - ax, bz - az), along = Math.abs(bx - ax) > 0.1;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.1), M.glass);
    g.position.set((ax + bx) / 2, G2 + 0.55, (az + bz) / 2);
    if (!along) g.rotation.y = Math.PI / 2;
    b.extra.push(g);
    b.box(M.steel, along ? len : 0.07, 0.07, along ? 0.07 : len, (ax + bx) / 2, G2 + 1.1, (az + bz) / 2);
    // 迴廊邊緣燈帶
    b.box(M.light, along ? len : 0.05, 0.05, along ? 0.05 : len, (ax + bx) / 2, G2 - 0.62, (az + bz) / 2);
  }
  // 2F 商場店面(迴廊內側牆)
  const shops2 = [['微風廣場', 'Breeze', '#7a1f3d'], ['美食街', 'Food Court', '#c0392b'], ['伴手禮', 'Souvenir', '#8a5a2b'], ['書店', 'Books', '#1f5c8a'], ['咖啡', 'Café', '#4a3426']];
  for (let i = 0; i < 6; i++) {
    const s = shops2[i % shops2.length];
    shopfront(b, M, s[0], s[1], s[2], -27 + i * 9.5, -20 + i * 9.5, -HZ + 0.05, G2, 3.6, 1, R);
    shopfront(b, M, shops2[(i + 2) % 5][0], shops2[(i + 2) % 5][1], shops2[(i + 2) % 5][2], -27 + i * 9.5, -20 + i * 9.5, HZ - 0.05, G2, 3.6, -1, R);
  }
  // 上段牆:高窗(高側窗,白天的天光)
  const winMat = new THREE.MeshStandardMaterial({ color: '#dfeaf2', emissive: '#c9dceb', emissiveIntensity: 0.9, roughness: 0.1 });
  for (let x = -30; x <= 30; x += 6) for (const z of [-HZ + 0.32, HZ - 0.32]) b.box(winMat, 3.2, 4.2, 0.05, x, 11.5, z);
  for (let z = -18; z <= 18; z += 6) for (const x of [-HX + 0.32, HX - 0.32]) b.box(winMat, 0.05, 4.2, 3.2, x, 11.5, z);

  // ---- 天井:格子樑天花 + 中央玻璃天窗
  b.floor(M.beam, -HX, -HZ, HX, HZ, HH, 2, false);
  for (let x = -HX; x <= HX; x += 4) b.box(M.beam, 0.5, 1.1, 2 * HZ, x, HH - 1.1, 0);
  for (let z = -HZ; z <= HZ; z += 4) b.box(M.beam, 2 * HX, 1.1, 0.5, 0, HH - 1.1, z);
  for (let x = -22; x < 22; x += 4) for (let z = -14; z < 14; z += 4) b.box(M.skylight, 3.5, 0.05, 3.5, x + 2, HH - 0.06, z + 2);
  // 天井四周的燈槽
  for (let x = -HX + 2; x < HX; x += 4) for (const z of [-HZ + 2, HZ - 2]) b.box(M.light, 2.6, 0.06, 0.6, x, HH - 1.2, z);

  // ---- 北側:LED 列車時刻看板與站名
  const board = boardTexture();
  sign(b, board, 15, 3.4, 0, 9.8, -HZ + GD + 0.15, 0, { double: false, frame: '#111' });
  sign(b, textTex('臺北車站', { sub: 'TAIPEI MAIN STATION', bg: '#f4f0e6', fg: '#1b2b44', h: 140, w: 720 }), 10, 1.9, 0, 14.2, -HZ + 0.4, 0, { double: false, glow: false, frame: '#c9b98a' });
  // 報時火車(嘟嘟鐘):懸吊在北側看板上方
  b.extra.push(trainClock(-11, 13.6, -HZ + 1.2));
  // ---- 西側:台鐵售票窗口;東三門旁:高鐵售票
  for (let i = 0; i < 8; i++) {
    const z = -12 + i * 3.2;
    b.box(M.graniteDark, 0.8, 1.1, 2.8, -HX + 1.2, 0, z);
    b.box(M.glass, 0.04, 1.4, 2.6, -HX + 1.1, 1.1, z);
    sign(b, textTex(`${i + 1}`, { bg: '#1f4e9a', h: 64, w: 96 }), 0.45, 0.3, -HX + 1.65, 2.75, z, Math.PI / 2, { double: false });
  }
  b.solid('1F', -HX, -13.5, -HX + 1.8, 12);
  sign(b, textTex('臺鐵售票', { sub: 'TRA Tickets', bg: '#1f4e9a', h: 110, w: 520 }), 6, 1.2, -HX + 0.7, 4.2, 0, Math.PI / 2, { double: false });
  for (let i = 0; i < 4; i++) { const z = 7 + i * 3; b.box(M.graniteDark, 0.8, 1.1, 2.6, HX - 1.2, 0, z); b.box(M.glass, 0.04, 1.4, 2.4, HX - 1.1, 1.1, z); }
  b.solid('1F', HX - 1.8, 5.5, HX, 18);
  sign(b, textTex('高鐵售票', { sub: 'THSR Tickets', bg: '#e8762b', h: 110, w: 520 }), 4.5, 1.0, HX - 0.7, 4.0, 11.5, -Math.PI / 2, { double: false });
  // 旅客服務中心(南側)
  b.box(M.graniteDark, 6, 1.1, 1.4, 0, 0, HZ - 6);
  b.box(M.steelPaint, 6.4, 0.3, 1.8, 0, 2.6, HZ - 6);
  sign(b, textTex('旅客服務中心', { sub: 'Information', bg: '#2a7d4f', h: 100, w: 520 }), 3.6, 0.7, 0, 3.2, HZ - 6, 0);
  b.solid('1F', -3.2, HZ - 6.9, 3.2, HZ - 5.1);

  // ---- 人群:坐在棋盤格上聊天的旅客、走動的旅客
  const spots = [];
  for (let gi = 0; gi < 7; gi++) {   // 坐地上的小團體
    const cx = -18 + R() * 36, cz = -10 + R() * 16;
    const n = 3 + ((R() * 4) | 0);
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; spots.push({ x: cx + Math.cos(a) * 1.1, z: cz + Math.sin(a) * 1.1, ry: -a - Math.PI / 2, sit: 'floor' }); }
  }
  for (let i = 0; i < 46; i++) spots.push({ x: -28 + R() * 56, z: -16 + R() * 32 });
  for (let i = 0; i < 10; i++) spots.push({ x: -HX + 3.5, z: -11 + i * 2.3, ry: -Math.PI / 2 });   // 售票排隊
  if (variant === 'obstacle') for (let i = 0; i < 26; i++) spots.push({ x: -6 + (i % 13) * 1.0, z: 6 + Math.floor(i / 13) * 1.2, ry: Math.PI });   // 排隊人龍
  b.extra.push(crowd(assets.people, spots, R));

  // 障礙物:行李推車、清潔車、施工圍籬
  if (variant === 'obstacle') {
    for (let i = 0; i < 10; i++) {
      const x = -24 + R() * 48, z = -14 + R() * 26;
      obstacleCart(b, M, x, 0, z, R() * 6);
      b.solid('1F', x - 0.8, z - 0.8, x + 0.8, z + 0.8, 1.1);
    }
    for (const [x0, z0, x1, z1] of [[-14, -4, -2, -3.4], [4, 3, 16, 3.6]]) barrier(b, M, x0, z0, x1, z1, 0, '施工中');
    b.solid('1F', -14, -4, -2, -3.4); b.solid('1F', 4, 3, 16, 3.6);
  }

  // ================================================================ B1 穿堂層與地下街
  const B1X0 = -66, B1X1 = 66, B1Z0 = -34, B1Z1 = 34, C = 1;
  const nx = (B1X1 - B1X0) / C, nz = (B1Z1 - B1Z0) / C;
  const walk = new Uint8Array(nx * nz);
  const open = (x0, z0, x1, z1) => {
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = B1X0 + (i + 0.5) * C, z = B1Z0 + (j + 0.5) * C;
      if (x > x0 && x < x1 && z > z0 && z < z1) walk[j * nx + i] = 1;
    }
  };
  const close = (x0, z0, x1, z1, m = walk) => {
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = B1X0 + (i + 0.5) * C, z = B1Z0 + (j + 0.5) * C;
      if (x > x0 && x < x1 && z > z0 && z < z1) m[j * nx + i] = 0;
    }
  };
  const PX = [-48, -24, 0, 24, 48], PW = [5, 6, 12, 6, 5];
  const PN = ['西二通道', '西通道', '中央通道', '東通道', '東二通道'];
  PX.forEach((x, i) => open(x - PW[i] / 2, -30, x + PW[i] / 2, 30));                // 五條南北向通道
  open(-62, -27, 62, -21);                                                            // 南迴廊
  open(-62, 21, 62, 27);                                                              // 北迴廊
  // 支巷(地下街的小通道)與廣場
  for (const [x0, z0, x1, z1] of [[-48, -9, -24, -5], [24, 5, 48, 9], [-24, 6, -6, 10], [6, -10, 24, -6], [-62, -3, -48, 3], [48, -3, 62, 3],
    [-36, -21, -32, -9], [32, 9, 36, 21], [-36, 10, -32, 21], [32, -21, 36, -10], [-62, -27, -58, 27], [58, -27, 62, 27], [-10, -3, 10, 3]]) open(x0, z0, x1, z1);
  // 樓梯井:B1 這一格不可走、也不建牆(樓梯從 1F 斜下來穿過這裡)
  const voidMask = new Uint8Array(nx * nz);
  for (const s of STAIRS) {
    close(s.x0, s.z0, s.x1, s.z1);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = B1X0 + (i + 0.5) * C, z = B1Z0 + (j + 0.5) * C;
      if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) voidMask[j * nx + i] = 1;
    }
    b.solid('B1', s.x0, s.z0, s.x1, s.z1);
  }
  // 樓梯落地處必須可走
  for (const s of STAIRS) { const bot = s.sz > 0 ? s.z1 : s.z0; open((s.x0 + s.x1) / 2 - 1.5, bot - (s.sz > 0 ? 0 : 2.5), (s.x0 + s.x1) / 2 + 1.5, bot + (s.sz > 0 ? 2.5 : 0)); }
  // 迷宮化:施工圍籬封路(逐一嘗試,封了會斷路就不封)
  const barriers = [];
  const baseWalk = walk.slice();   // 封路前的走道(圍籬處不建牆,只放圍籬)
  if (variant === 'maze') {
    const cand = [];
    PX.forEach((x, i) => { for (const z of [-14, -2, 14]) cand.push([x - PW[i] / 2, z, x + PW[i] / 2, z + 1.2]); });
    for (const x of [-36, -12, 12, 36, -55, 55]) for (const z of [-24.6, 23.4]) cand.push([x, z - 2.8, x + 1.2, z + 3.4]);
    for (let k = cand.length - 1; k > 0; k--) { const j = (R() * (k + 1)) | 0; [cand[k], cand[j]] = [cand[j], cand[k]]; }
    for (const c of cand) {
      const test = walk.slice();
      close(...c, test);
      const { reach, total } = connectivity(test, nx, nz);
      if (reach === total) { walk.set(test); barriers.push(c); }
    }
  }
  // 地板、天花、走道照明
  b.area('B1', B1, B1X0, B1Z0, B1X1, B1Z1);
  const walkBoxes = maskToBoxes(walk, nx, nz, C, B1X0, B1Z0);
  for (const [x0, z0, x1, z1] of walkBoxes) {
    b.floor(M.terrazzo, x0, z0, x1, z1, B1, 1.2);
    b.floor(M.ceiling, x0, z0, x1, z1, B1 + B1H, 1.2, false);
  }
  for (const [x0, z0, x1, z1] of walkBoxes) {
    const along = x1 - x0 > z1 - z0;
    const n = Math.max(1, Math.floor((along ? x1 - x0 : z1 - z0) / 3));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = along ? x0 + (x1 - x0) * t : (x0 + x1) / 2, z = along ? (z0 + z1) / 2 : z0 + (z1 - z0) * t;
      b.box(M.light, along ? 1.2 : 0.3, 0.04, along ? 0.3 : 1.2, x, B1 + B1H - 0.05, z);
    }
  }
  // 導盲磚:沿五條通道中線
  PX.forEach((x) => b.floor(M.tactile, x - 0.15, -30, x + 0.15, 30, B1 + 0.003, 0.3));
  // 實心區塊(店面/牆):走道以外的格子
  const solid = new Uint8Array(nx * nz);
  for (let k = 0; k < nx * nz; k++) solid[k] = baseWalk[k] || voidMask[k] ? 0 : 1;
  const blocks = maskToBoxes(solid, nx, nz, C, B1X0, B1Z0);
  const brands = [['全家便利商店', 'FamilyMart', '#00a0e9'], ['7-ELEVEN', '統一超商', '#008a4f'], ['誠品書店', 'eslite', '#3d3d3d'], ['鳳梨酥', '伴手禮', '#c58a1b'], ['藥妝', 'Drugstore', '#d6336c'],
    ['3C 配件', 'Gadgets', '#2b5ea7'], ['服飾', 'Fashion', '#6c4ab6'], ['手搖飲', 'Bubble Tea', '#e0712c'], ['麵包店', 'Bakery', '#a0522d'], ['電玩', 'Games', '#c2185b']];
  for (const [x0, z0, x1, z1] of blocks) {
    b.box(M.wallB1, x1 - x0, B1H, z1 - z0, (x0 + x1) / 2, B1, (z0 + z1) / 2, 0, 1.5);
    b.solid('B1', x0, z0, x1, z1);
    if ((x1 - x0) < 3 || (z1 - z0) < 3) continue;
    const isWalk = (x, z) => { const ii = Math.floor((x - B1X0) / C), jj = Math.floor((z - B1Z0) / C); return ii >= 0 && jj >= 0 && ii < nx && jj < nz && walk[jj * nx + ii]; };
    // 面向走道的四個面:長度夠就開店,不夠就掛燈箱廣告
    for (const dir of [-1, 1]) {
      const zf = dir > 0 ? z1 : z0, len = x1 - x0;
      if (!isWalk((x0 + x1) / 2, zf + dir * 0.5)) continue;
      const n = Math.floor(len / 5);
      for (let k = 0; k < n; k++) {
        const s0 = x0 + k * (len / n) + 0.2, s1 = x0 + (k + 1) * (len / n) - 0.2;
        const br = brands[(R() * brands.length) | 0];
        shopfront(b, M, br[0], br[1], br[2], s0, s1, zf + dir * 0.02, B1, B1H, dir, R);
      }
      if (!n) adBox(b, (x0 + x1) / 2, zf + dir * 0.06, dir > 0 ? 0 : Math.PI, R);
    }
    for (const dir of [-1, 1]) {
      const xf = dir > 0 ? x1 : x0, len = z1 - z0;
      if (!isWalk(xf + dir * 0.5, (z0 + z1) / 2)) continue;
      const n = Math.floor(len / 5);
      // 沿 x 面:把店面函式套在旋轉的群組裡
      for (let k = 0; k < n; k++) {
        const s0 = z0 + k * (len / n) + 0.2, s1 = z0 + (k + 1) * (len / n) - 0.2;
        if (k % 2) { adBox(b, xf + dir * 0.06, (s0 + s1) / 2, dir > 0 ? Math.PI / 2 : -Math.PI / 2, R, true); continue; }
        const br = brands[(R() * brands.length) | 0];
        shopfrontX(b, M, br, xf + dir * 0.02, s0, s1, dir, R);
      }
    }
  }
  // 施工圍籬
  for (const c of barriers) { barrier(b, M, c[0], c[1], c[2], c[3], B1, '施工中 請改道'); b.solid('B1', c[0], c[1], c[2], c[3]); }
  // 中央通道:付費區閘門(z = 0 一線)
  for (let k = 0; k < 7; k++) {
    const x = -5.1 + k * 1.7;
    b.box(M.steelPaint, 0.28, 1.0, 1.4, x, B1, 0);
    b.box(M.darkSteel, 0.3, 0.05, 1.4, x, B1 + 1.0, 0);
    if (k < 6) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.6), M.glass); f.position.set(x + 0.85, B1 + 0.6, 0); f.rotation.y = Math.PI / 2; b.extra.push(f); }
    b.solid('B1', x - 0.14, -0.7, x + 0.14, 0.7, 1.0);
  }
  sign(b, textTex('臺鐵 · 高鐵 付費區', { sub: 'TRA · THSR Paid Area', bg: '#1f4e9a', h: 100, w: 640 }), 6, 0.95, 0, B1 + 2.7, -0.2, 0);
  // 通道名稱與方向指標(多色系:台鐵藍、高鐵橘、捷運、機捷紫、地下街綠)
  PX.forEach((x, i) => {
    for (const z of [-28, 28]) sign(b, textTex(PN[i], { sub: ['West 2', 'West', 'Central', 'East', 'East 2'][i] + ' Passage', bg: '#2d3a48', h: 90, w: 420 }), 2.4, 0.52, x, B1 + 2.85, z - Math.sign(z) * 0.5, z > 0 ? 0 : Math.PI);
  });
  const way = [
    ['機場捷運 A1', 'Airport MRT', '#7b3f98', -48, 18], ['K 區地下街', 'K Mall', '#2a8a4a', -60, 0], ['捷運 淡水信義線', 'MRT Red Line', '#d22630', 0, -18],
    ['捷運 板南線', 'MRT Blue Line', '#0070bd', 12, -24], ['Y 區 台北地下街', 'Taipei City Mall', '#3a9a5a', -40, 24], ['Z 區 站前地下街', 'Zhongzheng Mall', '#3a9a5a', 40, -24],
    ['高鐵 THSR', 'High Speed Rail', '#e8762b', 6, 12], ['臺鐵 TRA', 'Taiwan Railway', '#1f4e9a', -6, 12], ['M3 出口', 'Exit M3', '#f0a020', 48, 24], ['M8 出口', 'Exit M8', '#f0a020', -24, -24],
  ];
  for (const [t, s, col, x, z] of way) {
    // 在南北向通道內 → 牌面朝南北;在東西向迴廊 → 牌面朝東西
    const inNS = PX.some((px, i) => Math.abs(x - px) < PW[i] / 2 + 0.5) && Math.abs(z) < 20;
    sign(b, textTex(t, { sub: s, bg: col, h: 90, w: 460 }), 2.6, 0.5, x, B1 + 2.85, z, inNS ? 0 : Math.PI / 2);
  }
  // 出口(地下街盡頭)
  const exitPts = [['Y 區地下街', -61, 25], ['Z 區地下街', 61, -25], ['K 區地下街', -61, 0], ['機場捷運', -48, 29], ['M3', 48, 29], ['M8', -24, -29]];
  for (const [name, x, z] of exitPts) exits.push({ name, floor: 'B1', x, z });
  // B1 人群
  const bspots = [];
  for (const [x0, z0, x1, z1] of walkBoxes) {
    const n = Math.floor((x1 - x0) * (z1 - z0) / 40);
    for (let k = 0; k < n; k++) bspots.push({ x: x0 + 0.6 + R() * (x1 - x0 - 1.2), z: z0 + 0.6 + R() * (z1 - z0 - 1.2), y: B1 });
  }
  b.extra.push(crowd(assets.people, bspots.slice(0, 120), R));

  // ================================================================ 燈光
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight('#fff8ee', '#5a5048', 1.1));
  const sun = new THREE.DirectionalLight('#fff4e0', 1.6);
  sun.position.set(10, 40, 6);
  sun.target.position.set(0, 0, 0);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 30, bottom: -30, near: 1, far: 80 });
    sun.shadow.bias = -0.0005;
  }
  lights.add(sun, sun.target);
  for (const [x, z] of [[-20, -8], [0, -8], [20, -8], [-20, 8], [0, 8], [20, 8]]) {
    const p = new THREE.PointLight('#fff1dc', 40, 30, 1.6);
    p.position.set(x, 12, z);
    lights.add(p);
  }
  // B1:沿主通道的燈
  for (const x of PX) for (const z of [-22, -8, 8, 22]) { const p = new THREE.PointLight('#f4f6ff', 6, 12, 1.5); p.position.set(x, B1 + 3, z); lights.add(p); }
  b.extra.push(lights);

  b.finish();
  return {
    group: b.group, solids: b.solids, floors: b.floors, stairs: b.stairs, exits,
    spawn: { floor: '1F', x: 0, z: 14, ry: Math.PI / 2 },
    name: '臺北車站', sky: 'indoor', variant, ceil: { '1F': HH - 1.2, B1: B1 + B1H },
    poi: [{ name: '1F 大廳', floor: '1F', x: 0, z: 0 }, { name: 'B1 中央通道閘門', floor: 'B1', x: 0, z: 4 }],
  };
}

/** LED 時刻看板(臺鐵/高鐵發車資訊) */
function boardTexture() {
  return canvasTexture(1024, 232, (c, w, h) => {
    c.fillStyle = '#050505'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1f4e9a'; c.fillRect(0, 0, w, 34);
    c.fillStyle = '#fff'; c.font = `700 22px ${FONT}`; c.textBaseline = 'middle';
    const cols = [16, 120, 260, 520, 700, 860];
    ['車次', '車種', '開往 To', '開車時間', '月台', '備註'].forEach((t, i) => c.fillText(t, cols[i], 17));
    const rows = [['152', '自強(3000)', '花蓮 Hualien', '14:05', '3A', '準點'], ['1157', '區間', '新竹 Hsinchu', '14:08', '4B', '準點'],
      ['625', '高鐵', '左營 Zuoying', '14:11', '高鐵', 'THSR'], ['122', '自強', '高雄 Kaohsiung', '14:20', '3B', '誤點 5 分'],
      ['2128', '區間快', '基隆 Keelung', '14:24', '4A', '準點'], ['578', '莒光', '臺東 Taitung', '14:30', '3A', '準點']];
    rows.forEach((r, j) => {
      const y = 50 + j * 30;
      r.forEach((t, i) => {
        c.fillStyle = i === 5 && t.startsWith('誤點') ? '#ff4b3a' : i === 3 ? '#59ff8a' : '#ffb21f';
        c.font = `700 22px ${FONT}`;
        c.fillText(t, cols[i], y);
      });
    });
    c.fillStyle = 'rgba(0,0,0,0.45)';
    for (let x = 0; x < w; x += 3) c.fillRect(x, 34, 1, h);
  }, { wrap: false });
}

/** 報時火車(嘟嘟鐘):小火車造型的時鐘 */
function trainClock(x, y, z) {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#b3261e', roughness: 0.4, metalness: 0.3 });
  const blue = new THREE.MeshStandardMaterial({ color: '#1f4e9a', roughness: 0.4, metalness: 0.3 });
  const black = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.5 });
  const gold = new THREE.MeshStandardMaterial({ color: '#d4af37', roughness: 0.3, metalness: 0.9 });
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.4, 24), red); boiler.rotation.z = Math.PI / 2; boiler.position.set(0, 0.6, 0); g.add(boiler);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 1.1), blue); cab.position.set(1.6, 0.8, 0); g.add(cab);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.6, 12), black); stack.position.set(-0.8, 1.3, 0); g.add(stack);
  for (const wx of [-0.8, 0, 0.8, 1.6]) for (const wz of [-0.5, 0.5]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 20), black); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.05, wz); g.add(w); }
  // 鐘面
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ map: canvasTexture(128, 128, (c, w, h) => {
    c.fillStyle = '#fffdf3'; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill();
    c.fillStyle = '#222'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.fillRect(64 + Math.sin(a) * 50 - 2, 64 - Math.cos(a) * 50 - 2, 4, 4); }
    c.strokeStyle = '#222'; c.lineWidth = 5; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 28); c.stroke(); c.beginPath(); c.moveTo(64, 64); c.lineTo(92, 64); c.stroke();
  }, { wrap: false }) }));
  face.position.set(-1.22, 0.6, 0); face.rotation.y = -Math.PI / 2; g.add(face);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.05, 8, 32), gold); ring.position.copy(face.position); ring.rotation.y = Math.PI / 2; g.add(ring);
  for (const sx of [-0.6, 1.4]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3, 6), black); r.position.set(sx, 3, 0); g.add(r); }
  g.position.set(x, y, z);
  g.rotation.y = Math.PI / 2;
  g.scale.setScalar(1.2);
  return g;
}

/** 燈箱廣告(地下街牆面) */
function adBox(b, x, z, ry, R, side = false) {
  const ads = [['台灣好行', '#1f7a8c'], ['鐵道旅行', '#b23a2a'], ['夜市美食', '#d68910'], ['捷運悠遊卡', '#2e86c1'], ['阿里山', '#2e7d32'], ['日月潭', '#5b2c6f']];
  const a = ads[(R() * ads.length) | 0];
  const tex = textTex(a[0], { sub: 'Taiwan Railway', bg: a[1], h: 300, w: 200 });
  sign(b, tex, 1.2, 1.8, x, -6 + 1.6, z, ry, { double: false, frame: '#d8d8d8' });
}

/** 沿 x 面(牆在 xf)的店面:櫥窗 + 招牌 */
function shopfrontX(b, M, br, xf, z0, z1, dir, R) {
  const w = z1 - z0, cz = (z0 + z1) / 2, y0 = -6, h = 3.4;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, h - 0.9), M.shopGlass);
  glass.position.set(xf + dir * 0.01, y0 + (h - 0.9) / 2, cz);
  glass.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  b.extra.push(glass);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, h - 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(br[2]).lerp(new THREE.Color('#fff7e6'), 0.75) }));
  back.position.set(xf - dir * 1.2, y0 + (h - 0.9) / 2, cz);
  back.rotation.y = glass.rotation.y;
  b.extra.push(back);
  for (let i = 0; i < Math.floor(w / 1.4); i++) b.box(M.shelf, 0.45, 1.2 + R() * 0.5, 0.9, xf - dir * 0.9, y0, z0 + 0.9 + i * 1.4);
  sign(b, textTex(br[0], { bg: br[2], sub: br[1], h: 96, w: 512 }), Math.min(w - 0.4, 3.2), 0.6, xf + dir * 0.04, y0 + h - 0.45, cz, glass.rotation.y, { double: false });
}

/** 行李推車/清潔車(障礙) */
function obstacleCart(b, M, x, y, z, ry) {
  b.box(M.steel, 1.2, 0.08, 0.7, x, y + 0.25, z, ry);
  b.box(M.steel, 0.06, 1.0, 0.7, x + Math.cos(ry) * 0.6, y + 0.25, z - Math.sin(ry) * 0.6, ry);
  b.box(M.tex(null, 0.8, 0, '#3e5c7a'), 0.9, 0.55, 0.55, x, y + 0.3, z, ry);
  b.box(M.tex(null, 0.8, 0, '#8a3a2a'), 0.6, 0.45, 0.45, x - 0.1, y + 0.85, z, ry + 0.3);
}

/** 施工圍籬(黃黑斜紋 + 告示) */
export function barrier(b, M, x0, z0, x1, z1, y, text) {
  const stripe = canvasTexture(256, 64, (c, w, h) => {
    c.fillStyle = '#f2c230'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1b1b1b';
    for (let x = -h; x < w; x += 32) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 16, h); c.lineTo(x + 16 + h, 0); c.lineTo(x + h, 0); c.fill(); }
  });
  const mat = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6 });
  const w = x1 - x0, d = z1 - z0;
  b.box(mat, Math.max(w, 0.1), 1.6, Math.max(d, 0.1), (x0 + x1) / 2, y, (z0 + z1) / 2, 0, 0.8);
  const along = w > d;
  sign(b, textTex(text, { bg: '#c0392b', h: 90, w: 420, sub: 'Under Construction' }), 1.6, 0.4, (x0 + x1) / 2, y + 1.1, (z0 + z1) / 2, along ? 0 : Math.PI / 2);
}
