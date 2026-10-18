// 服勤員 + 便當推車。group 原點 = 兩者中點;local +X 為推車方向(rotation.y 決定朝向)。
import * as THREE from 'three';
import { ITEM_LIST } from '../config/items.js';
import { Tex } from '../core/textures.js';

export const CREW = {
  half: 0.425,       // 中點到推車中心 / 服勤員的距離
  front: 0.855,      // 中點到推車前緣
  back: 0.675,       // 中點到服勤員背後
};

// 推車頂面配置(推車 local,X 範圍 -0.42~0.42):把手側放結帳機台,中間便當,前端飲料
const BENTO_SLOTS = [];
for (const y of [0, 0.053]) for (const x of [-0.13, 0.06]) for (const z of [-0.14, 0, 0.14]) BENTO_SLOTS.push([x, y, z]);
const DRINK_SLOTS = [];
for (const x of [0.19, 0.255, 0.32, 0.385]) for (const z of [-0.15, -0.05, 0.05, 0.15]) DRINK_SLOTS.push([x, 0, z]);
const POS_X = -0.33;     // 結帳機台在推車上的位置
const POS_TILT = 0.38;   // 朝服勤員傾斜(rad)
export const POS_KEYS = ['1', '2', '3', '4', '5', '⌫', '6', '7', '8', '9', '0', '⏎'];
const KEYS = POS_KEYS;
const KEY_LABEL = { '⌫': '刪除', '⏎': '確認' };

const font = '"Noto Sans TC","Microsoft JhengHei",sans-serif';

export class CartCrew {
  constructor(assets) {
    this.group = new THREE.Group();
    this.cart = assets.cart.clone(true);
    this.cart.position.x = CREW.half;
    // 有 rail-assets 時用寫實餐服員(推車姿勢、制服),否則用 Blender 人偶
    this.attendant = (assets.crew?.attendant || assets.attendant).clone(true);
    this.attendant.position.x = -CREW.half;
    this.head = new THREE.Object3D();
    this.head.position.set(-CREW.half, 1.98, 0);
    this.load = new THREE.Group();
    this.load.position.set(CREW.half, 0.95, 0);
    this.group.add(this.cart, this.attendant, this.head, this.load);

    this.templates = {};
    for (const it of ITEM_LIST) {
      const t = assets.food.getObjectByName(it.model);
      if (t) {
        this.templates[it.id] = t.clone(true);
        this.templates[it.id].position.set(0, 0, 0);
      }
    }
    this._labels();
    this._signs();
    this._pos(assets.pos);
  }

