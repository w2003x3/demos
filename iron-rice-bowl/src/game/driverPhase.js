// 司機員:坐進鈦鐵 EMU3000 駕駛室,依實際路網區段駕駛列車(移植自「路網連連看」駕駛模式並改造)。
//   - 場景:src/drive/scene.js(rail-assets 月台、軌旁設備、街景、隧道/高架/平面依車站層級)+ EMU3000 外觀
//   - 駕駛台:單柄主控制器(P1~P5 / N / B1~B8 / EB)、類比速度表、指示燈、TIMS 螢幕、車門、鳴笛、ATP、車內廣播
//   - 司機員本人:寫實人物(坐姿、藏青制服、大盤帽),第三人稱視角可看到
//   - 廣播:固定用語與站名皆為預錄音檔(assets/audio/drive);車內廣播輸入的自訂文字用瀏覽器語音
//   - 評分:停車誤差、準點、ATP 超速制動次數;彎道過速(ATP 切除時)出軌 → 任務失敗
import * as THREE from 'three';
import { loadNetwork, findLine, planLeg } from '../core/network.js';
import { buildDriveRoute, suggestScale, nextLimit, applyProfile, poseAt } from '../drive/route3d.js';
import { stationLevel, getPortal, LEVEL_HEIGHT } from '../drive/levels.js';
import { TRAIN_SPECS, createTrain, stepTrain, notchLabel, suggestNotch, gradeStop, atoNotch } from '../drive/physics.js';
import { Announcer, scriptDeparture, scriptArrival, scriptDoorsClosing } from '../drive/announcer.js';
import { PHRASES } from '../drive/phrases.js';
import { emu3000Car } from '../drive/emu3000.js';
import { DRIVER_LEVELS } from '../config/driver.js';
import { uniformTint } from '../world/poses.js';

