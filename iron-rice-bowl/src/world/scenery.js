// 窗外景色:天空(HDRI)、田野、道碴/枕木/鋼軌、電車線、街屋與高樓、行道樹、道路電線桿、遠山、海岸,以及停站時的月台。
// 列車座標固定在原點,景物以「平鋪圖層」往 -X 捲動(group 位移 = -(s mod T)),不需逐物件更新。
// 模型、材質、天空來自共用模型庫 rail-assets(assets.rail);載入失敗時改用簡易造型(方塊房屋、球形樹冠、程序化天空)。
// 座標:車廂沿 +X、月台在 -Z 側;rail-assets 的模型前進方向為 -Z,依需要繞 Y 軸旋轉擺放。
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Tex, rng, canvasTexture } from '../core/textures.js';
import { makeInstanced, pickPerson } from '../core/assets.js';

const RAIL_Y = -1.1;          // 軌面高度(車廂地板 = 0;月台面 = 軌面 + 1.1)
const GAUGE = 1.067;          // 台鐵軌距
const TRACK2 = 4.3;           // 第二線中心
// warmth:車內燈光偏鵝黃的程度(0~1);glow:夜間發光(路燈、窗戶、招牌)強度;env:環境反射強度;
// tint/tintI:窗外照進來的色光(黃昏的橘紅夕照),隧道內消失
const TIMES = {
  morning: { elev: 22, azim: 125, turb: 6, ray: 1.6, sun: '#ffe2bd', sunI: 2.6, hemi: ['#cfe3ff', '#59623f', 0.9], fog: '#c9d7e3', hdri: 'day', sky: 0.9, warmth: 0, glow: 0, env: 0.55, label: '早上' },
  noon:    { elev: 58, azim: 160, turb: 4, ray: 1.0, sun: '#fff6e8', sunI: 3.2, hemi: ['#d6e8ff', '#5b6640', 1.0], fog: '#c4d5e6', hdri: 'day', sky: 1.0, warmth: 0, glow: 0, env: 0.55, label: '中午' },
  // 黃昏:低角度的橘紅陽光斜射進車窗
  sunset:  { elev: 9,  azim: 250, turb: 9, ray: 3.0, sun: '#ff6224', sunI: 4.2, hemi: ['#ff9a66', '#3a2a22', 0.55], fog: '#e3a982', hdri: 'dusk', sky: 1.0, warmth: 0.3, glow: 0.4, env: 0.42, label: '黃昏', tint: '#ff7a3a', tintI: 0.55 },
  night:   { elev: 38, azim: 200, turb: 2, ray: 0.3, sun: '#8ea4d6', sunI: 0.35, hemi: ['#34425f', '#0b0d12', 0.3], fog: '#0c111c', hdri: 'night', sky: 1.0, warmth: 1, glow: 1, env: 0.3, label: '夜間', night: true },
};

/** 隨機時段:白天(早上或中午)、黃昏、夜間各約三分之一 */
export function pickTime(R = Math.random) {
  const r = R();
  return r < 1 / 3 ? (R() < 0.5 ? 'morning' : 'noon') : r < 2 / 3 ? 'sunset' : 'night';
}
export const timeLabel = (id) => (TIMES[id] || TIMES.noon).label;

// rows:沿線道路旁連續街屋的密度(0~1);towers:遠處高樓數;road:軌道旁(-Z 側)的道路
const THEMES = {
  town:   { houses: 80, rows: 0.9, towers: 9, trees: 160, palms: 0.05, mountainsL: true, mountainsR: false, ocean: false, road: true },
  rural:  { houses: 30, rows: 0.25, towers: 0, trees: 220, palms: 0.1, mountainsL: true, mountainsR: true, ocean: false, road: true },
  coast:  { houses: 18, rows: 0.3, towers: 0, trees: 150, palms: 0.25, mountainsL: true, mountainsR: false, ocean: true, road: true },
  valley: { houses: 14, rows: 0.15, towers: 0, trees: 200, palms: 0.35, mountainsL: true, mountainsR: true, ocean: false, road: false },
};
const ROAD = { near: -13, far: -19 };   // 道路兩側邊緣(z)
const NEAR_TREE = 90;                     // 這個距離內用 rail-assets 的寫實樹,外側用低面數樹冠

