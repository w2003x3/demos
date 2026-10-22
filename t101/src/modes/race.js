// 樓梯登高賽:J/K(或 ←/→)左右腳交替,L 拉扶手。心率過高效率下降,補水站按 E。
import * as THREE from 'three';
import { RACES, RACE_STEPS_TOTAL, WATER_FLOORS } from '../config.js';
import { U_PER_FLOOR, stairPath } from '../world/stairwell.js';
import { createCharacter, poseStairs, poseTired, poseCheer, poseIdle } from '../world/character.js';
import { fmtTime } from '../ui/ui.js';

const RIVALS = [
  { name: '林志遠', shirt: 0x1f6fb2, cad: 5.3 },
  { name: '陳雅婷', shirt: 0xd8436b, cad: 5.0, hairLong: true },
  { name: '王凱文', shirt: 0x2e8b57, cad: 4.7 },
  { name: '張佩珊', shirt: 0xf2a33a, cad: 4.5, hairLong: true },
  { name: '黃建宏', shirt: 0x6a4c93, cad: 4.25 },
  { name: 'Mika', shirt: 0x00a6a6, cad: 4.0, hairLong: true },
  { name: '吳俊傑', shirt: 0x8c8c8c, cad: 3.7 }
];
const clamp = THREE.MathUtils.clamp;

