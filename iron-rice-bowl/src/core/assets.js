import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { enhanceMaterials } from '../world/materials.js';

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

/** 載入共用模型 + 指定車種模型;回傳 { key: THREE.Object3D }。 */
export async function loadAssets(base, trainType, onProgress) {
  const files = { ...COMMON };
  for (const [k, f] of Object.entries(trainType.models)) files[k] = f;
  const loader = new GLTFLoader();
  const entries = Object.entries(files);
  let done = 0;
  const out = {};
  await Promise.all(entries.map(async ([key, file]) => {
    const gltf = await loader.loadAsync(`${base}/${file}`);
    enhanceMaterials(gltf.scene);
    out[key] = gltf.scene;
    onProgress?.(++done / entries.length);
  }));
  return out;
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
