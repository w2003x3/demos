// 觀光直升機(程序化模型)。機頭朝 +Z,原點在機身中心下方(起落橇底)。
import * as THREE from 'three';
import { canvasTex } from './textures.js';

export function buildHelicopter() {
  const g = new THREE.Group();
  const livery = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#f4f4f2';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#c62828';
    c.fillRect(0, h * 0.58, w, h * 0.1);
    c.fillStyle = '#2f7a80';
    c.fillRect(0, h * 0.7, w, h * 0.05);
    c.fillStyle = '#1d2433';
    c.font = '700 40px "Barlow Condensed", sans-serif';
    c.fillText('TAIPEI 101 SKY TOUR', 40, h * 0.5);
  }, { repeat: false });
  const body = new THREE.MeshStandardMaterial({ map: livery, roughness: 0.35, metalness: 0.2 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.35, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x26292e, roughness: 0.5, metalness: 0.6 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.4 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fc4d8, roughness: 0.05, metalness: 0.1, transmission: 0.6, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };

  // 機身(拉長的膠囊)
  const fus = add(new THREE.CapsuleGeometry(1.15, 2.6, 8, 20), body, 0, 1.75, 0.2);
  fus.rotation.x = Math.PI / 2;
  fus.scale.set(1, 1, 0.95);
  // 駕駛艙罩
  const canopy = add(new THREE.SphereGeometry(1.2, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), glass, 0, 1.95, 1.55);
  canopy.rotation.x = Math.PI / 2.2;
  canopy.castShadow = false;
  // 窗框
  for (const x of [-0.75, 0.75]) {
    const p = add(new THREE.BoxGeometry(0.06, 1.3, 0.06), dark, x, 2.1, 2.2);
    p.rotation.x = -0.6;
  }
  add(new THREE.BoxGeometry(1.9, 0.06, 0.06), dark, 0, 2.62, 1.75);
  // 儀表板
  add(new THREE.BoxGeometry(1.6, 0.3, 0.5), dark, 0, 1.55, 2.0);
  const screens = new THREE.MeshStandardMaterial({ color: 0x0b1626, emissive: 0x2c8f9a, emissiveIntensity: 0.8 });
  for (const x of [-0.45, 0, 0.45]) add(new THREE.BoxGeometry(0.34, 0.22, 0.02), screens, x, 1.72, 1.78).rotation.x = -0.5;
  // 座椅
  for (const x of [-0.5, 0.5]) for (const z of [0.9, -0.3]) add(new THREE.BoxGeometry(0.55, 0.6, 0.5), dark, x, 1.15, z);
  // 尾桁、尾翼
  const boom = add(new THREE.CylinderGeometry(0.22, 0.42, 5.2, 14), white, 0, 2.05, -3.6);
  boom.rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(0.12, 1.4, 0.9), red, 0, 2.7, -6.0).rotation.x = -0.35;
  add(new THREE.BoxGeometry(1.8, 0.08, 0.5), white, 0, 2.1, -5.6);
  // 尾旋翼
  const tail = new THREE.Group();
  tail.position.set(0.22, 2.75, -6.15);
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.3, 0.14), dark); b.rotation.x = i * Math.PI / 2; tail.add(b); }
  g.add(tail);
  // 主旋翼
  add(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 10), dark, 0, 3.05, 0.2);
  const rotor = new THREE.Group();
  rotor.position.set(0, 3.38, 0.2);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 5.4), dark);
    b.position.z = 2.7;
    const arm = new THREE.Group();
    arm.rotation.y = i * Math.PI / 2;
    arm.add(b);
    rotor.add(arm);
  }
  rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 12), dark));
  g.add(rotor);
  // 旋轉時的模糊圓盤
  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.5, 48), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(0, 3.38, 0.2);
  g.add(disc);
  // 起落橇
  for (const x of [-0.95, 0.95]) {
    const skid = add(new THREE.CapsuleGeometry(0.06, 3.4, 4, 8), dark, x, 0.08, 0.3);
    skid.rotation.x = Math.PI / 2;
    for (const z of [1.1, -0.6]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), dark, x * 0.85, 0.5, z).rotation.z = x * 0.25;
  }
  // 航行燈
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  beacon.position.set(0, 2.95, -1.0);
  g.add(beacon);
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  navL.position.set(-1.0, 1.7, 0.6);
  const navR = navL.clone();
  navR.material = new THREE.MeshBasicMaterial({ color: 0x20ff40 });
  navR.position.x = 1.0;
  g.add(navL, navR);

  return {
    group: g,
    update(t) {
      rotor.rotation.y = t * 28;
      tail.rotation.x = t * 60;
      beacon.visible = Math.sin(t * 6) > 0.6;
    }
  };
}
