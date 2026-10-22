// 程序化人物:關節式骨架 + 走路/跑樓梯/攀爬/坐姿等動作。人物面向 +Z,左側為 +X。
import * as THREE from 'three';
import { canvasTex } from './textures.js';

const lerp = THREE.MathUtils.lerp;

function limb(len, r0, r1, mat) {
  const g = new THREE.Group();
  const geo = new THREE.CapsuleGeometry((r0 + r1) / 2, len - (r0 + r1), 4, 10);
  // 上粗下細
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = (y + len / 2) / len; // 0 底 1 頂
    const k = lerp(r1, r0, t) / ((r0 + r1) / 2);
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  geo.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  g.add(m);
  return g;
}

function bibTexture(num) {
  return canvasTex(128, 96, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 96);
    g.fillStyle = '#c62828';
    g.fillRect(0, 0, 128, 18);
    g.fillStyle = '#1d2433';
    g.font = '700 52px "Barlow Condensed", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(num, 64, 58);
  }, { repeat: false });
}

/**
 * opts: shirt, pants, skin, hair, shoes, helmet(bool), harness(bool), bib(字串), apron(顏色), hairLong(bool)
 */
export function createCharacter(opts = {}) {
  const o = {
    shirt: 0x2f6fd6, pants: 0x1d2433, skin: 0xc9926e, hair: 0x1b1612, shoes: 0x2a2a2a,
    ...opts
  };
  const std = (c, r = 0.75) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const M = { shirt: std(o.shirt, 0.85), pants: std(o.pants, 0.9), skin: std(o.skin, 0.6), hair: std(o.hair, 0.8), shoes: std(o.shoes, 0.5) };

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);

  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.14, 4, 10), M.pants);
  pelvis.rotation.z = Math.PI / 2;
  pelvis.scale.set(1, 1, 0.8);
  pelvis.castShadow = true;
  hips.add(pelvis);

  const spine = new THREE.Group();
  spine.position.y = 0.06;
  hips.add(spine);
  const torsoGeo = new THREE.CapsuleGeometry(0.17, 0.3, 4, 12);
  torsoGeo.scale(1.15, 1, 0.72);
  torsoGeo.translate(0, 0.26, 0);
  // 肩寬:上半部向外撐
  {
    const p = torsoGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const k = 1 + Math.max(0, (y - 0.25) / 0.25) * 0.18;
      p.setX(i, p.getX(i) * k);
    }
    torsoGeo.computeVertexNormals();
  }
  const torso = new THREE.Mesh(torsoGeo, M.shirt);
  torso.castShadow = true;
  spine.add(torso);

  const neck = new THREE.Group();
  neck.position.y = 0.55;
  spine.add(neck);
  const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), M.skin);
  neckM.position.y = 0.04;
  neck.add(neckM);
  const head = new THREE.Group();
  head.position.y = 0.1;
  neck.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), M.skin);
  skull.scale.set(0.92, 1.12, 1);
  skull.position.y = 0.1;
  skull.castShadow = true;
  head.add(skull);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.117, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair);
  hairM.scale.set(0.95, 1.12, 1.04);
  hairM.position.set(0, 0.115, -0.008);
  hairM.rotation.x = -0.25;
  head.add(hairM);
  if (o.hairLong) {
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.16, 4, 8), M.hair);
    tail.position.set(0, 0.02, -0.1);
    head.add(tail);
  }
  const eyeMat = std(0x1a1a1a, 0.3);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), eyeMat);
    eye.position.set(sx * 0.038, 0.115, 0.098);
    head.add(eye);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), M.skin);
    ear.scale.set(0.5, 1, 0.8);
    ear.position.set(sx * 0.102, 0.1, 0);
    head.add(ear);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.04, 6), M.skin);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.085, 0.112);
  head.add(nose);
  if (o.helmet) {
    const hm = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), std(typeof o.helmet === 'number' ? o.helmet : 0xf2c12e, 0.4));
    hm.position.y = 0.12;
    hm.castShadow = true;
    head.add(hm);
  }

  const arms = {};
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 0.235, 0.47, 0);
    spine.add(shoulder);
    const upper = limb(0.3, 0.058, 0.048, M.shirt);
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    upper.add(elbow);
    const fore = limb(0.27, 0.045, 0.036, o.longSleeve ? M.shirt : M.skin);
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), o.gloves ? std(o.gloves, 0.7) : M.skin);
    hand.scale.set(0.8, 1.2, 0.55);
    hand.position.y = -0.3;
    fore.add(hand);
    arms[side] = { shoulder, upper, elbow, fore };
  }
  const legs = {};
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.1, -0.04, 0);
    hips.add(hip);
    const thigh = limb(0.45, 0.085, 0.06, M.pants);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.45;
    thigh.add(knee);
    const shin = limb(0.43, 0.058, 0.042, o.shorts ? M.skin : M.pants);
    knee.add(shin);
    const ankle = new THREE.Group();
    ankle.position.y = -0.44;
    shin.add(ankle);
    const shoeGeo = new THREE.CapsuleGeometry(0.05, 0.14, 4, 8);
    shoeGeo.rotateX(Math.PI / 2);
    shoeGeo.scale(1, 0.75, 1);
    const shoe = new THREE.Mesh(shoeGeo, M.shoes);
    shoe.position.set(0, -0.02, 0.05);
    shoe.castShadow = true;
    ankle.add(shoe);
    legs[side] = { hip, thigh, knee, shin, ankle };
  }
  if (o.shorts) {
    for (const s of ['L', 'R']) {
      const short = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.09, 0.22, 10), M.pants);
      short.position.y = -0.1;
      legs[s].thigh.add(short);
    }
  }

  if (o.harness) {
    const hm = std(0xff6a00, 0.6);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 20), hm);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.1, 0.8, 1);
    belt.position.y = 0.02;
    hips.add(belt);
    for (const sx of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.02), hm);
      strap.position.set(sx * 0.1, 0.3, 0.125);
      strap.rotation.z = sx * 0.12;
      spine.add(strap);
    }
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.14), std(0x3b4a5a, 0.8));
    pack.position.set(0, 0.32, -0.17);
    pack.castShadow = true;
    spine.add(pack);
    const carab = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.3 }));
    carab.position.set(0, -0.05, 0.15);
    hips.add(carab);
  }
  if (o.bib) {
    const bib = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.15), new THREE.MeshStandardMaterial({ map: bibTexture(o.bib), roughness: 0.9 }));
    bib.position.set(0, 0.28, 0.128);
    spine.add(bib);
  }
  if (o.apron) {
    const ap = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.62), std(o.apron, 0.9));
    ap.position.set(0, 0.06, 0.13);
    spine.add(ap);
  }

  const c = { root, hips, spine, neck, head, arms, legs, opts: o };
  resetPose(c);
  return c;
}

