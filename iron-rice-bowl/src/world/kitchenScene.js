// 台鐵便當廚房(three.js 程序化建模):
//   北牆 — 烹調線:炊飯機、滷鍋、炒鍋爐、油炸機、煎台,上方不鏽鋼排油煙罩
//   西牆 — 備料檯:水槽、砧板;西側門通往倉庫(層架、紙箱、米袋)
//   中央 — 組裝島台:保溫餐檯(9 格 GN 餐盤)、保溫飯鍋、便當盒與蓋子堆、組裝位
//   東側 — 成品架(排骨/雞腿/素食)、出餐窗口、廚餘桶;南牆不建(鏡頭由南往北看)
// 座標:公尺,y 向上,地板 y = 0,北 = -Z。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture, rng } from '../core/textures.js';
import { bulkFood } from './foodGen.js';

const font = '"Noto Sans TC","Microsoft JhengHei",sans-serif';
export const ROOM = { x0: -8, x1: 8, z0: -5.5, z1: 5.5, h: 3.2 };
export const STORE = { x0: -12.5, x1: -8, z0: -1.5, z1: 4.5, door: [1.6, 3.0] };
const TOP = 0.9;          // 檯面高度

/** 工作站互動位置(人站的位置)與面向 */
export const STATION_POS = {
  rice: { x: -6.3, z: -3.9 }, braise: { x: -3.9, z: -3.9 }, wok: { x: -1.3, z: -3.9 }, fryer: { x: 1.4, z: -3.9 },
  griddle: { x: 3.9, z: -3.9 }, board: { x: -6.55, z: -0.7 }, storage: { x: -10.6, z: 1.3 },
  assembly: { x: 0, z: 1.85 },
  trash: { x: 4.95, z: 2.95 },
};
/** 成品架位置(依便當款數:2 或 3 個架子) */
export function rackZ(n) { return n >= 3 ? [-1.9, -0.25, 1.4] : [-1.2, 0.75]; }

/** 碰撞方塊 [x0, z0, x1, z1] */
export const OBSTACLES = [
  [-8, -5.5, 5.4, -4.55], [5.4, -5.5, 8, -4.55],            // 烹調線、東北角工作檯
  [-8, -4.55, -7.2, 1.4],                                     // 西側備料檯
  [-3.25, -0.1, 3.25, 1.25],                                  // 組裝島台
  [6.45, -2.6, 8, 2.05],                                      // 成品架
  [4.65, 3.35, 5.3, 3.95],                                    // 廚餘桶
  [-7.6, 4.6, -5.5, 5.5],                                     // 冰箱
  [5.55, 3.25, 6.05, 3.75],                                   // 主任
  [-12.5, -1.5, -11.85, 4.5], [-12.5, -1.5, -8, -0.95], [-12.5, 3.95, -8, 4.5],   // 倉庫層架
];

