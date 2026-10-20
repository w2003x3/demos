// 「台鐵便當廚房」— 被調職後的玩法:在出車前做出指定數量的便當。
//
// 流程:組裝台看製作單(隨機:排骨/雞腿/素食,做完一個才來下一個)→ 放便當盒 → 盛飯 → 夾主菜與配菜 → 蓋上蓋子
//       → 拿去對應主菜的成品架。裝錯(內容或架子)要賠錢並記點。
// 補料:飯沒了去炊飯機煮、排骨/滷蛋/豆干去滷鍋滷、雞腿去油炸機炸、素排去煎台煎、
//       高麗菜/酸菜先在砧板切再到炒鍋炒、黃蘿蔔切好即可、玉米下鍋炒、便當盒/蓋子去倉庫搬。
//       烹煮期間可以去做別的事,但完成後太久沒起鍋會燒焦(要倒進廚餘桶)。
// 操作:WASD/方向鍵移動(或點地板/右側工作站清單自動走過去)、E 互動、數字鍵選擇;手機有方向鍵與 E 按鈕。
import * as THREE from 'three';
import { TRAIN_TYPES } from '../config/trains.js';
import { buildLevel, STATIONS_K } from '../config/kitchen.js';
import { KitchenScene, STATION_POS, rackZ, ROOM, STORE, OBSTACLES } from '../world/kitchenScene.js';
import { makeBentoTray, makeBentoLid, makeBento } from '../world/food.js';
import { makeFoodPart, makeLevelBento, bulkFood, renderBentoThumbs } from '../world/foodGen.js';
import { workerFigure } from '../core/assets.js';
import { KitchenSfx } from '../core/kitchenSfx.js';
import { rng } from '../core/textures.js';
import { HELPERS, HELPER_LINES } from '../config/helpers.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const R_CHEF = 0.28, SPEED = 2.7, REACH = 1.05;
const STEP_LEN = 0.7;          // 搬便當時每走一步的距離(m)
const HELPER_AT = -1.55;       // 同事在組裝島台的位置(x)
const STOLEN_COST = { main: 30, rice: 10, side: 8 };   // 被偷吃一份的成本(元)
/** 搬 k 個便當時每一步掉落的機率 */
export const dropChance = (k) => (k <= 2 ? 0 : Math.min(0.45, (k - 2) * 0.02 + (k - 2) ** 2 * 0.002));
const COOK_STATIONS = ['rice', 'braise', 'wok', 'fryer', 'griddle'];
const fmt = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

export class KitchenPhase {
  constructor(game, cfg) {
    this.g = game;
    const L = (this.L = buildLevel(cfg.level || 'k1'));
    this.cfg = { quota: L.quota, timeLimit: L.timeLimit, fine: 1, ...cfg };
    this.F = L.foods; this.I = L.ingredients; this.RC = L.recipes; this.CA = L.carries; this.H = L.hints; this.B = L.bentos;
    this.ownHud = true;
    // 工作站位置(成品架依便當款數)
    this.pos = { ...STATION_POS };
    const zs = rackZ(Object.keys(this.B).length);
    Object.keys(this.B).forEach((id, i) => { this.pos[`rack_${id}`] = { x: 5.85, z: zs[i] }; });
  }

  /** 整備畫面標題(依關卡) */
  prepTitle() {
    return { title: `${this.L.title}・廚房備料中`, sub: `${this.L.branch}今天要做的便當`, go: '進入廚房' };
  }

  /** 整備畫面:本關便當(名稱、內容) */
  prepItems() {
    return Object.values(this.B).map((b) => ({ id: b.id, name: b.name, price: b.price, desc: `${this.L.branch}${b.vegan ? '・全素' : ''}`, dishes: b.parts.map((k) => this.F[k].name) }));
  }

  _sname(k) {
    if (k.startsWith('rack_')) return `${this.B[k.slice(5)].name}架`;
    return STATIONS_K[k];
  }

  /** 整備畫面的便當縮圖 */
  async prepThumbs() {
    this.thumbs ??= await renderBentoThumbs(this.L);
    return this.thumbs;
  }

