// 高速電梯車廂(獨立場景)與行駛曲線。上行最高 1010 m/min(5F→89F 約 37 秒),下行 600 m/min。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ELEV_VMAX, ELEV_ACC, floorY, floorAtY } from '../config.js?v=f1aef92';
import { canvasTex, stoneTileTexture } from './textures.js?v=f1aef92';
import { createCharacter, poseIdle } from './character.js?v=f1aef92';

/** 梯形速度曲線:回傳 { T, at(t) → { s, v } }。 */
export function rideProfile(dist, vmax, acc) {
  let ta = vmax / acc, da = 0.5 * acc * ta * ta;
  if (2 * da > dist) { ta = Math.sqrt(dist / acc); vmax = acc * ta; da = dist / 2; }
  const tc = (dist - 2 * da) / vmax;
  const T = 2 * ta + tc;
  return {
    T,
    at(t) {
      t = Math.max(0, Math.min(T, t));
      if (t < ta) return { s: 0.5 * acc * t * t, v: acc * t };
      if (t < ta + tc) return { s: da + vmax * (t - ta), v: vmax };
      const td = T - t;
      return { s: dist - 0.5 * acc * td * td, v: acc * td };
    }
  };
}

export function buildElevatorScene(renderer) {
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.background = new THREE.Color(0x050608);

  const W = 2.6, D = 2.2, H = 2.7;
  const panel = new THREE.MeshPhysicalMaterial({ color: 0x1c1712, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xc8a25a, metalness: 1, roughness: 0.25 });
  const floorT = stoneTileTexture([40, 38, 36], '#1a1918', 9);
  floorT.repeat.set(0.6, 0.6);
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); scene.add(m); return m; };
  add(new THREE.BoxGeometry(W, 0.05, D), new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.2 }), 0, -0.025, 0);
  // 牆(門在 +Z)
  add(new THREE.BoxGeometry(W, H, 0.05), panel, 0, H / 2, -D / 2);
  add(new THREE.BoxGeometry(0.05, H, D), panel, -W / 2, H / 2, 0);
  add(new THREE.BoxGeometry(0.05, H, D), panel, W / 2, H / 2, 0);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry((W - 1.4) / 2, H, 0.05), panel, s * (0.7 + (W - 1.4) / 4), H / 2, D / 2);
  // 金色飾條
  for (const y of [0.1, 0.95, 2.1]) {
    add(new THREE.BoxGeometry(W - 0.02, 0.03, 0.02), trim, 0, y, -D / 2 + 0.035);
    add(new THREE.BoxGeometry(0.02, 0.03, D - 0.02), trim, -W / 2 + 0.035, y, 0);
    add(new THREE.BoxGeometry(0.02, 0.03, D - 0.02), trim, W / 2 - 0.035, y, 0);
  }
  // 扶手
  for (const [x, z, w, d] of [[0, -D / 2 + 0.08, W - 0.3, 0.04], [-W / 2 + 0.08, 0, 0.04, D - 0.3], [W / 2 - 0.08, 0, 0.04, D - 0.3]]) {
    add(new THREE.BoxGeometry(w, 0.04, d), trim, x, 0.92, z);
  }
  // 門(兩扇,金屬拉絲)
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xb8a074, metalness: 1, roughness: 0.3 });
  const dL = add(new THREE.BoxGeometry(0.6, 2.2, 0.04), doorMat, -0.3, 1.1, D / 2 - 0.01);
  const dR = add(new THREE.BoxGeometry(0.6, 2.2, 0.04), doorMat, 0.3, 1.1, D / 2 - 0.01);
  add(new THREE.BoxGeometry(1.4, H - 2.2, 0.05), panel, 0, 2.2 + (H - 2.2) / 2, D / 2);
  // 星空天花板
  const starTex = canvasTex(1024, 1024, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w * 0.7);
    grd.addColorStop(0, '#0c1f4a');
    grd.addColorStop(1, '#03060f');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = Math.random() * 2.2 + 0.4;
      const a = 0.4 + Math.random() * 0.6;
      g.fillStyle = `rgba(${200 + Math.random() * 55},${220 + Math.random() * 35},255,${a})`;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      if (r > 2.2) { g.fillStyle = `rgba(160,200,255,0.15)`; g.beginPath(); g.arc(x, y, r * 4, 0, 7); g.fill(); }
    }
  }, { repeat: false });
  const ceil = add(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map: starTex }), 0, H, 0);
  ceil.rotation.x = Math.PI / 2;
  const glow = new THREE.PointLight(0x6f9bff, 2.4, 6, 1.5);
  glow.position.set(0, H - 0.2, 0);
  scene.add(glow);
  const down = new THREE.SpotLight(0xffe2b8, 9, 6, 0.9, 0.8, 1);
  down.position.set(0, H - 0.05, 0);
  down.target.position.set(0, 0, 0);
  scene.add(down, down.target);
  scene.add(new THREE.AmbientLight(0x404a60, 0.6));

  // 門上方顯示器(樓層、速度)
  const disp = canvasTex(512, 160, () => {}, { repeat: false });
  const dispMesh = add(new THREE.PlaneGeometry(0.95, 0.3), new THREE.MeshBasicMaterial({ map: disp }), 0, 2.45, D / 2 - 0.035);
  dispMesh.rotation.y = Math.PI;
  const drawDisplay = (floor, speedMpm, dir) => {
    const g = disp.image.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 512, 160);
    g.fillStyle = '#ff9a3c';
    g.font = '700 110px "Barlow Condensed", sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText(`${dir > 0 ? '▲' : dir < 0 ? '▼' : ' '}${floor}`, 24, 84);
    g.textAlign = 'right';
    g.font = '600 46px "Barlow Condensed", sans-serif';
    g.fillStyle = '#7fe0d0';
    g.fillText(`${Math.round(speedMpm)} m/min`, 492, 60);
    g.font = '500 30px "Noto Sans TC", sans-serif';
    g.fillStyle = '#c8d6e0';
    g.fillText('台北101 觀景台電梯', 492, 118);
    disp.needsUpdate = true;
  };
  drawDisplay(5, 0, 0);
  // 按鈕面板
  const btnPanel = add(new THREE.BoxGeometry(0.02, 0.5, 0.22), trim, W / 2 - 0.04, 1.2, D / 2 - 0.25);
  void btnPanel;

  // 同行乘客
  const people = [];
  const ppl = [
    [{ shirt: 0x9c3d3d, pants: 0x22252b, hairLong: true }, -0.75, 0.45, 0.15],
    [{ shirt: 0xe8e2d4, pants: 0x4a5a6a }, 0.85, 0.35, -0.2],
    [{ shirt: 0x3b5b8c, pants: 0x3a3a3a, hair: 0x2a1d14 }, -0.95, -0.35, 0.5],
    [{ shirt: 0x1f3a5a, pants: 0x1d2433, hairLong: true }, 0.1, 0.62, 0.05]
  ];
  for (const [o, x, z, ry] of ppl) {
    const c = createCharacter(o);
    c.root.position.set(x, 0, z);
    c.root.rotation.y = ry;
    scene.add(c.root);
    people.push(c);
  }

  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 50);
  camera.position.set(0.25, 1.62, -0.9);
  camera.lookAt(0, 1.8, D / 2);

  return {
    scene, camera, drawDisplay,
    setDoors(t) { dL.position.x = -0.3 - t * 0.58; dR.position.x = 0.3 + t * 0.58; },
    update(time, shake) {
      for (const p of people) poseIdle(p, time + p.root.position.x * 3);
      camera.position.y = 1.62 + Math.sin(time * 33) * 0.0015 * shake;
      camera.position.x = 0.25 + Math.sin(time * 27) * 0.001 * shake;
    }
  };
}

/** 建立一趟電梯行程。 */
export function makeRide(fromFloor, toFloor) {
  const y0 = floorY(fromFloor), y1 = floorY(toFloor);
  const dir = Math.sign(y1 - y0);
  const prof = rideProfile(Math.abs(y1 - y0), dir > 0 ? ELEV_VMAX : 10, dir > 0 ? ELEV_ACC : 0.9);
  return {
    from: fromFloor, to: toFloor, dir, T: prof.T,
    state(t) {
      const { s, v } = prof.at(t);
      const y = y0 + dir * s;
      return { y, v, floor: floorAtY(y + 0.5), done: t >= prof.T };
    }
  };
}
