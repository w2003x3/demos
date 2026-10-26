// 台北101 外觀(程序化):鋸齒內縮轉角的正方形斷面,基座內收、8 節竹節外擴、塔頂、頂冠、塔尖。
import * as THREE from 'three';
import { towerSections, BASE_TOP, SEG_COUNT, SEG_H, TOP_Y, ROOF_Y, CROWN_Y, SPIRE_TOP, SEG_HW0, SEG_HW1, BASE_HW1, TOP_HW0, TOP_HW1, halfWidthAt, floorY, FH } from '../config.js?v=6ba67c5';
import { facadeTextures, canvasTex } from './textures.js?v=6ba67c5';
import { applyInterior } from './interior.js?v=6ba67c5';

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
  const per = (P) => P.reduce((s, p, i) => s + Math.hypot(P[(i + 1) % P.length][0] - p[0], P[(i + 1) % P.length][1] - p[1]), 0);
  const PA = per(A), PB = per(B);
  // 整圈的貼圖張數固定,上下端依同一比例對應 → 直料沿著實際的面板線
  const Nu = Math.max(1, Math.round((PA + PB) / 2 / uvScale[0]));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a0 = A[i], a1 = A[j], b0 = B[i], b1 = B[j];
    const la = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
    const lb = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]);
    const v0 = (y0 - vOffset) / uvScale[1], v1 = (y1 - vOffset) / uvScale[1];
    const quad = [
      [a0[0], y0, a0[1], (uA / PA) * Nu, v0],
      [a1[0], y0, a1[1], ((uA + la) / PA) * Nu, v0],
      [b1[0], y1, b1[1], ((uB + lb) / PB) * Nu, v1],
      [b0[0], y1, b0[1], (uB / PB) * Nu, v1]
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
  // 玻璃帷幕:深綠藍色的反射玻璃 + 鋁擠型直料;室內有燈就透出(室內映射),沒燈就反射外界
  const glass = new THREE.MeshPhysicalMaterial({
    map: fx.map,
    roughnessMap: fx.rough,
    roughness: 1,
    metalness: 0.82,
    envMapIntensity: 1.6,
    emissive: new THREE.Color(0xffe2b0),
    emissiveIntensity: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.05
  });
  // 頂冠的百葉外牆
  const louverTex = canvasTex(128, 256, (g, W, H) => {
    g.fillStyle = '#9aa3a6'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 8) { g.fillStyle = '#6f777a'; g.fillRect(0, y, W, 3); g.fillStyle = '#c4cbcd'; g.fillRect(0, y + 3, W, 1); }
    g.fillStyle = '#4c5457'; g.fillRect(0, 0, 4, H); g.fillRect(W - 4, 0, 4, H);
  });
  const louver = new THREE.MeshStandardMaterial({ map: louverTex, metalness: 0.75, roughness: 0.35, emissive: 0xffe2b0, emissiveIntensity: 0 });
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
  const sections = [];
  secs.forEach((s, i) => {
    const crown = s.name === '頂冠';
    const notch = crown ? 0.08 : 0.11;
    let m;
    if (crown) m = louver;
    else {
      m = glass.clone();
      // 每格 = 3m 寬(兩片玻璃)× 1 層樓;窗間牆在每層頂部 14%
      applyInterior(m, { cells: [4, 2], win: [0.025, 0.975, 0.0, 0.855], depth: 1.6, lit: 0.3, seed: i + 1 });
    }
    if (crown) {
      // 頂冠:兩段階梯狀的百葉箱(照片中 101F 以上的灰白色量體)
      const mid = (s.y0 + s.y1) / 2;
      add(frustumGeometry(s.y0, s.hw0, mid, s.hw0 - 0.2, { notch, uvScale: [3, 4] }), m);
      add(ringGeometry(mid, s.hw0 - 0.2, s.hw1, true, notch), ledge);
      add(frustumGeometry(mid, s.hw1, s.y1, s.hw1 - 0.2, { notch, uvScale: [3, 4] }), m);
    } else add(frustumGeometry(s.y0, s.hw0, s.y1, s.hw1, { notch, uvScale: [6, 8.6] }), m);
    sections.push({ name: s.name, seg: s.seg || 0, glass: m, band: null });
  });

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
    // 夜間燈帶(每節獨立,跨年倒數用)
    const band = lightBand.clone();
    add(frustumGeometry(yTop - 1.6, SEG_HW1 + 0.05, yTop - 1.1, SEG_HW1 + 0.25, { uvScale: [4, 1] }), band);
    sections[k + 1].band = band;
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
  add(ringGeometry(ROOF_Y, TOP_HW1 + 0.4, 10.6, true), ledge);
  add(ringGeometry(CROWN_Y, 8.4, 0, true, 0.08), darkMetal);
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

  const beacon = buildTop(group, { metal, darkMetal, ledge });

  group.userData = { ...group.userData, mats, beacon, sections };
  return group;
}

