// 台北地標(簡化模型,位置依 101 為原點的大致方位與距離;北 = -Z、東 = +X)。
import * as THREE from 'three';
import { terrainHeight } from './environment.js';
import { canvasTex } from './textures.js';

import { GEO } from './geo.js';

const box = (c, w, d, h, name) => [c.x - w / 2, c.z - d / 2, c.x + w / 2, c.z + d / 2, h, name];
// 城市產生器要避開的範圍 [x0, z0, x1, z1]
export function landmarkZones() {
  const G = GEO;
  return [
    box(G.sunYatSen, 320, 420, 0), box(G.dome, 320, 260, 0), box(G.taozhu, 70, 70, 0), box(G.nanshan, 120, 100, 0),
    box(G.shinkong, 240, 200, 0), box(G.station, 260, 200, 0), box(G.cks, 650, 700, 0),
    [G.airport.x - 1700, G.airport.z - 260, G.airport.x + 1700, G.airport.z + 260]
  ].map((b) => b.slice(0, 4));
}
// 碰撞用的大致外形 [x0, z0, x1, z1, 高度, 名稱]
export function landmarkSolids() {
  const G = GEO;
  return [
    box(G.sunYatSen, 120, 120, 36, '國父紀念館'),
    box(G.dome, 232, 176, 50, '台北大巨蛋'),
    box(G.taozhu, 50, 50, 96, '陶朱隱園'),
    box(G.nanshan, 56, 46, 272, '南山廣場'),
    box(G.shinkong, 100, 40, 244, '新光摩天大樓'),
    box(G.station, 190, 130, 44, '台北車站'),
    box(G.cks, 76, 76, 77, '中正紀念堂'),
    box(G.grandHotel, 170, 50, 100, '圓山大飯店')
  ];
}

