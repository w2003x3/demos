// 可參觀樓層室內(放在大樓內的真實高度,窗外就是實際城市)。
import * as THREE from 'three';
import { floorY, FH, halfWidthAt } from '../config.js';
import { towerPolygon, frustumGeometry } from './tower.js';
import { canvasTex, woodTexture, stoneTileTexture, carpetTexture, concreteTexture } from './textures.js';
import * as F from './furniture.js';
import { createCharacter, poseIdle, poseSit, poseLean } from './character.js';

/** 水平樓板(外框為大樓斷面,可挖圓孔)。 */
function slab(hw, holeR, up, mat, uvRepeat = 0.5) {
  const pts = towerPolygon(hw);
  const sgn = up ? -1 : 1;
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], sgn * pts[0][1]);
  for (const p of pts.slice(1)) shape.lineTo(p[0], sgn * p[1]);
  if (holeR) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const g = new THREE.ShapeGeometry(shape, 48);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvRepeat, uv.getY(i) * uvRepeat);
  g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.material.side = THREE.DoubleSide;
  m.receiveShadow = true;
  return m;
}

const mullionTex = canvasTex(128, 128, (g, W, H) => {
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(170,205,205,0.10)';
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(60,66,70,1)';
  g.fillRect(0, 0, 7, H);
  g.fillRect(W - 7, 0, 7, H);
});

const MATS = {
  innerGlass: new THREE.MeshStandardMaterial({ map: mullionTex, transparent: true, side: THREE.DoubleSide, roughness: 0.1, metalness: 0.2, depthWrite: false }),
  sill: new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.5, metalness: 0.4 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xe9e7e2, roughness: 0.9 }),
  ceilingDark: new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.9 }),
  column: new THREE.MeshStandardMaterial({ color: 0xcfc8bb, roughness: 0.5 }),
  coreStone: (() => { const t = stoneTileTexture([206, 197, 182], '#9b9283', 88); t.repeat.set(0.4, 0.4); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 }); })(),
  coreWood: (() => { const t = woodTexture(24, 30); t.rotation = Math.PI / 2; t.repeat.set(0.6, 0.6); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 }); })(),
  light: new THREE.MeshBasicMaterial({ color: 0xfff6e8 })
};

