import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { enhanceMaterials } from '../world/materials.js';
import { RailAssets } from './railAssets.js';
import { sitPose, pushPose, uniformTint } from '../world/poses.js';

// 共用鐵道模型庫(rail-assets,由 npm run sync:train-bento 同步):寫實人物、街屋、樹、電車線桿、月台、PBR 材質、HDRI 天空
const RAIL_SLOTS = [
  'people/standing', 'building/street', 'building/tower', 'vegetation/tree', 'vegetation/shrub',
  'trackside/mast', 'trackside/electric-pole', 'trackside/barrier', 'trackside/utility-box',
  'street/lamp', 'street/aircon', 'platform/open', 'platform/bench', 'platform/trash-can',
];
const RAIL_TEXTURES = { grass: 1, ballast: 1, concrete: 1, metal: 1, asphalt: 1 };
// rail-assets 人物中的東亞面孔(Rocketbox Male_Adult_09/10、Business_Male_02、Female_Adult_03、Business_Female_04)
const EAST_ASIAN = new Set(['male-adult-09', 'male-adult-10', 'male-business-02', 'female-adult-03', 'female-business-04']);
const ASIAN_RATIO = 0.8;   // 乘客約八成是台灣面孔

/** 依「八成東亞面孔」挑一位人物,回傳 people 陣列的索引(沒有東亞面孔變體時平均挑) */
export function pickPerson(people, R = Math.random) {
  const asian = [], other = [];
  people.forEach((p, i) => (p.asian ? asian : other).push(i));
  const pool = asian.length && (!other.length || R() < ASIAN_RATIO) ? asian : other;
  return pool[(R() * pool.length) | 0];
}

const COMMON = {
  passengerSit: 'passenger_sit.glb',
  passengerStand: 'passenger_stand.glb',
  attendant: 'attendant.glb',
  cart: 'food_cart.glb',
  food: 'food_items.glb',
  pos: 'pos_terminal.glb',
  suitcase: 'suitcase.glb',
  platform: 'platform_island.glb',
};

/**
 * 載入共用模型 + 指定車種模型;回傳 { key: THREE.Object3D }。
 * 另附 out.rail(RailAssets)、out.railTex(PBR 材質)、out.people(坐姿/站姿寫實人物)、out.crew(餐服員/列車長);
 * rail-assets 載入失敗時這些為 null,場景改用原本的簡易造型。
 */
export async function loadAssets(base, trainType, onProgress) {
  const files = { ...COMMON };
  for (const [k, f] of Object.entries(trainType.models)) files[k] = f;
  const loader = new GLTFLoader();
  const entries = Object.entries(files);
  let done = 0, railP = 0;
  const report = () => onProgress?.((done / entries.length) * 0.35 + railP * 0.65);
  const out = {};
  const rail = loadRail(`${base}/rail`, (p) => { railP = p; report(); });
  await Promise.all(entries.map(async ([key, file]) => {
    const gltf = await loader.loadAsync(`${base}/${file}`);
    enhanceMaterials(gltf.scene);
    out[key] = gltf.scene;
    done++;
    report();
  }));
  Object.defineProperties(out, Object.fromEntries(Object.entries(await rail).map(([k, v]) => [k, { value: v, enumerable: false }])));
  return out;
}

async function loadRail(base, onProgress) {
  try {
    const ra = await new RailAssets(base).init();
    await ra.loadSlots(RAIL_SLOTS.filter((s) => ra.has(s)), (p) => onProgress(p * 0.85));
    const railTex = {};
    for (const id of Object.keys(RAIL_TEXTURES)) railTex[id] = await ra.material(id);
    onProgress(0.95);
    // 寫實人物:每個變體一份站姿、一份坐姿(頂點彎折,見 sitPose.js)
    const people = ra.variants('people/standing').filter((v) => ra.loaded.has(v.id)).map((v) => {
      const stand = person(ra, v.id);
      return { id: v.id, female: v.id.startsWith('female'), asian: EAST_ASIAN.has(v.id), stand, sit: sitPose(stand) };
    });
    onProgress(1);
    return { rail: ra, railTex, people: people.length ? people : null, crew: makeCrew(ra) };
  } catch (err) {
    console.warn('rail-assets 載入失敗,改用簡易場景', err);
    onProgress(1);
    return { rail: null, railTex: null, people: null, crew: null };
  }
}

