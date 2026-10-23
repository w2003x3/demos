// 外牆攀爬:四肢(Q 左手、E 右手、Z 左腳、C 右腳)按住=放開伸展,放開按鍵=抓住。
// 四肢同時放開 → 墜落;墜落時 5 秒心算題,答對開降落傘。
import * as THREE from 'three';
import { towerSections, CROWN_Y, SPIRE_TOP, BASE_HW0, floorAtY, ROOF_Y } from '../config.js';
import { createCharacter, poseIdle, poseWalk, poseCheer, resetPose } from '../world/character.js';
import { OrbitCam, buildParachute } from './common.js';
import { askQuiz, fmtTime } from '../ui/ui.js';

const LIMBS = [
  { id: 'LH', key: 'KeyQ', label: 'Q', name: '左手', hand: true, side: -1 },
  { id: 'RH', key: 'KeyE', label: 'E', name: '右手', hand: true, side: 1 },
  { id: 'LF', key: 'KeyZ', label: 'Z', name: '左腳', hand: false, side: -1 },
  { id: 'RF', key: 'KeyC', label: 'C', name: '右腳', hand: false, side: 1 }
];
const HAND_OFF = 0.85, FOOT_OFF = -0.95; // 預設相對身體(髖部)高度
const REACH = 4.2; // 伸展速度 m/s
const clamp = THREE.MathUtils.clamp;

function sections() {
  const s = towerSections();
  s.push({ name: '塔尖', y0: CROWN_Y, y1: SPIRE_TOP, hw0: 3.6, hw1: 0.6, floors: [101, 101] });
  return s;
}

export class ClimbMode {
  constructor(game) {
    this.g = game;
    this.secs = sections();
    this.char = createCharacter({ shirt: 0xe2553b, pants: 0x2b3a4e, helmet: 0xf2c12e, harness: true, gloves: 0x333333, longSleeve: true, shoes: 0x3a2a20 });
    this.char.root.rotation.order = 'YXZ';
    this.chute = buildParachute();
    this.chute.visible = false;
    this.cam = new OrbitCam(game.camera, { dist: 7, min: 3, max: 60, yawLimit: 1.35, pitch: 0.12, pitchMin: -0.5, pitchMax: 1.2 });
    this.views = [
      { name: '跟隨', yaw: 0, pitch: 0.12, dist: 7 },
      { name: '側面', yaw: 1.2, pitch: 0.1, dist: 9 },
      { name: '遠景', yaw: 0.6, pitch: 0.22, dist: 45 },
      { name: '俯瞰', yaw: 0, pitch: 1.1, dist: 14 },
      { name: '仰望', yaw: 0.15, pitch: -0.45, dist: 10 }
    ];
    this.view = 0;
  }

  setView(i) { this.view = i; this.cam.preset(this.views[i]); }

  faceZ(s, y) {
    const S = this.secs[s];
    const t = clamp((y - S.y0) / (S.y1 - S.y0), 0, 1);
    return S.hw0 + (S.hw1 - S.hw0) * t;
  }
  lean(s) { const S = this.secs[s]; return Math.atan((S.hw1 - S.hw0) / (S.y1 - S.y0)); }
  latLimit(s, y) { return Math.max(0.35, this.faceZ(s, y) * (s === this.secs.length - 1 ? 0.5 : 0.62)); }

  enter() {
    const g = this.g;
    g.scene.add(this.char.root, this.chute);
    g.interiors.setActive(null);
    this.time = 0;
    this.falls = 0;
    this.checkpoint = -1; // -1 = 地面
    this.fwWarnT = 0;
    this.gust = { t: 20 + Math.random() * 15, phase: 'idle', k: 0, dir: 1 };
    this.buildHud();
    this.toLedge(-1);
    this.cam.first = true;
    this.setView(this.view);
    g.audio.say('climb_start');
    g.ui.subtitle('攀爬開始。安全繩已扣好,抓穩每一節竹節外牆。');
    this.fwHit = (p, n) => this.onFirework(p, n);
    g.fireworks.listeners.push(this.fwHit);
  }
  exit() {
    const g = this.g;
    g.scene.remove(this.char.root, this.chute);
    g.timeScale = 1;
    g.fireworks.listeners = g.fireworks.listeners.filter((f) => f !== this.fwHit);
    g.audio.setWind(0);
  }

