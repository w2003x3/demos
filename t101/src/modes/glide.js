// 創意滑翔賽:打造滑翔翼 → 從 101 頂樓起飛台出發 → 滑得越遠越好。撞到建築物會墜落(心算降落傘)。
import * as THREE from 'three';
import { OPTS, DEFAULT_DESIGN, performance, buildGlider, buildRamp, rampPoint, RAMP } from '../world/glider.js';
import { makeCollider } from '../world/collide.js';
import { createCharacter, poseCheer, poseIdle, resetPose } from '../world/character.js';
import { OrbitCam, buildParachute } from './common.js';
import { askQuiz, fmtTime } from '../ui/ui.js';
import { VIS } from '../ui/tutorial.js';

const clamp = THREE.MathUtils.clamp;
const RHO = 1.225, G = 9.8;
const SKIM = 2.0; // 離樓頂小於這個高度就算擦過
const FALLING = ['falling', 'chute', 'crash', 'tumble'];

export class GlideMode {
  constructor(game) {
    this.g = game;
    this.ramp = buildRamp();
    this.collider = makeCollider(game.city.boxes, game.xinyi ? game.xinyi.solids : []);
    this.chute = buildParachute();
    this.cam = new OrbitCam(game.camera, { dist: 12, min: 4, max: 200, pitch: 0.25, pitchMin: -0.6, pitchMax: 1.4 });
    this.views = [{ name: '追蹤' }, { name: '側面' }, { name: '第一人稱' }, { name: '遠景' }];
    this.view = 0;
    this.design = { ...DEFAULT_DESIGN, ...game.store.get('glider', {}) };
    this.fallChar = createCharacter({ shirt: 0x1d2433, pants: 0x1d2433, helmet: 0xf5c76a, harness: true });
  }

  setView(i) {
    this.view = i;
    const p = [{ yaw: 0, pitch: 0.22, dist: 12 }, { yaw: Math.PI / 2, pitch: 0.1, dist: 14 }, { yaw: 0, pitch: 0, dist: 4 }, { yaw: 0.4, pitch: 0.35, dist: 70 }][i];
    this.cam.preset(p);
  }

  enter() {
    const g = this.g;
    g.scene.add(this.ramp, this.chute);
    g.interiors.setActive(null);
    this.chute.visible = false;
    this.toBuild();
    if (!g.tutorial.seen('glide')) this.tutorial(false);
  }
  exit() {
    const g = this.g;
    g.scene.remove(this.ramp, this.chute, this.fallChar.root);
    if (this.glider) g.scene.remove(this.glider.group);
    g.timeScale = 1;
    g.audio.setWind(0);
    g.camera.fov = 55;
    g.camera.updateProjectionMatrix();
  }

  tutorial(force) {
    this.g.tutorial.pages('glide', [
      { title: '創意滑翔賽', html: '自己打造一架滑翔翼,從 <b>101 頂樓(434 公尺)的起飛台</b>出發,<b>滑翔距離就是成績</b>。前方有大樓時<b>強風會把你吹開</b>;但飛太低<b>擦過樓頂</b>會重心不穩墜落,墜落時要在 <b>10 秒內答對心算</b>才能打開降落傘。' },
      { title: '打造滑翔翼', html: '<ul><li><b>翼型</b>:直翼平衡、後掠翼快、三角翼穩、雙翼慢速飄</li><li><b>翼展</b>:越長滑翔比越好,但越重越難轉彎</li><li><b>材質</b>:碳纖維最輕</li><li><b>尾翼</b>:沒有尾翼阻力小但會晃</li><li><b>造型主題</b>:珍奶號、鳳梨酥號…創意分高,但阻力較大</li></ul>右側會即時顯示<b>滑翔比、速度、穩定度與預估距離</b>。' },
      { title: '飛行操作', visual: VIS.glide, html: '保持在<b>最佳空速</b>附近滑得最遠(HUD 會提示)。拉太多會<b>失速</b>往下掉;按住 <kbd>Space</kbd> 時間加速。飛太低時小心<b>擦過樓頂</b>,保持高度、降落在空地或道路上。' }
    ], { finishLabel: force ? '繼續' : '開始打造' });
  }

