// 坐著的乘客:以 InstancedMesh 繪製(每個材質一次 draw call),並管理「想買東西」的狀態與頭上圖示。
// 有 rail-assets 寫實人物時用它們的坐姿(每個人物變體一組 InstancedMesh);否則用簡易人偶並隨機換衣服顏色。
import * as THREE from 'three';
import { makeInstanced } from '../core/assets.js';
import { Tex } from '../core/textures.js';

const PALETTE = {
  Top: ['#d8d8d8', '#2f3a4f', '#7a2e2e', '#e6d5b8', '#3d5a40', '#20242c', '#b6c4d6', '#c7793b', '#f2f2f2', '#5b4a6e', '#8fa3b8', '#a33b52'],
  Bottom: ['#2a2f3a', '#1d1f24', '#5a6170', '#3a4a6a', '#7d6a55', '#c9c2b4', '#24324e'],
  Hair: ['#141210', '#1e1a17', '#2b221c', '#3b2d22', '#6e6a66', '#a8a39e'],
  Skin: ['#e8c0a0', '#dcae8e', '#c99a78', '#f0cdb0', '#b98a68'],
};
const pick = (a, R) => a[(R() * a.length) | 0];

export class Passengers {
  constructor(assets, train, R, castShadow = true, realistic = true) {
    this.R = R;
    this.train = train;
    this.seats = train.seats.map((s, i) => ({
      ...s, i, occupied: false, wants: false, served: false, patience: 0, maxPatience: 1, icon: null,
      gender: 'm', head: new THREE.Vector3(s.x - 0.19, 1.3, s.z),
    }));
    this.group = new THREE.Group();
    // 寫實人物:面向 -Z → 轉成面向 +X(車廂前進方向)
    this.people = realistic ? assets.people : null;
    this.facing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.people ? -Math.PI / 2 : 0);
    this.kinds = this.people
      ? this.people.map((v) => ({ v, parts: makeInstanced(v.sit, this.seats.length, { shadow: castShadow }) }))
      : [{ v: null, parts: makeInstanced(assets.passengerSit, this.seats.length, { colorSlots: Object.keys(PALETTE), shadow: castShadow }) }];
    this.kinds.forEach((k) => k.parts.forEach((p) => this.group.add(p)));
    this.iconTex = Tex.bubble('🍱');
    this.iconPool = [];
  }

  _setSeat(seat, occupied) {
    seat.occupied = occupied;
    seat.wants = false;
    seat.served = false;
    seat.pitched = false;
    this._hideIcon(seat);
    if (!occupied) return;
    seat.kind = (this.R() * this.kinds.length) | 0;
    const real = this.kinds[seat.kind].v;
    seat.matrix = new THREE.Matrix4().compose(new THREE.Vector3(seat.x, 0, seat.z), this.facing,
      real ? new THREE.Vector3().setScalar(0.93 + this.R() * 0.1) : new THREE.Vector3(1, 0.92 + this.R() * 0.14, 1));
    // 乘客聲音(語音 ID 尾碼):m = 雲哲、f = 曉雨、f2 = 曉臻(三聲混用);寫實人物依外觀性別
    seat.gender = real ? (real.female ? (this.R() < 0.5 ? 'f' : 'f2') : 'm') : this.R() < 0.5 ? 'm' : this.R() < 0.5 ? 'f' : 'f2';
    seat.colors = {};
    for (const k of Object.keys(PALETTE)) seat.colors[k] = new THREE.Color(pick(PALETTE[k], this.R));
  }

  /** 只把有人坐的座位緊密寫入 instance(空位不佔頂點運算)。 */
  _commit() {
    this.kinds.forEach((k, ki) => {
      const occ = this.seats.filter((s) => s.occupied && s.kind === ki);
      for (const p of k.parts) {
        occ.forEach((s, i) => {
          p.setMatrixAt(i, s.matrix);
          if (p.userData.colored) p.setColorAt(i, s.colors[p.userData.slot]);
        });
        p.count = occ.length;
        p.instanceMatrix.needsUpdate = true;
        if (p.instanceColor) p.instanceColor.needsUpdate = true;
      }
    });
  }

  fill(rate) {
    for (const s of this.seats) this._setSeat(s, this.R() < rate);
    this._commit();
  }

  /** 停站換乘客:部分下車、部分上車;回傳換了多少人。 */
  exchange(rate, target) {
    let n = 0;
    for (const s of this.seats) {
      if (s.wants || s.preorder) continue; // 預訂便當的乘客坐到終點
      if (s.occupied && this.R() < rate) { this._setSeat(s, false); n++; }
      else if (!s.occupied && this.R() < rate * target) { this._setSeat(s, true); n++; }
    }
    this._commit();
    return n;
  }

  get wanting() { return this.seats.filter((s) => s.wants); }

  /** 隨機讓一位乘客想買東西(避開推車附近,模擬遠處招手)。 */
  spawnBuyer(patienceRange, avoidX) {
    const cands = this.seats.filter((s) => s.occupied && !s.wants && !s.served && !s.preorder && Math.abs(s.x - avoidX) > 3);
    if (!cands.length) return null;
    const s = pick(cands, this.R);
    s.wants = true;
    s.maxPatience = s.patience = patienceRange[0] + this.R() * (patienceRange[1] - patienceRange[0]);
    this._showIcon(s);
    return s;
  }

  /** 每幀更新耐心;回傳本幀放棄購買的乘客。 */
  update(dt, time) {
    const gaveUp = [];
    for (const s of this.seats) {
      if (!s.wants) continue;
      s.patience -= dt;
      const r = Math.max(0, s.patience / s.maxPatience);
      if (s.icon) {
        s.icon.material.color.setRGB(1, 0.45 + 0.55 * r, 0.45 + 0.55 * r);
        s.icon.position.y = 1.62 + Math.sin(time * 3 + s.i) * 0.03;
        s.icon.scale.setScalar(r < 0.3 ? 0.34 + Math.sin(time * 10) * 0.03 : 0.32);
      }
      if (s.patience <= 0) {
        s.wants = false;
        s.served = true;
        this._hideIcon(s);
        gaveUp.push(s);
      }
    }
    return gaveUp;
  }

  markServed(s) {
    s.wants = false;
    s.served = true;
    this._hideIcon(s);
  }

  nearestWanting(x, range) {
    let best = null, bd = range;
    for (const s of this.seats) {
      if (!s.wants) continue;
      const d = Math.abs(s.x - x);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  _showIcon(s) {
    const sp = this.iconPool.pop() || new THREE.Sprite(new THREE.SpriteMaterial({ map: this.iconTex, depthTest: true }));
    sp.position.set(s.x, 1.62, s.z);
    sp.scale.setScalar(0.32);
    sp.visible = true;
    this.group.add(sp);
    s.icon = sp;
  }

  _hideIcon(s) {
    if (!s.icon) return;
    s.icon.visible = false;
    this.group.remove(s.icon);
    this.iconPool.push(s.icon);
    s.icon = null;
  }
}
