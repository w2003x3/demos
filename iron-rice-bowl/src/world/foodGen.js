// 便當食材的程序化造型(廚房各關卡共用):依食材規格(shape/color)產生單份造型,
// 用在便當盒內的配置、保溫餐檯的餐盤、烹調設備內(油鍋、煎台、炒鍋、滷鍋)與手上端的盤子。
// 經典三款(排骨/雞腿/素食)的便當內容仍用 food.js 的元件,與推車販售的成品完全相同。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../core/textures.js';
import { bentoPartGeos, makeBentoTray, makeBentoLid, foodMats, BENTO_SIZE } from './food.js';

const M = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

/** 加頂點色、套用矩陣、統一屬性(才能合併) */
function col(geo, color, m) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (m) g.applyMatrix4(m);
  const c = new THREE.Color(color), n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

function blob(R, rx, rz, h, n = 20) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, k = i === n ? 1 : 0.86 + R() * 0.22;
    const p = [Math.cos(a) * rx * k, Math.sin(a) * rz * k];
    if (!i) s.moveTo(...p); else if (i === n) s.closePath(); else s.lineTo(...p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.002, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
function lump(R, sx, sy, sz) {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 0.75 + R() * 0.4; p.setXYZ(i, p.getX(i) * sx * k, p.getY(i) * sy * k, p.getZ(i) * sz * k); }
  g.computeVertexNormals();
  return g;
}

/**
 * 一份食材的造型(以 y = 0 為底,大小約佔 w × d 的區域)。回傳 { matte:[], glossy:[] }(已上頂點色)。
 * spec:{ shape, color, color2, count }
 */
