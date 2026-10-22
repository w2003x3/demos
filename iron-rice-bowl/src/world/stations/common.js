// 車站場景共用工具:合併幾何的建造器、程序化材質貼圖、指標牌、人群、碰撞/樓層。
// 座標:公尺,y 向上;每座車站自訂原點。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture, rng } from '../../core/textures.js';

export const FONT = '"Noto Sans TC","Microsoft JhengHei",sans-serif';

/**
 * 建造器:同材質的幾何合併成一個網格(大型車站數千個構件也只有數十個 draw call)。
 * 另外記錄每層樓的碰撞方塊(solids)與樓梯區(stairs),供走動用。
 */
export class Builder {
  constructor() {
    this.group = new THREE.Group();
    this.parts = new Map();          // material → geometry[]
    this.solids = {};                // floor → [x0, z0, x1, z1][]
    this.stairs = [];                // { from, to, box:[x0,z0,x1,z1], exit:{x,z}, label }
    this.floors = {};                // floor → { y, bounds:[x0,z0,x1,z1][] } 可走範圍(多個矩形聯集)
    this.extra = [];                 // 不合併的物件(發光、透明、動畫)
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
  }

  add(mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    this._e.set(rx, ry, rz);
    this._q.setFromEuler(this._e);
    this._m.compose(new THREE.Vector3(x, y, z), this._q, new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(this._m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return g;
  }

  /** 方塊(中心 x,z;底 y0;UV 以公尺 / uvScale 計,讓貼圖比例一致) */
  box(mat, w, h, d, x, y0, z, ry = 0, uvScale = 1) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (uvScale) worldUV(g, w, h, d, uvScale);
    return this.add(mat, g, x, y0 + h / 2, z, ry);
  }

  /** 水平面(地板/天花):朝上 up=true */
  floor(mat, x0, z0, x1, z1, y, uvScale = 1, up = true) {
    const w = x1 - x0, d = z1 - z0;
    const g = new THREE.PlaneGeometry(w, d);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * w) / uvScale, (-z1 + uv.getY(i) * d) / uvScale);
    return this.add(mat, g, (x0 + x1) / 2, y, (z0 + z1) / 2, 0, up ? -Math.PI / 2 : Math.PI / 2);
  }

  /** 牆面板(沿 x 或 z 的垂直面) */
  wall(mat, x0, z0, x1, z1, y0, y1, uvScale = 1) {
    const len = Math.hypot(x1 - x0, z1 - z0), h = y1 - y0;
    const g = new THREE.PlaneGeometry(len, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / uvScale, (y0 + uv.getY(i) * h) / uvScale);
    g.setAttribute('uv', uv);
    const m = this.add(mat, g, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0));
    return m;
  }

  /** 碰撞方塊;h = 高度(低矮障礙,跳得過去;省略 = 牆,不能跳過) */
  solid(floor, x0, z0, x1, z1, h) { const s = [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]; if (h != null) s.push(h); (this.solids[floor] ??= []).push(s); }
  area(floor, y, x0, z0, x1, z1) { const f = (this.floors[floor] ??= { y, bounds: [] }); f.bounds.push([x0, z0, x1, z1]); }

  finish() {
    for (const [mat, geos] of this.parts) {
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      m.castShadow = !mat.transparent && !mat.userData.noShadow;
      m.receiveShadow = true;
      this.group.add(m);
    }
    for (const o of this.extra) this.group.add(o);
    this.parts.clear();
    return this.group;
  }
}

/** BoxGeometry 的 UV 依面的實際公尺數 */
function worldUV(g, w, h, d, s) {
  const uv = g.attributes.uv;
  // 6 個面各 4 個頂點,順序:+x -x +y -y +z -z
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0] / s, uv.getY(i) * dims[f][1] / s);
  }
}

// ---------------------------------------------------------------- 貼圖
const cache = new Map();
const once = (key, f) => { if (!cache.has(key)) cache.set(key, f()); return cache.get(key); };

/** 石材斑點(花崗石) */
function speckle(c, w, h, R, n, colors, size = [1, 2.5]) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = colors[(R() * colors.length) | 0];
    const s = size[0] + R() * (size[1] - size[0]);
    c.fillRect(R() * w, R() * h, s, s);
  }
}