const std = (color, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function hipRoof(w, d, h, mat) {
  // 四坡屋頂(微翹)
  const g = new THREE.BufferGeometry();
  const r = 0.12;
  const v = [
    -w / 2, 0, -d / 2, w / 2, 0, -d / 2, w / 2, 0, d / 2, -w / 2, 0, d / 2,
    -w * r, h, 0, w * r, h, 0
  ];
  const idx = [0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 3, 5, 4, 3, 4, 0];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

export function buildLandmarks(scene, { skipNanshan = false } = {}) {
  const root = new THREE.Group();
  root.name = 'landmarks';
  const place = (obj, x, z) => { obj.position.set(x, terrainHeight(x, z), z); root.add(obj); return obj; };

  // 國父紀念館:黃色琉璃瓦大屋頂(四角上揚、正面中央高高翹起的飛簷)、灰白列柱、前方水池廣場
  place(buildSunYatSen(), GEO.sunYatSen.x, GEO.sunYatSen.z);
  // 台北大巨蛋:白色橢圓頂、灰色直條外牆、西南側入口的格柵天篷
  place(buildDome(), GEO.dome.x, GEO.dome.z);
  // 陶朱隱園:21 層、每層旋轉 4.5° 的雙螺旋綠建築,中央玻璃核心筒,頂樓停機坪
  place(buildTaoZhu(), GEO.taozhu.x, GEO.taozhu.z);
  // 南山廣場(272m,錯落的「雙手」造型簡化為退縮塔);有真實街景資料時由資料建出
  if (!skipNanshan) {
    const g = new THREE.Group();
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x8aa6b8, metalness: 0.7, roughness: 0.12, envMapIntensity: 1.3 });
    const fins = std(0xd7d9da, 0.4, 0.5);
    const body = new THREE.Mesh(new THREE.BoxGeometry(56, 250, 46), glass);
    body.position.y = 125;
    g.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(40, 22, 32), glass);
    top.position.set(6, 261, 0);
    g.add(top);
    for (let i = -3; i <= 3; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(1.5, 250, 47), fins);
      f.position.set(i * 8, 125, 0);
      g.add(f);
    }
    g.traverse((m) => { m.castShadow = true; });
    place(g, GEO.nanshan.x, GEO.nanshan.z);
  }
  // 新光摩天大樓(244m,台北車站前)
  {
    const g = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x5b6b5e, metalness: 0.6, roughness: 0.18 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(60, 230, 40), mat);
    body.position.y = 115;
    g.add(body);
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 236, 24, 1, false, 0, Math.PI), mat);
      wing.position.set(s * 30, 118, 0);
      wing.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      g.add(wing);
    }
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.2, 14, 8), std(0xcccccc, 0.4, 0.8));
    ant.position.y = 243;
    g.add(ant);
    // 台北車站(大屋頂)
    const st = new THREE.Mesh(new THREE.BoxGeometry(190, 26, 130), std(0xd8cfbd, 0.8));
    st.position.set(GEO.station.x - GEO.shinkong.x, 13, GEO.station.z - GEO.shinkong.z);
    g.add(st);
    const roof = hipRoof(206, 146, 18, std(0x6b7d5a, 0.6));
    roof.position.set(GEO.station.x - GEO.shinkong.x, 26, GEO.station.z - GEO.shinkong.z);
    g.add(roof);
    place(g, GEO.shinkong.x, GEO.shinkong.z);
  }
  // 中正紀念堂:白牆、藍色八角屋頂
  {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(76, 18, 76), std(0xf2f0eb, 0.6));
    base.position.y = 9;
    g.add(base);
    const hall = new THREE.Mesh(new THREE.CylinderGeometry(30, 34, 30, 8), std(0xf4f3ef, 0.6));
    hall.position.y = 33;
    hall.rotation.y = Math.PI / 8;
    g.add(hall);
    const r1 = new THREE.Mesh(new THREE.ConeGeometry(42, 14, 8), std(0x2a4c9a, 0.4, 0.2));
    r1.position.y = 55; r1.rotation.y = Math.PI / 8;
    g.add(r1);
    const r2 = new THREE.Mesh(new THREE.ConeGeometry(28, 16, 8), std(0x2a4c9a, 0.4, 0.2));
    r2.position.y = 68; r2.rotation.y = Math.PI / 8;
    g.add(r2);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), std(0xd8b04a, 0.3, 1));
    tip.position.y = 77;
    g.add(tip);
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(500, 600), std(0xc9c3b6, 0.9));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(-100, 0.06, 0);
    g.add(plaza);
    place(g, GEO.cks.x, GEO.cks.z);
  }
  // 圓山大飯店:山坡上的紅柱黃瓦宮殿
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(150, 40, 34), std(0xa8261e, 0.6));
    body.position.y = 20;
    g.add(body);
    for (let i = 0; i < 3; i++) {
      const roof = hipRoof(170 - i * 50, 50 - i * 8, 14, std(0xd99a28, 0.45, 0.2));
      roof.position.y = 40 + i * 12;
      g.add(roof);
    }
    const x = GEO.grandHotel.x, z = GEO.grandHotel.z;
    place(g, x, z).position.y = Math.max(40, terrainHeight(x, z));
    const hill = new THREE.Mesh(new THREE.SphereGeometry(380, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0x2f4a2a, 1));
    hill.scale.y = 0.12;
    hill.position.set(x, 0, z);
    root.add(hill);
  }
  // 松山機場跑道
  {
    const g = new THREE.Group();
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(2600, 60), std(0x2c2e30, 0.9));
    rw.rotation.x = -Math.PI / 2;
    rw.position.y = 0.1;
    g.add(rw);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(3000, 360), std(0x5f7b46, 1));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = 0.07;
    g.add(grass);
    for (let x = -1250; x < 1250; x += 60) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(30, 1.2), std(0xffffff, 0.8));
      l.rotation.x = -Math.PI / 2;
      l.position.set(x, 0.12, 0);
      g.add(l);
    }
    const term = new THREE.Mesh(new THREE.BoxGeometry(300, 24, 60), std(0xd7d7d2, 0.6));
    term.position.set(-600, 12, 150);
    g.add(term);
    g.rotation.y = -0.17; // 跑道約 100°/280°
    place(g, GEO.airport.x, GEO.airport.z);
  }
  scene.add(root);
  return root;
}

