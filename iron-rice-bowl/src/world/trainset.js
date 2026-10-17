// 服務區段的車廂組:車殼、座椅(instancing)、自動門、車內照明、車內 LED 顯示器、區段兩端的封閉貫通門。
import * as THREE from 'three';
import { makeInstanced } from '../core/assets.js';
import { Tex } from '../core/textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export class TrainSet {
  /** quality.areaLights:true 用 RectAreaLight(柔和但吃效能),false 用點光源。 */
  constructor(assets, type, serviceCars, quality = { areaLights: false }) {
    this.type = type;
    this.n = serviceCars.length;
    this.carNumbers = serviceCars;
    this.pitch = type.carLength + type.gangway;
    this.half = type.carLength / 2;
    this.group = new THREE.Group();
    this.doors = [];
    this.seats = [];   // {x, z, car} 每個座位(乘客位置)

    const I = type.interior;
    for (let k = 0; k < this.n; k++) {
      const cx = this.carX(k);
      const car = assets.car.clone(true);
      car.position.x = cx;
      this.group.add(car);
      for (const [name, sign] of [['AutoDoor_F', 1], ['AutoDoor_R', -1]]) {
        const d = car.getObjectByName(name);
        if (d) this.doors.push({ obj: d, x: cx + sign * I.partitionX, open: 0 });
      }
      if (quality.areaLights) {
        const light = new THREE.RectAreaLight(0xfff1dc, 5.5, 2 * I.partitionX - 0.6, 1.0);
        light.position.set(cx, 2.19, 0);
        light.lookAt(cx, 0, 0);
        this.group.add(light);
      } else if (quality.pointLights) {
        const light = new THREE.PointLight(0xfff1dc, 6, 14, 1.2);
        light.position.set(cx, 2.05, 0);
        this.group.add(light);
      }
    }

    // 座椅:每節 seatRows 排 × 左右兩組
    const pairMatrices = [];
    for (let k = 0; k < this.n; k++) {
      for (let r = 0; r < I.seatRows; r++) {
        const x = this.carX(k) + I.firstRowX + r * I.seatPitch;
        let idx = 0;
        for (const side of [1, -1]) {
          const z = side * I.seatPairZ;
          pairMatrices.push(new THREE.Matrix4().makeTranslation(x, 0, z));
          for (const off of [1, -1]) {
            // 座號:每排 4 位,依序 +Z 靠窗、+Z 走道、-Z 走道、-Z 靠窗
            this.seats.push({
              x, z: z + off * I.seatOffset, car: k, carNo: serviceCars[k], row: r,
              num: r * 4 + (idx++) + 1, window: off === side,
            });
          }
        }
      }
    }
    for (const im of makeInstanced(assets.seat, pairMatrices.length)) {
      pairMatrices.forEach((m, i) => im.setMatrixAt(i, m));
      this.group.add(im);
    }

    this._buildDisplays();
    this._buildEndDoors(assets);
    this._buildSeatNumbers();
  }

  /** 行李架邊緣的座號牌(台鐵車廂的座號就標在行李架上)。 */
  _buildSeatNumbers() {
    const I = this.type.interior;
    const cols = 8, rows = Math.ceil((I.seatRows * 2) / cols);
    const cw = 128, ch = 48;
    const tex = Tex.label((c) => {
      c.fillStyle = '#f4f2ec';
      c.fillRect(0, 0, cols * cw, rows * ch);
      c.fillStyle = '#1b2a44';
      c.font = 'bold 30px "Segoe UI","Noto Sans TC",sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (let r = 0; r < I.seatRows; r++) {
        for (let s = 0; s < 2; s++) {
          const cell = r * 2 + s;
          const cx = (cell % cols) * cw, cy = Math.floor(cell / cols) * ch;
          const a = r * 4 + s * 2 + 1;
          c.strokeStyle = '#9aa3ad';
          c.lineWidth = 2;
          c.strokeRect(cx + 2, cy + 2, cw - 4, ch - 4);
          c.fillText(`${a}  ${a + 1}`, cx + cw / 2, cy + ch / 2 + 1);
        }
      }
    }, cols * cw, rows * ch);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const geos = [];
    for (let k = 0; k < this.n; k++) {
      for (let r = 0; r < I.seatRows; r++) {
        for (let s = 0; s < 2; s++) {
          const cell = r * 2 + s;
          const g = new THREE.PlaneGeometry(0.2, 0.075);
          const u0 = (cell % cols) / cols, u1 = u0 + 1 / cols;
          const v1 = 1 - Math.floor(cell / cols) / rows, v0 = v1 - 1 / rows;
          const uv = g.attributes.uv;
          // PlaneGeometry 頂點順序:左上、右上、左下、右下
          uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
          const side = s === 0 ? 1 : -1;  // s=0 → +Z 側(座號 1、2)
          // 面向走道:+Z 側的牌子朝 -Z,-Z 側朝 +Z;從走道看時座號順序由窗往走道
          g.rotateY(side > 0 ? Math.PI : 0);
          g.translate(this.carX(k) + I.firstRowX + r * I.seatPitch - 0.1, 1.86, side * 1.0);
          geos.push(g);
        }
      }
    }
    const merged = mergeGeometries(geos);
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    this.group.add(mesh);
  }

  carX(k) { return k * this.pitch; }
  get minX() { return -this.half; }
  get maxX() { return this.carX(this.n - 1) + this.half; }

  /** 回傳 {k, lx}:所在車廂索引與車廂內座標。 */
  local(x) {
    const k = Math.max(0, Math.min(this.n - 1, Math.round(x / this.pitch)));
    return { k, lx: x - this.carX(k) };
  }

  /** 是否在玄關/貫通道(可迴轉推車的空間)。 */
  inVestibule(x) {
    return Math.abs(this.local(x).lx) > this.type.interior.partitionX - 0.05;
  }

  _buildDisplays() {
    const I = this.type.interior;
    this.displayCanvasTex = Tex.label((c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); }, 512, 96);
    const mat = new THREE.MeshBasicMaterial({ map: this.displayCanvasTex, toneMapped: false });
    const housing = new THREE.MeshStandardMaterial({ color: '#202226', roughness: 0.4 });
    for (let k = 0; k < this.n; k++) {
      for (const sign of [1, -1]) {
        const g = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.74), housing);
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.12), mat);
        screen.position.x = -sign * 0.026;
        screen.rotation.y = -sign * Math.PI / 2;
        g.add(box, screen);
        g.position.set(this.carX(k) + sign * (I.partitionX - 0.06), I.displayY, 0);
        this.group.add(g);
      }
    }
    this.displayScroll = 0;
  }

  /** 車內 LED 顯示器(橘色點陣字,捲動顯示)。 */
  updateDisplay(text, dt) {
    const tex = this.displayCanvasTex;
    const c = tex.image.getContext('2d');
    const w = tex.image.width, h = tex.image.height;
    c.fillStyle = '#050403';
    c.fillRect(0, 0, w, h);
    c.font = 'bold 64px "Noto Sans TC","Microsoft JhengHei",sans-serif';
    c.textBaseline = 'middle';
    c.fillStyle = '#ff9a1f';
    const tw = c.measureText(text).width;
    this.displayScroll = (this.displayScroll + dt * 110) % (tw + w);
    c.fillText(text, w - this.displayScroll, h / 2 + 4);
    // 點陣遮罩
    c.fillStyle = 'rgba(0,0,0,0.55)';
    for (let x = 0; x < w; x += 4) c.fillRect(x, 0, 1, h);
    for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 1);
    tex.needsUpdate = true;
  }

  _buildEndDoors() {
    const mat = new THREE.MeshStandardMaterial({ color: '#8c9196', roughness: 0.35, metalness: 0.7 });
    const win = new THREE.MeshStandardMaterial({ color: '#1a1f24', roughness: 0.1, metalness: 0.2 });
    const signTex = Tex.label((c, w, h) => {
      c.fillStyle = '#0f3d6e'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.font = 'bold 54px "Noto Sans TC","Microsoft JhengHei",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('非服務區段', w / 2, h / 2);
    }, 384, 96);
    for (const [x, sign] of [[this.minX - 0.22, 1], [this.maxX + 0.22, -1]]) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.0, 0.92), mat));
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.6), win);
      w.position.set(sign * 0.021, 1.4, 0);
      w.rotation.y = sign * Math.PI / 2;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshBasicMaterial({ map: signTex }));
      s.position.set(sign * 0.021, 0.95, 0);
      s.rotation.y = sign * Math.PI / 2;
      g.add(w, s);
      g.position.set(x, 1.0, 0);
      g.children[0].position.y = 0;
      w.position.y = 0.4;
      s.position.y = -0.05;
      this.group.add(g);
    }
  }

  /**
   * 自動門:推車/服勤員任一端進入門前 1 m 內才開始開啟,約 1 秒全開。
   * 一般速度走到門口時已開好;快速推車會來不及(見 onboardPhase 撞門判定)。
   */
  updateDoors(lo, hi, dt) {
    for (const d of this.doors) {
      const target = d.x > lo - 1.0 && d.x < hi + 1.0 ? 1 : 0;
      d.open += (target - d.open) * Math.min(1, dt * (target ? 2.6 : 3.5));
      d.obj.position.z = -d.open * 0.86;
    }
  }

  /** 窗簾:拉下後遮住整條窗帶(看不到窗外,可關閉窗外景色省效能)。 */
  setCurtains(on) {
    if (!this.curtains) {
      const I = this.type.interior;
      const tex = Tex.label((c, w, h) => {
        const g = c.createLinearGradient(0, 0, w, 0);
        for (let i = 0; i <= 24; i++) g.addColorStop(i / 24, i % 2 ? '#b9a27c' : '#d8c49c');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(80,60,30,0.25)'; c.fillRect(0, h - 10, w, 10);
      }, 512, 128);
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.set(4, 1);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide });
      const w = 2 * I.partitionX - 0.1;
      const geos = [];
      for (let k = 0; k < this.n; k++) {
        for (const side of [1, -1]) {
          const g = new THREE.PlaneGeometry(w, 0.82);
          g.rotateY(side > 0 ? Math.PI : 0);
          g.translate(this.carX(k), 1.25, side * 1.33);
          geos.push(g);
        }
      }
      this.curtains = new THREE.Mesh(mergeGeometries(geos), mat);
      this.group.add(this.curtains);
    }
    this.curtains.visible = !!on;
  }
}
