// 台北101 外觀(程序化):鋸齒內縮轉角的正方形斷面,基座內收、8 節竹節外擴、塔頂、頂冠、塔尖。
import * as THREE from 'three';
import { towerSections, BASE_TOP, SEG_COUNT, SEG_H, TOP_Y, ROOF_Y, CROWN_Y, SPIRE_TOP, SEG_HW0, SEG_HW1, BASE_HW1, TOP_HW0, TOP_HW1, halfWidthAt } from '../config.js';
import { facadeTextures } from './textures.js';

/** 斷面多邊形:正方形四角各兩階鋸齒(101 的「竹節」轉角)。回傳 [[x,z],...]。 */
export function towerPolygon(h, notch = 0.11) {
  const s = h * notch;
  const corner = [[h, h - 2 * s], [h - s, h - 2 * s], [h - s, h - s], [h - 2 * s, h - s], [h - 2 * s, h]];
  const pts = [];
  for (let k = 0; k < 4; k++) {
    for (const [x, z] of corner) {
      let px = x, pz = z;
      for (let r = 0; r < k; r++) [px, pz] = [-pz, px];
      pts.push([px, pz]);
    }
  }
  return pts;
}

/** 兩個斷面之間的側面(平面著色、外法線)。uvScale:貼圖一張代表的公尺數 [寬, 高]。 */
export function frustumGeometry(y0, h0, y1, h1, { notch = 0.11, uvScale = [6, 8.6], vOffset = 0, inward = false } = {}) {
  const A = towerPolygon(h0, notch), B = towerPolygon(h1, notch);
  const pos = [], uv = [];
  let uA = 0, uB = 0;
  const n = A.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a0 = A[i], a1 = A[j], b0 = B[i], b1 = B[j];
    const la = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
    const lb = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]);
    const v0 = (y0 - vOffset) / uvScale[1], v1 = (y1 - vOffset) / uvScale[1];
    const quad = [
      [a0[0], y0, a0[1], uA / uvScale[0], v0],
      [a1[0], y0, a1[1], (uA + la) / uvScale[0], v0],
      [b1[0], y1, b1[1], (uB + lb) / uvScale[0], v1],
      [b0[0], y1, b0[1], uB / uvScale[0], v1]
    ];
    // 判斷外法線方向
    const e1 = new THREE.Vector3(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1], quad[1][2] - quad[0][2]);
    const e2 = new THREE.Vector3(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1], quad[3][2] - quad[0][2]);
    const nrm = e1.clone().cross(e2);
    const mid = new THREE.Vector3((a0[0] + a1[0]) / 2, 0, (a0[1] + a1[1]) / 2);
    let tris = [0, 1, 2, 0, 2, 3];
    if ((nrm.dot(mid) < 0) !== inward) tris = [0, 2, 1, 0, 3, 2];
    for (const t of tris) {
      const q = quad[t];
      pos.push(q[0], q[1], q[2]);
      uv.push(q[3], q[4]);
    }
    uA += la; uB += lb;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** 水平環狀面(外框 hwOut、內孔 hwIn)。up=true 法線朝上。 */
export function ringGeometry(y, hwOut, hwIn, up = true, notch = 0.11) {
  const shape = new THREE.Shape();
  const sgn = up ? -1 : 1;
  const out = towerPolygon(hwOut, notch);
  shape.moveTo(out[0][0], sgn * out[0][1]);
  for (const p of out.slice(1)) shape.lineTo(p[0], sgn * p[1]);
  if (hwIn > 0) {
    const inn = towerPolygon(hwIn, notch);
    const hole = new THREE.Path();
    hole.moveTo(inn[0][0], sgn * inn[0][1]);
    for (const p of inn.slice(1)) hole.lineTo(p[0], sgn * p[1]);
    shape.holes.push(hole);
  }
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
  g.translate(0, y, 0);
  // ShapeGeometry 在 up 時繞序反轉,修正法線方向
  const idx = g.index.array;
  const nrm = g.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, up ? 1 : -1, 0);
  const p = g.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  if (idx.length) {
    a.fromBufferAttribute(p, idx[0]); b.fromBufferAttribute(p, idx[1]); c.fromBufferAttribute(p, idx[2]);
    const n = b.sub(a).cross(c.sub(a));
    if ((n.y > 0) !== up) {
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    }
  }
  return g;
}

