// 依 Blender 材質名稱(見 blender/build_assets.py)強化成遊戲用 PBR 材質。
import * as THREE from 'three';
import { Tex } from '../core/textures.js';

let cache = null;
const textures = () => (cache ??= { floor: Tex.floor(), fabric: Tex.fabric() });

const NO_SHADOW = /Glass|Light_Emit|Drink_Water_Body|Drink_Tea_Body/;
const done = new WeakSet();

function enhance(m) {
  if (done.has(m)) return;
  done.add(m);
  const T = textures();
  switch (m.name) {
    case 'Glass':
      Object.assign(m, { transparent: true, opacity: 0.16, depthWrite: false, roughness: 0.04, metalness: 0 });
      m.color.set('#2a3a42');
      break;
    case 'Door_Glass':
      Object.assign(m, { transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.05, metalness: 0 });
      break;
    case 'Drink_Tea_Body':
    case 'Drink_Water_Body':
      Object.assign(m, { transparent: true, opacity: m.name.includes('Water') ? 0.55 : 0.85, depthWrite: false });
      break;
    case 'Light_Emit':
      m.emissive.set('#fff6e8');
      m.emissiveIntensity = 2.2;
      m.toneMapped = true;
      break;
    case 'Car_Floor':
      m.map = T.floor;
      m.color.set('#ffffff');
      break;
    case 'Seat_Fabric':
      m.map = T.fabric;
      m.color.set('#ffffff');
      m.roughness = 0.95;
      break;
    case 'Car_Skin_White':
      m.envMapIntensity = 1.2;
      break;
    default:
      break;
  }
  m.needsUpdate = true;
}

export function enhanceMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    enhance(o.material);
    o.castShadow = !NO_SHADOW.test(o.material.name);
    o.receiveShadow = true;
  });
}