export function pieceGeos(spec, w, d, seed = 1) {
  const R = rng(seed), out = { matte: [], glossy: [] };
  const c1 = spec.color, c2 = spec.color2 || spec.color;
  const n = spec.count || 1;
  const grid = (cnt, f) => {      // 在 w × d 區域內排 cnt 個
    const cols = Math.ceil(Math.sqrt(cnt * w / d)), rows = Math.ceil(cnt / cols);
    for (let i = 0; i < cnt; i++) {
      const cx = ((i % cols) + 0.5) / cols - 0.5, cz = (Math.floor(i / cols) + 0.5) / rows - 0.5;
      f(cx * w * 0.9 + (R() - 0.5) * w * 0.08, cz * d * 0.9 + (R() - 0.5) * d * 0.08, i);
    }
  };
  switch (spec.shape) {
    case 'cutlet':   // 排骨:不規則扁塊 + 骨頭
      out.glossy.push(col(blob(R, w * 0.48, d * 0.44, 0.007), c1, M(0, 0.001, 0, 0.05, 0.2, -0.03)));
      out.glossy.push(col(new THREE.CylinderGeometry(0.0035, 0.004, Math.min(0.022, w * 0.4), 8), '#e9dcc0', M(w * 0.45, 0.006, d * 0.2, 0, 0.25, Math.PI / 2)));
      break;
    case 'fish':     // 魚排/魚條:長條扁塊,表面一道醬色或烤痕
      for (let i = 0; i < n; i++) {
        const z = (i - (n - 1) / 2) * d / n;
        out.matte.push(col(blob(R, w * 0.47, d * 0.42 / n, 0.008), c1, M(0, 0.001, z, 0, (R() - 0.5) * 0.2, 0)));
        out.glossy.push(col(blob(R, w * 0.3, d * 0.12 / n, 0.002), c2, M(0, 0.0095, z, 0, (R() - 0.5) * 0.3, 0)));
      }
      break;
    case 'shrimp': case 'smelt':   // 炸蝦排/柳葉魚:幾條帶麵衣的長條
      grid(n, (x, z) => out.matte.push(col(new THREE.CapsuleGeometry(spec.shape === 'shrimp' ? 0.009 : 0.006, w * 0.55, 4, 10), c1, M(x, 0.008, z, 0, (R() - 0.5) * 0.4, Math.PI / 2, 1, 0.75, 1))));
      if (spec.shape === 'smelt') grid(n, (x, z) => out.glossy.push(col(new THREE.ConeGeometry(0.005, 0.012, 8), c2, M(x + w * 0.33, 0.008, z, 0, 0, -Math.PI / 2))));
      break;
    case 'egg_whole':
      out.glossy.push(col(new THREE.SphereGeometry(1, 18, 12), c1, M(0, 0.012, 0, 0, 0.4, 0, 0.024, 0.016, 0.017)));
      break;
    case 'egg_half': {
      const shell = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      out.glossy.push(col(shell, c1, M(0, 0.013, 0, 0, 0.3, 0, 0.026, 0.012, 0.018)));
      const white = new THREE.CircleGeometry(1, 20); white.rotateX(-Math.PI / 2);
      out.glossy.push(col(white, '#efe2c4', M(0, 0.0132, 0, 0, 0.3, 0, 0.025, 1, 0.017)));
      out.matte.push(col(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#e9a62a', M(0.002, 0.0128, 0, 0, 0, 0, 0.012, 0.004, 0.009)));
      break;
    }
    case 'skin':     // 豆包:扁的捲狀
      grid(n, (x, z) => out.glossy.push(col(new THREE.CapsuleGeometry(0.011, w * 0.45, 4, 10), c1, M(x, 0.007, z, 0, (R() - 0.5) * 0.4, Math.PI / 2, 1, 0.6, 1))));
      break;
    case 'cube':     // 豆干、烤麩、馬鈴薯丁
      grid(n, (x, z) => out.glossy.push(col(new THREE.BoxGeometry(spec.size || 0.016, (spec.size || 0.016) * 0.7, spec.size || 0.016), c1, M(x, 0.006 + R() * 0.003, z, R() * 0.3, R() * 3, R() * 0.3))));
      break;
    case 'leaf':     // 葉菜(高麗菜、季節時蔬、酸菜)
      grid(n, (x, z, i) => out.matte.push(col(lump(R, w * 0.18, 0.005, d * 0.2), [c1, c2, c1][i % 3], M(x, 0.005 + R() * 0.004, z, R() * 0.5, R() * 6, R() * 0.5))));
      break;
    case 'floret':   // 青花菜
      grid(n, (x, z) => {
        out.matte.push(col(new THREE.CylinderGeometry(0.003, 0.004, 0.012, 6), '#9dc76a', M(x, 0.006, z)));
        for (let k = 0; k < 5; k++) out.matte.push(col(new THREE.SphereGeometry(0.0055, 7, 5), c1, M(x + (R() - 0.5) * 0.01, 0.013 + R() * 0.003, z + (R() - 0.5) * 0.01)));
      });
      break;
    case 'mushroom': // 香菇/杏鮑菇/猴頭菇:菇傘
      grid(n, (x, z) => {
        out.glossy.push(col(new THREE.SphereGeometry(spec.size || 0.012, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), c1, M(x, 0.004, z, 0, 0, 0, 1, 0.6, 1)));
        out.matte.push(col(new THREE.CircleGeometry(spec.size || 0.012, 12), c2, M(x, 0.0042, z, Math.PI / 2, 0, 0)));
      });
      break;
    case 'bead':     // 玉米粒、毛豆、黑豆
      for (let i = 0; i < (spec.count || 24); i++) out.glossy.push(col(new THREE.SphereGeometry(spec.size || 0.0035, 6, 5), i % 7 ? c1 : c2, M((R() - 0.5) * w * 0.85, 0.003 + R() * 0.003, (R() - 0.5) * d * 0.85, 0, 0, 0, 1, 0.85, 1.15)));
      break;
    case 'disc':     // 魚板、香腸片:圓片(外圈 color2)
      grid(n, (x, z) => {
        out.glossy.push(col(new THREE.CylinderGeometry(spec.size || 0.011, spec.size || 0.011, 0.004, 16), c2, M(x, 0.004, z, 0.25, 0, 0.1)));
        out.matte.push(col(new THREE.CylinderGeometry((spec.size || 0.011) * 0.75, (spec.size || 0.011) * 0.75, 0.0045, 16), c1, M(x, 0.0042, z, 0.25, 0, 0.1)));
      });
      break;
    case 'halfdisc': // 黃蘿蔔、蘿蔔漬
      for (let i = 0; i < n; i++) out.glossy.push(col(new THREE.CylinderGeometry(0.012, 0.012, 0.0028, 18, 1, false, 0, Math.PI), c1, M((i - (n - 1) / 2) * 0.008, 0.004 + i * 0.0012, 0, 0.35, 0.4, 0)));
      break;
    case 'roll':     // 山藥捲
      grid(n, (x, z) => out.matte.push(col(new THREE.CylinderGeometry(0.009, 0.009, w * 0.5, 12), c1, M(x, 0.009, z, 0, (R() - 0.5) * 0.3, Math.PI / 2))));
      break;
    case 'block':    // 玉子燒(層次)
      grid(n, (x, z) => {
        for (let k = 0; k < 3; k++) out.matte.push(col(new THREE.BoxGeometry(0.022, 0.005, 0.016), k % 2 ? c2 : c1, M(x, 0.003 + k * 0.005, z, 0, 0.2, 0)));
      });
      break;
    case 'ball':     // 魚丸、素丸
      grid(n, (x, z) => out.glossy.push(col(new THREE.SphereGeometry(spec.size || 0.009, 12, 9), c1, M(x, spec.size || 0.009, z))));
      break;
    case 'strand':   // 金針
      for (let i = 0; i < (spec.count || 9); i++) out.glossy.push(col(new THREE.CapsuleGeometry(0.0022, w * 0.5, 3, 6), c1, M((R() - 0.5) * w * 0.5, 0.004 + R() * 0.004, (R() - 0.5) * d * 0.6, 0, R() * 3, Math.PI / 2)));
      break;
    case 'wedge':    // 南瓜
      grid(n, (x, z) => {
        out.matte.push(col(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 10, 1, false, 0, Math.PI / 2), c1, M(x, 0.006, z, 0, R() * 6, 0)));
      });
      break;
    case 'piece':    // 洛神蜜餞
      grid(n, (x, z) => out.glossy.push(col(lump(R, 0.008, 0.004, 0.006), c1, M(x, 0.004, z, 0, R() * 6, 0))));
      break;
    case 'patty':    // 素排、蕈菇排、黃金豆包
      out.matte.push(col(blob(R, w * 0.46, d * 0.4, 0.008), c1, M(0, 0.001, 0, 0.04, -0.2, 0.03)));
      break;
    default:
      grid(n, (x, z) => out.matte.push(col(lump(R, 0.01, 0.006, 0.01), c1, M(x, 0.006, z))));
  }
  return out;
}

/** 白飯鋪底(可指定米色與雜糧斑點:糙米紅藜、紫米) */
function riceGeos(spec) {
  const { L, W, RICE_Y } = BENTO_SIZE, R = rng(5);
  const g = new THREE.PlaneGeometry(L - 0.008, W - 0.008, 30, 22);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const edge = Math.min((L / 2 - 0.004 - Math.abs(x)) / 0.012, (W / 2 - 0.004 - Math.abs(z)) / 0.012, 1);
    pos.setY(i, RICE_Y - 0.004 + 0.004 * Math.max(0, edge) + (R() - 0.5) * 0.0016);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 2.2);
  const out = { matte: [col(g, spec.color || '#f6f2e8')], glossy: [] };
  if (spec.color2) {   // 雜糧顆粒
    const k = new THREE.SphereGeometry(0.0018, 5, 4);
    for (let i = 0; i < 90; i++) out.matte.push(col(k, spec.color2, M((R() - 0.5) * (L - 0.02), RICE_Y + 0.0005, (R() - 0.5) * (W - 0.02), 0, 0, 0, 1.3, 0.7, 1)));
  }
  return out;
}