export function buildTower(envMap) {
  const group = new THREE.Group();
  group.name = 'tower';
  const fx = facadeTextures();
  const glass = new THREE.MeshPhysicalMaterial({
    map: fx.map,
    roughnessMap: fx.rough,
    roughness: 1,
    metalness: 0.55,
    envMapIntensity: 1.25,
    emissive: new THREE.Color(0xffe2b0),
    emissiveMap: fx.emissive,
    emissiveIntensity: 0,
    clearcoat: 0.4,
    clearcoatRoughness: 0.08
  });
  const metal = new THREE.MeshStandardMaterial({ color: 0xbfc8cb, metalness: 0.85, roughness: 0.32 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x5c6668, metalness: 0.8, roughness: 0.4 });
  const ledge = new THREE.MeshStandardMaterial({ color: 0x9aa4a6, metalness: 0.4, roughness: 0.55 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a94a, metalness: 1, roughness: 0.28 });
  const lightBand = new THREE.MeshStandardMaterial({ color: 0x8f9a9c, emissive: new THREE.Color(0x66ffd9), emissiveIntensity: 0, metalness: 0.5, roughness: 0.4 });
  const mats = { glass, metal, darkMetal, ledge, gold, lightBand };

  const add = (geo, mat, cast = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  const secs = towerSections();
  for (const s of secs) {
    const notch = s.name === '頂冠' ? 0.08 : 0.11;
    add(frustumGeometry(s.y0, s.hw0, s.y1, s.hw1, { notch }), glass);
  }

  // 各段交界的平台(上方水平面)與挑出底面
  // 基座頂 → 第 1 節
  add(ringGeometry(BASE_TOP, BASE_HW1, SEG_HW0, true), ledge);
  for (let k = 0; k < SEG_COUNT; k++) {
    const yTop = BASE_TOP + (k + 1) * SEG_H;
    const yBot = BASE_TOP + k * SEG_H;
    const nextHw = k === SEG_COUNT - 1 ? TOP_HW0 : SEG_HW0;
    add(ringGeometry(yTop, SEG_HW1 + 0.35, nextHw, true), ledge);
    add(ringGeometry(yTop - 1.1, SEG_HW1 + 0.35, SEG_HW1 - 0.2, false), darkMetal);
    // 頂部飾帶(斗拱意象的挑簷)
    add(frustumGeometry(yTop - 1.1, SEG_HW1 + 0.35, yTop, SEG_HW1 + 0.35, { uvScale: [4, 1.1] }), metal);
    // 夜間燈帶
    add(frustumGeometry(yTop - 1.6, SEG_HW1 + 0.05, yTop - 1.1, SEG_HW1 + 0.25, { uvScale: [4, 1] }), lightBand);
    // 每節底部的窗台線
    add(frustumGeometry(yBot, SEG_HW0 + 0.25, yBot + 0.5, SEG_HW0 + 0.3, { uvScale: [4, 1] }), darkMetal);
    // 轉角的龍形飾物(簡化成捲雲)
    for (let c = 0; c < 4; c++) {
      const ang = c * Math.PI / 2 + Math.PI / 4;
      const r = (SEG_HW1 - SEG_HW1 * 0.11) * Math.SQRT2 + 0.4;
      const orn = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.28, 8, 16, Math.PI * 1.5), gold);
      orn.position.set(Math.cos(ang) * r, yTop - 2.2, Math.sin(ang) * r);
      orn.rotation.y = -ang + Math.PI / 2;
      group.add(orn);
    }
  }
  add(ringGeometry(ROOF_Y, TOP_HW1, TOP_HW1 - 1, true), ledge);
  add(ringGeometry(CROWN_Y, 8, 0, true, 0.08), darkMetal);
  // 91F 室外觀景台欄杆
  {
    const railMat = new THREE.MeshStandardMaterial({ color: 0x8b969a, metalness: 0.7, roughness: 0.35, transparent: true, opacity: 0.9 });
    const pts = towerPolygon(17.5);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), railMat);
      rail.position.set((a[0] + b[0]) / 2, TOP_Y + 1.15, (a[1] + b[1]) / 2);
      rail.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      group.add(rail);
    }
  }

  // 如意紋(四面,27F 附近)
  const lean = Math.atan((SEG_HW1 - SEG_HW0) / SEG_H);
  for (let k = 0; k < 4; k++) {
    const ang = k * Math.PI / 2;
    const y = BASE_TOP + 7;
    const hw = halfWidthAt(y) + 0.45;
    const o = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.5, 48), gold);
    disc.rotation.x = Math.PI / 2;
    o.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.35, 12, 48), gold);
    o.add(ring);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.6, 32), new THREE.MeshStandardMaterial({ color: 0x23484c, metalness: 0.6, roughness: 0.3 }));
    hole.rotation.x = Math.PI / 2;
    o.add(hole);
    for (let i = 0; i < 4; i++) {
      const lobe = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.22, 8, 24), gold);
      const a = i * Math.PI / 2 + Math.PI / 4;
      lobe.position.set(Math.cos(a) * 2.7, Math.sin(a) * 2.7, 0.25);
      o.add(lobe);
    }
    o.position.set(Math.sin(ang) * hw, y, Math.cos(ang) * hw);
    o.rotation.y = ang;
    o.rotateX(lean);
    group.add(o);
  }

  // 塔尖
  const spireMat = new THREE.MeshStandardMaterial({ color: 0xc9d1d4, metalness: 0.9, roughness: 0.25 });
  const spire = [
    [CROWN_Y, 3.6, 3.2, 10],
    [CROWN_Y + 10, 2.8, 2.5, 14],
    [CROWN_Y + 24, 1.9, 1.6, 14],
    [CROWN_Y + 38, 1.1, 0.8, 12],
    [CROWN_Y + 50, 0.45, 0.12, SPIRE_TOP - CROWN_Y - 50]
  ];
  for (const [y, r0, r1, h] of spire) {
    const m = add(new THREE.CylinderGeometry(r1, r0, h, 24), spireMat, true);
    m.position.y = y + h / 2;
    const collar = add(new THREE.CylinderGeometry(r0 + 0.35, r0 + 0.35, 0.6, 24), darkMetal);
    collar.position.y = y + 0.3;
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  beacon.position.y = SPIRE_TOP + 0.2;
  group.add(beacon);

  // 頂冠上的天線平台
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const fin = add(new THREE.BoxGeometry(0.4, 6, 3), darkMetal);
    fin.position.set(Math.sin(a) * 5, CROWN_Y + 3, Math.cos(a) * 5);
    fin.rotation.y = a;
  }

  group.userData = { mats, beacon };
  return group;
}

/** 購物中心裙樓(北側)+ 廣場。 */
export function buildPodium() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0xd2ccc0, roughness: 0.75 });
  const glassBand = new THREE.MeshPhysicalMaterial({ color: 0x35585c, metalness: 0.6, roughness: 0.1, envMapIntensity: 1.2 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8d9390, roughness: 0.8 });

  const W = 150, D = 80, H = 30, z0 = -30;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), stone);
  body.position.set(0, H / 2, z0 - D / 2);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  for (let i = 0; i < 5; i++) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 2.4, D + 0.4), glassBand);
    band.position.set(0, 4 + i * 5.6, z0 - D / 2);
    g.add(band);
  }
  // 弧形屋頂
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, W - 10, 48, 1, false, -0.5, 1), roofMat);
  roof.rotation.z = Math.PI / 2;
  roof.position.set(0, H - 58, z0 - D / 2);
  roof.castShadow = true;
  g.add(roof);
  // 入口雨遮(東、西)
  for (const sx of [-1, 1]) {
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(14, 0.6, 18), glassBand);
    canopy.position.set(sx * (W / 2 + 7), 6, z0 - 20);
    g.add(canopy);
  }
  return g;
}
