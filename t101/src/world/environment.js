// 天空、光線、地面、城市、山景、行道樹與車流。座標:北 = -Z、東 = +X,101 位於原點。
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { groundTexture, cityFacadeTextures, roofTexture, stoneTileTexture } from './textures.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// 平滑值雜訊
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, oct = 5) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, z * f); f *= 2.03; amp *= 0.5; }
  return s;
}

/** 地形高度:四獸山(東南)+ 盆地邊緣群山(北側陽明山最高)。 */
export function terrainHeight(x, z) {
  let h = 0;
  // 象山、虎山、豹山、獅山
  const hills = [[1150, 380, 420, 183], [1500, -150, 450, 140], [1750, 600, 520, 150], [2100, 150, 600, 165], [1400, 1100, 700, 200]];
  for (const [hx, hz, r, hh] of hills) {
    const d = Math.hypot(x - hx, z - hz) / r;
    if (d < 1.6) h = Math.max(h, hh * Math.exp(-d * d * 2.2) * (0.75 + 0.5 * fbm(x / 300, z / 300, 3)));
  }
  // 盆地邊緣
  const r = Math.hypot(x, z);
  const ang = Math.atan2(z, x);
  const north = Math.max(0, -z / Math.max(r, 1)); // 北邊較高
  const edge = 5200 + 1800 * Math.sin(ang * 3 + 1.2) + 1200 * fbm(Math.cos(ang) * 3, Math.sin(ang) * 3, 3);
  if (r > edge) {
    const t = Math.min(1, (r - edge) / 6000);
    const peak = 450 + 750 * north;
    h = Math.max(h, peak * Math.pow(t, 0.8) * (0.55 + 0.9 * fbm(x / 2200, z / 2200, 5)));
  }
  // 淡水河谷(西側)
  if (x < -4200 && x > -5600 && r < 9000) h *= 0.2;
  return h;
}

export function createSky(scene) {
  const sky = new Sky();
  sky.scale.setScalar(90000);
  const u = sky.material.uniforms;
  u.turbidity.value = 6;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.85;
  scene.add(sky);
  return sky;
}

export const TIMES = {
  day: { label: '白天', elev: 52, azim: 150, sun: 3.2, hemi: 0.9, exposure: 0.55, fog: 0xb9cad6, night: 0 },
  dusk: { label: '黃昏', elev: 4, azim: 250, sun: 2.2, hemi: 0.45, exposure: 0.62, fog: 0xd7a68a, night: 0.45 },
  night: { label: '夜晚', elev: -6, azim: 250, sun: 0.25, hemi: 0.12, exposure: 0.85, fog: 0x101826, night: 1 }
};

export function createLights(scene) {
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b6250, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = c.bottom = -45; c.right = c.top = 45; c.near = 1; c.far = 900;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  return { hemi, sun };
}