class Floor {
  constructor(n, name) {
    this.n = n;
    this.name = name;
    this.y = floorY(n);
    this.hw = halfWidthAt(this.y + 1.5) - 0.65;
    this.ceil = FH - 0.4;
    this.group = new THREE.Group();
    this.group.position.y = this.y;
    this.group.name = `floor-${n}`;
    this.colliders = [];
    this.interact = [];
    this.npcs = [];
    this.lights = [];
    this.doors = [];
  }
  add(obj, x = 0, z = 0, ry = 0, y = 0) {
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    this.group.add(obj);
    return obj;
  }
  box(x, z, w, d) { this.colliders.push({ type: 'box', minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }); }
  circle(x, z, r) { this.colliders.push({ type: 'circle', x, z, r }); }
  shell({ floorMat, holeFloor = 0, holeCeil = 0, ceilMat = MATS.ceiling }) {
    this.group.add(slab(this.hw + 0.6, holeFloor, true, floorMat));
    const c = slab(this.hw + 0.6, holeCeil, false, ceilMat);
    c.position.y = this.ceil;
    c.castShadow = true;
    this.group.add(c);
    // 天花板上方的樓板(擋光用,不可見面朝下)
    const cap = slab(this.hw + 0.6, holeCeil, true, MATS.ceilingDark);
    cap.position.y = this.ceil + 0.02;
    cap.castShadow = true;
    this.group.add(cap);
    // 室內側的玻璃(含直料)與窗台
    const hwG = halfWidthAt(this.y + 1.5) - 0.12;
    const glass = new THREE.Mesh(frustumGeometry(0, hwG, this.ceil, hwG, { uvScale: [1.5, this.ceil] }), MATS.innerGlass);
    glass.renderOrder = 2;
    this.group.add(glass);
    const sill = new THREE.Mesh(frustumGeometry(0, hwG - 0.05, 0.35, hwG - 0.05, { uvScale: [4, 1], inward: true }), MATS.sill);
    this.group.add(sill);
    // 天花板嵌燈
    const geo = new THREE.PlaneGeometry(0.5, 0.5);
    geo.rotateX(Math.PI / 2);
    const spots = [];
    for (let x = -this.hw + 3; x < this.hw - 2; x += 4) {
      for (let z = -this.hw + 3; z < this.hw - 2; z += 4) {
        if (holeCeil && Math.hypot(x, z) < holeCeil + 1) continue;
        spots.push([x, z]);
      }
    }
    const inst = new THREE.InstancedMesh(geo, MATS.light, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => { m.makeTranslation(x, this.ceil - 0.01, z); inst.setMatrixAt(i, m); });
    this.group.add(inst);
    // 室內補光
    for (const [x, z] of [[-this.hw / 2, -this.hw / 2], [this.hw / 2, -this.hw / 2], [-this.hw / 2, this.hw / 2], [this.hw / 2, this.hw / 2]]) {
      const l = new THREE.PointLight(0xffe7c4, 28, 26, 1.6);
      l.position.set(x, this.ceil - 0.4, z);
      this.group.add(l);
      this.lights.push(l);
    }
    // 巨柱(每面兩支)
    for (let k = 0; k < 4; k++) {
      for (const s of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(1.4, this.ceil, 1.4), MATS.column);
        let x = s * this.hw * 0.42, z = this.hw - 1.4;
        for (let r = 0; r < k; r++) [x, z] = [-z, x];
        col.position.set(x, this.ceil / 2, z);
        col.castShadow = col.receiveShadow = true;
        this.group.add(col);
        this.box(x, z, 1.5, 1.5);
      }
    }
  }
  /** 中央核心筒(含電梯門在南面)。 */
  core(half = 8, mat = MATS.coreStone, label = '') {
    const core = new THREE.Mesh(new THREE.BoxGeometry(half * 2, this.ceil, half * 2), mat);
    core.position.y = this.ceil / 2;
    core.castShadow = core.receiveShadow = true;
    this.group.add(core);
    this.box(0, 0, half * 2, half * 2);
    this.elevators(half, label);
  }
  /** 電梯門:z 位置的牆面朝 +Z。 */
  elevators(zFace, label) {
    for (const dx of [-2.6, 2.6]) {
      const d = F.elevatorDoor(label || `${this.n}F`);
      this.add(d.group, dx, zFace + 0.13);
      this.doors.push(d);
      this.interact.push({ id: 'elevator', x: dx, z: zFace + 1.3, r: 1.6, label: '搭乘高速電梯', door: d });
    }
    this.spawn = { x: -2.6, z: zFace + 2.2, ry: 0 };
  }
  npc(opts, x, z, ry, pose = 'idle') {
    const c = createCharacter(opts);
    this.add(c.root, x, z, ry);
    c.pose = pose;
    c.t0 = Math.random() * 10;
    this.npcs.push(c);
    if (pose !== 'sit') this.circle(x, z, 0.35);
    return c;
  }
  tableSet(x, z, chairs = 2, round = true, seated = 0) {
    this.add(round ? F.roundTable(0.42) : F.squareTable(0.8, 0.8, 0.74, F.MAT.wood), x, z);
    this.circle(x, z, 0.55);
    for (let i = 0; i < chairs; i++) {
      const a = (i / chairs) * Math.PI * 2;
      const cx = x + Math.sin(a) * 0.72, cz = z + Math.cos(a) * 0.72;
      this.add(F.chair(), cx, cz, a + Math.PI);
      if (i < seated) {
        const c = this.npc(randomVisitor(i + x), cx, cz, a + Math.PI, 'sit');
        c.root.position.y = 0.02;
      }
    }
  }
  update(t) {
    for (const c of this.npcs) {
      const tt = t + c.t0;
      if (c.pose === 'sit') poseSit(c, tt);
      else if (c.pose === 'lean') poseLean(c, tt);
      else poseIdle(c, tt);
    }
  }
}