export const T = {
  /** 黑白棋盤格石材地板(一張 = 2×2 格) */
  checker: () => once('checker', () => {
    const R = rng(3);
    return canvasTexture(512, 512, (c, w, h) => {
      const s = w / 2;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const black = (i + j) % 2 === 0;
        c.fillStyle = black ? '#1b1c1e' : '#e9e6df';
        c.fillRect(i * s, j * s, s, s);
        speckle(c, s, s, R, 0, []);
        for (let k = 0; k < 1400; k++) {
          c.fillStyle = black ? `rgba(${90 + R() * 60},${90 + R() * 60},${95 + R() * 60},${0.25 + R() * 0.3})` : `rgba(${120 + R() * 60},${115 + R() * 60},${110 + R() * 60},${0.18 + R() * 0.2})`;
          const sz = 1 + R() * 2.5;
          c.fillRect(i * s + R() * s, j * s + R() * s, sz, sz);
        }
        // 石材紋理(淡淡的雲紋)
        c.strokeStyle = black ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        c.lineWidth = 1;
        for (let k = 0; k < 6; k++) {
          c.beginPath();
          let x = i * s + R() * s, y = j * s;
          c.moveTo(x, y);
          for (let t = 0; t < 8; t++) { x += (R() - 0.5) * 30; y += s / 8; c.lineTo(x, y); }
          c.stroke();
        }
      }
      c.fillStyle = 'rgba(120,120,120,0.6)';   // 細縫
      c.fillRect(0, 0, w, 2); c.fillRect(0, s - 1, w, 2); c.fillRect(0, 0, 2, h); c.fillRect(s - 1, 0, 2, h);
    });
  }),
  /** 米色花崗石(牆面、柱) */
  granite: (tone = '#cdbfa8') => once(`granite${tone}`, () => {
    const R = rng(7);
    return canvasTexture(256, 256, (c, w, h) => {
      c.fillStyle = tone; c.fillRect(0, 0, w, h);
      speckle(c, w, h, R, 3000, ['rgba(80,70,60,0.25)', 'rgba(255,255,255,0.18)', 'rgba(140,110,90,0.2)'], [1, 2]);
      c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, 0, w, 2); c.fillRect(0, 0, 2, h);
    });
  }),
  /** 磨石子/淺灰地磚(地下通道) */
  terrazzo: (tone = '#bdbab2', grid = true) => once(`terr${tone}${grid}`, () => {
    const R = rng(11);
    return canvasTexture(256, 256, (c, w, h) => {
      c.fillStyle = tone; c.fillRect(0, 0, w, h);
      speckle(c, w, h, R, 2600, ['rgba(60,60,60,0.25)', 'rgba(255,255,255,0.25)', 'rgba(150,120,90,0.2)'], [1, 3]);
      if (grid) { c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(0, 0, w, 2); c.fillRect(0, 0, 2, h); }
    });
  }),
  /** 導盲磚(黃) */
  tactile: () => once('tactile', () => canvasTexture(128, 128, (c, w, h) => {
    c.fillStyle = '#e8b81c'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 4; i++) c.fillRect(10 + i * 30, 10, 12, h - 20);
  })),
  /** 天花板方格(礦纖板 + 鋁格柵) */
  ceilingGrid: () => once('ceilgrid', () => canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#efefe9'; c.fillRect(0, 0, w, h);
    const R = rng(5);
    for (let i = 0; i < 900; i++) { c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(R() * w, R() * h, 2, 2); }
    c.fillStyle = '#b8bcbf'; c.fillRect(0, 0, w, 6); c.fillRect(0, 0, 6, h);
  })),
  /** 紅磚(英式砌法)+ 灰縫 */
  brick: () => once('brick', () => {
    const R = rng(13);
    return canvasTexture(256, 256, (c, w, h) => {
      c.fillStyle = '#d8cfc0'; c.fillRect(0, 0, w, h);
      const bh = 16, bw = 48;
      for (let r = 0; r < h / bh; r++) {
        const header = r % 2 === 1, bwr = header ? bw / 2 : bw;
        for (let x = header ? -bwr / 2 : 0; x < w; x += bwr) {
          const v = R();
          c.fillStyle = `rgb(${150 + v * 40},${62 + v * 18},${45 + v * 12})`;
          c.fillRect(x + 1.5, r * bh + 1.5, bwr - 3, bh - 3);
        }
      }
    });
  }),
  /** 深灰屋瓦 */
  rooftile: (tone = '#4a4d50') => once(`roof${tone}`, () => canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = tone; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, y, w, 3);
      for (let x = (y / 16) % 2 ? 12 : 0; x < w; x += 24) { c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(x, y + 3, 12, 13); }
    }
  })),
  /** 灰白洗石子/抿石子外牆 */
  plaster: (tone = '#d9d5cc') => once(`plaster${tone}`, () => {
    const R = rng(17);
    return canvasTexture(256, 256, (c, w, h) => {
      c.fillStyle = tone; c.fillRect(0, 0, w, h);
      speckle(c, w, h, R, 4000, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.1)'], [1, 2]);
    });
  }),
  /** 太陽能板 */
  solar: () => once('solar', () => canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#16233a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#8a97a8'; c.lineWidth = 3; c.strokeRect(2, 2, w - 4, h - 4);
    c.strokeStyle = 'rgba(160,180,210,0.35)'; c.lineWidth = 1;
    for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y < h; y += 21) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  })),
  /** 植栽(屋頂綠化) */
  greenery: () => once('green', () => {
    const R = rng(23);
    return canvasTexture(256, 256, (c, w, h) => {
      c.fillStyle = '#4c6f32'; c.fillRect(0, 0, w, h);
      speckle(c, w, h, R, 5000, ['#3b5a26', '#6a8f42', '#7fa556', '#2f4a1f', '#8c9a4a'], [2, 6]);
    });
  }),
};