  buildHud() {
    const ui = this.g.ui;
    const marks = [['35F', 35], ['88F', 88], ['91F', 91], ['101F', 101]].map(([l, f]) => `<span class="mark" style="bottom:${((f - 1) * 4.3) / 508 * 100}%">${l}</span>`).join('');
    ui.hud(`
      <div class="pnl tl" style="width:250px;display:flex;flex-direction:column;gap:8px">
        <div class="small">目前高度</div>
        <div style="display:flex;align-items:baseline;gap:6px"><span class="big" style="font-size:52px" id="c-h">0</span><span class="small" style="font-size:16px">m / 508 m</span></div>
        <div class="kv"><span id="c-f">1F</span><span id="c-s" style="color:var(--gold)">基座</span></div>
        <div class="kv small"><span>計時 <b class="num" id="c-t" style="color:var(--ink);font-size:16px">00:00.00</b></span><span id="c-fl">墜落 0</span></div>
      </div>
      <div class="pnl bl" style="width:300px;display:flex;flex-direction:column;gap:10px">
        <div class="kv"><span>握力</span><span class="num" id="c-gv" style="font-size:18px">100%</span></div>
        <div class="meter"><i id="c-g" style="width:100%"></i></div>
        <div class="kv small"><span id="c-w">風速 4 m/s</span><span id="c-st">四肢抓牢</span></div>
        <div class="limbs" aria-label="四肢狀態">
          ${LIMBS.map((l) => `<div class="limb hold" id="l-${l.id}" data-code="${l.key}" role="button" aria-label="${l.name}">${l.label}<small>${l.name}</small></div>`).join('')}
        </div>
        <div class="small desk-only">按住鍵 = 放開那一肢往上伸 · <kbd>A</kbd><kbd>D</kbd> 左右 · <kbd>S</kbd> 往下 · <kbd>Shift</kbd> 貼牆</div>
      </div>
      <div class="alt-rail"><span class="num small" style="color:var(--gold)">508</span><div class="track"><div class="fill" id="c-alt" style="height:0%"></div>${marks}</div><span class="num small">0</span></div>
      <div class="dpad touch" style="left:auto;right:16px;bottom:16px">
        <span></span><button data-code="KeyW" aria-label="開始">▲</button><span></span>
        <button data-code="KeyA" aria-label="左">◀</button><button data-code="ShiftLeft" aria-label="貼牆">貼</button><button data-code="KeyD" aria-label="右">▶</button>
      </div>`);
    // 觸控:四肢與方向按鈕
    ui.hudEl.querySelectorAll('[data-code]').forEach((el) => {
      const code = el.dataset.code;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.g.input.virtual(code, true); });
      const up = () => this.g.input.virtual(code, false);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('pointercancel', up);
    });
  }

  /** 站上平台(s = 剛爬完的段落索引;-1 為地面)。 */
  toLedge(s) {
    const ns = s + 1;
    this.s = ns;
    this.state = 'ledge';
    this.grip = this.grip ?? 100;
    const y = s < 0 ? 0 : this.secs[s].y1;
    this.ledgeY = y;
    this.body = new THREE.Vector3(this.body ? clamp(this.body.x, -3, 3) : 0, y, this.faceZ(ns, y + 0.5) + 1.1);
    this.checkpoint = s;
    this.char.root.rotation.set(0, Math.PI, 0);
  }

  startWall() {
    const s = this.s;
    const y = this.ledgeY + 0.95;
    this.state = 'wall';
    this.bx = clamp(this.body.x, -this.latLimit(s, y), this.latLimit(s, y));
    this.by = y;
    this.limbs = LIMBS.map((l) => ({ ...l, x: this.bx + l.side * (l.hand ? 0.32 : 0.2), y: y + (l.hand ? HAND_OFF : FOOT_OFF + 0.1), held: true }));
  }

  fall(reason, vel) {
    const g = this.g;
    if (this.state === 'falling' || this.state === 'chute' || this.state === 'crash') return;
    this.falls++;
    const pos = this.worldBody();
    this.fallPos = pos.clone();
    this.fallVel = vel || new THREE.Vector3(0, 1.5, 5.5);
    this.fallSpin = (Math.random() - 0.5) * 3;
    g.audio.slip();
    g.audio.whoosh();
    g.ui.banner(reason, true, 2.5);
    const h = pos.y;
    if (h < 15) {
      this.state = 'smallfall';
      return;
    }
    this.state = 'falling';
    g.audio.say('fall');
    // 慢動作 + 心算題
    g.timeScale = 0.12;
    askQuiz(g.ui, g.audio, h / 508, 5).then((ok) => {
      g.timeScale = 1;
      if (this.g.mode !== this) return;
      if (ok) {
        this.state = 'chute';
        this.chute.visible = true;
        this.chute.scale.setScalar(0.05);
        this.fallVel.set(this.fallVel.x * 0.3, Math.min(this.fallVel.y, -10), 4);
        g.audio.chute();
        g.audio.say('chute_ok');
        g.ui.banner('降落傘打開了!用 A / D 控制方向', false, 3);
      } else {
        this.state = 'crash';
        g.audio.say('chute_fail');
        g.ui.banner('降落傘打開失敗!', true, 3);
      }
    });
  }

  onFirework(p, n) {
    if (this.state !== 'wall' && this.state !== 'ledge') return;
    const b = this.worldBody();
    const d = b.distanceTo(p);
    if (d < 7 && Math.random() < 0.65) {
      this.g.audio.say('fw_hit');
      const v = n.clone().multiplyScalar(14);
      v.y = 6;
      v.x += (b.x - p.x) * 1.5;
      this.fall('被煙火炸飛了!', v);
    }
  }

  worldBody() {
    if (this.state === 'wall') return new THREE.Vector3(this.bx, this.by, this.faceZ(this.s, this.by) + 0.42);
    if (this.state === 'falling' || this.state === 'chute' || this.state === 'crash' || this.state === 'smallfall') return this.fallPos.clone();
    return new THREE.Vector3(this.body.x, this.body.y + 0.95, this.body.z);
  }

  update(dt, rawDt) {
    const g = this.g, input = g.input, ui = g.ui;
    if (['wall', 'ledge', 'mantle'].includes(this.state)) this.time += dt;
    const st = this.state;
    if (st === 'ledge') this.updateLedge(dt);
    else if (st === 'mantle') this.updateMantle(dt);
    else if (st === 'wall') this.updateWall(dt);
    else if (st === 'falling' || st === 'crash' || st === 'chute' || st === 'smallfall') this.updateFall(dt);
    else if (st === 'summit') { poseCheer(this.char, g.t); }

    // 煙火預警
    if ((st === 'wall' || st === 'ledge') && g.fireworks.active) {
      const b = this.worldBody();
      const near = g.fireworks.upcoming(2.2).some((u) => u.p.distanceTo(b) < 9);
      this.fwWarnT -= rawDt;
      if (near && this.fwWarnT <= 0) {
        this.fwWarnT = 6;
        g.audio.say('fw_warn');
        ui.banner('附近即將施放煙火!快往旁邊移動!', true, 2);
      }
    }

    // 攝影機
    this.cam.handle(input);
    const target = this.worldBody();
    const camBase = this.state === 'chute' || this.state === 'crash' || this.state === 'falling' ? this.cam.dist + 8 : undefined;
    this.cam.update(rawDt, target, 0, camBase);
    if (this.state === 'wall' || this.state === 'ledge' || this.state === 'mantle') {
      // 不讓攝影機穿進大樓
      const cz = this.cam.cam.position;
      const minZ = this.faceZ(Math.min(this.s, this.secs.length - 1), cz.y) + 0.8;
      if (Math.abs(cz.x) < minZ + 2 && cz.z < minZ) cz.z = minZ;
      this.cam.cam.lookAt(this.cam.smooth);
    }
    if (g.camera.position.y < 1.5) g.camera.position.y = 1.5;
    g.focusShadow(target);
    const hgt = THREE.MathUtils.clamp(target.y, 0, 508);
    g.audio.setWind(clamp(0.1 + hgt / 600 + (this.gust.phase === 'blow' ? 0.4 : 0), 0, 1));

    // HUD
    ui.set('c-h', Math.round(hgt));
    ui.set('c-f', hgt > ROOF_Y ? (hgt > CROWN_Y ? '塔尖' : '頂冠') : `${floorAtY(hgt)}F`);
    ui.set('c-s', this.secs[Math.min(this.s, this.secs.length - 1)].name);
    ui.set('c-t', fmtTime(this.time));
    ui.set('c-fl', `墜落 ${this.falls}`);
    ui.set('c-gv', `${Math.round(this.grip)}%`);
    ui.style('c-g', 'width', `${this.grip}%`);
    ui.style('c-g', 'background', this.grip < 30 ? 'var(--danger)' : this.grip < 60 ? 'var(--gold)' : 'var(--jade)');
    ui.style('c-alt', 'height', `${(hgt / 508) * 100}%`);
    ui.danger(this.state === 'wall' ? clamp((40 - this.grip) / 40, 0, 1) : 0);
    if (this.limbs) for (const l of this.limbs) {
      const el = ui.q('#l-' + l.id);
      if (el) el.className = 'limb ' + (this.state === 'wall' ? (l.held ? 'hold' : 'free') : 'hold');
    }
    return null;
  }

  updateLedge(dt) {
    const g = this.g, input = g.input;
    this.grip = Math.min(100, this.grip + 30 * dt);
    if (input.is('KeyA')) this.body.x -= 2 * dt;
    if (input.is('KeyD')) this.body.x += 2 * dt;
    this.body.x = clamp(this.body.x, -this.latLimit(this.s, this.ledgeY + 1), this.latLimit(this.s, this.ledgeY + 1));
    const moving = input.is('KeyA', 'KeyD');
    if (moving) poseWalk(this.char, g.t * 7, 0.2); else poseIdle(this.char, g.t);
    this.char.root.position.copy(this.body);
    this.char.root.rotation.set(0, Math.PI, 0);
    const label = this.s === 0 ? '地面 · 101 南面' : `${this.secs[this.s - 1].name}頂端平台`;
    g.ui.prompt(`${label} · 握力恢復中 — 按 <kbd>W</kbd> 或任一肢體鍵開始攀爬`);
    if (input.hit('KeyW', 'KeyQ', 'KeyE', 'KeyZ', 'KeyC', 'Space')) {
      g.ui.prompt('');
      this.startWall();
    }
  }

  updateMantle(dt) {
    const m = this.mantle;
    m.t += dt;
    const k = clamp(m.t / 1.6, 0, 1);
    const up = clamp(k / 0.45, 0, 1);
    const walk = clamp((k - 0.45) / 0.55, 0, 1);
    const y = THREE.MathUtils.lerp(m.y0, m.ledgeY, up * up * (3 - 2 * up));
    const z = THREE.MathUtils.lerp(m.z0, m.zEnd, walk);
    this.body.set(m.x, y, z);
    this.char.root.position.copy(this.body);
    this.char.root.rotation.set(0, Math.PI, 0);
    if (up < 1) { resetPose(this.char); this.char.arms.L.upper.rotation.x = this.char.arms.R.upper.rotation.x = -2.2 + up; this.char.legs.L.thigh.rotation.x = -1.2 * up; this.char.legs.L.knee.rotation.x = 1.4 * up; }
    else poseWalk(this.char, m.t * 8, 0.25);
    if (k >= 1) {
      const s = m.s;
      this.toLedge(s);
      this.body.set(m.x, m.ledgeY, m.zEnd);
      const g = this.g;
      if (s === this.secs.length - 3) { g.audio.say('climb_91'); g.ui.banner('抵達 91F 室外觀景台!', false, 3); }
      else { g.audio.say('climb_ledge'); g.ui.banner(`${this.secs[s].name}完成 · 平台休息`, false, 2.5); }
    }
  }

  updateWall(dt) {
    const g = this.g, input = g.input, s = this.s, S = this.secs[s];
    const brace = input.is('ShiftLeft', 'ShiftRight');
    const lat = (input.is('KeyD') ? 1 : 0) - (input.is('KeyA') ? 1 : 0);
    const down = input.is('KeyS');
    // 放開/抓住
    for (const l of this.limbs) {
      const want = input.is(l.key) && !brace;
      if (want && l.held) { l.held = false; }
      else if (!want && !l.held) { l.held = true; this.grip -= 0.4; g.audio.grab(); }
      if (!l.held) {
        // 伸展
        const top = s === this.secs.length - 1 ? SPIRE_TOP + 0.3 : S.y1;
        l.y += (down ? -REACH * 0.6 : REACH) * dt;
        l.x += lat * 1.6 * dt;
        const rel = l.y - this.by;
        if (l.hand) l.y = this.by + clamp(rel, 0.15, 1.85);
        else l.y = this.by + clamp(rel, -1.25, -0.05);
        l.y = Math.min(l.y, l.hand ? top : top - 0.6);
        l.y = Math.max(l.y, S.y0 - 0.2);
        l.x = clamp(l.x, this.bx + l.side * 0.05 - 0.75, this.bx + l.side * 0.05 + 0.75);
        const lim = this.latLimit(s, l.y);
        l.x = clamp(l.x, -lim, lim);
      }
    }
    const held = this.limbs.filter((l) => l.held);
    if (held.length === 0) {
      g.audio.say('limbs_all');
      this.fall('四肢同時放開了!');
      return;
    }
    // 身體跟著抓住的肢體移動
    let ty = 0, tx = 0;
    for (const l of held) { ty += l.y - (l.hand ? HAND_OFF : FOOT_OFF); tx += l.x - l.side * (l.hand ? 0.32 : 0.2); }
    ty /= held.length; tx /= held.length;
    const k = 1 - Math.pow(0.004, dt);
    this.by += (ty - this.by) * k;
    this.bx += (tx - this.bx) * k;

    // 握力
    const lean = this.lean(s);
    const over = lean > 0.01 ? 1.35 : lean < -0.01 ? 0.75 : 1;
    const rate = [0, -12, -2.5, 1, 9][held.length];
    this.grip += (rate < 0 ? rate * over : rate / over) * dt;
    // 陣風
    const G = this.gust;
    G.t -= dt;
    if (G.phase === 'idle' && G.t <= 0) { G.phase = 'warn'; G.t = 2; g.audio.say('climb_wind'); g.ui.banner('強風來襲!按住 Shift 貼緊牆面!', true, 2); }
    else if (G.phase === 'warn' && G.t <= 0) { G.phase = 'blow'; G.t = 3.2; G.dir = Math.random() < 0.5 ? -1 : 1; }
    else if (G.phase === 'blow') {
      if (!brace) {
        this.grip -= (held.length < 4 ? 30 : 16) * dt;
        for (const l of this.limbs) if (!l.held) l.x += G.dir * 1.2 * dt;
      }
      if (G.t <= 0) { G.phase = 'idle'; G.t = 18 + Math.random() * 25 - Math.min(10, this.by / 50); }
    }
    g.ui.set('c-w', G.phase === 'blow' ? `陣風 ${Math.round(16 + this.by / 25)} m/s` : `風速 ${Math.round(4 + this.by / 40)} m/s`);
    g.ui.set('c-st', this.grip < 35 && held.length < 4 ? '握力低!四肢抓牢可恢復' : brace ? '貼緊牆面' : held.length === 4 ? '四肢抓牢' : held.length === 1 ? '只剩一肢!' : `${held.length} 肢抓住`);
    this.grip = clamp(this.grip, 0, 100);
    if (this.grip <= 0) { this.fall('握力耗盡,手滑了!'); return; }

    // 角色擺位與姿勢
    const fz = this.faceZ(s, this.by);
    this.char.root.position.set(this.bx, this.by - 0.95, fz + 0.4);
    this.char.root.rotation.set(-lean, Math.PI, 0);
    this.poseLimbs(brace);
    if (s === this.secs.length - 1 && this.by > SPIRE_TOP - 2.6) { this.summit(); return; }
    // 翻上平台
    const handsTop = this.limbs.filter((l) => l.hand && l.held && l.y >= S.y1 - 0.05).length === 2;
    if (handsTop && this.by > S.y1 - 1.6 && s < this.secs.length - 1) {
      const next = this.secs[s + 1];
      this.state = 'mantle';
      this.limbs = null;
      this.mantle = { t: 0, s, x: this.bx, y0: this.by - 0.95, ledgeY: S.y1, z0: fz + 0.4, zEnd: Math.min(S.hw1 - 0.6, next.hw0 + 1.1) };
      this.body = new THREE.Vector3(this.bx, this.by - 0.95, fz + 0.4);
    }
  }

  poseLimbs(brace) {
    const c = this.char;
    resetPose(c);
    for (const l of this.limbs) {
      const dy = l.y - this.by, dx = (l.x - this.bx) * -1; // 角色面向牆,世界 +X 為角色右側
      if (l.hand) {
        const f = clamp((dy - 0.2) / 1.6, 0, 1);
        const a = l.side < 0 ? c.arms.L : c.arms.R;
        a.upper.rotation.x = -(1.9 + 1.05 * f);
        a.upper.rotation.z = (l.side < 0 ? 1 : -1) * 0.3 + dx * 0.6;
        a.elbow.rotation.x = -(1 - f) * 1.3 - 0.12;
      } else {
        const f = clamp((dy + 1.25) / 1.2, 0, 1);
        const lg = l.side < 0 ? c.legs.L : c.legs.R;
        lg.thigh.rotation.x = -(0.15 + 1.25 * f);
        lg.thigh.rotation.z = (l.side < 0 ? 1 : -1) * 0.22 + dx * 0.4;
        lg.knee.rotation.x = 0.25 + 1.7 * f;
        lg.ankle.rotation.x = 0.4;
      }
    }
    c.spine.rotation.x = brace ? 0.25 : 0.1;
    c.neck.rotation.x = -0.55;
  }

  summit() {
    const g = this.g;
    this.state = 'summit';
    this.limbs = null;
    this.body = new THREE.Vector3(this.bx, SPIRE_TOP - 0.2, 0.5);
    this.char.root.position.set(0, SPIRE_TOP + 0.1, 0);
    this.char.root.rotation.set(0, Math.PI, 0);
    g.audio.say('climb_top');
    g.audio.cheer();
    const best = g.store.get('climbBest', null);
    const isBest = !best || this.time < best;
    if (isBest) g.store.set('climbBest', this.time);
    setTimeout(() => this.result('登頂成功!', `你站在 508 公尺的台北101 塔尖${g.fireworks.active ? ',腳下是跨年煙火' : ''}。`, [
      ['用時', fmtTime(this.time)], ['墜落次數', this.falls], ['最佳紀錄', fmtTime(isBest ? this.time : best)], ['高度', '508 m']
    ], false), 2500);
  }

  updateFall(dt) {
    const g = this.g, v = this.fallVel, p = this.fallPos;
    const c = this.char;
    if (this.state === 'chute') {
      this.chute.scale.setScalar(Math.min(1, this.chute.scale.x + dt * 2.5));
      const steer = (g.input.is('KeyD') ? 1 : 0) - (g.input.is('KeyA') ? 1 : 0);
      v.y += (-5 - v.y) * Math.min(1, dt * 2);
      v.x += (steer * 4 - v.x) * Math.min(1, dt);
      v.z += (4 - v.z) * Math.min(1, dt * 0.5);
      p.addScaledVector(v, dt);
      this.chute.position.copy(p).add(new THREE.Vector3(0, -0.9, 0));
      this.chute.rotation.z = -steer * 0.25;
      c.root.position.set(p.x, p.y - 0.95, p.z);
      c.root.rotation.set(0, Math.PI + steer * 0.3, 0);
      resetPose(c);
      c.arms.L.upper.rotation.x = c.arms.R.upper.rotation.x = -2.7;
      c.arms.L.upper.rotation.z = 0.3; c.arms.R.upper.rotation.z = -0.3;
      c.legs.L.thigh.rotation.x = -0.3;
      if (p.y <= 1) {
        p.y = 1;
        this.chute.visible = false;
        this.state = 'landed';
        g.audio.say('landed');
        poseIdle(c, 0);
        c.root.position.y = 0;
        this.result('安全降落', '降落傘帶你平安回到地面。', [
          ['用時', fmtTime(this.time)], ['墜落次數', this.falls], ['最高到達', `${Math.round(this.fallPos0 ?? 0)} m`], ['檢查點', this.checkpoint < 0 ? '地面' : this.secs[this.checkpoint].name]
        ], true);
      }
      return;
    }
    // 自由落體
    v.y -= 9.8 * dt;
    v.multiplyScalar(Math.pow(0.995, dt * 60));
    p.addScaledVector(v, dt);
    this.fallPos0 = Math.max(this.fallPos0 ?? 0, p.y);
    c.root.position.set(p.x, p.y - 0.95, p.z);
    c.root.rotation.x += this.fallSpin * dt;
    c.root.rotation.y += this.fallSpin * 0.5 * dt;
    poseCheer(c, g.t * 2);
    if (p.y <= 1) {
      p.y = 1;
      if (this.state === 'smallfall') {
        g.audio.thud();
        g.ui.banner('滑落地面,重新開始', true, 2);
        this.body = new THREE.Vector3(p.x, 0, BASE_HW0 + 1.1);
        this.grip = 70;
        this.toLedge(-1);
        return;
      }
      this.state = 'crashed';
      g.audio.thud();
      g.audio.say('crashed');
      g.ui.fade(0.85);
      c.root.visible = false;
      setTimeout(() => { c.root.visible = true; g.ui.fade(0); }, 1500);
      this.result('挑戰失敗', '降落傘沒有打開,摔落地面。', [
        ['用時', fmtTime(this.time)], ['墜落次數', this.falls], ['最高到達', `${Math.round(this.fallPos0 ?? 0)} m`], ['檢查點', this.checkpoint < 0 ? '地面' : this.secs[this.checkpoint].name]
      ], true);
    }
  }

  result(title, desc, stats, canRetry) {
    const g = this.g;
    const layer = g.ui.modal(`
      <div class="modal" role="dialog" aria-label="${title}">
        <h2>${title}</h2>
        <div style="color:var(--muted);font-size:15px">${desc}</div>
        <div class="stats">${stats.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('')}</div>
        <div class="row">
          ${canRetry ? `<button class="btn primary" id="r-cp">從${this.checkpoint < 0 ? '地面' : '上個平台'}重來</button>` : ''}
          <button class="btn ${canRetry ? '' : 'primary'}" id="r-new">重新開始</button>
          <button class="btn" id="r-menu">主選單</button>
        </div>
      </div>`);
    const go = (cp) => {
      g.ui.modal('');
      this.fallPos0 = 0;
      this.chute.visible = false;
      this.char.root.visible = true;
      this.grip = 100;
      if (cp == null) { this.time = 0; this.falls = 0; this.body = null; }
      else this.body = null;
      this.toLedge(cp ?? -1);
    };
    layer.querySelector('#r-cp')?.addEventListener('click', () => go(this.checkpoint));
    layer.querySelector('#r-new').addEventListener('click', () => go(null));
    layer.querySelector('#r-menu').addEventListener('click', () => g.showMenu());
    layer.querySelector('button').focus();
  }
}