export function resetPose(c) {
  c.hips.position.y = 0.95;
  c.hips.rotation.set(0, 0, 0);
  c.spine.rotation.set(0, 0, 0);
  c.neck.rotation.set(0, 0, 0);
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    c.arms[s].upper.rotation.set(0, 0, sx * 0.08);
    c.arms[s].elbow.rotation.set(-0.15, 0, 0);
    c.legs[s].thigh.rotation.set(0, 0, 0);
    c.legs[s].knee.rotation.set(0, 0, 0);
    c.legs[s].ankle.rotation.set(0, 0, 0);
  }
}

/** 站立呼吸。 */
export function poseIdle(c, t) {
  resetPose(c);
  const b = Math.sin(t * 2) * 0.015;
  c.spine.rotation.x = b;
  c.arms.L.upper.rotation.z = 0.08 + b;
  c.arms.R.upper.rotation.z = -0.08 - b;
}

/** 走/跑。phase 為步伐相位(弧度),amp 0~1(1 = 跑步)。 */
export function poseWalk(c, phase, amp = 0.5) {
  resetPose(c);
  const s = Math.sin(phase), co = Math.cos(phase);
  const a = 0.35 + amp * 0.45;
  c.legs.L.thigh.rotation.x = -s * a;
  c.legs.R.thigh.rotation.x = s * a;
  c.legs.L.knee.rotation.x = Math.max(0, co) * (0.4 + amp * 0.9);
  c.legs.R.knee.rotation.x = Math.max(0, -co) * (0.4 + amp * 0.9);
  c.arms.L.upper.rotation.x = s * a * 0.9;
  c.arms.R.upper.rotation.x = -s * a * 0.9;
  c.arms.L.elbow.rotation.x = -0.3 - amp * 0.9;
  c.arms.R.elbow.rotation.x = -0.3 - amp * 0.9;
  c.spine.rotation.x = 0.04 + amp * 0.18;
  c.hips.position.y = 0.95 - amp * 0.04 + Math.abs(Math.sin(phase)) * (0.02 + amp * 0.04);
  c.spine.rotation.y = s * 0.08;
}