export class RaceMode {
  constructor(game) {
    this.g = game;
    this.scene = game.stair.scene;
    this.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 60);
    addEventListener('resize', () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); });
    this.me = createCharacter({ shirt: 0xe2553b, pants: 0x1d2433, shorts: true, bib: '0732', shoes: 0xf2f2f2 });
    this.scene.add(this.me.root);
    this.rivals = RIVALS.map((r, i) => {
      const c = createCharacter({ shirt: r.shirt, pants: 0x1d2433, shorts: true, bib: String(1000 + i * 37), hairLong: r.hairLong, shoes: 0xdddddd });
      this.scene.add(c.root);
      return { ...r, c, lane: (i % 3 - 1) * 0.28, p: 0, phase: Math.random() * 6, fatigue: 0, drink: 0, done: null };
    });
  }

  enter(opts) {
    const g = this.g;
    this.race = RACES.find((r) => r.id === opts.race) || RACES[0];
    this.floors = this.race.to - this.race.from;
    this.p = 0;
    this.target = 0;
    this.lastFoot = null;
    this.hr = 92;
    this.lactate = 0;
    this.stumble = 0;
    this.time = 0;
    this.taps = 0;
    this.cadence = 0;
    this.tapTimes = [];
    this.phase = 0;
    this.drinkT = 0;
    this.state = 'countdown';
    this.cd = 4.2;
    this.halfSaid = false;
    this.paceSaid = 0;
    this.waterSaid = {};
    this.hbT = 0;
    this.finishOrder = [];
    this.rivals.forEach((r) => { r.p = 0; r.fatigue = 0; r.done = null; r.drink = 0; r.cadNow = r.cad * (0.92 + Math.random() * 0.12); });
    g.interiors.setActive(null);
    this.buildHud();
    g.audio.say('race_ready');
    g.ui.subtitle('各就各位,預備。', 2);
  }
  exit() { this.g.ui.big(''); }

  buildHud() {
    const ui = this.g.ui;
    ui.hud(`
      <div class="pnl tc" style="display:flex;align-items:center;gap:22px">
        <div style="text-align:center"><div class="small">計時</div><div class="big" style="font-size:42px" id="r-t">00:00.00</div></div>
        <div style="width:1px;height:42px;background:#3b4654"></div>
        <div style="text-align:center"><div class="small">樓層</div><div class="big" style="font-size:42px;color:var(--jade)"><span id="r-f">1</span><span style="font-size:20px;color:var(--muted)"> / ${this.race.to}F</span></div></div>
        <div style="width:1px;height:42px;background:#3b4654"></div>
        <div style="text-align:center"><div class="small">名次</div><div class="big" style="font-size:42px;color:var(--gold)"><span id="r-r">1</span><span style="font-size:20px;color:var(--muted)"> / 8</span></div></div>
      </div>
      <div class="pnl tl" style="width:240px;display:flex;flex-direction:column;gap:4px">
        <div class="small" style="padding-bottom:4px">即時排名</div>
        <div id="r-board"></div>
      </div>
      <div class="pnl bl" style="width:330px;display:flex;flex-direction:column;gap:10px">
        <div class="kv"><span>心率</span><span class="num" id="r-hr" style="font-size:20px;color:var(--danger)">92 bpm</span></div>
        <div class="zone"><span class="z1"></span><span class="z2"></span><span class="z3"></span><span class="needle" id="r-needle" style="left:0"></span></div>
        <div class="kv small"><span>有氧區</span><span>乳酸閾值</span><span>極限</span></div>
        <div class="kv"><span>已爬階數</span><span class="num" id="r-steps" style="font-size:18px">0 / ${this.race.id === 'full' ? '2,046' : Math.round(RACE_STEPS_TOTAL * this.floors / 90)}</span></div>
        <div class="kv"><span>步頻 · 效率</span><span class="num" id="r-cad" style="font-size:18px">0.0 階/秒 · 100%</span></div>
      </div>
      <div class="br" style="position:absolute;right:16px;bottom:16px;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:auto">
        <div class="keys">
          <div class="key" id="k-L" data-code="KeyJ">J<small>左腳</small></div>
          <div class="key" id="k-R" data-code="KeyK">K<small>右腳</small></div>
          <div class="key" id="k-H" data-code="KeyL" style="font-size:22px">L<small>拉扶手</small></div>
        </div>
        <div class="small desk-only" style="background:rgba(10,14,20,.7);padding:6px 10px;border-radius:8px">左右腳交替(也可用 ← →),同一腳連按會踉蹌 · 補水站按 <kbd>E</kbd></div>
      </div>`);
    ui.hudEl.querySelectorAll('[data-code]').forEach((el) => {
      const code = el.dataset.code;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.g.input.virtual(code, true); });
      const up = () => this.g.input.virtual(code, false);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
    });
  }

  floorNow(p) { return this.race.from + Math.floor(p); }

  tap(foot) {
    const g = this.g;
    if (this.stumble > 0 || this.drinkT > 0) return;
    if (foot === this.lastFoot) {
      this.stumble = 0.45;
      g.audio.step(true);
      g.ui.banner('踉蹌!左右腳要交替', true, 1);
      return;
    }
    this.lastFoot = foot;
    const now = this.time;
    this.tapTimes.push(now);
    while (this.tapTimes.length && now - this.tapTimes[0] > 1.5) this.tapTimes.shift();
    const eff = this.efficiency();
    const rail = g.input.is('KeyL') && stairPath(this.p).onFlight ? 1.18 : 1;
    this.target = Math.min(this.floors, this.target + (eff * rail) / U_PER_FLOOR);
    this.taps++;
    g.audio.step();
  }

  efficiency() { return clamp(1 - this.lactate / 160, 0.45, 1); }

  update(dt, rawDt) {
    const g = this.g, input = g.input, ui = g.ui;
    if (this.state === 'countdown') {
      const prev = Math.ceil(this.cd);
      this.cd -= rawDt;
      const n = Math.ceil(this.cd);
      if (n !== prev && n >= 1 && n <= 3) g.audio.beep();
      ui.big(n <= 3 && n >= 1 ? String(n) : '');
      if (this.cd <= 0) {
        this.state = 'run';
        ui.big('開跑!');
        setTimeout(() => this.state === 'run' && ui.big(''), 800);
        g.audio.beep(true);
        g.audio.say('race_go');
      }
    } else if (this.state === 'run') {
      this.time += dt;
      if (input.hit('KeyJ', 'ArrowLeft')) this.tap('L');
      if (input.hit('KeyK', 'ArrowRight')) this.tap('R');
      this.stumble = Math.max(0, this.stumble - dt);
      // 補水
      const fl = this.floorNow(this.p);
      const u = (this.p - Math.floor(this.p)) * U_PER_FLOOR;
      const atWater = WATER_FLOORS.includes(fl) && u < 3 && fl > this.race.from;
      if (atWater && !this.waterSaid[fl]) { this.waterSaid[fl] = true; g.audio.say('race_water'); }
      if (atWater && this.drinkT <= 0) ui.prompt('補水站 · 按 <kbd>E</kbd> 喝水(降低心率與疲勞)');
      else ui.prompt('');
      if (atWater && input.hit('KeyE') && this.drinkT <= 0) {
        this.drinkT = 1.4;
        this.lactate = Math.max(0, this.lactate - 35);
        this.hr = Math.max(110, this.hr - 18);
        ui.banner('補充水分 · 疲勞下降', false, 1.5);
      }
      this.drinkT = Math.max(0, this.drinkT - dt);
      // 生理:步頻 → 心率 → 乳酸
      this.cadence = this.tapTimes.length / 1.5;
      const hrTarget = 90 + Math.min(this.cadence, 9) * 13 + Math.min(15, this.p * 0.3);
      this.hr += (hrTarget - this.hr) * dt * 0.35;
      this.hr = clamp(this.hr, 70, 205);
      if (this.hr > 172) this.lactate += (this.hr - 172) * 0.12 * dt;
      else this.lactate = Math.max(0, this.lactate - (172 - this.hr) * 0.05 * dt);
      this.lactate = Math.min(this.lactate, 120);
      if (this.hr > 190 && this.time - this.paceSaid > 20) { this.paceSaid = this.time; g.audio.say('race_pace'); ui.banner('心跳太快!放慢節奏', true, 2); }
      this.hbT -= dt;
      if (this.hbT <= 0 && this.hr > 160) { g.audio.heartbeat((this.hr - 160) / 45); this.hbT = 60 / this.hr; }
      if (!this.halfSaid && this.p > this.floors / 2) { this.halfSaid = true; g.audio.say('race_half'); }
      // 位置
      const maxV = 7 / U_PER_FLOOR;
      this.p = Math.min(this.target, this.p + Math.min(maxV * dt, (this.target - this.p) * Math.min(1, dt * 8)));
      if (this.p >= this.floors - 1e-4) this.finish();
    } else if (this.state === 'done') {
      this.time += 0;
    }

    // 對手
    for (const r of this.rivals) {
      if (this.state === 'countdown') break;
      if (r.p >= this.floors) { if (r.done == null) { r.done = this.state === 'run' ? this.time : this.time + 1; this.finishOrder.push(r); } continue; }
      const prog = r.p / 90;
      const fat = 1 - 0.28 * Math.pow(prog, 1.4) - 0.06 * Math.sin(r.p * 0.7 + r.cad);
      if (r.drink > 0) { r.drink -= dt; continue; }
      if (WATER_FLOORS.includes(this.floorNow(r.p)) && (r.p % 1) * U_PER_FLOOR < 0.2 && Math.random() < 0.02) r.drink = 1.2;
      r.p += (r.cadNow * fat * dt) / U_PER_FLOOR;
      r.phase += r.cadNow * fat * dt * Math.PI;
    }

    // 擺位
    this.place(this.me, this.p, 0, this.phase);
    if (this.state === 'run') this.phase = this.p * U_PER_FLOOR * Math.PI;
    if (this.state === 'done') poseTired(this.me, this.g.t);
    else if (this.state === 'countdown') poseIdle(this.me, this.g.t);
    else poseStairs(this.me, this.phase, clamp(this.cadence / 6, 0, 1), input.is('KeyL') && stairPath(this.p).onFlight);
    for (const r of this.rivals) {
      const vis = Math.abs(r.p - this.p) < 1.6;
      r.c.root.visible = vis;
      if (!vis) continue;
      this.place(r.c, Math.min(r.p, this.floors), r.lane, r.phase);
      if (r.p >= this.floors) poseCheer(r.c, this.g.t);
      else if (this.state === 'countdown') poseIdle(r.c, this.g.t + r.cad);
      else poseStairs(r.c, r.phase, 0.6, false);
    }
    this.g.stair.update(this.race.from, this.p);

    // 攝影機:沿路徑跟在後方
    const me = stairPath(this.p, 0);
    const back = stairPath(Math.max(-0.05, this.p - 5 / U_PER_FLOOR), 0.15);
    const cam = this.camera;
    const want = new THREE.Vector3(back.x, back.y + 2.2, back.z);
    if (!this.camInit) { cam.position.copy(want); this.camInit = true; }
    cam.position.lerp(want, 1 - Math.pow(0.001, rawDt));
    cam.position.x = clamp(cam.position.x, -4.4, 4.4);
    cam.position.z = clamp(cam.position.z, -1.3, 1.3);
    cam.lookAt(me.x, me.y + 1.3, me.z);

    // HUD
    const all = [{ name: '你', p: this.p, me: true, done: this.state === 'done' ? this.time : null }, ...this.rivals];
    all.sort((a, b) => (a.done != null && b.done != null ? a.done - b.done : b.p - a.p));
    const rank = all.findIndex((a) => a.me) + 1;
    ui.set('r-t', fmtTime(this.time));
    ui.set('r-f', Math.min(this.race.to, this.floorNow(this.p)));
    ui.set('r-r', rank);
    ui.set('r-hr', `${Math.round(this.hr)} bpm`);
    ui.style('r-needle', 'left', `${clamp((this.hr - 70) / 135, 0, 1) * 100}%`);
    const stepsTotal = this.race.id === 'full' ? RACE_STEPS_TOTAL : Math.round(RACE_STEPS_TOTAL * this.floors / 90);
    ui.set('r-steps', `${Math.round(stepsTotal * this.p / this.floors).toLocaleString()} / ${stepsTotal.toLocaleString()}`);
    ui.set('r-cad', `${this.cadence.toFixed(1)} 階/秒 · ${Math.round(this.efficiency() * 100)}%`);
    const board = ui.q('#r-board');
    if (board && (this._bT = (this._bT || 0) + rawDt) > 0.25) {
      this._bT = 0;
      board.innerHTML = all.slice(0, 6).map((a, i) => `<div class="rank-row ${a.me ? 'me' : ''}"><span class="num" style="width:20px">${i + 1}</span><span style="flex:1">${a.name}</span><span class="num" style="color:var(--muted)">${a.done != null ? '完賽' : this.floorNow(Math.min(a.p, this.floors)) + 'F'}</span></div>`).join('')
        + (rank > 6 ? `<div class="rank-row me"><span class="num" style="width:20px">${rank}</span><span style="flex:1">你</span><span class="num">${this.floorNow(this.p)}F</span></div>` : '');
    }
    const next = this.lastFoot === 'L' ? 'R' : 'L';
    ui.q('#k-L')?.classList.toggle('next', next === 'L');
    ui.q('#k-R')?.classList.toggle('next', next === 'R');
    ui.q('#k-H')?.classList.toggle('on', input.is('KeyL'));
    return { scene: this.scene, camera: this.camera };
  }

  place(c, p, lane, phase) {
    const s = stairPath(p, lane);
    c.root.position.set(s.x, s.y, s.z);
    c.root.rotation.y = s.ry;
    void phase;
  }

  finish() {
    const g = this.g;
    this.state = 'done';
    this.p = this.floors;
    g.ui.prompt('');
    g.audio.say('race_finish');
    g.audio.cheer();
    const rank = this.rivals.filter((r) => r.done != null).length + 1;
    const best = g.store.get('best', {});
    const isBest = !best[this.race.id] || this.time < best[this.race.id];
    if (isBest) { best[this.race.id] = this.time; g.store.set('best', best); }
    setTimeout(() => {
      const layer = g.ui.modal(`
        <div class="modal" role="dialog" aria-label="完賽">
          <h2>${rank === 1 ? '冠軍!' : `第 ${rank} 名完賽`}</h2>
          <div style="color:var(--muted)">${this.race.name} · ${this.race.desc}${isBest ? ' · <b style="color:var(--gold)">新紀錄</b>' : ''}</div>
          <div class="stats">
            <div class="stat"><span>完賽時間</span><b>${fmtTime(this.time)}</b></div>
            <div class="stat"><span>名次</span><b>${rank} / 8</b></div>
            <div class="stat"><span>最佳紀錄</span><b>${fmtTime(isBest ? this.time : best[this.race.id])}</b></div>
            <div class="stat"><span>平均步頻</span><b>${(this.taps / this.time).toFixed(1)}</b></div>
          </div>
          <div class="row">
            <button class="btn primary" id="f-again">再跑一次</button>
            ${this.race.to === 35 ? '<button class="btn" id="f-sbux">去 35F 星巴克</button>' : '<button class="btn" id="f-89">搭電梯到 89F</button>'}
            <button class="btn" id="f-menu">主選單</button>
          </div>
        </div>`);
      layer.querySelector('#f-again').addEventListener('click', () => { g.ui.modal(''); this.enter({ race: this.race.id }); });
      layer.querySelector('#f-sbux')?.addEventListener('click', () => g.startMode('explore', { floor: 35 }));
      layer.querySelector('#f-89')?.addEventListener('click', () => g.startMode('explore', { floor: 89 }));
      layer.querySelector('#f-menu').addEventListener('click', () => g.showMenu());
      layer.querySelector('#f-again').focus();
    }, 1800);
  }
}