/** 文字貼圖(指標、店招) */
export function textTex(lines, { w = 512, h = 128, bg = '#16243a', fg = '#ffffff', sub = null, align = 'center', icon = null, border = null } = {}) {
  return canvasTexture(w, h, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    if (border) { c.strokeStyle = border; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6); }
    c.fillStyle = fg; c.textAlign = align; c.textBaseline = 'middle';
    const x = align === 'center' ? w / 2 : 22 + (icon ? h * 0.8 : 0);
    if (icon) {
      c.fillStyle = icon.bg; c.fillRect(14, h * 0.15, h * 0.7, h * 0.7);
      c.fillStyle = icon.fg || '#fff'; c.font = `900 ${h * 0.42}px ${FONT}`; c.textAlign = 'center';
      c.fillText(icon.t, 14 + h * 0.35, h * 0.52);
      c.textAlign = align; c.fillStyle = fg;
    }
    const main = Array.isArray(lines) ? lines[0] : lines;
    c.font = `900 ${sub ? h * 0.42 : h * 0.55}px ${FONT}`;
    c.fillText(main, x, sub ? h * 0.38 : h * 0.53);
    if (sub) { c.font = `500 ${h * 0.24}px ${FONT}`; c.globalAlpha = 0.85; c.fillText(sub, x, h * 0.76); c.globalAlpha = 1; }
  }, { wrap: false });
}

/** 平面招牌(雙面)加到 builder.extra */
export function sign(b, tex, w, h, x, y, z, ry = 0, { glow = true, frame = '#202326', double = true } = {}) {
  const g = new THREE.Group();
  const mat = glow ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  const f = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.06), new THREE.MeshStandardMaterial({ color: frame, roughness: 0.5, metalness: 0.4 }));
  g.add(f);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  p.position.z = 0.032;
  g.add(p);
  if (double) { const q = p.clone(); q.position.z = -0.032; q.rotation.y = Math.PI; g.add(q); }
  g.position.set(x, y, z);
  g.rotation.y = ry;
  b.extra.push(g);
  return g;
}

/** 店面(櫥窗 + 招牌),面向 dir(+1 = +z) */
export function shopfront(b, M, name, sub, color, x0, x1, z, y0, h, dir = 1, R = Math.random) {
  const w = x1 - x0, cx = (x0 + x1) / 2;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, h - 0.9), M.shopGlass);
  glass.position.set(cx, y0 + (h - 0.9) / 2, z + dir * 0.01);
  if (dir < 0) glass.rotation.y = Math.PI;
  b.extra.push(glass);
  // 店內亮光(背板)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, h - 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#fff7e6'), 0.75), toneMapped: true }));
  back.position.set(cx, y0 + (h - 0.9) / 2, z - dir * 1.2);
  if (dir < 0) back.rotation.y = Math.PI;
  b.extra.push(back);
  // 貨架(幾個方塊)
  for (let i = 0; i < Math.floor(w / 1.4); i++) b.box(M.shelf, 0.9, 1.2 + R() * 0.5, 0.45, x0 + 0.9 + i * 1.4, y0, z - dir * 0.9);
  b.box(M.trim, w, 0.12, 0.12, cx, y0 + h - 0.92, z);
  sign(b, textTex(name, { bg: color, sub, h: 96, w: 512 }), Math.min(w - 0.4, 3.2), 0.6, cx, y0 + h - 0.45, z + dir * 0.04, dir < 0 ? Math.PI : 0, { double: false });
}

