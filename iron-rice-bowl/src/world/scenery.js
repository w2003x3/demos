// 窗外景色:天空、太陽、田野/住家/樹木/電車線、遠山、海岸,以及停站時的月台。
// 列車座標固定在原點,景物以「平鋪圖層」往 -X 捲動(group 位移 = -(s mod T)),不需逐物件更新。
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Tex, rng } from '../core/textures.js';
import { makeInstanced } from '../core/assets.js';

const RAIL_Y = -1.1;
const TIMES = {
  morning: { elev: 22, azim: 125, turb: 6, ray: 1.6, sun: '#ffe2bd', sunI: 2.6, hemi: ['#cfe3ff', '#59623f', 0.9], fog: '#c9d7e3' },
  noon:    { elev: 58, azim: 160, turb: 4, ray: 1.0, sun: '#fff6e8', sunI: 3.2, hemi: ['#d6e8ff', '#5b6640', 1.0], fog: '#c4d5e6' },
  sunset:  { elev: 9,  azim: 250, turb: 9, ray: 3.0, sun: '#ffb070', sunI: 2.4, hemi: ['#ffd2b0', '#4a4232', 0.7], fog: '#e3b996' },
};
const THEMES = {
  town:   { houses: 80, trees: 160, palms: 0.05, mountainsL: true, mountainsR: false, ocean: false },
  rural:  { houses: 30, trees: 220, palms: 0.1, mountainsL: true, mountainsR: true, ocean: false },
  coast:  { houses: 18, trees: 150, palms: 0.25, mountainsL: true, mountainsR: false, ocean: true },
  valley: { houses: 14, trees: 200, palms: 0.35, mountainsL: true, mountainsR: true, ocean: false },
};

class TiledLayer {
  constructor(T) {
    this.T = T;
    this.group = new THREE.Group();
  }
  /** 每個實例會在 [-T, 0, +T] 三份複製,形成無縫週期。 */
  addInstances(source, transforms, opts = {}) {
    const all = [];
    for (const c of [-1, 0, 1]) {
      for (const t of transforms) {
        const m = t.matrix.clone();
        m.elements[12] += c * this.T;
        all.push({ m, color: t.color });
      }
    }
    for (const im of makeInstanced(source, all.length, { shadow: false, ...opts })) {
      all.forEach((a, i) => {
        im.setMatrixAt(i, a.m);
        if (im.userData.colored && a.color) im.setColorAt(i, a.color);
      });
      this.group.add(im);
    }
  }
  addMesh(geo, mat, transforms) {
    const src = new THREE.Mesh(geo, mat);
    src.material.name = src.material.name || 'Inst';
    this.addInstances(src, transforms, { colorSlots: transforms[0]?.color ? [src.material.name] : [] });
  }
  update(s) { this.group.position.x = -(((s % this.T) + this.T) % this.T); }
}

const mtx = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));

export class Scenery {
  constructor(renderer, opts, assets, quality = { shadowSize: 2048 }) {
    this.quality = quality;
    this.group = new THREE.Group();
    this.theme = THEMES[opts.theme] || THEMES.rural;
    this.time = TIMES[opts.time] || TIMES.noon;
    this.layers = [];
    this.scrollTex = [];
    this._sky();
    this._lights();
    this._ground(opts.theme);
    this._track();
    this._catenary();
    this._houses();
    this._trees();
    this._mountains();
    this._platform(assets);
  }