export function buildGround(scene, maxAniso) {
  const g = new THREE.Group();
  const tex = groundTexture();
  const SIZE = 14400;
  tex.repeat.set(SIZE / 120, SIZE / 120);
  tex.anisotropy = maxAniso;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  g.add(ground);
  // 遠處地面(單色,接到地形)
  const far = new THREE.Mesh(new THREE.RingGeometry(SIZE / 2 - 10, 60000, 64, 1), new THREE.MeshStandardMaterial({ color: 0x5d6158, roughness: 1 }));
  far.rotation.x = -Math.PI / 2;
  far.position.y = -0.2;
  g.add(far);

  // 101 廣場鋪面
  const pv = stoneTileTexture([150, 144, 134], '#6e685f', 77);
  pv.repeat.set(40, 30);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(200, 160), new THREE.MeshStandardMaterial({ map: pv, roughness: 0.8 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.04, -24);
  plaza.receiveShadow = true;
  g.add(plaza);

  // 淡水河
  const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 30000), new THREE.MeshStandardMaterial({ color: 0x3d5a63, metalness: 0.2, roughness: 0.08, envMapIntensity: 1.4 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(-4900, 0.3, -4000);
  g.add(water);
  // 基隆河(北側,東西向)
  const water2 = new THREE.Mesh(new THREE.PlaneGeometry(14000, 260), water.material);
  water2.rotation.x = -Math.PI / 2;
  water2.position.set(1000, 0.3, -3600);
  g.add(water2);
  scene.add(g);
  return g;
}

export function buildTerrain(scene) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false });
  const make = (size, seg, cx, cz) => {
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx, z = p.getZ(i) + cz;
      const h = terrainHeight(x, z);
      p.setY(i, h > 1 ? h : -3);
      const n = fbm(x / 120, z / 120, 3);
      if (h > 700) c.setRGB(0.32, 0.38, 0.3);
      else c.setRGB(0.16 + n * 0.08, 0.26 + n * 0.1, 0.14 + n * 0.05);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx, 0, cz);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  make(3200, 160, 1700, 400); // 四獸山
  make(56000, 220, 0, 0); // 盆地群山
}

/**
 * 城市:依街廓產生大樓,合併成兩個網格(外牆、屋頂)。
 * 信義區(101 周圍)較高,越遠越低。回傳 { mesh, setNight }。
 */
export function buildCity(scene, zones = []) {
  const r = rng(2024);
  const BLOCK = 120, RANGE = 6600;
  const side = { pos: [], uv: [], col: [] };
  const top = { pos: [], uv: [], col: [] };
  const color = new THREE.Color();
  const palette = [0xb9b2a5, 0xa59d90, 0x9a9c9c, 0x868f96, 0xc7bfb0, 0x7a838c, 0xae9f86, 0x6e787f, 0x939c9f, 0xb08f7a, 0x8a7f74, 0x5f6b72];
  const addBox = (x0, z0, x1, z1, h, c) => {
    const quads = [
      [[x0, z1], [x1, z1]], [[x1, z1], [x1, z0]], [[x1, z0], [x0, z0]], [[x0, z0], [x0, z1]]
    ];
    const vScale = 8 * 3.4, uScale = 24;
    for (const [[ax, az], [bx, bz]] of quads) {
      const len = Math.hypot(bx - ax, bz - az);
      const v = [[ax, 0, az, 0, 0], [bx, 0, bz, len / uScale, 0], [bx, h, bz, len / uScale, h / vScale], [ax, h, az, 0, h / vScale]];
      for (const t of [0, 1, 2, 0, 2, 3]) {
        side.pos.push(v[t][0], v[t][1], v[t][2]);
        side.uv.push(v[t][3], v[t][4]);
        side.col.push(c.r, c.g, c.b);
      }
    }
    const tv = [[x0, h, z1, 0, 0], [x1, h, z1, 1, 0], [x1, h, z0, 1, 1], [x0, h, z0, 0, 1]];
    for (const t of [0, 1, 2, 0, 2, 3]) {
      top.pos.push(tv[t][0], tv[t][1], tv[t][2]);
      top.uv.push(tv[t][3], tv[t][4]);
      top.col.push(c.r * 0.9, c.g * 0.9, c.b * 0.9);
    }
  };
  const nb = Math.ceil(RANGE / BLOCK);
  for (let bi = -nb; bi < nb; bi++) {
    for (let bj = -nb; bj < nb; bj++) {
      const bx = bi * BLOCK, bz = bj * BLOCK;
      const cx = bx + BLOCK / 2, cz = bz + BLOCK / 2;
      const dist = Math.hypot(cx, cz);
      if (dist > RANGE) continue;
      if (cx > -110 && cx < 110 && cz > -150 && cz < 90) continue; // 101 廣場與裙樓
      if (terrainHeight(cx, cz) > 3) continue;
      if (zones.some(([x0, z0, x1, z1]) => bx + BLOCK > x0 && bx < x1 && bz + BLOCK > z0 && bz < z1)) continue;
      if (Math.abs(cx + 4900) < 420 || Math.abs(cz + 3600) < 200) continue; // 河道
      if (r() < 0.06) continue; // 公園/空地
      const xinyi = cx > -700 && cx < 900 && cz > -700 && cz < 500;
      const subdiv = dist < 1600 ? 2 : 1;
      const lot = (BLOCK - 24) / subdiv;
      for (let i = 0; i < subdiv; i++) {
        for (let j = 0; j < subdiv; j++) {
          if (r() < 0.08) continue;
          const lx = bx + 12 + i * lot, lz = bz + 12 + j * lot;
          const fw = lot * (0.55 + r() * 0.4), fd = lot * (0.55 + r() * 0.4);
          const ox = lx + r() * (lot - fw), oz = lz + r() * (lot - fd);
          let h;
          if (xinyi) h = 20 + Math.pow(r(), 3.2) * 200;
          else h = 10 + Math.pow(r(), 2.4) * (dist < 1500 ? 70 : 45);
          h = Math.round(h / 3.4) * 3.4;
          color.setHex(palette[Math.floor(r() * palette.length)]);
          addBox(ox, oz, ox + fw, oz + fd, h, color);
          // 塔樓上的退縮
          if (h > 90 && r() < 0.6) {
            const s = 0.15 + r() * 0.15;
            addBox(ox + fw * s, oz + fd * s, ox + fw * (1 - s), oz + fd * (1 - s), h + 10 + r() * 30, color);
          }
        }
      }
    }
  }
  const fx = cityFacadeTextures();
  const mk = (d) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
    geo.computeVertexNormals();
    return geo;
  };
  const sideMat = new THREE.MeshStandardMaterial({
    map: fx.map, vertexColors: true, roughness: 0.7, metalness: 0.1,
    emissive: new THREE.Color(0xffffff), emissiveMap: fx.emissive, emissiveIntensity: 0
  });
  const sides = new THREE.Mesh(mk(side), sideMat);
  sides.castShadow = sides.receiveShadow = true;
  const roofs = new THREE.Mesh(mk(top), new THREE.MeshStandardMaterial({ map: roofTexture(), vertexColors: true, roughness: 0.9 }));
  roofs.receiveShadow = true;
  scene.add(sides, roofs);
  return { setNight: (n) => { sideMat.emissiveIntensity = n * 1.1; } };
}

