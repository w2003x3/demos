// 營運長:在「營運長辦公室」的規劃桌上(Leaflet 路網圖,改造自「路網連連看」的路網編輯模式)做年度經營決策。
//   - 路網:點地圖在既有路線上「新增車站」;依序點選車站 / 空地「新增路線」;需求熱點(紅圈)沒有車站服務就流失旅客
//   - 班次與票價:各路線每小時班次(太少 → 擁擠、滿意度下降;太多 → 營運成本增加)、票價倍率
//   - 便當菜色:從經典款與騰雲座艙各分處便當中選上架品項(最多 5 種)與售價
//   - 每季按「結算本季」:董事會報告(運量、票收、便當、成本、建設攤提、獲利、滿意度);4 季為一個年度
import { loadNetwork } from '../core/network.js';
import { CooSim, CAPEX, dist } from './cooSim.js';
import { COO_LEVELS, COO_BENTOS } from '../config/coo.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const yi = (v) => `${(v / 1e8).toFixed(2)} 億`;

let leafletReady = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletReady) {
    leafletReady = new Promise((res, rej) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'src/vendor/leaflet/leaflet.css'; document.head.appendChild(css);
      const js = document.createElement('script'); js.src = 'src/vendor/leaflet/leaflet.js';
      js.onload = () => res(window.L); js.onerror = () => rej(new Error('無法載入地圖元件'));
      document.head.appendChild(js);
    });
  }
  return leafletReady;
}

export class CooPhase {
  constructor(game, cfg) {
    this.g = game;
    this.cfg = cfg;
    this.Lv = COO_LEVELS.find((l) => l.id === cfg.level) || COO_LEVELS[0];
    this.ownHud = true;
    this.ownRender = true;
    this.tab = 'net';
    this.mode = null;          // 'station' | 'line'
    this.draftLine = [];
  }

  prepTitle() { return { title: `營運長辦公室・${this.Lv.title}`, sub: '年度經營計畫', go: '進辦公室' }; }
  prepItems() {
    return [
      { id: 'a', name: '路網規劃', price: 0, desc: `建設預算 ${this.Lv.budget} 億:新車站 ${CAPEX.station / 1e8} 億;新路線每公里 ${CAPEX.lineKm / 1e8} 億 + 每個新站 ${CAPEX.lineStation / 1e8} 億`, dishes: [] },
      { id: 'b', name: '班次與票價', price: 0, desc: '班次多 → 不擠、滿意度高,但營運成本也高;票價高 → 票收多但旅客變少', dishes: [] },
      { id: 'c', name: '便當菜色', price: 0, desc: '經典款與騰雲座艙便當,選品項與售價;特色便當在觀光路線更受歡迎', dishes: [] },
    ];
  }
  async prepThumbs() { return {}; }

  async init() {
    const [L, net] = await Promise.all([loadLeaflet(), loadNetwork()]);
    this.L = L;
    this.sim = new CooSim(net, this.Lv);
    this.g.prep?.progress('model', 0.8);
    this._buildUi();
    this._initMap();
    this._render();
  }

  begin() {
    this.el.style.visibility = '';
    this.g.ui.showHud(false);
    this.g.voice.talk('coo_start');
    setTimeout(() => this.map.invalidateSize(), 50);
  }

  update() {
    if (this._result) return this._result;
    return null;
  }