  _sky() {
    const t = this.time;
    const sky = new Sky();
    sky.scale.setScalar(20000);
    const u = sky.material.uniforms;
    u.turbidity.value = t.turb;
    u.rayleigh.value = t.ray;
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.8;
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1,
      THREE.MathUtils.degToRad(90 - t.elev), THREE.MathUtils.degToRad(t.azim));
    u.sunPosition.value.copy(this.sunDir);
    this.sky = sky;
    this.group.add(sky);
    this.fog = new THREE.Fog(t.fog, 250, 4200);
  }

  _lights() {
    const t = this.time;
    const sun = new THREE.DirectionalLight(t.sun, t.sunI);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.quality.shadowSize || 1024, this.quality.shadowSize || 1024);
    const c = sun.shadow.camera;
    c.left = -26; c.right = 26; c.top = 14; c.bottom = -14; c.near = 1; c.far = 120;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.sun = sun;
    this.group.add(sun, sun.target);
    const [sk, gr, hi] = t.hemi;
    this.group.add(new THREE.HemisphereLight(sk, gr, hi));
  }

  _ground(theme) {
    const tex = Tex.ground(theme);
    tex.repeat.set(6000 / 64, 8000 / 64);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(6000, 8000), mat);
    g.rotation.x = -Math.PI / 2;
    g.position.y = RAIL_Y - 0.35;
    g.receiveShadow = true;
    this.group.add(g);
    this.scrollTex.push({ tex, size: 64 });
    if (this.theme.ocean) {
      const ocean = new THREE.Mesh(new THREE.PlaneGeometry(9000, 4000),
        new THREE.MeshStandardMaterial({ color: '#1f5a78', roughness: 0.12, metalness: 0.2 }));
      ocean.rotation.x = -Math.PI / 2;
      ocean.position.set(0, RAIL_Y - 0.3, 2060);
      const sand = new THREE.Mesh(new THREE.PlaneGeometry(9000, 30),
        new THREE.MeshStandardMaterial({ color: '#b8a77e', roughness: 1 }));
      sand.rotation.x = -Math.PI / 2;
      sand.position.set(0, RAIL_Y - 0.32, 55);
      this.group.add(ocean, sand);
    }
  }

  _track() {
    for (const z of [0, 4.3]) {
      const tex = Tex.ballast();
      tex.repeat.set(4000 / 6, 1);
      const bed = new THREE.Mesh(new THREE.PlaneGeometry(4000, 3.2),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
      bed.rotation.x = -Math.PI / 2;
      bed.position.set(0, RAIL_Y - 0.2, z);
      bed.receiveShadow = true;
      this.group.add(bed);
      this.scrollTex.push({ tex, size: 6 });
      const railMat = new THREE.MeshStandardMaterial({ color: '#8a8580', metalness: 0.9, roughness: 0.35 });
      for (const rz of [-0.535, 0.535]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(4000, 0.16, 0.07), railMat);
        rail.position.set(0, RAIL_Y - 0.08, z + rz);
        this.group.add(rail);
      }
    }
  }

  _catenary() {
    const L = new TiledLayer(800);
    const steel = new THREE.MeshStandardMaterial({ color: '#6b7177', metalness: 0.6, roughness: 0.5 });
    const masts = [], arms = [];
    for (let x = 0; x < 800; x += 50) {
      masts.push({ matrix: mtx(x, RAIL_Y + 3.6, 7.0) });
      arms.push({ matrix: mtx(x, RAIL_Y + 6.3, 3.0) });
    }
    L.addMesh(new THREE.BoxGeometry(0.3, 7.2, 0.3), steel, masts);
    L.addMesh(new THREE.BoxGeometry(0.12, 0.12, 8.4), steel, arms);
    this.layers.push(L);
    this.group.add(L.group);
    const wireMat = new THREE.MeshBasicMaterial({ color: '#2a2a2a' });
    for (const z of [0, 4.3]) for (const y of [RAIL_Y + 5.3, RAIL_Y + 6.2]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(4000, 0.015, 0.015), wireMat);
      w.position.set(0, y, z);
      this.group.add(w);
    }
  }

  _houses() {
    const R = rng(21);
    const L = new TiledLayer(800);
    const facade = Tex.facade(3);
    const wallMat = new THREE.MeshStandardMaterial({ map: facade, roughness: 0.9, name: 'House' });
    const roofMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, metalness: 0.4, name: 'Roof' });
    const tankMat = new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.3, metalness: 0.8 });
    const walls = [], roofs = [], tanks = [];
    const wallColors = ['#e8e3d8', '#d9d4c9', '#c9c3b6', '#e6d3c1', '#d7dadc', '#efe9df', '#cfc0ae'];
    const roofColors = ['#3d6fa3', '#4f8a5a', '#8a3b30', '#7d8287', '#2f5d8c'];
    const zRange = this.theme.ocean ? [[-260, -24], [16, 40]] : [[-260, -24], [24, 260]];
    for (let i = 0; i < this.theme.houses; i++) {
      const [z0, z1] = zRange[R() < 0.6 ? 0 : 1];
      const z = z0 + R() * (z1 - z0);
      const x = R() * 800;
      const w = 6 + R() * 5, d = 9 + R() * 6, h = 6 + R() * 10;
      walls.push({ matrix: mtx(x, RAIL_Y - 0.3 + h / 2, z, w, h, d), color: new THREE.Color(wallColors[(R() * wallColors.length) | 0]) });
      if (R() < 0.6) {
        roofs.push({ matrix: mtx(x - w * 0.15, RAIL_Y - 0.3 + h + 1.1, z, w * 0.6, 2.2, d * 0.7), color: new THREE.Color(roofColors[(R() * roofColors.length) | 0]) });
      }
      tanks.push({ matrix: mtx(x + w * 0.25, RAIL_Y - 0.3 + h + 0.7, z + d * 0.25, 1, 1, 1) });
    }
    L.addInstances(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), wallMat), walls, { colorSlots: ['House'] });
    if (roofs.length) L.addInstances(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), roofMat), roofs, { colorSlots: ['Roof'] });
    L.addMesh(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 12), tankMat, tanks);
    this.layers.push(L);
    this.group.add(L.group);
  }

  _trees() {
    const R = rng(33);
    const L = new TiledLayer(800);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a4636', roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true, name: 'Leaf' });
    const trunks = [], crowns = [], palmT = [], palmC = [];
    const greens = ['#3f6b2f', '#4b7a34', '#2f5a28', '#5a8a3a', '#466f30'];
    for (let i = 0; i < this.theme.trees; i++) {
      const side = R() < 0.5 ? -1 : 1;
      if (this.theme.ocean && side > 0 && R() < 0.7) continue;
      const z = side * (9 + R() * (side > 0 && this.theme.ocean ? 35 : 220));
      const x = R() * 800;
      const color = new THREE.Color(greens[(R() * greens.length) | 0]);
      if (R() < this.theme.palms) { // 檳榔樹
        const h = 7 + R() * 5;
        palmT.push({ matrix: mtx(x, RAIL_Y - 0.3 + h / 2, z, 1, h, 1) });
        palmC.push({ matrix: mtx(x, RAIL_Y - 0.3 + h, z, 1.6, 0.8, 1.6, R() * 6), color });
      } else {
        const s = 2.5 + R() * 3.5;
        trunks.push({ matrix: mtx(x, RAIL_Y - 0.3 + s * 0.4, z, 1, s * 0.8, 1) });
        crowns.push({ matrix: mtx(x, RAIL_Y - 0.3 + s * 1.15, z, s, s * 0.85, s, R() * 6), color });
      }
    }
    L.addMesh(new THREE.CylinderGeometry(0.15, 0.25, 1, 6), trunkMat, trunks);
    L.addInstances(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), leafMat), crowns, { colorSlots: ['Leaf'] });
    if (palmT.length) {
      L.addMesh(new THREE.CylinderGeometry(0.1, 0.13, 1, 6), trunkMat, palmT);
      L.addInstances(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), leafMat), palmC, { colorSlots: ['Leaf'] });
    }
    this.layers.push(L);
    this.group.add(L.group);
  }

  _mountains() {
    const R = rng(77);
    const L = new TiledLayer(6000);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, name: 'Mountain' });
    const geo = new THREE.ConeGeometry(1, 1, 9, 4);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < 0.49) {
        const k = 1 + (R() - 0.5) * 0.35;
        pos.setX(i, pos.getX(i) * k);
        pos.setZ(i, pos.getZ(i) * k);
        pos.setY(i, y + (R() - 0.5) * 0.08);
      }
    }
    geo.computeVertexNormals();
    const list = [];
    const sides = [];
    if (this.theme.mountainsL) sides.push(-1);
    if (this.theme.mountainsR) sides.push(1);
    for (const side of sides) {
      for (let i = 0; i < 46; i++) {
        const dist = 700 + R() * 1600;
        const h = 250 + R() * 900 * (dist / 1500);
        const r = h * (1.6 + R());
        const c = new THREE.Color().setHSL(0.3 + R() * 0.08, 0.28, 0.22 + R() * 0.08);
        list.push({ matrix: mtx(R() * 6000, RAIL_Y - 0.3 + h / 2, side * dist, r, h, r * 0.8, R() * 6), color: c });
      }
    }
    if (list.length) L.addInstances(new THREE.Mesh(geo, mat), list, { colorSlots: ['Mountain'] });
    this.layers.push(L);
    this.group.add(L.group);
  }

  /** 停站月台:島式月台模組 × 12(240 m)、站名牌、候車旅客。 */
  _platform(assets) {
    const g = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const p = assets.platform.clone(true);
      p.position.x = -110 + i * 20;
      g.add(p);
    }
    this.signTex = Tex.label(() => {}, 512, 160);
    const signMat = new THREE.MeshBasicMaterial({ map: this.signTex });
    const frameMat = new THREE.MeshStandardMaterial({ color: '#2a2d31', metalness: 0.6, roughness: 0.4 });
    for (let x = -100; x <= 100; x += 40) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.72, 0.08), frameMat);
      frame.position.set(x, 3.75, 2.7);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.66), signMat);
      sign.position.set(x, 3.75, 2.745);
      g.add(frame, sign);
    }
    // 候車旅客
    const R = rng(91);
    const tops = ['#d8d8d8', '#2f3a4f', '#7a2e2e', '#e6d5b8', '#3d5a40', '#b6c4d6', '#c7793b'];
    const people = [];
    for (let i = 0; i < 26; i++) {
      people.push({
        matrix: mtx(-110 + R() * 220, 1.15, -1.5 + R() * 3.5, 1, 1, 1, Math.PI / 2 + (R() - 0.5) * 2),
        color: new THREE.Color(tops[(R() * tops.length) | 0]),
      });
    }
    for (const im of makeInstanced(assets.passengerStand, people.length, { colorSlots: ['Top'] })) {
      people.forEach((p, i) => { im.setMatrixAt(i, p.matrix); if (im.userData.colored) im.setColorAt(i, p.color); });
      g.add(im);
    }
    g.position.set(0, RAIL_Y, -5.5);
    g.visible = false;
    this.platform = g;
    this.group.add(g);
    this.signStation = null;
  }

  setStationSign(st, prev, next) {
    if (this.signStation === st) return;
    this.signStation = st;
    const c = this.signTex.image.getContext('2d');
    const w = 512, h = 160;
    c.fillStyle = '#f7f7f5'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#0d4f8b'; c.fillRect(0, h - 34, w, 34);
    c.fillStyle = '#111';
    c.textAlign = 'center';
    c.font = 'bold 66px "Noto Sans TC","Microsoft JhengHei",sans-serif';
    c.fillText(st.zh, w / 2, 70);
    c.font = '26px "Segoe UI",sans-serif';
    c.fillText(st.en, w / 2, 106);
    c.fillStyle = '#fff';
    c.font = '20px "Noto Sans TC","Microsoft JhengHei",sans-serif';
    c.textAlign = 'left';
    if (prev) c.fillText(`◀ ${prev.zh}`, 12, h - 10);
    c.textAlign = 'right';
    if (next) c.fillText(`${next.zh} ▶`, w - 12, h - 10);
    this.signTex.needsUpdate = true;
  }

  /** s:累計行駛距離;platformX:最近車站月台相對位置(null = 不顯示);focusX:陰影跟隨位置。 */
  update(s, platformX, focusX) {
    for (const L of this.layers) L.update(s);
    for (const { tex, size } of this.scrollTex) tex.offset.x = (s / size) % 1;
    this.platform.visible = platformX !== null && Math.abs(platformX) < 2000;
    if (this.platform.visible) this.platform.position.x = platformX;
    this.sun.position.copy(this.sunDir).multiplyScalar(60).add(new THREE.Vector3(focusX, 0, 0));
    this.sun.target.position.set(focusX, 0, 0);
  }
}
