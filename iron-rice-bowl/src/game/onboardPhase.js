// 「車上販售」階段:列車行駛、推車移動、點餐 → 心算結帳(第一人稱結帳機台)、預訂便當配送、
// 乘客狀況、趟數判定;失敗時演出「被列車長趕下車」。
import * as THREE from 'three';
import { TRAIN_TYPES } from '../config/trains.js';
import { STATIONS } from '../config/stations.js';
import { ITEMS, ITEM_LIST } from '../config/items.js';
import { INCIDENTS } from '../config/incidents.js';
import { rng, Tex } from '../core/textures.js';
import { cloneWithColors } from '../core/assets.js';
import { TrainSet } from '../world/trainset.js';
import { Passengers } from '../world/passengers.js';
import { Scenery } from '../world/scenery.js';
import { CartCrew, CREW, POS_KEYS } from '../world/cartCrew.js';
import { OVERCHARGE_COMPLAINT_CHANCE } from './career.js';

const PUSH_SPEED = 1.8;
const FAST_SPEED = 3.6;     // 快速前進(按住 Shift / 畫面「快速」鈕)
const CRASH_SPEED = 2.5;    // 超過此速度撞上障礙物、乘客或來不及開的車門才會「撞上」
const DOOR_OK = 0.62;       // 推車前緣通過車門時,門至少要開到這個比例
const PULL_SPEED = 0.8;
const TURN_TIME = 0.7;
const SERVE_RANGE = 0.95;
const INCIDENT_RANGE = 1.3;
const KICK_TIME = 7;
const FOV = { normal: 62, pos: 32 };
const BENTOS = ITEM_LIST.filter((i) => i.kind === 'bento');

