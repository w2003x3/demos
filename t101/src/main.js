// 台北101 攀登挑戰 — 進入點:建立世界、主選單、模式切換與主迴圈。
import * as THREE from 'three';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { UI, fmtTime } from './ui/ui.js';
import { setAnisotropy } from './world/textures.js';
import { createSky, createLights, buildGround, buildTerrain, buildCity, buildTrees, buildTraffic, applyTime, TIMES } from './world/environment.js';
import { buildTower, buildPodium } from './world/tower.js';
import { buildInteriors } from './world/interiors.js';
import { buildLandmarks, LANDMARK_ZONES } from './world/landmarks.js';
import { Fireworks } from './world/fireworks.js';
import { buildElevatorScene } from './world/elevator.js';
import { buildStairScene } from './world/stairwell.js';
import { ClimbMode } from './modes/climb.js';
import { RaceMode } from './modes/race.js';
import { ExploreMode } from './modes/explore.js';
import { HeliMode } from './modes/heli.js';
import { GlideMode } from './modes/glide.js';
import { RACES } from './config.js';
import { Tutorial } from './ui/tutorial.js';

const store = {
  get(k, d) { try { const v = localStorage.getItem('t101.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('t101.' + k, JSON.stringify(v)); } catch { /* 無痕模式 */ } }
};

class Game {
  constructor() {
    this.store = store;
    this.ui = new UI(document.getElementById('ui'));
    this.ui.layer.innerHTML = '<div class="loading"><div class="kicker">TAIPEI 101</div><div>建構台北市中…</div><div class="bar"><i id="lb"></i></div></div>';
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('app').appendChild(r.domElement);
    setAnisotropy(r.capabilities.getMaxAnisotropy());
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 120000);
    this.input = new Input(r.domElement);
    this.audio = new Audio();
    addEventListener('resize', () => this.resize());
    addEventListener('pointerdown', () => this.audio.unlock(), { once: false });
    addEventListener('keydown', () => this.audio.unlock());
    this.timeKey = store.get('time', 'day');
    this.settings = { sfx: 90, voice: 100, muted: false, quality: matchMedia('(pointer: coarse)').matches ? 'mid' : 'high', fps: false, ...store.get('settings', {}) };
    this.audio.setVolume(this.settings.sfx / 100);
    this.audio.setVoiceVolume(this.settings.voice / 100);
    this.audio.setMuted(this.settings.muted);
    this.fpsN = 0; this.fpsT = 0;
    this.tutorial = new Tutorial(this);
    this.ui.$('gear').addEventListener('click', () => this.toggleSettings());
    this.ui.$('help').addEventListener('click', () => { if (this.mode && this.mode.tutorial && !this.tutorial.open) { this.closeSettings(); this.mode.tutorial(true); } });
    this.clock = new THREE.Clock();
    this.t = 0;
    setTimeout(() => this.build(), 30);
  }

  async build() {
    const step = (p) => new Promise((res) => { const b = document.getElementById('lb'); if (b) b.style.width = p + '%'; setTimeout(res, 16); });
    // 招牌、菜單等貼圖會用到網頁字型:先等字型載入(最多 3 秒)
    try {
      await Promise.race([
        Promise.all(['900 40px "Noto Sans TC"', '700 40px "Noto Sans TC"', '500 40px "Noto Sans TC"', '700 40px "Barlow Condensed"'].map((f) => document.fonts.load(f, '台北101咖啡'))),
        new Promise((r) => setTimeout(r, 3000))
      ]);
    } catch { /* 字型載入失敗就用系統字型 */ }
    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.FogExp2(0xb9cad6, 0.000038);
    this.sky = createSky(scene);
    this.sky.material.depthTest = false;
    this.sky.material.depthWrite = false;
    this.sky.renderOrder = -1000;
    this.lights = createLights(scene);
    await step(10);
    buildGround(scene, this.renderer.capabilities.getMaxAnisotropy());
    buildTerrain(scene);
    await step(25);
    this.city = buildCity(scene, LANDMARK_ZONES);
    await step(45);
    buildTrees(scene);
    this.updateTraffic = buildTraffic(scene);
    buildLandmarks(scene);
    await step(60);
    this.tower = buildTower();
    scene.add(this.tower);
    scene.add(buildPodium());
    await step(72);
    this.interiors = buildInteriors(scene);
    this.interiors.setActive(null);
    this.fireworks = new Fireworks(scene, this.audio);
    this.stars = this.makeStars();
    scene.add(this.stars);
    await step(85);
    this.elevator = buildElevatorScene(this.renderer);
    this.stair = buildStairScene();
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.setTime(this.timeKey);
    this.applyQuality(this.settings.quality);
    await step(100);
    this.modes = { climb: new ClimbMode(this), race: new RaceMode(this), explore: new ExploreMode(this), heli: new HeliMode(this), glide: new GlideMode(this) };
    this.ui.modal('');
    this.showMenu();
    this.renderer.setAnimationLoop(() => this.loop());
    window.__t101 = this; // 除錯用
  }

  makeStars() {
    const n = 2500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection();
      v.y = Math.abs(v.y) * 0.9 + 0.05;
      v.normalize().multiplyScalar(60000);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
    p.visible = false;
    return p;
  }

  setTime(key) {
    this.timeKey = key;
    store.set('time', key);
    const base = key === 'nye' ? 'night' : key;
    const t = applyTime(this, base);
    this.night = t.night;
    this.scene.fog.density = base === 'night' ? 0.00005 : 0.000038;
    // 環境光照(反射)
    const envScene = new THREE.Scene();
    const skyClone = this.sky.clone();
    skyClone.material = this.sky.material;
    envScene.add(skyClone);
    if (base === 'night') envScene.background = new THREE.Color(0x0a1020);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0.02, 1, 100000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = base === 'night' ? 0.25 : base === 'dusk' ? 0.7 : 1;
    this.stars.visible = base === 'night';
    const m = this.tower.userData.mats;
    m.glass.emissiveIntensity = t.night * 0.35;
    m.lightBand.emissiveIntensity = t.night * 2.5;
    m.lightBand.emissive.setHex(key === 'nye' ? 0xffd27a : 0x66ffd9);
    this.city.setNight(t.night);
    this.fireworks.setActive(key === 'nye');
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    for (const c of [this.camera, this.elevator?.camera]) if (c) { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); }
  }

  /** 讓陰影範圍跟著焦點移動。 */
  focusShadow(p) {
    const s = this.lights.sun;
    s.target.position.copy(p);
    s.position.copy(p).addScaledVector(this.sunDir, 400);
  }

  showMenu() {
    if (this.mode) { this.mode.exit(); this.mode = null; }
    this.audio.stopVoice();
    this.ui.clear();
    this.audio.setWind(0); this.audio.setHum(0); this.audio.setMurmur(0);
    this.interiors.setActive(null);
    this.closeSettings();
    this.tutorial.closeAll();
    this.ui.$('topbar').style.display = 'none';
    this.menuT = 0;
    const best = store.get('best', {});
    const climbBest = store.get('climbBest', null);
    const stamps = store.get('stamps', 0);
    const timeBtns = Object.entries({ ...Object.fromEntries(Object.entries(TIMES).map(([k, v]) => [k, v.label])), nye: '跨年夜' })
      .map(([k, l]) => `<button data-time="${k}" class="${k === this.timeKey ? 'on' : ''}">${l}</button>`).join('');
    this.ui.modal('');
    this.ui.layer.innerHTML = `
      <div class="menu">
        <div class="menu-inner">
          <div>
            <div class="kicker">TAIPEI 101 · 508 M</div>
            <h1>台北101<br>攀登挑戰</h1>
            <p class="lead">四肢攀上竹節外牆、衝刺 2046 階登高賽、搭高速電梯上觀景台,或坐直升機、駕滑翔翼看台北。</p>
          </div>
          <div class="modes">
            <button class="mode-btn" data-mode="climb"><span class="no">01</span><span class="t"><b>外牆攀爬</b><span>四肢交替抓住外牆,一節一節爬上 508 公尺塔尖</span></span><span class="tag">挑戰</span></button>
            <button class="mode-btn" data-mode="race" data-race="full"><span class="no">02</span><span class="t"><b>樓梯登高賽 · 全程</b><span>${RACES[0].desc},與 7 位跑者競速</span></span><span class="tag">計時賽</span></button>
            <button class="mode-btn" data-mode="race" data-race="sprint"><span class="no">03</span><span class="t"><b>樓梯登高賽 · 短程</b><span>${RACES[1].desc}(終點四八八克)</span></span><span class="tag">計時賽</span></button>
            <button class="mode-btn" data-mode="explore"><span class="no">04</span><span class="t"><b>高速電梯 · 樓層導覽</b><span>5F 售票 → 35F 四八八克 · 88F 心缽咖啡與阻尼器 · 89F 觀景台</span></span><span class="tag">探索</span></button>
            <button class="mode-btn" data-mode="heli"><span class="no">05</span><span class="t"><b>直升機環景</b><span>環繞 101 飛行欣賞台北;跨年夜可在空中看煙火</span></span><span class="tag">觀光</span></button>
            <button class="mode-btn" data-mode="glide"><span class="no">06</span><span class="t"><b>創意滑翔賽</b><span>打造滑翔翼從 101 頂樓起飛,滑得越遠越好</span></span><span class="tag">挑戰</span></button>
            
          </div>
          <div class="row"><span class="label">時段</span><div class="seg" role="group" aria-label="時段">${timeBtns}</div>
            <button class="icon-btn" id="mute" aria-label="音效開關" title="音效開關">${this.audio.muted ? speakerOff : speakerOn}</button>
            <button class="icon-btn" id="menu-set" aria-label="設定" title="設定">${gearIcon}</button></div>
          <div class="records">
            最佳紀錄 · 全程 <b>${best.full ? fmtTime(best.full) : '--'}</b> · 短程 <b>${best.sprint ? fmtTime(best.sprint) : '--'}</b>
            · 攀爬登頂 <b>${climbBest ? fmtTime(climbBest) : '--'}</b> · 紀念章 <b>${stamps}</b>
          </div>
          <div class="help desk-only">拖曳滑鼠轉視角 · 滾輪縮放 · <kbd>V</kbd> 切換視角 · <kbd>Esc</kbd> 設定與返回選單</div>
        </div>
      </div>`;
    const L = this.ui.layer;
    L.querySelectorAll('[data-time]').forEach((b) => b.addEventListener('click', () => {
      this.audio.unlock();
      this.setTime(b.dataset.time);
      L.querySelectorAll('[data-time]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    L.querySelector('#mute').addEventListener('click', (e) => {
      this.audio.setMuted(!this.audio.muted);
      this.settings.muted = this.audio.muted;
      store.set('settings', this.settings);
      e.currentTarget.innerHTML = this.audio.muted ? speakerOff : speakerOn;
    });
    L.querySelector('#menu-set').addEventListener('click', () => this.toggleSettings());
    L.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      this.audio.unlock();
      this.ui.layer.innerHTML = '';
      this.startMode(b.dataset.mode, { race: b.dataset.race });
    }));
    L.querySelector('[data-mode]').focus();
  }

  startMode(name, opts = {}) {
    if (this.mode) this.mode.exit();
    this.audio.stopVoice();
    this.ui.clear();
    this.closeSettings();
    this.tutorial.closeAll();
    this.mode = this.modes[name];
    this.mode.enter(opts);
    this.renderViewbar();
    this.ui.$('topbar').style.display = '';
  }

  renderViewbar() {
    const vb = this.ui.$('viewbar');
    const m = this.mode;
    if (!m || !m.views) { vb.innerHTML = ''; return; }
    vb.innerHTML = m.views.map((v, i) => `<button data-v="${i}" class="${i === m.view ? 'on' : ''}" title="視角:${v.name}(按 ${i + 1} 或 V)"><kbd>${i + 1}</kbd>${v.name}</button>`).join('');
    vb.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.v);
      // 小螢幕只顯示目前視角,點它就切到下一個
      this.setView(i === m.view && matchMedia('(max-width: 900px)').matches ? (i + 1) % m.views.length : i);
    }));
  }

  setView(i) {
    if (!this.mode || !this.mode.views) return;
    this.mode.setView(i);
    this.renderViewbar();
    this.ui.banner(`視角:${this.mode.views[i].name}`, false, 1.2);
  }

  /** 設定或教學開著時遊戲暫停。 */
  get paused() { return !!this.mode && (!!this.settingsOpen || !!(this.tutorial && this.tutorial.open)); }

  // ── 設定面板 ──
  toggleSettings() { if (this.settingsOpen) this.closeSettings(); else this.openSettings(); }
  closeSettings() {
    if (!this.settingsOpen) return;
    this.settingsOpen = false;
    this.ui.$('settings').innerHTML = '';
    this.clock.getDelta();
  }
  openSettings() {
    if (this.ui.layer.querySelector('.quiz')) return;
    this.settingsOpen = true;
    const s = this.settings;
    const q = (k, l) => `<button data-q="${k}" class="${s.quality === k ? 'on' : ''}">${l}</button>`;
    const el = this.ui.$('settings');
    el.innerHTML = `
      <div class="modal-wrap">
        <div class="modal settings" role="dialog" aria-label="設定">
          <h2>設定${this.mode ? '<span style="font-size:14px;font-weight:500;color:var(--muted);margin-left:10px">遊戲已暫停</span>' : ''}</h2>
          <label class="set-row"><span>音效音量</span><input type="range" id="s-sfx" min="0" max="100" value="${s.sfx}"><output id="o-sfx">${s.sfx}</output></label>
          <label class="set-row"><span>語音音量</span><input type="range" id="s-voice" min="0" max="100" value="${s.voice}"><output id="o-voice">${s.voice}</output></label>
          <label class="check"><input type="checkbox" id="s-mute" ${s.muted ? 'checked' : ''}>全部靜音</label>
          <div class="set-row" style="grid-template-columns:88px minmax(0,1fr)"><span>畫質</span><div class="seg" role="group" aria-label="畫質">${q('low', '低 · 流暢')}${q('mid', '中')}${q('high', '高 · 精緻')}</div></div>
          <label class="check"><input type="checkbox" id="s-fps" ${s.fps ? 'checked' : ''}>顯示 FPS</label>
          <div class="small" style="line-height:1.7"><kbd>Esc</kbd> 開關設定 · <kbd>V</kbd> 切換視角 · <kbd>1</kbd>~<kbd>5</kbd> 指定視角 · 拖曳轉視角、滾輪縮放</div>
          <div class="row">
            <button class="btn primary" id="s-close">${this.mode ? '繼續遊戲' : '完成'}</button>
            ${this.mode ? '<button class="btn" id="s-menu">返回主選單</button>' : ''}
          </div>
        </div>
      </div>`;
    const save = () => store.set('settings', s);
    const range = (id, key, fn) => {
      const r = el.querySelector('#s-' + id);
      r.addEventListener('input', () => { s[key] = Number(r.value); el.querySelector('#o-' + id).textContent = r.value; fn(s[key] / 100); save(); });
    };
    range('sfx', 'sfx', (v) => { this.audio.setVolume(v); this.audio.click(); });
    range('voice', 'voice', (v) => this.audio.setVoiceVolume(v));
    el.querySelector('#s-mute').addEventListener('change', (e) => { s.muted = e.target.checked; this.audio.setMuted(s.muted); save(); });
    el.querySelector('#s-fps').addEventListener('change', (e) => { s.fps = e.target.checked; if (!s.fps) this.ui.set('fps', ''); save(); });
    el.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      s.quality = b.dataset.q;
      el.querySelectorAll('[data-q]').forEach((x) => x.classList.toggle('on', x === b));
      this.applyQuality(s.quality);
      save();
    }));
    el.querySelector('#s-close').addEventListener('click', () => this.closeSettings());
    el.querySelector('#s-menu')?.addEventListener('click', () => this.showMenu());
    el.querySelector('#s-close').focus();
  }

  /** 畫質:解析度與陰影。 */
  applyQuality(q) {
    const r = this.renderer, dpr = devicePixelRatio || 1;
    r.setPixelRatio({ low: Math.min(dpr, 1) * 0.75, mid: Math.min(dpr, 1.25), high: Math.min(dpr, 2) }[q]);
    r.setSize(innerWidth, innerHeight);
    const shadows = q !== 'low';
    const type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    const size = q === 'high' ? 2048 : 1024;
    const sh = this.lights.sun.shadow;
    if (sh.mapSize.x !== size) { sh.mapSize.set(size, size); if (sh.map) { sh.map.dispose(); sh.map = null; } }
    if (r.shadowMap.enabled !== shadows || r.shadowMap.type !== type) {
      r.shadowMap.enabled = shadows;
      r.shadowMap.type = type;
      for (const sc of [this.scene, this.stair.scene, this.elevator.scene]) {
        sc.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
      }
    }
  }

  loop() {
    const realDt = this.clock.getDelta();
    const input = this.input;
    this.fpsN++; this.fpsT += realDt;
    if (this.fpsT > 0.5) { if (this.settings.fps) this.ui.set('fps', `${Math.round(this.fpsN / this.fpsT)} FPS`); this.fpsN = 0; this.fpsT = 0; }
    if (input.hit('Escape') && !this.ui.layer.querySelector('.quiz')) {
      if (this.tutorial.open) this.tutorial.closeFn();
      else if (this.settingsOpen) this.closeSettings();
      else if (this.mode) this.openSettings();
    }
    if (this.paused) {
      this.renderer.render(this.lastScene || this.scene, this.lastCamera || this.camera);
      input.endFrame();
      return;
    }
    if (this.mode && this.mode.views && !this.ui.layer.querySelector('.quiz')) {
      const n = this.mode.views.length;
      if (input.hit('KeyV')) this.setView((this.mode.view + 1) % n);
      for (let i = 0; i < n; i++) if (input.hit('Digit' + (i + 1), 'Numpad' + (i + 1))) this.setView(i);
    }
    const rawDt = Math.min(0.05, realDt);
    const dt = rawDt * (this.timeScale ?? 1);
    this.t += dt;
    this.tutorial.update(rawDt);
    this.updateTraffic(dt);
    this.interiors.update(this.t, dt);
    this.tower.userData.beacon.visible = Math.sin(this.t * 3) > 0;
    this.fireworks.update(dt, this.camera.position);
    let scene = this.scene, camera = this.camera;
    if (this.mode) {
      const r = this.mode.update(dt, rawDt);
      if (r) { scene = r.scene || scene; camera = r.camera || camera; }
    } else {
      // 主選單:環繞 101 的空拍
      this.menuT += rawDt;
      const a = this.menuT * 0.04 + 0.5;
      const cp = new THREE.Vector3(Math.sin(a) * 820, 300 + Math.sin(this.menuT * 0.1) * 25, Math.cos(a) * 820);
      this.camera.position.copy(cp);
      // 讓 101 落在畫面右側
      const side = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      this.camera.lookAt(new THREE.Vector3(0, 250, 0).addScaledVector(side, -240));
      this.focusShadow(new THREE.Vector3(0, 0, 0));
      this.camera.fov = 55;
      this.camera.updateProjectionMatrix();
    }
    this.ui.update(rawDt);
    this.lastScene = scene; this.lastCamera = camera;
    this.renderer.render(scene, camera);
    input.endFrame();
  }
}

const gearIcon = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>';
const speakerOn = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';
const speakerOff = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';

new Game();
