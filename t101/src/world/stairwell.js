// 樓梯間(登高賽,獨立場景)。每層 = 兩跑樓梯 + 中間平台 + 樓層平台;用 5 組模組循環擺放。
import * as THREE from 'three';
import { FH, WATER_FLOORS } from '../config.js?v=4d1cca2';
import { canvasTex, concreteTexture, drawStairSign, textTexture } from './textures.js?v=4d1cca2';

export const U_PER_FLOOR = 28; // 一層的「步」數(含兩個轉角平台各 3 步)
const RUN = 3.2, STEPS = 11, HALF_W = 1.45, TURN_R = 0.72;

/** 路徑:p = 已爬層數(浮點),lane 為內外道偏移(-0.3~0.3)。回傳 { x, y, z, ry }。 */
export function stairPath(p, lane = 0) {
  const fl = Math.floor(p);
  const u = (p - fl) * U_PER_FLOOR;
  const r = TURN_R + lane;
  const base = fl * FH;
  let x, y, z, ry;
  if (u < 3) { // 樓層平台轉角
    const s = u / 3, phi = -Math.PI / 2 - s * Math.PI;
    x = -RUN / 2 + Math.cos(phi) * r; z = Math.sin(phi) * r; y = base;
    ry = Math.atan2(Math.sin(phi), -Math.cos(phi)); // 切線方向
  } else if (u < 14) { // 第一跑(往 +X)
    const s = (u - 3) / 11;
    x = -RUN / 2 + s * RUN; y = base + s * FH / 2; z = r; ry = Math.PI / 2;
  } else if (u < 17) { // 中間平台轉角
    const s = (u - 14) / 3, phi = Math.PI / 2 - s * Math.PI;
    x = RUN / 2 + Math.cos(phi) * r; z = Math.sin(phi) * r; y = base + FH / 2;
    ry = Math.atan2(Math.sin(phi), -Math.cos(phi));
  } else { // 第二跑(往 -X)
    const s = (u - 17) / 11;
    x = RUN / 2 - s * RUN; y = base + FH / 2 + s * FH / 2; z = -r; ry = -Math.PI / 2;
  }
  return { x, y, z, ry, onFlight: (u >= 3 && u < 14) || u >= 17 };
}