const SHIRTS = [0xe8e2d4, 0x3b5b8c, 0x9c3d3d, 0x2f2f33, 0x6c8f6a, 0xd9b44a, 0x7a6a8c, 0xffffff, 0x4b6b78];
const PANTS = [0x1d2433, 0x3a3a3a, 0x4a5a6a, 0x8a7a62, 0x22252b];
const HAIR = [0x1b1612, 0x2a1d14, 0x0f0f10, 0x3a2a1a, 0x5a4a3a];
const SKIN = [0xc9926e, 0xbd8662, 0xd29d78, 0xb07a58];
function randomVisitor(seed) {
  const r = (k) => Math.abs(Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1;
  return {
    shirt: SHIRTS[Math.floor(r(1) * SHIRTS.length)],
    pants: PANTS[Math.floor(r(2) * PANTS.length)],
    hair: HAIR[Math.floor(r(3) * HAIR.length)],
    skin: SKIN[Math.floor(r(4) * SKIN.length)],
    hairLong: r(5) < 0.45
  };
}

// ───────────────────────── 5F 售票入口 ─────────────────────────
function build5F() {
  const f = new Floor(5, '5F 觀景台售票入口');
  const t = stoneTileTexture([214, 206, 192], '#9e9584', 15);
  f.shell({ floorMat: new THREE.MeshStandardMaterial({ map: t, roughness: 0.25, metalness: 0.05 }) });
  f.core(8, MATS.coreStone, '89F 觀景台');
  // 售票櫃台(西側)
  const counter = F.coffeeCounter(7, { front: F.MAT.woodDark, top: F.MAT.darkStone, brand: 0x2c6e74 });
  // 售票櫃台不需要咖啡機:用一般櫃台
  const tc = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(8, 1.1, 0.8), F.MAT.woodDark);
  body.position.y = 0.55; body.castShadow = body.receiveShadow = true;
  tc.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.05, 0.9), F.MAT.darkStone);
  top.position.y = 1.12;
  tc.add(top);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.03), new THREE.MeshStandardMaterial({ color: 0x0b0f14, emissive: 0x2c8f9a, emissiveIntensity: 0.6 }));
    s.position.set(-3 + i * 2, 1.32, -0.2);
    s.rotation.x = -0.3;
    tc.add(s);
  }
  f.add(tc, -18, 0, Math.PI / 2);
  f.box(-18, 0, 1, 8.4);
  void counter;
  const sign = F.signPlane(7, 1.0, '台北101觀景台 售票處', { bg: '#10202c', fg: '#e8d29a', font: '900 120px "Noto Sans TC", sans-serif', glow: 0.8, sub: 'TAIPEI 101 OBSERVATORY · TICKETS' });
  sign.position.set(-21.5, 2.7, 0);
  sign.rotation.y = Math.PI / 2;
  f.group.add(sign);
  for (let i = 0; i < 4; i++) f.npc({ shirt: 0x1f3a5a, pants: 0x1d2433, hair: HAIR[i % 5], hairLong: i % 2 === 0 }, -19.2, -3 + i * 2, Math.PI / 2);
  // 排隊動線
  const pts = [];
  for (let k = 0; k < 4; k++) {
    pts.push([-14 + (k % 2) * 0, -7 + k * 0]);
  }
  f.add(F.stanchions([[-15, -6], [-9, -6], [-9, -3.5], [-15, -3.5]]), 0, 0);
  f.add(F.stanchions([[-15, 3.5], [-9, 3.5], [-9, 6], [-15, 6]]), 0, 0);
  for (let i = 0; i < 6; i++) f.npc(randomVisitor(50 + i), -14 + i * 0.9, -4.8 + (i % 2) * 0.2, -Math.PI / 2 + 0.2);
  // 101 模型展示
  const model = new THREE.Group();
  const mm = new THREE.MeshStandardMaterial({ color: 0x3d7f86, metalness: 0.6, roughness: 0.2 });
  for (let k = 0; k < 8; k++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.22, 0.32, 4), mm);
    seg.position.y = 1.2 + k * 0.32;
    seg.rotation.y = Math.PI / 4;
    model.add(seg);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.0, 4), mm);
  base.position.y = 0.7; base.rotation.y = Math.PI / 4;
  model.add(base);
  const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.04, 0.6, 8), F.MAT.steel);
  sp.position.y = 3.95;
  model.add(sp);
  const ped = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.2), F.MAT.darkStone);
  ped.position.y = 0.1;
  model.add(ped);
  f.add(model, 12, 14);
  f.box(12, 14, 1.3, 1.3);
  f.add(F.infoStand('台北101', ['高度 508 公尺 · 地上 101 層', '2004 年完工', '觀景台電梯 37 秒直達 89F']), 12, 16.2);
  for (const [x, z] of [[18, -18], [-18, 18], [18, 18], [-18, -18]]) { f.add(F.planter(1.6), x, z); f.circle(x, z, 0.4); }
  f.interact.push({ id: 'ticket', x: -16.6, z: 0, r: 2, label: '購買觀景台門票' });
  return f;
}