const shuffle = (a, R) => {
  for (let i = a.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class OnboardPhase {
  constructor(game, cfg) {
    this.g = game;
    this.cfg = cfg;
    this.type = TRAIN_TYPES[cfg.trainType];
  }

  async init() {
    const { g, cfg, type } = this;
    const assets = (this.assets = await g.loadAssets(type));
    this.R = rng((Math.random() * 1e9) | 0);
    this.root = new THREE.Group();
    g.scene.add(this.root);

    this.train = new TrainSet(assets, type, cfg.serviceCars, g.quality);
    this.pax = new Passengers(assets, this.train, this.R, g.quality.paxShadows);
    this.pax.fill(cfg.occupancy);
    this.crew = new CartCrew(assets);
    this.scenery = new Scenery(g.renderer, cfg.scenery, assets, g.quality);
    this.root.add(this.train.group, this.pax.group, this.crew.group, this.scenery.group);
    g.scene.fog = this.scenery.fog;

    // 路線與行駛曲線:區間時間 T → 距離 d = v(T - v/a)(加減速各佔 v/2a 距離)
    const v = type.maxSpeed, a = type.accel;
    this.stops = cfg.route.map((id) => ({ id, ...STATIONS[id] }));
    this.legDist = cfg.legTimes.map((T) => v * Math.max(5, T - v / a));
    this.S = [0];
    this.legDist.forEach((d, i) => this.S.push(this.S[i] + d));
    this.run = { leg: 0, pos: 0, v: 0, s: 0, mode: 'dwell', dwell: 9, announced: false, endTimer: null, clackAcc: 0 };

    this.p = { mid: this.train.minX + 0.1 + CREW.back, facing: 1, angle: 0, vel: 0, turning: null };
    this.trips = { done: 0, required: cfg.tripsRequired, outbound: true };
    this.stock = { ...cfg.stock };
    this.crew.setStock(this.stock);
    this.stats = {
      revenue: 0, sold: 0, served: 0, missed: 0, sat: 100, wrongOrder: 0, incidents: 0,
      underLoss: 0, underCount: 0, overCount: 0, deductions: 0,
      crashes: 0, damaged: 0, pitched: 0, pitchSold: 0, restocks: 0,
    };
    this.stopEvt = null;          // 中途停靠站的事件(擋道判定、月台補貨)
    this.curtainTimer = 25 + this.R() * 20;
    this.pendingPitch = null;
    this._hv = new THREE.Vector3();
    // 只聽得到同一節車廂的對話(別節車廂只有字幕)
    g.voice.hearing = (anchor) => this._hearing(anchor);
    this.applySettings();
    this.complaints = [];
    this.incidents = [];
    this.dialog = null;
    this.kick = null;
    this.buyerTimer = 3;
    this.time = 0;
    this.cam = { yaw: 0, pitch: 0, mode: 'third', look: new THREE.Vector3(), fov: FOV.normal };
    this.exclaimTex = Tex.bubble('❗');
    this._makeTickets(cfg.preorders || 0);
    for (let i = 0; i < cfg.incidents.initial; i++) this.spawnIncident(6);
    this.crew.setPos('臺鐵便當', 'READY');

    this._placeCamera(1, true);
    const term = this.stops.at(-1).id;
    g.voice.announce([`station_depart_${term}`, `conductor_welcome_${term}`, `conductor_welcome_${term}_en`]);
    g.ui.toast(`${cfg.trainNo} 往 ${this.stops.at(-1).zh},即將出發!`, 'info');
    if (this.tickets.length) g.ui.toast(`有 ${this.tickets.length} 份預訂便當要送到指定座位(按 F 送餐)`, 'info');
    this.calloutTimer = 6;
  }

  dispose() {
    this.g.voice.hearing = null;
    this.g.scene.remove(this.root);
    this.g.scene.fog = null;
    this.g.voice.stopAll();
    this.g.ui.clearBubbles();
    this.g.camera.fov = FOV.normal;
    this.g.camera.updateProjectionMatrix();
  }

  /** 套用遊戲中可切換的設定(窗簾);畫質由 Game 處理。 */
  applySettings() {
    const on = !!this.g.settings.curtains;
    this.train.setCurtains(on);
    // 窗簾拉下:窗外景物不繪製(保留燈光,車內亮度不變)
    this.scenery.group.children.forEach((o) => { if (!o.isLight) o.visible = !on; });
  }

  /** 對話可聽度:不同車廂 0(只顯示字幕);同一節車廂依距離 1 → 0.45。 */
  _hearing(anchor) {
    const v = anchor.isObject3D ? anchor.getWorldPosition(this._hv) : anchor;
    if (this.train.local(v.x).k !== this.train.local(this.p.mid).k) return 0;
    return Math.max(0.45, 1 - Math.abs(v.x - this.p.mid) / 22);
  }

  /** 推車附近、同一節車廂中隨機一位坐著的乘客(抱怨用)。 */
  _nearbySeat(range = 6) {
    const k = this.train.local(this.p.mid).k;
    const c = this.pax.seats.filter((s) => s.occupied && s.car === k && Math.abs(s.x - this.p.mid) < range);
    return c.length ? c[(this.R() * c.length) | 0] : null;
  }

  // ---------------------------------------------------------------- 預訂便當
  _makeTickets(n) {
    this.tickets = [];
    this.reserved = Object.fromEntries(BENTOS.map((b) => [b.id, 0]));
    const cands = shuffle(this.pax.seats.filter((s) => s.occupied && s.x > this.train.minX + 4), this.R);
    for (const seat of cands.slice(0, n)) {
      const item = BENTOS[(this.R() * BENTOS.length) | 0].id;
      const t = { seat, item, done: false, failed: false };
      seat.preorder = t;
      this.tickets.push(t);
      this.reserved[item]++;
    }
  }

  // ---------------------------------------------------------------- 列車行駛
  _updateTrain(dt) {
    const r = this.run, { maxSpeed: vmax, accel: a } = this.type;
    if (r.endTimer !== null) { r.endTimer -= dt; return; }
    if (r.mode === 'dwell') {
      r.v = 0;
      r.dwell -= dt;
      if (r.dwell <= 0) {
        r.mode = 'run';
        this.stopEvt = null;
        r.announced = false;
        if (r.leg > 0) this.g.voice.announce([`station_depart_${this.stops.at(-1).id}`]);
      }
      return;
    }
    const rem = this.legDist[r.leg] - r.pos;
    r.v = Math.min(vmax, r.v + a * dt, Math.sqrt(2 * a * Math.max(rem, 0)) + 0.05);
    const ds = Math.min(r.v * dt, Math.max(rem, 0));
    r.pos += ds;
    r.s += ds;
    r.clackAcc += ds;
    if (r.clackAcc > 25) { r.clackAcc = 0; if (r.v > 3) this.g.sfx.clack(r.v / vmax); }
    if (!r.announced && rem < vmax * 22) {
      r.announced = true;
      const st = this.stops[r.leg + 1];
      this.g.sfx.chime();
      this.g.voice.announce([`conductor_arrive_${st.id}`, `conductor_arrive_${st.id}_en`]);
    }
    if (this.legDist[r.leg] - r.pos <= 0.02) this._arrive();
  }

  _arrive() {
    const r = this.run;
    r.leg++;
    r.pos = 0;
    r.v = 0;
    r.s = this.S[r.leg];
    const st = this.stops[r.leg];
    this.g.voice.announce([`station_arrived_${st.id}`, `station_arrived_${st.id}_en`]);
    if (r.leg >= this.stops.length - 1) {
      if (this.trips.done < this.trips.required) this._startKick();
      else {
        r.endTimer = 3.5;
        this.g.ui.toast(`列車抵達終點 ${st.zh}`, 'info');
      }
      return;
    }
    r.mode = 'dwell';
    r.dwell = this.cfg.dwell;
    this.stopEvt = { blockT: 2.5 + this.R() * 3, blockChecked: false, restocked: false };
    const n = this.pax.exchange(0.28, this.cfg.occupancy);
    this.g.ui.toast(`${st.zh} 到了 — ${n} 位旅客上下車`, 'info');
    const [lo, hi] = this.cfg.incidents.perStop;
    const k = lo + Math.floor(this.R() * (hi - lo + 1));
    for (let i = 0; i < k; i++) this.spawnIncident(4);
  }

  /** 到下一站 / 終點的預估秒數。 */
  _eta() {
    const r = this.run, { maxSpeed: v, accel: a } = this.type;
    let next;
    if (r.mode === 'dwell') next = r.dwell + (this.cfg.legTimes[r.leg] ?? 0);
    else {
      const rem = this.legDist[r.leg] - r.pos;
      const brake = v * v / (2 * a);
      next = rem > brake ? (rem - brake) / v + v / a + (v - r.v) ** 2 / (2 * a * v) : Math.sqrt(2 * rem / a);
    }
    let final = next;
    for (let i = r.leg + 1; i < this.legDist.length; i++) final += this.cfg.legTimes[i] + this.cfg.dwell;
    return { next, final };
  }

  // ---------------------------------------------------------------- 任務失敗:被列車長趕下車
  _startKick() {
    const center = (this.train.n - 1) * this.train.pitch / 2;
    this.dialog = null;
    this.kick = { t: 0, center };
    this.run.endTimer = KICK_TIME;
    this.g.ui.setPrompt(null);
    this.g.ui.renderDialog(null);
    this.crew.cart.visible = this.crew.load.visible = this.crew.posGroup.visible = false;
    const conductor = cloneWithColors(this.assets.attendant, { Uniform_Vest: '#0b1430', Uniform_Pants: '#0b1430' });
    conductor.position.set(center + 0.9, 0.05, -1.9);
    conductor.rotation.y = Math.PI / 2 + 0.5;
    const head = new THREE.Object3D();
    head.position.set(center + 0.9, 2.05, -1.9);
    this.root.add(conductor, head);
    this.kick.head = head;
    this.g.sfx.lose();
    this.g.voice.talk('conductor_kickoff', head);
    setTimeout(() => this.g.ui.bubble({ text: '(嗚嗚……便當還沒賣完……)', anchor: this.crew.head, label: '服勤員', duration: 3500 }), 3000);
  }

  _updateKick(dt) {
    const k = this.kick;
    k.t += dt;
    const step = Math.min(1, k.t / 1.2);
    // 服勤員從車門被「請」到月台上
    const z = THREE.MathUtils.lerp(-1.2, -3.0, step);
    this.crew.place(k.center - 0.4, -Math.PI / 2, this.time, step < 1, step < 0.4 ? 0 : 0.05, z);
    const cam = this.g.camera;
    const pos = new THREE.Vector3(k.center - 3.6, 1.7, -7.2);
    cam.position.lerp(pos, 1 - Math.exp(-dt * 3));
    this.cam.look.lerp(new THREE.Vector3(k.center, 1.2, -2.2), 1 - Math.exp(-dt * 3));
    cam.lookAt(this.cam.look);
    this._setFov(FOV.normal, dt);
  }

  // ---------------------------------------------------------------- 推車移動
  _extent(mid = this.p.mid, facing = this.p.facing) {
    return facing > 0 ? [mid - CREW.back, mid + CREW.front] : [mid - CREW.front, mid + CREW.back];
  }

  _updatePlayer(dt) {
    const P = this.p, inp = this.g.input;
    if (P.turning) {
      P.turning.t = Math.min(1, P.turning.t + dt / TURN_TIME);
      const e = P.turning.t < 0.5 ? 2 * P.turning.t ** 2 : 1 - (-2 * P.turning.t + 2) ** 2 / 2;
      P.angle = P.turning.from + Math.PI * e;
      if (P.turning.t >= 1) {
        P.facing *= -1;
        P.angle = P.facing > 0 ? 0 : Math.PI;
        P.turning = null;
        this._clampMid();
      }
      return;
    }
    if (P.stun > 0) { P.stun -= dt; P.vel = 0; return; }
    let want = 0;
    let fast = false;
    if (!this.dialog) {
      if (inp.isDown('KeyW', 'ArrowUp')) want = 1;
      else if (inp.isDown('KeyS', 'ArrowDown')) want = -1;
      fast = want > 0 && inp.isDown('ShiftLeft', 'ShiftRight');
      if (inp.wasPressed('Space')) {
        if (this.train.inVestibule(P.mid)) {
          P.turning = { t: 0, from: P.angle };
          P.vel = 0;
          this.g.sfx.blip();
          return;
        }
        this.g.ui.toast('走道太窄!只能在車廂兩端的玄關迴轉推車', 'warn');
      }
    }
    const target = want > 0 ? (fast ? FAST_SPEED : PUSH_SPEED) : want < 0 ? -PULL_SPEED : 0;
    const acc = want ? (fast ? 3 : 4) : 6;
    P.vel += Math.sign(target - P.vel) * Math.min(Math.abs(target - P.vel), acc * dt);
    P.fast = fast;
    if (!P.vel) return;
    const before = P.mid;
    const speed = Math.abs(P.vel);
    const frontBefore = before + P.facing * CREW.front * Math.sign(P.vel);
    P.mid += P.vel * P.facing * dt;
    // 撞門:推車前緣通過車門時,門還沒開夠
    if (speed > CRASH_SPEED) {
      const front = P.mid + P.facing * CREW.front * Math.sign(P.vel);
      const door = this.train.doors.find((d) => (d.x - frontBefore) * (d.x - front) <= 0 && d.open < DOOR_OK);
      if (door) {
        P.mid = before;
        this._crash('door', door);
        return;
      }
    }
    const blocker = this._clampMid(before);
    if (blocker && speed > CRASH_SPEED) this._crash('incident', blocker);
  }

  /** 快速推車撞上車門或走道上的乘客/行李:停下、耽擱、可能撞壞商品與客訴。 */
  _crash(kind, what) {
    const g = this.g, P = this.p;
    P.vel = 0;
    P.stun = 1.4;
    this.stats.crashes++;
    g.sfx.bad();
    g.sfx.clack(1.6);
    // 推車上的商品可能掉出來摔壞
    const have = ITEM_LIST.filter((i) => this.stock[i.id] > 0);
    if (have.length && this.R() < 0.6) {
      const it = have[(this.R() * have.length) | 0];
      this.stock[it.id]--;
      this.crew.setStock(this.stock);
      this.stats.damaged++;
      g.ui.toast(`${it.name}掉出來摔壞了!`, 'bad');
    }
    if (kind === 'door') {
      g.ui.toast('砰!車門來不及打開,推車撞上去了(放慢速度!)', 'bad');
      this._sat(-2);
      const seat = this._nearbySeat(5);
      if (seat && this.R() < 0.35) {
        g.voice.talk([{ id: 'att_sorry_crash', anchor: this.crew.head }, { id: `pax_door_noise_${seat.gender}`, anchor: seat.head }]);
        this._complain('推車撞門噪音');
      } else g.voice.talk('att_sorry_crash', this.crew.head);
      return;
    }
    const inc = what;
    this._sat(-6);
    if (inc.def.prop === 'adult' || inc.def.prop === 'kid') {
      g.ui.toast('推車撞到乘客了!', 'bad');
      const gender = this.R() < 0.5 ? 'm' : 'f';
      g.voice.talk([{ id: 'att_sorry_crash', anchor: this.crew.head }, { id: `pax_crash_${gender}`, anchor: inc.anchor }]);
      this._complain(`推車撞到乘客(${inc.def.title})`);
    } else {
      g.ui.toast(`推車撞上${inc.def.title}!`, 'bad');
      g.voice.talk('att_sorry_crash', this.crew.head);
    }
  }

  /** 邊界與障礙物限制;before 為移動前位置(用來判斷障礙物在哪一側)。回傳擋住推車的狀況(若有)。 */
  _clampMid(before = this.p.mid) {
    const P = this.p;
    const [lo0, hi0] = this._extent(before);
    let minLo = this.train.minX + 0.08, maxHi = this.train.maxX - 0.08;
    let hiInc = null, loInc = null;
    for (const inc of this.incidents) {
      if (!inc.active) continue;
      if (inc.x >= hi0 - 0.01 && inc.x - 0.3 < maxHi) { maxHi = inc.x - 0.3; hiInc = inc; }
      else if (inc.x <= lo0 + 0.01 && inc.x + 0.3 > minLo) { minLo = inc.x + 0.3; loInc = inc; }
    }
    const [lo, hi] = this._extent();
    let blocker = null;
    if (hi > maxHi) { P.mid -= hi - maxHi; P.vel = 0; blocker = hiInc; }
    if (lo < minLo) { P.mid += minLo - lo; P.vel = 0; blocker = loInc; }
    return blocker;
  }

  _updateTrips() {
    const [lo, hi] = this._extent();
    const I = this.type.interior;
    const farLine = this.train.carX(this.train.n - 1) + I.partitionX + 0.2;
    const homeLine = -I.partitionX - 0.2;
    if (this.trips.outbound && hi >= farLine) {
      this.trips.outbound = false;
      this.g.sfx.ok();
      this.g.ui.toast(`抵達區段終點(第 ${this.train.carNumbers.at(-1)} 車)— 迴轉推車往回走!`, 'good');
    } else if (!this.trips.outbound && lo <= homeLine) {
      this.trips.outbound = true;
      this.trips.done++;
      this.stock = { ...this.cfg.stock };
      this.crew.setStock(this.stock);
      this.g.sfx.win();
      this.g.voice.talk('att_restock', this.crew.head);
      const left = this.trips.required - this.trips.done;
      this.g.ui.toast(left > 0 ? `完成第 ${this.trips.done} 趟!已在備餐區補貨,還剩 ${left} 趟` : `已完成全部 ${this.trips.required} 趟!可以繼續販售衝業績`, 'good');
    }
  }

  // ---------------------------------------------------------------- 乘客狀況
  spawnIncident(minDist) {
    const active = new Set(this.incidents.filter((i) => i.active).map((i) => i.def.id));
    const defs = INCIDENTS.filter((d) => !active.has(d.id));
    if (!defs.length) return;
    const def = defs[(this.R() * defs.length) | 0];
    const I = this.type.interior;
    let x = null;
    for (let tries = 0; tries < 30 && x === null; tries++) {
      const k = (this.R() * this.train.n) | 0;
      const cand = this.train.carX(k) + (this.R() * 2 - 1) * (I.partitionX - 1.4);
      const [lo, hi] = this._extent();
      if (cand > lo - minDist && cand < hi + minDist) continue;
      if (this.incidents.some((i) => i.active && Math.abs(i.x - cand) < 3)) continue;
      x = cand;
    }
    if (x === null) return;
    const obj = this._incidentObject(def.prop);
    obj.position.x = x;
    this.root.add(obj);
    const h = { suitcase: 1.25, spill: 0.6, kid: 1.4, adult: 2.1 }[def.prop];
    const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.exclaimTex }));
    mark.scale.setScalar(0.3);
    mark.position.set(x, h, 0);
    this.root.add(mark);
    const anchor = new THREE.Object3D();
    anchor.position.set(x, h - 0.15, 0);
    this.root.add(anchor);
    this.incidents.push({ def, x, obj, mark, anchor, active: true, progress: 0, baseY: h });
  }

  _incidentObject(prop) {
    const R = this.R, A = this.assets;
    const pick = (a) => a[(R() * a.length) | 0];
    const outfit = () => ({
      Top: pick(['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad', '#ecf0f1', '#34495e']),
      Bottom: pick(['#2a2f3a', '#3a4a6a', '#7d6a55', '#1d1f24']),
      Hair: pick(['#141210', '#2b221c', '#6e6a66']),
    });
    if (prop === 'suitcase') {
      const o = cloneWithColors(A.suitcase, { Suitcase_Shell: pick(['#c0392b', '#2471a3', '#d4ac0d', '#7f8c8d', '#6c3483']) });
      o.rotation.y = Math.PI / 2 + (R() - 0.5) * 0.5;
      return o;
    }
    if (prop === 'spill') {
      const g = new THREE.Group();
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.42, 28),
        new THREE.MeshStandardMaterial({ color: '#5b3a1c', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.8 }));
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.y = 0.004;
      puddle.scale.set(1, 0.7, 1);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.11, 14),
        new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.6 }));
      cup.rotation.z = Math.PI / 2;
      cup.position.set(0.15, 0.035, 0.08);
      g.add(puddle, cup);
      return g;
    }
    const o = cloneWithColors(A.passengerStand, outfit());
    o.rotation.y = Math.PI + (R() - 0.5) * 1.2;
    if (prop === 'kid') o.scale.setScalar(0.6);
    return o;
  }

  _resolveIncident(inc) {
    inc.active = false;
    this.root.remove(inc.obj, inc.mark);
    this.stats.incidents++;
    this.g.sfx.ok();
  }

  // ---------------------------------------------------------------- 互動目標
  _cartX() { return this.p.mid + this.p.facing * CREW.half; }

  _target() {
    const [lo, hi] = this._extent();
    let inc = null, best = INCIDENT_RANGE;
    for (const i of this.incidents) {
      if (!i.active) continue;
      const gap = i.x > this.p.mid ? i.x - hi : lo - i.x;
      if (gap < best) { best = gap; inc = i; }
    }
    if (inc) return { kind: 'incident', inc };
    const seat = this.pax.nearestWanting(this._cartX(), SERVE_RANGE);
    return seat ? { kind: 'order', seat } : null;
  }

  /** 推車旁最近的一排座位(送預訂便當用)。 */
  _nearRow() {
    const cx = this._cartX();
    let best = null, bd = SERVE_RANGE;
    for (const s of this.pax.seats) {
      const d = Math.abs(s.x - cx);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return null;
    return this.pax.seats.filter((s) => s.car === best.car && s.row === best.row);
  }

  _sat(d) { this.stats.sat = Math.max(0, Math.min(100, this.stats.sat + d)); }

  _complain(reason) {
    this.complaints.push(reason);
    this.g.ui.toast(`客訴:${reason}`, 'bad');
  }

  // ---------------------------------------------------------------- 點餐
  _genOrder() {
    const R = this.R;
    const pool = (kind) => ITEM_LIST.filter((i) => i.kind === kind && this.stock[i.id] > 0);
    const order = [];
    const nb = R() < 0.15 ? 0 : R() < 0.82 ? 1 : 2;
    const nd = R() < 0.35 ? 0 : R() < 0.85 ? 1 : 2;
    for (const [kind, n] of [['bento', nb], ['drink', nd]]) {
      order.push(...shuffle(pool(kind), R).slice(0, n).map((i) => i.id));
    }
    // 乘客不知道推車上賣完了什麼:有機率點到已售完的品項(要告知售完,見 KeyX)
    const out = ITEM_LIST.filter((i) => this.stock[i.id] <= 0);
    if (out.length && R() < 0.35) {
      const it = out[(R() * out.length) | 0];
      const same = order.findIndex((id) => ITEMS[id].kind === it.kind);
      if (same >= 0 && R() < 0.5) order[same] = it.id; else order.push(it.id);
    }
    if (!order.length) {
      const any = ITEM_LIST.filter((i) => this.stock[i.id] > 0);
      if (!any.length) return null;
      order.push(any[(R() * any.length) | 0].id);
    }
    return order;
  }

  _openOrder(seat) {
    const g = this.g;
    const order = this._genOrder();
    const sx = `_${seat.gender}`;
    if (!order) {
      g.voice.talk([{ id: 'att_serve', anchor: this.crew.head }, { id: `pax_sold_out${sx}`, anchor: seat.head }]);
      this.pax.markServed(seat);
      this.stats.missed++;
      this._sat(-4);
      g.ui.toast('全部賣完了!回備餐區補貨吧', 'warn');
      return;
    }
    g.voice.talk([{ id: 'att_serve', anchor: this.crew.head }, ...order.map((id) => ({ id: `order_${id}${sx}`, anchor: seat.head }))]);
    this.dialog = { kind: 'order', seat, order, tray: [], stage: 'pick', lock: 0, msg: '', msgType: '', input: '' };
  }

  /** 拿對餐點後進入心算結帳:切第一人稱看結帳機台。 */
  _enterCheckout(d) {
    for (const id of d.tray) this.stock[id]--;
    this.crew.setStock(this.stock);
    d.total = d.tray.reduce((s, id) => s + ITEMS[id].price, 0);
    d.stage = 'pos';
    d.input = '';
    this.crew.setPos('請輸入應收金額', '$_', 'input');
    this.g.voice.talk('att_checkout', this.crew.head);
  }

  _finishSale(d, charged) {
    const g = this.g;
    const R = this.R;
    // 乘客付款(依實收金額),機台自動計算找零
    const bills = [100, 500, 1000];
    let paid = charged;
    if (R() > 0.25) {
      let bi = bills.findIndex((b) => b >= charged);
      if (bi < 0) bi = 2;
      if (R() < 0.25) bi = Math.min(bi + 1, 2);
      paid = Math.max(charged, bills[bi]);
    }
    const change = paid - charged;
    this.stats.revenue += charged;
    this.crew.setPos(`收 $${paid}  找零`, `$${change}`, 'good');
    g.voice.talk([{ id: change ? 'att_change' : 'att_exact', anchor: this.crew.head }, { id: `pax_thanks_${d.seat.gender}`, anchor: d.seat.head }]);
    g.sfx.cash();
    this.pax.markServed(d.seat);
    this.stats.served++;
    this.stats.sold += d.tray.length;
    d.stage = 'done';
    d.lock = 1.6;
    d.closing = true;
  }

  _updatePos(d, dt) {
    const g = this.g, inp = g.input;
    if (d.waitVoice) { // 多算被抱怨:要聽完才能重新輸入
      d.waitVoice -= dt;
      if (d.waitVoice > 0) return;
      d.waitVoice = 0;
      d.msg = '';
      this.crew.setPos('請重新輸入金額', '$_', 'input');
    }
    const keys = inp.typed();
    for (const k of keys) {
      if (k === 'Backspace') { d.input = d.input.slice(0, -1); this.crew.flashKey('⌫'); }
      else if (d.input.length < 5) { d.input += k; this.crew.flashKey(k); g.sfx.blip(); }
    }
    if (keys.length) this.crew.setPos('請輸入應收金額', `$${d.input || '_'}`, 'input');
    if (!inp.wasPressed('Enter', 'NumpadEnter') || !d.input) return;
    this.crew.flashKey('⏎');
    const v = parseInt(d.input, 10);
    if (v === d.total) {
      d.msg = `金額正確:$${v}`; d.msgType = 'good';
      this._sat(1);
      this._finishSale(d, v);
    } else if (v < d.total) {
      // 少算:照少的金額收,虧損列入考核
      const loss = d.total - v;
      this.stats.underLoss += loss;
      this.stats.underCount++;
      d.msg = `少算了 $${loss}!(虧損已記錄)`; d.msgType = 'bad';
      g.sfx.bad();
      g.ui.bubble({ text: '(偷笑)好喔~', anchor: d.seat.head, label: '乘客' });
      this._finishSale(d, v);
    } else {
      // 多算:乘客當場抱怨,聽完才能重打;事後有機率客訴
      this.stats.overCount++;
      this._sat(-4);
      d.msg = `多算了!應該更少才對,乘客正在抱怨……`; d.msgType = 'bad';
      d.input = '';
      d.waitVoice = 9; // 保險上限
      this.crew.setPos('金額有誤', `$${v}`, 'bad');
      g.sfx.bad();
      g.voice.talk(`pax_overcharge_${d.seat.gender}`, d.seat.head, () => { if (d.waitVoice > 0.3) d.waitVoice = 0.3; });
    }
  }

  // ---------------------------------------------------------------- 預訂便當配送
  _openDeliver(row) {
    const left = BENTOS.filter((b) => this.reserved[b.id] > 0);
    if (!left.length) { this.g.ui.toast('推車上沒有預訂便當了', 'warn'); return; }
    const carNo = row[0].carNo;
    this.dialog = { kind: 'deliver', stage: 'seat', row, carNo, lock: 0, msg: '', msgType: '' };
  }

  _updateDeliver(d) {
    const g = this.g, n = g.input.digit();
    if (!n) return;
    if (d.stage === 'seat') {
      const seat = d.row[n - 1];
      if (!seat) return;
      if (!seat.occupied) { d.msg = '這個座位沒有人'; d.msgType = 'bad'; g.sfx.bad(); return; }
      d.seat = seat;
      d.stage = 'item';
      d.items = BENTOS.filter((b) => this.reserved[b.id] > 0);
      g.sfx.blip();
      return;
    }
    if (d.stage === 'item') {
      const item = d.items[n - 1];
      if (!item) return;
      this.reserved[item.id]--;
      const t = d.seat.preorder;
      if (t && !t.done && t.item === item.id) {
        t.done = true;
        this._sat(2);
        g.sfx.ok();
        g.voice.talk([{ id: 'att_deliver', anchor: this.crew.head }, { id: `pax_preorder_thanks_${d.seat.gender}`, anchor: d.seat.head }]);
        d.msg = `已送達 ${d.carNo}車 ${d.seat.num}號:${item.name}`; d.msgType = 'good';
      } else {
        // 送錯:便當送出去收不回來,扣錢 + 客訴
        this.stats.deductions += item.price;
        this.stats.revenue -= item.price;
        this._sat(-5);
        g.sfx.bad();
        g.voice.talk([{ id: 'att_deliver', anchor: this.crew.head }, { id: `pax_not_mine_${d.seat.gender}`, anchor: d.seat.head }]);
        this._complain(`預訂便當送錯(${d.carNo}車 ${d.seat.num}號)`);
        d.msg = `送錯了!扣 $${item.price}`; d.msgType = 'bad';
      }
      d.stage = 'done';
      d.lock = 1.6;
      d.closing = true;
    }
  }

  // ---------------------------------------------------------------- 狀況處理
  _openIncident(inc) {
    const g = this.g, def = inc.def;
    if (def.type === 'hold') {
      g.voice.talk('att_excuse', this.crew.head);
      this.dialog = { kind: 'hold', inc };
      return;
    }
    let options;
    if (def.dynamic === 'nextStop') {
      const r = this.run;
      const next = this.stops[Math.min(r.leg + 1, this.stops.length - 1)];
      const others = shuffle(Object.entries(STATIONS).filter(([id]) => id !== next.id), this.R).slice(0, 2);
      options = [
        { label: `「下一站是${next.zh}。」`, ok: true, reply: '乘客:「謝謝你!」', voice: 'pax_thanks_f' },
        ...others.map(([, s]) => ({ label: `「下一站是${s.zh}。」`, ok: false, reply: '乘客半信半疑……旁邊的人糾正了你。', voice: 'pax_nextstop_wrong_f' })),
      ];
    } else options = def.options.map((o, i) => ({ ...o, voice: o.say ? `inc_${def.id}_r${i}` : null }));
    g.voice.talk(`inc_${def.id}`, inc.anchor);
    this.dialog = { kind: 'choice', inc, options: shuffle(options, this.R), lock: 0, msg: '', msgType: '', closing: false };
  }

  _updateDialog(dt) {
    const d = this.dialog, g = this.g, inp = g.input;
    if (!d) return;
    if (d.lock > 0) {
      d.lock -= dt;
      if (d.lock <= 0 && d.closing) { this._closeDialog(); return; }
      if (d.lock > 0) return;
      d.msg = '';
    }
    const cancellable = (d.kind === 'order' && d.stage === 'pick') || d.kind === 'hold' || d.kind === 'choice' || (d.kind === 'deliver' && d.stage !== 'done');
    if (inp.wasPressed('Escape') && cancellable) { this._closeDialog(); return; }

    if (d.kind === 'hold') {
      if (inp.isDown('KeyE')) d.inc.progress += dt / d.inc.def.duration;
      if (d.inc.progress >= 1) {
        if (d.inc.def.say) g.voice.talk(`inc_${d.inc.def.id}_done`, d.inc.anchor);
        else g.ui.bubble({ text: d.inc.def.done, anchor: this.crew.head, label: '服勤員' });
        this._resolveIncident(d.inc);
        this._closeDialog();
      }
      return;
    }
    if (d.kind === 'choice') {
      const n = inp.digit();
      if (!n || n > d.options.length) return;
      const opt = d.options[n - 1];
      // 當事人以語音回應(對話框顯示台詞);旁白性質的結果顯示在面板訊息
      if (opt.voice) g.voice.talk(opt.voice, d.inc.anchor);
      else g.ui.bubble({ text: opt.reply, anchor: d.inc.anchor, label: '' });
      if (opt.ok) {
        d.msg = opt.reply; d.msgType = 'good';
        d.lock = 1.0; d.closing = true;
        this._resolveIncident(d.inc);
      } else {
        d.msg = `${opt.reply}(耽擱了幾秒)`; d.msgType = 'bad';
        d.lock = 2.2;
        this._sat(-5);
        g.sfx.bad();
      }
      return;
    }
    if (d.kind === 'deliver') { this._updateDeliver(d); return; }

    // 點餐:拿餐
    if (d.stage === 'pick') {
      const n = inp.digit();
      const it = ITEM_LIST.find((i) => i.key === n);
      if (it) {
        const inTray = d.tray.filter((x) => x === it.id).length;
        if (this.stock[it.id] - inTray > 0) { d.tray.push(it.id); g.sfx.blip(); }
        else { d.msg = `${it.name}沒有庫存了`; d.msgType = 'bad'; g.sfx.bad(); }
      }
      if (inp.wasPressed('Backspace')) d.tray.pop();
      if (inp.wasPressed('KeyX')) { this._tellSoldOut(d); return; }
      if (inp.wasPressed('Enter', 'NumpadEnter', 'KeyE') && d.tray.length) {
        if ([...d.tray].sort().join() !== [...d.order].sort().join()) {
          g.voice.talk(`pax_wrong_item_${d.seat.gender}`, d.seat.head);
          d.msg = '乘客:「不對喔,這不是我點的。」'; d.msgType = 'bad';
          d.tray = [];
          d.lock = 1.0;
          this.stats.wrongOrder++;
          this._sat(-3);
          g.sfx.bad();
          return;
        }
        this._enterCheckout(d);
      }
      return;
    }
    if (d.stage === 'pos') this._updatePos(d, dt);
  }

  /** 告知乘客點的東西賣完了:乘客可能改買其他品項,或乾脆不買。 */
  _tellSoldOut(d) {
    const g = this.g, sx = d.seat.gender;
    const out = d.order.filter((id) => this.stock[id] <= 0);
    if (!out.length) {
      // 明明有貨卻說賣完
      g.voice.talk([{ id: 'att_soldout', anchor: this.crew.head }, { id: `pax_not_soldout_${sx}`, anchor: d.seat.head }]);
      d.msg = '乘客:「明明還有啊?」(說謊扣滿意度)'; d.msgType = 'bad';
      d.lock = 1.2;
      this._sat(-3);
      g.sfx.bad();
      return;
    }
    const rest = d.order.filter((id) => this.stock[id] > 0);
    if (rest.length && this.R() < 0.65) {
      g.voice.talk([{ id: 'att_soldout', anchor: this.crew.head }, { id: `pax_soldout_ok_${sx}`, anchor: d.seat.head }]);
      d.order = rest;
      d.tray = d.tray.filter((id) => rest.includes(id));
      d.msg = `乘客改買:${rest.map((id) => ITEMS[id].name).join('、')}`; d.msgType = 'good';
      d.lock = 0.8;
      return;
    }
    g.voice.talk([{ id: 'att_soldout', anchor: this.crew.head }, { id: `pax_soldout_leave_${sx}`, anchor: d.seat.head }]);
    this.pax.markServed(d.seat);
    this.stats.missed++;
    this._sat(-1);
    d.msg = '乘客:「那算了。」'; d.msgType = 'bad';
    d.tray = [];
    d.stage = 'done';
    d.lock = 1.4;
    d.closing = true;
  }

  // ---------------------------------------------------------------- 推銷(對沒有需求的乘客)
  /** 推車旁可推銷的乘客:有人坐、沒在等、本趟還沒被推銷/服務過、不是預訂客。 */
  _pitchTarget() {
    const cx = this._cartX();
    let best = null, bd = SERVE_RANGE;
    for (const s of this.pax.seats) {
      if (!s.occupied || s.wants || s.served || s.pitched || s.preorder) continue;
      const d = Math.abs(s.x - cx);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  _pitch(seat) {
    const g = this.g, sx = seat.gender, R = this.R();
    seat.pitched = true;
    this.stats.pitched++;
    const att = { id: 'att_pitch', anchor: this.crew.head };
    if (R < 0.32) {
      // 有興趣 → 進入點餐流程
      this.pendingPitch = { seat, t: 6 };
      g.voice.talk([att, { id: `pax_pitch_buy_${sx}`, anchor: seat.head }], null, () => { if (this.pendingPitch?.seat === seat) this.pendingPitch.t = 0; });
    } else if (R < 0.78) {
      g.voice.talk([att, { id: `pax_pitch_no_${sx}`, anchor: seat.head }]);
      this.pax.markServed(seat);
    } else {
      g.voice.talk([att, { id: `pax_pitch_annoyed_${sx}`, anchor: seat.head }]);
      this.pax.markServed(seat);
      this._sat(-3);
      this._complain('推銷打擾安寧');
    }
  }

  // ---------------------------------------------------------------- 補貨
  /** 在備餐區(第一節車廂後端玄關)隨時可補滿;中途停站時在任一玄關可向月台補一半。 */
  _restockSpot() {
    if (ITEM_LIST.every((i) => this.stock[i.id] >= this.cfg.stock[i.id])) return null;
    const [lo] = this._extent();
    if (lo <= -this.type.interior.partitionX - 0.2 + 1.2 && this.train.local(this.p.mid).k === 0) return 'home';
    if (this.run.mode === 'dwell' && this.stopEvt && !this.stopEvt.restocked && this.train.inVestibule(this.p.mid)) return 'station';
    return null;
  }

  _restock(spot) {
    const g = this.g, max = this.cfg.stock;
    const full = ITEM_LIST.every((i) => this.stock[i.id] >= max[i.id]);
    if (full) { g.ui.toast('推車已經是滿的', 'warn'); return; }
    if (spot === 'home') {
      this.stock = { ...max };
      g.voice.talk('att_restock', this.crew.head);
      g.ui.toast('在備餐區補滿貨了', 'good');
    } else {
      for (const i of ITEM_LIST) this.stock[i.id] = Math.min(max[i.id], this.stock[i.id] + Math.ceil(max[i.id] / 2));
      this.stopEvt.restocked = true;
      g.voice.talk('att_station_restock', this.crew.head);
      g.ui.toast('月台便當業者幫忙補貨了(每品項 +一半)', 'good');
    }
    this.stats.restocks++;
    this.crew.setStock(this.stock);
    g.sfx.ok();
  }

  _closeDialog() {
    if (this.dialog?.kind === 'order') this.crew.setPos('臺鐵便當', 'READY');
    this.dialog = null;
  }

  // ---------------------------------------------------------------- 主更新
  update(dt) {
    const g = this.g, inp = g.input;
    this.time += dt;
    this._updateTrain(dt);
    if (this.run.endTimer !== null && this.run.endTimer <= 0) return this._result();
    if (this.kick) {
      this._updateKick(dt);
      this.scenery.update(this.run.s, this._platformX(), this.kick.center);
      g.ui.updateBubbles(g.camera);
      return null;
    }

    const wasDialog = !!this.dialog;
    this._updateDialog(dt);
    this._updatePlayer(dt);
    this._updateEvents(dt);
    this._updateTrips();
    this.crew.updatePos(dt);

    // 想買東西的乘客
    this.buyerTimer -= dt;
    const b = this.cfg.buyers;
    if (this.buyerTimer <= 0) {
      this.buyerTimer = b.interval[0] + this.R() * (b.interval[1] - b.interval[0]);
      if (this.pax.wanting.length < b.max) this.pax.spawnBuyer(b.patience, this.p.mid);
    }
    if (this.dialog?.seat) this.dialog.seat.patience = Math.max(this.dialog.seat.patience, 3);
    for (const s of this.pax.update(dt, this.time)) {
      this.stats.missed++;
      this._sat(-2);
      g.voice.talk(`pax_gave_up_${s.gender}`, s.head);
    }

    // 互動提示
    let prompt = null;
    if (!this.dialog && !this.p.turning && !wasDialog) {
      const t = this._target();
      const row = this.tickets.some((x) => !x.done) ? this._nearRow() : null;
      const fHint = row ? ' · <b>F</b> 送預訂便當' : '';
      if (t?.kind === 'incident') {
        prompt = `<b>E</b> 處理:${t.inc.def.title}`;
        if (inp.wasPressed('KeyE')) this._openIncident(t.inc);
      } else if (t?.kind === 'order') {
        prompt = `<b>E</b> 服務這位乘客${fHint}`;
        if (inp.wasPressed('KeyE')) this._openOrder(t.seat);
      } else if (this.train.inVestibule(this.p.mid)) {
        prompt = '<b>Space</b> 迴轉推車';
      } else if (row) prompt = `<b>F</b> 送預訂便當(第 ${row[0].row + 1} 排)`;
      if (row && inp.wasPressed('KeyF') && !this.dialog) this._openDeliver(row);
      // 補貨(備餐區 / 停站時的玄關)
      const spot = this._restockSpot();
      if (spot) {
        prompt = `${prompt ? `${prompt} · ` : ''}<b>R</b> ${spot === 'home' ? '備餐區補貨' : '月台補貨'}`;
        if (inp.wasPressed('KeyR') && !this.dialog) this._restock(spot);
      }
      // 推銷
      const pt = !t && !this.p.vel ? this._pitchTarget() : null;
      if (pt) {
        prompt = `${prompt ? `${prompt} · ` : ''}<b>Q</b> 向這位乘客推銷`;
        if (inp.wasPressed('KeyQ') && !this.dialog) this._pitch(pt);
      }
    }

    // 推銷成功:乘客說完「好啊」後開始點餐(推車還在旁邊才算)
    if (this.pendingPitch) {
      const pp = this.pendingPitch;
      pp.t -= dt;
      if (pp.t <= 0) {
        this.pendingPitch = null;
        if (!this.dialog && Math.abs(pp.seat.x - this._cartX()) < SERVE_RANGE * 1.6) { this.stats.pitchSold++; this._openOrder(pp.seat); }
        else this.pax.markServed(pp.seat);
      }
    }

    // 叫賣
    this.calloutTimer -= dt;
    if (this.calloutTimer <= 0 && !this.dialog && Math.abs(this.p.vel) > 0.5) {
      this.calloutTimer = 25 + this.R() * 15;
      g.voice.talk(this.R() < 0.5 ? 'att_callout1' : 'att_callout2', this.crew.head);
    }

    for (const inc of this.incidents) if (inc.active) inc.mark.position.y = inc.baseY + Math.sin(this.time * 4) * 0.04;

    // 視覺更新
    const moving = Math.abs(this.p.vel) > 0.05;
    this.crew.place(this.p.mid, this.p.angle, this.time, moving);
    this.train.updateDoors(...this._extent(), dt);
    this.scenery.update(this.run.s, this._platformX(), this.p.mid);
    this._updateCamera(dt);
    g.sfx.setRumble(this.run.v / this.type.maxSpeed);

    this._hud(dt, prompt);
    return null;
  }

  /** 定時事件:窗簾拉下時乘客抱怨;停站時推車卡在走道被抱怨擋道。 */
  _updateEvents(dt) {
    const g = this.g;
    if (g.settings.curtains) {
      this.curtainTimer -= dt;
      if (this.curtainTimer <= 0) {
        this.curtainTimer = 35 + this.R() * 30;
        const seat = this.R() < 0.55 ? this._nearbySeat(9) : null;
        if (seat) {
          g.voice.talk(`pax_curtain_${seat.gender}`, seat.head);
          this._sat(-2);
          this._complain('拉下窗簾看不到風景');
        }
      }
    }
    const ev = this.stopEvt;
    if (ev && !ev.blockChecked && this.run.mode === 'dwell') {
      ev.blockT -= dt;
      if (ev.blockT <= 0) {
        ev.blockChecked = true;
        if (!this.train.inVestibule(this.p.mid) && !this.p.turning && this.R() < 0.55) {
          const seat = this._nearbySeat(4);
          if (seat) {
            g.voice.talk(`pax_blocking_${seat.gender}`, seat.head);
            this._sat(-3);
            this._complain('停靠站時推車擋住走道');
          }
        }
      }
    }
  }

  /** 畫面點擊(非拖曳):結帳時點 3D 收銀機按鍵。 */
  onTap(clientX, clientY) {
    const d = this.dialog;
    if (!(d?.kind === 'order' && d.stage === 'pos')) return false;
    const ray = this._ray || (this._ray = new THREE.Raycaster());
    ray.setFromCamera(new THREE.Vector2(clientX / innerWidth * 2 - 1, -(clientY / innerHeight) * 2 + 1), this.g.camera);
    const hit = ray.intersectObject(this.crew.posKeysMesh, false)[0];
    if (!hit?.uv) return false;
    const col = Math.min(5, Math.floor(hit.uv.x * 6)), row = Math.min(1, Math.floor((1 - hit.uv.y) * 2));
    const k = POS_KEYS[row * 6 + col];
    this.g.input.press(k === '⌫' ? 'Backspace' : k === '⏎' ? 'Enter' : `Digit${k}`);
    return true;
  }

  _platformX() {
    const r = this.run;
    const center = (this.train.n - 1) * this.train.pitch / 2;
    const prev = this.S[r.leg] - r.s, next = this.S[Math.min(r.leg + 1, this.S.length - 1)] - r.s;
    const useNext = Math.abs(next) < Math.abs(prev);
    const idx = useNext ? r.leg + 1 : r.leg;
    this.scenery.setStationSign(this.stops[idx], this.stops[idx - 1], this.stops[idx + 1]);
    return (useNext ? next : prev) + center;
  }

  // ---------------------------------------------------------------- 相機
  _setFov(target, dt) {
    const cam = this.g.camera;
    const f = THREE.MathUtils.lerp(cam.fov, target, 1 - Math.exp(-dt * 6));
    if (Math.abs(f - cam.fov) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); }
  }

  _placeCamera(dt, snap = false) {
    const P = this.p, c = this.cam, cam = this.g.camera;
    const dir = new THREE.Vector3(Math.cos(P.angle), 0, -Math.sin(P.angle));
    const look = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw);
    const right = new THREE.Vector3(-look.z, 0, look.x);
    const att = new THREE.Vector3(P.mid, 0, 0).addScaledVector(dir, -CREW.half);
    const checkout = this.dialog?.kind === 'order' && (this.dialog.stage === 'pos' || this.dialog.stage === 'done');
    let pos, target, fov = FOV.normal;
    if (checkout) {
      // 結帳:第一人稱低頭看結帳機台
      pos = att.clone().add(new THREE.Vector3(0, 1.58, 0)).addScaledVector(dir, 0.1);
      target = this.crew.posWorld().add(new THREE.Vector3(0, -0.02, 0)); // 機台置中;結帳面板改停靠在畫面上方
      // 直式螢幕(手機)水平視角窄:拉近鏡頭,讓收銀機約佔畫面寬度 85%,按鍵夠大好點
      const aspect = innerWidth / innerHeight;
      fov = FOV.pos * (aspect < 0.9 ? THREE.MathUtils.clamp(aspect * 1.25, 0.55, 1) : 1);
    } else if (c.mode === 'first') {
      pos = att.clone().add(new THREE.Vector3(0, 1.62, 0)).addScaledVector(dir, 0.12);
      target = pos.clone().addScaledVector(look, 3).add(new THREE.Vector3(0, -0.35 + c.pitch, 0));
    } else {
      // 越肩視角;車廂端部空間不足時把相機往前、往上收(相機不可超出車端牆,否則會被牆擋住整個畫面)
      const wallGap = look.x > 0 ? att.x - (this.train.minX + 0.1) : (this.train.maxX - 0.1) - att.x;
      const back = THREE.MathUtils.clamp(wallGap, 0.05, 2.1);
      const tight = THREE.MathUtils.clamp(1 - back / 1.2, 0, 1);
      pos = att.clone().addScaledVector(look, -back).addScaledVector(right, 0.32 + tight * 0.1)
        .add(new THREE.Vector3(0, 2.0 + tight * 0.15 - c.pitch * 0.6, 0));
      target = att.clone().addScaledVector(look, 2.8).add(new THREE.Vector3(0, 1.05 + c.pitch, 0));
    }
    pos.z = THREE.MathUtils.clamp(pos.z, -1.15, 1.15);
    pos.y = Math.min(pos.y, 2.15);
    pos.x = THREE.MathUtils.clamp(pos.x, this.train.minX + 0.1, this.train.maxX - 0.1);
    const k = snap ? 1 : 1 - Math.exp(-dt * (checkout ? 5 : 8));
    cam.position.lerp(pos, k);
    c.look.lerp(target, snap ? 1 : 1 - Math.exp(-dt * 10));
    const vr = this.run.v / this.type.maxSpeed;
    if (!checkout) cam.position.y += Math.sin(this.time * 1.9) * 0.004 * vr;
    cam.lookAt(c.look);
    cam.rotateZ(Math.sin(this.time * 0.83) * 0.004 * vr);
    this.crew.attendant.visible = !(c.mode === 'first' || checkout);
    if (snap) { cam.fov = fov; cam.updateProjectionMatrix(); } else this._setFov(fov, dt);
  }

  _updateCamera(dt) {
    const m = this.g.mouse, c = this.cam;
    if (this.g.input.wasPressed('KeyV')) c.mode = c.mode === 'first' ? 'third' : 'first';
    if (m.dragging) {
      c.yaw = THREE.MathUtils.clamp(c.yaw - m.dx * 0.005, -2.6, 2.6);
      c.pitch = THREE.MathUtils.clamp(c.pitch - m.dy * 0.004, -0.6, 0.8);
    } else {
      c.yaw *= Math.exp(-dt * 1.2);
      c.pitch *= Math.exp(-dt * 1.2);
    }
    m.dx = m.dy = 0;
    this._placeCamera(dt);
  }

  // ---------------------------------------------------------------- HUD
  _hud(dt, prompt) {
    const ui = this.g.ui, r = this.run;
    const eta = this._eta();
    const dwelling = r.mode === 'dwell' || r.endTimer !== null;
    const cur = this.stops[r.leg];
    const nextSt = this.stops[Math.min(r.leg + 1, this.stops.length - 1)];
    const total = this.S.at(-1);
    const { k } = this.train.local(this.p.mid);
    this.train.updateDisplay(
      `${this.cfg.trainNo} 往 ${this.stops.at(-1).zh}   ${dwelling ? `${cur.zh} 到了 ${cur.en}` : `下一站 ${nextSt.zh} Next: ${nextSt.en}`}`, dt);

    ui.setMarqueeIdle(`${this.cfg.trainNo} 新自強號 往 ${this.stops.at(-1).zh} ─ ${dwelling ? `${cur.zh}站 停車中` : `下一站 ${nextSt.zh} ${nextSt.en}`} ─ 本車廂提供便當、飲料販售服務`);
    ui.updateHud({
      trainNo: this.cfg.trainNo,
      dest: this.stops.at(-1).zh,
      next: dwelling ? `${cur.zh}(停車中)` : nextSt.zh,
      etaNext: dwelling && r.endTimer === null ? `發車 ${fmtTime(r.dwell)}` : fmtTime(eta.next),
      etaFinal: fmtTime(eta.final),
      urgent: eta.final < 45 && this.trips.done < this.trips.required,
      speed: Math.round(r.v * 3.6),
      routeProgress: r.s / total,
      stops: this.stops.map((s, i) => ({ name: s.zh, at: this.S[i] / total, passed: i <= r.leg })),
      trips: this.trips,
      revenue: this.stats.revenue,
      sat: this.stats.sat,
      stock: ITEM_LIST.map((i) => ({ name: i.short, n: this.stock[i.id], max: this.cfg.stock[i.id] })),
      tickets: this.tickets.map((t) => ({ car: t.seat.carNo, num: t.seat.num, item: ITEMS[t.item].short, done: t.done })),
      car: this.train.carNumbers[k],
    });
    ui.updateMinimap({
      cars: this.train.carNumbers,
      span: [this.train.minX, this.train.maxX],
      pitch: this.train.pitch,
      half: this.train.half,
      player: this.p.mid,
      facing: this.p.facing,
      buyers: this.pax.wanting.map((s) => ({ x: s.x, urgent: s.patience / s.maxPatience < 0.3 })),
      incidents: this.incidents.filter((i) => i.active).map((i) => i.x),
      tickets: this.tickets.filter((t) => !t.done).map((t) => t.seat.x),
      outbound: this.trips.outbound,
    });
    ui.setPrompt(prompt);
    ui.renderDialog(this._dialogView());
    ui.updateBubbles(this.g.camera);
  }

  _dialogView() {
    const d = this.dialog;
    if (!d) return null;
    const keys = (opts) => opts.map((o, i) => ({ key: i + 1, label: o }));
    if (d.kind === 'hold') {
      return { title: d.inc.def.title, text: d.inc.def.text, hint: d.inc.def.hint, progress: d.inc.progress, footer: 'Esc 先離開',
        actions: [{ key: 'KeyE', label: '按住處理', hold: true, primary: true }, { key: 'Escape', label: '先離開' }] };
    }
    if (d.kind === 'choice') {
      return { title: d.inc.def.title, text: d.inc.def.text, options: keys(d.options.map((o) => o.label)), msg: d.msg, msgType: d.msgType, locked: d.lock > 0, footer: '點選或按數字鍵選擇處理方式 · Esc 先離開',
        actions: [{ key: 'Escape', label: '先離開' }] };
    }
    if (d.kind === 'deliver') {
      if (d.stage === 'seat') {
        return {
          title: `送預訂便當 — 第 ${d.carNo} 車 第 ${d.row[0].row + 1} 排`,
          text: '要送給哪個座位?(座號標在行李架上)',
          options: keys(d.row.map((s) => `${s.num} 號${s.window ? '(靠窗)' : '(走道)'}${s.occupied ? '' : ' — 空位'}`)),
          msg: d.msg, msgType: d.msgType, footer: '點選或按數字鍵選擇 · Esc 取消', actions: [{ key: 'Escape', label: '取消' }],
        };
      }
      if (d.stage === 'item') {
        return {
          title: `送到 ${d.carNo} 車 ${d.seat.num} 號`, text: '要送哪一個預訂便當?',
          options: keys(d.items.map((b) => `${b.name}(預訂剩 ${this.reserved[b.id]})`)), footer: '點選或按數字鍵選擇 · Esc 取消', actions: [{ key: 'Escape', label: '取消' }],
        };
      }
      return { title: '送預訂便當', text: '', msg: d.msg, msgType: d.msgType, footer: '' };
    }
    const orderText = d.order.map((id) => (this.stock[id] <= 0 ? `<s>${ITEMS[id].name}</s>` : ITEMS[id].name)).join('、');
    if (d.stage === 'pick') {
      return {
        title: '乘客點餐',
        text: `乘客要:<b>${orderText}</b>`,
        menu: ITEM_LIST.map((i) => ({ key: i.key, label: i.name, price: i.price, stock: this.stock[i.id] - d.tray.filter((x) => x === i.id).length })),
        tray: d.tray.map((id) => ITEMS[id].name),
        msg: d.msg, msgType: d.msgType, locked: d.lock > 0,
        footer: '點品項或按 1~6 拿取 · ⌫ 放回 · Enter 交給乘客 · X 告知售完 · Esc 取消',
        actions: [{ key: 'Enter', label: '交給乘客', primary: true }, { key: 'Backspace', label: '⌫ 放回' }, { key: 'KeyX', label: '告知售完' }, { key: 'Escape', label: '取消' }],
      };
    }
    return {
      title: '心算結帳',
      text: `${d.tray.map((id) => `${ITEMS[id].name} $${ITEMS[id].price}`).join(' + ')}<br>請心算<b>總金額</b>,在結帳機台輸入。`,
      msg: d.msg, msgType: d.msgType, locked: !!d.waitVoice, dock: 'top',
      footer: d.waitVoice ? '乘客抱怨中……聽完才能重新輸入(列車仍在行駛!)' : '點收銀機按鍵或用數字鍵輸入金額 · ⌫ 修改 · Enter 確認',
      actions: [{ key: 'Backspace', label: '⌫' }, { key: 'Enter', label: '確認金額', primary: true }],
    };
  }

  // ---------------------------------------------------------------- 結算
  _result() {
    const s = this.stats;
    const success = this.trips.done >= this.trips.required;
    // 多算:事後有機率被客訴
    for (let i = 0; i < s.overCount; i++) {
      if (this.R() < OVERCHARGE_COMPLAINT_CHANCE) this.complaints.push('結帳金額多算');
    }
    // 沒送到的預訂便當:扣錢 + 客訴
    for (const t of this.tickets.filter((x) => !x.done)) {
      const price = ITEMS[t.item].price;
      s.deductions += price;
      s.revenue -= price;
      this.complaints.push(`預訂便當未送達(${t.seat.carNo}車 ${t.seat.num}號)`);
    }
    return {
      success,
      kicked: !success,
      // 對應 careerLadder.js 列車餐服員的升降規則
      careerDelta: {
        lossAmount: s.underLoss,
        lossCount: s.underCount,
        complaints: this.complaints.length,
        failures: success ? 0 : 1,
        successes: success ? 1 : 0,
        revenue: Math.max(0, s.revenue),
        perfect: success && !this.complaints.length && s.sat >= 90 ? 1 : 0,
      },
      reason: success ? null : `列車已抵達${this.stops.at(-1).zh},只完成 ${this.trips.done}/${this.trips.required} 趟服務,被列車長請下車。`,
      trips: this.trips,
      delivered: this.tickets.filter((t) => t.done).length,
      ticketsTotal: this.tickets.length,
      complaints: this.complaints,
      ...s,
    };
  }
}
