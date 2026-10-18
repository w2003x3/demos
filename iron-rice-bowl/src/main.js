import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { MISSIONS, DRIVER_MISSION, KITCHEN_MISSION } from './config/missions.js';
import { RANKS, rankById } from './config/careerLadder.js';
import { Career } from './game/career.js';
import { KitchenPhase } from './game/kitchenPhase.js';
import { DriverPhase } from './game/driverPhase.js';
import { TroublemakerPhase, TicketingPhase, StationmasterPhase, DispatchPhase, OperationsPhase } from './game/reservedPhases.js';
import { Input } from './core/input.js';
import { Sfx, Voice } from './core/audio.js';
import { loadAssets } from './core/assets.js';
import { renderFoodThumbs } from './world/food.js';
import { ITEM_LIST } from './config/items.js';
import { UI } from './ui/ui.js';
import { OnboardPhase } from './game/onboardPhase.js';
import { StationPhase } from './game/stationPhase.js';

// 畫質設定:RectAreaLight、乘客陰影、解析度最吃效能;scenery = 窗外景物密度;simplePax = 座位乘客用簡易人偶(寫實人物每人約 8 千面)
const QUALITY = {
  high: { label: '高', areaLights: true, shadows: true, paxShadows: true, shadowSize: 2048, maxDpr: 2, scenery: 1 },
  medium: { label: '中', areaLights: false, pointLights: true, shadows: true, paxShadows: false, shadowSize: 1024, maxDpr: 1.25, scenery: 0.7 },
  low: { label: '低', areaLights: false, pointLights: false, shadows: false, paxShadows: false, shadowSize: 512, maxDpr: 0.85, scenery: 0.4, simplePax: true },
};
const QUALITY_KEY = 'trainBento.quality';
const SETTINGS_KEY = 'trainBento.settings';
const TUTORIAL_KEY = 'trainBento.tutorialSeen';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 忽略 */ } };

const PHASES = {
  onboard: OnboardPhase, station: StationPhase, kitchen: KitchenPhase, driver: DriverPhase,
  ticketing: TicketingPhase, stationmaster: StationmasterPhase, dispatch: DispatchPhase, operations: OperationsPhase,
  troublemaker: TroublemakerPhase,
};
const MODEL_BASE = 'assets/models';
const VOICE_BASE = 'assets/audio/voice';

class Game {
  constructor() {
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    document.getElementById('app').appendChild(renderer.domElement);
    RectAreaLightUniformsLib.init();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0d1015');
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 30000);