// ───────────── 國父紀念館 ─────────────
function buildSunYatSen() {
  const g = new THREE.Group();
  const R = 58; // 屋簷半寬
  // 琉璃瓦貼圖(一列列瓦溝)
  const tileTex = canvasTex(256, 256, (c, W, H) => {
    c.fillStyle = '#e0a63a'; c.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 8) { c.fillStyle = 'rgba(120,70,10,0.35)'; c.fillRect(x, 0, 2, H); c.fillStyle = 'rgba(255,230,150,0.25)'; c.fillRect(x + 3, 0, 2, H); }
    for (let y = 0; y < H; y += 16) { c.fillStyle = 'rgba(120,70,10,0.18)'; c.fillRect(0, y, W, 2); }
  });
  tileTex.repeat.set(10, 10);
  // 屋頂:高度場(四坡 + 四角上揚 + 正面中央飛簷高翹 + 頂部平台)
  const seg = 80;
  const roofGeo = new THREE.PlaneGeometry(2 * R, 2 * R, seg, seg);
  roofGeo.rotateX(-Math.PI / 2);
  const p = roofGeo.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const ax = Math.abs(x) / R, az = Math.abs(z) / R;
    const m = Math.max(ax, az);
    let y = 14 * (1 - m) ** 0.9; // 四坡
    const corner = Math.min(ax, az) ** 5;
    y += 4.5 * m ** 6 * corner; // 四角上揚
    if (z > 0) y += 9 * Math.max(0, 1 - Math.abs(x) / (R * 0.42)) ** 1.6 * az ** 4; // 正面(南)中央飛簷
    const top = 9.5;
    const flat = y > top && m < 0.42;
    if (flat) y = top + 0.4;
    p.setY(i, y);
    const brown = flat || (m < 0.46 && y > top - 1);
    col.set(brown ? [0.62, 0.32, 0.18] : [1, 1, 1], i * 3);
  }
  roofGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  roofGeo.computeVertexNormals();
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ map: tileTex, vertexColors: true, roughness: 0.45, metalness: 0.15, side: THREE.DoubleSide }));
  roof.position.y = 21;
  roof.castShadow = roof.receiveShadow = true;
  g.add(roof);
  // 屋簷下的封簷板
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(2 * R - 2, 1.4, 2 * R - 2), new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.6 }));
  fascia.position.y = 20.6;
  g.add(fascia);
  // 台基、牆、列柱
  const stone = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.7 });
  const pillar = new THREE.MeshStandardMaterial({ color: 0xb8b6b0, roughness: 0.55 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(124, 2.4, 124), stone);
  base.position.y = 1.2;
  base.receiveShadow = true;
  g.add(base);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(84, 18, 84), new THREE.MeshStandardMaterial({ color: 0xc8c2b4, roughness: 0.8 }));
  wall.position.y = 11.4;
  g.add(wall);
  const n = 14;
  for (let k = 0; k < n; k++) {
    const t = -45 + (90 * k) / (n - 1);
    for (const [x, z] of [[t, 47], [t, -47], [47, t], [-47, t]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(2.4, 18, 2.4), pillar);
      c.position.set(x, 11.4, z);
      c.castShadow = true;
      g.add(c);
    }
  }
  // 正面台階
  for (let s = 0; s < 6; s++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(60, 0.4, 2), stone);
    st.position.set(0, 2.2 - s * 0.4, 63 + s * 2);
    g.add(st);
  }
  // 前方廣場:鋪面、長水池、綠地與樹籬
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(300, 240), new THREE.MeshStandardMaterial({ color: 0xb9b5ab, roughness: 0.9 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.08, 90);
  plaza.receiveShadow = true;
  g.add(plaza);
  const pool = new THREE.Mesh(new THREE.BoxGeometry(46, 0.6, 18), new THREE.MeshStandardMaterial({ color: 0x3f8fa8, roughness: 0.08, metalness: 0.3 }));
  pool.position.set(0, 0.3, 150);
  g.add(pool);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(50, 0.5, 22), stone);
  rim.position.set(0, 0.2, 150);
  g.add(rim);
  for (const sx of [-1, 1]) {
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(80, 120), new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 1 }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(sx * 95, 0.1, 120);
    g.add(lawn);
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(70, 1.2, 1.6), new THREE.MeshStandardMaterial({ color: 0x2f5a2c, roughness: 1 }));
    hedge.position.set(sx * 95, 0.6, 62);
    g.add(hedge);
  }
  return g;
}

// ───────────── 台北大巨蛋 ─────────────
function buildDome() {
  const g = new THREE.Group();
  const RX = 110, RZ = 82, WALL = 26;
  const finTex = canvasTex(512, 64, (c, W, H) => {
    c.fillStyle = '#9ea2a3'; c.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 6) { c.fillStyle = x % 12 ? '#b9bdbe' : '#7f8485'; c.fillRect(x, 0, 3, H); }
  });
  finTex.repeat.set(20, 1);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, WALL, 96, 1, true), new THREE.MeshStandardMaterial({ map: finTex, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }));
  wall.scale.set(RX, 1, RZ);
  wall.position.y = WALL / 2;
  wall.castShadow = wall.receiveShadow = true;
  g.add(wall);
  // 白色完整橢圓頂(沒有開口)
  const roof = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf4f5f4, roughness: 0.35, metalness: 0.1 }));
  roof.scale.set(RX + 6, 24, RZ + 6);
  roof.position.y = WALL - 1;
  roof.castShadow = roof.receiveShadow = true;
  g.add(roof);
  const eave = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 128), new THREE.MeshStandardMaterial({ color: 0xe7e9e8, roughness: 0.4 }));
  eave.scale.set(RX + 6, RZ + 6, 60);
  eave.rotation.x = Math.PI / 2;
  eave.position.y = WALL - 0.6;
  g.add(eave);
  // 西南入口的格柵天篷(三角網格的曲面)
  const latTex = canvasTex(256, 256, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.strokeStyle = '#d8dcdd'; c.lineWidth = 5;
    for (let i = -W; i < 2 * W; i += 32) {
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i + H * 0.58, H); c.stroke();
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i - H * 0.58, H); c.stroke();
    }
    for (let y = 0; y < H; y += 28) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  });
  latTex.repeat.set(10, 2);
  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.12, 1, 64, 4, true, Math.PI * 1.05, Math.PI * 0.55), new THREE.MeshStandardMaterial({ map: latTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }));
  canopy.scale.set(RX + 18, 22, RZ + 18);
  canopy.position.y = 11;
  g.add(canopy);
  // 外圍廣場
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: 0xbdb8ae, roughness: 0.9 }));
  plaza.scale.set(RX + 40, RZ + 40, 1);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.07;
  g.add(plaza);
  return g;
}