class TiledLayer {
  constructor(T) {
    this.T = T;
    this.group = new THREE.Group();
  }
  /** 每個實例會在 [-T, 0, +T] 三份複製,形成無縫週期。 */
  addInstances(source, transforms, opts = {}) {
    if (!source || !transforms.length) return;
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

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const mtx = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(Y_AXIS, ry), new THREE.Vector3(sx, sy, sz));

/** 沿 X 方向拉伸的斷面(points:[z, y],由 +Z 側往 -Z 側),UV 以公尺 / size 計。 */
function sweepX(points, x0, x1, size) {
  const pos = [], uv = [], idx = [];
  let acc = 0;
  points.forEach(([z, y], i) => {
    if (i) acc += Math.hypot(z - points[i - 1][0], y - points[i - 1][1]);
    pos.push(x0, y, z, x1, y, z);
    uv.push(x0 / size, acc / size, x1 / size, acc / size);
  });
  // 點的順序由 +Z 往 -Z 時法線朝上
  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Scenery {
  constructor(renderer, opts, assets, quality = { shadowSize: 2048 }) {
    this.quality = quality;
    this.dens = quality.scenery ?? 1;
    this.A = assets;
    this.ra = assets.rail || null;
    this.tex = assets.railTex || {};
    this.group = new THREE.Group();
    this.theme = THEMES[opts.theme] || THEMES.rural;
    this.time = TIMES[opts.time] || TIMES.noon;
    this.layers = [];
    this.scrollTex = [];
    this.background = null;
    this.envMap = null;
    this._sky();
    this._lights();
    this._ground(opts.theme);
    this._track();
    this._catenary();
    this._roadside();
    this._houses();
    this._trees();
    this._mountains();
    this._platform(assets);
    this.tunnels = [];
    this.tunnelF = 0;
    this.curtains = false;
    // 夜間/黃昏:rail-assets 的路燈、窗戶、招牌、月台燈發光(白天也要呼叫一次,把共用材質還原)
    if (this.ra) this.ra.setNight(this.group, this.time.glow);
    this.outdoor = this.group.children.filter((o) => !o.isLight && o !== this.sun.target && o !== this.sky);
    this.ready = this._environment(renderer);
  }

  /**
   * 隧道(雙線、混凝土襯砌、牆上燈具、洞口與山體)。list:[{ s0, s1 }](路線里程,公尺)。
   * 列車固定在原點,隧道依里程換算位置:世界 x = 里程 - s + center(與月台相同)。
   */
  setTunnels(list, center) {
    this.center = center;
    for (const t of this.tunnels) this.group.remove(t.group);
    this.tunnels = list.map(({ s0, s1 }) => {
      const g = this._tunnel(s1 - s0);
      g.visible = false;
      this.group.add(g);
      return { s0, s1, group: g };
    });
  }

  _tunnel(len) {
    const g = new THREE.Group();
    const zc = TRACK2 / 2, hw = 5.4, wallTop = RAIL_Y + 4.6, rise = 3.2;
    // 斷面:+Z 側牆 → 拱頂 → -Z 側牆(雙面材質,內外都看得到)
    const prof = [[zc + hw, RAIL_Y - 0.45]];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI;
      prof.push([zc + Math.cos(a) * hw, wallTop + Math.sin(a) * rise]);
    }
    prof.push([zc - hw, RAIL_Y - 0.45]);
    const lining = this.tex.concrete ? this.tex.concrete.clone() : new THREE.MeshStandardMaterial({ roughness: 0.95 });
    lining.color.set('#8f8b83');
    lining.side = THREE.DoubleSide;
    const tube = new THREE.Mesh(sweepX(prof, 0, len, 4), lining);
    tube.receiveShadow = true;
    g.add(tube);
    // 牆上燈具(每 25 m,兩側)
    const lamps = [];
    for (let x = 12; x < len; x += 25) for (const side of [1, -1]) lamps.push(mtx(x, RAIL_Y + 3.4, zc + side * (hw - 0.1)));
    const lampMat = new THREE.MeshStandardMaterial({ color: '#2a2a2a', emissive: '#ffd27a', emissiveIntensity: 4 });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.12, 0.14), lampMat, lamps.length);
    lamps.forEach((m, i) => im.setMatrixAt(i, m));
    g.add(im);
    // 洞口端牆(中間挖出與斷面相同的洞)
    const face = new THREE.Shape();
    const W = 30, H = 12.5;
    face.moveTo(-(zc + W / 2), RAIL_Y - 0.5); face.lineTo(-(zc - W / 2), RAIL_Y - 0.5);
    face.lineTo(-(zc - W / 2), RAIL_Y + H); face.lineTo(-(zc + W / 2), RAIL_Y + H); face.closePath();
    const hole = new THREE.Path();
    prof.forEach(([z, y], i) => (i ? hole.lineTo(-z, y) : hole.moveTo(-z, y)));
    hole.closePath();
    face.holes.push(hole);
    const faceGeo = new THREE.ExtrudeGeometry(face, { depth: 1.2, bevelEnabled: false });
    faceGeo.rotateY(Math.PI / 2);    // 形狀 (u,v) → 世界 (z = -u, y = v),厚度沿 X
    const portalMat = this.tex.concrete ? this.tex.concrete.clone() : lining;
    portalMat.color?.set('#a9a59c');
    for (const x of [-1.2, len]) {
      const p = new THREE.Mesh(faceGeo, portalMat);
      p.position.x = x;
      p.receiveShadow = true;
      g.add(p);
    }
    // 山體:覆蓋隧道的長形山丘(頂點加雜訊,較自然)
    // 山坡做陡(高度取 0.35 次方):洞口後方很快就升到 25~30 m,蓋住附近的房子;山體從洞口端牆開始,不擋洞口
    const R = rng(Math.round(len));
    const hill = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const pos = hill.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const k = 1 + (y > 0.05 ? (R() - 0.5) * 0.1 : 0);
      pos.setXYZ(i, pos.getX(i) * k, Math.pow(Math.max(y, 0), 0.35) * k, pos.getZ(i) * k);
    }
    hill.computeVertexNormals();
    const hillMesh = new THREE.Mesh(hill, new THREE.MeshStandardMaterial({ color: '#3f5a2d', roughness: 1, flatShading: true }));
    hillMesh.scale.set(len / 2, 34, 130);
    hillMesh.position.set(len / 2, RAIL_Y - 2, zc);
    g.add(hillMesh);
    return g;
  }

  /** 窗簾拉下:窗外景物與隧道都不繪製(燈光保留) */
  setCurtains(on) {
    this.curtains = on;
    for (const o of this.outdoor) o.visible = !on;
    for (const t of this.tunnels) t.group.visible = false;
  }

  /** rail-assets 槽位的已載入變體 id */
  _ids(slot) {
    return this.ra ? this.ra.variants(slot).filter((v) => this.ra.loaded.has(v.id)) : [];
  }

  /** 依變體分組的 transforms 加入圖層(一個變體一組 InstancedMesh) */
  _addVariants(L, slot, byId) {
    for (const [id, list] of Object.entries(byId)) L.addInstances(this.ra.instance(slot, { id }), list);
  }

  /** PBR 材質副本,並登記所有貼圖隨行駛捲動(幾何 UV 已換算成以 size 公尺為一格) */
  _scrollMat(id, size, extra = {}) {
    const base = this.tex[id];
    if (!base) return null;
    const m = base.clone();
    const own = (t) => {
      const c = t.clone();
      c.repeat.set(1, 1);
      c.needsUpdate = true;
      this.scrollTex.push({ tex: c, size });
      return c;
    };
    if (m.map) m.map = own(m.map);
    if (m.normalMap) m.normalMap = own(m.normalMap);
    // arm 貼圖同時當 AO / 粗糙度 / 金屬度:共用一份副本
    if (base.roughnessMap) {
      const arm = own(base.roughnessMap);
      m.roughnessMap = arm;
      if (base.metalnessMap === base.roughnessMap) m.metalnessMap = arm;
      if (base.aoMap === base.roughnessMap) m.aoMap = arm;
    }
    return Object.assign(m, extra);
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
    sky.visible = !t.night;   // 夜間沒有 HDRI 時就是黑夜(程序化天空只做白天/黃昏)
    this.group.add(sky);
    this.fog = new THREE.Fog(t.fog, 250, 4200);
  }

  /**
   * HDRI 天空(rail-assets):當背景與環境光。從影像找出太陽方向(最亮處)讓陽光陰影一致,
   * 並取地平線附近的平均顏色當霧色,遠山與地面才會自然融入天空。
   */
  async _environment(renderer) {
    if (!this.ra) return;
    try {
      const env = await this.ra.environment(this.time.hdri, renderer);
      if (!env) return;
      this.background = env.background;
      this.envMap = env.envMap;
      this.sky.visible = false;
      const { data, width: w, height: h } = env.background.image;
      const half = env.background.type === THREE.HalfFloatType;
      const px = (r, c) => {
        const i = (r * w + c) * 4;
        return half ? [0, 1, 2].map((k) => THREE.DataUtils.fromHalfFloat(data[i + k])) : [data[i], data[i + 1], data[i + 2]];
      };
      // 太陽:上半球最亮的像素
      let best = 0, br = 0, bc = 0;
      for (let r = 0; r < h / 2; r += 2) for (let c = 0; c < w; c += 2) {
        const [R, G, B] = px(r, c);
        const L = R * 0.2126 + G * 0.7152 + B * 0.0722;
        if (L > best) { best = L; br = r; bc = c; }
      }
      if (best > 20) {
        const el = (0.5 - (br + 0.5) / h) * Math.PI, az = ((bc + 0.5) / w - 0.5) * Math.PI * 2;
        if (el > THREE.MathUtils.degToRad(5)) this.sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
      }
      // 夜間:夜空照片通常偏亮(月光、光害),依上半球平均亮度壓到夜晚的亮度
      this.skyScale = 1;
      if (this.time.night) {
        let sumL = 0, cnt = 0;
        for (let r = 0; r < h / 2; r += 4) for (let c = 0; c < w; c += 4) {
          const [R, G, B] = px(r, c);
          const L = R * 0.2126 + G * 0.7152 + B * 0.0722;
          if (L < 5) { sumL += L; cnt++; }      // 略過月亮
        }
        const avg = cnt ? sumL / cnt : 0.03;
        this.skyScale = THREE.MathUtils.clamp(0.025 / Math.max(avg, 1e-4), 0.01, 1);
      }
      // 霧色:地平線上方一小段的平均
      const sum = [0, 0, 0];
      let n = 0;
      for (let r = Math.floor(h * 0.44); r < h * 0.49; r++) for (let c = 0; c < w; c += 4) {
        const v = px(r, c);
        if (v[0] + v[1] + v[2] > 30) continue; // 略過太陽
        sum[0] += v[0]; sum[1] += v[1]; sum[2] += v[2]; n++;
      }
      const k = this.time.sky * this.skyScale;
      if (n) this.fog.color.setRGB(sum[0] / n * k, sum[1] / n * k, sum[2] / n * k, THREE.LinearSRGBColorSpace);
      this._hazeMountains();
    } catch (err) {
      console.warn('HDRI 天空載入失敗,改用程序化天空', err);
    }
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
    this.hemi = new THREE.HemisphereLight(sk, gr, hi);
    this.group.add(this.hemi);
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
    // 軌道兩側的草地(PBR,邊緣淡出到田野)
    const grass = this._scrollMat('grass', 3);
    if (grass) {
      const W = 90;
      const fade = canvasTexture(4, 128, (c, w, h) => {
        const gr = c.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#000'); gr.addColorStop(0.18, '#fff'); gr.addColorStop(0.82, '#fff'); gr.addColorStop(1, '#000');
        c.fillStyle = gr; c.fillRect(0, 0, w, h);
      }, { wrap: false, srgb: false });
      Object.assign(grass, { alphaMap: fade, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      grass.color.set('#d8e0c8');
      const geo = new THREE.PlaneGeometry(4000, W);
      // UV:u 沿 X 每 3 m 一格;alphaMap 用自己的 repeat(1),所以 u/v 先換算成格數再由 alphaMap 縮回
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4000 / 3, uv.getY(i) * W / 3);
      fade.repeat.set(3 / 4000, 3 / W);
      const strip = new THREE.Mesh(geo, grass);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, RAIL_Y - 0.33, TRACK2 / 2);
      strip.receiveShadow = true;
      this.group.add(strip);
    }
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

  /** 雙線軌道:梯形道碴床、PC 枕木、鋼軌(UIC 斷面) */
  _track() {
    const ballast = this._scrollMat('ballast', 2, { roughness: 1 });
    const L = new TiledLayer(120);
    const sleepers = [];
    const railShape = new THREE.Shape();
    // 鋼軌斷面(u = 橫向,v = 高度;軌底在 0,軌頂 0.172)
    [[-0.075, 0], [0.075, 0], [0.075, 0.012], [0.01, 0.03], [0.008, 0.125], [0.036, 0.135], [0.036, 0.172],
      [-0.036, 0.172], [-0.036, 0.135], [-0.008, 0.125], [-0.01, 0.03], [-0.075, 0.012]]
      .forEach(([u, v], i) => (i ? railShape.lineTo(u, v) : railShape.moveTo(u, v)));
    const railGeo = new THREE.ExtrudeGeometry(railShape, { depth: 4000, bevelEnabled: false, curveSegments: 1 });
    railGeo.rotateY(Math.PI / 2);
    railGeo.translate(-2000, RAIL_Y - 0.172, 0);
    const railMat = new THREE.MeshStandardMaterial({ color: '#7d7670', metalness: 0.85, roughness: 0.42 });
    for (const z of [0, TRACK2]) {
      if (ballast) {
        const bed = new THREE.Mesh(sweepX([[z + 2.3, -0.42], [z + 1.55, -0.2], [z - 1.55, -0.2], [z - 2.3, -0.42]]
          .map(([zz, y]) => [zz, RAIL_Y + y]), -2000, 2000, 2), ballast);
        bed.receiveShadow = true;
        this.group.add(bed);
      } else {
        const tex = Tex.ballast();
        tex.repeat.set(4000 / 6, 1);
        const bed = new THREE.Mesh(new THREE.PlaneGeometry(4000, 3.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
        bed.rotation.x = -Math.PI / 2;
        bed.position.set(0, RAIL_Y - 0.2, z);
        bed.receiveShadow = true;
        this.group.add(bed);
        this.scrollTex.push({ tex, size: 6 });
      }
      for (const rz of [-GAUGE / 2 - 0.036, GAUGE / 2 + 0.036]) {
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.z = z + rz;
        this.group.add(rail);
      }
      for (let x = 0; x < 120; x += 0.6) sleepers.push({ matrix: mtx(x, RAIL_Y - 0.172 - 0.09, z) });
    }
    const conc = this.tex.concrete ? this.tex.concrete.clone() : new THREE.MeshStandardMaterial({ color: '#9a9893', roughness: 0.9 });
    conc.color.set('#b9b6ae');
    L.addMesh(new THREE.BoxGeometry(0.24, 0.18, 2.2), conc, sleepers);
    this.layers.push(L);
    this.group.add(L.group);
  }

  _catenary() {
    const L = new TiledLayer(800);
    const masts = [];
    if (this._ids('trackside/mast').length) {
      // rail-assets 電車線桿:懸臂朝本地 -X;-Z 側的桿子懸臂伸向 +Z(本線),+Z 側伸向 -Z(第二線)
      for (let x = 0; x < 800; x += 50) {
        masts.push({ matrix: mtx(x, RAIL_Y, -2.9, 1, 1, 1, Math.PI / 2) });
        masts.push({ matrix: mtx(x + 25, RAIL_Y, TRACK2 + 2.9, 1, 1, 1, -Math.PI / 2) });
      }
      L.addInstances(this.ra.instance('trackside/mast'), masts);
    } else {
      const steel = new THREE.MeshStandardMaterial({ color: '#6b7177', metalness: 0.6, roughness: 0.5 });
      const arms = [];
      for (let x = 0; x < 800; x += 50) {
        masts.push({ matrix: mtx(x, RAIL_Y + 3.6, 7.0) });
        arms.push({ matrix: mtx(x, RAIL_Y + 6.3, 3.0) });
      }
      L.addMesh(new THREE.BoxGeometry(0.3, 7.2, 0.3), steel, masts);
      L.addMesh(new THREE.BoxGeometry(0.12, 0.12, 8.4), steel, arms);
    }
    this.layers.push(L);
    this.group.add(L.group);
    const wireMat = new THREE.MeshBasicMaterial({ color: '#2a2a2a' });
    // 只畫第二線的架空線:本線的架空線在列車正上方,從車內看不到,而且會透過車廂天花板被畫出來(走道上方的長線)
    for (const z of [TRACK2]) for (const y of [RAIL_Y + 5.3, RAIL_Y + 6.2]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(4000, 0.015, 0.015), wireMat);
      w.position.set(0, y, z);
      this.group.add(w);
    }
  }

  /** 軌道旁(-Z 側)的道路:柏油路面、路燈、電線桿、綠籬、配電箱 */
  _roadside() {
    if (!this.ra) return;
    const R = rng(55);
    const L = new TiledLayer(800);
    if (this.theme.road) {
      const asphalt = this._scrollMat('asphalt', 4);
      if (asphalt) {
        const w = ROAD.near - ROAD.far;
        const road = new THREE.Mesh(sweepX([[ROAD.near, RAIL_Y - 0.31], [ROAD.far, RAIL_Y - 0.31]], -2000, 2000, 4), asphalt);
        road.receiveShadow = true;
        this.group.add(road);
        // 標線(中線)
        const line = new THREE.Mesh(new THREE.PlaneGeometry(4000, 0.12), new THREE.MeshStandardMaterial({ color: '#e9e4d2', roughness: 0.8 }));
        line.rotation.x = -Math.PI / 2;
        line.position.set(0, RAIL_Y - 0.305, ROAD.near - w / 2);
        this.group.add(line);
      }
      const lamps = [], poles = [];
      for (let x = 0; x < 800; x += 32) lamps.push({ matrix: mtx(x, RAIL_Y - 0.3, ROAD.near + 0.5, 1, 1, 1, Math.PI / 2) });
      for (let x = 14; x < 800; x += 38) poles.push({ matrix: mtx(x, RAIL_Y - 0.3, ROAD.far - 0.6) });
      L.addInstances(this.ra.instance('street/lamp'), lamps);
      L.addInstances(this.ra.instance('trackside/electric-pole'), poles);
    }
    // 鐵路邊的綠籬(第二線外側;-Z 側停站時是月台)與配電箱
    const hedges = [], boxes = [];
    for (let x = 0; x < 800; x += 3 + R() * 9) {
      if (R() < 0.45 * this.dens) hedges.push({ matrix: mtx(x, RAIL_Y - 0.3, TRACK2 + 3.6 + R() * 1.5, 0.8 + R() * 0.5, 0.7 + R() * 0.5, 0.8, R() * 6) });
    }
    for (let x = 30; x < 800; x += 120 + R() * 120) boxes.push({ matrix: mtx(x, RAIL_Y - 0.3, -3.1, 1, 1, 1, Math.PI) });
    if (!this.theme.ocean) L.addInstances(this.ra.instance('vegetation/shrub'), hedges);
    L.addInstances(this.ra.instance('trackside/utility-box'), boxes);
    this.layers.push(L);
    this.group.add(L.group);
  }

  _houses() {
    const R = rng(21);
    const L = new TiledLayer(800);
    const houseIds = this._ids('building/street');
    if (!houseIds.length) { this._housesSimple(R, L); return; }
    const byId = {};
    const put = (v, m) => (byId[v.id] = byId[v.id] || []).push({ matrix: m });
    // 低面數的變體出現機率高一點(街屋 c 約 5 千面)
    const weighted = houseIds.flatMap((v) => (v.tris > 3000 ? [v] : [v, v]));
    const width = (v) => (v.bounds ? v.bounds.max[0] - v.bounds.min[0] : 7);
    // 沿線道路旁的連續街屋(騎樓朝道路與鐵路)
    const row = (z, ry, density) => {
      let x = R() * 10;
      while (x < 800) {
        if (R() > density * this.dens) { x += 12 + R() * 30; continue; }       // 空地、田
        const n = 2 + ((R() * 7) | 0);                                            // 一排 2~8 間
        for (let i = 0; i < n && x < 800; i++) {
          const v = weighted[(R() * weighted.length) | 0], w = width(v);
          put(v, mtx(x + w / 2, RAIL_Y - 0.3, z, 1, 1, 1, ry));
          x += w;
        }
        x += 3 + R() * 6;                                                         // 巷口
      }
    };
    if (this.theme.road) row(ROAD.far - 1.2, Math.PI, this.theme.rows);
    if (!this.theme.ocean) row(TRACK2 + 9, 0, this.theme.rows * 0.7);
    // 後方零散的房子
    const zRange = this.theme.ocean ? [[-260, -32], [24, 40]] : [[-260, -32], [26, 260]];
    for (let i = 0; i < this.theme.houses * this.dens; i++) {
      const [z0, z1] = zRange[R() < 0.6 ? 0 : 1];
      const v = weighted[(R() * weighted.length) | 0];
      put(v, mtx(R() * 800, RAIL_Y - 0.3, z0 + R() * (z1 - z0), 1, 1, 1, R() < 0.5 ? 0 : Math.PI));
    }
    this._addVariants(L, 'building/street', byId);
    // 遠處高樓
    const towers = {};
    for (const v of this._ids('building/tower')) towers[v.id] = [];
    const tids = Object.keys(towers);
    for (let i = 0; i < this.theme.towers * this.dens && tids.length; i++) {
      const side = R() < 0.7 ? -1 : 1;
      towers[tids[(R() * tids.length) | 0]].push({ matrix: mtx(R() * 800, RAIL_Y - 0.3, side * (140 + R() * 300), 1, 0.7 + R() * 0.5, 1, R() * 6) });
    }
    this._addVariants(L, 'building/tower', towers);
    this.layers.push(L);
    this.group.add(L.group);
  }

  /** 簡易房屋(rail-assets 無法載入時) */
  _housesSimple(R, L) {
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
    const trunks = [], crowns = [], palmT = [], palmC = [], real = {};
    const treeIds = this._ids('vegetation/tree');
    const greens = ['#3f6b2f', '#4b7a34', '#2f5a28', '#5a8a3a', '#466f30'];
    const blocked = (z) => (this.theme.road && z < ROAD.near + 1 && z > ROAD.far - 14) || (z > -3.5 && z < TRACK2 + 3.5);
    for (let i = 0; i < this.theme.trees; i++) {
      const side = R() < 0.5 ? -1 : 1;
      if (this.theme.ocean && side > 0 && R() < 0.7) continue;
      const z = side * (9 + R() * (side > 0 && this.theme.ocean ? 35 : 220));
      const x = R() * 800;
      const color = new THREE.Color(greens[(R() * greens.length) | 0]);
      if (blocked(z)) continue;
      if (R() < this.theme.palms) { // 檳榔樹
        const h = 7 + R() * 5;
        palmT.push({ matrix: mtx(x, RAIL_Y - 0.3 + h / 2, z, 1, h, 1) });
        palmC.push({ matrix: mtx(x, RAIL_Y - 0.3 + h, z, 1.6, 0.8, 1.6, R() * 6), color });
      } else if (treeIds.length && Math.abs(z) < NEAR_TREE) {
        if (R() > this.dens) continue;
        const v = treeIds[(R() * treeIds.length) | 0];
        (real[v.id] = real[v.id] || []).push({ matrix: mtx(x, RAIL_Y - 0.3, z, 1, 1, 1, R() * 6).multiply(new THREE.Matrix4().makeScale(...Array(3).fill(0.6 + R() * 0.5))) });
      } else {
        const s = 2.5 + R() * 3.5;
        trunks.push({ matrix: mtx(x, RAIL_Y - 0.3 + s * 0.4, z, 1, s * 0.8, 1) });
        crowns.push({ matrix: mtx(x, RAIL_Y - 0.3 + s * 1.15, z, s, s * 0.85, s, R() * 6), color });
      }
    }
    if (treeIds.length) this._addVariants(L, 'vegetation/tree', real);
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
        // 山腳不可蓋到鐵道(否則相機會在圓錐裡面,看到一片暗綠)
        const r = Math.min(h * (1.6 + R()), (dist - 250) / 0.8);
        const c = new THREE.Color().setHSL(0.3 + R() * 0.08, 0.28, 0.22 + R() * 0.08);
        list.push({ matrix: mtx(R() * 6000, RAIL_Y - 0.3 + h / 2, side * dist, r, h, r * 0.8, R() * 6), color: c, dist });
      }
    }
    if (list.length) L.addInstances(new THREE.Mesh(geo, mat), list, { colorSlots: ['Mountain'] });
    this.mountains = { mesh: L.group.children[0], list };
    this.layers.push(L);
    this.group.add(L.group);
  }

  /** 遠山的空氣遠近感:越遠越接近霧色(天空地平線色) */
  _hazeMountains() {
    const m = this.mountains;
    if (!m?.mesh?.instanceColor) return;
    const fog = this.fog.color, c = new THREE.Color();
    const n = m.list.length;
    for (let i = 0; i < m.mesh.count; i++) {
      const t = m.list[i % n];
      c.copy(t.color).lerp(fog, THREE.MathUtils.clamp(0.25 + (t.dist - 700) / 1600 * 0.45, 0, 0.75));
      m.mesh.setColorAt(i, c);
    }
    m.mesh.instanceColor.needsUpdate = true;
  }

  /** 停站月台(-Z 側,240 m):rail-assets 有頂棚開放式月台模組、座椅、垃圾桶、寫實候車旅客;站名牌。 */
  _platform(assets) {
    const g = new THREE.Group();
    const R = rng(91);
    const useRail = this._ids('platform/open').length > 0;
    const add = (slot, mats) => {
      if (!mats.length || !this._ids(slot).length) return;
      g.add(this.ra.instanced(slot, mats, { castShadow: false }));
    };
    // 月台面高度 = 軌面 + 1.1(與車廂地板同高)
    const top = 1.1;
    if (useRail) {
      // 模組:本地 +X 為月台側、沿 Z 長 10 m → 轉 +90°:月台朝 -Z、長度沿 X
      const mods = [], benches = [], bins = [];
      for (let i = 0; i < 24; i++) {
        const x = -115 + i * 10;
        mods.push(mtx(x, 0, 0, 1, 1, 1, Math.PI / 2));
        if (i % 3 === 1) benches.push(mtx(x + 2, top, -5.6, 1, 1, 1, Math.PI / 2));
        if (i % 4 === 2) bins.push(mtx(x - 3, top, -6.4, 1, 1, 1, Math.PI));
      }
      add('platform/open', mods);
      add('platform/bench', benches);
      add('platform/trash-can', bins);
    } else {
      for (let i = 0; i < 12; i++) {
        const p = assets.platform.clone(true);
        p.position.set(-110 + i * 20, 0, -5.5);
        g.add(p);
      }
    }
    this.signTex = Tex.label(() => {}, 512, 160);
    const signMat = new THREE.MeshBasicMaterial({ map: this.signTex });
    const frameMat = new THREE.MeshStandardMaterial({ color: '#2a2d31', metalness: 0.6, roughness: 0.4 });
    const signZ = useRail ? -4.6 : -2.8, signY = useRail ? top + 2.55 : 3.75;
    for (let x = -100; x <= 100; x += 40) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.72, 0.08), frameMat);
      frame.position.set(x, signY, signZ);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.66), signMat);
      sign.position.set(x, signY, signZ + 0.045);
      g.add(frame, sign);
    }
    // 候車旅客(在黃線後方,大多面向列車)
    if (assets.people) {
      const byKind = assets.people.map(() => []);
      for (let i = 0; i < 30 * Math.max(0.5, this.dens); i++) {
        byKind[pickPerson(assets.people, R)].push({
          matrix: mtx(-110 + R() * 220, top, -2.9 - R() * 3.6, 1, 1, 1, Math.PI + (R() - 0.5) * 1.6),
        });
      }
      assets.people.forEach((p, k) => {
        if (!byKind[k].length) return;
        for (const im of makeInstanced(p.stand, byKind[k].length, { shadow: false })) {
          byKind[k].forEach((t, i) => im.setMatrixAt(i, t.matrix));
          g.add(im);
        }
      });
    } else {
      const tops = ['#d8d8d8', '#2f3a4f', '#7a2e2e', '#e6d5b8', '#3d5a40', '#b6c4d6', '#c7793b'];
      const people = [];
      for (let i = 0; i < 26; i++) {
        people.push({
          matrix: mtx(-110 + R() * 220, top + 0.05, -4 + R() * 3.5, 1, 1, 1, Math.PI / 2 + (R() - 0.5) * 2),
          color: new THREE.Color(tops[(R() * tops.length) | 0]),
        });
      }
      for (const im of makeInstanced(assets.passengerStand, people.length, { colorSlots: ['Top'] })) {
        people.forEach((p, i) => { im.setMatrixAt(i, p.matrix); if (im.userData.colored) im.setColorAt(i, p.color); });
        g.add(im);
      }
    }
    g.position.set(0, RAIL_Y, 0);
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
    this._updateTunnels(s, focusX);
    for (const L of this.layers) L.update(s);
    for (const { tex, size } of this.scrollTex) tex.offset.x = (s / size) % 1;
    this.platform.visible = platformX !== null && Math.abs(platformX) < 2000;
    if (this.platform.visible) this.platform.position.x = platformX;
    this.sun.position.copy(this.sunDir).multiplyScalar(60).add(new THREE.Vector3(focusX, 0, 0));
    this.sun.target.position.set(focusX, 0, 0);
  }

  /** 隧道位置與「在隧道內」程度 tunnelF(0~1,洞口前後約 40 m 漸變);深入隧道時不繪製外面景物 */
  _updateTunnels(s, focusX) {
    let f = 0, deep = false;
    for (const t of this.tunnels) {
      const x0 = t.s0 - s + this.center, x1 = t.s1 - s + this.center;
      const near = x1 > -2500 && x0 < 2500;
      t.group.visible = near && !this.curtains;
      if (!near) continue;
      t.group.position.x = x0;
      const depth = Math.min(focusX - x0, x1 - focusX);
      f = Math.max(f, THREE.MathUtils.smoothstep(depth, -15, 25));
      if (depth > 120) deep = true;
    }
    this.tunnelF = f;
    if (!this.curtains && deep !== this._deep) {
      this._deep = deep;
      for (const o of this.outdoor) o.visible = !deep;
    }
    // 隧道內:陽光與天光擋掉,只剩隧道燈
    const t = this.time;
    this.sun.intensity = t.sunI * (1 - f);
    this.hemi.intensity = t.hemi[2] * (1 - 0.88 * f);
  }

  /** 車內燈光:warmth(0 白光 ~ 1 鵝黃)、dark(車外暗的程度,車內燈要補亮) */
  get ambience() {
    const f = this.tunnelF, t = this.time;
    return {
      warmth: Math.max(t.warmth, f), dark: Math.max(t.night ? 1 : 0, f), env: t.env * Math.min(1, (this.skyScale ?? 1) * 4) * (1 - 0.85 * f),
      tint: t.tint || null, tintI: (t.tintI || 0) * (1 - f),
    };
  }
}