// ---------------------------------------------------------------- 材質(程序化貼圖)
function brushed() {
  const R = rng(4);
  return canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = '#bfc3c6'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const y = R() * h, v = 170 + R() * 70;
      c.fillStyle = `rgba(${v},${v},${v},0.35)`;
      c.fillRect(R() * w, y, 40 + R() * 220, 1);
    }
  }, { repeat: [2, 2], srgb: true });
}
function tiles(color = '#f4f4f1', grout = '#c9cbc8', n = 4) {
  const R = rng(8);
  return canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = grout; c.fillRect(0, 0, w, h);
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = (R() - 0.5) * 8;
      c.fillStyle = color;
      c.globalAlpha = 1;
      c.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      c.fillStyle = v > 0 ? `rgba(255,255,255,${v / 40})` : `rgba(0,0,0,${-v / 40})`;
      c.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      // 釉面反光
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.fillRect(i * s + 6, j * s + 6, s * 0.4, 3);
    }
  });
}
function floorTiles() {
  const R = rng(15);
  return canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = '#6b3b2a'; c.fillRect(0, 0, w, h);
    const n = 4, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const k = R();
      c.fillStyle = k < 0.33 ? '#9e5a3c' : k < 0.66 ? '#a9634a' : '#94533a';
      c.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      for (let t = 0; t < 140; t++) {
        c.fillStyle = `rgba(0,0,0,${0.05 + R() * 0.08})`;
        c.fillRect(i * s + R() * s, j * s + R() * s, 2, 2);
      }
    }
  });
}
function signTexture(text, sub, bg = '#1d3b5c') {
  return canvasTexture(512, 160, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 6; c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 70px ${font}`; c.fillText(text, w / 2, sub ? 66 : h / 2);
    if (sub) { c.font = `500 30px ${font}`; c.fillStyle = '#d6e4f0'; c.fillText(sub, w / 2, 124); }
  }, { wrap: false });
}
function cartonTexture(text) {
  const R = rng(text.length + 3);
  return canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#b8895a'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(80,50,20,${R() * 0.12})`; c.fillRect(R() * w, R() * h, 2, 1); }
    c.fillStyle = 'rgba(120,80,40,0.5)'; c.fillRect(0, h * 0.46, w, 16);   // 膠帶
    c.fillStyle = '#2b2b2b'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 40px ${font}`; c.fillText(text, w / 2, h * 0.28);
    c.font = `500 22px ${font}`; c.fillText('臺鐵便當 專用', w / 2, h * 0.74);
    c.strokeStyle = '#2b2b2b'; c.lineWidth = 3; c.strokeRect(w * 0.3, h * 0.82, w * 0.4, 26);
  }, { wrap: false });
}

// ---------------------------------------------------------------- 場景
export class KitchenScene {
  /** level:buildLevel() 的結果(食材、便當款式) */
  constructor(quality = {}, level) {
    this.q = quality;
    this.level = level;
    this.group = new THREE.Group();
    this.anim = [];             // 每幀更新的動畫(火焰、氣泡、蒸氣)
    this.st = {};               // 工作站視覺狀態
    const steelTex = brushed();
    this.M = {
      steel: new THREE.MeshStandardMaterial({ color: '#dfe3e6', map: steelTex, metalness: 1, roughness: 0.32, envMapIntensity: 1.3 }),
      steelDark: new THREE.MeshStandardMaterial({ color: '#8d9399', map: steelTex, metalness: 1, roughness: 0.42 }),
      black: new THREE.MeshStandardMaterial({ color: '#1b1c1e', roughness: 0.6, metalness: 0.3 }),
      cast: new THREE.MeshStandardMaterial({ color: '#2b2a29', roughness: 0.75, metalness: 0.5 }),
      wall: new THREE.MeshStandardMaterial({ map: tiles(), roughness: 0.25 }),
      paint: new THREE.MeshStandardMaterial({ color: '#e8e9e4', roughness: 0.9 }),
      floor: new THREE.MeshStandardMaterial({ map: floorTiles(), roughness: 0.55 }),
      rubber: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 }),
      board: new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.7 }),
      wood: new THREE.MeshStandardMaterial({ color: '#6f4a2c', roughness: 0.7 }),
      oil: new THREE.MeshStandardMaterial({ color: '#c08a1e', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 }),
      broth: new THREE.MeshStandardMaterial({ color: '#4a2410', roughness: 0.08, metalness: 0.1 }),
      water: new THREE.MeshStandardMaterial({ color: '#9cc4d6', roughness: 0.05, transparent: true, opacity: 0.6 }),
      flame: new THREE.MeshBasicMaterial({ color: '#4aa3ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
      glow: new THREE.MeshBasicMaterial({ color: '#ff5a1a', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
      led: (c) => new THREE.MeshBasicMaterial({ color: c }),
      light: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff8ea', emissiveIntensity: 2.2 }),
      plastic: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 }),
    };
    this._room();
    this._lights();
    this._cookline();
    this._prep();
    this._island();
    this._racks();
    this._storage();
    this._decor();
    this._steamSystem();
    this.group.traverse((o) => { if (o.isMesh && o.castShadow === false && !o.userData.noShadow) { o.castShadow = !!quality.shadows; o.receiveShadow = true; } });
  }

  // ---------- 小工具
  box(w, h, d, mat, x, y, z, parent = this.group) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = false; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  cyl(rt, rb, h, mat, x, y, z, seg = 24, parent = this.group) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  /** 不鏽鋼工作檯:檯面(含後擋板)、四腳、下層板 */
  counter(x0, z0, x1, z1, { back = 'n', h = TOP, under = true, parent = this.group } = {}) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.box(w, 0.04, d, this.M.steel, cx, h - 0.02, cz, parent);
    this.box(w, 0.06, 0.03, this.M.steel, cx, h - 0.07, z1 - 0.015, parent);       // 前緣折邊
    if (back === 'n') this.box(w, 0.12, 0.02, this.M.steel, cx, h + 0.06, z0 + 0.01, parent);
    if (back === 'w') this.box(0.02, 0.12, d, this.M.steel, x0 + 0.01, h + 0.06, cz, parent);
    for (const [lx, lz] of [[x0 + 0.05, z0 + 0.05], [x1 - 0.05, z0 + 0.05], [x0 + 0.05, z1 - 0.05], [x1 - 0.05, z1 - 0.05]]) {
      this.cyl(0.02, 0.02, h - 0.06, this.M.steel, lx, (h - 0.06) / 2, lz, 10, parent);
      this.cyl(0.03, 0.035, 0.04, this.M.steelDark, lx, 0.02, lz, 10, parent);
    }
    if (under) this.box(w - 0.1, 0.02, d - 0.1, this.M.steel, cx, 0.22, cz, parent);
  }
  sign(text, sub, x, y, z, ry = 0, w = 1.0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 160 / 512), new THREE.MeshBasicMaterial({ map: signTexture(text, sub), toneMapped: false }));
    m.position.set(x, y, z); m.rotation.y = ry;
    this.group.add(m);
    return m;
  }

  // ---------- 房間
  _room() {
    const { x0, x1, z0, z1, h } = ROOM;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - STORE.x0, z1 - z0), this.M.floor);
    fl.rotation.x = -Math.PI / 2;
    fl.position.set((x1 + STORE.x0) / 2, 0, (z0 + z1) / 2);
    this.M.floor.map.repeat.set((x1 - STORE.x0) / 0.8, (z1 - z0) / 0.8);
    fl.receiveShadow = true;
    this.group.add(fl);
    // 排水溝(沿烹調線前方)
    const drain = this.box(13, 0.006, 0.18, this.M.steelDark, -1.3, 0.003, -4.35);
    drain.userData.noShadow = true;
    for (let i = 0; i < 64; i++) this.box(0.012, 0.008, 0.16, this.M.black, -7.6 + i * 0.2, 0.006, -4.35);
    // 牆:下半磁磚 2.2 m、上半漆面
    const wallTex = this.M.wall.map;
    wallTex.repeat.set(1, 1);
    const wall = (len, x, z, ry, from = 0, to = len) => {
      const g = new THREE.Group();
      const tileH = 2.2;
      const t = new THREE.Mesh(new THREE.PlaneGeometry(to - from, tileH), this.M.wall.clone());
      t.material.map = wallTex.clone(); t.material.map.repeat.set((to - from) / 0.6, tileH / 0.6); t.material.map.needsUpdate = true;
      t.position.set((from + to) / 2 - len / 2, tileH / 2, 0);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(to - from, h - tileH), this.M.paint);
      p.position.set((from + to) / 2 - len / 2, tileH + (h - tileH) / 2, 0);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(to - from, 0.04, 0.02), this.M.steel);
      trim.position.set((from + to) / 2 - len / 2, tileH, 0.01);
      g.add(t, p, trim);
      g.position.set(x, 0, z); g.rotation.y = ry;
      g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
      this.group.add(g);
    };
    wall(x1 - x0, 0, z0, 0);                                          // 北牆
    wall(z1 - z0, x1, 0, -Math.PI / 2, 0, 2.6 + 5.5 - 1.4);          // 東牆(出餐窗口以南另補)
    wall(z1 - z0, x1, 0, -Math.PI / 2, 2.6 + 5.5 + 1.4, z1 - z0);
    // 東牆出餐窗口:上下牆面與窗框
    this.box(0.12, 0.95, 1.4, this.M.wall, x1 + 0.06, 0.475, 3.3);
    this.box(0.12, 1.15, 1.4, this.M.paint, x1 + 0.06, 2.62, 3.3);
    this.box(0.6, 0.04, 1.5, this.M.steel, x1 - 0.1, 0.97, 3.3);
    // 西牆(倉庫門洞 z 1.6~3.0)
    const L = z1 - z0;
    wall(L, x0, 0, Math.PI / 2, 0, z1 - STORE.door[1]);
    wall(L, x0, 0, Math.PI / 2, z1 - STORE.door[0], L);
    this.box(0.14, h - 2.2, STORE.door[1] - STORE.door[0], this.M.paint, x0, 2.2 + (h - 2.2) / 2, (STORE.door[0] + STORE.door[1]) / 2);
    for (const z of STORE.door) this.box(0.16, 2.2, 0.06, this.M.steelDark, x0, 1.1, z);
    this.box(0.16, 0.06, STORE.door[1] - STORE.door[0] + 0.12, this.M.steelDark, x0, 2.2, (STORE.door[0] + STORE.door[1]) / 2);
    // 塑膠門簾(條狀,半透明)
    const strip = new THREE.MeshStandardMaterial({ color: '#cfe0e6', roughness: 0.15, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    for (let z = STORE.door[0] + 0.1; z < STORE.door[1]; z += 0.2) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 2.1), strip);
      s.position.set(x0, 1.1, z + 0.05); s.rotation.y = Math.PI / 2 + 0.08;
      s.userData.noShadow = true;
      this.group.add(s);
    }
    // 南側:只做踢腳(鏡頭由南看入)
    this.box(x1 - x0, 0.15, 0.08, this.M.wall, 0, 0.075, z1);
    // 倉庫牆
    const s = STORE;
    const sw = (len, x, z, ry) => wall(len, x, z, ry);
    sw(s.z1 - s.z0, s.x0, (s.z0 + s.z1) / 2, Math.PI / 2);
    sw(s.x1 - s.x0, (s.x0 + s.x1) / 2, s.z0, 0);
    // 天花板管線(只做吊掛物,不做天花板:鏡頭由上往下)
  }

  _lights() {
    const g = this.group;
    g.add(new THREE.HemisphereLight('#fffaf0', '#8a6f5c', 0.75));
    const lamps = [[-4.5, -1.5], [0, -1.5], [4.5, -1.5], [-4.5, 2.5], [0, 2.5], [4.5, 2.5], [-10.3, 1.5]];
    lamps.forEach(([x, z], i) => {
      // 日光燈具(吊掛)
      const fx = new THREE.Group();
      this.box(1.25, 0.06, 0.32, this.M.steel, 0, 0, 0, fx);
      const tube = this.box(1.15, 0.025, 0.22, this.M.light, 0, -0.035, 0, fx);
      tube.userData.noShadow = true;
      for (const dx of [-0.5, 0.5]) this.box(0.01, 0.35, 0.01, this.M.steelDark, dx, 0.2, 0, fx);
      fx.position.set(x, ROOM.h - 0.38, z);
      g.add(fx);
      const L = this.q.areaLights
        ? Object.assign(new THREE.RectAreaLight('#fff4e2', 9, 1.2, 0.3), { position: new THREE.Vector3(x, ROOM.h - 0.45, z) })
        : new THREE.PointLight('#fff4e2', i === 6 ? 7 : 9, 9, 1.4);
      if (L.isRectAreaLight) L.lookAt(x, 0, z); else L.position.set(x, ROOM.h - 0.5, z);
      g.add(L);
    });
    // 陰影:中央上方一盞(人物、島台)
    const sun = this.shadowLight = new THREE.DirectionalLight('#fff6e8', 0.9);
    sun.position.set(-3, 9, 4);
    sun.target.position.set(0, 0, 0);
    if (this.q.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(this.q.shadowSize || 1024, this.q.shadowSize || 1024);
      Object.assign(sun.shadow.camera, { left: -13, right: 10, top: 8, bottom: -8, near: 1, far: 30 });
      sun.shadow.bias = -0.0005;
      sun.shadow.normalBias = 0.02;
    }
    g.add(sun, sun.target);
  }

  // ---------- 北牆烹調線
  _cookline() {
    const z0 = ROOM.z0, d = 0.95, zc = z0 + d / 2;
    // 排油煙罩
    const hood = new THREE.Group();
    this.box(13.4, 0.6, 1.25, this.M.steel, 0, 0, 0, hood).position.y = 0;
    for (let i = 0; i < 12; i++) {
      const f = this.box(1.0, 0.4, 0.02, this.M.steelDark, -6.05 + i * 1.1, -0.08, 0.35, hood);
      f.rotation.x = -0.55;
      for (let k = 0; k < 8; k++) this.box(0.98, 0.012, 0.022, this.M.black, -6.05 + i * 1.1, -0.2 + k * 0.035, 0.36, hood).rotation.x = -0.55;
    }
    this.box(13.4, 0.08, 0.08, this.M.steel, 0, -0.31, 0.6, hood);
    hood.position.set(-1.1, 2.4, z0 + 0.62);
    this.group.add(hood);
    this.box(0.9, 0.5, 0.6, this.M.steel, -1.1, 2.95, z0 + 0.3);   // 排氣管
    // 牆面燈條(罩內)
    for (let i = 0; i < 5; i++) {
      const lp = this.box(0.5, 0.02, 0.1, this.M.light, -6 + i * 2.6, 2.08, z0 + 0.6);
      lp.userData.noShadow = true;
    }

    // ---- 炊飯機(兩台立式燃氣炊飯機,三層鍋)
    {
      const x = -6.3;
      const st = { group: new THREE.Group() };
      const g = st.group;
      for (const dx of [-0.42, 0.42]) {
        const body = this.box(0.72, 1.25, 0.7, this.M.steel, dx, 0.625, 0, g);
        body.castShadow = true;
        for (let k = 0; k < 3; k++) {
          this.box(0.6, 0.3, 0.02, this.M.steelDark, dx, 0.3 + k * 0.36, 0.36, g);
          this.box(0.16, 0.035, 0.05, this.M.black, dx, 0.42 + k * 0.36, 0.39, g);   // 把手
        }
        this.box(0.3, 0.12, 0.02, this.M.black, dx + 0.12, 1.12, 0.36, g);
        st[`led${dx > 0 ? 'R' : 'L'}`] = this.box(0.03, 0.03, 0.01, this.M.led('#3a3a3a').clone(), dx + 0.2, 1.12, 0.372, g);
      }
      // 上方:正在煮的一鍋(大鋁鍋,鍋蓋可開)
      const pot = this.cyl(0.25, 0.23, 0.22, this.M.steel, 0, 1.36, 0.05, 32, g);
      pot.castShadow = true;
      const rice = this.cyl(0.235, 0.235, 0.02, new THREE.MeshStandardMaterial({ color: '#f6f2e6', roughness: 0.85 }), 0, 1.4, 0.05, 32, g);
      const water = this.cyl(0.235, 0.235, 0.02, this.M.water, 0, 1.42, 0.05, 32, g);
      const lid = new THREE.Group();
      this.cyl(0.26, 0.26, 0.025, this.M.steel, 0, 0, 0.26, 32, lid);
      this.cyl(0.03, 0.03, 0.04, this.M.black, 0, 0.03, 0.26, 12, lid);
      lid.position.set(0, 1.48, -0.21);
      g.add(lid);
      Object.assign(st, { lid, rice, water });
      g.position.set(x, 0, zc);
      this.group.add(g);
      this.st.rice = st;
      this.sign('炊飯區', 'RICE', x, 2.0, z0 + 1.26, 0, 0.9);
    }
    // ---- 滷鍋(低台爐 + 大湯桶)
    {
      const x = -3.9;
      const st = { group: new THREE.Group() };
      const g = st.group;
      this.box(1.3, 0.45, 0.85, this.M.steel, 0, 0.225, 0, g);
      this.cyl(0.3, 0.3, 0.04, this.M.cast, 0, 0.47, 0, 24, g);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.32, 0.52, 40, 1, true), this.M.steel);
      pot.material = this.M.steel; pot.position.set(0, 0.75, 0); pot.castShadow = true;
      g.add(pot);
      this.cyl(0.345, 0.345, 0.02, this.M.steelDark, 0, 1.01, 0, 40, g);
      for (const s of [-1, 1]) this.box(0.08, 0.03, 0.04, this.M.steelDark, s * 0.37, 0.95, 0, g);
      const broth = this.cyl(0.33, 0.33, 0.01, this.M.broth, 0, 0.92, 0, 40, g);
      const pieces = new THREE.Group();
      g.add(pieces);
      const lid = new THREE.Group();
      this.cyl(0.35, 0.35, 0.02, this.M.steel, 0, 0, 0, 40, lid);
      this.cyl(0.04, 0.04, 0.05, this.M.black, 0, 0.035, 0, 12, lid);
      lid.position.set(0, 1.03, 0);
      g.add(lid);
      // 長柄湯勺掛在鍋邊
      const ladle = new THREE.Group();
      this.box(0.02, 0.6, 0.02, this.M.steel, 0, 0.3, 0, ladle);
      this.cyl(0.06, 0.04, 0.05, this.M.steel, 0, 0, 0, 16, ladle);
      ladle.position.set(0.42, 0.9, 0.18); ladle.rotation.z = 0.5;
      g.add(ladle);
      // 醬油桶、香料盒
      this.cyl(0.12, 0.12, 0.35, this.M.plastic('#3b2a1b'), 0.5, 0.63, -0.28, 16, g);
      Object.assign(st, { lid, broth, pieces });
      g.position.set(x, 0, zc);
      this.group.add(g);
      this.st.braise = st;
      this.sign('滷味區', 'BRAISE', x, 2.0, z0 + 1.26, 0, 0.9);
    }
    // ---- 炒鍋爐(雙口快速爐)
    {
      const x = -1.3;
      const st = { group: new THREE.Group() };
      const g = st.group;
      this.box(1.6, 0.82, 0.9, this.M.steel, 0, 0.41, 0, g);
      this.box(1.6, 0.04, 0.9, this.M.steelDark, 0, 0.84, 0, g);
      this.box(1.6, 0.25, 0.04, this.M.steel, 0, 0.98, -0.43, g);
      for (const dx of [-0.42, 0.42]) {
        this.cyl(0.22, 0.24, 0.06, this.M.cast, dx, 0.88, 0, 20, g);
        for (let k = 0; k < 3; k++) this.box(0.4, 0.015, 0.03, this.M.cast, dx, 0.915, 0, g).rotation.y = k * Math.PI / 3;
        this.box(0.06, 0.06, 0.04, this.M.black, dx, 0.55, 0.47, g);   // 旋鈕
      }
      // 炒鍋(左口)
      const wok = new THREE.Group();
      const prof = [[0, 0], [0.12, 0.01], [0.2, 0.04], [0.25, 0.09], [0.27, 0.13]].map(([r, y]) => new THREE.Vector2(r, y));
      const shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.45, metalness: 0.8, side: THREE.DoubleSide }));
      shell.castShadow = true;
      wok.add(shell);
      this.cyl(0.018, 0.018, 0.42, this.M.wood, 0, 0.11, 0.42, 10, wok).rotation.x = Math.PI / 2 - 0.25;
      this.box(0.03, 0.03, 0.12, this.M.cast, 0, 0.12, 0.25, wok);
      const contents = new THREE.Group();
      wok.add(contents);
      wok.position.set(-0.42, 0.93, 0);
      g.add(wok);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.12, 20, 1, true), this.M.flame.clone());
      flame.position.set(-0.42, 0.95, 0); flame.rotation.x = Math.PI; flame.visible = false;
      flame.userData.noShadow = true;
      g.add(flame);
      // 鍋鏟、調味罐
      const spat = this.box(0.08, 0.005, 0.12, this.M.steel, 0.45, 0.93, 0.15, g);
      this.box(0.02, 0.02, 0.3, this.M.wood, 0.45, 0.94, 0.33, g);
      for (let i = 0; i < 4; i++) this.cyl(0.04, 0.04, 0.1, this.M.plastic(['#f2f2f2', '#c43a2b', '#3f2a1a', '#e8c35a'][i]), 0.2 + i * 0.11, 0.91, -0.33, 12, g);
      Object.assign(st, { wok, contents, flame, spat });
      g.position.set(x, 0, zc);
      this.group.add(g);
      this.st.wok = st;
      this.sign('熱炒區', 'WOK', x, 2.0, z0 + 1.26, 0, 0.9);
    }
    // ---- 油炸機(雙槽)
    {
      const x = 1.4;
      const st = { group: new THREE.Group() };
      const g = st.group;
      this.box(0.9, 0.88, 0.85, this.M.steel, 0, 0.44, 0, g).castShadow = true;
      this.box(0.9, 0.3, 0.04, this.M.steel, 0, 1.03, -0.4, g);
      this.box(0.86, 0.02, 0.4, this.M.black, 0, 0.6, 0.43, g);   // 控制面板
      const oils = [];
      const baskets = [];
      for (const dx of [-0.22, 0.22]) {
        this.box(0.38, 0.02, 0.5, this.M.steelDark, dx, 0.885, 0, g);
        const oil = this.box(0.34, 0.01, 0.46, this.M.oil, dx, 0.875, 0, g);
        oil.userData.noShadow = true;
        oils.push(oil);
        const b = new THREE.Group();
        const wire = new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 1, roughness: 0.35, wireframe: true });
        const bm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.38, 6, 3, 7), wire);
        b.add(bm);
        this.box(0.02, 0.02, 0.32, this.M.black, 0, 0.08, 0.32, b).rotation.x = -0.4;
        const food = new THREE.Group();
        b.add(food);
        b.userData.food = food;
        b.position.set(dx, 1.0, 0.02);
        g.add(b);
        baskets.push(b);
      }
      // 吊掛架
      this.box(0.9, 0.02, 0.04, this.M.steel, 0, 1.18, -0.36, g);
      Object.assign(st, { oils, baskets });
      g.position.set(x, 0, zc);
      this.group.add(g);
      this.st.fryer = st;
      this.sign('油炸區', 'FRYER', x, 2.0, z0 + 1.26, 0, 0.9);
    }
    // ---- 煎台(平板煎台)
    {
      const x = 3.9;
      const st = { group: new THREE.Group() };
      const g = st.group;
      this.counter(-0.9, -0.47, 0.9, 0.47, { parent: g, h: 0.62, back: null });
      this.box(1.3, 0.28, 0.75, this.M.steel, 0, 0.78, -0.02, g);
      const plate = this.box(1.25, 0.03, 0.62, new THREE.MeshStandardMaterial({ color: '#2a2826', roughness: 0.35, metalness: 0.85 }), 0, 0.935, -0.04, g);
      for (const s of [-1, 1]) this.box(0.02, 0.12, 0.62, this.M.steel, s * 0.625, 1.0, -0.04, g);
      this.box(1.25, 0.12, 0.02, this.M.steel, 0, 1.0, -0.36, g);
      this.box(1.25, 0.03, 0.08, this.M.steelDark, 0, 0.9, 0.31, g);   // 油槽
      for (let i = 0; i < 4; i++) this.box(0.05, 0.05, 0.04, this.M.black, -0.45 + i * 0.3, 0.72, 0.36, g);
      const glow = this.box(1.2, 0.002, 0.58, this.M.glow.clone(), 0, 0.952, -0.04, g);
      glow.visible = false; glow.userData.noShadow = true;
      const patties = new THREE.Group();
      g.add(patties);
      // 煎鏟
      this.box(0.12, 0.005, 0.1, this.M.steel, 0.5, 0.96, 0.18, g);
      this.box(0.02, 0.02, 0.22, this.M.black, 0.5, 0.97, 0.32, g);
      Object.assign(st, { plate, glow, patties });
      g.position.set(x, 0, zc);
      this.group.add(g);
      this.st.griddle = st;
      this.sign('煎台', 'GRIDDLE', x, 2.0, z0 + 1.26, 0, 0.9);
    }
    // 東北角:工作檯與調理盆
    this.counter(5.4, z0, 7.95, z0 + d);
    for (let i = 0; i < 3; i++) this.cyl(0.18, 0.12, 0.12, this.M.steel, 5.9 + i * 0.6, TOP + 0.06, z0 + 0.45, 24);
  }

  // ---------- 西側備料檯:水槽、砧板
  _prep() {
    const x0 = ROOM.x0, d = 0.78;
    this.counter(x0, -4.55, x0 + d, 1.4, { back: 'w' });
    // 水槽(雙槽)
    for (const z of [-3.6, -2.95]) {
      this.box(0.5, 0.25, 0.55, this.M.steelDark, x0 + 0.4, TOP - 0.13, z);
      this.box(0.46, 0.005, 0.5, this.M.water, x0 + 0.4, TOP - 0.08, z).userData.noShadow = true;
    }
    const faucet = new THREE.Group();
    this.cyl(0.02, 0.02, 0.45, this.M.steel, 0, 0.22, 0, 12, faucet);
    this.box(0.02, 0.02, 0.28, this.M.steel, 0, 0.45, 0.14, faucet).rotation.x = 0.2;
    faucet.position.set(x0 + 0.08, TOP, -3.27); faucet.rotation.y = -Math.PI / 2;
    this.group.add(faucet);
    // 砧板區
    const st = { group: new THREE.Group() };
    const g = st.group;
    this.box(0.5, 0.03, 0.75, this.M.board, 0, TOP + 0.015, 0, g);
    const knife = new THREE.Group();
    this.box(0.08, 0.003, 0.22, this.M.steel, 0, 0, 0, knife);
    this.box(0.03, 0.025, 0.12, this.M.black, 0, 0.005, 0.16, knife);
    knife.position.set(0.12, TOP + 0.04, 0.2);
    g.add(knife);
    const veg = new THREE.Group();
    g.add(veg);
    const pile = new THREE.Group();
    g.add(pile);
    // 菜籃(高麗菜、紅蘿蔔、酸菜、黃蘿蔔)
    const basket = new THREE.Group();
    this.box(0.4, 0.2, 0.3, this.M.plastic('#2f6fb2'), 0, 0.1, 0, basket);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), new THREE.MeshStandardMaterial({ color: '#b6d58a', roughness: 0.7 }));
      c.position.set(-0.12 + i * 0.12, 0.22, 0);
      basket.add(c);
    }
    basket.position.set(-0.05, TOP, -0.75);
    g.add(basket);
    Object.assign(st, { knife, veg, pile });
    g.position.set(x0 + 0.42, 0, -0.7);
    this.group.add(g);
    this.st.board = st;
    this.sign('備料區', 'PREP', x0 + 0.02, 2.0, -1.6, Math.PI / 2, 0.9);
    // 刀架
    for (let i = 0; i < 4; i++) this.box(0.02, 0.25, 0.04, this.M.steel, x0 + 0.04, 1.35, -1.4 + i * 0.07);
  }

  // ---------- 中央組裝島台
  _island() {
    const x0 = -3.25, x1 = 3.25, z0 = -0.1, z1 = 1.25;
    this.counter(x0, z0, x1, z1, { back: null });
    // 保溫餐檯(北半部):依關卡食材排 GN 餐盤(飯類放西端的保溫飯鍋)
    this.pans = {};
    const foods = Object.values(this.level.foods);
    const panFoods = foods.filter((f) => f.shape !== 'rice'), riceFoods = foods.filter((f) => f.shape === 'rice');
    const n = panFoods.length, pw = Math.min(0.415, 3.6 / Math.max(1, n));
    this.box(n * pw + 0.1, 0.02, 0.48, this.M.steelDark, -1.66 + (n * pw) / 2 - pw / 2, TOP + 0.005, 0.18);
    panFoods.forEach((f, i) => {
      const x = -1.66 + i * pw;
      const pan = new THREE.Group();
      const p = this.box(pw - 0.05, 0.1, 0.33, this.M.steel, 0, -0.04, 0, pan);
      p.castShadow = true;
      this.box(pw - 0.07, 0.002, 0.31, this.M.steelDark, 0, 0.012, 0, pan);
      const food = bulkFood(f, pw - 0.1, 0.27, 3, i * 17 + 5);
      food.position.y = 0.012;
      pan.add(food);
      const tong = this.box(0.02, 0.012, 0.22, this.M.steel, (pw - 0.1) / 2 - 0.02, 0.06, 0.08, pan);
      tong.rotation.x = -0.3;
      pan.position.set(x, TOP + 0.05, 0.18);
      this.group.add(pan);
      this.pans[f.key] = { group: pan, food, x };
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(pw - 0.04, 0.08), new THREE.MeshBasicMaterial({
        map: canvasTexture(256, 60, (c, w, h) => {
          c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.font = `900 ${f.name.length > 5 ? Math.floor(220 / f.name.length) : 36}px ${font}`; c.fillText(f.name, w / 2, h / 2 + 2);
        }, { wrap: false }), toneMapped: false }));
      tag.position.set(x, TOP + 0.02, 0.4);
      tag.rotation.x = -Math.PI / 2 + 0.6;
      this.group.add(tag);
    });
    // 保溫飯鍋(西端;兩種飯就兩鍋)
    this.riceWarmers = {};
    riceFoods.forEach((f, i) => {
      const r = riceFoods.length > 1 ? 0.21 : 0.26;
      const g = new THREE.Group();
      this.cyl(r, r - 0.02, 0.32, this.M.steel, 0, 0.16, 0, 32, g).castShadow = true;
      const top = this.cyl(r - 0.015, r - 0.015, 0.02, new THREE.MeshStandardMaterial({ color: f.color || '#f6f2e6', roughness: 0.85 }), 0, 0.3, 0, 32, g);
      this.cyl(0.03, 0.03, 0.28, this.M.plastic('#f0f0f0'), r * 0.7, 0.4, 0.1, 10, g).rotation.z = 0.5;
      g.position.set(riceFoods.length > 1 ? -2.95 + i * 0.5 : -2.55, TOP, 0.45);
      this.group.add(g);
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.08), new THREE.MeshBasicMaterial({
        map: canvasTexture(256, 50, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 34px ${font}`; c.fillText(f.name, w / 2, h / 2 + 2); }, { wrap: false }), toneMapped: false }));
      tag.position.set(g.position.x, TOP + 0.02, 0.85);
      tag.rotation.x = -Math.PI / 2 + 0.6;
      this.group.add(tag);
      this.riceWarmers[f.key] = { group: g, top };
    });
    // 防噴罩(玻璃)
    const guard = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.35), new THREE.MeshStandardMaterial({ color: '#dfeef2', roughness: 0.05, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    guard.position.set(0, TOP + 0.42, -0.05); guard.rotation.x = -0.35;
    guard.userData.noShadow = true;
    this.group.add(guard);
    for (const x of [-1.78, 1.78]) this.box(0.02, 0.45, 0.02, this.M.steel, x, TOP + 0.22, -0.05);
    // 便當盒與蓋子堆(東端)
    const tray = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.034, 0.13, 2, 0.008), new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.38 }));
    const lidG = new RoundedBoxGeometry(0.184, 0.018, 0.134, 2, 0.006);
    const lidM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.35 });
    this.boxStack = new THREE.InstancedMesh(tray.geometry, tray.material, 20);
    this.lidStack = new THREE.InstancedMesh(lidG, lidM, 20);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 20; i++) {
      this.boxStack.setMatrixAt(i, m4.makeTranslation(2.35, TOP + 0.017 + i * 0.012, 0.75));
      this.lidStack.setMatrixAt(i, m4.makeTranslation(2.8, TOP + 0.009 + i * 0.008, 0.75));
    }
    this.boxStack.castShadow = true;
    this.group.add(this.boxStack, this.lidStack);
    // 組裝位(南緣中央):墊板
    this.box(0.5, 0.01, 0.36, this.M.board, 0, TOP + 0.005, 0.95);
    this.assemblyAt = new THREE.Vector3(0, TOP + 0.01, 0.95);
    // 訂單軌(島台上方吊掛)
    const rail = this.box(1.6, 0.03, 0.05, this.M.steel, 0, 2.15, 1.05);
    for (const x of [-0.7, 0.7]) this.box(0.015, 0.95, 0.015, this.M.steelDark, x, 2.65, 1.05);
    this.ticketTex = canvasTexture(256, 320, () => {}, { wrap: false });
    const ticket = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.4), new THREE.MeshBasicMaterial({ map: this.ticketTex, toneMapped: false, side: THREE.DoubleSide }));
    ticket.position.set(0, 1.93, 1.07);
    this.group.add(ticket);
    this.sign('組裝出餐', 'ASSEMBLY', 0, 2.38, 1.1, 0, 1.0);
  }

  // ---------- 東側成品架
  _racks() {
    this.racks = {};
    const list = Object.values(this.level.bentos), zs = rackZ(list.length);
    const COL = { pork: '#b23a2a', chicken: '#c98a1c', veg: '#3f7d3a' };
    list.forEach((b, i) => {
      const z = zs[i];
      const g = new THREE.Group();
      for (const [dx, dz] of [[-0.3, -0.36], [0.3, -0.36], [-0.3, 0.36], [0.3, 0.36]]) {
        this.cyl(0.015, 0.015, 1.7, this.M.steel, dx, 0.92, dz, 10, g);
        this.cyl(0.035, 0.035, 0.05, this.M.rubber, dx, 0.04, dz, 12, g);
      }
      const shelves = [0.35, 0.75, 1.15, 1.55];
      shelves.forEach((y) => this.box(0.62, 0.02, 0.74, this.M.steel, 0, y, 0, g));
      g.position.set(7.15, 0, z);
      this.group.add(g);
      const label = b.name.replace('便當', '').replace('餐盒', '');
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.23), new THREE.MeshBasicMaterial({ map: signTexture(label, '便當架', b.color || COL[b.id] || '#555'), toneMapped: false }));
      sign.position.set(6.8, 1.95, z); sign.rotation.y = -Math.PI / 2;
      this.group.add(sign);
      this.racks[b.id] = { group: g, shelves, items: [], label: b.name, z };
    });
  }

  /** 成品架放上一個便當(obj = 成品模型) */
  addToRack(id, obj) {
    const r = this.racks[id];
    const i = r.items.length, perShelf = 12, shelf = Math.floor(i / perShelf) % 4, k = i % perShelf;
    obj.rotation.y = Math.PI / 2;
    obj.position.set(-0.15 + (k % 2) * 0.3, r.shelves[shelf] + 0.012 + Math.floor(k / 6) * 0.053, -0.24 + (Math.floor(k / 2) % 3) * 0.24);
    r.group.add(obj);
    r.items.push(obj);
  }

  // ---------- 倉庫
  _storage() {
    const s = STORE;
    const shelf = (x0, z0, x1, z1, rot) => {
      const g = new THREE.Group();
      const w = Math.max(x1 - x0, z1 - z0), d = Math.min(x1 - x0, z1 - z0);
      for (const y of [0.15, 0.75, 1.35, 1.95]) this.box(w, 0.025, d, this.M.steelDark, 0, y, 0, g);
      for (const a of [-w / 2 + 0.03, w / 2 - 0.03]) for (const b of [-d / 2 + 0.03, d / 2 - 0.03]) this.box(0.04, 2.1, 0.04, this.M.steelDark, a, 1.05, b, g);
      g.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      g.rotation.y = rot;
      this.group.add(g);
      return { g, w, d };
    };
    const boxTex = { box: cartonTexture('便當盒'), lid: cartonTexture('便當蓋'), chop: cartonTexture('免洗筷'), bag: cartonTexture('塑膠袋') };
    const carton = (tex, w, h, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ color: '#b8895a', roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: '#a27a50', roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })]);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    };
    // 西牆層架:便當盒與蓋子紙箱
    const west = shelf(s.x0, s.z0, s.x0 + 0.62, s.z1, Math.PI / 2);
    const R = rng(31);
    for (const [y, kind] of [[0.165, 'box'], [0.765, 'box'], [1.365, 'lid'], [1.965, 'lid']]) {
      for (let i = 0; i < 9; i++) {
        const c = carton(boxTex[kind], 0.5, 0.42, 0.5);
        c.position.set(s.x0 + 0.33, y + 0.21, s.z0 + 0.4 + i * 0.64);
        c.rotation.y = Math.PI / 2 + (R() - 0.5) * 0.08;
        this.group.add(c);
      }
    }
    // 北側層架:米袋、醬油、免洗筷
    shelf(s.x0, s.z0, s.x1, s.z0 + 0.55, 0);
    for (let i = 0; i < 6; i++) {
      const bag = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.22, 0.38, 3, 0.08), new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.95 }));
      bag.position.set(s.x0 + 0.5 + i * 0.68, 0.28, s.z0 + 0.28);
      bag.castShadow = true;
      this.group.add(bag);
      const tagM = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.12), new THREE.MeshBasicMaterial({ map: canvasTexture(256, 100, (c, w, h) => { c.fillStyle = '#efe6d2'; c.fillRect(0, 0, w, h); c.fillStyle = '#c0392b'; c.font = `900 56px ${font}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('台梗九號', w / 2, h / 2); }, { wrap: false }) }));
      tagM.position.set(bag.position.x, 0.3, s.z0 + 0.475);
      this.group.add(tagM);
      const jug = this.cyl(0.11, 0.11, 0.38, this.M.plastic('#3a2717'), s.x0 + 0.45 + i * 0.68, 0.95, s.z0 + 0.28, 16);
      jug.castShadow = true;
      const c2 = carton(i % 2 ? boxTex.chop : boxTex.bag, 0.45, 0.35, 0.4);
      c2.position.set(s.x0 + 0.5 + i * 0.68, 1.55, s.z0 + 0.28);
      this.group.add(c2);
    }
    // 南側層架:罐頭與紙箱
    shelf(s.x0, s.z1 - 0.55, s.x1, s.z1, 0);
    for (let i = 0; i < 12; i++) {
      const cn = this.cyl(0.08, 0.08, 0.16, this.M.plastic(['#c43a2b', '#e8c35a', '#2f7d3a'][i % 3]), s.x0 + 0.35 + i * 0.36, 0.84, s.z1 - 0.28, 16);
      cn.castShadow = true;
    }
    this.sign('倉庫', 'STORAGE', ROOM.x0 + 0.02, 2.5, 2.3, Math.PI / 2, 0.8);
    this.sign('便當盒・蓋子', null, s.x0 + 0.66, 2.3, 1.5, Math.PI / 2, 1.1);
  }

  // ---------- 其他:冰箱、廚餘桶、時鐘、主任辦公位、滅火器、管線
  _decor() {
    // 雙門冰箱
    const f = new THREE.Group();
    this.box(1.9, 2.0, 0.8, this.M.steel, 0, 1.0, 0, f).castShadow = true;
    this.box(0.01, 1.9, 0.01, this.M.black, 0, 1.0, -0.401, f);
    for (const x of [-0.08, 0.08]) this.box(0.03, 0.6, 0.04, this.M.steelDark, x, 1.15, -0.43, f);
    this.box(0.25, 0.08, 0.01, this.M.led('#57ff9a'), 0.6, 1.8, -0.405, f);
    f.position.set(-6.55, 0, 5.1);
    f.rotation.y = Math.PI;
    this.group.add(f);
    // 廚餘桶(腳踏式)
    const t = new THREE.Group();
    this.cyl(0.26, 0.23, 0.62, this.M.plastic('#2f5c3e'), 0, 0.31, 0, 24, t).castShadow = true;
    this.cyl(0.27, 0.27, 0.04, this.M.plastic('#264a32'), 0, 0.64, 0, 24, t);
    t.position.set(4.97, 0, 3.65);
    this.group.add(t);
    this.sign('廚餘', null, 4.97, 1.0, 3.38, Math.PI, 0.4);
    // 出車倒數時鐘(北牆)
    this.clockTex = canvasTexture(512, 160, () => {}, { wrap: false });
    const clock = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.375), new THREE.MeshBasicMaterial({ map: this.clockTex, toneMapped: false }));
    clock.position.set(6.6, 2.55, ROOM.z0 + 0.02);
    this.group.add(clock);
    this.box(1.26, 0.43, 0.04, this.M.black, 6.6, 2.55, ROOM.z0 + 0.0);
    // 滅火器、洗手台告示
    this.cyl(0.08, 0.08, 0.5, this.M.plastic('#c0201c'), 7.75, 0.35, -4.3, 16).castShadow = true;
    // 牆上管線
    for (const y of [2.85, 2.95]) {
      const p = this.cyl(0.035, 0.035, 15.6, this.M.steelDark, 0, y, ROOM.z0 + 0.12, 12);
      p.rotation.z = Math.PI / 2;
    }
    // 出餐窗口外:推車(與列車上的便當推車相同造型的簡化版)
    const cart = new THREE.Group();
    this.box(0.9, 0.75, 0.45, this.M.steel, 0, 0.5, 0, cart);
    for (const dx of [-0.38, 0.38]) for (const dz of [-0.18, 0.18]) this.cyl(0.05, 0.05, 0.04, this.M.rubber, dx, 0.05, dz, 12, cart).rotation.x = Math.PI / 2;
    cart.position.set(8.7, 0, 3.3);
    cart.rotation.y = Math.PI / 2;
    this.group.add(cart);
  }

  // ---------- 蒸氣/油煙粒子
  _steamSystem() {
    const tex = canvasTexture(64, 64, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }, { wrap: false });
    const N = 160;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const mat = new THREE.PointsMaterial({ map: tex, size: 0.28, transparent: true, opacity: 0.35, depthWrite: false, color: '#ffffff' });
    this.steam = { pts: new THREE.Points(geo, mat), p: Array.from({ length: N }, () => ({ life: 0, x: 0, y: -10, z: 0, vy: 0 })), emitters: {} };
    this.steam.pts.frustumCulled = false;
    this.group.add(this.steam.pts);
  }

  /** 設定某處的蒸氣強度(0 = 無);dark = 黑煙(燒焦) */
  setSteam(key, x, y, z, rate, dark = false) {
    this.steam.emitters[key] = { x, y, z, rate, dark, acc: 0 };
  }

  // ---------------------------------------------------------------- 狀態與動畫
  /**
   * 工作站視覺:state = idle | work | cook | done | burnt;recipe = 製程 id;t = 經過時間比例(0~1)
   */
  setStation(key, state, food, t = 0) {
    const s = this.st[key];
    const W = (ox, oz) => { const p = s.group.position; return [p.x + ox, p.z + oz]; };
    const burnt = state === 'burnt';
    if (key === 'rice') {
      const open = state === 'idle' || state === 'work' || state === 'done';
      s.lid.rotation.x = open ? -1.25 : 0;
      s.water.visible = state === 'work' || (state === 'cook' && t < 0.6);
      s.rice.visible = state !== 'idle';
      s.rice.material.color.set(state === 'cook' && t < 0.6 ? '#e4e0d4' : food?.color || '#f6f2e6');
      for (const L of [s.ledL, s.ledR]) L.material.color.set(state === 'cook' ? '#ff3b2b' : state === 'done' ? '#3bff6a' : '#3a3a3a');
      const [x, z] = W(0, 0.05);
      this.setSteam('rice', x, 1.55, z, state === 'cook' ? 4 + t * 8 : state === 'done' ? 6 : 0);
    } else if (key === 'braise') {
      s.lid.visible = state === 'cook';
      s.lid.position.y = 1.03;
      this._fill(s.pieces, state === 'idle' ? null : food, burnt, 0.93, 0.5, 0.42);
      s.broth.material.color.set(burnt ? '#1b0c05' : '#4a2410');
      const [x, z] = W(0, 0);
      this.setSteam('braise', x, 1.08, z, state === 'cook' ? 5 : state === 'done' ? 7 : burnt ? 6 : 0, burnt);
    } else if (key === 'wok') {
      s.flame.visible = state === 'cook' || burnt;
      this._fill(s.contents, state === 'idle' ? null : food, burnt, 0.06, 0.32, 0.3);
      const [x, z] = W(-0.42, 0);
      this.setSteam('wok', x, 1.12, z, state === 'cook' ? 9 : state === 'done' ? 4 : burnt ? 10 : 0, burnt);
    } else if (key === 'fryer') {
      s.baskets.forEach((b, i) => {
        b.position.y = state === 'cook' || burnt ? 0.86 : 1.0;
        this._fill(b.userData.food, state === 'idle' || (state === 'work' && i === 1) ? null : food, burnt, 0.0, 0.26, 0.32, state === 'cook' ? t : 1);
      });
      const [x, z] = W(0, 0);
      this.setSteam('fryer', x, 1.0, z, state === 'cook' || burnt ? 10 : 0, burnt);
    } else if (key === 'griddle') {
      s.glow.visible = state === 'cook' || burnt;
      this._fill(s.patties, state === 'idle' ? null : food, burnt, 0.955, 1.0, 0.5, state === 'cook' ? t : 1);
      const [x, z] = W(0, -0.04);
      this.setSteam('griddle', x, 1.0, z, state === 'cook' ? 6 : burnt ? 10 : 0, burnt);
    } else if (key === 'board') {
      this._fill(s.veg, state === 'work' ? food : null, false, TOP + 0.04, 0.3, 0.3, 1, true);
      s.workT = state === 'work' ? 1 : 0;
    }
    s.state = state;
  }

  /**
   * 在容器裡放食物(依食材規格);doneness 0~1:未熟時顏色較淡;raw = 砧板上的原料造型
   */
  _fill(group, food, burnt, y, w, d, doneness = 1, raw = false) {
    const key = food ? `${food.key}|${burnt}|${Math.round(doneness * 5)}|${raw}` : null;
    if (group.userData.fillKey === key) return;
    group.userData.fillKey = key;
    group.clear();
    if (!food) return;
    let spec = food;
    if (burnt) spec = { ...food, color: '#1a120c', color2: '#2a1a10' };
    else if (doneness < 1) spec = { ...food, color: new THREE.Color('#efe2c4').lerp(new THREE.Color(food.color), 0.35 + doneness * 0.65).getStyle() };
    if (raw && food.raw) {
      const mat = new THREE.MeshStandardMaterial({ color: { head: food.color, stick: food.color, tuber: '#b98a52' }[food.raw], roughness: 0.6 });
      const m = food.raw === 'stick' ? new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.25, 14), mat)
        : food.raw === 'tuber' ? new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 9), mat) : new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 14), mat);
      if (food.raw === 'stick') m.rotation.z = Math.PI / 2;
      m.position.set(-0.05, y + (food.raw === 'head' ? 0.08 : 0.03), -0.1);
      m.castShadow = true;
      group.add(m);
      return;
    }
    const b = bulkFood(spec, w, d, food.shape === 'rice' ? 1 : 2, 9);
    b.position.y = y;
    group.add(b);
  }

  /** 保溫餐檯庫存:ratio 0~1 → 顯示的食物塊數 */
  setPan(k, ratio) {
    const p = this.pans[k];
    if (p) {
      const ch = p.food.children, n = Math.ceil(ch.length * Math.max(0, Math.min(1, ratio)));
      ch.forEach((m, i) => { m.visible = i < n; });
      return;
    }
    const r = this.riceWarmers[k];
    if (r) {
      r.top.visible = ratio > 0;
      r.top.position.y = 0.06 + 0.24 * Math.min(1, ratio);
    }
  }
  setStacks(boxes, lids) {
    this.boxStack.count = Math.min(20, boxes);
    this.lidStack.count = Math.min(20, lids);
  }

  setTicket(bento, n, total) {
    const c = this.ticketTex.image.getContext('2d'), w = 256, h = 320;
    c.fillStyle = '#fffdf6'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#222'; c.textAlign = 'center';
    c.font = `500 22px ${font}`; c.fillText('臺鐵便當 製作單', w / 2, 34);
    c.fillRect(20, 46, w - 40, 2);
    if (bento) {
      const name = bento.name.replace('便當', '').replace('餐盒', '');
      c.font = `900 ${name.length > 4 ? Math.floor(220 / name.length) : 54}px ${font}`;
      c.fillStyle = bento.color || { pork: '#b23a2a', chicken: '#c98a1c', veg: '#3f7d3a' }[bento.id] || '#222';
      c.fillText(name, w / 2, 130);
      c.fillStyle = '#222'; c.font = `500 26px ${font}`;
      c.fillText(`第 ${n} / ${total} 個`, w / 2, 190);
    }
    c.font = '18px monospace'; c.fillText('- - - - - - - - - - -', w / 2, 260);
    this.ticketTex.needsUpdate = true;
  }

  setClock(secs) {
    const c = this.clockTex.image.getContext('2d'), w = 512, h = 160;
    c.fillStyle = '#050403'; c.fillRect(0, 0, w, h);
    c.fillStyle = secs < 60 ? '#ff3b2b' : '#ff9a1f';
    c.font = 'bold 30px monospace'; c.textAlign = 'center';
    c.fillText('出車倒數', w / 2, 40);
    c.font = 'bold 92px monospace';
    const m = Math.max(0, Math.floor(secs / 60)), s = Math.max(0, Math.floor(secs % 60));
    c.fillText(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, w / 2, 135);
    this.clockTex.needsUpdate = true;
  }

  update(dt, time) {
    // 火焰閃動、熱油氣泡
    const w = this.st.wok;
    if (w.flame.visible) { w.flame.scale.set(1 + Math.sin(time * 40) * 0.08, 1 + Math.sin(time * 33) * 0.2, 1); w.flame.material.opacity = 0.65 + Math.sin(time * 27) * 0.2; }
    if (w.state === 'cook') { w.contents.rotation.y += dt * 2; w.contents.position.y = Math.abs(Math.sin(time * 6)) * 0.03; w.wok.rotation.z = Math.sin(time * 6) * 0.06; }
    else { w.contents.position.y = 0; w.wok.rotation.z = 0; }
    const fr = this.st.fryer;
    if (fr.state === 'cook') fr.oils.forEach((o, i) => { o.position.y = 0.875 + Math.sin(time * 30 + i) * 0.002; });
    const g = this.st.griddle;
    if (g.glow.visible) g.glow.material.opacity = 0.18 + Math.sin(time * 3) * 0.05;
    const br = this.st.braise;
    if (br.state === 'cook') br.lid.position.y = 1.03 + Math.max(0, Math.sin(time * 11)) * 0.006;
    const bd = this.st.board;
    bd.knife.position.y = TOP + 0.04 + (bd.workT ? Math.abs(Math.sin(time * 14)) * 0.07 : 0);
    // 蒸氣粒子
    const S = this.steam, pos = S.pts.geometry.attributes.position;
    for (const e of Object.values(S.emitters)) {
      e.acc += e.rate * dt;
      while (e.acc >= 1) {
        e.acc -= 1;
        const p = S.p.find((q) => q.life <= 0);
        if (!p) break;
        Object.assign(p, { life: 1.6 + Math.random(), x: e.x + (Math.random() - 0.5) * 0.25, y: e.y, z: e.z + (Math.random() - 0.5) * 0.2, vy: 0.35 + Math.random() * 0.3, dark: e.dark });
      }
    }
    let dark = false;
    S.p.forEach((p, i) => {
      if (p.life > 0) { p.life -= dt; p.y += p.vy * dt; p.x += Math.sin(time + i) * 0.02 * dt; if (p.dark) dark = true; }
      pos.setXYZ(i, p.x, p.life > 0 ? p.y : -10, p.z);
    });
    S.pts.material.color.set(dark ? '#4a4a4a' : '#ffffff');
    pos.needsUpdate = true;
  }
}
