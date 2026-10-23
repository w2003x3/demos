// 台北地標(簡化模型,位置依 101 為原點的大致方位與距離;北 = -Z、東 = +X)。
import * as THREE from 'three';
import { terrainHeight } from './environment.js';

import { GEO } from './geo.js';

const box = (c, w, d, h, name) => [c.x - w / 2, c.z - d / 2, c.x + w / 2, c.z + d / 2, h, name];
// 城市產生器要避開的範圍 [x0, z0, x1, z1]
export function landmarkZones() {
  const G = GEO;
  return [
    box(G.sunYatSen, 460, 520, 0), box(G.dome, 340, 300, 0), box(G.nanshan, 120, 100, 0),
    box(G.shinkong, 240, 200, 0), box(G.station, 260, 200, 0), box(G.cks, 650, 700, 0),
    [G.airport.x - 1700, G.airport.z - 260, G.airport.x + 1700, G.airport.z + 260]
  ].map((b) => b.slice(0, 4));
}
// 碰撞用的大致外形 [x0, z0, x1, z1, 高度, 名稱]
export function landmarkSolids() {
  const G = GEO;
  return [
    box(G.sunYatSen, 124, 124, 42, '國父紀念館'),
    box(G.dome, 300, 256, 46, '台北大巨蛋'),
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

  // 國父紀念館:黃色大屋頂、紅柱、白牆,前有廣場
  {
    const g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(100, 18, 100), std(0xe9e2d2, 0.8));
    wall.position.y = 9;
    g.add(wall);
    for (let i = 0; i < 14; i++) {
      for (const s of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(2, 18, 2), std(0x9e2a22, 0.6));
        c.position.set(-48 + i * 7.4, 9, s * 51);
        g.add(c);
      }
    }
    const roof = hipRoof(124, 124, 22, std(0xd8a838, 0.45, 0.2));
    roof.position.y = 18;
    g.add(roof);
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(420, 460), std(0xbab3a4, 0.9));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.06, 20);
    g.add(plaza);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(380, 140), std(0x4f7a3a, 1));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(0, 0.08, 150);
    g.add(lawn);
    place(g, GEO.sunYatSen.x, GEO.sunYatSen.z);
  }
  // 台北大巨蛋
  {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(160, 48, 16, 0, Math.PI * 2, 0, 0.62), std(0xd9dde0, 0.35, 0.3));
    dome.scale.set(1, 1.0, 0.85);
    dome.position.y = -110;
    const g = new THREE.Group();
    g.add(dome);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(150, 150, 22, 48, 1, true), std(0x9aa3a8, 0.5, 0.4));
    ring.scale.z = 0.85;
    ring.position.y = 11;
    g.add(ring);
    place(g, GEO.dome.x, GEO.dome.z);
  }
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
