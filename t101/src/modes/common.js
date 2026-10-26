// 共用:環繞攝影機、降落傘模型。
import * as THREE from 'three';
import { canvasTex } from '../world/textures.js?v=6ba67c5';

/** 第三人稱環繞攝影機(拖曳轉向、滾輪縮放)。 */
export class OrbitCam {
  constructor(cam, { yaw = 0, pitch = 0.2, dist = 6, min = 2, max = 30, yawLimit = null, pitchMin = -0.6, pitchMax = 1.3 } = {}) {
    Object.assign(this, { cam, yaw, pitch, dist, min, max, yawLimit, pitchMin, pitchMax });
    this.target = new THREE.Vector3();
    this.smooth = new THREE.Vector3();
    this.first = true;
  }
  /** 切換到預設視角(平滑過渡)。 */
  preset(v) { this.goal = { yaw: v.yaw ?? this.yaw, pitch: v.pitch ?? this.pitch, dist: v.dist ?? this.dist }; }
  handle(input, sens = 0.005) {
    if (input.drag.dx || input.drag.dy || input.wheel) this.goal = null;
    this.yaw -= input.drag.dx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.drag.dy * sens, this.pitchMin, this.pitchMax);
    if (this.yawLimit != null) this.yaw = THREE.MathUtils.clamp(this.yaw, -this.yawLimit, this.yawLimit);
    if (input.wheel) this.dist = THREE.MathUtils.clamp(this.dist * (input.wheel > 0 ? 1.12 : 0.89), this.min, this.max);
  }
  /** baseYaw:攝影機預設所在方位(弧度,0 = 在 +Z 側)。 */
  update(dt, target, baseYaw = 0, distOverride) {
    if (this.first) { this.smooth.copy(target); this.first = false; if (this.goal) { Object.assign(this, this.goal); this.goal = null; } }
    if (this.goal) {
      const k = 1 - Math.pow(0.004, dt);
      let dy = this.goal.yaw - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * k;
      this.pitch += (this.goal.pitch - this.pitch) * k;
      this.dist += (this.goal.dist - this.dist) * k;
      if (Math.abs(dy) < 0.002 && Math.abs(this.goal.dist - this.dist) < 0.01 && Math.abs(this.goal.pitch - this.pitch) < 0.002) this.goal = null;
    }
    this.smooth.lerp(target, 1 - Math.pow(0.0005, dt));
    const d = distOverride ?? this.dist;
    const y = baseYaw + this.yaw;
    const off = new THREE.Vector3(Math.sin(y) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(y) * Math.cos(this.pitch)).multiplyScalar(d);
    this.cam.position.copy(this.smooth).add(off);
    this.cam.lookAt(this.smooth);
    return off;
  }
}

/** 降落傘(傘頂在 +Y,原點為吊帶)。 */
export function buildParachute() {
  const g = new THREE.Group();
  const tex = canvasTex(512, 64, (c, w, h) => {
    const cols = ['#c62828', '#f5f0e6', '#2f7a80', '#f5f0e6'];
    for (let i = 0; i < 16; i++) { c.fillStyle = cols[i % 4]; c.fillRect(i * w / 16, 0, w / 16 + 1, h); }
  });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(4.2, 32, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
  canopy.scale.set(1, 0.55, 0.8);
  canopy.position.y = 4.2;
  canopy.castShadow = true;
  g.add(canopy);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xdddddd });
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rim = new THREE.Vector3(Math.cos(a) * 4.2 * Math.sin(Math.PI * 0.42), 4.2 + 4.2 * 0.55 * Math.cos(Math.PI * 0.42), Math.sin(a) * 4.2 * 0.8 * Math.sin(Math.PI * 0.42));
    pts.push(new THREE.Vector3(0, 1.4, 0), rim);
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  return g;
}