// ───────────────────────── 35F 四八八克 ─────────────────────────
function build35F() {
  const f = new Floor(35, '35F 四八八克咖啡 101 門市');
  const wt = woodTexture(26, 34);
  f.shell({ floorMat: new THREE.MeshStandardMaterial({ map: wt, roughness: 0.55 }) });
  f.core(8, MATS.coreWood, '35F');
  const green = '#00704a';
  // 吧台:核心筒東面
  const bar = F.coffeeCounter(9, { front: F.MAT.woodDark, top: F.MAT.stone, brand: 0x00704a });
  f.add(bar, 10.4, 0, Math.PI / 2);
  f.box(10.4, 0, 0.9, 9.2);
  const pc = F.pastryCase(2.2);
  f.add(pc, 10.4, 5.9, Math.PI / 2);
  f.box(10.4, 5.9, 0.8, 2.3);
  // 背牆:菜單與招牌
  const menu = [
    ['濃縮咖啡', '大杯 $95'], ['美式咖啡', '大杯 $120'], ['那堤', '大杯 $135'], ['卡布奇諾', '大杯 $135'],
    ['焦糖瑪奇朵', '大杯 $160'], ['抹茶那堤', '大杯 $150'], ['冷萃咖啡', '大杯 $150'], ['去冰補奶', '+$25']
  ];
  const m1 = F.menuBoard(2.6, 1.3, '咖啡 COFFEE', menu.slice(0, 4), { bg: '#1e2b25' });
  m1.position.set(8.02, 2.2, -2.2); m1.rotation.y = Math.PI / 2;
  const m2 = F.menuBoard(2.6, 1.3, '特調 SIGNATURE', menu.slice(4), { bg: '#1e2b25' });
  m2.position.set(8.02, 2.2, 1.0); m2.rotation.y = Math.PI / 2;
  f.group.add(m1, m2);
  const sign = F.signPlane(4.2, 0.7, '488K COFFEE', { bg: green, fg: '#ffffff', font: '700 150px "Barlow Condensed", sans-serif', glow: 0.9 });
  sign.position.set(8.03, 3.35, -0.6); sign.rotation.y = Math.PI / 2; sign.scale.set(0.9, 0.9, 1);
  f.group.add(sign);
  const sign2 = F.signPlane(3.2, 0.5, '四八八克 101 門市 · 35F', { bg: null, fg: '#e6f2ec', font: '700 110px "Noto Sans TC", sans-serif', glow: 0.6 });
  sign2.position.set(8.03, 1.5, 4.0); sign2.rotation.y = Math.PI / 2;
  f.group.add(sign2);
  // 吊燈
  for (let z = -3.5; z <= 3.5; z += 1.75) f.add(F.pendant(f.ceil, 1.3), 11.6, z);
  // 店員
  f.npc({ shirt: 0x2b2b2b, pants: 0x1d2433, apron: 0x00704a, hairLong: true, hair: 0x1b1612 }, 9.4, -2.4, Math.PI / 2);
  f.npc({ shirt: 0xf0f0f0, pants: 0x1d2433, apron: 0x00704a, hair: 0x2a1d14 }, 9.4, 1.6, Math.PI / 2);
  // 排隊客人
  f.npc(randomVisitor(3), 12.4, 2.2, -Math.PI / 2);
  f.npc(randomVisitor(4), 13.2, 2.6, -Math.PI / 2 + 0.3);
  // 座位:東、南、北區
  const tables = [
    [15.5, -12, 2, 1], [18.5, -8, 2, 0], [15.5, -4, 2, 2], [18.5, 4, 2, 1], [15.5, 9, 2, 0], [18.5, 13, 2, 1],
    [-12, 14, 2, 1], [-6, 17, 2, 0], [0, 14, 2, 2], [6, 17, 2, 0], [-12, -14, 2, 0], [-4, -17, 2, 1], [4, -14, 2, 0]
  ];
  for (const [x, z, n, s] of tables) f.tableSet(x, z, n, true, s);
  // 靠窗吧檯(南窗)
  const wb = new THREE.Mesh(new THREE.BoxGeometry(14, 0.05, 0.5), F.MAT.wood);
  wb.position.set(-2, 1.05, f.hw - 0.45);
  wb.castShadow = true;
  f.group.add(wb);
  f.box(-2, f.hw - 0.45, 14, 0.6);
  for (let x = -8; x <= 4; x += 1.2) f.add(F.stool(0.75), x, f.hw - 1.05);
  f.npc(randomVisitor(9), -5.6, f.hw - 1.05, Math.PI, 'sit').root.position.y = 0.3;
  // 西側沙發區
  for (const [x, z] of [[-16, -6], [-16, 0], [-16, 6]]) {
    f.add(F.armchair(), x - 1.1, z, Math.PI / 2);
    f.add(F.armchair(F.MAT.fabric2), x + 1.1, z, -Math.PI / 2);
    f.add(F.roundTable(0.35, 0.45, F.MAT.woodDark), x, z);
    f.box(x, z, 3.2, 1.2);
  }
  f.npc(randomVisitor(21), -17.1, 0, Math.PI / 2, 'sit');
  for (const [x, z] of [[19.5, -17], [-19, 17], [19.5, 17], [-19, -17]]) { f.add(F.planter(1.3), x, z); f.circle(x, z, 0.4); }
  f.interact.push({ id: 'order-sbux', x: 12.0, z: -1, r: 1.8, label: '點一杯咖啡' });
  f.interact.push({ id: 'order-sbux', x: 11.7, z: 5.9, r: 1.3, label: '點甜點與咖啡' });
  f.interact.push({ id: 'window', x: -2, z: f.hw - 1.4, r: 3, label: '靠窗欣賞 35 樓景色' });
  return f;
}