const VIEW_NAMES = { cab: '駕駛室視角', third: '司機員視角', chase: '車外追蹤視角', side: '車側視角', aerial: '空拍視角' };
const DWELL = 15;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class DriverPhase {
  constructor(game, cfg) {
    this.g = game;
    this.cfg = cfg;
    this.L = DRIVER_LEVELS.find((l) => l.id === cfg.level) || DRIVER_LEVELS[0];
    this.ownHud = true;
    this.ownRender = true;
  }

  prepTitle() { return { title: `${this.L.title}・整備中`, sub: '出車前檢查', go: '上車駕駛' }; }
  prepItems() {
    return [
      { id: 'a', name: '主控制器', price: 0, desc: '↑/W 牽引、↓/S 制動(滾輪亦可),N 惰行,E 緊急制動', dishes: [] },
      { id: 'b', name: '車門 / 鳴笛', price: 0, desc: 'D 開關門(必須停妥在停車位置標),H 鳴笛', dishes: [] },
      { id: 'c', name: '視角', price: 0, desc: 'V 切換:駕駛室 / 司機員 / 車外追蹤 / 車側 / 空拍', dishes: [] },
      { id: 'd', name: '安全裝置', price: 0, desc: this.L.atp ? 'ATP 投入:超速自動制動' : 'ATP 切除:彎道過速會出軌!', dishes: [] },
    ];
  }
  async prepThumbs() { return {}; }

  async init() {
    const g = this.g, L = this.L;
    const report = (p) => g.prep?.progress('model', p);
    const net = await loadNetwork();
    const line = findLine(net, L.line);
    const leg = planLeg(net, line, L.from, L.to);
    if (!leg) throw new Error(`找不到路段 ${L.from} → ${L.to}`);
    this.line = { ...line, code: line.code || 'TZR', color: '#1f4e9a' };
    const spec = this.spec = TRAIN_SPECS.emu3000;
    const side = this.side = 'right';
    let route = buildDriveRoute(leg.pathLL, leg.stops, { radius: spec.radius, vmax: spec.vmax, lead: spec.platform + 80, straight: spec.platform / 2 + 40 });
    const scale = Math.min(L.scale ?? 1, suggestScale(route) < 1 ? Math.max(0.3, suggestScale(route)) : 1);
    route = buildDriveRoute(leg.pathLL, leg.stops, { radius: spec.radius, scale, vmax: spec.vmax, lead: spec.platform + 80, tail: 400, straight: spec.platform / 2 + 40 });
    const levels = route.stations.map((rs) => stationLevel(net.byId[rs.id], line));
    applyProfile(route, levels.map((lv) => ({ y: LEVEL_HEIGHT[lv], half: spec.platform / 2 })),
      route.stations.slice(0, -1).map((rs, k) => getPortal(line, rs.id, route.stations[k + 1].id)));
    const env = levels.every((l) => l === levels[0]) ? levels[0] : 'mixed';
    this.route = route;
    this.trainLen = spec.cars * spec.carLen;

    // 畫面:獨立的 3D 畫布 + 駕駛 HUD(放在遊戲介面層之下)
    const el = this.el = document.createElement('div');
    el.className = 'drive-overlay';
    el.style.zIndex = '0';
    el.innerHTML = '<div class="dv-canvas" data-canvas></div>';
    document.body.insertBefore(el, g.ui.root);

    const { DriveWorld, Assets } = await import('../drive/scene.js');
    const assets = await new Assets().load((u) => report(u * 0.55));
    this.gameAssets = await g.loadAssets((await import('../config/trains.js')).TRAIN_TYPES.EMU3000);

    // 車站:月台範圍、停車點、站名牌貼圖
    const stations = [];
    const n = route.stations.length;
    for (let k = 0; k < n; k++) {
      const rs = route.stations[k], s = net.byId[rs.id];
      const sStop = rs.s + spec.platform / 2 - 8;
      const prev = net.byId[route.stations[k - 1]?.id], next = net.byId[route.stations[k + 1]?.id];
      const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
      const glbTex = (cv) => { const t = tex(cv); t.flipY = false; return t; };
      stations.push({
        idx: k, id: rs.id, s: rs.s, sStop, p1: sStop + 8, p0: sStop + 8 - spec.platform, side, level: levels[k],
        name: s.name, sub: s.sub || '', transfer: { inside: [], outside: [] },
        textures: { board: tex(boardCanvas(s, prev, next)), pillar: tex(pillarCanvas(s)), direction: tex(directionCanvas(leg.stations[n - 1].name)), stop: glbTex(stopMarkerCanvas(spec.cars)) },
      });
      report(0.55 + 0.35 * (k + 1) / n);
    }
    const limitSigns = [];
    const texCache = new Map();
    for (let i = 1; i < route.limit.length; i++) {
      const v = route.limit[i];
      if (v < route.limit[i - 1]) {
        if (!texCache.has(v)) { const t = new THREE.CanvasTexture(limitCanvas(v)); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; texCache.set(v, t); }
        limitSigns.push({ s: Math.max(0, i * route.step - 30), v, tex: texCache.get(v) });
      }
    }
    this.stations = stations;
    const termName = stations[n - 1].name;
    const world = this.world = new DriveWorld(el.querySelector('[data-canvas]'), {
      route, env, time: L.time, quality: g.quality.shadows ? 'high' : g.qualityKey === 'low' ? 'low' : 'medium', stations, spec, assets, platformSide: side,
      overhead: true, limitSigns, destText: `往 ${termName}`, noPsd: true,
      carFactory: (head) => emu3000Car(head), makeDriver: () => this._driverFigure(),
    });
    report(0.95);
    await world.ready;
    this.speedCv = Object.assign(document.createElement('canvas'), { width: 256, height: 180 });
    this.infoCv = Object.assign(document.createElement('canvas'), { width: 512, height: 300 });
    world.setScreens(this.speedCv, this.infoCv);
    this.announcer = await new Announcer().init();
    this.announcer.english = true;

    // 行駛狀態
    this.train = createTrain(spec, stations[0].sStop);
    this.target = 1; this.phase = 'dwell'; this.doors = 'open'; this.dwellLeft = 8;
    this.results = []; this.time = 0; this.legStart = 0;
    this.announced = { arrive: -1, depart: -1 };
    this.msg = null; this.screenTimer = 0; this.firstDeparture = true;
    this.atpOn = L.atp !== false; this.atpHits = 0; this.crash = null;
    this.departOk = (st) => !(st.idx === this.target - 1 && this.phase === 'dwell' && this.doors !== 'closed');
    this._buildHud();
    this._bind();
    report(1);
  }

  /** 寫實司機員:坐姿、藏青制服、大盤帽,坐在駕駛座上(駕駛室座標:-Z 前、座面約 z 0.15) */
  _driverFigure() {
    const ppl = this.gameAssets?.people;
    if (!ppl?.length) return null;
    const p = ppl.find((x) => x.id === 'male-business-02') || ppl.find((x) => x.asian) || ppl[0];
    const body = p.sit.clone(true);
    body.traverse((m) => { if (m.isMesh && /_body$/.test(m.material?.name || '')) m.material = uniformTint(m.material, '#16233f'); });
    const g = new THREE.Group();
    g.add(body);
    body.position.set(0, -0.02, 0.32);
    const capMat = new THREE.MeshStandardMaterial({ color: '#141c30', roughness: 0.6 });
    const cap = new THREE.Group();
    cap.add(new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.11, 0.08, 20), capMat));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 20), capMat); top.position.y = 0.045; cap.add(top);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.09), new THREE.MeshStandardMaterial({ color: '#0b0b0b', roughness: 0.2 })); visor.position.set(0, -0.035, -0.11); cap.add(visor);
    const box = new THREE.Box3().setFromObject(body);
    cap.position.set(0, box.max.y - 0.03, 0.32 - 0.02);
    g.add(cap);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  begin() {
    this.g.ui.showHud(false);
    this._flash(`${this.stations[0].name}・旅客上車中,停站時間結束後按 D 關門`, 6);
    this.announcer.unlock();
    this.g.voice.talk('radio_depart_ok');
  }

  // ================================================================ HUD
  _buildHud() {
    const L = this.line, spec = this.spec;
    const hud = this.hud = document.createElement('div');
    hud.className = 'dv-hud';
    const notches = this.notches = [];
    for (let k = spec.P; k >= -(spec.B + 1); k--) notches.push(k);
    const term = this.stations[this.stations.length - 1];
    const cls = (k) => (k > 0 ? 'p' : k === 0 ? 'n' : k <= -(spec.B + 1) ? 'eb' : 'b');
    hud.innerHTML = `
      <div class="dv-top-left">
        <div class="dv-line"><span class="code-badge" style="background:#1f4e9a;color:#fff">鈦鐵</span>
          <div><small>${esc(L.name)}・${esc(spec.name)}</small><b>往 ${esc(term.name)}</b></div></div>
        <div class="dv-next"><small data-next-label>下一站</small><b data-next-name></b><span data-next-sub></span><em data-next-dist></em></div>
        <div class="dv-goal">${esc(this.L.title)}・停車容許 ±${this.L.tol} m${this.atpOn ? '' : '・ATP 切除'}</div>
      </div>
      <div class="dv-top-center">
        <div class="dv-marquee" data-caption hidden><span data-caption-text></span></div>
        <div class="dv-clock" data-clock>00:00</div><div class="dv-msg" data-msg hidden></div>
        <div class="dv-pa" data-pa hidden>
          <textarea data-pa-text maxlength="140" rows="2" placeholder="輸入要廣播的內容(例:本列車因號誌故障暫停,請旅客稍候)"></textarea>
          <div class="dv-pa-row"><button class="btn" data-pa-mic>🎤 語音輸入</button><span class="grow"></span>
            <button class="btn" data-pa-cancel>取消</button><button class="btn btn-primary" data-pa-send>📢 播出</button></div>
        </div>
      </div>
      <button class="dv-route-toggle" data-cmd="route" title="站序">☰</button>
      <div class="dv-route" data-route>${this.stations.map((s, i) => `<div class="dv-rs" data-rs="${i}"><i></i><span>${esc(s.name)}</span><em data-rs-grade="${i}"></em></div>`).join('')}</div>
      <div class="dv-driver-tag">司機員・鈦直鐵路</div>
      <div class="dv-console">
        <div class="cs-unit cs-mc"><div class="mc-label">主控制器</div>
          <div class="mc-body"><div class="mc-plate">${notches.map((k) => `<span data-n="${k}" class="${cls(k)}">${notchLabel(k, spec)}</span>`).join('')}</div>
            <div class="mc-slot" data-mc-slot style="--n:${notches.length}"><div class="mc-knob" data-mc-knob><i></i><b></b></div></div></div></div>
        <div class="cs-unit cs-gauge">${this._gaugeSvg()}<div class="cs-digital"><b data-speed>0</b><small>km/h</small></div></div>
        <div class="cs-unit cs-mid">
          <div class="cs-lamps"><span class="lamp" data-lamp="atp"><i></i>ATP</span><span class="lamp" data-lamp="doors"><i></i>車門</span>
            <span class="lamp" data-lamp="sig"><i></i>出發</span><span class="lamp" data-lamp="ato"><i></i>自動</span><span class="lamp" data-lamp="eb"><i></i>緊急</span></div>
          <div class="cs-tims">
            <div class="tims-row"><span data-tims-label>下一站</span><b data-tims-name></b></div>
            <div class="tims-row"><span>距離</span><b data-tims-dist></b><span>限速</span><b data-limit-v></b></div>
            <div class="tims-limit" data-limit></div>
            <div class="tims-guide" data-guide hidden><div class="dv-ruler"><i class="dv-target"></i><i class="dv-tol" data-tol></i><i class="dv-me" data-me></i></div>
              <div class="tims-row"><b data-guide-dist></b><span data-assist></span></div></div>
          </div>
        </div>
        <div class="cs-unit cs-btns">
          <button class="pb door" data-cmd="doors"><span data-door-ico>▶</span><small data-door-txt>車門</small></button>
          <button class="pb horn" data-cmd="horn"><span>📯</span><small>鳴笛</small></button>
          <button class="pb ato" data-cmd="ato"><span class="key"><i></i></span><small>自動駕駛</small></button>
          <button class="pb view" data-cmd="view"><span>🎥</span><small data-view-txt>駕駛室</small></button>
          <button class="pb eb" data-cmd="eb"><span></span><small>緊急制動</small></button>
          <button class="pb pause" data-cmd="pause"><span>❚❚</span><small>暫停</small></button>
          <button class="pb atp-btn" data-cmd="atp"><span>🛡</span><small data-atp-txt>ATP</small></button>
          <button class="pb pa-btn" data-cmd="pa"><span>📢</span><small>廣播</small></button>
        </div>
      </div>`;
    this.el.appendChild(hud);
    this.q = (s) => hud.querySelector(s);
    this._bindConsole();
    this._setAtp(this.atpOn, true);
    if (!this.L.atp) { const b = this.q('[data-cmd="atp"]'); b.disabled = true; b.title = 'ATP 故障切除中'; }
    this.announcer.onState = (on, label) => {
      const c = this.q('[data-caption]'), t = c.querySelector('[data-caption-text]');
      clearTimeout(this._marqueeHide);
      if (!on) { this._marqueeHide = setTimeout(() => { c.hidden = true; t.textContent = ''; }, Math.max(0, (this._marqueeUntil || 0) - performance.now())); return; }
      c.hidden = false;
      if (t.textContent !== (label || '')) {
        t.textContent = label || '';
        t.style.animation = 'none'; void t.offsetWidth;
        const secs = Math.max(6, (t.scrollWidth + c.clientWidth) / 110);
        t.style.animationDuration = `${secs}s`; t.style.animation = '';
        this._marqueeUntil = performance.now() + secs * 1000;
      }
    };
  }

  _gaugeSvg() {
    const vmax = this.spec.vmax, major = vmax > 100 ? 20 : 10;
    const ang = (v) => -225 + 270 * Math.min(1, v / vmax);
    const pt = (a, r) => { const t = a * Math.PI / 180; return [100 + r * Math.cos(t), 100 + r * Math.sin(t)]; };
    let ticks = '';
    for (let v = 0; v <= vmax; v += major / 2) {
      const big = v % major === 0;
      const [x1, y1] = pt(ang(v), big ? 70 : 74), [x2, y2] = pt(ang(v), 82);
      ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#E9EEF0" stroke-width="${big ? 2.6 : 1.2}"/>`;
      if (big) { const [tx, ty] = pt(ang(v), 58); ticks += `<text x="${tx.toFixed(1)}" y="${(ty + 4).toFixed(1)}">${v}</text>`; }
    }
    const arc = (a0, a1, r) => { const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
    this.gaugeAng = ang; this.gaugeArc = arc;
    return `<svg viewBox="0 0 200 200" class="cs-dial">
      <defs><radialGradient id="dvBezel" cx="40%" cy="30%"><stop offset="0" stop-color="#F4F6F7"/><stop offset=".55" stop-color="#8E979C"/><stop offset="1" stop-color="#3B4246"/></radialGradient>
        <radialGradient id="dvFace" cx="50%" cy="40%"><stop offset="0" stop-color="#20272B"/><stop offset="1" stop-color="#0B0E10"/></radialGradient></defs>
      <circle cx="100" cy="100" r="98" fill="url(#dvBezel)"/><circle cx="100" cy="100" r="90" fill="url(#dvFace)" stroke="#000" stroke-width="2"/>
      <path d="${arc(-225, 45, 86)}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="6"/>
      <path data-ok-arc d="" fill="none" stroke="#2FB36B" stroke-width="6"/><path data-over-arc d="" fill="none" stroke="#E5484D" stroke-width="6"/>
      <g class="cs-ticks">${ticks}</g><text x="100" y="146" class="cs-unit-txt">km/h</text>
      <g data-limit-mark><path d="M100 10l-6 -0.1 6 11 6 -11z" fill="#FF4B4B" stroke="#000" stroke-width=".8"/></g>
      <g data-needle><path d="M97.6 100L100 22 102.4 100z" fill="#FF6A2B"/><path d="M98 100h4l-1 18h-2z" fill="#FF6A2B"/></g>
      <circle cx="100" cy="100" r="9" fill="#2A3034" stroke="#9AA3A8" stroke-width="2"/></svg>`;
  }

  _bindConsole() {
    const slot = this.q('[data-mc-slot]');
    const pick = (y) => { const r = slot.getBoundingClientRect(); return this.notches[Math.max(0, Math.min(this.notches.length - 1, Math.round((y - r.top) / r.height * this.notches.length - 0.5)))]; };
    const manual = (n) => { if (this.finished) return; if (this.ato) this._setAto(false); if (n !== this.train.notch) this._setNotch(n); };
    slot.addEventListener('pointerdown', (e) => {
      e.preventDefault(); this.announcer.unlock();
      try { slot.setPointerCapture(e.pointerId); } catch { /* */ }
      manual(pick(e.clientY));
      const move = (ev) => manual(pick(ev.clientY));
      const up = () => { slot.removeEventListener('pointermove', move); slot.removeEventListener('pointerup', up); };
      slot.addEventListener('pointermove', move); slot.addEventListener('pointerup', up);
    });
    this.q('.mc-plate').addEventListener('click', (e) => { const n = e.target.closest('[data-n]'); if (n) manual(+n.dataset.n); });
    const horn = this.q('[data-cmd="horn"]');
    const hornOff = () => { horn.classList.remove('on'); this.announcer.horn(false); };
    horn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.announcer.unlock(); horn.classList.add('on'); this.announcer.horn(true); });
    horn.addEventListener('pointerup', hornOff); horn.addEventListener('pointercancel', hornOff);
    this.hud.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cmd]');
      if (!b || b.dataset.cmd === 'horn') return;
      this.announcer.unlock();
      const act = {
        doors: () => this._toggleDoors(),
        eb: () => { if (this.ato) this._setAto(false); this._setNotch(-(this.spec.B + 1)); },
        ato: () => this._setAto(!this.ato),
        view: () => this._cycleView(),
        pause: () => this.g.input.press('KeyP'),
        atp: () => this._setAtp(!this.atpOn),
        pa: () => this._openPA(),
        route: () => this.hud.classList.toggle('show-route'),
      }[b.dataset.cmd];
      if (act && !this.finished) act();
    });
    // 車內廣播
    const p = this.q('[data-pa]');
    p.querySelector('[data-pa-send]').onclick = () => this._sendPA();
    p.querySelector('[data-pa-cancel]').onclick = () => { p.hidden = true; };
    const mic = p.querySelector('[data-pa-mic]'), SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) mic.disabled = true;
    mic.onclick = () => {
      if (this._rec) { this._rec.stop(); return; }
      const ta = p.querySelector('[data-pa-text]'), rec = this._rec = new SR(), base = ta.value;
      rec.lang = 'zh-TW'; rec.interimResults = true;
      rec.onresult = (e) => { ta.value = base + Array.from(e.results).map((r) => r[0].transcript).join(''); };
      rec.onend = () => { this._rec = null; mic.textContent = '🎤 語音輸入'; };
      mic.textContent = '● 錄音中…';
      try { rec.start(); } catch { this._rec = null; }
    };
  }

  _openPA() { const p = this.q('[data-pa]'); p.hidden = !p.hidden; if (!p.hidden) p.querySelector('textarea').focus(); }
  _sendPA() {
    const ta = this.q('[data-pa-text]'), text = ta.value.trim();
    if (!text) return;
    this.announcer.announceText(text);
    this._flash('車內廣播播出中', 2);
    ta.value = ''; this.q('[data-pa]').hidden = true;
  }

  _bind() {
    this.onKey = (e) => {
      if (e.target.closest?.('[data-pa]')) {
        if (e.key === 'Escape') { this.q('[data-pa]').hidden = true; } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._sendPA(); }
        e.stopPropagation(); return;
      }
      if (this.g.state !== 'play' || this.finished) return;
      this.announcer.unlock();
      const k = e.key.toLowerCase();
      if (e.repeat && !['arrowup', 'arrowdown', 'w', 's'].includes(k)) return;
      if (['arrowup', 'w', 'arrowdown', 's'].includes(k) && this.ato) this._setAto(false);
      if (k === 'arrowup' || k === 'w') { if (!e.repeat || this._rep()) this._setNotch(this.train.notch + 1); }
      else if (k === 'arrowdown' || k === 's') { if (!e.repeat || this._rep()) this._setNotch(this.train.notch - 1); }
      else if (k === 'n' || k === '0') { if (this.ato) this._setAto(false); this._setNotch(0); }
      else if (k === 'e' || k === 'backspace') { if (this.ato) this._setAto(false); this._setNotch(-(this.spec.B + 1)); }
      else if (k === 'd') this._toggleDoors();
      else if (k === 'h') this.announcer.horn(true);
      else if (k === 'r') { if (this.lastScript) this.announcer.announce(this.lastScript.parts, this.lastScript.label); }
      else if (k === 'c') { this.world.look.yaw = 0; this.world.look.pitch = -0.07; }
      else if (k === 'v') this._cycleView();
      else if (k === 'a') this._setAto(!this.ato);
      else if (k === 't') this._setAtp(!this.atpOn);
      else if (k === 'b') this._openPA();
    };
    this.onKeyUp = (e) => { if (e.key.toLowerCase() === 'h') this.announcer.horn(false); };
    addEventListener('keydown', this.onKey, true);
    addEventListener('keyup', this.onKeyUp, true);
    const cv = this.el.querySelector('[data-canvas]');
    this.onWheel = (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now - (this._wheelT || 0) < 120 || this.finished) return;
      this._wheelT = now;
      if (this.ato) this._setAto(false);
      this._setNotch(this.train.notch + (e.deltaY < 0 ? 1 : -1));
    };
    cv.addEventListener('wheel', this.onWheel, { passive: false });
    cv.addEventListener('pointerdown', (e) => {
      this.announcer.unlock();
      const sx = e.clientX, sy = e.clientY, y0 = this.world.look.yaw, p0 = this.world.look.pitch;
      const move = (ev) => { this.world.look.yaw = Math.max(-1.3, Math.min(1.3, y0 - (ev.clientX - sx) * 0.004)); this.world.look.pitch = Math.max(-0.7, Math.min(0.45, p0 - (ev.clientY - sy) * 0.004)); };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    });
    this.onResize = () => this.world.resize();
    addEventListener('resize', this.onResize);
  }

  _rep() { const now = performance.now(); if (now - (this._repT || 0) < 160) return false; this._repT = now; return true; }

  _setAto(on) { this.ato = !!on; this.train.atoStop = false; this._flash(on ? '自動駕駛(ATO)啟動' : '自動駕駛解除,改為手動駕駛', 2.5); }
  _setAtp(on, quiet = false) {
    if (!this.L.atp && on) { this._flash('ATP 故障切除中,無法投入', 2.5, true); return; }
    this.atpOn = !!on;
    if (!on) this.train.atp = false;
    this.q('[data-cmd="atp"]')?.classList.toggle('off', !on);
    const tx = this.q('[data-atp-txt]'); if (tx) tx.textContent = on ? 'ATP 開' : 'ATP 關';
    if (!quiet) this._flash(on ? 'ATP 已投入:超速時自動制動' : 'ATP 已切除:超速不會自動制動,彎道過速可能出軌!', 3, !on);
  }
  _cycleView() {
    const order = ['cab', 'third', 'chase', 'side', 'aerial'];
    const next = order[(order.indexOf(this.world.view) + 1) % order.length];
    this.world.look.yaw = 0; this.world.look.pitch = next === 'cab' ? -0.07 : 0;
    this.world.setView(next);
    this._flash(VIEW_NAMES[next], 1.5);
  }
  _flash(text, secs = 3, warn = false) {
    this.msg = { text, until: this.time + secs, warn };
    const m = this.q('[data-msg]'); m.textContent = text; m.classList.toggle('warn', warn); m.hidden = false;
  }

  _setNotch(n) {
    const min = -(this.spec.B + 1), max = this.spec.P;
    n = Math.max(min, Math.min(max, n));
    if (n > 0 && this.doors !== 'closed') { this._flash('車門未關閉,無法牽引', 2, true); n = Math.min(n, 0); }
    if (n > 0 && this.phase === 'dwell' && !this.departOk(this.stations[this.target - 1])) { this._flash('出發號誌未開放', 2, true); n = 0; }
    this.train.notch = n;
  }

  _toggleDoors() {
    const t = this.train;
    if (this.doors === 'closing') return;
    if (this.doors === 'open') {
      if (this.dwellLeft > 0) { this._flash(`旅客上下車中,還要 ${Math.ceil(this.dwellLeft)} 秒`, 2); return; }
      if (this.phase === 'dwell' && this.target >= this.stations.length) return;
      this.doors = 'closing';
      this.announcer.announce(scriptDoorsClosing(), `${PHRASES.zh_doors_closing.text} ${PHRASES.en_doors_closing.text}`);
      this.doorTimer = 3.5;
      return;
    }
    if (t.v > 0.05) { this._flash('列車尚未停妥', 2, true); return; }
    const st = this.stations[this.target];
    if (!st || this.phase === 'dwell') return;
    const err = t.s - st.sStop;
    if (err < -this.L.tol) { this._flash(`停車不到位:還差 ${(-err).toFixed(2)} m,請再往前`, 3, true); return; }
    if (t.s - this.trainLen > st.p1 || t.s < st.p0) { this._flash('不在月台範圍內', 3, true); return; }
    if (t.notch > -1) { this._flash('開門前請先施加制動', 2, true); return; }
    this._arrive(st, err);
  }

  _arrive(st, err) {
    const grade = gradeStop(err, this.L.tol);
    const legTime = this.time - this.legStart, prev = this.stations[this.target - 1];
    const ideal = (st.s - prev.s) / (this.spec.vmax / 3.6 * 0.62) + 25;
    this.results.push({ name: st.name, err, grade, legTime, ideal });
    const tag = this.q(`[data-rs-grade="${st.idx}"]`);
    if (tag) { tag.textContent = grade.label; tag.className = grade.key; }
    this._flash(`${grade.label}・停車誤差 ${err >= 0 ? '+' : ''}${(err * 100).toFixed(0)} cm`, 4, grade.key === 'miss');
    this.phase = 'dwell'; this.doors = 'open'; this.dwellLeft = DWELL; this.target++;
    if (this.target >= this.stations.length) this.finishAt = this.time + 2.5;
  }

  _atpLimit(t, current) {
    const nl = nextLimit(this.route, t.s, 900);
    if (nl.next >= current) return current;
    const b = this.spec.brake * 0.75;
    return Math.min(current, Math.max(nl.next, Math.sqrt((nl.next / 3.6) ** 2 + 2 * b * Math.max(0, nl.at - t.s)) * 3.6));
  }

  _derail(limit) {
    const t = this.train, s = t.s;
    const kind0 = this.world._kindAt(s);
    const h = this.route.ys ? this.route.ys[Math.min(this.route.ys.length - 1, Math.round(s))] : 0;
    const kind = kind0 === 'tunnel' || kind0 === 'station-under' || kind0 === 'trough' ? 'wall' : (kind0 === 'viaduct' && h > 2.6) ? 'fall' : 'off';
    const a = poseAt(this.route, s), b = poseAt(this.route, s + 15);
    const out = (b.tx * -a.tz + b.tz * a.tx) > 0 ? -1 : 1;
    this.crash = { kind, out, s0: s, v0: t.v, t: 0, h, limit, vKmh: t.v * 3.6 };
    this.world.crashFx = this.crash;
    this.ato = false;
    this.announcer.stop(); this.announcer.stopBuzzer?.(); this.announcer.crash(kind);
    this._flash({ fall: '出軌!列車自高架墜落', wall: '出軌!列車撞擊隧道壁', off: '出軌!列車衝出軌道' }[kind], 6, true);
    this.el.classList.add('dv-crash');
  }

  // ================================================================ 主迴圈(由遊戲主迴圈呼叫)
  update(dt) {
    if (!this.world) return null;
    this.announcer.muted = this.g.muted;
    if (this.crash) {
      const c = this.crash; c.t += dt;
      const stopT = c.kind === 'wall' ? 0.8 : c.kind === 'fall' ? 1.6 : 2.6, u = Math.min(c.t, stopT);
      this.train.s = c.s0 + c.v0 * (u - u * u / (2 * stopT)) * (c.kind === 'fall' ? 0.7 : 1);
      this.train.v = Math.max(0, c.v0 * (1 - c.t / stopT));
      if (c.t > 3.6) return this._result(false);
    } else if (!this.finished) {
      const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
      for (let i = 0; i < sub; i++) { this._step(dt / sub); if (this.crash) break; }
      this.time += dt;
      if (this.finishAt && this.time > this.finishAt) return this._result(true);
    }
    this.screenTimer -= dt;
    const dirty = this.screenTimer <= 0;
    if (dirty) { this.screenTimer = 0.2; this._drawScreens(); }
    this.world.update({ s: this.train.s, v: this.train.v, notch: this.train.notch, time: this.time, dt, departOk: this.departOk, screensDirty: dirty });
    this._hud();
    this.announcer.motor(this.train.v / (this.spec.vmax / 3.6), this.train.notch > 0);
    return null;
  }

  _step(dt) {
    const t = this.train;
    if (this.phase === 'dwell') {
      if (this.doors === 'open' && this.dwellLeft > 0) {
        this.dwellLeft -= dt;
        if (this.dwellLeft <= 0) {
          const terminal = this.target >= this.stations.length;
          this._flash(terminal ? '終點站' : '停站時間到,按 D 關門', 3);
          if (!terminal) this.announcer.buzzer(3);
        }
      }
      if (this.doors === 'closing') { this.doorTimer -= dt; if (this.doorTimer <= 0) { this.doors = 'closed'; this._flash('車門已關閉・出發號誌開放', 2.5); } }
      if (this.doors === 'closed' && t.v > 0.3) { this.phase = 'run'; this.legStart = this.time; }
    }
    const limit = nextLimit(this.route, t.s, 1).current;
    if (this.ato) this._atoStep(limit);
    const ev = stepTrain(t, this.spec, dt, this.atpOn ? this._atpLimit(t, limit) : Infinity);
    if (ev.atpOn) { this.atpHits++; this._flash(`ATP 超速制動(限速 ${limit})`, 3, true); }
    if (limit < this.spec.vmax && t.v * 3.6 > limit * 1.35 + 5) { this._derail(limit); return; }
    if (this.phase !== 'run') return;
    const st = this.stations[this.target];
    if (!st) return;
    const prev = this.stations[this.target - 1], dist = st.sStop - t.s;
    if (this.announced.depart < this.target && t.s > prev.sStop + 25) {
      this.announced.depart = this.target;
      const term = this.stations[this.stations.length - 1];
      this._say(scriptDeparture({ next: st, terminal: term, nextTransfer: st.transfer, first: this.firstDeparture }),
        this.firstDeparture ? `歡迎搭乘鈦鐵列車,本列車開往 ${term.name}・下一站 ${st.name}` : `下一站 ${st.name}${st.sub ? ' Next station ' + st.sub : ''}`);
      this.firstDeparture = false;
    }
    const trigger = Math.min((st.s - prev.s) * 0.6, Math.max(260, t.v * 24));
    if (this.announced.arrive < this.target && dist < trigger && this.announced.depart >= this.target) {
      this.announced.arrive = this.target;
      const terminal = this.target === this.stations.length - 1;
      this._say(scriptArrival({ station: st, transfer: st.transfer, terminal, side: this.side }), terminal ? `終點站 ${st.name} 到了,請全部旅客下車` : `${st.name} 到了`);
    }
    if (t.s > st.p1 + 60 && !this.overrun) { this.overrun = true; t.notch = -(this.spec.B + 1); this._flash(`冒進!已越過 ${st.name} 月台,緊急制動`, 4, true); }
    if (t.v === 0 && !this._stoppedHint && Math.abs(dist) < 60) {
      this._stoppedHint = true;
      const err = -dist;
      this._flash(err < -this.L.tol ? `停車不到位:還差 ${(-err).toFixed(2)} m` : `已停妥(誤差 ${err >= 0 ? '+' : ''}${(err * 100).toFixed(0)} cm),按 D 開門`, 3, err < -this.L.tol);
    }
    if (t.v > 0.2) this._stoppedHint = false;
    if (this.overrun && t.v === 0) {
      this.overrun = false;
      this._arrive(st, t.s - st.sStop);
      this._flash('冒進,本站不開門', 4, true);
      this.doors = 'closed'; this.dwellLeft = 0;
    }
  }

  _atoStep(limit) {
    const t = this.train, term = this.target >= this.stations.length;
    if (this.phase === 'dwell') {
      if (this.doors === 'open') { if (this.dwellLeft <= 0 && !term) this._toggleDoors(); t.notch = -this.spec.B; return; }
      if (this.doors === 'closing' || term) { t.notch = -this.spec.B; return; }
    }
    const st = this.stations[this.target];
    if (!st) return;
    const stopDist = st.sStop - t.s;
    if (this.phase === 'run' && t.v === 0 && Math.abs(stopDist) <= Math.min(0.5, this.L.tol) && this.doors === 'closed') { t.notch = -this.spec.B; this._toggleDoors(); return; }
    const nl = nextLimit(this.route, t.s, 800);
    const n = atoNotch(t, this.spec, { stopDist, limit, nextLimit: nl.next < limit ? { next: nl.next, at: nl.at - t.s } : null });
    if (n !== t.notch) this._setNotch(n);
  }

  _say(parts, label) { this.lastScript = { parts, label }; this.announcer.announce(parts, label); }

  _hud() {
    const t = this.train, q = this.q, v = t.v * 3.6, lim = nextLimit(this.route, t.s, 600), vmax = this.spec.vmax;
    q('[data-speed]').textContent = Math.round(v);
    q('[data-needle]').setAttribute('transform', `rotate(${(this.gaugeAng(v) + 90).toFixed(2)} 100 100)`);
    q('[data-limit-mark]').setAttribute('transform', `rotate(${(this.gaugeAng(lim.current) + 90).toFixed(2)} 100 100)`);
    const a0 = this.gaugeAng(0), av = this.gaugeAng(Math.min(v, lim.current)), al = this.gaugeAng(lim.current);
    q('[data-ok-arc]').setAttribute('d', v > 0.5 ? this.gaugeArc(a0, av, 86) : '');
    q('[data-over-arc]').setAttribute('d', v > lim.current ? this.gaugeArc(al, this.gaugeAng(Math.min(v, vmax)), 86) : '');
    q('[data-limit-v]').textContent = `${lim.current}`;
    q('[data-limit]').textContent = this.L.assist && lim.next < lim.current ? `前方 ${Math.round(lim.at - t.s)} m 限速 ${lim.next}` : '';
    const prevSt = this.stations[this.target - 1], sigOk = prevSt ? this.departOk(prevSt) : true;
    const lamp = (k, cls) => { q(`[data-lamp="${k}"]`).className = `lamp ${cls || ''}`; };
    lamp('atp', t.atp ? 'red blink' : this.atpOn ? 'green' : '');
    lamp('doors', this.doors === 'closed' ? 'green' : this.doors === 'closing' ? 'amber blink' : 'amber');
    lamp('sig', sigOk ? 'green' : 'red');
    lamp('ato', this.ato ? 'blue' : '');
    lamp('eb', t.notch <= -(this.spec.B + 1) ? 'red' : '');
    q('[data-door-txt]').textContent = this.doors === 'open' ? '關門' : this.doors === 'closing' ? '關門中' : '開門';
    this.q('.pb.ato').classList.toggle('on', !!this.ato);
    q('[data-view-txt]').textContent = VIEW_NAMES[this.world.view].replace(/視角$/, '');
    const i = this.notches.indexOf(t.notch);
    const knob = this.q('[data-mc-knob]');
    knob.style.setProperty('--i', i);
    knob.className = `mc-knob ${t.notch > 0 ? 'p' : t.notch === 0 ? 'n' : t.notch <= -(this.spec.B + 1) ? 'eb' : 'b'}`;
    knob.querySelector('b').textContent = notchLabel(t.notch, this.spec);
    const st = this.stations[Math.min(this.target, this.stations.length - 1)], dist = st.sStop - t.s;
    const atStop = this.phase === 'dwell', term = this.target >= this.stations.length - 1;
    q('[data-next-label]').textContent = atStop ? '停靠中' : term ? '終點站' : '下一站';
    const showSt = atStop ? this.stations[this.target - 1] : st;
    q('[data-next-name]').textContent = showSt.name;
    q('[data-next-sub]').textContent = showSt.sub || '';
    const distTxt = atStop ? (this.doors === 'open' ? (this.dwellLeft > 0 ? `停站 ${Math.ceil(this.dwellLeft)} 秒` : '可關門') : this.doors === 'closing' ? '關門中' : '可出發') : dist > 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.max(0, Math.round(dist))} m`;
    q('[data-next-dist]').textContent = distTxt;
    q('[data-tims-label]').textContent = atStop ? '停靠' : '下一站';
    q('[data-tims-name]').textContent = showSt.name;
    q('[data-tims-dist]').textContent = atStop ? distTxt : dist > 1000 ? `${(dist / 1000).toFixed(2)}km` : `${Math.max(0, Math.round(dist))}m`;
    const guide = q('[data-guide]'), show = !atStop && dist < 500 && dist > -40;
    guide.hidden = !show;
    if (show) {
      const tol = this.L.tol, range = dist > 50 ? 500 : dist > 8 ? 50 : 8;
      q('[data-me]').style.left = `${50 + Math.max(-1, Math.min(1, -dist / range)) * 48}%`;
      q('[data-tol]').style.width = `${Math.min(96, tol / range * 96)}%`;
      q('[data-guide-dist]').textContent = Math.abs(dist) < 10 ? `${dist >= 0 ? '還有' : '超過'} ${Math.abs(dist).toFixed(2)} m` : `${Math.round(dist)} m`;
      const sug = this.L.assist && !this.ato ? suggestNotch(t, this.spec, dist) : null;
      q('[data-assist]').textContent = sug && t.v > 0.3 ? `建議 ${notchLabel(-sug, this.spec)}` : '';
    }
    this.q('[data-route]').querySelectorAll('[data-rs]').forEach((r) => {
      const k = +r.dataset.rs;
      r.classList.toggle('done', atStop ? k < this.target - 1 : k < this.target);
      r.classList.toggle('here', atStop && k === this.target - 1);
      r.classList.toggle('next', !atStop && k === this.target);
    });
    q('[data-clock]').textContent = `${String(Math.floor(this.time / 60)).padStart(2, '0')}:${String(Math.floor(this.time % 60)).padStart(2, '0')}`;
    if (this.msg && this.time > this.msg.until) { q('[data-msg]').hidden = true; this.msg = null; }
  }

  _drawScreens() {
    const t = this.train, g = this.speedCv.getContext('2d');
    g.fillStyle = '#06110D'; g.fillRect(0, 0, 256, 180);
    g.fillStyle = t.atp ? '#FF5A4E' : '#7CFFB2';
    g.font = '700 86px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(Math.round(t.v * 3.6)), 128, 74);
    g.font = '600 22px Consolas, monospace'; g.fillStyle = '#A9C7B8';
    g.fillText(`LIMIT ${nextLimit(this.route, t.s).current}  ${notchLabel(t.notch, this.spec)}`, 128, 150);
    const h = this.infoCv.getContext('2d');
    h.fillStyle = '#06110D'; h.fillRect(0, 0, 512, 300);
    h.fillStyle = '#1f4e9a'; h.fillRect(0, 0, 512, 46);
    h.fillStyle = '#fff'; h.font = '700 28px "Microsoft JhengHei", sans-serif'; h.textAlign = 'left'; h.textBaseline = 'middle';
    h.fillText(`鈦鐵 ${this.line.name.replace('鈦鐵', '')}`, 16, 24);
    const st = this.stations[Math.min(this.target, this.stations.length - 1)];
    h.fillStyle = '#E8F5EE'; h.font = '800 54px "Microsoft JhengHei", sans-serif';
    h.fillText(this.phase === 'dwell' ? this.stations[this.target - 1].name : st.name, 16, 120);
    h.font = '500 26px Consolas, "Microsoft JhengHei", monospace'; h.fillStyle = '#A9C7B8';
    h.fillText(this.phase === 'dwell' ? `DOORS ${this.doors.toUpperCase()}` : `NEXT ${Math.max(0, Math.round(st.sStop - t.s))} m`, 16, 200);
    h.fillText(`ODO ${(t.odo / 1000).toFixed(2)} km`, 16, 252);
  }

  // ================================================================ 結算
  _result(success) {
    if (this.finished) return null;
    this.finished = true;
    const r = this.results;
    const avg = r.length ? Math.round(r.reduce((a, x) => a + x.grade.score, 0) / r.length) : 0;
    const totalIdeal = r.reduce((a, x) => a + x.ideal, 0), totalTime = r.reduce((a, x) => a + x.legTime, 0);
    const lateSec = Math.max(0, Math.round(totalTime - totalIdeal));
    const perfect = r.filter((x) => Math.abs(x.err) <= 0.5).length, bad = r.filter((x) => Math.abs(x.err) > 2).length;
    const ok = success && !this.crash && avg >= 55;
    const ranked = this.g.career.rank.phase === 'driver';
    return {
      kind: 'driver', success: ok, level: this.L.title, reason: this.crash ? `彎道限速 ${this.crash.limit} km/h,以 ${Math.round(this.crash.vKmh)} km/h 進彎出軌。` : !ok ? `停車平均得分 ${avg},未達 55 分。` : null,
      avg, rank: avg >= 92 ? 'S' : avg >= 80 ? 'A' : avg >= 65 ? 'B' : avg >= 45 ? 'C' : 'D',
      stops: r.map((x) => ({ name: x.name, err: x.err, grade: x.grade.label, key: x.grade.key, legTime: x.legTime, ideal: x.ideal })),
      lateSec, atpHits: this.atpHits, crash: !!this.crash, odo: this.train.odo, time: this.time,
      careerDelta: !ranked ? {} : { successes: ok && lateSec < 180 ? 1 : 0, perfectStops: perfect, badStops: bad, overspeed: this.atpHits + (this.crash ? 3 : 0), late: lateSec >= 180 ? 1 : 0 },
    };
  }

  dispose() {
    removeEventListener('keydown', this.onKey, true);
    removeEventListener('keyup', this.onKeyUp, true);
    removeEventListener('resize', this.onResize);
    if (this.announcer) { this.announcer.stop(); this.announcer.stopBuzzer?.(); this.announcer.horn(false); this.announcer.motor(0, false); this.announcer.dispose(); }
    this.world?.dispose();
    this.el?.remove();
  }
}

// ---------------------------------------------------------------- 站名牌貼圖(鈦鐵樣式:白底、深藍字、前後站)
const FONT = '"Noto Sans TC","Microsoft JhengHei",sans-serif';
function boardCanvas(s, prev, next) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#1f4e9a'; g.fillRect(0, 0, 1024, 26); g.fillRect(0, 230, 1024, 26);
  g.fillStyle = '#16233f'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 104px ${FONT}`; g.fillText(s.name, 512, 104);
  g.font = `600 38px ${FONT}`; g.fillText(s.sub || '', 512, 180);
  g.font = `700 32px ${FONT}`; g.fillStyle = '#3a4a66';
  if (prev) { g.textAlign = 'left'; g.fillText(`◀ ${prev.name}`, 28, 196); }
  if (next) { g.textAlign = 'right'; g.fillText(`${next.name} ▶`, 996, 196); }
  return c;
}
function pillarCanvas(s) {
  const c = document.createElement('canvas'); c.width = 192; c.height = 576;
  const g = c.getContext('2d');
  g.fillStyle = '#1f4e9a'; g.fillRect(0, 0, 192, 576);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 92px ${FONT}`;
  [...s.name].forEach((ch, i, a) => g.fillText(ch, 96, 288 + (i - (a.length - 1) / 2) * 104));
  return c;
}
function directionCanvas(term) {
  const c = document.createElement('canvas'); c.width = 768; c.height = 140;
  const g = c.getContext('2d');
  g.fillStyle = '#16233f'; g.fillRect(0, 0, 768, 140);
  g.fillStyle = '#ffd23a'; g.font = `900 60px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`往 ${term} ➜`, 384, 72);
  return c;
}
function stopMarkerCanvas(cars) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#F2C230'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#1B1C1F'; g.fillRect(14, 14, 228, 228);
  g.fillStyle = '#FFFFFF'; g.fillRect(24, 24, 208, 208);
  g.fillStyle = '#C8102E'; g.font = `900 120px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('停', 128, 108);
  g.fillStyle = '#1B1C1F'; g.font = '800 54px Consolas, monospace'; g.fillText(String(cars), 128, 196);
  return c;
}
function limitCanvas(v) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 256, 256);
  g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.lineWidth = 26; g.strokeStyle = '#D0312D'; g.stroke();
  g.fillStyle = '#1B1C1F'; g.font = `800 ${v >= 100 ? 92 : 112}px Consolas, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(v), 128, 134);
  return c;
}