// ───────────── 陶朱隱園 ─────────────
function buildTaoZhu() {
  const g = new THREE.Group();
  const floors = 21, FH2 = 4.2, base = 6;
  // 樓板外形:兩端圓弧的長形(每層旋轉 4.5°,共 90°)
  const plate = (L, W) => {
    const s = new THREE.Shape();
    const r = W / 2, hl = L / 2 - r;
    s.absarc(hl, 0, r, -Math.PI / 2, Math.PI / 2, false);
    s.absarc(-hl, 0, r, Math.PI / 2, Math.PI * 1.5, false);
    return s;
  };
  const slabMat = new THREE.MeshStandardMaterial({ color: 0xf1f0ec, roughness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1f3c52, roughness: 0.08, metalness: 0.8 });
  const green = new THREE.MeshStandardMaterial({ color: 0x4f7d3a, roughness: 1 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.5 });
  const slabGeo = new THREE.ExtrudeGeometry(plate(46, 24), { depth: 0.6, bevelEnabled: false, curveSegments: 16 });
  slabGeo.rotateX(-Math.PI / 2);
  const glassGeo = new THREE.ExtrudeGeometry(plate(38, 17), { depth: FH2 - 0.6, bevelEnabled: false, curveSegments: 16 });
  glassGeo.rotateX(-Math.PI / 2);
  const railGeo = new THREE.ExtrudeGeometry(plate(46, 24), { depth: 1.1, bevelEnabled: false, curveSegments: 16 });
  railGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < floors; i++) {
    const fl = new THREE.Group();
    const y = base + i * FH2;
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.castShadow = slab.receiveShadow = true;
    fl.add(slab);
    const gl = new THREE.Mesh(glassGeo, glassMat);
    gl.position.y = 0.6;
    fl.add(gl);
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.y = 0.6;
    rail.scale.set(0.99, 1, 0.97);
    fl.add(rail);
    // 陽台綠化(沿兩端圓弧)
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const side = Math.cos(a) > 0 ? 1 : -1;
      const px = side * 11 + Math.cos(a) * 10.5, pz = Math.sin(a) * 10.5;
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.9 + (k % 3) * 0.3, 8, 6), green);
      bush.position.set(px, 1.3, pz);
      bush.scale.y = 0.8;
      fl.add(bush);
    }
    fl.position.y = y;
    fl.rotation.y = THREE.MathUtils.degToRad(4.5 * i);
    g.add(fl);
  }
  // 中央玻璃核心筒(菱格紋)
  const coreTex = canvasTex(256, 512, (c, W, H) => {
    c.fillStyle = '#1d4f78'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(160,200,230,0.6)'; c.lineWidth = 2;
    for (let i = -H; i < W + H; i += 24) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + H * 0.5, H); c.stroke(); c.beginPath(); c.moveTo(i, 0); c.lineTo(i - H * 0.5, H); c.stroke(); }
  });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, floors * FH2 + base, 32), new THREE.MeshStandardMaterial({ map: coreTex, roughness: 0.1, metalness: 0.7 }));
  core.position.y = (floors * FH2 + base) / 2;
  g.add(core);
  // 頂樓:白色放射狀屋頂 + 圓形停機坪
  const topY = base + floors * FH2;
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(plate(50, 26), { depth: 1.2, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.8, curveSegments: 20 }), slabMat);
  roof.geometry.rotateX(-Math.PI / 2);
  roof.position.y = topY;
  roof.rotation.y = THREE.MathUtils.degToRad(4.5 * floors);
  g.add(roof);
  const padTex = canvasTex(256, 256, (c, W, H) => {
    c.fillStyle = '#9aa0a3'; c.beginPath(); c.arc(128, 128, 126, 0, 7); c.fill();
    c.strokeStyle = '#ffffff'; c.lineWidth = 8; c.beginPath(); c.arc(128, 128, 96, 0, 7); c.stroke();
    c.fillStyle = '#ffffff'; c.font = '700 120px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', 128, 136);
  }, { repeat: false });
  const pad = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.7 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = topY + 1.75;
  g.add(pad);
  // 底座
  const podium = new THREE.Mesh(new THREE.CylinderGeometry(20, 22, base, 40), glassMat);
  podium.position.y = base / 2;
  g.add(podium);
  return g;
}