/** 行道樹(101 周邊 900m 內)。 */
export function buildTrees(scene) {
  const r = rng(77);
  const spots = [];
  const BLOCK = 120;
  for (let bi = -8; bi < 8; bi++) {
    for (let bj = -8; bj < 8; bj++) {
      const bx = bi * BLOCK, bz = bj * BLOCK;
      for (let k = 14; k < BLOCK - 10; k += 9) {
        for (const [x, z] of [[bx + k, bz + 10], [bx + 10, bz + k]]) {
          if (Math.abs(x) < 34 && Math.abs(z) < 34) continue;
          if (x > -78 && x < 78 && z > -112 && z < -28) continue;
          if (r() < 0.85) spots.push([x + (r() - 0.5), z + (r() - 0.5)]);
        }
      }
    }
  }
  // 廣場樹列
  for (let x = -90; x <= 90; x += 10) for (const z of [50, 62]) spots.push([x, z]);
  for (let z = -20; z <= 40; z += 10) for (const x of [-60, 60, -84, 84]) spots.push([x, z]);

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 3, 6);
  trunkGeo.translate(0, 1.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.4, 1);
  crownGeo.scale(1, 0.9, 1);
  crownGeo.translate(0, 4.6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }), spots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  spots.forEach(([x, z], i) => {
    const sc = 0.8 + r() * 0.5;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
    s.set(sc, sc * (0.9 + r() * 0.3), sc);
    p.set(x, 0, z);
    m.compose(p, q, s);
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
    c.setHSL(0.25 + r() * 0.08, 0.45, 0.22 + r() * 0.1);
    crowns.setColorAt(i, c);
  });
  trunks.castShadow = crowns.castShadow = true;
  crowns.receiveShadow = true;
  scene.add(trunks, crowns);
}