/** 常用材質 */
export function baseMats(env) {
  return {
    trim: new THREE.MeshStandardMaterial({ color: '#2b2e31', roughness: 0.45, metalness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: '#c9ced3', roughness: 0.3, metalness: 0.9 }),
    steelPaint: new THREE.MeshStandardMaterial({ color: '#e6e8ea', roughness: 0.45, metalness: 0.3 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: '#3a3f44', roughness: 0.4, metalness: 0.7 }),
    glass: Object.assign(new THREE.MeshStandardMaterial({ color: '#cfe3ea', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }), { userData: { noShadow: true } }),
    shopGlass: new THREE.MeshStandardMaterial({ color: '#dfeef2', roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false }),
    shelf: new THREE.MeshStandardMaterial({ color: '#f1efe8', roughness: 0.7 }),
    rail: new THREE.MeshStandardMaterial({ color: '#b6bcc2', roughness: 0.25, metalness: 0.95 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#1d1e20', roughness: 0.9 }),
    light: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6e4', emissiveIntensity: 1.8, roughness: 0.4 }),
    tex: (map, rough = 0.6, metal = 0, color = '#ffffff') => new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: metal, color }),
  };
}

/** 人群:rail-assets 寫實人物,站姿/坐姿(坐在地上:坐姿再往下 0.45 m) */
export function crowd(people, spots, R = Math.random) {
  const g = new THREE.Group();
  if (!people?.length) return g;
  const by = new Map();
  for (const s of spots) {
    const p = people[(R() * people.length) | 0];
    const key = `${p.id}|${s.sit ? 1 : 0}`;
    if (!by.has(key)) by.set(key, { src: s.sit ? p.sit : p.stand, list: [] });
    by.get(key).list.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, (s.y || 0) - (s.sit === 'floor' ? 0.42 : 0), s.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.ry ?? R() * 6.28), new THREE.Vector3(1, 1, 1)));
  }
  for (const { src, list } of by.values()) {
    src.updateMatrixWorld(true);
    src.traverse((o) => {
      if (!o.isMesh) return;
      const im = new THREE.InstancedMesh(o.geometry, o.material, list.length);
      const t = new THREE.Matrix4();
      list.forEach((m, i) => im.setMatrixAt(i, t.multiplyMatrices(m, o.matrixWorld)));
      im.castShadow = true;
      g.add(im);
    });
  }
  return g;
}

/** 手扶梯(含扶手、階梯斜面);由 (x, y0, z0) 往 dir 方向上升到 y1 */
export function escalator(b, M, x, z0, z1, y0, y1, width = 1.2) {
  const len = Math.abs(z1 - z0), rise = y1 - y0, ang = Math.atan2(rise, len), dirz = Math.sign(z1 - z0);
  const L = Math.hypot(len, rise), cz = (z0 + z1) / 2, cy = (y0 + y1) / 2;
  const steps = new THREE.BoxGeometry(width, 0.08, L);
  b.add(M.darkSteel, steps, x, cy, cz, 0, dirz > 0 ? -ang : ang);
  for (const s of [-1, 1]) {
    b.add(M.steel, new THREE.BoxGeometry(0.08, 0.9, L), x + s * (width / 2 + 0.05), cy + 0.45, cz, 0, dirz > 0 ? -ang : ang);
    b.add(M.rubber, new THREE.BoxGeometry(0.1, 0.06, L), x + s * (width / 2 + 0.05), cy + 0.93, cz, 0, dirz > 0 ? -ang : ang);
  }
}

/**
 * 網格遮罩 → 合併成最少的矩形(貪婪法)。mask[j*nx+i] 為 true 的格子會被合併。
 * 回傳 [[x0, z0, x1, z1]](公尺)
 */
export function maskToBoxes(mask, nx, nz, cell, x0, z0) {
  const used = new Uint8Array(nx * nz), out = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (!mask[j * nx + i] || used[j * nx + i]) continue;
    let w = 1;
    while (i + w < nx && mask[j * nx + i + w] && !used[j * nx + i + w]) w++;
    let h = 1;
    outer: while (j + h < nz) {
      for (let k = 0; k < w; k++) if (!mask[(j + h) * nx + i + k] || used[(j + h) * nx + i + k]) break outer;
      h++;
    }
    for (let a = 0; a < h; a++) for (let k = 0; k < w; k++) used[(j + a) * nx + i + k] = 1;
    out.push([x0 + i * cell, z0 + j * cell, x0 + (i + w) * cell, z0 + (j + h) * cell]);
  }
  return out;
}

