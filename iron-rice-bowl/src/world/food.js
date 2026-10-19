// 推車上的商品模型(three.js 程序化建模):臺鐵便當(黑色餐盒 + 透明上蓋,看得到菜色)與飲料(PET 瓶綠茶、礦泉水、罐裝咖啡)。
// 尺寸以公尺計;原點在底面中心,便當長邊沿 X(0.18 × 0.13 m)。
// 每個便當只有 5 個網格(餐盒、霧面食物、亮面食物、上蓋、貼紙):食物以頂點色合併,推車上擺滿也不會太多 draw call。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ITEMS, ITEM_LIST } from '../config/items.js';
import { canvasTexture, rng } from '../core/textures.js';

const L = 0.18, W = 0.13, TRAY_H = 0.034, RICE_Y = 0.025;
export const BENTO_SIZE = { L, W, TRAY_H, RICE_Y };
const font = '"Noto Sans TC","Microsoft JhengHei",sans-serif';

let shared = null;
export function foodMats() { return mats(); }
function mats() {
  if (shared) return shared;
  const R = rng(17);
  // 食物細節:米粒狀的明暗斑點(乘上頂點色;在炸物上看起來像麵衣顆粒)
  const detail = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = 200 + R() * 55;
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.beginPath();
      c.ellipse(R() * w, R() * h, 2.6 + R() * 1.4, 1.2 + R() * 0.6, R() * Math.PI, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 1400; i++) {
      c.fillStyle = `rgba(0,0,0,${0.05 + R() * 0.12})`;
      c.fillRect(R() * w, R() * h, 1.5, 1.5);
    }
  }, { repeat: [1, 1] });
  shared = {
    tray: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.38, metalness: 0.05 }),
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.82 }),
    glossy: new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.32 }),
    lid: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 2.2 }),
    pet: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 2 }),
    alu: new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.28, metalness: 1 }),
    labels: {},
  };
  return shared;
}

/** 依頂點加上單一顏色(頂點色),並套用矩陣;統一成非索引幾何以便合併 */
function part(geo, color, m) {
  const g = (geo.index ? geo.toNonIndexed() : geo);
  if (m) g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const M = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

function roundRect(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** 不規則的扁平塊(炸排骨、素排):橢圓輪廓加雜訊後擠出 */
function slab(R, rx, rz, thick) {
  const s = new THREE.Shape();
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const k = i === N ? 1 : 0.86 + R() * 0.2;
    const p = [Math.cos(a) * rx * k, Math.sin(a) * rz * k];
    if (i === 0) s.moveTo(...p); else if (i === N) s.closePath(); else s.lineTo(...p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0025, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  // 表面起伏
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + Math.sin(pos.getX(i) * 140) * 0.0007 + Math.cos(pos.getZ(i) * 170) * 0.0006);
  g.computeVertexNormals();
  return g;
}

/** 小塊不規則體(高麗菜葉、酸菜) */
function lump(R, sx, sy, sz) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.75 + R() * 0.4;
    pos.setXYZ(i, pos.getX(i) * sx * k, pos.getY(i) * sy * k, pos.getZ(i) * sz * k);
  }
  g.computeVertexNormals();
  return g;
}

function riceBed(R) {
  const g = new THREE.PlaneGeometry(L - 0.008, W - 0.008, 30, 22);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const edge = Math.min((L / 2 - 0.004 - Math.abs(x)) / 0.012, (W / 2 - 0.004 - Math.abs(z)) / 0.012, 1);
    pos.setY(i, RICE_Y - 0.004 + 0.004 * Math.max(0, edge) + (R() - 0.5) * 0.0016);
  }
  g.computeVertexNormals();
  // 貼圖 UV 放大:米粒約 6 mm
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 2.2);
  return g;
}