  // ───────── 打造 ─────────
  toBuild() {
    const g = this.g;
    this.state = 'build';
    g.timeScale = 1;
    this.chute.visible = false;
    this.fallChar.root.visible = false;
    g.scene.remove(this.fallChar.root);
    this.rebuildGlider();
    this.cam.first = true;
    this.cam.preset({ yaw: 0.9, pitch: 0.25, dist: 11 });
    this.renderBuildUI();
  }

  rebuildGlider() {
    const g = this.g;
    if (this.glider) g.scene.remove(this.glider.group);
    this.glider = buildGlider(this.design);
    g.scene.add(this.glider.group);
    const p = rampPoint(0.22);
    this.glider.group.position.set(p.x, p.y + 1.0, p.z);
    this.glider.group.rotation.set(RAMP.slope, 0, 0);
    this.perf = performance(this.design);
  }

  renderBuildUI() {
    const g = this.g, d = this.design;
    const seg = (key, list) => `<div class="seg wrap" role="group" aria-label="${key}">${list.map((o) => `<button data-k="${key}" data-v="${o.id}" class="${d[key] === o.id ? 'on' : ''}" title="${o.desc || ''}">${o.name}</button>`).join('')}</div>`;
    const best = g.store.get('glideBoard', []);
    g.ui.hud(`
      <div class="pnl build" style="left:16px;top:16px;bottom:16px;width:min(420px,calc(100vw - 32px));display:flex;flex-direction:column;gap:12px;overflow-y:auto">
        <div><div class="kicker" style="font-size:13px;letter-spacing:4px">創意滑翔賽 · 機庫</div><div style="font-size:24px;font-weight:900">打造你的滑翔翼</div></div>
        <label class="field">機名<input id="gd-name" maxlength="10" value="${d.name}"></label>
        <div class="field">翼型${seg('wing', OPTS.wing)}</div>
        <label class="field">翼展 <b class="num" id="gd-spanv">${d.span} m</b><input type="range" id="gd-span" min="6" max="14" step="0.5" value="${d.span}"></label>
        <div class="field">材質${seg('material', OPTS.material)}</div>
        <div class="field">尾翼${seg('tail', OPTS.tail)}</div>
        <div class="field">造型主題${seg('theme', OPTS.theme)}</div>
        <div class="field">顏色<div class="row">${OPTS.colors.map((c) => `<button class="swatch ${d.color === c ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="顏色 ${c}"></button>`).join('')}</div></div>
        <button class="btn primary" id="gd-go" style="min-height:52px;font-size:18px">推上起飛台,出發!</button>
      </div>
      <div class="pnl tr stats-pnl" style="top:72px;width:250px;display:flex;flex-direction:column;gap:8px">
        <div class="small">性能預估</div>
        <div id="gd-stats"></div>
        ${best.length ? `<div class="small" style="margin-top:6px">本機排行榜</div>${best.slice(0, 5).map((b, i) => `<div class="kv small"><span>${i + 1}. ${b.name}</span><b class="num" style="color:var(--gold)">${b.dist} m</b></div>`).join('')}` : ''}
      </div>`);
    const el = g.ui.hudEl;
    el.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { d[b.dataset.k] = b.dataset.v; this.changed(); }));
    el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { d.color = b.dataset.c; this.changed(); }));
    const span = el.querySelector('#gd-span');
    span.addEventListener('input', () => { d.span = Number(span.value); el.querySelector('#gd-spanv').textContent = `${d.span} m`; this.rebuildGlider(); this.drawStats(); g.store.set('glider', d); });
    el.querySelector('#gd-name').addEventListener('change', (e) => { d.name = e.target.value.trim() || '無名號'; this.changed(); });
    el.querySelector('#gd-go').addEventListener('click', () => this.launch());
    this.drawStats();
  }
  changed() { this.g.store.set('glider', this.design); this.rebuildGlider(); this.renderBuildUI(); }
  drawStats() {
    const p = this.perf;
    const bar = (label, v, txt) => `<div class="kv small"><span>${label}</span><span class="num" style="color:var(--ink)">${txt}</span></div><div class="meter"><i style="width:${clamp(v, 0.04, 1) * 100}%"></i></div>`;
    this.g.ui.q('#gd-stats').innerHTML =
      bar('滑翔比', (p.ld - 4) / 10, p.ld.toFixed(1)) +
      bar('最佳空速', (p.vBest - 6) / 16, `${Math.round(p.vBest * 3.6)} km/h`) +
      bar('穩定度', p.stab / 2, p.stab > 1.5 ? '很穩' : p.stab > 1 ? '穩' : '會晃') +
      bar('總重', (p.mass - 70) / 60, `${Math.round(p.mass)} kg`) +
      bar('創意分', p.creat / 5, '★'.repeat(p.creat)) +
      `<div class="kv" style="margin-top:4px"><span>預估距離</span><b class="num" style="font-size:22px;color:var(--gold)">${(p.est / 1000).toFixed(1)} km</b></div>`;
  }

  // ───────── 起飛與飛行 ─────────
  launch() {
    const g = this.g;
    this.state = 'run';
    this.runT = 0;
    this.flightT = 0;
    this.maxV = 0;
    this.cl = this.perf.clBest;
    this.bank = 0;
    this.stallSaid = 0;
    this.result = null;
    g.audio.say('glide_go');
    g.ui.big('3');
    setTimeout(() => this.state === 'run' && g.ui.big('2'), 600);
    setTimeout(() => this.state === 'run' && g.ui.big('1'), 1200);
    setTimeout(() => g.ui.big(''), 2200);
    this.buildFlyHud();
    this.setView(this.view);
  }

  buildFlyHud() {
    const g = this.g;
    g.ui.hud(`
      <div class="pnl tl" style="width:250px;display:flex;flex-direction:column;gap:6px">
        <div class="small">${this.design.name} · 滑翔距離</div>
        <div style="display:flex;align-items:baseline;gap:6px"><span class="big" style="font-size:52px" id="f-d">0</span><span class="small" style="font-size:16px">m</span></div>
        <div class="kv"><span>離地高度</span><span class="num" id="f-h" style="font-size:18px">0 m</span></div>
        <div class="kv small"><span>飛行時間 <b class="num" id="f-t" style="color:var(--ink)">00:00.00</b></span><span id="f-x">×2</span></div>
      </div>
      <div class="pnl bl" style="width:300px;display:flex;flex-direction:column;gap:8px">
        <div class="kv"><span>空速</span><span class="num" id="f-v" style="font-size:20px;color:var(--gold)">0 km/h</span></div>
        <div class="zone" style="height:12px"><span style="position:absolute;left:0;top:0;bottom:0;width:30%;background:#a3412a"></span><span style="position:absolute;left:30%;top:0;bottom:0;width:40%;background:#2f7a80"></span><span style="position:absolute;left:70%;top:0;bottom:0;width:30%;background:#b48a3a"></span><span class="needle" id="f-needle" style="left:50%"></span></div>
        <div class="kv small"><span>太慢(失速)</span><span>最佳</span><span>太快</span></div>
        <div class="kv"><span>下沉率</span><span class="num" id="f-s" style="font-size:18px">0 m/s</span></div>
        <div class="kv"><span>即時滑翔比</span><span class="num" id="f-ld" style="font-size:18px">-</span></div>
      </div>
      <div class="pnl br desk-only small" style="line-height:1.9"><kbd>W</kbd> 壓機頭 · <kbd>S</kbd> 拉機頭 · <kbd>A</kbd><kbd>D</kbd> 轉彎 · 按住 <kbd>Space</kbd> 加速時間</div>
      <div class="dpad touch" style="left:auto;right:16px">
        <span></span><button data-code="KeyW" aria-label="壓機頭">▼</button><span></span>
        <button data-code="KeyA" aria-label="左轉">◀</button><button data-code="Space" aria-label="加速">快</button><button data-code="KeyD" aria-label="右轉">▶</button>
        <span></span><button data-code="KeyS" aria-label="拉機頭">▲</button><span></span>
      </div>`);
    g.ui.hudEl.querySelectorAll('[data-code]').forEach((el) => {
      const code = el.dataset.code;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); g.input.virtual(code, true); });
      const up = () => g.input.virtual(code, false);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
    });
  }

  update(dt, rawDt) {
    const g = this.g, input = g.input;
    const G0 = this.glider.group;
    if (this.state === 'build') {
      this.cam.handle(input);
      this.cam.update(rawDt, G0.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 0);
      g.focusShadow(G0.position);
      return null;
    }
    if (this.state === 'run') {
      // 在起飛台上加速
      this.runT += dt;
      const t = clamp(this.runT < 2.2 ? 0 : (this.runT - 2.2) / 1.8, 0, 1);
      const p = rampPoint(0.22 + t * t * 0.78);
      G0.position.set(p.x, p.y + 1.0, p.z);
      if (t >= 1) {
        this.state = 'fly';
        this.pos = G0.position.clone();
        this.v = 13;
        this.gam = -RAMP.slope;
        this.yaw = 0;
        this.start = new THREE.Vector3(p.x, 0, p.z);
        this.gustT = 0; this.gustDir = 0; this.windCheckT = 0; this.windMsgT = 0; this.windSaid = false;
      }
    } else if (this.state === 'fly') {
      this.fly(dt, input);
    } else if (FALLING.includes(this.state)) {
      this.updateFall(dt);
    } else if (this.state === 'landed') {
      this.v = Math.max(0, this.v - 6 * dt);
      this.pos.x += Math.sin(this.yaw) * this.v * dt;
      this.pos.z += Math.cos(this.yaw) * this.v * dt;
      G0.position.copy(this.pos);
    }
    this.camera(rawDt);
    return null;
  }

  fly(dt, input) {
    const g = this.g, P = this.perf;
    const accel = input.is('Space') ? 6 : 2;
    g.ui.set('f-x', `時間 ×${accel}`);
    const pitchIn = (input.is('KeyS', 'ArrowDown') ? 1 : 0) - (input.is('KeyW', 'ArrowUp') ? 1 : 0);
    const steer = (input.is('KeyD', 'ArrowRight') ? 1 : 0) - (input.is('KeyA', 'ArrowLeft') ? 1 : 0);
    const steps = 4, h = (dt * accel) / steps;
    let stalled = false;
    this.windMsgT -= dt;
    this.windCheckT -= dt;
    if (this.windCheckT <= 0) {
      this.windCheckT = 0.12;
      const wall = this.wallAhead(this.yaw);
      if (wall != null && this.gustT <= 0.3) {
        // 比較左右哪一側比較空,往那邊吹
        const freeL = this.freeDist(this.yaw + 0.7), freeR = this.freeDist(this.yaw - 0.7);
        this.gustDir = freeL >= freeR ? 1 : -1;
        this.gustRate = wall < 30 ? 1.6 : 1.0;
        this.gustT = 1.0;
        if (this.windMsgT <= 0) {
          this.windMsgT = 3;
          g.audio.whoosh();
          g.ui.banner('強風把你吹離大樓!', false, 1.6);
          if (!this.windSaid) { this.windSaid = true; g.audio.say('glide_wind'); }
        }
      }
    }
    for (let s = 0; s < steps; s++) {
      this.flightT += h;
      const wobble = P.stab < 1 ? Math.sin(this.flightT * 2.7) * 0.12 * (1 - P.stab) : 0;
      const target = clamp(P.clBest + pitchIn * 0.6 + wobble, -0.3, P.clmax * 1.25);
      this.cl += (target - this.cl) * Math.min(1, h * 2.5 * P.stab);
      this.bank += (steer * -0.55 - this.bank) * Math.min(1, h * 1.8 * P.stab);
      const q = 0.5 * RHO * this.v * this.v;
      stalled = this.cl > P.clmax;
      const clEff = stalled ? P.clmax * 0.45 : this.cl;
      const L = q * P.S * clEff, D = q * P.S * (P.cd0 + P.k * this.cl * this.cl + (stalled ? 0.15 : 0));
      this.v += (-D / P.mass - G * Math.sin(this.gam)) * h;
      this.v = Math.max(3, this.v);
      this.gam += ((L * Math.cos(this.bank)) / (P.mass * this.v) - (G * Math.cos(this.gam)) / this.v) * h;
      this.gam = clamp(this.gam, -1.4, 0.9);
      this.yaw += ((L * Math.sin(this.bank)) / (P.mass * this.v * Math.max(0.2, Math.cos(this.gam)))) * h;
      if (this.gustT > 0) { this.gustT -= h; this.yaw += this.gustDir * this.gustRate * h; }
      this.pos.x += this.v * Math.cos(this.gam) * Math.sin(this.yaw) * h;
      this.pos.z += this.v * Math.cos(this.gam) * Math.cos(this.yaw) * h;
      this.pos.y += this.v * Math.sin(this.gam) * h;
      this.maxV = Math.max(this.maxV, this.v);
      // 擦過樓頂:離屋頂太近 → 摩擦造成重心不穩
      const roof = this.collider.roofAt(this.pos.x, this.pos.z, 0.8);
      if (roof && this.pos.y > roof[4] - 1.5 && this.pos.y - roof[4] < SKIM) { this.skim(roof, roof[5]); return; }
      // 萬一還是正面撞上(強風來不及吹開)
      const hit = this.collider.hit(this.pos.x, this.pos.y + 0.6, this.pos.z, 1.0);
      if (hit) { this.skim(hit.box || null, hit.name); return; }
      const gy = this.collider.ground(this.pos.x, this.pos.z);
      if (this.pos.y <= gy + 0.3) { this.touchdown(gy); return; }
    }
    if (stalled && this.flightT - this.stallSaid > 6) { this.stallSaid = this.flightT; g.audio.say('glide_stall'); g.ui.banner('失速!壓低機頭(W)加速', true, 2); }
    const G0 = this.glider.group;
    G0.position.copy(this.pos);
    G0.rotation.set(0, 0, 0);
    G0.rotation.order = 'YXZ';
    G0.rotation.set(-this.gam - (this.cl - P.clBest) * 0.25, this.yaw, -this.bank - (this.gustT > 0 ? this.gustDir * 0.35 : 0));
    g.audio.setWind(clamp(this.v / 30, 0.15, 1));
    // HUD
    const dist = this.dist();
    const ui = g.ui;
    ui.set('f-d', Math.round(dist));
    ui.set('f-h', `${Math.round(this.pos.y - this.collider.ground(this.pos.x, this.pos.z))} m`);
    ui.set('f-t', fmtTime(this.flightT));
    ui.set('f-v', `${Math.round(this.v * 3.6)} km/h`);
    ui.style('f-needle', 'left', `${clamp(0.5 + (this.v - P.vBest) / (P.vBest * 1.2), 0, 1) * 100}%`);
    const sink = -this.v * Math.sin(this.gam);
    ui.set('f-s', `${sink.toFixed(1)} m/s`);
    ui.set('f-ld', sink > 0.2 ? (this.v * Math.cos(this.gam) / sink).toFixed(1) : '∞');
  }

  dist() { return Math.hypot(this.pos.x - this.start.x, this.pos.z - this.start.z); }

  /** 沿下滑線往前探測,前方是牆(低於屋頂)時回傳距離。 */
  wallAhead(yaw) {
    const tg = Math.tan(clamp(this.gam, -0.6, 0.3));
    for (const d of [12, 22, 35, 50, 70, 90]) {
      const x = this.pos.x + Math.sin(yaw) * d, z = this.pos.z + Math.cos(yaw) * d, y = this.pos.y + d * tg;
      const hit = this.collider.hit(x, y, z, 2.5);
      if (hit && y < hit.h - 1.5) return d;
    }
    return null;
  }
  freeDist(yaw) {
    const tg = Math.tan(clamp(this.gam, -0.6, 0.3));
    for (let d = 10; d <= 140; d += 10) {
      const x = this.pos.x + Math.sin(yaw) * d, z = this.pos.z + Math.cos(yaw) * d, y = this.pos.y + d * tg;
      const hit = this.collider.hit(x, y, z, 2.5);
      if (hit && y < hit.h - 1.5) return d;
    }
    return 999;
  }

  /** 擦過樓頂:飛行員脫離,先在屋頂上翻滾滑出邊緣,離開屋頂後才開始墜落。 */
  skim(box, name) {
    const g = this.g;
    g.audio.thud();
    g.audio.slip();
    g.audio.say('glide_skim');
    g.ui.banner(`擦過${name === '大樓' ? '大樓樓頂' : name}!重心不穩`, true, 2.5);
    this.fallPos = this.pos.clone();
    this.glider.pilot.root.visible = false;
    this.fallChar.root.visible = true;
    this.fallChar.root.rotation.set(0, 0, 0);
    this.g.scene.add(this.fallChar.root);
    this.wreckV = new THREE.Vector3(Math.sin(this.yaw) * 4, 1, Math.cos(this.yaw) * 4);
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    if (box) {
      // 沿前進方向繼續滑出去(至少 8 m/s),同時往最近的邊緣推
      const e = this.edgeDir(box, this.fallPos);
      this.fallVel = fwd.multiplyScalar(Math.max(8, this.v * 0.8)).addScaledVector(e, 4);
      this.fallVel.y = 0;
      this.tumbleBox = box;
      this.state = 'tumble';
    } else {
      // 撞到 101 本體:往後彈開
      this.fallVel = fwd.multiplyScalar(-6);
      this.fallVel.y = 1;
      this.beginFall();
    }
  }

  /** 從點到盒子最近邊緣的水平方向。 */
  edgeDir(b, p) {
    const d = [[p.x - b[0], -1, 0], [b[2] - p.x, 1, 0], [p.z - b[1], 0, -1], [b[3] - p.z, 0, 1]].sort((a, c) => a[0] - c[0])[0];
    return new THREE.Vector3(d[1], 0, d[2]);
  }

  beginFall() {
    const g = this.g, p = this.fallPos;
    this.state = 'falling';
    const h = p.y - this.collider.ground(p.x, p.z);
    if (h < 15) { this.state = 'crash'; this.lowFall = true; return; }
    this.lowFall = false;
    g.timeScale = Math.min(0.12, Math.sqrt((2 * h) / 9.8) / 12);
    askQuiz(g.ui, g.audio, Math.min(1, h / 434), 10).then((ok) => {
      g.timeScale = 1;
      if (g.mode !== this) return;
      if (ok) {
        this.state = 'chute';
        this.chute.visible = true;
        this.chute.scale.setScalar(0.05);
        this.fallVel.set(this.fallVel.x * 0.3, Math.min(this.fallVel.y, -10), this.fallVel.z * 0.3);
        g.audio.chute();
        g.audio.say('chute_ok');
        g.ui.banner('降落傘打開了!A / D 控制方向', false, 3);
      } else {
        this.state = 'crash';
        g.audio.say('chute_fail');
      }
    });
  }

  touchdown(gy) {
    const g = this.g;
    this.pos.y = gy + 0.3;
    const sink = -this.v * Math.sin(this.gam);
    const soft = sink < 4.5 && this.v < 26;
    this.state = 'landed';
    this.glider.group.rotation.set(0, this.yaw, 0);
    g.audio.thud();
    g.audio.say('glide_land');
    this.finish(soft ? '成功著陸' : '硬著陸(成績仍列入)', this.dist(), true);
  }

  updateFall(dt) {
    const g = this.g, v = this.fallVel, p = this.fallPos, c = this.fallChar;
    // 滑翔翼殘骸往下掉
    const W = this.glider.group;
    this.wreckV.y -= 9.8 * dt;
    W.position.addScaledVector(this.wreckV, dt);
    W.rotation.x += dt * 1.5;
    if (W.position.y < this.collider.ground(W.position.x, W.position.z)) W.visible = false;
    if (this.state === 'tumble') {
      // 在屋頂上翻滾、滑向邊緣
      const b = this.tumbleBox;
      p.addScaledVector(v, dt);
      p.y = b[4] + 0.9;
      c.root.position.set(p.x, p.y - 0.6, p.z);
      c.root.rotation.x += dt * 9;
      c.root.rotation.y = Math.atan2(v.x, v.z);
      poseCheer(c, g.t * 3);
      const inside = p.x > b[0] - 0.8 && p.x < b[2] + 0.8 && p.z > b[1] - 0.8 && p.z < b[3] + 0.8;
      if (!inside) { v.y = 1.5; v.multiplyScalar(0.6); this.beginFall(); }
      return;
    }
    if (this.state === 'chute') {
      this.chute.scale.setScalar(Math.min(1, this.chute.scale.x + dt * 2.5));
      const steer = (g.input.is('KeyD') ? 1 : 0) - (g.input.is('KeyA') ? 1 : 0);
      v.y += (-5 - v.y) * Math.min(1, dt * 2);
      v.x += (steer * 4 - v.x) * Math.min(1, dt);
      v.z *= Math.pow(0.5, dt);
      p.addScaledVector(v, dt);
      this.chute.position.set(p.x, p.y - 0.9, p.z);
      c.root.position.set(p.x, p.y - 0.95, p.z);
      c.root.rotation.set(0, Math.PI, 0);
      resetPose(c);
      c.arms.L.upper.rotation.x = c.arms.R.upper.rotation.x = -2.7;
    } else {
      v.y -= 9.8 * dt;
      p.addScaledVector(v, dt);
      c.root.position.set(p.x, p.y - 0.95, p.z);
      c.root.rotation.x += dt * 2;
      poseCheer(c, g.t * 2);
    }
    // 不會停在其他大樓樓頂:碰到樓頂就被推出邊緣
    const rb = this.collider.roofAt(p.x, p.z, 0.4);
    if (rb && p.y - 1 < rb[4] + 0.2 && p.y - 1 > rb[4] - 3) {
      p.y = rb[4] + 1.2;
      v.y = Math.max(v.y, 0);
      const e = this.edgeDir(rb, p);
      v.x += (e.x * 9 - v.x) * Math.min(1, dt * 6);
      v.z += (e.z * 9 - v.z) * Math.min(1, dt * 6);
      if (this.state === 'chute') this.chute.position.set(p.x, p.y - 0.9, p.z);
      c.root.position.set(p.x, p.y - 0.95, p.z);
      return;
    }
    const gy = this.collider.ground(p.x, p.z);
    if (p.y - 1 <= gy) {
      if (this.state === 'chute') {
        this.state = 'landedChute';
        this.chute.visible = false;
        poseIdle(c, 0);
        c.root.rotation.set(0, 0, 0);
        g.audio.say('landed');
        this.pos = p.clone();
        this.finish('降落傘著陸', this.dist(), true);
      } else if (this.lowFall) {
        this.state = 'landedChute';
        g.audio.thud();
        poseIdle(c, 0);
        c.root.rotation.set(0, 0, 0);
        this.pos = p.clone();
        this.finish('摔落地面(高度不高,成績列入)', this.dist(), true);
      } else {
        this.state = 'crashed';
        g.audio.thud();
        g.audio.say('crashed');
        c.root.visible = false;
        g.ui.fade(0.85);
        setTimeout(() => g.ui.fade(0), 1400);
        this.pos = p.clone();
        this.finish('墜毀 · 成績無效', 0, false);
      }
    }
  }

  camera(rawDt) {
    const g = this.g, input = g.input;
    let target, yaw = 0;
    if ([...FALLING, 'crashed', 'landedChute'].includes(this.state)) {
      target = this.fallPos.clone();
      yaw = this.yaw + Math.PI;
    } else {
      target = this.glider.group.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      yaw = (this.yaw || 0) + Math.PI;
    }
    this.glider.pilot.root.visible = !(this.view === 2 && this.state === 'fly') && ![...FALLING, 'crashed', 'landedChute'].includes(this.state);
    if (this.view === 2 && this.state === 'fly') {
      // 第一人稱:飛行員視角
      const G0 = this.glider.group;
      G0.updateMatrixWorld(true);
      const eye = new THREE.Vector3(0, 0.45, 0.25).applyMatrix4(G0.matrixWorld);
      const fwd = new THREE.Vector3(0, -0.15, 1).applyQuaternion(G0.quaternion);
      g.camera.position.copy(eye);
      g.camera.lookAt(eye.clone().add(fwd));
    } else {
      this.cam.handle(input);
      this.cam.update(rawDt, target, yaw);
      const gy = this.collider.ground(g.camera.position.x, g.camera.position.z);
      if (g.camera.position.y < gy + 2) { g.camera.position.y = gy + 2; g.camera.lookAt(this.cam.smooth); }
    }
    g.focusShadow(target);
  }

  finish(title, dist, valid) {
    const g = this.g;
    if (this.result) return;
    dist = Math.round(dist);
    this.result = { title, dist, valid };
    const board = g.store.get('glideBoard', []);
    const isBest = valid && (!board.length || dist > board[0].dist);
    if (valid && dist > 0) {
      board.push({ name: this.design.name, dist, date: new Date().toISOString().slice(0, 10) });
      board.sort((a, b) => b.dist - a.dist);
      g.store.set('glideBoard', board.slice(0, 10));
    }
    if (isBest) setTimeout(() => g.audio.say('glide_record'), 1800);
    g.audio.setWind(0);
    setTimeout(() => {
      const top = g.store.get('glideBoard', []).slice(0, 5);
      const layer = g.ui.modal(`
        <div class="modal" role="dialog" aria-label="${title}">
          <h2>${title}</h2>
          <div style="color:var(--muted)">${this.design.name} · ${OPTS.theme.find((t) => t.id === this.design.theme).name}${isBest ? ' · <b style="color:var(--gold)">新紀錄</b>' : ''}</div>
          <div class="stats">
            <div class="stat"><span>滑翔距離</span><b>${valid ? (dist >= 1000 ? (dist / 1000).toFixed(2) + ' km' : dist + ' m') : '—'}</b></div>
            <div class="stat"><span>飛行時間</span><b>${fmtTime(this.flightT || 0)}</b></div>
            <div class="stat"><span>最高速度</span><b>${Math.round((this.maxV || 0) * 3.6)} km/h</b></div>
            <div class="stat"><span>創意分</span><b>${'★'.repeat(this.perf.creat)}</b></div>
          </div>
          ${top.length ? `<div class="small">本機排行榜</div>${top.map((b, i) => `<div class="kv small"><span>${i + 1}. ${b.name}</span><b class="num" style="color:var(--gold)">${b.dist} m</b></div>`).join('')}` : ''}
          <div class="row">
            <button class="btn primary" id="gr-again">同一架再飛一次</button>
            <button class="btn" id="gr-build">修改設計</button>
            <button class="btn" id="gr-menu">主選單</button>
          </div>
        </div>`);
      const reset = () => {
        g.ui.modal('');
        g.scene.remove(this.fallChar.root);
        this.glider.pilot.root.visible = true;
        this.glider.group.visible = true;
      };
      layer.querySelector('#gr-again').addEventListener('click', () => { reset(); this.toBuild(); this.launch(); });
      layer.querySelector('#gr-build').addEventListener('click', () => { reset(); this.toBuild(); });
      layer.querySelector('#gr-menu').addEventListener('click', () => g.showMenu());
      layer.querySelector('#gr-again').focus();
    }, 2200);
  }
}