// ─────────────────────── 88F 心缽咖啡 + 阻尼器 ───────────────────────
const SUSPEND_Y = floorY(92); // 懸吊點高度
const SPHERE_CENTER = floorY(88) + 3.25;

function build88F(damper) {
  const f = new Floor(88, '88F 心缽咖啡 · 風阻尼器');
  const ct = carpetTexture('#2f2d33', '#3a3840');
  ct.repeat.set(1, 1);
  f.shell({ floorMat: new THREE.MeshStandardMaterial({ map: ct, roughness: 0.95 }), holeCeil: 5.6 });
  // 阻尼器展示區:圓形石材地坪 + 玻璃欄杆
  const disc = new THREE.Mesh(new THREE.CircleGeometry(7.5, 64), new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.3, metalness: 0.2 }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.01;
  disc.receiveShadow = true;
  f.group.add(disc);
  f.add(F.glassRailCircle(6.2, 1.1), 0, 0);
  f.circle(0, 0, 6.5);
  // 天花孔的邊緣
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.4, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.6, side: THREE.DoubleSide }));
  edge.position.y = f.ceil + 0.2;
  f.group.add(edge);
  // 投光燈打在球上
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const s = new THREE.SpotLight(0xfff0d0, 260, 20, 0.5, 0.6, 1.5);
    s.position.set(Math.cos(a) * 9, f.ceil - 0.3, Math.sin(a) * 9);
    s.target.position.set(0, 3.25, 0);
    f.group.add(s, s.target);
    f.lights.push(s);
  }
  // 說明牌
  const facts = [
    ['風阻尼器 Tuned Mass Damper', ['重量 660 公噸,直徑 5.5 公尺', '由 41 層鋼板焊接而成', '懸吊於 92 樓,可減少大樓晃動']],
    ['它怎麼運作?', ['大樓被風吹向一邊時', '巨球因慣性往反方向擺動', '8 支油壓阻尼器吸收能量']],
    ['颱風時的表現', ['強颱時擺幅可達 1 公尺以上', '是全世界少數開放參觀的', '大型被動式阻尼器']]
  ];
  facts.forEach(([t, l], i) => {
    const a = Math.PI * 0.6 + i * 0.55;
    const s = F.infoStand(t, l, 1.3, 0.8);
    f.add(s, Math.cos(a) * 7.2, Math.sin(a) * 7.2, -a - Math.PI / 2);
  });
  f.interact.push({ id: 'damper', x: 0, z: 7.4, r: 2.2, label: '近看風阻尼器' });
  f.interact.push({ id: 'typhoon', x: -6.8, z: 3.5, r: 1.8, label: '颱風模擬(阻尼器大幅擺動)' });

  // 電梯廳(北側)
  const bank = new THREE.Mesh(new THREE.BoxGeometry(16, f.ceil, f.hw - 11.5), MATS.coreStone);
  bank.position.set(0, f.ceil / 2, -(11.5 + f.hw) / 2);
  bank.castShadow = bank.receiveShadow = true;
  f.group.add(bank);
  f.box(0, -(11.5 + f.hw) / 2, 16, f.hw - 11.5);
  f.elevators(-11.5, '88F');
  f.spawn.ry = 0;

  // 心缽咖啡(東側)
  const bar = F.coffeeCounter(7.5, { front: F.MAT.woodDark, top: F.MAT.darkStone, brand: 0x3a2a1e });
  f.add(bar, 15.5, 0, -Math.PI / 2);
  f.box(15.5, 0, 0.9, 7.8);
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, f.ceil, 9), MATS.coreWood);
  backWall.position.set(17.6, f.ceil / 2, 0);
  backWall.castShadow = true;
  f.group.add(backWall);
  f.box(17.6, 0, 0.6, 9);
  const kafSign = F.signPlane(5, 0.9, '心缽咖啡 XIN BO KAFFA', { bg: '#14110f', fg: '#e9d6b0', font: '700 120px "Noto Sans TC", sans-serif', glow: 0.8 });
  kafSign.position.set(17.44, 3.3, 0); kafSign.rotation.y = -Math.PI / 2;
  f.group.add(kafSign);
  const km = F.menuBoard(2.4, 1.25, '手沖 POUR OVER', [['招牌綜合', '$280'], ['衣索比亞', '$320'], ['101 拿鐵', '$300'], ['去冰補奶', '免費']], { bg: '#1a1714', accent: '#d9b25a' });
  km.position.set(17.44, 2.2, -2.8); km.rotation.y = -Math.PI / 2;
  f.group.add(km);
  f.add(F.pastryCase(1.8), 15.5, -5.0, -Math.PI / 2);
  f.box(15.5, -5, 0.8, 1.9);
  for (const z of [-3.4, -2.9, 2.9, 3.4]) f.add(F.pendant(f.ceil, 1.4), 14.6, z);
  f.npc({ shirt: 0x1b1b1b, pants: 0x1b1b1b, apron: 0x5a3e2b, hair: 0x0f0f10 }, 16.5, -1.5, -Math.PI / 2);
  f.npc({ shirt: 0xf2efe8, pants: 0x1b1b1b, apron: 0x5a3e2b, hair: 0x2a1d14, hairLong: true }, 16.5, 1.8, -Math.PI / 2);
  // 座位(南、西靠窗)
  const tables = [[-6, 17, 2, 1], [0, 19, 2, 2], [6, 17, 2, 0], [12, 14, 2, 1], [-12, 14, 2, 0], [-17, 8, 2, 1], [-19, 0, 2, 0], [-17, -8, 2, 2], [11, 8, 2, 0]];
  for (const [x, z, n, s] of tables) f.tableSet(x, z, n, false, s);
  // 珊瑚與珠寶展示櫃(西北)
  for (const [x, z] of [[-14, -14], [-10, -16]]) {
    f.add(F.pastryCase(2.0), x, z, Math.PI / 4);
    f.circle(x, z, 1.1);
  }
  // 遊客看阻尼器
  f.npc(randomVisitor(31), 3, 6.9, Math.PI, 'lean');
  f.npc(randomVisitor(32), -4.2, 5.6, Math.PI * 0.8, 'lean');
  f.npc(randomVisitor(33), 5.8, -2.6, -Math.PI / 2 - 0.2);
  f.interact.push({ id: 'order-kaffa', x: 13.6, z: 0, r: 1.8, label: '點一杯手沖咖啡' });
  f.interact.push({ id: 'order-kaffa', x: 14.2, z: -5, r: 1.3, label: '點甜點與手沖咖啡' });
  return f;
}