/** 爬樓梯:腿抬高、身體前傾、一手拉扶手。 */
export function poseStairs(c, phase, effort = 0.6, rail = false) {
  resetPose(c);
  const s = Math.sin(phase), co = Math.cos(phase);
  const lift = 0.55 + effort * 0.35;
  const L = Math.max(0, s), R = Math.max(0, -s);
  c.legs.L.thigh.rotation.x = -0.15 - L * lift + R * 0.2;
  c.legs.R.thigh.rotation.x = -0.15 - R * lift + L * 0.2;
  c.legs.L.knee.rotation.x = 0.2 + L * lift * 1.5;
  c.legs.R.knee.rotation.x = 0.2 + R * lift * 1.5;
  c.legs.L.ankle.rotation.x = -L * 0.3;
  c.legs.R.ankle.rotation.x = -R * 0.3;
  c.spine.rotation.x = 0.28 + effort * 0.15;
  c.neck.rotation.x = -0.2;
  c.hips.position.y = 0.92 + Math.abs(co) * 0.03;
  c.arms.L.upper.rotation.x = s * 0.6;
  c.arms.L.elbow.rotation.x = -1.1;
  if (rail) {
    c.arms.R.upper.rotation.set(-0.9, 0, -0.5);
    c.arms.R.elbow.rotation.x = -0.4 - R * 0.6;
  } else {
    c.arms.R.upper.rotation.x = -s * 0.6;
    c.arms.R.elbow.rotation.x = -1.1;
  }
}

/** 攀爬(面向牆壁)。phase 隨攀爬推進;lean 為牆面傾角(外擴為正)。 */
export function poseClimb(c, phase, lean = 0) {
  resetPose(c);
  const s = Math.sin(phase);
  const L = (s + 1) / 2, R = 1 - L;
  // 手:一高一低,交替伸展
  c.arms.L.upper.rotation.x = -2.2 - L * 0.7;
  c.arms.R.upper.rotation.x = -2.2 - R * 0.7;
  c.arms.L.upper.rotation.z = 0.35;
  c.arms.R.upper.rotation.z = -0.35;
  c.arms.L.elbow.rotation.x = -(1 - L) * 1.2 - 0.15;
  c.arms.R.elbow.rotation.x = -(1 - R) * 1.2 - 0.15;
  // 腳:對角交替
  c.legs.L.thigh.rotation.x = -0.25 - R * 0.9;
  c.legs.R.thigh.rotation.x = -0.25 - L * 0.9;
  c.legs.L.thigh.rotation.z = 0.22;
  c.legs.R.thigh.rotation.z = -0.22;
  c.legs.L.knee.rotation.x = 0.4 + R * 1.3;
  c.legs.R.knee.rotation.x = 0.4 + L * 1.3;
  c.legs.L.ankle.rotation.x = 0.5;
  c.legs.R.ankle.rotation.x = 0.5;
  c.spine.rotation.x = 0.12 - lean * 0.5;
  c.neck.rotation.x = -0.5;
  c.hips.rotation.y = s * 0.08;
}

/** 坐著(椅子高度約 0.46m)。 */
export function poseSit(c, t = 0) {
  resetPose(c);
  c.hips.position.y = 0.5;
  for (const s of ['L', 'R']) {
    c.legs[s].thigh.rotation.x = -1.45;
    c.legs[s].knee.rotation.x = 1.45;
  }
  c.arms.L.upper.rotation.x = -0.5;
  c.arms.R.upper.rotation.x = -0.5;
  c.arms.L.elbow.rotation.x = -0.9;
  c.arms.R.elbow.rotation.x = -0.9 + Math.sin(t) * 0.05;
  c.spine.rotation.x = -0.05;
}

/** 雙手撐膝喘氣(終點)。 */
export function poseTired(c, t) {
  resetPose(c);
  c.spine.rotation.x = 0.7 + Math.sin(t * 5) * 0.04;
  c.neck.rotation.x = -0.6;
  c.hips.position.y = 0.88;
  for (const s of ['L', 'R']) {
    c.legs[s].thigh.rotation.x = -0.35;
    c.legs[s].knee.rotation.x = 0.5;
    c.arms[s].upper.rotation.x = -0.9;
    c.arms[s].elbow.rotation.x = -0.2;
  }
}

/** 歡呼。 */
export function poseCheer(c, t) {
  resetPose(c);
  const w = Math.sin(t * 6) * 0.2;
  c.arms.L.upper.rotation.set(-2.9 + w, 0, 0.4);
  c.arms.R.upper.rotation.set(-2.9 - w, 0, -0.4);
  c.hips.position.y = 0.95 + Math.max(0, Math.sin(t * 6)) * 0.08;
}

/** 用望遠鏡/靠欄杆。 */
export function poseLean(c, t) {
  resetPose(c);
  c.spine.rotation.x = 0.25;
  c.arms.L.upper.rotation.x = -1.2;
  c.arms.R.upper.rotation.x = -1.2;
  c.arms.L.elbow.rotation.x = -0.6;
  c.arms.R.elbow.rotation.x = -0.6;
  c.neck.rotation.x = Math.sin(t * 0.5) * 0.05;
}