  async init() {
    const g = this.g;
    await this.prepThumbs();
    const assets = (this.assets = await g.loadAssets(TRAIN_TYPES.EMU3000));
    this.R = rng((Math.random() * 1e9) | 0);
    this.root = new THREE.Group();
    g.scene.add(this.root);
    this.k = new KitchenScene(g.quality, this.L);
    this.root.add(this.k.group);
    this._env = { background: g.scene.background, intensity: g.scene.environmentIntensity, fog: g.scene.fog };
    g.scene.background = new THREE.Color('#141210');
    g.scene.environmentIntensity = 0.9;
    g.scene.fog = null;

    // 廚師(玩家):白色廚師服 + 廚師帽,雙臂在身前(在工作檯操作、端東西)
    const chef = workerFigure(assets.rail, ['male-business-02', 'male-adult-09', 'female-business-04', 'male-adult-10'], '#f3f2ee', true)   // 深色衣服才染得出白色廚師服
      || assets.attendant.clone(true);
    const hat = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.08, 20), white);
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), white);
    puff.scale.y = 0.75; puff.position.y = 0.09;
    hat.add(band, puff);
    hat.position.set(0.0, 1.71, 0);
    chef.add(hat);
    this.carryAnchor = new THREE.Group();
    this.carryAnchor.position.set(0.42, 0.98, 0);
    chef.add(this.carryAnchor);
    this.chef = chef;
    this.root.add(chef);
    this.head = new THREE.Object3D();
    this.head.position.set(0, 1.9, 0);
    chef.add(this.head);
    // 廚房主任(站在出餐窗口旁盯場)
    const boss = assets.crew?.conductor.clone(true) || assets.attendant.clone(true);
    boss.position.set(5.8, 0, 3.5);
    boss.rotation.y = -2.4;   // 面向西南(看著組裝台)
    this.root.add(boss);
    this.bossHead = new THREE.Object3D();
    this.bossHead.position.set(5.8, 1.95, 3.5);
    this.root.add(this.bossHead);

    this.ksfx = new KitchenSfx(g.sfx);
    this.stock = Object.fromEntries(Object.entries(this.I).map(([k, v]) => [k, v.start]));
    this.st = Object.fromEntries([...COOK_STATIONS, 'board', 'storage'].map((k) => [k, { state: 'idle', recipe: null, t: 0, cook: 0, over: 0 }]));
    this.p = { x: 0, z: 2.6, angle: Math.PI / 2, vel: 0, path: null };
    this.carry = null;
    this.work = null;
    this.panel = null;
    this.asm = null;
    this.time = 0;
    this.left = this.cfg.timeLimit;
    this.stats = { made: 0, mistakes: 0, fines: 0, wrongContent: 0, wrongRack: 0, burnt: 0, log: [], dropped: 0, dropValue: 0, stolen: [], stolenValue: 0, asmDone: 0, helperMade: 0 };
    this.stack = [];               // 桌邊做好的便當(等玩家一次搬到成品架)
    this.stackGroup = new THREE.Group();
    this.root.add(this.stackGroup);
    this.dropGroup = new THREE.Group();
    this.root.add(this.dropGroup);
    this.helper = null;
    this.modal = null;
    this.extraObs = [];
    this._stepAcc = 0;
    this.ordersDone = 0;
    this.nagT = {};
    this.endTimer = null;
    this._buildHud();
    this._nav();
    this._newOrder();
    this._syncScene();
    // 視角:third 第三人稱(預設,由後上方俯看)/ first 第一人稱(暫停選單或 V 鍵切換)
    this.cam = { mode: 'third', pos: new THREE.Vector3(0, 6, 8), look: new THREE.Vector3(0, 0.8, 2), fov: 50 };
    this._placeCamera(1, true);
    // 點地板自動走過去
    this._onPointer = (e) => {
      if (this.g.state !== 'play' || e.target !== this.g.renderer.domElement) return;
      const r = this.g.renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.g.camera);
      const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      if (!hit) return;
      // 點到工作站附近 → 走到該工作站
      const near = Object.entries(this.pos).map(([k, p]) => [k, Math.hypot(p.x - hit.x, p.z - hit.z)]).sort((a, b) => a[1] - b[1])[0];
      if (near[1] < 1.4) this._goTo(near[0]);
      else this._walkTo(hit.x, hit.z);
    };
    g.renderer.domElement.addEventListener('pointerdown', this._onPointer);
  }

  begin() {
    this.g.ui.showHud(false);
    this.el.classList.remove('pre');
    this._startTour();
  }

  /** 開工(導覽結束後) */
  _go() {
    this.g.voice.talk('kboss_start', this.bossHead);
    this._toast(`${this.L.title}:要在 ${fmt(this.cfg.timeLimit)} 內做出 ${this.cfg.quota} 個便當`);
  }

  // ================================================================ 作業環境導覽
  _tourSteps() {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const names = (keys) => keys.map((k) => this.F[k].name).join('、');
    const foods = Object.values(this.F);
    const rice = foods.filter((f) => f.shape === 'rice').map((f) => f.key);
    const pans = foods.filter((f) => f.shape !== 'rice').map((f) => f.key);
    const at = (st) => {
      const list = Object.values(this.RC).filter((r) => r.station === st && r.food);
      return list.length ? list.map((r) => r.label).join('、') : '本關用不到';
    };
    const racks = Object.values(this.B).map((b) => `${b.name}架`).join('、');
    return [
      { t: '組裝台(廚房中央)', mark: V(0, 1.15, 0.6), pos: V(0, 3.1, 4.0), look: V(0, 0.9, 0.6),
        d: `你主要待的地方。上方吊著<b>製作單</b>;檯面北側的<b>保溫餐檯</b>放 ${esc(names(pans))};西端<b>保溫飯鍋</b>是 ${esc(names(rice))};東端堆著<b>便當盒</b>和<b>蓋子</b>。做好的便當會疊在桌邊,按 <kbd>F</kbd> 一次拿起。` },
      { t: '炊飯機', mark: V(-6.3, 1.9, -4.9), pos: V(-6.3, 2.7, -1.4), look: V(-6.3, 1.0, -5.0), d: `煮飯:${esc(at('rice'))}。洗米下鍋後可以先去忙別的,煮好再回來起鍋。` },
      { t: '滷鍋', mark: V(-3.9, 1.5, -5.0), pos: V(-3.9, 2.7, -1.4), look: V(-3.9, 0.9, -5.0), d: `${esc(at('braise'))}。滷好太久沒起鍋會滷過頭(燒焦)。` },
      { t: '炒鍋爐', mark: V(-1.3, 1.5, -5.0), pos: V(-1.3, 2.7, -1.4), look: V(-1.3, 0.9, -5.0), d: `${esc(at('wok'))}。有些菜要先在砧板切好才能下鍋。` },
      { t: '油炸機', mark: V(1.4, 1.5, -5.0), pos: V(1.4, 2.7, -1.4), look: V(1.4, 0.9, -5.0), d: `${esc(at('fryer'))}。炸好要盡快起鍋,不然會炸焦。` },
      { t: '煎台', mark: V(3.9, 1.5, -5.0), pos: V(3.9, 2.7, -1.4), look: V(3.9, 0.9, -5.0), d: `${esc(at('griddle'))}。` },
      { t: '備料區(水槽與砧板)', mark: V(-7.55, 1.4, -0.7), pos: V(-4.6, 2.8, 0.9), look: V(-7.5, 0.9, -1.0), d: `${esc(at('board'))}。切菜時要站著不動,走開會中斷。` },
      { t: '倉庫(西側門後)', mark: V(-11.6, 2.4, 1.5), pos: V(-8.2, 3.4, 4.2), look: V(-11.2, 1.0, 1.3), d: `層架上是<b>便當盒</b>與<b>蓋子</b>的紙箱,沒了來這裡一次搬一箱(20 個)${Object.values(this.RC).some((r) => r.station === 'storage' && r.food) ? `;也可以拿 ${esc(at('storage'))}` : ''}。` },
      { t: '成品架(東側)', mark: V(7.15, 2.2, Object.values(this.k.racks)[0].z), pos: V(4.0, 3.0, 3.2), look: V(7.0, 1.0, 0), d: `${esc(racks)}。手上的便當走到架前按 <kbd>E</kbd>,會放下同款的。一次拿越多越容易摔掉。` },
      { t: '廚餘桶・主任・出車倒數', mark: V(4.97, 1.1, 3.65), pos: V(2.6, 2.8, 6.2), look: V(5.4, 1.0, 2.6), d: '燒焦的食物倒進<b>廚餘桶</b>。廚房主任站在出餐窗口旁盯場,北牆的<b>出車倒數鐘</b>歸零前要做完。準備好就開工吧!' },
    ];
  }

  _startTour() {
    this.tour = { i: 0, steps: this._tourSteps() };
    this.modal = 'tour';
    this.dialog = 'tour';    // 讓 Esc 用來略過導覽,而不是開暫停選單
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 18), new THREE.MeshStandardMaterial({ color: '#f08a24', emissive: '#f08a24', emissiveIntensity: 0.8 }));
    m.rotation.x = Math.PI;
    this.tourMark = m;
    this.root.add(m);
    this.el.classList.add('touring');
    this._renderTour();
  }

  _tourStep(d) {
    const t = this.tour;
    if (!t) return;
    t.i += d;
    if (t.i < 0) t.i = 0;
    if (t.i >= t.steps.length) return this._endTour();
    this._renderTour();
  }

  _endTour() {
    this.tour = null;
    this.modal = null;
    this.dialog = null;
    this.root.remove(this.tourMark);
    this.$('tour').classList.add('hidden');
    this.el.classList.remove('touring');
    this._go();
  }

  _renderTour() {
    const t = this.tour, st = t.steps[t.i], last = t.i === t.steps.length - 1;
    const el = this.$('tour');
    el.classList.remove('hidden');
    el.innerHTML = `<div class="k-tour-head"><span>作業環境介紹 ${t.i + 1}/${t.steps.length}</span><button data-tour="skip">略過(Esc)</button></div>
      <h3>${st.t}</h3><p>${st.d}</p>
      <div class="k-tour-btns"><button data-tour="prev" ${t.i ? '' : 'disabled'}>上一步</button><button class="primary" data-tour="next">${last ? '開工!' : '下一步(Enter)'}</button></div>`;
  }


  dispose() {
    const g = this.g;
    g.renderer.domElement.removeEventListener('pointerdown', this._onPointer);
    g.scene.remove(this.root);
    g.scene.background = this._env.background;
    g.scene.environmentIntensity = this._env.intensity;
    g.scene.fog = this._env.fog;
    g.camera.fov = 62;
    g.camera.updateProjectionMatrix();
    this.ksfx.stopAll();
    g.voice.stopAll();
    g.ui.clearBubbles();
    this.el.remove();
  }

  // ================================================================ 訂單與組裝
  _newOrder() {
    let r = this.R();
    const list = Object.values(this.B);
    this.order = (list.find((b) => (r -= b.mix || 1 / list.length) < 0) || list[list.length - 1]).id;
    this.ordersDone++;
    this.asm = { parts: [], box: false, group: null };
    this.k.setTicket(this.B[this.order], Math.min(this.ordersDone, this.cfg.quota), this.cfg.quota);
    this._renderOrder();
  }

  /** 組裝台:放入一項材料 */
  _add(key) {
    const a = this.asm, bento = this.B[this.order];
    if (this.carry) { this._toast('手上有東西,先放好再組裝', 'warn'); return; }
    if (key !== 'box' && !a.box) { this._toast('先放一個便當盒(1)', 'warn'); return; }
    if (key === 'box' && a.box) { this._toast('已經放了便當盒', 'warn'); return; }
    if (this.stock[key] <= 0) { this._out(key); return; }
    this.stock[key]--;
    const at = this.k.assemblyAt;
    if (key === 'box') {
      a.box = true;
      a.group = new THREE.Group();
      a.group.position.copy(at);
      a.group.rotation.y = 0;
      a.group.add(makeBentoTray());
      this.root.add(a.group);
    } else if (key === 'lid') {
      a.group.add(makeBentoLid(bento.sticker));
      a.lid = true;
      this._finishBento();
    } else {
      a.parts.push(key);
      const part = makeFoodPart(key, this.F, bento);
      // 重複放同一項:稍微墊高,看得出來放了兩份
      const dup = a.parts.filter((x) => x === key).length - 1;
      part.position.y = dup * 0.006;
      a.group.add(part);
    }
    this.ksfx.place(key === 'lid' ? 0.8 : 1.2);
    this._syncScene();
    this._renderPanel();
    this._renderOrder();
  }

  _discard() {
    const a = this.asm;
    if (!a.box) return;
    this.root.remove(a.group);
    this.asm = { parts: [], box: false, group: null };
    this._toast('倒掉重做(材料不退回)', 'warn');
    this.g.sfx.bad();
    this._renderPanel();
    this._renderOrder();
  }

  _finishBento() {
    const a = this.asm;
    const item = { order: this.order, parts: [...a.parts], by: 'player' };
    this.root.remove(a.group);
    // 正確的用與推車相同的成品模型,錯的保留組裝出來的樣子
    item.obj = this._contentOk(item) ? this._bentoModel(item.order) : a.group;
    item.obj.position.set(0, 0, 0);
    this._pushStack(item);
    this.asm = { parts: [], box: false, group: null };
    this.stats.asmDone++;
    this._toast(`${this.B[item.order].name}完成,放在桌邊(按 F 一次拿起,搬到成品架)`);
    this._newOrder();
    this._renderPanel();
    if (this.stats.asmDone >= 5 && !this.helperOffered) this._offerHelpers();
  }

  /** 放到桌邊堆疊(島台東側,3 落 × 6 層) */
  _pushStack(item) {
    this.stack.push(item);
    this._layoutStack();
  }

  _layoutStack() {
    this.stackGroup.clear();
    const at = this.k.assemblyAt;
    this.stack.forEach((it, i) => {
      const col = Math.floor(i / 6) % 3, row = i % 6;
      it.obj.position.set(at.x + 0.45 + col * 0.21, at.y + 0.002 + row * 0.053 + Math.floor(i / 18) * 0.32, at.z + 0.02);
      it.obj.rotation.set(0, Math.PI / 2 + ((i * 37) % 7 - 3) * 0.01, 0);
      this.stackGroup.add(it.obj);
    });
    this._renderOrder();
  }

  /** F:把桌邊的便當一次全部拿起來 */
  _takeStack() {
    if (!this.stack.length) { this._toast('桌邊沒有做好的便當', 'warn'); return; }
    if (this.carry && !this.carry.bentos) { this._toast('手上有東西,先放好再拿便當', 'warn'); return; }
    if (this._nearStation() !== 'assembly') { this._toast('要站在組裝台旁邊才拿得到', 'warn'); return; }
    const list = this.carry?.bentos || [];
    this.carry = { bentos: list.concat(this.stack.splice(0)) };
    this._layoutStack();
    this._refreshCarry();
    this._closePanel();
    const k = this.carry.bentos.length;
    this._toast(`拿起 ${k} 個便當${dropChance(k) > 0 ? `(每一步約 ${Math.round(dropChance(k) * 100)}% 會掉落,小心走)` : ''}`, dropChance(k) > 0.1 ? 'warn' : 'info');
  }

  /** 手上的便當疊成一落 */
  _refreshCarry() {
    const c = this.carry;
    if (!c?.bentos) return;
    const g = new THREE.Group();
    c.bentos.forEach((b, i) => {
      b.obj.position.set(Math.sin(i * 1.7) * 0.006, i * 0.054, 0);
      b.obj.rotation.set(0, Math.PI / 2 + Math.sin(i * 2.3) * 0.04, 0);
      g.add(b.obj);
    });
    this._setCarryObj(g);
  }

  /** 搬便當走路時掉落 */
  _stepCarry(dist) {
    const c = this.carry;
    if (!c?.bentos) { this._stepAcc = 0; return; }
    this._stepAcc += dist;
    while (this._stepAcc >= STEP_LEN && this.carry?.bentos) {
      this._stepAcc -= STEP_LEN;
      const k = c.bentos.length;
      if (this.R() < dropChance(k)) this._drop(Math.min(k, 1 + Math.floor(this.R() * (k / 5))));
    }
  }

  _drop(n) {
    const c = this.carry, P = this.p;
    const fell = c.bentos.splice(c.bentos.length - n, n);
    let value = 0;
    fell.forEach((b, i) => {
      value += this.B[b.order].price;
      const o = b.obj;
      this.carryAnchor.remove(o);
      // 摔在腳邊:翻覆或側倒,蓋子歪掉
      o.position.set(P.x + (this.R() - 0.5) * 0.9, 0.02 + (this.R() < 0.5 ? 0.06 : 0), P.z + (this.R() - 0.5) * 0.9);
      o.rotation.set(this.R() < 0.5 ? Math.PI : (this.R() - 0.5) * 1.4, this.R() * 6, (this.R() - 0.5) * 1.2);
      const lid = o.getObjectByName('lid');
      if (lid) { lid.position.x += 0.08; lid.rotation.z = 0.4; }
      this.dropGroup.add(o);
    });
    this.stats.dropped += n;
    this.stats.dropValue += value;
    this.g.sfx.bad();
    this.ksfx.place(0.45);
    if (!c.bentos.length) { this.carry = null; this._setCarryObj(null); } else this._refreshCarry();
    this._toast(`啪!掉了 ${n} 個便當,賠 $${value}`, 'bad');
    if ((this._dropNag || 0) < this.time) { this._dropNag = this.time + 15; this.g.voice.talk('kboss_drop', this.bossHead); }
    this._renderTop();
  }

  _contentOk(c) {
    const want = this.B[c.order].parts;
    return c.parts[0] === want[0] && c.parts.length === want.length && want.every((k) => c.parts.includes(k));
  }

  /** 在成品架放下手上同款的全部便當 */
  _toRack(id) {
    const c = this.carry;
    const mine = c.bentos.filter((b) => b.order === id);
    if (!mine.length) { this._toast(`手上沒有${this.B[id].name}`, 'warn'); return; }
    c.bentos = c.bentos.filter((b) => b.order !== id);
    let ok = 0, bad = 0, fine = 0;
    for (const b of mine) {
      if (this._contentOk(b)) {
        ok++;
        this.stats.made++;
        if (b.by !== 'player') this.stats.helperMade++;
        this.k.addToRack(id, b.obj);
      } else {
        const price = this.B[b.order].price * this.cfg.fine;
        bad++; fine += price;
        this.stats.mistakes++;
        this.stats.fines += price;
        this.stats.wrongContent++;
        const who = b.by === 'player' ? '' : `(${HELPERS[b.by].name}做的)`;
        this.stats.log.push(`${this.B[b.order].name}${who}:${this._whyWrong(b)}`);
        this.carryAnchor.remove(b.obj);
      }
    }
    if (!c.bentos.length) { this.carry = null; this._setCarryObj(null); } else this._refreshCarry();
    this.ksfx.place(0.7);
    if (bad) {
      this.g.sfx.bad();
      this.g.voice.talk('kboss_wrong', this.bossHead);
      this._toast(`上架 ${ok} 個;${bad} 個裝錯 — 賠 $${fine}、記點 ${bad}`, 'bad');
    } else {
      this.g.sfx.ok();
      this._toast(`✓ ${this.B[id].name} 上架 ${ok} 個(完成 ${this.stats.made}/${this.cfg.quota})`, 'good');
      if (ok && Math.floor(this.stats.made / 4) !== Math.floor((this.stats.made - ok) / 4) && this.stats.made < this.cfg.quota) this.g.voice.talk('kboss_good', this.bossHead);
    }
    if (this.stats.made >= this.cfg.quota) this._end(true);
    this._renderTop();
  }

  _bentoModel(id) {
    const b = this.B[id];
    return b.classic ? makeBento(b.classic) : makeLevelBento(b, this.F);
  }

  _whyWrong(c) {
    const want = this.B[c.order].parts, nm = (k) => this.F[k].name;
    const missing = want.filter((k) => !c.parts.includes(k)).map(nm);
    const extra = [...new Set(c.parts.filter((k) => !want.includes(k)))].map(nm);
    const dup = [...new Set(c.parts.filter((k, i) => c.parts.indexOf(k) !== i))].map(nm);
    const out = [];
    if (c.parts[0] !== want[0] && c.parts.includes(want[0])) out.push('飯要先盛');
    if (missing.length) out.push(`少了${missing.join('、')}`);
    if (extra.length) out.push(`多放了${extra.join('、')}`);
    if (dup.length) out.push(`${dup.join('、')}放了兩份`);
    return out.join(',') || '內容不符';
  }

  _out(key) {
    this._toast(`${this.I[key].name}沒了!${this.H[key]}`, 'bad');
    this.g.sfx.bad();
    if ((this.nagT[key] || 0) < this.time) {
      this.nagT[key] = this.time + 8;
      this.g.voice.talk(`kboss_out_${key}`, this.bossHead);
    }
  }

  // ================================================================ 工作站
  /** E 鍵:對最近的工作站互動 */
  _interact() {
    const s = this._nearStation();
    if (!s) { this._toast('附近沒有可以操作的地方', 'warn'); return; }
    if (s === 'assembly') return this._assembly();
    if (s === 'trash') {
      if (!this.carry) { this._toast('廚餘桶:燒焦的食物倒這裡'); return; }
      this._toast(`已倒掉${this.carry.bentos ? `${this.carry.bentos.length} 個便當` : this.CA[this.carry]?.name || ''}`, 'warn');
      this.carry = null;
      this._setCarryObj(null);
      return;
    }
    if (s.startsWith('rack_')) {
      if (!this.carry?.bentos) { this._toast(`${this._sname(s)}:已放 ${this.k.racks[s.slice(5)].items.length} 個`); return; }
      return this._toRack(s.slice(5));
    }
    const st = this.st[s];
    if (st.state === 'done' || st.state === 'burnt') return this._collect(s);
    if (st.state === 'cook') { this._toast(`${STATIONS_K[s]}:${this.RC[st.recipe].label}中,還要 ${Math.ceil(st.cook - st.t)} 秒`); return; }
    this._openStation(s);
  }

  _openStation(s) {
    const options = Object.entries(this.RC).filter(([, r]) => r.station === s).map(([id, r], i) => {
      const ok = r.needs ? this.carry === r.needs : !this.carry;
      const why = r.needs && this.carry !== r.needs ? `需要${this.CA[r.needs].name.replace(/\(.*\)/, '')}` : this.carry && !r.needs ? '手上有東西' : '';
      return { id, key: i + 1, label: r.label, info: r.cook ? `${r.work}s + 烹煮 ${r.cook}s` : `${r.work}s`, ok, why };
    });
    this.panel = { kind: 'station', station: s, options };
    this._renderPanel();
  }

  _start(s, id) {
    const r = this.RC[id];
    if (r.needs ? this.carry !== r.needs : this.carry) { this._toast(r.needs ? `要先拿著${this.CA[r.needs].name}` : '手上有東西,先放好', 'warn'); return; }
    const used = r.needs ? this.carry : null;
    if (used) { this.carry = null; this._setCarryObj(null); }
    this.work = { station: s, recipe: id, t: 0, dur: r.work, used };
    this.st[s].state = 'work';
    this.st[s].recipe = id;
    this._closePanel();
    this._syncScene();
  }

  /** 人離開或移動:中斷手上的工作 */
  _abortWork() {
    const w = this.work;
    if (!w) return;
    this.st[w.station].state = 'idle';
    if (w.used) { this.carry = w.used; this._setCarryObj(this._carryModel(w.used)); }
    this.work = null;
    this._toast('工作中斷了', 'warn');
    this._syncScene();
  }

  _workDone() {
    const w = this.work, r = this.RC[w.recipe], st = this.st[w.station];
    this.work = null;
    if (r.cook) {
      Object.assign(st, { state: 'cook', t: 0, cook: r.cook, over: 0 });
      this._toast(`${r.label}:${r.cook} 秒後完成,可以先去做別的事`);
    } else {
      st.state = 'idle';
      this.carry = r.gives;
      this._setCarryObj(this._carryModel(r.gives));
      this._toast(`拿著${this.CA[r.gives].name}`);
    }
    this._syncScene();
  }

  _collect(s) {
    const st = this.st[s];
    if (this.carry) { this._toast('手上有東西,先放好才能起鍋', 'warn'); return; }
    const burnt = st.state === 'burnt';
    this.carry = burnt ? 'burnt' : this.RC[st.recipe].gives;
    this._setCarryObj(this._carryModel(this.carry));
    st.state = 'idle';
    st.recipe = null;
    const y = this.CA[this.carry].yields;
    this._toast(burnt ? '燒焦了,拿去廚餘桶倒掉' : `起鍋:${this.CA[this.carry].name}${y ? ',拿到組裝台補料' : ''}`, burnt ? 'warn' : 'info');
    this._syncScene();
  }

  /** 組裝台:送達補料,或開啟組裝面板 */
  _assembly() {
    const c = this.carry;
    if (c && typeof c === 'string') {
      const y = this.CA[c].yields;
      if (!y) { this._toast(c === 'burnt' ? '燒焦的要倒進廚餘桶' : `${this.CA[c].name}`, 'warn'); return; }
      const got = Object.entries(y).map(([k, n]) => { const before = this.stock[k]; this.stock[k] = Math.min(this.I[k].cap, before + n); return `${this.I[k].name} +${this.stock[k] - before}`; });
      this._toast(`補料:${got.join('、')}`, 'good');
      this.carry = null;
      this._setCarryObj(null);
      this.ksfx.place(0.9);
      this._syncScene();
      return;
    }
    if (c?.bentos) { this._toast('先把手上的便當放到成品架', 'warn'); return; }
    this.panel = { kind: 'assembly' };
    this._renderPanel();
  }

  _nearStation() {
    const { x, z } = this.p;
    // 組裝台:沿島台南側都算
    if (z > 1.3 && z < 2.5 && x > -3.2 && x < 3.2) return 'assembly';
    let best = null, bd = REACH;
    for (const [k, p] of Object.entries(this.pos)) {
      if (k === 'assembly') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  // ================================================================ 拿在手上的東西
  _carryModel(c) {
    if (!c) return null;
    const g = new THREE.Group();
    const steel = this.k.M.steel;
    const info = this.CA[c] || {};
    const food = info.food && this.F[info.food];
    if (c === 'crate_box' || c === 'crate_lid') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.42), new THREE.MeshStandardMaterial({ color: '#b8895a', roughness: 0.9 }));
      m.position.y = 0.12; m.castShadow = true;
      g.add(m);
    } else if (food?.shape === 'rice') {
      g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.2, 24), steel), { castShadow: true }));
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 24), new THREE.MeshStandardMaterial({ color: food.color, roughness: 0.85 }));
      top.position.y = 0.09;   // position 是唯讀屬性,不能用 Object.assign 覆寫
      g.add(top);
    } else if (info.stage !== undefined) {
      // 半成品:不鏽鋼調理盆
      g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.11, 0.1, 20), new THREE.MeshStandardMaterial({ color: '#d9dde0', metalness: 0.8, roughness: 0.3 })), { castShadow: true }));
      const f = bulkFood(food, 0.2, 0.2, 1, 3);
      f.position.y = 0.04;
      g.add(f);
    } else {
      // 成品一盤(或燒焦的一鍋)
      g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.3), steel), { castShadow: true }));
      const spec = c === 'burnt' ? { shape: 'leaf', color: '#1a120c', color2: '#2a1a10', count: 6 } : food;
      if (spec) { const f = bulkFood(spec, 0.3, 0.24, 1, 5); f.position.y = 0.04; g.add(f); }
    }
    return g;
  }

  _setCarryObj(obj) {
    this.carryAnchor.clear();
    if (obj) this.carryAnchor.add(obj);
    this._renderCarry();
  }

  // ================================================================ 移動與尋路
  _walkable(x, z) {
    const inRoom = x > ROOM.x0 + R_CHEF && x < ROOM.x1 - R_CHEF && z > ROOM.z0 + R_CHEF && z < ROOM.z1 - 0.2;
    const inStore = x > STORE.x0 + R_CHEF && x < STORE.x1 && z > STORE.z0 + R_CHEF && z < STORE.z1 - R_CHEF;
    const inDoor = x > STORE.x1 - 0.5 && x < ROOM.x0 + 0.5 && z > STORE.door[0] + R_CHEF && z < STORE.door[1] - R_CHEF;
    if (!inRoom && !inStore && !inDoor) return false;
    for (const [x0, z0, x1, z1] of OBSTACLES.concat(this.extraObs || [])) if (x > x0 - R_CHEF && x < x1 + R_CHEF && z > z0 - R_CHEF && z < z1 + R_CHEF) return false;
    return true;
  }

  _nav() {
    const C = 0.2, X0 = STORE.x0, Z0 = ROOM.z0;
    const nx = Math.ceil((ROOM.x1 - X0) / C), nz = Math.ceil((ROOM.z1 - Z0) / C);
    const free = new Uint8Array(nx * nz);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) free[j * nx + i] = this._walkable(X0 + (i + 0.5) * C, Z0 + (j + 0.5) * C) ? 1 : 0;
    this.grid = { C, X0, Z0, nx, nz, free };
  }

  _path(tx, tz) {
    const { C, X0, Z0, nx, nz, free } = this.grid;
    const cell = (x, z) => [Math.max(0, Math.min(nx - 1, Math.floor((x - X0) / C))), Math.max(0, Math.min(nz - 1, Math.floor((z - Z0) / C)))];
    const nearestFree = ([i, j]) => {
      for (let r = 0; r < 12; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
        const a = i + di, b = j + dj;
        if (a >= 0 && b >= 0 && a < nx && b < nz && free[b * nx + a]) return [a, b];
      }
      return null;
    };
    const s = nearestFree(cell(this.p.x, this.p.z)), t = nearestFree(cell(tx, tz));
    if (!s || !t) return null;
    const N = nx * nz, gS = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open = [[0, s[1] * nx + s[0]]];
    gS[s[1] * nx + s[0]] = 0;
    const goal = t[1] * nx + t[0];
    const h = (id) => Math.hypot((id % nx) - t[0], Math.floor(id / nx) - t[1]);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, cur] = open.splice(bi, 1)[0];
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % nx, cj = Math.floor(cur / nx);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const a = ci + di, b = cj + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const id = b * nx + a;
        if (!free[id] || closed[id]) continue;
        if (di && dj && (!free[cj * nx + a] || !free[b * nx + ci])) continue;   // 不穿角
        const ng = gS[cur] + (di && dj ? 1.414 : 1);
        if (ng < gS[id]) { gS[id] = ng; came[id] = cur; open.push([ng + h(id), id]); }
      }
    }
    if (came[goal] < 0 && goal !== s[1] * nx + s[0]) return null;
    const pts = [];
    for (let id = goal; id >= 0 && id !== s[1] * nx + s[0]; id = came[id]) pts.push({ x: X0 + ((id % nx) + 0.5) * C, z: Z0 + (Math.floor(id / nx) + 0.5) * C });
    pts.reverse();
    // 簡化:每 3 格取一點,最後一點精確
    const out = pts.filter((_, i) => i % 3 === 2);
    out.push({ x: tx, z: tz });
    return out;
  }

  _walkTo(x, z, then = null) {
    const path = this._path(x, z);
    if (!path) { this._toast('走不過去', 'warn'); return; }
    if (this.work) this._abortWork();
    this._closePanel();
    this.p.path = path;
    this.p.then = then;
  }

  _goTo(station) {
    const p = this.pos[station];
    this._walkTo(p.x, p.z, station);
  }

  _move(dt) {
    const inp = this.g.input, P = this.p;
    let dx = 0, dz = 0;
    if (this.cam.mode === 'first') {
      // 第一人稱:前後移動、左右轉向
      const turn = (inp.isDown('KeyA', 'ArrowLeft') ? 1 : 0) - (inp.isDown('KeyD', 'ArrowRight') ? 1 : 0);
      const fwd = (inp.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (inp.isDown('KeyS', 'ArrowDown') ? 1 : 0);
      if (turn) { P.angle += turn * 2.4 * dt; P.path = null; if (this.work) this._abortWork(); if (this.panel) this._closePanel(); }
      if (fwd) { dx = Math.cos(P.angle) * fwd; dz = -Math.sin(P.angle) * fwd; this._fwdOnly = fwd; }
      else this._fwdOnly = 0;
    } else {
      this._fwdOnly = 0;
      if (inp.isDown('KeyW', 'ArrowUp')) dz -= 1;
      if (inp.isDown('KeyS', 'ArrowDown')) dz += 1;
      if (inp.isDown('KeyA', 'ArrowLeft')) dx -= 1;
      if (inp.isDown('KeyD', 'ArrowRight')) dx += 1;
    }
    if (dx || dz) {
      P.path = null;
      if (this.work) this._abortWork();
      if (this.panel) this._closePanel();
    } else if (P.path?.length) {
      const t = P.path[0];
      const ex = t.x - P.x, ez = t.z - P.z, d = Math.hypot(ex, ez);
      if (d < 0.12) {
        P.path.shift();
        if (!P.path.length) {
          P.path = null;
          if (P.then) {
            const sp = this.pos[P.then];
            // 面向工作站(工作站在站位的哪一側)
            const face = { assembly: [0, -1], board: [-1, 0], storage: [-1, 0], trash: [0, 1] }[P.then] || (P.then.startsWith('rack') ? [1, 0] : [0, -1]);
            P.angle = Math.atan2(-face[1], face[0]);
            if (sp) { P.x = sp.x; P.z = sp.z; }
            this._toast(`到了:${this._sname(P.then)}(按 E 操作)`);
            P.then = null;
          }
        }
      } else { dx = ex / d; dz = ez / d; }
    }
    const l = Math.hypot(dx, dz);
    if (l > 0) {
      dx /= l; dz /= l;
      const k = this.carry?.bentos?.length || 0;
      const v = SPEED * (k ? Math.max(0.55, 1 - 0.035 * k) : this.carry ? 0.85 : 1);
      const nx = P.x + dx * v * dt, nz = P.z + dz * v * dt;
      const x0 = P.x, z0 = P.z;
      if (this._walkable(nx, P.z)) P.x = nx;
      if (this._walkable(P.x, nz)) P.z = nz;
      this._stepCarry(Math.hypot(P.x - x0, P.z - z0));
      if (!this._fwdOnly) {   // 第一人稱按鍵移動時不轉身(後退仍面向前方)
        const target = Math.atan2(-dz, dx);
        let da = target - P.angle;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        P.angle += da * Math.min(1, dt * 12);
      }
      P.vel = v;
    } else P.vel = 0;
  }

  // ================================================================ 主更新
  update(dt) {
    const g = this.g, inp = g.input;
    this.time += dt;
    if (this.endTimer !== null) {
      this.endTimer -= dt;
      this._visual(dt);
      if (this.endTimer <= 0) return this._result();
      return null;
    }
    if (this.modal === 'tour') {
      if (inp.wasPressed('Enter', 'NumpadEnter', 'Space', 'ArrowRight', 'KeyE')) this._tourStep(1);
      else if (inp.wasPressed('ArrowLeft')) this._tourStep(-1);
      else if (inp.wasPressed('Escape')) this._endTour();
    }
    if (this.modal) { this._visual(dt); return null; }   // 導覽、選同事時暫停計時
    this.left -= dt;
    if (this.left <= 60 && !this._hurry) { this._hurry = true; g.voice.talk('kboss_hurry', this.bossHead); }
    if (this.left <= 0) { this._end(false); return null; }

    this._move(dt);
    // 按鍵
    if (this.panel?.kind === 'assembly') {
      for (const [k, v] of Object.entries(this.I)) if (inp.wasPressed(v.key, v.key.replace('Digit', 'Numpad'))) this._add(k);
      if (inp.wasPressed('Backspace')) this._discard();
      if (inp.wasPressed('Escape', 'KeyE')) this._closePanel();
    } else if (this.panel?.kind === 'station') {
      const d = inp.digit();
      const o = d && this.panel.options.find((x) => x.key === d);
      if (o) this._start(this.panel.station, o.id);
      if (inp.wasPressed('Escape', 'KeyE')) this._closePanel();
    } else if (inp.wasPressed('KeyE', 'Space') && !this.work) this._interact();
    if (inp.wasPressed('KeyF') && !this.work) this._takeStack();
    this._updateHelper(dt);
    if (inp.wasPressed('KeyV')) { this.cam.mode = this.cam.mode === 'first' ? 'third' : 'first'; this._toast(this.cam.mode === 'first' ? '第一人稱視角(W/S 前後、A/D 轉向)' : '第三人稱視角'); }

    // 手上的工作
    if (this.work) {
      this.work.t += dt;
      if (this.work.station === 'board' && Math.floor(this.work.t * 5) !== Math.floor((this.work.t - dt) * 5)) this.ksfx.chop();
      if (this.work.t >= this.work.dur) this._workDone();
    }
    // 烹煮計時
    for (const k of COOK_STATIONS) {
      const st = this.st[k];
      if (st.state === 'cook') {
        st.t += dt;
        if (st.t >= st.cook) { st.state = 'done'; st.over = 0; this.ksfx.ding(); this._toast(`${STATIONS_K[k]}:${this.RC[st.recipe].label}完成,快去起鍋!`, 'good'); this._syncScene(); }
      } else if (st.state === 'done') {
        st.over += dt;
        const burn = this.RC[st.recipe].burn;
        if (burn && st.over >= burn) {
          st.state = 'burnt';
          this.stats.burnt++;
          this.ksfx.alarm();
          g.voice.talk('kboss_burnt', this.bossHead);
          this._toast(`${STATIONS_K[k]}燒焦了!`, 'bad');
          this._syncScene();
        }
      }
    }
    this._visual(dt);
    return null;
  }

  _visual(dt) {
    const P = this.p, g = this.g;
    this.chef.position.set(P.x, P.vel ? Math.abs(Math.sin(this.time * 9)) * 0.03 : 0, P.z);
    this.chef.rotation.y = P.angle;
    // 工作時身體微晃(切菜、翻炒)
    this.chef.rotation.z = this.work ? Math.sin(this.time * 12) * 0.02 : 0;
    for (const k of COOK_STATIONS) {
      const st = this.st[k];
      this.k.setStation(k, st.state, st.recipe && this.F[this.RC[st.recipe].food], st.cook ? Math.min(1, st.t / st.cook) : 0);
      const kind = { fryer: 'fry', wok: 'stir', griddle: 'griddle', braise: 'boil', rice: 'boil' }[k];
      this.ksfx.loop(k, kind, st.state === 'cook' || st.state === 'burnt' ? (k === 'rice' ? 0.3 : 1) : st.state === 'done' && k !== 'rice' ? 0.4 : 0);
    }
    this.k.setStation('board', this.st.board.state, this.st.board.recipe && this.F[this.RC[this.st.board.recipe].food]);
    this.k.setClock(this.left);
    this.k.update(dt, this.time);
    this._placeCamera(dt);
    g.ui.updateBubbles(g.camera);
    this._renderTop();
    this._renderStations();
    this._renderPrompt();
  }

  _placeCamera(dt, snap = false) {
    const cam = this.g.camera, P = this.p, c = this.cam;
    let pos, look, fov;
    const first = this.cam.mode === 'first';
    // 第一人稱:隱藏自己的身體(手上端的東西仍看得到)
    for (const o of this.chef.children) if (o !== this.carryAnchor && o !== this.head) o.visible = !first;
    this.carryAnchor.position.set(first ? 0.6 : 0.42, first ? 1.22 : 0.98, 0);   // 第一人稱時抬到視線下緣
    if (this.tour) {
      const st = this.tour.steps[this.tour.i];
      pos = st.pos.clone(); look = st.look.clone(); fov = 50;
      this.tourMark.position.copy(st.mark).add(new THREE.Vector3(0, Math.abs(Math.sin(this.time * 4)) * 0.12, 0));
      this.tourMark.rotation.y += dt * 2;
    } else if (this.panel?.kind === 'assembly') {
      // 組裝:靠近島台由上往下看便當與保溫餐檯
      // 鏡頭往下壓:正在組裝的便當在畫面上半(面板在下半),上方看得到保溫餐檯
      pos = new THREE.Vector3(0, 1.55, 1.75); look = new THREE.Vector3(0, 0.81, 1.08); fov = 55;
    } else if (first) {
      const dir = new THREE.Vector3(Math.cos(P.angle), 0, -Math.sin(P.angle));
      pos = new THREE.Vector3(P.x, 1.62, P.z).addScaledVector(dir, 0.08);
      look = pos.clone().addScaledVector(dir, 2).add(new THREE.Vector3(0, -0.55, 0));
      fov = 68;
    } else {
      const x = THREE.MathUtils.clamp(P.x, -10.5, 6);
      pos = new THREE.Vector3(x, 6.4, P.z + 5.6);
      look = new THREE.Vector3(x, 0.6, P.z - 0.4);
      fov = 50;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * (this.tour ? 3 : first && !this.panel ? 14 : 5));
    c.pos.lerp(pos, k); c.look.lerp(look, k);
    c.fov += (fov - c.fov) * k;
    cam.position.copy(c.pos);
    cam.lookAt(c.look);
    if (Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
  }

  _syncScene() {
    for (const k of Object.keys(this.F)) this.k.setPan(k, this.stock[k] / this.I[k].cap);
    this.k.setStacks(this.stock.box, this.stock.lid);
    this._renderStock();
  }

  // ================================================================ 協助同事
  _offerHelpers() {
    this.helperOffered = true;
    this.modal = 'helper';
    this._closePanel();
    this.g.voice.talk('kboss_helper_pick', this.bossHead);
    const shots = this._portraits();
    const el = this.$('modal');
    el.innerHTML = `<div class="k-modal-card"><h2>新同事報到!<small>只能選一位來幫你裝便當(不負責料理)</small></h2>
      <div class="k-helpers">${Object.entries(HELPERS).map(([id, h]) => `
        <button class="k-helper" data-hire="${id}">
          ${shots[id] ? `<img src="${shots[id]}" alt="">` : `<div class="k-h-ph">${h.icon}</div>`}
          <b>${esc(h.name)}</b><em>${esc(h.title)}</em>
          <p>${esc(h.intro)}</p>
          <div class="k-h-pro">＋ ${esc(h.pros)}(約 ${h.speed} 秒/個)</div>
          <div class="k-h-con">－ ${esc(h.cons)}</div>
        </button>`).join('')}</div>
      <button class="k-close" data-hire="none">不用了,我自己來</button></div>`;
    el.classList.remove('hidden');
  }

  /** 候選同事的大頭照(離屏算圖) */
  _portraits() {
    if (this._shots) return this._shots;
    const out = {};
    let r;
    try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch { return (this._shots = out); }
    r.setSize(200, 220);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#776655', 1.6));
    const key = new THREE.DirectionalLight('#fff3e0', 2.2);
    key.position.set(2, 3, 1.5);
    scene.add(key);
    const cam = new THREE.PerspectiveCamera(26, 200 / 220, 0.05, 10);
    for (const [id, h] of Object.entries(HELPERS)) {
      const f = this._helperFigure(h);
      if (!f) continue;
      scene.add(f);
      cam.position.set(1.55, 1.52 * h.figure.scale[1], 0.35);
      cam.lookAt(0, 1.38 * h.figure.scale[1], 0);
      r.render(scene, cam);
      out[id] = r.domElement.toDataURL('image/png');
      scene.remove(f);
    }
    r.dispose();
    r.forceContextLoss();
    return (this._shots = out);
  }

  _helperFigure(h) {
    const f = workerFigure(this.assets.rail, h.figure.ids, h.figure.color, true);
    if (!f) return null;
    f.scale.set(...h.figure.scale);
    return f;
  }

  _hire(id) {
    this.modal = null;
    this.$('modal').classList.add('hidden');
    if (id === 'none' || !HELPERS[id]) { this._toast('自己來!'); return; }
    const spec = HELPERS[id];
    const fig = this._helperFigure(spec) || this.assets.attendant.clone(true);
    const at = this.k.assemblyAt;
    fig.position.set(HELPER_AT, 0, 1.85);
    fig.rotation.y = Math.PI / 2;
    const head = new THREE.Object3D();
    head.position.set(0, 1.9, 0);
    fig.add(head);
    this.root.add(fig);
    // 同事的工作墊
    const mat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.01, 0.36), this.k.M.board);
    mat.position.set(HELPER_AT, at.y - 0.005, at.z);
    this.root.add(mat);
    this.helper = { id, spec, fig, head, order: null, t: 0, dur: 1, pause: 0, chatT: 6, eatT: 14 + this.R() * 8, shortT: 0, tray: null };
    // 同事站的位置不能走過去:重建尋路網格
    this.extraObs = [[HELPER_AT - 0.3, 1.55, HELPER_AT + 0.3, 2.15]];
    this._nav();
    this.g.voice.talk(`helper_${id}_join`, head);
    this._toast(`${spec.name}(${spec.title})加入,開始幫忙裝便當`, 'good');
    this._renderTop();
  }

  _say(key) { this.g.voice.talk(`helper_${this.helper.id}_${key}`, this.helper.head); }

  _updateHelper(dt) {
    const h = this.helper;
    if (!h) return;
    const spec = h.spec, R = this.R;
    h.fig.rotation.z = h.order && h.pause <= 0 ? Math.sin(this.time * 9) * 0.015 : 0;
    // 缺點:阿姨偷吃
    if (h.id === 'aunt') {
      h.eatT -= dt;
      if (h.eatT <= 0) {
        h.eatT = 18 + R() * 14;
        const avail = Object.keys(this.F).filter((k) => this.stock[k] > 0);
        if (avail.length) {
          const k = avail[(R() * avail.length) | 0], f = this.F[k];
          this.stock[k]--;
          const cost = f.main ? STOLEN_COST.main : f.shape === 'rice' ? STOLEN_COST.rice : STOLEN_COST.side;
          this.stats.stolen.push(f.name);
          this.stats.stolenValue += cost;
          this._say(`eat${(R() * 4) | 0}`);
          h.pause = 2;
          this._syncScene();
        }
      }
    }
    // 缺點:大學生聊天、哼歌(講話時停下手)
    if (h.id === 'student') {
      h.chatT -= dt;
      if (h.chatT <= 0) {
        h.chatT = 12 + R() * 10;
        this._say(R() < 0.6 ? `chat${(R() * 6) | 0}` : `hum${(R() * 3) | 0}`);
        h.pause = 3.5;
      }
    }
    if (h.pause > 0) { h.pause -= dt; return; }
    // 開始一個新便當
    if (!h.order) {
      let r = R();
      const list = Object.values(this.B);
      const b = list.find((x) => (r -= x.mix || 1 / list.length) < 0) || list[list.length - 1];
      let parts = [...b.parts];
      let wrong = false;
      if (spec.wrongRate && R() < spec.wrongRate) {
        wrong = true;
        const i = 1 + ((R() * (parts.length - 1)) | 0);
        const others = Object.keys(this.F).filter((k) => !parts.includes(k) && this.F[k].shape !== 'rice');
        if (others.length && R() < 0.5) parts[i] = others[(R() * others.length) | 0];   // 放錯菜
        else parts.splice(i, 1);                                                          // 漏放
      }
      const need = ['box', ...parts, 'lid'];
      const missing = need.filter((k) => this.stock[k] <= 0);
      if (missing.length) {
        h.shortT -= dt;
        if (h.shortT <= 0) {
          h.shortT = 14;
          this._say('short');
          this._toast(`${spec.name}:${missing.map((k) => this.I[k].name).join('、')}不夠了`, 'warn');
        }
        return;
      }
      need.forEach((k) => this.stock[k]--);
      this._syncScene();
      h.order = b.id; h.parts = parts; h.wrong = wrong; h.t = 0; h.shown = 0;
      h.dur = spec.speed * (0.9 + R() * 0.2);
      h.tray = new THREE.Group();
      h.tray.position.set(HELPER_AT, this.k.assemblyAt.y, this.k.assemblyAt.z);
      h.tray.add(makeBentoTray());
      this.root.add(h.tray);
      if (h.id === 'burly' && R() < 0.15) this._say('work0');
      return;
    }
    // 依進度一項一項放進盒子
    h.t += dt;
    const steps = h.parts.length + 1;
    const want = Math.min(steps, Math.floor((h.t / h.dur) * (steps + 1)));
    while (h.shown < want) {
      if (h.shown < h.parts.length) h.tray.add(makeFoodPart(h.parts[h.shown], this.F, this.B[h.order]));
      else h.tray.add(makeBentoLid(this.B[h.order].sticker));
      h.shown++;
    }
    if (h.t >= h.dur) {
      const item = { order: h.order, parts: h.parts, by: h.id };
      this.root.remove(h.tray);
      item.obj = this._contentOk(item) ? this._bentoModel(item.order) : h.tray;
      item.obj.position.set(0, 0, 0);
      this._pushStack(item);
      if (h.wrong && R() < 0.5) this._say(`oops${(R() * 2) | 0}`);
      h.order = null;
      h.tray = null;
    }
  }

  _end(success) {
    if (this.endTimer !== null) return;
    this.success = success;
    this.endTimer = 3;
    this._closePanel();
    this.g.voice.talk(success ? 'kboss_done' : 'kboss_fail', this.bossHead);
    this._toast(success ? '全部完成!' : '時間到!', success ? 'good' : 'bad');
  }

  _result() {
    const s = this.stats, success = this.success;
    return {
      kind: 'kitchen',
      success,
      kicked: false,
      careerDelta: { bentosMade: s.made, successes: success ? 1 : 0, failures: success ? 0 : 1, mistakes: s.mistakes },
      reason: success ? null : `出車時間到,只做好 ${s.made}/${this.cfg.quota} 個便當。`,
      made: s.made, quota: this.cfg.quota, level: this.L.title, mistakes: s.mistakes, fines: s.fines, burnt: s.burnt,
      wrongContent: s.wrongContent, wrongRack: s.wrongRack, timeLeft: Math.max(0, Math.round(this.left)), log: s.log,
      dropped: s.dropped, dropValue: s.dropValue, stolen: s.stolen, stolenValue: s.stolenValue,
      helper: this.helper ? `${this.helper.spec.name}(${this.helper.spec.title})` : null, helperMade: s.helperMade, leftOnTable: this.stack.length,
      timeLimit: this.cfg.timeLimit,
    };
  }

  // ================================================================ 介面
  _buildHud() {
    const el = this.el = document.createElement('div');
    el.className = 'k-hud pre';   // 進入廚房(begin)前不顯示
    el.innerHTML = `
      <div class="k-top">
        <div class="k-timer"><small>出車倒數</small><b data-k="time"></b></div>
        <div class="k-made"><small>完成</small><b data-k="made"></b></div>
        <div class="k-pen"><small>記點</small><b data-k="pts"></b><small>賠償</small><b data-k="fine"></b></div>
      </div>
      <div class="k-order" data-k="order"></div>
      <div class="k-stations" data-k="stations"></div>
      <div class="k-stock" data-k="stock"></div>
      <div class="k-carry" data-k="carry"></div>
      <div class="k-prompt" data-k="prompt"></div>
      <div class="k-panel hidden" data-k="panel"></div>
      <div class="k-modal hidden" data-k="modal"></div>
      <div class="k-tour hidden" data-k="tour"></div>
      <div class="k-touch">
        <div class="k-pad">
          <button data-hold="ArrowUp" class="u">▲</button><button data-hold="ArrowLeft" class="l">◀</button>
          <button data-hold="ArrowRight" class="r">▶</button><button data-hold="ArrowDown" class="d">▼</button>
        </div>
        <button class="k-f" data-key="KeyF">F<small>拿便當</small></button>
        <button class="k-e" data-key="KeyE">E<small>操作</small></button>
        <button class="k-mini k-stbtn" data-tg="st" title="工作站清單">☰</button>
        <button class="k-mini" data-key="KeyP" title="暫停/設定(P)">⚙</button>
      </div>`;
    this.g.ui.root.appendChild(el);
    this.$ = (k) => el.querySelector(`[data-k="${k}"]`);
    // 工作站清單:點一下自動走過去
    el.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]');
      if (go) { this._goTo(go.dataset.go); el.classList.remove('show-st'); }
      if (e.target.closest('[data-tg="st"]')) el.classList.toggle('show-st');
      const tb = e.target.closest('[data-tour]');
      if (tb) { const a = tb.dataset.tour; if (a === 'skip') this._endTour(); else this._tourStep(a === 'next' ? 1 : -1); }
      const hire = e.target.closest('[data-hire]');
      if (hire) this._hire(hire.dataset.hire);
      const b = e.target.closest('[data-act]');
      if (b) {
        const [kind, arg] = b.dataset.act.split(':');
        if (kind === 'add') this._add(arg);
        else if (kind === 'discard') this._discard();
        else if (kind === 'take') this._takeStack();
        else if (kind === 'start') this._start(this.panel.station, arg);
        else if (kind === 'close') this._closePanel();
      }
    });
    this._lastHud = 0;
    this._renderCarry();
  }

  _set(k, html) { const e = this.$(k); if (e && e.innerHTML !== html) e.innerHTML = html; }

  _renderTop() {
    this._set('time', fmt(this.left));
    this.$('time').parentElement.classList.toggle('urgent', this.left < 60);
    this._set('made', `${this.stats.made} <i>/ ${this.cfg.quota}</i>`);
    this._set('pts', `${this.stats.mistakes}`);
    this._set('fine', `$${this.stats.fines + this.stats.dropValue}`);
  }

  _renderOrder() {
    const b = this.B[this.order], want = b.parts, have = this.asm.parts;
    const thumb = this.thumbs?.[b.id];
    const lines = want.map((k) => `<li class="${have.includes(k) ? 'ok' : ''}">${have.includes(k) ? '✓' : '○'} ${esc(this.F[k].name)}</li>`).join('');
    const extra = have.filter((k) => !want.includes(k));
    this._set('order', `<div class="k-o-head"><span>製作單 #${this.ordersDone}${b.vegan ? '・全素' : ''}</span><b style="color:${b.color || { pork: '#b23a2a', chicken: '#c98a1c', veg: '#3f7d3a' }[b.id]}">${esc(b.name)}</b></div>
      ${thumb ? `<img src="${thumb}" alt="">` : ''}
      <ul>${this.asm.box ? '<li class="ok">✓ 便當盒</li>' : '<li>○ 便當盒</li>'}${lines}<li>○ 蓋子</li></ul>
      ${extra.length ? `<p class="k-warn">多放了:${extra.map((k) => esc(this.F[k].name)).join('、')}</p>` : ''}
      <p class="k-hint">完成後放在桌邊,按 F 一次拿起搬到成品架</p>
      <p class="k-stackn">桌邊成品 <b>${this.stack.length}</b> 個${this.helper ? `・${esc(this.helper.spec.name)}${this.helper.order ? '裝便當中' : ''}` : ''}</p>`);
  }

  _renderStations() {
    const now = performance.now();
    if (now - this._lastHud < 150) return;
    this._lastHud = now;
    const rows = COOK_STATIONS.map((k) => {
      const st = this.st[k];
      const r = st.recipe && this.RC[st.recipe];
      let txt = '閒置', cls = '', pct = 0;
      if (st.state === 'work') { txt = `${r.verb}…`; cls = 'work'; pct = this.work ? this.work.t / this.work.dur : 0; }
      else if (st.state === 'cook') { txt = `${r.label} ${Math.ceil(st.cook - st.t)}s`; cls = 'cook'; pct = st.t / st.cook; }
      else if (st.state === 'done') { const b = r.burn; txt = b ? `完成!${Math.ceil(b - st.over)}s 內起鍋` : '完成!可起鍋'; cls = 'done'; pct = 1; }
      else if (st.state === 'burnt') { txt = '燒焦!倒掉'; cls = 'burnt'; pct = 1; }
      return `<button class="k-st ${cls}" data-go="${k}"><span>${STATIONS_K[k]}</span><em>${esc(txt)}</em><i style="width:${(pct * 100).toFixed(0)}%"></i></button>`;
    });
    const w = this.work && (this.work.station === 'board' || this.work.station === 'storage');
    rows.push(`<button class="k-st ${w && this.work.station === 'board' ? 'work' : ''}" data-go="board"><span>砧板</span><em>${w && this.work.station === 'board' ? '切菜中…' : '切菜'}</em></button>`);
    rows.push(`<button class="k-st ${w && this.work.station === 'storage' ? 'work' : ''}" data-go="storage"><span>倉庫</span><em>便當盒・蓋子</em></button>`);
    rows.push(`<button class="k-st" data-go="assembly"><span>組裝台</span><em>組裝・補料</em></button>`);
    for (const id of Object.keys(this.B)) rows.push(`<button class="k-st rack" data-go="rack_${id}"><span>${esc(this._sname(`rack_${id}`))}</span><em>${this.k.racks[id].items.length} 個</em></button>`);
    rows.push(`<button class="k-st" data-go="trash"><span>廚餘桶</span><em>倒掉燒焦的</em></button>`);
    this._set('stations', `<div class="lbl">工作站(點一下走過去)</div>${rows.join('')}`);
  }

  _renderStock() {
    this._set('stock', Object.entries(this.I).map(([k, v]) => `<span class="${this.stock[k] === 0 ? 'out' : this.stock[k] <= 2 ? 'low' : ''}" title="${esc(this.H[k])}">${esc(v.short)}<b>${this.stock[k]}</b></span>`).join(''));
  }

  _renderCarry() {
    const c = this.carry;
    let txt = '';
    if (c?.bentos) {
      const cnt = {};
      c.bentos.forEach((b) => { cnt[b.order] = (cnt[b.order] || 0) + 1; });
      const risk = dropChance(c.bentos.length);
      txt = `手上:<b>便當 ×${c.bentos.length}</b>(${Object.entries(cnt).map(([o, n]) => `${esc(this.B[o].name.replace('便當', ''))} ${n}`).join('、')})${risk > 0 ? ` <i class="k-risk">每步掉落 ${Math.round(risk * 100)}%</i>` : ''}`;
    } else if (c) txt = `手上:<b>${esc(this.CA[c].name)}</b>`;
    this._set('carry', txt);
    this.$('carry').classList.toggle('hidden', !c);
  }

  _renderPrompt() {
    let html = '';
    if (this.endTimer !== null) html = '';
    else if (this.work) {
      const r = this.RC[this.work.recipe];
      html = `<div class="k-work"><span>${esc(r.label)}…</span><i style="width:${(this.work.t / this.work.dur * 100).toFixed(0)}%"></i></div><small>移動會中斷</small>`;
    } else if (!this.panel) {
      const s = this._nearStation();
      if (s) {
        const st = this.st[s];
        const what = s === 'assembly' ? (typeof this.carry === 'string' && this.CA[this.carry].yields ? '補料' : this.carry?.bentos ? '' : '組裝便當')
          : s.startsWith('rack_') ? (this.carry?.bentos?.some((b) => b.order === s.slice(5)) ? '放上這款' : '') : s === 'trash' ? (this.carry ? '倒掉' : '')
            : st?.state === 'done' ? '起鍋' : st?.state === 'burnt' ? '撈出燒焦的' : st?.state === 'cook' ? '' : '選擇工作';
        html = `<b>${esc(this._sname(s))}</b>${what ? `<span><kbd>E</kbd>${what}</span>` : ''}${s === 'assembly' && this.stack.length && (!this.carry || this.carry.bentos) ? `<span><kbd>F</kbd>拿起桌邊便當 ×${this.stack.length}</span>` : ''}`;
      } else html = this.cam.mode === 'first'
        ? '<span><kbd>W</kbd><kbd>S</kbd> 前後</span><span><kbd>A</kbd><kbd>D</kbd> 轉向</span><span><kbd>V</kbd> 切換視角</span>'
        : this._touch()
          ? '<span>方向鍵移動・點地板走過去</span><span>☰ 工作站清單</span>'
          : '<span><kbd>WASD</kbd>/方向鍵 移動</span><span>點地板或右側工作站自動走過去</span><span><kbd>V</kbd> 第一人稱</span>';
    }
    this._set('prompt', html);
  }

  _renderPanel() {
    const p = this.panel, el = this.$('panel');
    el.classList.toggle('hidden', !p);
    el.classList.toggle('asm', p?.kind === 'assembly');
    this.el.classList.toggle('panel-open', !!p);
    if (!p) { el.innerHTML = ''; return; }
    if (p.kind === 'station') {
      el.innerHTML = `<h3>${STATIONS_K[p.station]}</h3>
        ${p.options.map((o) => `<button class="k-opt ${o.ok ? '' : 'dis'}" data-act="start:${o.id}" ${o.ok ? '' : 'disabled'}><kbd>${o.key}</kbd>${esc(o.label)}<small>${o.ok ? o.info : esc(o.why)}</small></button>`).join('')}
        <button class="k-close" data-act="close">關閉(E)</button>`;
      return;
    }
    const a = this.asm;
    el.innerHTML = `<h3>組裝台 <small>依製作單把材料放進便當盒</small></h3>
      <div class="k-ings">${Object.entries(this.I).map(([k, v]) => {
        const n = this.stock[k];
        const dis = (k !== 'box' && !a.box) || (k === 'box' && a.box);
        return `<button class="k-ing ${n === 0 ? 'out' : ''} ${dis ? 'dim' : ''}" data-act="add:${k}"><kbd>${v.label}</kbd><b>${esc(v.name)}</b><small>${n === 0 ? '沒了' : `剩 ${n}`}</small></button>`;
      }).join('')}</div>
      <div class="k-asm-row"><button class="k-discard" data-act="discard" ${a.box ? '' : 'disabled'}><kbd>⌫</kbd>倒掉重做</button>
        <button class="k-discard" data-act="take" ${this.stack.length ? '' : 'disabled'}><kbd>F</kbd>拿起桌邊便當 ×${this.stack.length}</button><span class="grow"></span><button class="k-close" data-act="close">離開(E)</button></div>`;
  }

  _closePanel() {
    if (!this.panel) return;
    this.panel = null;
    this._renderPanel();
  }

  /** 觸控/小螢幕(與 CSS 的手機版條件一致) */
  _touch() { return matchMedia('(hover: none), (max-width: 900px), (max-height: 520px)').matches; }

  _toast(msg, type = 'info') { this.g.ui.toast(msg, type); }
}
