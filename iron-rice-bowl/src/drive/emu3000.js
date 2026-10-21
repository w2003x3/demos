// 鈦鐵 EMU3000 新自強號外觀(駕駛場景的車外視角用):白色車體、黑色窗帶、橘色腰帶、斜面流線車頭。
// 模型慣例同 rail-assets:原點在車頭端、車體往 +Z 延伸(列車前進 -Z)、右 +X、軌面 y = 0。
import * as THREE from 'three';

const W = 2.9, L0 = 23.5;
let M = null;
function mats() {
  if (M) return M;
  M = {
    body: new THREE.MeshStandardMaterial({ color: '#eef0f1', roughness: 0.3, metalness: 0.45 }),
    band: new THREE.MeshStandardMaterial({ color: '#121418', roughness: 0.12, metalness: 0.4 }),
    stripe: new THREE.MeshStandardMaterial({ color: '#e8730c', roughness: 0.4 }),
    under: new THREE.MeshStandardMaterial({ color: '#2a2d31', roughness: 0.8 }),
    door: new THREE.MeshStandardMaterial({ color: '#c6cace', roughness: 0.3, metalness: 0.6 }),
    roof: new THREE.MeshStandardMaterial({ color: '#d9dcde', roughness: 0.5, metalness: 0.3 }),
    pan: new THREE.MeshStandardMaterial({ color: '#3a3f44', roughness: 0.4, metalness: 0.8 }),
  };
  return M;
}

/** isHead:有駕駛室車頭;回傳 Group(含 HeadLight / TailLight / DestLED 材質名稱供場景點燈) */
export function emu3000Car(isHead, L = L0) {
  const m = mats(), g = new THREE.Group();
  const box = (mat, w, h, d, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); g.add(o); return o; };
  const nose = isHead ? 3.2 : 0;
  const bodyL = L - nose;
  const bz = nose + bodyL / 2;
  // 車體(圓角感:上緣加一條略窄的頂板)
  box(m.body, W, 2.55, bodyL, 0, 2.15, bz);
  box(m.roof, W - 0.3, 0.35, bodyL, 0, 3.55, bz);
  box(m.band, W + 0.02, 0.95, bodyL - 0.2, 0, 2.55, bz);
  box(m.stripe, W + 0.03, 0.12, bodyL - 0.2, 0, 1.95, bz);
  box(m.under, W - 0.3, 0.55, bodyL - 2, 0, 0.8, bz);
  // 車門(每側兩扇,靠車端)
  for (const s of [-1, 1]) for (const dz of [nose + 3.2, L - 3.2]) box(m.door, 0.04, 1.95, 1.3, s * (W / 2 + 0.01), 1.95, dz);
  // 轉向架
  for (const dz of [nose + 3.5, L - 3.5]) {
    box(m.under, 2.4, 0.5, 2.8, 0, 0.45, dz);
    for (const s of [-1, 1]) for (const w of [-0.9, 0.9]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.12, 16), m.pan); wh.rotation.z = Math.PI / 2; wh.position.set(s * 0.72, 0.43, dz + w); g.add(wh); }
  }
  // 冷氣與集電弓(第 2、5 節的感覺:中間車才有集電弓)
  box(m.roof, 1.8, 0.35, 3.2, 0, 3.85, bz - bodyL * 0.25);
  box(m.roof, 1.8, 0.35, 3.2, 0, 3.85, bz + bodyL * 0.25);
  if (!isHead) {
    const p = new THREE.Group(); p.position.set(0, 3.95, bz);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.8), m.pan); arm.rotation.x = 0.55; arm.position.set(0, 0.45, 0); p.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.12), m.pan); head.position.set(0, 0.9, 0.35); p.add(head);
    g.add(p);
  }
  if (isHead) {
    // 流線車頭:下段白色鼻部 + 斜面黑色擋風(往前收)
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.55); shape.lineTo(nose, 0.55); shape.lineTo(nose, 3.75); shape.lineTo(nose - 0.3, 3.75);
    shape.quadraticCurveTo(0.9, 3.2, 0.25, 1.9); shape.quadraticCurveTo(0, 1.4, 0, 0.55);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2, curveSegments: 10 });
    geo.translate(0, 0, -W / 2);
    geo.rotateY(-Math.PI / 2);   // 形狀 x → 車長方向(+Z)
    const noseMesh = new THREE.Mesh(geo, m.body); g.add(noseMesh);
    // 擋風玻璃(斜面上的黑色面)
    const wind = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.3, 1.5), m.band);
    wind.position.set(0, 2.75, 0.75); wind.rotation.x = -0.95; wind.rotation.y = Math.PI;
    g.add(wind);
    // 頭燈、尾燈、目的地 LED
    const hl = new THREE.MeshStandardMaterial({ name: 'HeadLight', color: '#ffffff', emissive: '#fff4d8', emissiveIntensity: 4 });
    const tl = new THREE.MeshStandardMaterial({ name: 'TailLight', color: '#ff2a2a', emissive: '#ff2020', emissiveIntensity: 0 });
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.05), hl); a.position.set(s * 0.95, 1.35, 0.08); g.add(a);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.05), tl); b.position.set(s * 1.25, 1.15, 0.1); g.add(b);
    }
    const dest = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.24), new THREE.MeshStandardMaterial({ name: 'DestLED', color: '#111', emissive: '#000' }));
    dest.position.set(0, 3.42, nose - 0.32); dest.rotation.x = -0.4; dest.rotation.y = Math.PI;
    g.add(dest);
    box(m.stripe, W + 0.03, 0.12, 0.9, 0, 1.95, nose - 0.4);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