function lidLabel(it) {
  const S = mats();
  if (!S.labels[it.id]) {
    const col = it.color || { pork: '#b23a2a', chicken: '#c98a1c', veg: '#3f7d3a' }[it.id] || '#555';
    const tex = canvasTexture(256, 150, (c, w, h) => {
      c.fillStyle = '#f7f1e2'; c.fillRect(0, 0, w, h);
      c.fillStyle = col; c.fillRect(0, 0, w, 30); c.fillRect(0, h - 18, w, 18);
      c.fillStyle = '#fff'; c.font = `bold 22px ${font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('臺鐵便當', w / 2, 16);
      c.fillStyle = '#1b1b1b'; c.font = `bold 50px ${font}`;
      const label = it.label || it.name.replace('便當', '');
      c.font = `bold ${label.length > 3 ? Math.floor(150 / label.length) + 6 : 50}px ${font}`;
      c.fillText(label, w / 2, h / 2 + 6);
      c.font = `bold 20px ${font}`; c.fillStyle = col;
      c.fillText(`NT$ ${it.price}`, w / 2, h - 34);
    }, { wrap: false });
    S.labels[it.id] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 });
  }
  return S.labels[it.id];
}

function halfEgg(matte, glossy, x, z, ry) {
  const base = M(x, RICE_Y + 0.001, z, 0, ry, 0);
  const shell = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  glossy.push(part(shell, '#8a5524', base.clone().multiply(M(0, 0.012, 0, 0, 0, 0, 0.026, 0.012, 0.018))));
  const white = new THREE.CircleGeometry(1, 20);
  white.rotateX(-Math.PI / 2);
  glossy.push(part(white, '#efe2c4', base.clone().multiply(M(0, 0.0122, 0, 0, 0, 0, 0.025, 1, 0.017))));
  const yolk = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  matte.push(part(yolk, '#e9a62a', base.clone().multiply(M(0.002, 0.0118, 0, 0, 0, 0, 0.012, 0.004, 0.009))));
}

/**
 * 便當的組成元件(廚房關卡逐項加入;推車上的成品把全部元件合併)。
 * 鍵:rice 白飯、pork 滷排骨、chicken 炸雞腿、vegpatty 煎素排、egg 滷蛋、tofu 滷豆干、
 *     cabbage 炒高麗菜、pickle 酸菜、radish 黃蘿蔔、corn 玉米粒
 * 每個元件在盒中的位置固定(主菜在右半、配菜在左半);recipe 決定滷蛋是半顆(排骨)或整顆(雞腿)。
 */
export const BENTO_PARTS = ['rice', 'pork', 'chicken', 'vegpatty', 'egg', 'tofu', 'cabbage', 'pickle', 'radish', 'corn'];
export const RECIPES = {
  pork: ['rice', 'pork', 'egg', 'tofu', 'cabbage', 'pickle', 'radish'],
  chicken: ['rice', 'chicken', 'egg', 'cabbage', 'pickle', 'radish'],
  veg: ['rice', 'vegpatty', 'tofu', 'corn', 'cabbage', 'radish'],
};
const SEED = { rice: 1, pork: 3, chicken: 5, vegpatty: 9, egg: 11, tofu: 13, cabbage: 17, pickle: 19, radish: 23, corn: 29 };

export function bentoPartGeos(key, recipe = 'pork') {
  const R = rng(SEED[key] || 7);
  const matte = [], glossy = [];
  if (key === 'rice') matte.push(part(riceBed(R), '#f6f2e8'));
  else if (key === 'pork') {
    // 滷排骨:醬色、表面油亮,帶一小段骨頭
    glossy.push(part(slab(R, 0.052, 0.034, 0.007), '#6e3416', M(0.035, RICE_Y + 0.001, 0.004, 0.06, 0.25, -0.04)));
    glossy.push(part(new THREE.CylinderGeometry(0.0035, 0.004, 0.022, 8), '#e9dcc0', M(0.083, RICE_Y + 0.006, 0.02, 0, 0.25, Math.PI / 2)));
  } else if (key === 'chicken') {
    // 炸雞腿:金黃酥脆的麵衣(霧面,貼圖斑點像麵衣顆粒)
    const prof = [[0, 0], [0.006, 0.002], [0.0065, 0.012], [0.009, 0.026], [0.017, 0.042], [0.022, 0.058], [0.021, 0.072], [0.014, 0.084], [0.004, 0.09], [0, 0.091]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const leg = new THREE.LatheGeometry(prof, 20);
    const pos = leg.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * 0.78);
    leg.computeVertexNormals();
    matte.push(part(leg, '#b8762e', M(0.078, RICE_Y + 0.012, 0.004, 0, 0.2, Math.PI / 2)));
    glossy.push(part(new THREE.SphereGeometry(0.0055, 10, 8), '#ecdfc4', M(0.081, RICE_Y + 0.012, 0.0055, 0, 0, 0, 1.2, 1, 1)));
  } else if (key === 'vegpatty') {
    // 煎素排:兩面煎上色
    matte.push(part(slab(R, 0.048, 0.032, 0.008), '#c18a43', M(0.035, RICE_Y + 0.001, 0.004, 0.05, -0.2, 0.03)));
  } else if (key === 'egg') {
    if (recipe === 'chicken') glossy.push(part(new THREE.SphereGeometry(1, 18, 12), '#7e4b1f', M(-0.062, RICE_Y + 0.012, -0.006, 0, 0.4, 0, 0.024, 0.016, 0.017)));
    else halfEgg(matte, glossy, -0.06, -0.008, 0.3);
  } else if (key === 'tofu') {
    for (let i = 0; i < 2; i++) glossy.push(part(new THREE.BoxGeometry(0.022, 0.008, 0.02), '#6e4220', M(-0.032 + i * 0.012, RICE_Y + 0.005 + i * 0.003, -0.035 + i * 0.006, 0.08, R() * 0.6, 0.1)));
  } else if (key === 'cabbage') {
    for (let i = 0; i < 6; i++) {
      matte.push(part(lump(R, 0.016, 0.005, 0.012), ['#a9cf72', '#c6dd92', '#8fbf5c'][i % 3],
        M(-0.058 + R() * 0.03, RICE_Y + 0.004 + R() * 0.004, 0.035 + R() * 0.018, R() * 0.6, R() * 6, R() * 0.6)));
    }
  } else if (key === 'pickle') {
    for (let i = 0; i < 7; i++) {
      glossy.push(part(lump(R, 0.008, 0.004, 0.006), ['#6d6b25', '#5c5a1e', '#7a7630'][i % 3],
        M(-0.02 + R() * 0.024, RICE_Y + 0.004, 0.042 + R() * 0.014, 0, R() * 6, 0)));
    }
  } else if (key === 'radish') {
    for (let i = 0; i < 3; i++) {
      const g = new THREE.CylinderGeometry(0.012, 0.012, 0.0028, 18, 1, false, 0, Math.PI);
      glossy.push(part(g, '#f2c42a', M(-0.07 + i * 0.008, RICE_Y + 0.004 + i * 0.0012, -0.04, 0.35, 0.4, 0)));
    }
  } else if (key === 'corn') {
    const k = new THREE.SphereGeometry(0.0032, 6, 4);
    for (let i = 0; i < 26; i++) glossy.push(part(k, '#f2cd38', M(-0.064 + R() * 0.03, RICE_Y + 0.003 + R() * 0.002, -0.032 + R() * 0.02, 0, 0, 0, 1, 0.8, 1.15)));
  }
  return { matte, glossy };
}

/** 單一元件的網格(廚房組裝時逐項顯示) */
export function makeBentoPart(key, recipe) {
  const S = mats(), { matte, glossy } = bentoPartGeos(key, recipe);
  const g = new THREE.Group();
  g.name = `part_${key}`;
  if (matte.length) g.add(new THREE.Mesh(mergeGeometries(matte), S.matte));
  if (glossy.length) g.add(new THREE.Mesh(mergeGeometries(glossy), S.glossy));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

let trayGeo = null;
/** 黑色餐盒(圓角外框 + 底板 + 上緣) */
export function makeBentoTray() {
  if (!trayGeo) {
    const outer = roundRect(L, W, 0.012);
    outer.holes.push(roundRect(L - 0.005, W - 0.005, 0.01));
    const wall = new THREE.ExtrudeGeometry(outer, { depth: TRAY_H, bevelEnabled: false, curveSegments: 4 });
    wall.rotateX(-Math.PI / 2);
    const floor = new THREE.ShapeGeometry(roundRect(L - 0.004, W - 0.004, 0.01), 4);
    floor.rotateX(-Math.PI / 2);
    floor.translate(0, 0.002, 0);
    const rimShape = roundRect(L + 0.006, W + 0.006, 0.014);
    rimShape.holes.push(roundRect(L - 0.004, W - 0.004, 0.01));
    const rim = new THREE.ExtrudeGeometry(rimShape, { depth: 0.0016, bevelEnabled: false, curveSegments: 4 });
    rim.rotateX(-Math.PI / 2);
    rim.translate(0, TRAY_H - 0.0016, 0);
    trayGeo = mergeGeometries([wall, floor.toNonIndexed(), rim].map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => { x.deleteAttribute('uv'); return x; }));
  }
  const m = new THREE.Mesh(trayGeo, mats().tray);
  m.name = 'tray';
  m.castShadow = m.receiveShadow = true;
  return m;
}

let lidGeo = null;
/** 透明上蓋(PET,略大於餐盒、高 1.8 cm);recipe 給定時加上蓋子貼紙 */
export function makeBentoLid(recipe = null) {
  const S = mats();
  lidGeo ??= new RoundedBoxGeometry(L + 0.004, 0.018, W + 0.004, 3, 0.006);
  const g = new THREE.Group();
  g.name = 'lid';
  const lid = new THREE.Mesh(lidGeo, S.lid);
  lid.position.y = TRAY_H + 0.009 - 0.0016;
  lid.renderOrder = 2;
  g.add(lid);
  if (recipe) {
    // recipe:推車品項 id,或關卡便當的貼紙資料 { id, name, label, price, color }
    const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.036), lidLabel(typeof recipe === 'string' ? ITEMS[recipe] : recipe));
    sticker.rotation.set(-Math.PI / 2, -Math.PI / 2, 0, 'YXZ');   // 平放、文字上方朝 +X:站在推車把手側(-X)看是正的
    sticker.position.set(-0.058, TRAY_H + 0.0166, 0.032);
    sticker.name = 'sticker';
    g.add(sticker);
  }
  return g;
}

/** 臺鐵便當成品:黑色餐盒、白飯、主菜與配菜、透明上蓋、上蓋貼紙(推車與廚房成品共用) */
export function makeBento(id) {
  const it = ITEMS[id], S = mats();
  const g = new THREE.Group();
  g.name = it.model;
  g.add(makeBentoTray());
  const matte = [], glossy = [];
  for (const k of RECIPES[id]) {
    const p = bentoPartGeos(k, id);
    matte.push(...p.matte);
    glossy.push(...p.glossy);
  }
  g.add(new THREE.Mesh(mergeGeometries(matte), S.matte), new THREE.Mesh(mergeGeometries(glossy), S.glossy));
  g.add(makeBentoLid(id));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o.material !== S.lid; o.receiveShadow = true; } });
  return g;
}

function bottleLabel(kind) {
  const S = mats();
  if (S.labels[kind]) return S.labels[kind];
  const tex = canvasTexture(512, 128, (c, w, h) => {
    if (kind === 'tea') {
      const gr = c.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#2f7d3a'); gr.addColorStop(1, '#1d5a28');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e8d98a'; c.fillRect(0, 10, w, 4); c.fillRect(0, h - 14, w, 4);
      for (const x of [60, 316]) {
        c.fillStyle = '#fff'; c.font = `bold 54px ${font}`; c.textBaseline = 'middle';
        c.fillText('綠茶', x, h / 2 - 4);
        c.font = `16px ${font}`; c.fillText('無糖 · 600ml', x + 4, h - 26);
        c.fillStyle = '#9ccf5a';
        c.beginPath(); c.ellipse(x + 150, h / 2, 26, 12, -0.6, 0, Math.PI * 2); c.fill();
      }
    } else if (kind === 'water') {
      c.fillStyle = '#e9f4fb'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1e5fae';
      c.beginPath(); c.moveTo(0, h); c.lineTo(80, 60); c.lineTo(150, 95); c.lineTo(230, 40); c.lineTo(330, 100); c.lineTo(420, 55); c.lineTo(w, 90); c.lineTo(w, h); c.fill();
      c.fillStyle = '#1e5fae'; c.font = `bold 40px ${font}`; c.textBaseline = 'top';
      c.fillText('礦泉水', 30, 10); c.fillText('礦泉水', 286, 10);
      c.fillStyle = '#fff'; c.font = '16px sans-serif'; c.fillText('MINERAL WATER 600ml', 160, h - 24);
    } else {
      const gr = c.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#4a2a18'); gr.addColorStop(0.5, '#7a4a2a'); gr.addColorStop(1, '#4a2a18');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = '#efe3c8'; c.fillRect(0, h * 0.62, w, h * 0.16);
      for (const x of [40, 296]) {
        c.fillStyle = '#f3e7cc'; c.font = `bold 44px ${font}`; c.textBaseline = 'middle';
        c.fillText('拿鐵咖啡', x, h * 0.34);
        c.fillStyle = '#4a2a18'; c.font = 'bold 15px sans-serif'; c.fillText('CAFÉ LATTE 240ml', x + 8, h * 0.7);
      }
    }
  }, { repeat: [1, 1] });
  S.labels[kind] = new THREE.MeshStandardMaterial({ map: tex, roughness: kind === 'coffee' ? 0.3 : 0.55, metalness: kind === 'coffee' ? 0.55 : 0 });
  return S.labels[kind];
}

/** 飲料:600 ml PET 瓶(綠茶、礦泉水)、240 ml 罐裝咖啡 */
export function makeDrink(id) {
  const it = ITEMS[id], S = mats();
  const g = new THREE.Group();
  g.name = it.model;
  if (id === 'coffee') {
    const rim = [[0, 0], [0.021, 0], [0.0265, 0.007], [0.0265, 0.094], [0.0232, 0.102], [0.0236, 0.1045], [0.021, 0.105], [0.02, 0.1035], [0, 0.1035]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    g.add(new THREE.Mesh(new THREE.LatheGeometry(rim, 28), S.alu));
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0267, 0.0267, 0.084, 28, 1, true), bottleLabel('coffee'));
    body.position.y = 0.05;
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.0012, 0.009), S.alu);
    tab.position.set(0.004, 0.1043, 0);
    g.add(body, tab);
  } else {
    const prof = [[0, 0.002], [0.024, 0], [0.031, 0.005], [0.0325, 0.018], [0.0315, 0.03], [0.0325, 0.042], [0.0325, 0.145], [0.03, 0.162], [0.021, 0.186], [0.0135, 0.203], [0.0135, 0.214]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), S.pet);
    shell.renderOrder = 2;
    const fill = id === 'tea' ? 0.17 : 0.18;
    const liquidProf = prof.filter(([, y]) => true).map((v) => new THREE.Vector2(v.x * 0.93, Math.min(v.y, fill)));
    liquidProf.push(new THREE.Vector2(0, fill));
    const liquid = new THREE.Mesh(new THREE.LatheGeometry(liquidProf, 24), new THREE.MeshStandardMaterial({
      color: id === 'tea' ? '#c7b24a' : '#d6ebf5', roughness: 0.1, transparent: true, opacity: id === 'tea' ? 0.82 : 0.22, depthWrite: false,
    }));
    liquid.renderOrder = 1;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0329, 0.0329, 0.07, 28, 1, true), bottleLabel(id));
    label.position.y = 0.09;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0152, 0.0152, 0.019, 24), new THREE.MeshStandardMaterial({ color: id === 'tea' ? '#2e7d32' : '#1e5fae', roughness: 0.45 }));
    cap.position.y = 0.2225;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0158, 0.0158, 0.003, 24), cap.material);
    ring.position.y = 0.2105;
    g.add(liquid, label, cap, ring, shell);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = !o.material.transparent; o.receiveShadow = true; } });
  return g;
}

/** 全部商品的模板 { id: Group } */
export function makeFoodTemplates() {
  const out = {};
  for (const it of ITEM_LIST) out[it.id] = it.kind === 'bento' ? makeBento(it.id) : makeDrink(it.id);
  return out;
}

/** 商品縮圖(等待畫面瀏覽菜色用):{ id: dataURL } */
export function renderFoodThumbs(size = 220) {
  const out = {};
  let r;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch { return out; }
  r.setSize(size, size);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.position.set(-0.3, 1, 0.5);
  scene.add(sun, new THREE.HemisphereLight('#ffffff', '#666', 0.6));
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 5);
  for (const [id, tpl] of Object.entries(makeFoodTemplates())) {
    const o = tpl;
    scene.add(o);
    const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3());
    const rad = box.getSize(new THREE.Vector3()).length() / 2;
    const bento = ITEMS[id].kind === 'bento';
    const dir = bento ? new THREE.Vector3(-0.55, 1.15, 0.75) : new THREE.Vector3(-0.35, 0.35, 1);
    cam.position.copy(c).addScaledVector(dir.normalize(), rad / Math.sin(THREE.MathUtils.degToRad(15)) * 0.98);
    cam.lookAt(c);
    r.render(scene, cam);
    out[id] = r.domElement.toDataURL('image/png');
    scene.remove(o);
  }
  pm.dispose();
  r.dispose();
  r.forceContextLoss();
  return out;
}