    this.input = new Input();
    this.sfx = new Sfx();
    this.ui = new UI(document.getElementById('ui'));
    this.ui.bindInput(this.input);
    // 遊戲中可切換的設定(窗簾);存在瀏覽器
    this.settings = { curtains: false, voiceMode: 'both', ...load(SETTINGS_KEY, {}) };
    this.voice = new Voice(VOICE_BASE, (s) => {
      if (s.channel === 'announce') this.ui.announce(s.label, s.text);
      else this.ui.bubble({ text: s.text, label: s.label, anchor: s.anchor });
    });
    this.muted = false;
    this.voice.mode = this.settings.voiceMode;
    this.voice.getCtx = () => this.sfx.ctx;
    let q = 'medium';
    try { q = localStorage.getItem(QUALITY_KEY) || q; } catch { /* 無法讀取 → 預設 */ }
    this.setQuality(QUALITY[q] ? q : 'medium');
    this.career = new Career();
    this.assetCache = new Map();
    this.state = 'menu';
    this.mouse = { dragging: false, dx: 0, dy: 0 };
    this._bindEvents();
    this.clock = new THREE.Clock();
    renderer.setAnimationLoop(() => this._frame());
  }

  _bindEvents() {
    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    });
    const c = this.renderer.domElement;
    c.addEventListener('pointerdown', (e) => {
      this.mouse.dragging = true;
      this.mouse.down = { x: e.clientX, y: e.clientY };
      try { c.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
    });
    c.addEventListener('pointerup', (e) => {
      this.mouse.dragging = false;
      // 點一下(沒拖曳):交給遊戲階段處理(例:點 3D 收銀機按鍵)
      const d = this.mouse.down;
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8 && this.state === 'play') this.phase?.onTap?.(e.clientX, e.clientY);
      this.mouse.down = null;
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.mouse.dragging) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    addEventListener('pointerdown', () => this.sfx.unlock(), { once: true });
    addEventListener('keydown', () => this.sfx.unlock(), { once: true });
  }

  async loadAssets(trainType) {
    if (!this.assetCache.has(trainType.id)) {
      const report = (p) => (this.prep ? this.prep.progress('model', p) : this.ui.loading('載入模型中…', p));
      report(0);
      const a = await loadAssets(MODEL_BASE, trainType, report);
      this.assetCache.set(trainType.id, a);
    }
    return this.assetCache.get(trainType.id);
  }

  async start() {
    await this.voice.init();
    this.menu();
  }

  menu() {
    this.state = 'menu';
    this.ui.showHud(false);
    const c = this.career, rank = c.rank;
    // 只能玩「目前職位」的任務;其他職位玩法尚未開放時以鎖定卡片顯示
    const list = MISSIONS.map((m) => (rank.phase !== 'onboard' && !m.locked
      ? { ...m, locked: true, subtitle: `${m.subtitle} · 目前職位:${rank.title}` } : m));
    // 其他職位的任務:還沒到達該職位前不揭露內容
    const mask = (m, id) => (c.knows(id) ? m : { ...m, title: '？？？', subtitle: '未知職位', brief: '到達該職位後揭曉。' });
    list.push(mask(DRIVER_MISSION, 'driver'), mask(KITCHEN_MISSION, 'kitchen'));
    const name = (id) => (c.knows(id) ? rankById(id).title : '？？？');
    this.ui.menu(list, {
      muted: this.muted,
      sound: this.soundChoice(),
      onSound: (c) => this.setSound(c),
      quality: this.quality.label,
      onQuality: () => this.cycleQuality(),
      curtains: this.settings.curtains,
      onCurtains: () => this.toggleCurtains(),
      onHelp: () => this.ui.tutorial(() => this.menu()),
      voice: this.voice.source,
      career: {
        ranks: RANKS.map((r) => ({ ...r, known: c.knows(r.id) })),
        rankIndex: c.rankIndex,
        rank,
        last: c.lastChange,
        promoteTo: rank.promote && name(rank.promote.to),
        demoteTo: rank.demote && name(rank.demote.to),
        demoteVerb: rank.demote?.verb,
        promotion: c.progress(rank.promote),
        demotion: c.progress(rank.demote),
      },
    },
    (m) => this.brief(m),
    () => this.toggleMute(),
    () => { this.career.reset(); this.menu(); });
  }

  /** 套用畫質(陰影/解析度立即生效;燈光種類於下次開始任務時生效)。 */
  setQuality(key) {
    this.qualityKey = key;
    this.quality = QUALITY[key];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quality.maxDpr));
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.setSize(innerWidth, innerHeight);
    // 陰影開關會改變 shader,已載入模型的材質需重新編譯
    this.assetCache?.forEach((set) => Object.values(set).forEach((root) => root.traverse?.((o) => {
      if (o.material) o.material.needsUpdate = true;
    })));
    try { localStorage.setItem(QUALITY_KEY, key); } catch { /* 忽略 */ }
  }

  cycleQuality() {
    const keys = Object.keys(QUALITY);
    this.setQuality(keys[(keys.indexOf(this.qualityKey) + 1) % keys.length]);
    return this.quality.label;
  }

  /** 窗簾(拉下 = 不繪製窗外景色);遊戲中立即套用。 */
  toggleCurtains() {
    this.settings.curtains = !this.settings.curtains;
    save(SETTINGS_KEY, this.settings);
    this.phase?.applySettings?.();
    return this.settings.curtains;
  }

  /** 聲音選項:both 預錄優先 / files 只用預錄 / browser 只用瀏覽器發音 / mute 靜音 */
  soundChoice() { return this.muted ? 'mute' : this.settings.voiceMode; }

  setSound(c) {
    if (c === 'mute') { if (!this.muted) this.toggleMute(); return; }
    this.settings.voiceMode = c;
    this.voice.mode = c;
    save(SETTINGS_KEY, this.settings);
    if (this.muted) this.toggleMute();
  }

  toggleMute() {
    this.muted = !this.muted;
    this.sfx.setMuted(this.muted);
    this.voice.setMuted(this.muted);
    return this.muted;
  }

  brief(m) {
    this.state = 'brief';
    this.pending = m;
    this.ui.brief(m, () => this.startMission(m), () => this.menu());
  }

  /** 首次遊戲:先看完操作說明(快捷鍵、畫面區塊、圖示)才開始。 */
  startMission(m) {
    if (load(TUTORIAL_KEY, false)) { this.play(m); return; }
    this.state = 'tutorial';
    this.ui.tutorial(() => { save(TUTORIAL_KEY, true); this.play(m); }, { first: true });
  }

  async play(m) {
    this.sfx.unlock();
    this.mission = m;
    this.phaseIndex = 0;
    this.results = [];
    await this._startPhase();
  }

  async _startPhase() {
    this.state = 'loading';
    const cfg = this.mission.phases[this.phaseIndex];
    const Phase = PHASES[cfg.type];
    this.phase = new Phase(this, cfg);
    // 整備畫面:模型與全部語音音檔都載入完成才開始(期間可瀏覽菜色)
    this.foodThumbs ??= renderFoodThumbs();
    this.prep = this.ui.prepare(ITEM_LIST, this.foodThumbs);
    const voiceReady = this.voice.mode === 'browser' ? Promise.resolve() : this.voice.preload((p) => this.prep?.progress('voice', p));
    if (this.voice.mode === 'browser') this.prep.progress('voice', 1);
    try {
      await Promise.all([this.phase.init(), voiceReady]);
      this.prep.progress('model', 1);
      this.prep.progress('voice', 1);
      await this.prep.ready();
      this.prep = null;
      this.sfx.unlock();
      this.phase.begin?.();
    } catch (e) {
      this.prep = null;
      console.error(e);
      this.ui.showScreen(`<div class="card center"><h2>無法開始</h2><p>${e.message}</p>
        <p class="muted-txt">若是模型載入失敗,請用本機伺服器開啟(見 README),不要直接雙擊 index.html。</p></div>`, 'dim');
      this.phase = null;
      return;
    }
    this.ui.hideScreen();
    this.ui.showHud(true);
    this.clock.getDelta();
    this.state = 'play';
  }

  _endPhase(result) {
    this.phase.dispose();
    this.phase = null;
    this.results.push(result);
    if (result.success && this.phaseIndex < this.mission.phases.length - 1) {
      this.phaseIndex++;
      this._startPhase();
      return;
    }
    this.state = 'result';
    this.ui.showHud(false);
    result.success ? this.sfx.win() : this.sfx.lose();
    const change = this.career.apply(result.careerDelta);
    // 換了職位就不能直接重玩同一個任務(要回選單看新職位)
    this.ui.result(this.mission, result, change, () => this.play(this.mission), () => this.menu());
  }

  _quit() {
    this.phase?.dispose();
    this.phase = null;
    this.menu();
  }

  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const inp = this.input;
    if (inp.wasPressed('KeyM')) this.toggleMute();

    if (this.state === 'play' && this.phase) {
      if (inp.wasPressed('KeyP') || (inp.wasPressed('Escape') && !this.phase.dialog)) {
        this.state = 'pause';
        this.voice.stopAll();
        this._pauseMenu();
      } else {
        const res = this.phase.update(dt);
        if (res) this._endPhase(res);
      }
    } else if (this.state === 'pause') {
      if (inp.wasPressed('KeyP', 'Escape')) this._resume();
    } else if (this.state === 'brief') {
      if (inp.wasPressed('Enter', 'NumpadEnter')) this.startMission(this.pending);
    } else if (this.state === 'result') {
      if (inp.wasPressed('Enter', 'NumpadEnter') && this.career.rank.phase === 'onboard') this.play(this.mission);
    }
    inp.endFrame();
    if (this.phase && this.state !== 'loading') this.renderer.render(this.scene, this.camera);
  }

  _pauseMenu() {
    this.ui.pause(() => this._resume(), () => this._quit(), {
      quality: this.quality.label,
      onQuality: () => this.cycleQuality(),
      curtains: this.settings.curtains,
      onCurtains: () => this.toggleCurtains(),
      sound: this.soundChoice(),
      onSound: (c) => this.setSound(c),
      firstPerson: this.phase?.cam?.mode === 'first',
      onView: () => {
        const c = this.phase?.cam;
        if (c) c.mode = c.mode === 'first' ? 'third' : 'first';
        return c?.mode === 'first';
      },
      onHelp: () => this.ui.tutorial(() => this._pauseMenu()),
    });
  }

  _resume() {
    this.ui.hideScreen();
    this.state = 'play';
    this.clock.getDelta();
  }
}

const game = new Game();
window.__game = game; // 除錯用
game.start();