// ───────────────────────── 89F 觀景台 ─────────────────────────
function build89F() {
  const f = new Floor(89, '89F 室內觀景台');
  const st = stoneTileTexture([62, 60, 64], '#2a292d', 19);
  f.shell({ floorMat: new THREE.MeshStandardMaterial({ map: st, roughness: 0.25, metalness: 0.1 }), holeFloor: 5.6, holeCeil: 6.2, ceilMat: MATS.ceilingDark });
  f.add(F.glassRailCircle(6.4, 1.1), 0, 0);
  f.circle(0, 0, 6.7);
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.35, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2b2e, side: THREE.DoubleSide }));
  edge.position.y = -0.17;
  f.group.add(edge);
  // 中庭(往上到 92F 的吊點)
  const atrium = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, SUSPEND_Y - (f.y + f.ceil), 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x1d1e21, roughness: 0.8, side: THREE.BackSide }));
  atrium.position.y = f.ceil + (SUSPEND_Y - (f.y + f.ceil)) / 2;
  f.group.add(atrium);
  // 電梯廳
  const bank = new THREE.Mesh(new THREE.BoxGeometry(16, f.ceil, f.hw - 11.5), MATS.coreStone);
  bank.position.set(0, f.ceil / 2, -(11.5 + f.hw) / 2);
  bank.castShadow = bank.receiveShadow = true;
  f.group.add(bank);
  f.box(0, -(11.5 + f.hw) / 2, 16, f.hw - 11.5);
  f.elevators(-11.5, '89F');
  // 望遠鏡與景點標示
  const views = [
    { dir: 'S', ry: 0, name: '南 · 貓空、指南宮', sub: '台北市動物園方向' },
    { dir: 'E', ry: Math.PI / 2, name: '東 · 象山、四獸山', sub: '台北最熱門的夜景步道' },
    { dir: 'N', ry: Math.PI, name: '北 · 陽明山、松山機場', sub: '七星山 1120 公尺' },
    { dir: 'W', ry: -Math.PI / 2, name: '西 · 淡水河、台北車站', sub: '天氣好時可見觀音山' }
  ];
  for (const v of views) {
    const d = f.hw - 1.6;
    const along = v.dir === 'N' ? [-17, 17] : [-9, 0, 9];
    for (const a of along) {
      let x, z;
      if (v.dir === 'S') { x = a; z = d; } else if (v.dir === 'N') { x = a; z = -d; } else if (v.dir === 'E') { x = d; z = a; } else { x = -d; z = a; }
      f.add(F.telescope(), x, z, v.ry);
      f.circle(x, z, 0.4);
      f.interact.push({ id: 'telescope', x: x - Math.sin(v.ry) * 1.0, z: z - Math.cos(v.ry) * 1.0, r: 1.2, label: `使用望遠鏡(${v.name.split(' · ')[0]})`, look: v.ry });
    }
    const lab = F.signPlane(4, 0.5, v.name, { bg: null, fg: '#ffffff', font: '700 100px "Noto Sans TC", sans-serif', glow: 0.7, sub: v.sub, subFont: '500 60px "Noto Sans TC", sans-serif' });
    let x = 0, z = f.hw - 0.3;
    for (let r = 0; r < Math.round(v.ry / (Math.PI / 2) + 4) % 4; r++) [x, z] = [z, -x];
    lab.position.set(x, 0.62, z);
    lab.rotation.y = v.ry + Math.PI;
    f.group.add(lab);
  }
  // 長椅
  for (const [x, z, ry] of [[-14, 12, 0], [14, 12, 0], [-14, -6, Math.PI / 2], [14, -6, -Math.PI / 2]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(3, 0.45, 0.6), F.MAT.woodLight);
    b.position.set(x, 0.225, z); b.rotation.y = ry; b.castShadow = true;
    f.group.add(b);
    f.box(x, z, ry ? 0.7 : 3.1, ry ? 3.1 : 0.7);
  }
  f.npc(randomVisitor(41), -14.6, 12, Math.PI, 'sit').root.position.y = -0.03;
  // 紀念章台
  const stamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.6), F.MAT.woodDark);
  stamp.position.set(9, 0.5, -9.5);
  f.group.add(stamp);
  f.box(9, -9.5, 1.3, 0.7);
  f.add(F.infoStand('紀念章', ['台北101 觀景台', '382 公尺 · 89F'], 0.8, 0.5), 10.4, -9.6);
  f.interact.push({ id: 'stamp', x: 9, z: -8.5, r: 1.4, label: '蓋紀念章' });
  // 遊客
  f.npc(randomVisitor(42), 4, f.hw - 1.4, 0, 'lean');
  f.npc(randomVisitor(43), f.hw - 1.4, 5, Math.PI / 2, 'lean');
  f.npc(randomVisitor(44), -f.hw + 1.4, -4, -Math.PI / 2);
  f.npc(randomVisitor(45), 2.5, 7.1, Math.PI, 'lean');
  f.interact.push({ id: 'damper', x: 0, z: 7.6, r: 2.2, label: '從 89F 俯瞰風阻尼器' });
  return f;
}