/**
 * 便當盒內配置:主菜在右半(1~2 份上下排),配菜在左半(2 欄格狀)。
 * 回傳 { foodKey: { x, z, w, d } }(盒內座標,y 為飯面)
 */
export function bentoLayout(bento, foods) {
  const { L, W } = BENTO_SIZE;
  const parts = bento.parts.filter((k) => foods[k].shape !== 'rice');
  const mains = parts.filter((k) => foods[k].main), sides = parts.filter((k) => !foods[k].main);
  const out = {};
  const mx0 = 0.004, mx1 = L / 2 - 0.006, mz0 = -W / 2 + 0.006, mz1 = W / 2 - 0.006;
  mains.forEach((k, i) => {
    const h = (mz1 - mz0) / mains.length;
    out[k] = { x: (mx0 + mx1) / 2, z: mz0 + h * (i + 0.5), w: mx1 - mx0, d: h * 0.95 };
  });
  const sx0 = -L / 2 + 0.006, sx1 = 0;
  const cols = sides.length > 2 ? 2 : 1, rows = Math.max(1, Math.ceil(sides.length / cols));
  sides.forEach((k, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const w = (sx1 - sx0) / cols, h = (mz1 - mz0) / rows;
    out[k] = { x: sx0 + w * (c + 0.5), z: mz0 + h * (r + 0.5), w: w * 0.95, d: h * 0.95 };
  });
  return out;
}