/**
 * 寫實服勤人員:餐服員(推車姿勢)、列車長(站姿),衣服染成藏青色制服。
 * 輸出已轉成面向 +X(與 Blender 人偶相同),可直接取代 assets.attendant。
 */
function makeCrew(ra) {
  const mk = (ids, color, push) => {
    let body = null;
    for (const id of ids.filter((x) => ra.loaded.has(x))) {
      const o = person(ra, id);
      o.traverse((m) => { if (m.isMesh && /_body$/.test(m.material.name)) m.material = uniformTint(m.material, color); });
      body = push ? pushPose(o) : o;   // 手貼著身體的模型無法擺推車姿勢,換下一位(順序:深色/粉色衣服優先,咖啡色、米色衣服會被當成膚色而染不到制服色)
      if (body) break;
    }
    if (!body) return null;
    body.rotation.y = -Math.PI / 2;
    const g = new THREE.Group();
    g.add(body);
    return g;
  };
  const attendant = mk(['female-business-04', 'female-adult-03', 'female-adult-09', 'female-adult-01', 'female-adult-04', 'male-adult-03'], '#1f2d52', true);
  const conductor = mk(['male-business-02', 'male-adult-10', 'male-adult-08', 'male-adult-03'], '#141c30', false);
  return attendant && conductor ? { attendant, conductor } : null;
}

/**
 * rail-assets 人物(實測腳尖朝 +Z,與模型庫「前進 -Z」的慣例相反):轉 180° 統一成面向 -Z,
 * 之後的姿勢(poses.js)與擺放都以「面向 -Z」計算。
 */
function person(ra, id) {
  const body = ra.instance('people/standing', { id });
  fixPeople(body);
  body.rotation.y = Math.PI;
  const g = new THREE.Group();
  g.add(body);
  return g;
}

/** 人物材質:頭髮/睫毛等 opacity 貼圖用 alpha 測試(不排序也不閃爍),皮膚稍微霧面。 */
function fixPeople(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (/opacity/i.test(m.name)) { m.transparent = false; m.alphaTest = 0.5; m.depthWrite = true; m.side = THREE.DoubleSide; }
    m.roughness = Math.max(m.roughness ?? 1, 0.6);
    o.castShadow = true;
    o.receiveShadow = true;
  });
}

/**
 * 把模型拆成每個材質一個 InstancedMesh(座椅、乘客數量多,用 instancing 省 draw call)。
 * colorSlots:材質名稱清單,這些材質改成白色並啟用每個實例的顏色。
 */
export function makeInstanced(src, count, { colorSlots = [], shadow = true } = {}) {
  src.updateMatrixWorld(true);
  const parts = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    let m = o.material;
    const colored = colorSlots.includes(m.name);
    if (colored) {
      m = m.clone();
      m.color.set(0xffffff);
    }
    const im = new THREE.InstancedMesh(g, m, count);
    im.castShadow = shadow && o.castShadow;
    im.receiveShadow = true;
    im.frustumCulled = false;
    im.userData.slot = m.name;
    im.userData.colored = colored;
    parts.push(im);
  });
  return parts;
}

/** 深複製模型並複製指定材質(讓單一人物可換衣服顏色)。 */
export function cloneWithColors(src, colors) {
  const o = src.clone(true);
  o.traverse((m) => {
    if (m.isMesh && colors[m.material.name]) {
      m.material = m.material.clone();
      m.material.color.set(colors[m.material.name]);
    }
  });
  return o;
}