  /** 結帳機台:Blender 模型 + 頂面的螢幕與按鍵(Canvas 貼圖,可即時更新)。 */
  _pos(model) {
    const g = new THREE.Group();
    g.position.set(CREW.half + POS_X, 0.95 + 0.085 * Math.sin(POS_TILT), 0); // 傾斜後底角不陷入推車
    g.rotation.z = POS_TILT;
    g.add(model.clone(true));
    // 頂面平面:先朝上,再讓貼圖「上方」對準 +X(推車前進方向)、「右方」對準 +Z
    const top = new THREE.Group();
    top.rotation.y = -Math.PI / 2;
    top.position.y = 0.0455;
    g.add(top);
    const mkPlane = (w, hgt, tex, xOff) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.z = -xOff; // top 群組轉 -90° 後,local -Z = 世界 +X
      top.add(m);
      return m;
    };
    this.posScreenTex = Tex.label(() => {}, 512, 192);
    this.posKeysTex = Tex.label(() => {}, 512, 192);
    mkPlane(0.19, 0.066, this.posScreenTex, 0.037);
    this.posKeysMesh = mkPlane(0.19, 0.066, this.posKeysTex, -0.04); // 可點擊:onboardPhase 以射線取 UV 換算按鍵
    this.posGroup = g;
    this.group.add(g);
    this.posState = { line1: '', line2: '', mode: 'idle', pressed: null, pressedT: 0 };
    this.drawPos();
  }

  /** 世界座標:結帳機台中心(相機聚焦用)。 */
  posWorld(target = new THREE.Vector3()) {
    return this.posGroup.localToWorld(target.set(0, 0.045, 0));
  }

  setPos(line1, line2, mode = 'idle') {
    Object.assign(this.posState, { line1, line2, mode });
    this.drawPos();
  }

  flashKey(k) {
    this.posState.pressed = k;
    this.posState.pressedT = 0.15;
    this.drawPos();
  }

  updatePos(dt) {
    if (this.posState.pressedT > 0) {
      this.posState.pressedT -= dt;
      if (this.posState.pressedT <= 0) { this.posState.pressed = null; this.drawPos(); }
    }
  }

  drawPos() {
    const s = this.posState;
    let c = this.posScreenTex.image.getContext('2d');
    const W = 512, H = 192;
    const bg = { idle: '#0f2a1e', input: '#0f2a1e', bad: '#3a0f0f', good: '#0f3a1a' }[s.mode] || '#0f2a1e';
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,0.04)';
    for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 2);
    c.fillStyle = '#9dffb8';
    c.font = `bold 40px ${font}`;
    c.textBaseline = 'middle';
    c.fillText(s.line1, 20, 52);
    c.textAlign = 'right';
    c.font = 'bold 86px "Consolas","Courier New",monospace';
    c.fillStyle = s.mode === 'bad' ? '#ff8a8a' : '#d8ffe4';
    c.fillText(s.line2, W - 20, 132);
    c.textAlign = 'left';
    this.posScreenTex.needsUpdate = true;

    c = this.posKeysTex.image.getContext('2d');
    c.fillStyle = '#16181b'; c.fillRect(0, 0, W, H);
    const kw = W / 6, kh = H / 2;
    KEYS.forEach((k, i) => {
      const x = (i % 6) * kw, y = Math.floor(i / 6) * kh;
      const hot = s.pressed === k;
      c.fillStyle = hot ? '#f08a24' : k === '⏎' ? '#2f7d43' : k === '⌫' ? '#7d2f2f' : '#d9dde2';
      c.beginPath();
      c.roundRect(x + 6, y + 6, kw - 12, kh - 12, 12);
      c.fill();
      c.fillStyle = hot || k === '⏎' || k === '⌫' ? '#fff' : '#1a1a1a';
      // 功能鍵以中文標示(⌫ = 刪除、⏎ = 確認)
      c.font = k === '⌫' || k === '⏎' ? `bold 34px ${font}` : 'bold 50px "Segoe UI",sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(KEY_LABEL[k] || k, x + kw / 2, y + kh / 2 + 2);
    });
    c.textAlign = 'left';
    this.posKeysTex.needsUpdate = true;
  }

  _labels() {
    this.labelMat = {};
    const colors = { pork: '#b23a2a', chicken: '#c98a1c', veg: '#3f7d3a' };
    for (const [id, col] of Object.entries(colors)) {
      const it = ITEM_LIST.find((i) => i.id === id);
      const tex = Tex.label((c, w, h) => {
        c.fillStyle = '#f6f0e0'; c.fillRect(0, 0, w, h);
        c.fillStyle = col; c.fillRect(0, 0, w, 22); c.fillRect(0, h - 22, w, 22);
        c.fillStyle = '#1b1b1b';
        c.font = `bold 46px ${font}`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(`臺鐵${it.short}`, w / 2, h / 2);
      }, 256, 160);
      this.labelMat[id] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    }
  }

  _signs() {
    const tex = Tex.label((c, w, h) => {
      c.fillStyle = '#d4572a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.font = `bold 62px ${font}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('臺鐵便當', w / 2, h / 2 - 8);
      c.font = `bold 20px "Segoe UI",sans-serif`;
      c.fillText('TRA BENTO · DRINKS', w / 2, h - 16);
    }, 512, 120);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
    for (const side of [1, -1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.14), mat);
      p.position.set(CREW.half, 0.79, side * 0.219);
      if (side < 0) p.rotation.y = Math.PI;
      this.group.add(p);
    }
  }

  /** 依庫存擺放推車上的便當與飲料。 */
  setStock(stock) {
    this.load.clear();
    let bi = 0, di = 0;
    for (const it of ITEM_LIST) {
      const tpl = this.templates[it.id];
      if (!tpl) continue;
      for (let n = 0; n < stock[it.id]; n++) {
        const slot = it.kind === 'bento' ? BENTO_SLOTS[bi++] : DRINK_SLOTS[di++];
        if (!slot) break;
        const o = tpl.clone(true);
        o.position.set(...slot);
        if (it.kind === 'bento') {
          const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.075), this.labelMat[it.id]);
          lab.rotation.x = -Math.PI / 2;
          lab.rotation.z = Math.PI / 2;
          lab.position.y = 0.0535;
          o.add(lab);
        }
        this.load.add(o);
      }
    }
  }

  /** mid:中點 X;angle:朝向角(0 = +X)。 */
  place(mid, angle, t, moving, y = 0, z = 0) {
    this.group.position.set(mid, y, z);
    this.group.rotation.y = angle;
    // 走路時身體微微起伏
    this.attendant.position.y = moving ? Math.abs(Math.sin(t * 7)) * 0.025 : 0;
  }
}