/** 檢查走道是否連通(格子 BFS),回傳可到達的格子數與總數 */
export function connectivity(mask, nx, nz) {
  let start = -1, total = 0;
  for (let k = 0; k < nx * nz; k++) if (mask[k]) { total++; if (start < 0) start = k; }
  if (start < 0) return { reach: 0, total };
  const seen = new Uint8Array(nx * nz), q = [start];
  seen[start] = 1;
  let reach = 0;
  while (q.length) {
    const k = q.pop(); reach++;
    const i = k % nx, j = (k / nx) | 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + a, jj = j + b;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const kk = jj * nx + ii;
      if (mask[kk] && !seen[kk]) { seen[kk] = 1; q.push(kk); }
    }
  }
  return { reach, total };
}

// ---------------------------------------------------------------- 新增積木(臺南/基隆/宜蘭)

/** 實心牆(方塊 + 碰撞) */
export function wallBox(b, mat, floor, x0, z0, x1, z1, y, h, uv = 1) {
  const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0);
  b.box(mat, Math.max(w, 0.05), h, Math.max(d, 0.05), (x0 + x1) / 2, y, (z0 + z1) / 2, 0, uv);
  if (floor) b.solid(floor, x0, z0, x1, z1);
}

/**
 * 有開口的立面板(沿 x,寬 w、高 h、厚 depth),開口 holes:[{x, y, w, h, arch}](x 為中心,相對面板左下);
 * arch=true 開口上緣為半圓拱。回傳 ExtrudeGeometry(原點在面板底部中心,正面朝 +z)。
 */
export function facadeGeo(w, h, holes = [], depth = 0.4) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0);
  for (const o of holes) {
    const p = new THREE.Path(), x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, r = o.w / 2;
    const top = o.y + o.h - (o.arch ? r : 0);
    p.moveTo(x0, o.y); p.lineTo(x1, o.y); p.lineTo(x1, top);
    if (o.arch) p.absarc(o.x, top, r, 0, Math.PI, false); else p.lineTo(x0, top);
    p.lineTo(x0, o.y);
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 14 });
  g.translate(0, 0, -depth / 2);
  // 依公尺計的 UV(ExtrudeGeometry 的正面 UV 即形狀座標)
  return g;
}

/** 依遮罩(1 m 格)鋪地板:mask(i, j) 回傳 true 的格子 */
export function maskFloor(b, mat, x0, z0, x1, z1, y, test, uvScale = 1.2) {
  const nx = Math.round(x1 - x0), nz = Math.round(z1 - z0), mask = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) mask[j * nx + i] = test(x0 + i + 0.5, z0 + j + 0.5) ? 1 : 0;
  for (const [a, c, d, e] of maskToBoxes(mask, nx, nz, 1, x0, z0)) b.floor(mat, a, c, d, e, y, uvScale);
}

/**
 * 真實列車模型(rail-assets 列車目錄):沿 x 停放,x0 = 車頭前端,dir = 1 車身往 +x 延伸(車頭朝 -x)。
 * railTop = 軌面高度;沒有模型庫時退回簡易方塊列車。回傳 true 表示使用了模型。
 */
export function railTrain(b, rail, id, x0, cars, railTop, z, dir = 1) {
  const T = rail?.trains?.[id];
  if (!T || !rail.has(T.lead.slot)) return false;
  const g = new THREE.Group();
  let off = 0;
  for (let k = 0; k < cars; k++) {
    const isTail = k === cars - 1 && cars > 1;
    const lead = k === 0 || (isTail && T.tailCab !== false);
    const part = lead ? T.lead : T.middle;
    const car = rail.instance(part.slot);
    if (!car) return false;
    car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const front = x0 + dir * off;
    if (isTail && lead) { car.position.set(front + dir * part.length, railTop, z); car.rotation.y = -dir * Math.PI / 2; }
    else { car.position.set(front, railTop, z); car.rotation.y = dir * Math.PI / 2; }
    g.add(car);
    off += part.length + (T.gap ?? 0.6);
  }
  b.extra.push(g);
  return true;
}

