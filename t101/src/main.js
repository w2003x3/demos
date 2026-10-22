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
import { RACES } from './config.js';

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
    this.clock = new THREE.Clock();
    this.t = 0;
    setTimeout(() => this.build(), 30);
  }

  async build() {
    const step = (p) => new Promise((res) => { const b = document.getElementById('lb'); if (b) b.style.width = p + '%'; setTimeout(res, 16); });
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
    await step(100);
    this.modes = { climb: new ClimbMode(this), race: new RaceMode(this), explore: new ExploreMode(this) };
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
    this.ui.clear();
    this.audio.setWind(0); this.audio.setHum(0); this.audio.setMurmur(0);
    this.interiors.setActive(null);
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
            <p class="lead">四肢攀上竹節外牆、衝刺 2046 階登高賽,或搭 37 秒高速電梯直上 89 樓觀景台。</p>
          </div>
          <div class="modes">
            <button class="mode-btn" data-mode="climb"><span class="no">01</span><span class="t"><b>外牆攀爬</b><span>四肢交替抓住外牆,一節一節爬上 508 公尺塔尖</span></span><span class="tag">挑戰</span></button>
            <button class="mode-btn" data-mode="race" data-race="full"><span class="no">02</span><span class="t"><b>樓梯登高賽 · 全程</b><span>${RACES[0].desc},與 7 位跑者競速</span></span><span class="tag">計時賽</span></button>
            <button class="mode-btn" data-mode="race" data-race="sprint"><span class="no">03</span><span class="t"><b>樓梯登高賽 · 短程</b><span>${RACES[1].desc}(終點星巴克)</span></span><span class="tag">計時賽</span></button>
            <button class="mode-btn" data-mode="explore"><span class="no">04</span><span class="t"><b>高速電梯 · 樓層導覽</b><span>5F 售票 → 35F 星巴克 · 88F 興波咖啡與阻尼器 · 89F 觀景台</span></span><span class="tag">探索</span></button>
          </div>
          <div class="row"><span class="label">時段</span><div class="seg" role="group" aria-label="時段">${timeBtns}</div>
            <button class="icon-btn" id="mute" aria-label="音效開關" title="音效開關">${this.audio.muted ? speakerOff : speakerOn}</button></div>
          <div class="records">
            最佳紀錄 · 全程 <b>${best.full ? fmtTime(best.full) : '--'}</b> · 短程 <b>${best.sprint ? fmtTime(best.sprint) : '--'}</b>
            · 攀爬登頂 <b>${climbBest ? fmtTime(climbBest) : '--'}</b> · 紀念章 <b>${stamps}</b>
          </div>
          <div class="help desk-only">拖曳滑鼠轉視角 · 滾輪縮放 · <kbd>Esc</kbd> 回主選單</div>
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
      e.currentTarget.innerHTML = this.audio.muted ? speakerOff : speakerOn;
    });
    L.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      this.audio.unlock();
      this.ui.layer.innerHTML = '';
      this.startMode(b.dataset.mode, { race: b.dataset.race });
    }));
    L.querySelector('[data-mode]').focus();
  }

  startMode(name, opts = {}) {
    if (this.mode) this.mode.exit();
    this.ui.clear();
    this.mode = this.modes[name];
    this.mode.enter(opts);
  }

  loop() {
    const rawDt = Math.min(0.05, this.clock.getDelta());
    const dt = rawDt * (this.timeScale ?? 1);
    this.t += dt;
    const input = this.input;
    if (input.hit('Escape') && this.mode && !this.ui.layer.querySelector('.quiz')) this.showMenu();
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
    this.renderer.render(scene, camera);
    input.endFrame();
  }
}

const speakerOn = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';
const speakerOff = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';

new Game();