export function buildStairScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1c1f);
  scene.fog = new THREE.Fog(0x1a1c1f, 8, 22);
  scene.add(new THREE.HemisphereLight(0xf2f4f8, 0x5a5650, 0.9));

  const wallTex = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#e7e4dc';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#7d8f86';
    g.fillRect(0, h * 0.7, w, h * 0.3);
    g.fillStyle = '#5d6d65';
    g.fillRect(0, h * 0.7 - 4, w, 4);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
  wallTex.repeat.set(1 / 2.5, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
  const conc = concreteTexture('#9c9a94', 5);
  const stepMat = new THREE.MeshStandardMaterial({ map: conc, roughness: 0.85 });
  const nosing = new THREE.MeshStandardMaterial({ color: 0xe6c229, roughness: 0.6 });
  const rail = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.8, roughness: 0.35 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x8c949a, metalness: 0.6, roughness: 0.45 });
  const tube = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4fbff, emissiveIntensity: 2.4 });
  const exitTex = textTexture('安全門 EXIT', { w: 256, h: 96, bg: '#1b8a3a', fg: '#ffffff', font: '700 40px "Noto Sans TC", sans-serif' });
  const exitMat = new THREE.MeshStandardMaterial({ map: exitTex, emissive: 0xffffff, emissiveMap: exitTex, emissiveIntensity: 0.9 });

  function module() {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.receiveShadow = true; g.add(m); return m; };
    const riser = FH / 2 / STEPS, tread = RUN / STEPS;
    // 兩跑階梯
    for (const [dir, z0, y0] of [[1, TURN_R, 0], [-1, -TURN_R, FH / 2]]) {
      for (let k = 0; k < STEPS; k++) {
        const top = y0 + (k + 1) * riser;
        const xc = dir > 0 ? -RUN / 2 + (k + 0.5) * tread : RUN / 2 - (k + 0.5) * tread;
        add(new THREE.BoxGeometry(tread, 0.3, 1.35), stepMat, xc, top - 0.15, z0);
        add(new THREE.BoxGeometry(0.04, 0.012, 1.3), nosing, xc + dir * (tread / 2 - 0.03), top + 0.002, z0);
      }
      // 樓梯底板(斜)
      const len = Math.hypot(RUN, FH / 2);
      const soffit = add(new THREE.BoxGeometry(len, 0.15, 1.35), stepMat, 0, y0 + FH / 4 - 0.32, z0);
      soffit.rotation.z = dir * Math.atan2(FH / 2, RUN);
      // 中柱欄杆扶手
      const hr = add(new THREE.CylinderGeometry(0.025, 0.025, len, 8), rail, 0, y0 + FH / 4 + 0.9, z0 - Math.sign(z0) * 0.68);
      hr.rotation.z = Math.PI / 2 + dir * Math.atan2(FH / 2, RUN);
      for (let k = 0; k <= 4; k++) {
        const s = k / 4;
        const px = dir > 0 ? -RUN / 2 + s * RUN : RUN / 2 - s * RUN;
        add(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 6), rail, px, y0 + s * FH / 2 + 0.45, z0 - Math.sign(z0) * 0.68);
      }
      // 牆側扶手
      const wr = add(new THREE.CylinderGeometry(0.022, 0.022, len, 8), rail, 0, y0 + FH / 4 + 0.88, Math.sign(z0) * (HALF_W - 0.07));
      wr.rotation.z = hr.rotation.z;
    }
    // 中間隔牆(兩跑之間的矮牆)
    add(new THREE.BoxGeometry(RUN, 0.06, 0.06), rail, 0, FH / 2 + 0.9 - 0.05, 0);
    // 平台
    add(new THREE.BoxGeometry(1.6, 0.25, HALF_W * 2), stepMat, -RUN / 2 - 0.8, -0.125, 0);
    add(new THREE.BoxGeometry(1.6, 0.25, HALF_W * 2), stepMat, RUN / 2 + 0.8, FH / 2 - 0.125, 0);
    // 牆
    const L = RUN + 3.2;
    add(new THREE.BoxGeometry(L, FH, 0.1), wallMat, 0, FH / 2, -HALF_W - 0.05);
    add(new THREE.BoxGeometry(L, FH, 0.1), wallMat, 0, FH / 2, HALF_W + 0.05);
    add(new THREE.BoxGeometry(0.1, FH, HALF_W * 2), wallMat, -L / 2 - 0.05, FH / 2, 0);
    add(new THREE.BoxGeometry(0.1, FH, HALF_W * 2), wallMat, L / 2 + 0.05, FH / 2, 0);
    // 防火門(樓層平台西牆)
    add(new THREE.BoxGeometry(0.06, 2.1, 1.0), doorMat, -L / 2 + 0.02, 1.05, 0.55);
    add(new THREE.BoxGeometry(0.05, 0.05, 0.7), rail, -L / 2 + 0.08, 1.0, 0.55);
    const ex = add(new THREE.PlaneGeometry(0.5, 0.19), exitMat, -L / 2 + 0.06, 2.35, 0.55);
    ex.rotation.y = Math.PI / 2;
    // 樓層號碼
    const signTex = canvasTex(512, 512, () => {}, { repeat: false });
    const sign = add(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 }), -L / 2 + 0.06, 1.9, -0.65);
    sign.rotation.y = Math.PI / 2;
    // 日光燈
    for (const [x, y] of [[-L / 2 + 0.6, 2.9], [L / 2 - 0.6, FH / 2 + 2.9]]) {
      add(new THREE.BoxGeometry(0.1, 0.06, 1.2), tube, x, y, 0);
    }
    const light = new THREE.PointLight(0xf2f6ff, 9, 9, 1.4);
    light.position.set(0, FH * 0.75, 0);
    g.add(light);
    // 補水站(桌 + 杯子)
    const water = new THREE.Group();
    const table = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 1.0), new THREE.MeshStandardMaterial({ color: 0x2c5f9e, roughness: 0.6 }));
    table.position.y = 0.4;
    water.add(table);
    for (let i = 0; i < 8; i++) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.09, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
      cup.position.set(-0.12 + (i % 2) * 0.2, 0.845, -0.4 + Math.floor(i / 2) * 0.22);
      water.add(cup);
    }
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshStandardMaterial({ map: textTexture('補水站', { w: 256, h: 86, bg: '#2c5f9e', fg: '#fff', font: '700 50px "Noto Sans TC", sans-serif' }) }));
    ws.position.set(-0.24, 1.05, 0);
    ws.rotation.y = Math.PI / 2;
    water.add(ws);
    water.position.set(-L / 2 + 0.35, 0, -0.75);
    water.rotation.y = 0;
    g.add(water);
    g.userData = { signTex, water, floor: -1 };
    return g;
  }

  const pool = [];
  for (let i = 0; i < 5; i++) { const m = module(); scene.add(m); pool.push(m); }

  return {
    scene,
    /** baseFloor:起點樓層;p:目前已爬層數。 */
    update(baseFloor, p) {
      const fl = Math.floor(p);
      pool.forEach((m, i) => {
        const k = fl - 1 + i;
        if (k < 0) { m.visible = false; return; }
        m.visible = true;
        m.position.y = k * FH;
        const floor = baseFloor + k;
        if (m.userData.floor !== floor) {
          m.userData.floor = floor;
          drawStairSign(m.userData.signTex, floor);
          m.userData.water.visible = WATER_FLOORS.includes(floor);
        }
      });
    }
  };
}