/**
 * 塔頂(依實景照片):91F 環狀簷與天線架、92~101F 挑簷與轉角如意紋、
 * 百葉頂冠上的圓形碟盤、八角錐形塔尖、環形維修走道與爬梯、不鏽鋼圓頂與航空警示燈。
 */
function buildTop(group, { metal, darkMetal, ledge }) {
  const add = (geo, mat, x = 0, y = 0, z = 0, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; group.add(m); return m; };
  const steel = new THREE.MeshStandardMaterial({ color: 0xd9dee0, metalness: 1, roughness: 0.18 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8eceb, metalness: 0.5, roughness: 0.35 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x8d9597, metalness: 0.7, roughness: 0.4 });
  // 塔尖外板(白灰色金屬板,格線)
  const panelTex = canvasTex(128, 512, (g, W, H) => {
    g.fillStyle = '#dfe3e2'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 0; y < H; y += 32) g.fillRect(0, y, W, 2);
    for (let x = 0; x < W; x += 32) g.fillRect(x, 0, 2, H);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 0, W, 1);
  });
  const panel = new THREE.MeshStandardMaterial({ map: panelTex, metalness: 0.55, roughness: 0.32 });
  const mastTex = canvasTex(128, 256, (g, W, H) => {
    g.fillStyle = '#b7bec0'; g.fillRect(0, 0, W, H);
    // 百葉窗與維修門
    g.fillStyle = '#5d6669';
    for (let y = 20; y < H; y += 64) { for (let k = 0; k < 6; k++) g.fillRect(16, y + k * 5, 40, 2); }
    g.fillStyle = 'rgba(0,0,0,0.2)'; for (let x = 0; x < W; x += 32) g.fillRect(x, 0, 2, H);
  });
  const mast = new THREE.MeshStandardMaterial({ map: mastTex, metalness: 0.6, roughness: 0.35 });

  // ── 91F 戶外觀景台:環繞塔身的圓形環狀簷(照片俯視可見)──
  const ringY = TOP_Y + 0.2;
  add(new THREE.CylinderGeometry(19.6, 19.8, 2.4, 64, 1, true), grey, 0, ringY + 1.2, 0);
  const ringTop = add(new THREE.RingGeometry(TOP_HW0 + 0.4, 19.6, 64), ledge, 0, ringY + 2.4, 0);
  ringTop.rotation.x = -Math.PI / 2;
  const ringIn = add(new THREE.CylinderGeometry(19.2, 19.2, 2.0, 64, 1, true), darkMetal, 0, ringY + 1.2, 0);
  ringIn.material = darkMetal;
  add(new THREE.TorusGeometry(19.7, 0.12, 6, 96), steel, 0, ringY + 2.45, 0).rotation.x = Math.PI / 2;
  // 四角的格柵天線架
  for (let c = 0; c < 4; c++) {
    const a = c * Math.PI / 2 + Math.PI / 4;
    const cx = Math.cos(a) * 29, cz = Math.sin(a) * 29;
    const rack = new THREE.Group();
    const bar = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), grey); m.position.set(x, y, z); rack.add(m); };
    for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) bar(0.18, 6, 0.18, px, 3, pz);
    for (let y = 0.5; y <= 6; y += 1.1) { bar(4.2, 0.1, 0.1, 0, y, -2); bar(4.2, 0.1, 0.1, 0, y, 2); bar(0.1, 0.1, 4.2, -2, y, 0); bar(0.1, 0.1, 4.2, 2, y, 0); }
    for (let x = -1.5; x <= 1.5; x += 0.75) { bar(0.06, 6, 0.06, x, 3, -2); bar(0.06, 6, 0.06, x, 3, 2); }
    rack.position.set(cx * 0.82, TOP_Y, cz * 0.82);
    rack.rotation.y = -a;
    group.add(rack);
  }

  // ── 92~101F:每層挑簷 + 轉角如意紋 ──
  for (let n = 92; n <= 101; n++) {
    const y = floorY(n);
    const hw = halfWidthAt(y) + 0.35;
    add(frustumGeometry(y - 0.3, hw, y, hw, { uvScale: [4, 1] }), metal, 0, 0, 0, false);
  }
  for (let c = 0; c < 4; c++) {
    const a = c * Math.PI / 2 + Math.PI / 4;
    const y = floorY(98);
    const r = (halfWidthAt(y) * (1 - 0.11)) * Math.SQRT2 + 0.6;
    const orn = new THREE.Group();
    const curl = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.42, 10, 24, Math.PI * 1.55), white);
    curl.rotation.z = Math.PI * 0.2;
    orn.add(curl);
    const curl2 = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.3, 8, 18, Math.PI * 1.6), white);
    curl2.position.set(0.9, -1.0, 0);
    orn.add(curl2);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.2, 0.5), white);
    stem.position.set(-0.3, -1.6, 0);
    orn.add(stem);
    orn.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    orn.rotation.y = -a;
    orn.traverse((o) => { o.castShadow = true; });
    group.add(orn);
  }

  // ── 頂冠上方:圓形多層碟盤 ──
  const dishPts = [
    [3.4, 0], [4.2, 0.4], [5.6, 0.9], [7.0, 1.5], [8.2, 2.2], [8.7, 2.8], [8.7, 3.2], [8.2, 3.3], [3.2, 3.3]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const dish = add(new THREE.LatheGeometry(dishPts, 64), steel, 0, CROWN_Y, 0);
  dish.material = steel;
  for (const [r, y] of [[5.0, 0.75], [6.4, 1.25], [7.7, 1.9]]) add(new THREE.TorusGeometry(r, 0.09, 6, 64), darkMetal, 0, CROWN_Y + y, 0, false).rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(3.4, 3.6, 3.3, 8), grey, 0, CROWN_Y + 1.65, 0);

  // ── 塔尖下段:八角錐形,白灰色金屬板 ──
  const s0 = CROWN_Y + 3.3, sH = 30;
  const pin = add(new THREE.CylinderGeometry(2.2, 3.9, sH, 4), panel, 0, s0 + sH / 2, 0);
  pin.rotation.y = Math.PI / 4;
  pin.material.flatShading = true;
  // ── 塔尖上段:桅杆 + 環形維修走道 + 爬梯 ──
  const m0 = s0 + sH, mH = 21.5;
  add(new THREE.CylinderGeometry(1.45, 1.6, mH, 8), mast, 0, m0 + mH / 2, 0);
  for (let i = 0; i < 9; i++) {
    const y = m0 + 1.2 + i * 2.25;
    add(new THREE.CylinderGeometry(2.25, 2.0, 0.28, 32), steel, 0, y, 0);
    add(new THREE.TorusGeometry(2.25, 0.05, 6, 40), grey, 0, y + 0.75, 0, false).rotation.x = Math.PI / 2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 4), grey, Math.cos(a) * 2.2, y + 0.4, Math.sin(a) * 2.2, false);
    }
    // 航空警示燈(小紅燈)
    if (i % 3 === 1) for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      add(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 }), Math.cos(a) * 2.15, y + 0.3, Math.sin(a) * 2.15, false);
    }
  }
  // 爬梯(南面,攀爬路線)
  const ladder = new THREE.Group();
  for (const x of [-0.28, 0.28]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, mH, 0.05), grey); rail.position.set(x, mH / 2, 0); ladder.add(rail); }
  for (let y = 0.3; y < mH; y += 0.35) { const rung = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.03, 0.03), grey); rung.position.set(0, y, 0); ladder.add(rung); }
  ladder.position.set(0, m0, 1.62);
  group.add(ladder);
  // ── 頂部:八角帽 + 不鏽鋼圓頂 + 避雷針 ──
  const c0 = m0 + mH;
  add(new THREE.CylinderGeometry(1.25, 1.5, 1.4, 8), mast, 0, c0 + 0.7, 0);
  add(new THREE.CylinderGeometry(1.55, 1.55, 0.12, 32), steel, 0, c0 + 1.4, 0);
  const dome = add(new THREE.SphereGeometry(1.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, c0 + 1.45, 0);
  dome.scale.y = 0.85;
  add(new THREE.TorusGeometry(1.38, 0.06, 6, 40), steel, 0, c0 + 1.9, 0, false).rotation.x = Math.PI / 2;
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4), steel, Math.cos(a) * 1.38, c0 + 1.65, Math.sin(a) * 1.38, false); }
  add(new THREE.CylinderGeometry(0.03, 0.05, SPIRE_TOP - (c0 + 2.4), 6), steel, 0, (SPIRE_TOP + c0 + 2.4) / 2, 0, false);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  beacon.position.y = SPIRE_TOP;
  group.add(beacon);
  group.userData.domeTop = c0 + 1.45 + 1.2 * 0.85;
  return beacon;
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