export function buildInteriors(scene) {
  const floors = [build5F(), build35F()];
  // 阻尼器:懸吊於 92F,球心在 88F 上方
  const damper = F.buildDamper(SUSPEND_Y - SPHERE_CENTER, floorY(88) - SUSPEND_Y);
  damper.group.position.y = SUSPEND_Y;
  scene.add(damper.group);
  floors.push(build88F(damper), build89F());
  const byFloor = {};
  for (const f of floors) {
    scene.add(f.group);
    byFloor[f.n] = f;
  }
  let sway = { x: 0, z: 0, amp: 0.06, boost: 0 };
  return {
    floors: byFloor,
    damper,
    sway,
    setActive(n) {
      for (const f of floors) {
        const on = f.n === n || (n === 88 && f.n === 89) || (n === 89 && f.n === 88);
        f.group.visible = on || n === 'all';
        for (const l of f.lights) l.visible = f.n === n;
      }
      damper.group.visible = n === 88 || n === 89 || n === 'all';
    },
    update(t, dt) {
      sway.boost = Math.max(0, sway.boost - dt * 0.05);
      const amp = sway.amp + sway.boost;
      // 週期約 7 秒(與大樓擺動周期相近)
      sway.x = Math.sin(t * 0.9) * amp + Math.sin(t * 0.37) * amp * 0.3;
      sway.z = Math.cos(t * 0.83) * amp * 0.6;
      damper.update(sway.x, sway.z);
      for (const f of floors) if (f.group.visible) f.update(t);
    }
  };
}
