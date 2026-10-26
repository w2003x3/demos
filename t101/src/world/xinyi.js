// 信義區真實街景:依 OpenStreetMap 資料(assets/data/xinyi.json)建出 101 周邊建築、道路、綠地、行道樹與車流。
// 資料授權:© OpenStreetMap contributors(ODbL)。
import * as THREE from 'three';
import { glassCurtainTexture, roofTexture, canvasTex } from './textures.js?v=4ec109e';
import { applyInterior } from './interior.js?v=4ec109e';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export async function loadXinyi() {
  try {
    const r = await fetch('assets/data/xinyi.json?v=4ec109e');
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/** 點是否在多邊形內(射線法)。 */
export function inPoly(x, z, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** 高樓用的玻璃帷幕外牆(一張 = 寬 24m × 8 層)。 */
function glassFacade() {
  const map = canvasTex(256, 256, (g, W, H) => {
    const r = rng(5);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const l = 46 + r() * 12;
        g.fillStyle = `hsl(205, 8%, ${l}%)`;
        g.fillRect(x * 32, y * 32, 32, 32);
      }
    }
    g.fillStyle = '#8a959c';
    for (let y = 0; y <= 8; y++) g.fillRect(0, y * 32 - 1, W, 3);
    for (let x = 0; x <= 8; x++) g.fillRect(x * 32 - 1, 0, 2, H);
  });
  return map;
}

export function buildXinyi(scene, data, { exclude = [], excludeNames = [] } = {}) {
  const root = new THREE.Group();
  root.name = 'xinyi';
  const r = rng(101);
  const palette = [0x8fa9b6, 0x86a89c, 0x9a9ea2, 0xa8927a, 0x7d93ad, 0xb5bcc0, 0x6f8a8f, 0x8c8c94, 0x9fb3a8];
  const grp = () => ({ pos: [], uv: [], col: [] });
  // 101 周邊(NEAR 公尺內)的玻璃另外一組材質:跨年夜只有這些會反射煙火
  const NEAR = 450;
  const groups = { mid: grp(), glass: grp(), mall: grp(), midN: grp(), glassN: grp(), mallN: grp(), roof: grp() };
  const c = new THREE.Color();
  const solids = [];

  for (const b of data.buildings) {
    const pts = b.p, h = Math.max(3, b.h), m = b.m || 0;
    if (h <= m) continue;
    // 自建模型的地標(國父紀念館、大巨蛋)範圍內不重複建
    const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length, cz = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    if (exclude.some((e) => Math.hypot(cx - e.x, cz - e.z) < e.r)) continue;
    if (b.n && excludeNames.includes(b.n)) continue;
    const tall = h > 90;
    const mall = b.k === 'mall' || /101/.test(b.n || '');
    const bcx = pts.reduce((s2, q2) => s2 + q2[0], 0) / pts.length, bcz = pts.reduce((s2, q2) => s2 + q2[1], 0) / pts.length;
    const near = Math.hypot(bcx, bcz) < NEAR ? 'N' : '';
    const G = groups[(mall ? 'mall' : tall ? 'glass' : 'mid') + near];
    c.setHex(mall ? 0xffffff : palette[Math.floor(r() * palette.length)]);
    if (!mall) c.multiplyScalar(0.9 + r() * 0.15);
    // 牆面
    let u = r() * 24;
    const vScale = 8 * 3.4, uScale = 24;
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      const len = Math.hypot(bx - ax, bz - az);
      // 101 塔身範圍內的牆不建(避免穿進塔內)
      if (Math.abs((ax + bx) / 2) < 30.5 && Math.abs((az + bz) / 2) < 30.5) { u += len; continue; }
      const v = [[ax, m, az, u / uScale, m / vScale], [bx, m, bz, (u + len) / uScale, m / vScale], [bx, h, bz, (u + len) / uScale, h / vScale], [ax, h, az, u / uScale, h / vScale]];
      // 多邊形為逆時針(從上往下看,+Z 朝下)→ 外法線朝外
      for (const t of [0, 2, 1, 0, 3, 2]) {
        G.pos.push(v[t][0], v[t][1], v[t][2]);
        G.uv.push(v[t][3], v[t][4]);
        G.col.push(c.r, c.g, c.b);
      }
      u += len;
    }
    // 屋頂
    const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { tris = []; }
    const rc = tall ? 0.55 : 0.85;
    for (const tri of tris) {
      const tcx = (pts[tri[0]][0] + pts[tri[1]][0] + pts[tri[2]][0]) / 3, tcz = (pts[tri[0]][1] + pts[tri[1]][1] + pts[tri[2]][1]) / 3;
      if (Math.abs(tcx) < 30.5 && Math.abs(tcz) < 30.5) continue;
      for (const k of [tri[0], tri[2], tri[1]]) {
        const [x, z] = pts[k];
        groups.roof.pos.push(x, h, z);
        groups.roof.uv.push(x / 30, z / 30);
        groups.roof.col.push(rc, rc, rc);
      }
    }
    // 碰撞資料:外框 + 多邊形
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    solids.push([x0, z0, x1, z1, h, b.n || '大樓', pts, b.k || '']);
  }

  const mk = (d) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
    geo.computeVertexNormals();
    return geo;
  };
  // 全部為玻璃帷幕:室內有燈就透出、沒燈就反射外界
  const midMat = new THREE.MeshStandardMaterial({ map: glassCurtainTexture(9), vertexColors: true, roughness: 0.12, metalness: 0.72, envMapIntensity: 1.3, emissive: 0xffffff, emissiveIntensity: 0 });
  applyInterior(midMat, { cells: [8, 8], win: [0.02, 0.98, 0.17, 0.985], lit: 0.3, seed: 7, depth: 1.1 });
  const glassMat = new THREE.MeshStandardMaterial({ map: glassFacade(), vertexColors: true, roughness: 0.08, metalness: 0.8, envMapIntensity: 1.5, emissive: 0xffffff, emissiveIntensity: 0 });
  applyInterior(glassMat, { cells: [8, 8], win: [0.01, 0.99, 0.04, 0.99], lit: 0.36, seed: 31, depth: 1.3 });
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTexture(), vertexColors: true, roughness: 0.9 });
  // 百貨商場(含 101 購物中心):每層下方 70% 為玻璃櫥窗、上方為石材飾帶,夜間店面全亮
  const mallTex = canvasTex(512, 512, (g2, W2, H2) => {
    const rh = H2 / 6, cw = W2 / 6;
    g2.fillStyle = '#d6d0c4'; g2.fillRect(0, 0, W2, H2);
    for (let i = 0; i < 6; i++) {
      const grd = g2.createLinearGradient(0, i * rh + rh * 0.3, 0, (i + 1) * rh);
      grd.addColorStop(0, '#5f7c80'); grd.addColorStop(1, '#3d585c');
      g2.fillStyle = grd; g2.fillRect(0, i * rh + rh * 0.3, W2, rh * 0.7);
      g2.fillStyle = '#b9b2a4'; g2.fillRect(0, i * rh + rh * 0.3 - 3, W2, 3);
    }
    g2.fillStyle = '#c8c2b6'; for (let x = 0; x <= 6; x++) g2.fillRect(x * cw - 3, 0, 6, H2);
  });
  const mallMat = new THREE.MeshStandardMaterial({ map: mallTex, roughness: 0.18, metalness: 0.45, envMapIntensity: 1.2, emissive: 0xffffff, emissiveIntensity: 0 });
  applyInterior(mallMat, { cells: [6, 6], win: [0.02, 0.98, 0.0, 0.69], store: true, seed: 5, depth: 1.4 });
  // 同樣的材質複製一份給 101 周邊(複製後需重新套用室內映射)
  const nearOf = (m, opts) => applyInterior(m.clone(), opts);
  const midN = nearOf(midMat, { cells: [8, 8], win: [0.02, 0.98, 0.17, 0.985], lit: 0.3, seed: 7, depth: 1.1 });
  const glassN = nearOf(glassMat, { cells: [8, 8], win: [0.01, 0.99, 0.04, 0.99], lit: 0.36, seed: 31, depth: 1.3 });
  const mallN = nearOf(mallMat, { cells: [6, 6], win: [0.02, 0.98, 0.0, 0.69], store: true, seed: 5, depth: 1.4 });
  for (const [d, mat] of [[groups.mid, midMat], [groups.glass, glassMat], [groups.mall, mallMat], [groups.midN, midN], [groups.glassN, glassN], [groups.mallN, mallN], [groups.roof, roofMat]]) {
    if (!d.pos.length) continue;
    const mesh = new THREE.Mesh(mk(d), mat);
    mesh.castShadow = mat !== roofMat;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  // ── 地面:道路、人行道、綠地、水域(一張 4096 貼圖,邊緣淡出接回外圍)──
  const S = 3800, PX = 4096, k = PX / S;
  const toPx = ([x, z]) => [(x + S / 2) * k, (z + S / 2) * k];
  const groundTex = canvasTex(PX, PX, (g) => {
    g.fillStyle = '#8c8a83';
    g.fillRect(0, 0, PX, PX);
    // 街廓底色(微小雜訊)
    const nr = rng(9);
    for (let i = 0; i < 60000; i++) { g.fillStyle = `rgba(0,0,0,${nr() * 0.05})`; g.fillRect(nr() * PX, nr() * PX, 3, 3); }
    const poly = (pts, fill) => { g.fillStyle = fill; g.beginPath(); pts.forEach((p, i) => { const [a, b] = toPx(p); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath(); g.fill(); };
    for (const gr of data.green) poly(gr.p, gr.k === 'pitch' ? '#4f7a4a' : gr.k === 'playground' ? '#8a7a5a' : '#567044');
    for (const w of data.water) poly(w.p, '#3d5a63');
    const order = ['footway', 'pedestrian', 'service', 'living_street', 'residential', 'unclassified', 'tertiary_link', 'tertiary', 'secondary_link', 'secondary', 'primary_link', 'primary', 'trunk_link', 'trunk', 'motorway_link', 'motorway'];
    const sorted = [...data.roads].sort((a, b) => order.indexOf(a.t) - order.indexOf(b.t));
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const line = (rd, w, col, dash) => {
      g.strokeStyle = col;
      g.lineWidth = w * k;
      g.setLineDash(dash ? dash.map((d) => d * k) : []);
      g.beginPath();
      rd.p.forEach((p, i) => { const [a, b] = toPx(p); i ? g.lineTo(a, b) : g.moveTo(a, b); });
      g.stroke();
    };
    // 人行道(路緣)→ 柏油 → 標線
    for (const rd of sorted) if (rd.w >= 6) line(rd, rd.w + 5, '#a7a39a');
    for (const rd of sorted) line(rd, rd.w, rd.t === 'footway' || rd.t === 'pedestrian' ? '#b9b2a4' : '#3b3d40');
    for (const rd of sorted) {
      if (['primary', 'secondary', 'trunk'].includes(rd.t)) { line(rd, 0.5, '#e8c547'); }
      else if (['tertiary', 'residential'].includes(rd.t) && rd.w >= 8) line(rd, 0.35, 'rgba(240,240,235,0.8)', [3, 3]);
    }
    g.setLineDash([]);
    // 邊緣淡出
    const fade = g.createRadialGradient(PX / 2, PX / 2, PX * 0.4, PX / 2, PX / 2, PX * 0.5);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = fade;
    g.fillRect(0, 0, PX, PX);
    g.globalCompositeOperation = 'source-over';
  }, { repeat: false });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshStandardMaterial({ map: groundTex, transparent: true, roughness: 0.95, depthWrite: true }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.05;
  ground.receiveShadow = true;
  ground.renderOrder = -1;
  root.add(ground);

  // ── 行道樹(沿道路兩側,避開建築)──
  const grid = new Map();
  const C = 60, key = (i, j) => i * 100003 + j;
  for (const s of solids) {
    for (let i = Math.floor(s[0] / C); i <= Math.floor(s[2] / C); i++) for (let j = Math.floor(s[1] / C); j <= Math.floor(s[3] / C); j++) {
      const kk = key(i, j); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(s);
    }
  }
  const insideBuilding = (x, z, pad = 1.5) => {
    const l = grid.get(key(Math.floor(x / C), Math.floor(z / C)));
    if (!l) return false;
    for (const s of l) if (x > s[0] - pad && x < s[2] + pad && z > s[1] - pad && z < s[3] + pad && inPoly(x, z, s[6])) return true;
    return false;
  };
  const spots = [];
  for (const rd of data.roads) {
    if (!['primary', 'secondary', 'tertiary', 'residential', 'trunk'].includes(rd.t)) continue;
    const off = rd.w / 2 + 2;
    for (let i = 0; i < rd.p.length - 1; i++) {
      const [ax, az] = rd.p[i], [bx, bz] = rd.p[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let s = 4; s < len; s += 9) {
        const px = ax + ((bx - ax) * s) / len, pz = az + ((bz - az) * s) / len;
        for (const sd of [-1, 1]) {
          const x = px + nx * off * sd, z = pz + nz * off * sd;
          if (Math.hypot(x, z) < 45 || Math.hypot(x, z) > 1850 || insideBuilding(x, z)) continue;
          if (r() < 0.85) spots.push([x, z]);
        }
      }
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 3, 6);
  trunkGeo.translate(0, 1.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.4, 1);
  crownGeo.scale(1, 0.9, 1);
  crownGeo.translate(0, 4.6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }), spots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), spots.length);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  spots.forEach(([x, z], i) => {
    const s = 0.75 + r() * 0.45;
    q.setFromAxisAngle(Y, r() * 6.28);
    sc.set(s, s * (0.9 + r() * 0.3), s);
    mtx.compose(p.set(x, 0, z), q, sc);
    trunks.setMatrixAt(i, mtx);
    crowns.setMatrixAt(i, mtx);
    c.setHSL(0.25 + r() * 0.08, 0.45, 0.2 + r() * 0.1);
    crowns.setColorAt(i, c);
  });
  trunks.castShadow = crowns.castShadow = true;
  root.add(trunks, crowns);

  // ── 車流:沿主要道路行駛 ──
  const lanes = [];
  for (const rd of data.roads) {
    if (!['primary', 'secondary', 'tertiary', 'trunk'].includes(rd.t) || rd.p.length < 2) continue;
    const segs = [];
    let L = 0;
    for (let i = 0; i < rd.p.length - 1; i++) { const l = Math.hypot(rd.p[i + 1][0] - rd.p[i][0], rd.p[i + 1][1] - rd.p[i][1]); segs.push(l); L += l; }
    if (L < 120) continue;
    lanes.push({ rd, segs, L });
  }
  const N = Math.min(700, lanes.reduce((s, l) => s + Math.floor(l.L / 35), 0));
  const body = new THREE.BoxGeometry(1.8, 0.8, 4.3); body.translate(0, 0.65, 0);
  const cab = new THREE.BoxGeometry(1.6, 0.6, 2.2); cab.translate(0, 1.35, -0.2);
  const carGeo = mergeTwo(body, cab);
  const cars = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 }), Math.max(1, N));
  const tail = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.15, 0.05), new THREE.MeshBasicMaterial({ color: 0xff3020 }), Math.max(1, N));
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.15, 0.05), new THREE.MeshBasicMaterial({ color: 0xfff2d0 }), Math.max(1, N));
  const cols = [0xf2f2f2, 0x1d1d1f, 0xb8bcc2, 0xe6c229, 0x8c1c1c, 0x274b8a, 0x5b6770, 0xf2f2f2, 0xe6c229];
  const list = [];
  let n = 0;
  for (const ln of lanes) {
    const count = Math.floor(ln.L / 35);
    for (let i = 0; i < count && n < N; i++, n++) {
      const dir = r() < 0.5 ? 1 : -1;
      list.push({ ln, s: r() * ln.L, dir, v: 7 + r() * 6, lane: dir * (ln.rd.w / 4) });
      c.setHex(cols[Math.floor(r() * cols.length)]);
      cars.setColorAt(n, c);
    }
  }
  cars.count = tail.count = head.count = list.length;
  cars.castShadow = true;
  root.add(cars, tail, head);
  const lightOff = new THREE.Matrix4();
  const updateTraffic = (dt) => {
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      o.s += o.v * o.dir * dt;
      if (o.s > o.ln.L) o.s -= o.ln.L;
      if (o.s < 0) o.s += o.ln.L;
      // 找到所在線段
      let s = o.s, k2 = 0;
      while (k2 < o.ln.segs.length - 1 && s > o.ln.segs[k2]) { s -= o.ln.segs[k2]; k2++; }
      const [ax, az] = o.ln.rd.p[k2], [bx, bz] = o.ln.rd.p[k2 + 1];
      const len = o.ln.segs[k2] || 1;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      const x = ax + dx * s - dz * o.lane, z = az + dz * s + dx * o.lane;
      const yaw = Math.atan2(dx * o.dir, dz * o.dir);
      q.setFromAxisAngle(Y, yaw);
      mtx.compose(p.set(x, 0, z), q, sc.set(1, 1, 1));
      cars.setMatrixAt(i, mtx);
      lightOff.makeTranslation(0, 0.75, -2.17);
      tail.setMatrixAt(i, mtx.clone().multiply(lightOff));
      lightOff.makeTranslation(0, 0.75, 2.17);
      head.setMatrixAt(i, mtx.clone().multiply(lightOff));
    }
    cars.instanceMatrix.needsUpdate = tail.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
  };

  scene.add(root);
  return {
    root, solids, updateTraffic,
    glassMats: [midN, glassN, mallN],
    setNight(nf) {
      midMat.emissiveIntensity = midN.emissiveIntensity = nf * 0.7;
      glassMat.emissiveIntensity = glassN.emissiveIntensity = nf * 0.7;
      mallMat.emissiveIntensity = mallN.emissiveIntensity = nf * 1.0;
      tail.visible = head.visible = nf > 0.2;
    }
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
