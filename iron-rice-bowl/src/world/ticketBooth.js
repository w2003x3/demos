// 臺北車站鈦鐵售票窗口(從窗口內往外看):售票台、玻璃隔板與傳聲孔、找零托盤、售票終端與票券印表機;
// 窗外是黑白棋盤格大廳、排隊欄柱與旅客隊伍。座標:窗口玻璃在 z = 0,大廳在 -z。
import * as THREE from 'three';
import { Builder, T, baseMats, textTex, sign } from './stations/common.js';

export function buildBooth() {
  const b = new Builder();
  const M = baseMats();
  Object.assign(M, {
    checker: M.tex(T.checker(), 0.25),
    wall: M.tex(T.plaster('#d9d2c2'), 0.8),
    wood: new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.55 }),
    counter: M.tex(T.granite('#3f4146'), 0.3),
    beige: M.tex(T.granite('#cdbfa8'), 0.6),
    belt: new THREE.MeshStandardMaterial({ color: '#b2232f', roughness: 0.6 }),
  });
  // 大廳地板(棋盤格)與窗外牆面、柱子
  b.floor(M.checker, -18, -30, 18, 0, 0, 2.5);
  b.floor(M.ceilingGrid ?? M.wall, -18, -30, 18, 0, 9, 3, false);
  for (const x of [-10, 10]) b.box(M.beige, 1.6, 9, 1.6, x, 0, -14, 0, 1.6);
  b.box(M.beige, 36, 9, 0.4, 0, 0, -30, 0, 1.6);
  sign(b, textTex('臺北車站', { sub: 'TAIPEI MAIN STATION · 鈦鐵 TZR', bg: '#16233f', h: 120, w: 900 }), 8, 1.1, 0, 6.8, -29.7, 0, { double: false });
  sign(b, textTex('鈦鐵 售票 Tickets', { sub: '請依序排隊 · Please queue', bg: '#1f4e9a', h: 110, w: 640 }), 3.4, 0.6, 0, 2.95, -0.05, Math.PI, { double: false });
  // 窗口內:櫃台、隔板、玻璃
  b.box(M.counter, 4.4, 0.06, 0.9, 0, 1.0, 0.35);
  b.box(M.wood, 4.4, 1.0, 0.08, 0, 0, -0.08);
  b.box(M.counter, 4.4, 0.05, 0.36, 0, 1.0, -0.2);     // 窗外側檯面
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.6), M.glass); glass.position.set(0, 1.9, -0.02); b.extra.push(glass);
  b.box(M.trim, 4.4, 0.08, 0.1, 0, 2.7, -0.02); b.box(M.trim, 0.08, 1.7, 0.1, -2.2, 1.04, -0.02); b.box(M.trim, 0.08, 1.7, 0.1, 2.2, 1.04, -0.02);
  b.box(M.wall, 6, 0.6, 0.12, 0, 2.74, -0.02);
  // 傳聲孔與找零托盤
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.01, 8, 24), M.steel); ring.position.set(-0.75, 1.32, -0.01); b.extra.push(ring);
  b.box(M.steel, 0.5, 0.05, 0.42, 0, 1.0, -0.05);
  // 兩側隔間(隔壁窗口)
  for (const x of [-2.3, 2.3]) b.box(M.wood, 0.1, 2.7, 1.6, x, 0, 0.6);
  b.box(M.wall, 6, 3.2, 0.2, 0, 0, 2.2);
  b.floor(M.wood, -2.3, 0, 2.3, 2.2, 0, 1);
  // 終端機、印表機、錢櫃
  b.box(M.trim, 0.55, 0.36, 0.04, -0.7, 1.2, 0.55);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.31), new THREE.MeshStandardMaterial({ color: '#0b1e3a', emissive: '#1f4e9a', emissiveIntensity: 0.6 }));
  scr.position.set(-0.7, 1.38, 0.53); scr.rotation.y = Math.PI; b.extra.push(scr);
  b.box(M.trim, 0.06, 0.18, 0.06, -0.7, 1.03, 0.58);
  b.box(M.steelPaint, 0.32, 0.18, 0.3, 0.75, 1.03, 0.5);
  b.box(M.trim, 0.5, 0.12, 0.4, 0.2, 0.86, 0.6);
  // 排隊欄柱(紅色伸縮帶)
  for (let z = -1.6; z > -14; z -= 2.4) for (const x of [-0.9, 0.9]) {
    b.add(M.steel, new THREE.CylinderGeometry(0.04, 0.04, 0.95, 10), x, 0.48, z);
    b.add(M.steel, new THREE.CylinderGeometry(0.16, 0.16, 0.03, 16), x, 0.015, z);
    if (z > -12) b.box(M.belt, 0.03, 0.06, 2.4, x, 0.86, z - 1.2);
  }
  // 燈光
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight('#f2f4f6', '#6a6258', 1.0));
  const sun = new THREE.DirectionalLight('#fff6e8', 1.4); sun.position.set(-6, 10, -8); lights.add(sun);
  const desk = new THREE.PointLight('#fff1dc', 6, 4, 1.5); desk.position.set(0, 2.4, 0.8); lights.add(desk);
  b.extra.push(lights);
  b.finish();
  return b.group;
}