/** 鈦鐵列車(EMU 白色車體 + 黑窗帶 + 色帶、車門、車頂設備;端車有斜面車頭)沿 x 停放 */
export function trainSet(b, M, x0, cars, y, z, { stripe = '#e8730c', len = 20, dir = 1 } = {}) {
  const body = M._trainWhite ??= new THREE.MeshStandardMaterial({ color: '#eef0f0', roughness: 0.32, metalness: 0.45 });
  const band = M._trainBand ??= new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.15, metalness: 0.3 });
  const st = M[`_stripe${stripe}`] ??= new THREE.MeshStandardMaterial({ color: stripe, roughness: 0.4 });
  const door = M._trainDoor ??= new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.3, metalness: 0.6 });
  const under = M._trainUnder ??= new THREE.MeshStandardMaterial({ color: '#2a2c2f', roughness: 0.8 });
  for (let k = 0; k < cars; k++) {
    const cx = x0 + dir * (k * (len + 0.6) + len / 2), end = k === 0 ? -dir : k === cars - 1 ? dir : 0;
    const L = end ? len - 2.4 : len, ox = end ? -end * 1.2 : 0;
    b.box(under, len - 1, 0.7, 2.6, cx, y + 0.35, z);
    b.box(body, L, 3.0, 2.95, cx + ox, y + 1.05, z);
    b.box(band, L + 0.02, 0.95, 2.97, cx + ox, y + 2.25, z);
    b.box(st, L + 0.02, 0.18, 2.97, cx + ox, y + 1.75, z);
    b.box(body, L - 0.4, 0.35, 2.4, cx + ox, y + 4.05, z);   // 車頂冷氣
    for (const s of [-1, 1]) for (const dx of [-L / 2 + 3, -L / 6, L / 6, L / 2 - 3]) b.box(door, 1.3, 1.95, 0.04, cx + ox + dx, y + 1.1, z + s * 1.49);
    if (end) {
      // 斜面車頭:下段方塊 + 上段向前收的斜面 + 黑色擋風玻璃
      const nx = cx + end * (len / 2 - 1.2);
      b.box(body, 2.4, 1.6, 2.95, nx, y + 1.05, z);
      b.add(band, new THREE.BoxGeometry(2.6, 1.7, 2.9), nx - end * 0.1, y + 3.0, z, 0, 0, end * 0.55);
      b.box(st, 2.42, 0.18, 2.97, nx, y + 1.75, z);
      const lamp = M._lamp ??= new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff4d8', emissiveIntensity: 1.5 });
      for (const s of [-0.9, 0.9]) b.box(lamp, 0.06, 0.18, 0.4, nx + end * 1.2, y + 1.4, z + s);
    }
  }
}

/** 月台邊緣:黃色警戒線 + 導盲磚 */
export function platformEdge(b, M, x0, x1, z, y, side) {
  const yel = M._yel ??= new THREE.MeshStandardMaterial({ color: '#f0c419', roughness: 0.6 });
  b.floor(yel, x0, z - side * 0.75 - 0.08, x1, z - side * 0.75 + 0.08, y + 0.004);
  b.floor(M._tac ??= M.tex(T.tactile(), 0.6), x0, Math.min(z - side * 1.0, z - side * 1.3), x1, Math.max(z - side * 1.0, z - side * 1.3), y + 0.004, 0.3);
}

/** 遠山(低多邊形起伏山體,背景用) */
export function hills(b, mat, x0, x1, z, depth, hmax, seed = 1, rot = 0) {
  const R = rng(seed), nx = 40, nz = 8;
  const g = new THREE.PlaneGeometry(x1 - x0, depth, nx, nz);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const ph = [R() * 6, R() * 6, R() * 6];
  for (let i = 0; i < p.count; i++) {
    const u = (p.getX(i) + (x1 - x0) / 2) / (x1 - x0), v = 1 - (p.getZ(i) + depth / 2) / depth;   // v = 0 在 +z 側(面向觀者)
    const ridge = 0.55 + 0.25 * Math.sin(u * 7 + ph[0]) + 0.15 * Math.sin(u * 17 + ph[1]) + 0.05 * Math.sin(u * 41 + ph[2]);
    p.setY(i, Math.max(0, hmax * ridge * Math.sin(Math.min(1, v * 1.2) * Math.PI * 0.5) * (v > 0.85 ? 1 - (v - 0.85) * 3 : 1)) + (R() - 0.5) * 1.2 * v);
  }
  g.computeVertexNormals();
  b.add(mat, g, (x0 + x1) / 2, 0, z, rot);
}