/** 單一食材放進便當盒的網格(slot 為空時:放錯的食材疊在中央) */
export function makeFoodPart(key, foods, bento) {
  const spec = foods[key], S = foodMats();
  let geos;
  if (spec.part && bento.classic) geos = bentoPartGeos(spec.part, bento.classic);
  else if (spec.shape === 'rice') geos = riceGeos(spec);
  else {
    const slot = bentoLayout(bento, foods)[key] || { x: 0, z: 0, w: 0.06, d: 0.045 };
    geos = pieceGeos(spec, slot.w, slot.d, key.length * 13 + 7);
    const m = M(slot.x, BENTO_SIZE.RICE_Y, slot.z);
    geos = { matte: geos.matte.map((g) => g.applyMatrix4(m)), glossy: geos.glossy.map((g) => g.applyMatrix4(m)) };
  }
  const g = new THREE.Group();
  g.name = `part_${key}`;
  if (geos.matte.length) g.add(new THREE.Mesh(mergeGeometries(geos.matte), S.matte));
  if (geos.glossy.length) g.add(new THREE.Mesh(mergeGeometries(geos.glossy), S.glossy));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** 完整成品(關卡便當):盒 + 全部食材 + 蓋子與貼紙 */
export function makeLevelBento(bento, foods) {
  const g = new THREE.Group();
  g.add(makeBentoTray());
  for (const k of bento.parts) g.add(makeFoodPart(k, foods, bento));
  g.add(makeBentoLid(bento.sticker));
  return g;
}

/** 大份量造型(保溫餐盤、鍋具內):在 w × d 區域疊放 layers 層 */
export function bulkFood(spec, w, d, layers = 3, seed = 3) {
  const S = foodMats(), g = new THREE.Group();
  if (spec.shape === 'rice') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, 0.02, d * 0.95), new THREE.MeshStandardMaterial({ color: spec.color || '#f6f2e8', roughness: 0.9 }));
    m.position.y = 0.01;
    g.add(m);
    return g;
  }
  const cols = 3, rows = 2;
  for (let L = 0; L < layers; L++) for (let i = 0; i < cols * rows; i++) {
    const cw = w / cols, cd = d / rows;
    const p = pieceGeos({ ...spec, count: Math.max(1, Math.round((spec.count || 1) / 2)) }, cw * 1.25, cd * 1.25, seed + L * 31 + i * 7);
    const sub = new THREE.Group();
    if (p.matte.length) sub.add(new THREE.Mesh(mergeGeometries(p.matte), S.matte));
    if (p.glossy.length) sub.add(new THREE.Mesh(mergeGeometries(p.glossy), S.glossy));
    sub.position.set(-w / 2 + cw * (i % cols + 0.5), L * 0.012, -d / 2 + cd * (Math.floor(i / cols) + 0.5));
    sub.rotation.y = (i * 1.7 + L) % 6;
    sub.scale.setScalar(1.25);
    g.add(sub);
  }
  return g;
}

/** 關卡便當的縮圖(製作單、整備畫面用):{ bentoId: dataURL } */
export async function renderBentoThumbs(level, size = 220) {
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
  const { makeBento } = await import('./food.js');
  const out = {};
  let r;
  try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch { return out; }
  r.setSize(size, size);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.position.set(-0.3, 1, 0.5);
  scene.add(sun, new THREE.HemisphereLight('#ffffff', '#666', 0.6));
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 5);
  for (const b of Object.values(level.bentos)) {
    const o = b.classic ? makeBento(b.classic) : makeLevelBento(b, level.foods);
    scene.add(o);
    const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3());
    const rad = box.getSize(new THREE.Vector3()).length() / 2;
    cam.position.copy(c).addScaledVector(new THREE.Vector3(-0.55, 1.15, 0.75).normalize(), rad / Math.sin(THREE.MathUtils.degToRad(15)) * 0.98);
    cam.lookAt(c);
    r.render(scene, cam);
    out[b.id] = r.domElement.toDataURL('image/png');
    scene.remove(o);
  }
  pm.dispose();
  r.dispose();
  r.forceContextLoss();
  return out;
}