  // ================================================================ 介面
  _buildUi() {
    const el = this.el = document.createElement('div');
    el.className = 'coo';
    el.style.visibility = 'hidden';   // 整備畫面期間先隱藏
    el.innerHTML = `
      <div class="coo-office"></div>
      <div class="coo-top"><b>鈦鐵 營運長辦公室</b><span data-c="year"></span><span data-c="budget"></span>
        <span class="grow"></span><button class="coo-btn ghost" data-act="leave">離開辦公室</button></div>
      <div class="coo-map" data-c="map"></div>
      <div class="coo-left"><div class="coo-h">經營儀表板</div><div data-c="kpi"></div><div class="coo-h">年度目標</div><div data-c="goals"></div></div>
      <div class="coo-right">
        <div class="coo-tabs"><button data-tab="net">路網</button><button data-tab="ops">班次票價</button><button data-tab="menu">便當菜色</button></div>
        <div class="coo-body" data-c="body"></div>
        <div class="coo-foot"><div data-c="peek"></div><button class="coo-btn go" data-act="settle">結算本季 ▶</button></div>
      </div>
      <div class="coo-hint" data-c="hint" hidden></div>
      <div class="coo-report" data-c="report" hidden></div>`;
    this.g.ui.root.appendChild(el);
    this.$ = (k) => el.querySelector(`[data-c="${k}"]`);
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]'); if (t) { this.tab = t.dataset.tab; this._render(); }
      const a = e.target.closest('[data-act]'); if (a) this._act(a.dataset.act, a.dataset);
    });
    el.addEventListener('input', (e) => {
      const f = e.target.closest('[data-freq]'); if (f) { this.sim.freq[f.dataset.freq] = +f.value; this._render(true); }
      if (e.target.matches('[data-fare]')) { this.sim.fare = +e.target.value; this._render(true); }
      const p = e.target.closest('[data-price]'); if (p) { const m = this.sim.menu.find((x) => x.id === p.dataset.price); if (m) m.price = +p.value; this._render(true); }
    });
    el.addEventListener('change', (e) => {
      const c = e.target.closest('[data-menu]');
      if (c) {
        const id = c.dataset.menu, b = COO_BENTOS.find((x) => x.id === id);
        if (c.checked) { if (this.sim.menu.length >= 5) { c.checked = false; this._hint('菜單最多 5 種便當', true); return; } this.sim.menu.push({ id, price: b.ref }); }
        else this.sim.menu = this.sim.menu.filter((m) => m.id !== id);
        this._menuChanged = true;
        this._render();
      }
    });
  }

  _initMap() {
    const L = this.L;
    // 離線底圖:內政部國土測繪中心臺灣通用電子地圖(tools/fetch-tiles.mjs 下載):z6~11 全臺、z12 只有鐵路沿線
    const TW = L.latLngBounds([21.6, 119.2], [25.5, 122.2]);
    const map = this.map = L.map(this.$('map'), { zoomControl: true, attributionControl: true, preferCanvas: true, minZoom: 7, maxZoom: 15, maxBounds: TW.pad(0.1) }).setView([23.75, 120.95], 8);
    const blank = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    L.tileLayer('assets/tiles/emap/{z}/{x}/{y}.jpg', { minZoom: 6, maxNativeZoom: 11, maxZoom: 15, bounds: TW, attribution: '© 內政部國土測繪中心', opacity: 0.85, errorTileUrl: blank }).addTo(map);
    L.tileLayer('assets/tiles/emap/{z}/{x}/{y}.jpg', { minZoom: 12, maxNativeZoom: 12, maxZoom: 15, bounds: TW, opacity: 0.85, errorTileUrl: blank }).addTo(map);
    this.layer = L.layerGroup().addTo(map);
    const hs = this.Lv.hotspots || [];
    if (hs.length) map.fitBounds(L.latLngBounds(hs.map((h) => [h.lat, h.lng])).pad(0.35));
    map.on('click', (e) => this._mapClick(e.latlng));
    map.on('mousemove', (e) => { this._mouse = e.latlng; if (this.mode === 'line' && this.draftLine.length) this._drawDraft(); });
  }

  _drawNet() {
    const L = this.L, sim = this.sim, ly = this.layer;
    ly.clearLayers();
    for (const h of this.Lv.hotspots || []) {
      L.circle([h.lat, h.lng], { radius: h.r * 1000, color: '#e5484d', weight: 1.5, fillColor: '#e5484d', fillOpacity: 0.14, dashArray: '4 4' }).addTo(ly)
        .bindTooltip(`🔥 ${h.name}<br>需求 ${h.demand.toLocaleString()} 人/日 · 半徑 ${h.r} km`, { direction: 'top' });
      L.marker([h.lat, h.lng], { icon: L.divIcon({ className: 'coo-hot', html: `<span>${esc(h.name)}</span>` }) }).addTo(ly);
    }
    for (const l of sim.lines) {
      // 既有路線依實際線形畫(加站後改依站序)
      const pts = l.shape && !this.sim.projects.some((p) => p.kind === 'station' && l.nodes.some((n) => n.id === p.id)) ? l.shape : l.nodes.map((n) => sim.byId[n.id]).filter(Boolean).map((s) => [s.lat, s.lng]);
      const PAL = ['#1f4e9a', '#2a7d4f', '#8e44ad', '#c0392b', '#16a085', '#b9770e', '#2c3e50', '#d35400', '#7f8c8d', '#2980b9', '#27ae60', '#a04000'];
      L.polyline(pts, { color: l.isNew ? '#e8730c' : PAL[sim.lines.indexOf(l) % PAL.length], weight: l.isNew ? 5 : 4, opacity: 0.9, dashArray: l.isNew && l.opensAt > sim.q ? '8 6' : null }).addTo(ly)
        .bindTooltip(`${esc(l.name)} · 每小時 ${sim.freq[l.id]} 班`, { sticky: true });
    }
    for (const s of sim.stations) {
      if (!sim.lines.some((l) => l.nodes.some((n) => n.id === s.id))) continue;
      const major = /臺北|臺中|高雄|花蓮|臺東|新竹|嘉義|臺南|宜蘭|基隆|彰化|屏東|桃園/.test(s.name);
      L.circleMarker([s.lat, s.lng], { radius: s.isNew ? 6 : major ? 5 : 3, color: s.isNew ? '#e8730c' : '#16233f', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(ly)
        .bindTooltip(`${esc(s.name)}${s.isNew ? (s.opensAt > sim.q ? '(施工中,下季啟用)' : '(新站)') : ''}`, { direction: 'top' })
        .on('click', (e) => { this.L.DomEvent.stopPropagation(e); this._mapClick(e.latlng, s); });
    }
    this._drawDraft();
  }

  _drawDraft() {
    if (this.draftLayer) this.draftLayer.remove();
    if (this.mode !== 'line' || !this.draftLine.length) return;
    const pts = this.draftLine.map((p) => [p.lat, p.lng]);
    if (this._mouse) pts.push([this._mouse.lat, this._mouse.lng]);
    this.draftLayer = this.L.polyline(pts, { color: '#e8730c', weight: 4, dashArray: '6 6' }).addTo(this.map);
  }

  _mapClick(ll, station = null) {
    const sim = this.sim;
    if (this.mode === 'station') {
      const near = this.Lv.hotspots.map((h) => ({ h, d: dist(h, ll) })).sort((a, b) => a.d - b.d)[0];
      const name = near && near.d < near.h.r ? near.h.name.replace(/(公園|園區|新市鎮|副都心|國家公園|科學城|特區|智慧城|新灣區|高台)$/, '') : `新站`;
      const r = sim.planStation(ll.lat, ll.lng, name);
      if (r.error) { this._hint(r.error, true); return; }
      this.g.voice.talk('coo_build_station');
      this._hint(`新車站「${r.station.name}」規劃於${r.line.name},下一季啟用(${CAPEX.station / 1e8} 億)`);
      this.mode = null;
      this._render();
      return;
    }
    if (this.mode === 'line') {
      const st = station || sim.stations.filter((s) => sim.lines.some((l) => l.nodes.some((n) => n.id === s.id))).map((s) => ({ s, d: dist(s, ll) })).filter((x) => x.d < 1.2).sort((a, b) => a.d - b.d)[0]?.s;
      if (st) this.draftLine.push({ lat: st.lat, lng: st.lng, stationId: st.id, name: st.name });
      else {
        const near = this.Lv.hotspots.map((h) => ({ h, d: dist(h, ll) })).sort((a, b) => a.d - b.d)[0];
        const nm = near && near.d < near.h.r ? near.h.name.replace(/(公園|園區|新市鎮|副都心|國家公園|科學城|特區|智慧城|新灣區|高台)$/, '') : `新站${this.draftLine.length + 1}`;
        this.draftLine.push({ lat: ll.lat, lng: ll.lng, name: nm });
      }
      this._render();
    }
  }

  _act(a, ds) {
    const sim = this.sim;
    if (a === 'leave') { this._result = this._finish(true); return; }
    if (a === 'mode-station') { this.mode = this.mode === 'station' ? null : 'station'; this.draftLine = []; this._hint(this.mode ? '在地圖上點一下鈦鐵路線附近(3 公里內)的位置,就會在最近的站間設新站' : ''); }
    if (a === 'mode-line') { this.mode = this.mode === 'line' ? null : 'line'; this.draftLine = []; this._hint(this.mode ? '依序點選既有車站或空地(空地會設新站),完成後按「確定新路線」' : ''); }
    if (a === 'line-undo') this.draftLine.pop();
    if (a === 'line-ok') {
      const r = sim.planLine(this.draftLine, this.$('body').querySelector('[data-linename]')?.value || '鈦鐵新線');
      if (r.error) { this._hint(r.error, true); return; }
      this.g.voice.talk('coo_build_line');
      this._hint(`新路線「${r.line.name}」${r.km.toFixed(1)} km,建設費 ${yi(r.cost)},下一季通車`);
      this.mode = null; this.draftLine = [];
    }
    if (a === 'cancel') { sim.cancel(ds.id); }
    if (a === 'settle') { this._settle(); return; }
    if (a === 'report-close') { this.$('report').hidden = true; if (sim.q >= 4) this._result = this._finish(); }
    this._render();
  }

  _settle() {
    const sim = this.sim;
    if (this._menuChanged) { this.g.voice.talk('coo_menu'); this._menuChanged = false; }
    const r = sim.simulate();
    const lines = [r.profit > 0 ? 'coo_q_profit' : 'coo_q_loss', r.sat >= 85 ? 'coo_q_happy' : r.sat < 65 ? 'coo_q_unhappy' : null].filter(Boolean);
    if (sim.q >= 4) lines.push(this._goalsMet() ? 'coo_year_good' : 'coo_year_bad');
    this.g.voice.talk(lines);
    const bar = (v, max, cls = '') => `<i class="${cls}" style="width:${Math.max(2, Math.min(100, v / max * 100)).toFixed(0)}%"></i>`;
    const s = r.scores;
    const rep = this.$('report');
    rep.innerHTML = `<div class="coo-card"><h2>第 ${r.q} 季 董事會報告</h2>
      <table class="kv">
        <tr><th>運量</th><td>${(r.riders / 1e6).toFixed(1)} 百萬人次</td><th>票收</th><td>${yi(r.fareRev)}</td></tr>
        <tr><th>便當</th><td>售出 ${(r.bentoSold / 1e4).toFixed(0)} 萬個 · 營收 ${yi(r.bentoRev)} · 毛利 ${yi(r.bentoProfit)}</td><th>營運成本</th><td>${yi(r.opCost)}</td></tr>
        <tr><th>建設攤提</th><td>${yi(r.capex)}</td><th>本季損益</th><td class="${r.profit > 0 ? 'ok' : 'bad'}"><b>${r.profit > 0 ? '+' : ''}${yi(r.profit)}</b></td></tr>
        <tr><th>旅客滿意度</th><td class="${r.sat >= 85 ? 'ok' : r.sat < 60 ? 'bad' : ''}"><b>${r.sat.toFixed(0)}</b> / 100</td><th>熱點涵蓋</th><td>${r.hotTotal ? `${Math.round(r.hotCaught / r.hotTotal * 100)}%` : '—'}</td></tr>
      </table>
      <div class="coo-bars">
        <div><span>班次</span>${bar(s.freq, 100)}</div><div><span>不擁擠</span>${bar(s.crowd, 100)}</div><div><span>票價</span>${bar(s.fare, 100)}</div>
        <div><span>便當</span>${bar(s.bento, 100)}</div><div><span>熱點涵蓋</span>${bar(s.coverage, 100)}</div>
      </div>
      <button class="coo-btn go" data-act="report-close">${sim.q >= 4 ? '年度結算 ▶' : `進入第 ${sim.q + 1} 季`}</button></div>`;
    rep.hidden = false;
    this._render();
  }

  _goalsMet() {
    const S = this.sim.summary(), G = this.Lv.goals;
    return S.profitable >= (G.profitable || 0) && S.happy >= (G.happy || 0) && S.newLines >= (G.newLines || 0);
  }

  _finish(quit = false) {
    const S = this.sim.summary(), ok = !quit && this.sim.q >= 4 && this._goalsMet();
    const ranked = this.g.career.rank.id === 'coo';
    return {
      kind: 'coo', success: ok, level: this.Lv.title, quit, goals: this.Lv.goals, ...S,
      reason: quit ? '提前離開辦公室,年度計畫未完成。' : !ok ? '年度目標沒有全部達成。' : null,
      careerDelta: !ranked || quit ? {} : { profitableQuarters: S.profitable, newLines: S.newLines, happyQuarters: S.happy, lossQuarters: S.loss, unhappyQuarters: S.unhappy },
    };
  }

  _hint(text, bad = false) {
    const h = this.$('hint');
    h.textContent = text; h.hidden = !text; h.classList.toggle('bad', bad);
    clearTimeout(this._ht); if (text) this._ht = setTimeout(() => { h.hidden = true; }, 6000);
  }

  _render(soft = false) {
    const sim = this.sim, G = this.Lv.goals, S = sim.summary();
    this.$('year').textContent = `${this.Lv.title} ・ 第 ${Math.min(4, sim.q + 1)} 季 / 4`;
    this.$('budget').textContent = `建設預算剩 ${yi(sim.budgetLeft())} / ${this.Lv.budget} 億`;
    // 預估(以目前決策試算本季)
    const p = sim.simulate(true);
    this.$('peek').innerHTML = `本季預估:損益 <b class="${p.profit > 0 ? 'ok' : 'bad'}">${p.profit > 0 ? '+' : ''}${yi(p.profit)}</b> ・ 滿意度 <b class="${p.sat >= 85 ? 'ok' : p.sat < 60 ? 'bad' : ''}">${p.sat.toFixed(0)}</b>`;
    const last = sim.history.at(-1);
    this.$('kpi').innerHTML = `${sim.history.map((h) => `<div class="coo-q"><b>Q${h.q}</b><span class="${h.profit > 0 ? 'ok' : 'bad'}">${h.profit > 0 ? '+' : ''}${(h.profit / 1e8).toFixed(1)} 億</span><span class="${h.sat >= 85 ? 'ok' : h.sat < 60 ? 'bad' : ''}">滿意 ${h.sat.toFixed(0)}</span></div>`).join('') || '<p class="muted-txt">尚未結算任何一季</p>'}
      ${last ? `<p>上季運量 ${(last.riders / 1e6).toFixed(1)} 百萬人次</p>` : ''}`;
    const gl = [['獲利季度', S.profitable, G.profitable], ['滿意度 ≥ 85 的季度', S.happy, G.happy], ['新車站 / 新路線', S.newLines, G.newLines]].filter((x) => x[2]);
    this.$('goals').innerHTML = gl.map(([n, v, t]) => `<div class="coo-goal ${v >= t ? 'ok' : ''}"><span>${n}</span><b>${v} / ${t}</b></div>`).join('');
    if (soft && this._lastTab === this.tab) return;
    this._lastTab = this.tab;
    this.el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    const body = this.$('body');
    if (this.tab === 'net') {
      body.innerHTML = `<div class="coo-tools">
          <button class="coo-btn ${this.mode === 'station' ? 'on' : ''}" data-act="mode-station">📍 新增車站</button>
          <button class="coo-btn ${this.mode === 'line' ? 'on' : ''}" data-act="mode-line">🛤 新增路線</button></div>
        ${this.mode === 'line' ? `<div class="coo-draft"><p>已選 ${this.draftLine.length} 站:${this.draftLine.map((p) => esc(p.name)).join(' → ') || '(點地圖)'}</p>
          <input data-linename value="鈦鐵${this.draftLine[this.draftLine.length - 1]?.name || ''}線" maxlength="12">
          <div class="coo-tools"><button class="coo-btn" data-act="line-undo">↶ 上一站</button><button class="coo-btn go" data-act="line-ok">確定新路線</button></div></div>` : ''}
        <p class="coo-note">紅圈是需求熱點:有車站在圈內才吸引得到旅客(越靠近中心越多)。新站、新路線下一季啟用,建設費分四季攤提。</p>
        <div class="coo-h">建設計畫</div>
        ${sim.projects.map((p) => `<div class="coo-proj"><b>${p.kind === 'station' ? '📍' : '🛤'} ${esc(p.name)}</b><span>${p.kind === 'line' ? `${p.km.toFixed(1)} km · ` : `${esc(p.line)} · `}${yi(p.cost)} · Q${p.quarter} 啟用</span>${p.quarter === sim.q + 1 ? `<button data-act="cancel" data-id="${p.id}">取消</button>` : ''}</div>`).join('') || '<p class="muted-txt">尚無建設計畫</p>'}`;
    }
    if (this.tab === 'ops') {
      const main = sim.lines.filter((l) => l.nodes.length >= 3);
      body.innerHTML = `<div class="coo-h">票價倍率</div>
        <label class="coo-slider"><input type="range" min="0.7" max="1.5" step="0.05" value="${sim.fare}" data-fare><b>×${sim.fare.toFixed(2)}</b></label>
        <div class="coo-h">各路線每小時班次</div>
        ${main.map((l) => `<label class="coo-slider"><span>${esc(l.name.replace('鈦鐵', ''))}<small>${sim.lineLength(l).toFixed(0)} km</small></span><input type="range" min="1" max="8" step="1" value="${sim.freq[l.id]}" data-freq="${l.id}"><b>${sim.freq[l.id]} 班</b></label>`).join('')}
        <p class="coo-note">班次越多越不擁擠、滿意度越高,但每列車公里都有營運成本。</p>`;
    }
    if (this.tab === 'menu') {
      body.innerHTML = `<div class="coo-h">車上便當菜單(最多 5 種)</div>
        ${COO_BENTOS.map((b) => { const m = sim.menu.find((x) => x.id === b.id); return `<div class="coo-bento ${m ? 'on' : ''}"><label><input type="checkbox" data-menu="${b.id}" ${m ? 'checked' : ''}> <b>${esc(b.name)}</b><small>${b.tag}${b.east ? ' · 東部特色' : ''} · 成本 ${b.cost} 元</small></label>
          ${m ? `<label class="coo-slider"><input type="range" min="${Math.round(b.ref * 0.7)}" max="${Math.round(b.ref * 1.4)}" step="5" value="${m.price}" data-price="${b.id}"><b>${m.price} 元</b></label>` : ''}</div>`; }).join('')}
        <p class="coo-note">售價高於參考價會賣得少、滿意度下降;品項多、有特色的便當讓購買率與滿意度上升。</p>`;
    }
    if (!soft) this._drawNet();
  }

  dispose() {
    this.map?.remove();
    this.el?.remove();
  }
}