/** 車流:沿棋盤道路行駛的小車(101 周邊)。回傳 update(dt)。 */
export function buildTraffic(scene) {
  const r = rng(99);
  const N = 420;
  const body = new THREE.BoxGeometry(1.8, 0.8, 4.3);
  body.translate(0, 0.65, 0);
  const cab = new THREE.BoxGeometry(1.6, 0.6, 2.2);
  cab.translate(0, 1.35, -0.2);
  const merged = mergeTwo(body, cab);
  const mesh = new THREE.InstancedMesh(merged, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 }), N);
  const cars = [];
  const cols = [0xf2f2f2, 0x1d1d1f, 0xb8bcc2, 0xe6c229, 0x8c1c1c, 0x274b8a, 0x5b6770, 0xf2f2f2, 0xe6c229];
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const axis = r() < 0.5 ? 'x' : 'z';
    let line = (Math.floor(r() * 30) - 15) * 120;
    if (line === 0 || (axis === 'z' && line === -120)) line = 240; // 避開 101 與裙樓
    const dir = r() < 0.5 ? 1 : -1;
    const lane = dir * (2 + Math.floor(r() * 2) * 3.2);
    cars.push({ axis, line: line + lane, dir, t: (r() - 0.5) * 3600, v: 8 + r() * 6 });
    c.setHex(cols[Math.floor(r() * cols.length)]);
    mesh.setColorAt(i, c);
  }
  mesh.castShadow = true;
  scene.add(mesh);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
  return (dt) => {
    cars.forEach((car, i) => {
      car.t += car.v * car.dir * dt;
      if (car.t > 1800) car.t -= 3600;
      if (car.t < -1800) car.t += 3600;
      if (car.axis === 'x') { p.set(car.t, 0, car.line); q.setFromAxisAngle(Y, car.dir > 0 ? Math.PI / 2 : -Math.PI / 2); }
      else { p.set(car.line, 0, car.t); q.setFromAxisAngle(Y, car.dir > 0 ? 0 : Math.PI); }
      m.compose(p, q, one);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
}

function mergeTwo(a, b) {
  const pa = a.toNonIndexed(), pb = b.toNonIndexed();
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal']) {
    const A = pa.attributes[k].array, B = pb.attributes[k].array;
    const arr = new Float32Array(A.length + B.length);
    arr.set(A); arr.set(B, A.length);
    g.setAttribute(k, new THREE.BufferAttribute(arr, 3));
  }
  return g;
}

/** 設定時段(天空、太陽方向、霧、夜間發光)。 */
export function applyTime(ctx, key) {
  const t = TIMES[key];
  const { sky, lights, scene, renderer } = ctx;
  const phi = THREE.MathUtils.degToRad(90 - t.elev);
  const theta = THREE.MathUtils.degToRad(t.azim);
  const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  sky.material.uniforms.sunPosition.value.copy(dir);
  ctx.sunDir = dir.clone();
  if (key === 'night') {
    // 月光
    ctx.sunDir.set(-0.4, 0.7, 0.3).normalize();
    lights.sun.color.setHex(0x9fb4e6);
  } else lights.sun.color.setHex(key === 'dusk' ? 0xffb47a : 0xfff1dc);
  lights.sun.intensity = t.sun;
  lights.hemi.intensity = t.hemi;
  lights.hemi.color.setHex(key === 'night' ? 0x34446a : key === 'dusk' ? 0xf0c2a0 : 0xcfe3ff);
  renderer.toneMappingExposure = t.exposure;
  scene.fog.color.setHex(t.fog);
  return t;
}
