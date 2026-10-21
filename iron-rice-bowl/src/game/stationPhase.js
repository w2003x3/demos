// 「大站轉乘補貨」中段:餐服員在臺北站下車,穿過 B1 穿堂(迷宮般的地下街)到便當交接點領取補貨,
// 再趕到指定月台的上車口,搭上下一班列車。限時內完成才能接續後段的車上販售。
// 場景沿用車站巡覽(src/world/stations/taipei.js),移動、樓梯、碰撞與鏡頭同 StationExplorePhase。
import * as THREE from 'three';
import { StationExplorePhase } from './stationExplorePhase.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class StationPhase extends StationExplorePhase {
  constructor(game, cfg) {
    super(game, { ...cfg, station: cfg.station || 'taipei', variant: cfg.variant || 'normal', title: '大站轉乘' });
    this.timeLimit = cfg.timeLimit || 180;
  }

  prepTitle() { return { title: '臺北站轉乘・場景載入中', sub: '下車 → 領便當 → 換月台', go: '下車' }; }
  prepItems() {
    const c = this.cfg;
    return [
      { id: 'a', name: `領取補貨(${c.pickup?.track || '1B'} 月台交接點)`, price: 0, desc: `${c.pickup?.trainNo || ''} 送來的便當:${Object.entries(c.pickup?.items || {}).map(([k, v]) => `${k === 'pork' ? '排骨' : k === 'chicken' ? '雞腿' : k} ${v}`).join('、')}`, dishes: [] },
      { id: 'b', name: `趕上 ${c.departTrack || '2A'} 月台的列車`, price: 0, desc: `限時 ${this.timeLimit} 秒;B1 穿堂通道錯綜複雜,看箭頭方向走`, dishes: [] },
    ];
  }

  async init() {
    await super.init();
    // 交接點與上車口:取 B1 的兩個出口位置(彼此距離最遠),起點在中央通道閘門
    const b1 = this.st.exits.filter((e) => e.floor === 'B1');
    const start = { x: 0, z: 4 };
    b1.sort((a, b) => Math.hypot(b.x - start.x, b.z - start.z) - Math.hypot(a.x - start.x, a.z - start.z));
    const pick = b1[1] || b1[0], dep = b1.reduce((best, e) => (Math.hypot(e.x - pick.x, e.z - pick.z) > Math.hypot(best.x - pick.x, best.z - pick.z) ? e : best), b1[0]);
    this.goals = [
      { kind: 'pickup', name: `${this.cfg.pickup?.track || '1B'} 月台 便當交接點`, floor: 'B1', x: pick.x, z: pick.z },
      { kind: 'depart', name: `${this.cfg.departTrack || '2A'} 月台 上車口`, floor: 'B1', x: dep.x, z: dep.z },
    ];
    this.gi = 0;
    Object.assign(this.p, { floor: 'B1', x: start.x, z: start.z, y: this.st.floors.B1.y, stair: null });
    this.left = this.timeLimit;
    // 目標標記(發光柱)
    this.marks = this.goals.map((gl, i) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 3, 24, 1, true), new THREE.MeshBasicMaterial({ color: i ? '#2fb36b' : '#ffb428', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
      m.position.set(gl.x, this.st.floors[gl.floor].y + 1.5, gl.z);
      this.root.add(m);
      return m;
    });
    // 補貨箱(領到後拿在手上)
    this.crate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.4), new THREE.MeshStandardMaterial({ color: '#b23a2a', roughness: 0.6 }));
    this.crate.position.set(0.35, 1.0, 0); this.crate.visible = false;
    this.me.add(this.crate);
  }

  begin() {
    this.g.ui.showHud(false);
    this.el.classList.remove('pre');
    this.g.ui.toast(`下車了!先到「${this.goals[0].name}」領便當,${this.timeLimit} 秒內趕到「${this.goals[1].name}」`, 'info');
    this.g.voice.talk('att_station_restock');
  }

  update(dt) {
    const r = super.update(dt);
    if (r) return { success: false, reason: '放棄轉乘' };
    this.left -= dt;
    const gl = this.goals[this.gi], P = this.p;
    this.marks.forEach((m, i) => { m.visible = i >= this.gi; m.rotation.y += dt; });
    if (gl && P.floor === gl.floor && !P.stair && Math.hypot(P.x - gl.x, P.z - gl.z) < 2.2) {
      if (gl.kind === 'pickup') {
        this.gi = 1; this.crate.visible = true;
        this.g.voice.talk('att_vendor');
        this.g.ui.toast('領到便當補貨了!快去上車口', 'good');
        this.g.sfx.ok();
      } else {
        this.g.sfx.ok();
        return { success: true, kind: 'transfer', reason: null, timeLeft: Math.round(this.left), careerDelta: {} };
      }
    }
    if (this.left <= 0) return { success: false, kind: 'transfer', reason: '來不及趕上列車,補貨失敗。', careerDelta: { failures: 1 } };
    return null;
  }

  // ---------------------------------------------------------------- 介面:目標、方向箭頭、倒數
  _buildHud() {
    const el = this.el = document.createElement('div');
    el.className = 'k-hud pre s-hud ch-hud';
    el.innerHTML = `
      <div class="s-card"><b data-s="name"></b><span data-s="floor"></span><em data-s="role">餐服員・轉乘補貨</em></div>
      <div class="ch-top"><div class="ch-time" data-s="time"></div><div class="ch-goal" data-s="goal"></div></div>
      <div class="ch-radar"><i data-s="arrow">➤</i><span data-s="foe"></span></div>
      <div class="k-prompt" data-s="prompt"><span><kbd>WASD</kbd> 移動</span><span><kbd>Shift</kbd> 跑</span><span>拖曳 轉視角</span><span><kbd>V</kbd> 視角</span></div>
      <div class="k-touch"><div class="k-pad"><button data-hold="ArrowUp" class="u">▲</button><button data-hold="ArrowLeft" class="l">◀</button>
        <button data-hold="ArrowRight" class="r">▶</button><button data-hold="ArrowDown" class="d">▼</button></div>
        <button class="k-f" data-key="KeyV">V<small>視角</small></button><button class="k-mini" data-key="KeyP">⚙</button></div>`;
    this.g.ui.root.appendChild(el);
    this.$ = (k) => el.querySelector(`[data-s="${k}"]`);
  }
  _renderList() {}
  _cycleVariant() {}

  _hud() {
    if (!this.goals) return;
    const P = this.p, gl = this.goals[this.gi];
    const set = (k, v) => { const e = this.$(k); if (e && e.textContent !== v) e.textContent = v; };
    set('name', this.st.name);
    set('floor', P.stair ? '樓梯' : P.floor);
    const t = Math.max(0, Math.ceil(this.left));
    set('time', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    this.$('time').classList.toggle('warn', t <= 30);
    set('goal', gl ? `${this.gi ? '② 趕到' : '① 領取補貨:'}${gl.name}` : '');
    if (gl) {
      const yaw = this.cam.yaw, dx = gl.x - P.x, dz = gl.z - P.z;
      const ang = Math.atan2(dx * Math.cos(yaw) + dz * Math.sin(yaw), dx * Math.sin(yaw) - dz * Math.cos(yaw));
      this.$('arrow').style.transform = `rotate(${(ang * 180 / Math.PI - 90).toFixed(1)}deg)`;
      set('foe', `${esc(gl.name)} ${Math.round(Math.hypot(dx, dz))} m${gl.floor !== P.floor ? `(在 ${gl.floor})` : ''}`);
    }
  }
}
