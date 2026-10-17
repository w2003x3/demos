/**
 * driver.js
 * 駕駛模式:在 3D 駕駛艙內,依路網圖上的路線行駛列車。
 *   - 沿途車站使用路網圖的站名與「指標設計」的站名牌/柱面站名/方向指標
 *   - 需在停車位置標「到位停車」才能開門;停車誤差評分
 *   - 到站廣播:固定用語用 Azure TTS 音檔,站名用瀏覽器語音(見 announcer.js)
 * 與營運模擬(唯讀、俯視多列車)不同,這裡是單一列車、玩家駕駛。
 */
import { store } from '../core/store.js';
import { contrastText } from '../core/network-model.js';
import { LINE_TYPES } from '../core/constants.js';
import { esc } from '../render/svg-renderer.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { renderSign, stationSignData } from '../signs/sign-render.js';
import { svgToCanvas } from '../signs/sign-raster.js';
import { buildDriveRoute, suggestScale, nextLimit } from './route3d.js';
import { TRAIN_SPECS, createTrain, stepTrain, notchLabel, suggestNotch, gradeStop } from './physics.js';
import { Announcer, scriptDeparture, scriptArrival, scriptDoorsClosing } from './announcer.js';
import { PHRASES } from './phrases.js';

const ENVS = { auto: '依路線類型', underground: '地下(隧道)', elevated: '高架', ground: '地面' };
const TIMES = { day: '白天', overcast: '陰天', dusk: '黃昏', night: '夜間' };
const QUALITIES = { high: '高(陰影、人潮)', medium: '中', low: '低(效能優先)' };
const SIDES = { auto: '依路線類型', left: '左側', right: '右側' };
const TOLS = { 0.5: '±0.5 m(嚴格)', 1: '±1 m(標準)', 2: '±2 m(寬鬆)' };
const DWELL = 15;

let session = null;

// =====================================================
// 設定對話框
// =====================================================

function drivableLines() {
    return store.getLines().filter(l => !l.hidden && l.nodes.filter(n => n.type === 'station').length >= 2);
}

export async function openDriveSetup(ctx) {
    const lines = drivableLines();
    if (!lines.length) { toast('需要至少一條有 2 站以上、且顯示中的路線才能駕駛', { warn: true }); return; }
    const sel = store.getSelection();
    let lineId = sel.type === 'line' && lines.some(l => l.id === sel.ids[0]) ? sel.ids[0] : lines[0].id;
    const prev = JSON.parse(sessionStorage.getItem('drive-setup') || '{}');
    const opt = (obj, v) => Object.entries(obj).map(([k, t]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${t}</option>`).join('');
    const stationsOf = id => store.getLine(id).nodes.filter(n => n.type === 'station').map(n => store.getStation(n.id));
    const announcer = await new Announcer().init();

    const cfg = await openModal({
        title: '駕駛模式(3D)',
        size: 'mid',
        body: `<div class="modal-body drive-setup">
            <div class="field"><label>路線</label><select class="sel" id="dv-line">${lines.map(l => `<option value="${l.id}" ${l.id === lineId ? 'selected' : ''}>${esc((l.code ? l.code + ' ' : '') + l.name)}・${LINE_TYPES[l.type] || ''}</option>`).join('')}</select></div>
            <div class="field-row">
                <div class="field"><label>起站</label><select class="sel" id="dv-from"></select></div>
                <div class="field"><label>訖站</label><select class="sel" id="dv-to"></select></div>
            </div>
            <div class="field-row">
                <div class="field"><label>路段環境</label><select class="sel" id="dv-env">${opt(ENVS, prev.env || 'auto')}</select></div>
                <div class="field"><label>時段</label><select class="sel" id="dv-time">${opt(TIMES, prev.time || 'day')}</select></div>
                <div class="field"><label>月台側</label><select class="sel" id="dv-side">${opt(SIDES, prev.side || 'auto')}</select></div>
            </div>
            <div class="field-row">
                <div class="field"><label>距離比例</label><select class="sel" id="dv-scale"></select></div>
                <div class="field"><label>停車容許誤差</label><select class="sel" id="dv-tol">${opt(TOLS, prev.tol || 1)}</select></div>
                <div class="field"><label>畫質</label><select class="sel" id="dv-quality">${opt(QUALITIES, prev.quality || 'medium')}</select></div>
            </div>
            <div class="toggle-row"><span>英文廣播</span><label class="switch"><input type="checkbox" id="dv-en" ${prev.english !== false ? 'checked' : ''}><span></span></label></div>
            <div class="toggle-row"><span>駕駛輔助(建議制動檔位、限速預告)</span><label class="switch"><input type="checkbox" id="dv-assist" ${prev.assist !== false ? 'checked' : ''}><span></span></label></div>
            <p class="hint" id="dv-info"></p>
            <p class="hint">廣播常用詞:${esc(announcer.sourceLabel)};站名與路線名使用瀏覽器/作業系統內建語音即時合成。
                沿途站名牌、柱面站名、方向指標使用「指標設計」的樣式。</p>
            <table class="help-table drive-keys">
                <tr><td><kbd>↑</kbd>/<kbd>W</kbd> <kbd>↓</kbd>/<kbd>S</kbd></td><td>主控制器:牽引 P ⇄ 惰行 N ⇄ 制動 B(滾輪亦可)</td><td><kbd>D</kbd></td><td>開門/關門</td></tr>
                <tr><td><kbd>E</kbd></td><td>緊急制動 EB</td><td><kbd>H</kbd></td><td>鳴笛</td></tr>
                <tr><td><kbd>N</kbd></td><td>回到惰行</td><td><kbd>R</kbd></td><td>重播廣播</td></tr>
                <tr><td>滑鼠拖曳</td><td>環顧(雙擊回正)</td><td><kbd>M</kbd> / <kbd>Esc</kbd></td><td>靜音 / 暫停選單</td></tr>
                <tr><td><kbd>V</kbd></td><td>切換視角:駕駛室 / 車外追蹤 / 車側</td><td></td><td></td></tr>
            </table>
        </div>`,
        foot: `<span class="grow"></span><button class="btn" data-close>取消</button><button class="btn btn-primary" id="dv-go">開始駕駛 <kbd>Enter</kbd></button>`,
        onMount: (m, close) => {
            const $ = id => m.querySelector(id);
            const fill = () => {
                const st = stationsOf(lineId);
                const line = store.getLine(lineId);
                const o = st.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
                $('#dv-from').innerHTML = o;
                $('#dv-to').innerHTML = o;
                $('#dv-from').value = st[0].id;
                $('#dv-to').value = line.loop ? st[0].id : st[st.length - 1].id;
                info();
            };
            const info = () => {
                const line = store.getLine(lineId);
                const spec = TRAIN_SPECS[line.type] || TRAIN_SPECS.metro;
                let leg = null;
                try { leg = planLeg(ctx.view, lineId, $('#dv-from').value, $('#dv-to').value); } catch { /* */ }
                const prevScale = $('#dv-scale').value;
                if (!leg) {
                    $('#dv-info').textContent = '起訖站相同(非環狀線)或路段無法行駛。';
                    $('#dv-scale').innerHTML = opt({ 1: '實際距離' }, 1);
                    return;
                }
                const r = buildDriveRoute(leg.pathLL, leg.stops, { radius: spec.radius, vmax: spec.vmax, lead: spec.platform + 80 });
                const len = r.stations[r.stations.length - 1].s - r.stations[0].s;
                const sug = suggestScale(r);
                const scales = { 1: `實際距離(${(len / 1000).toFixed(1)} km)` };
                [0.5, 0.25, 0.1].forEach(k => { scales[k] = `縮為 ${k}×(${(len * k / 1000).toFixed(1)} km)`; });
                $('#dv-scale').innerHTML = opt(scales, prevScale && scales[prevScale] ? prevScale : (sug < 1 ? (sug >= 0.5 ? 0.5 : sug >= 0.25 ? 0.25 : 0.1) : 1));
                const avg = len / Math.max(1, leg.stops.length - 1);
                $('#dv-info').innerHTML = `${spec.name}・${spec.cars} 節 ${spec.cars * spec.carLen} m・最高 ${spec.vmax} km/h・共 ${leg.stops.length} 站,平均站距 ${Math.round(avg)} m` +
                    (sug < 1 ? `<br>站距較長,建議縮小距離比例(全程約 ${Math.round(len / (spec.vmax / 3.6 * 0.6) / 60)} 分鐘)。` : '');
            };
            $('#dv-line').onchange = (e) => { lineId = e.target.value; fill(); };
            $('#dv-from').onchange = info;
            $('#dv-to').onchange = info;
            fill();
            const go = () => {
                const c = {
                    lineId, fromId: $('#dv-from').value, toId: $('#dv-to').value,
                    env: $('#dv-env').value, time: $('#dv-time').value, side: $('#dv-side').value,
                    scale: parseFloat($('#dv-scale').value) || 1, tol: parseFloat($('#dv-tol').value) || 1, quality: $('#dv-quality').value,
                    english: $('#dv-en').checked, assist: $('#dv-assist').checked
                };
                if (!planLeg(ctx.view, c.lineId, c.fromId, c.toId)) { toast('起訖站相同(非環狀線)或路段無法行駛', { warn: true }); return; }
                sessionStorage.setItem('drive-setup', JSON.stringify({ env: c.env, time: c.time, side: c.side, tol: c.tol, quality: c.quality, english: c.english, assist: c.assist }));
                announcer.unlock();
                close(c);
            };
            $('#dv-go').onclick = go;
            m.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'SELECT') { e.preventDefault(); go(); } });
        }
    });
    if (!cfg) { announcer.dispose(); return; }
    startDrive(ctx, cfg, announcer);
}

// =====================================================
// 路線規劃(沿用路網圖上實際畫出的線形)
// =====================================================

/** 回傳 { pathLL, stops:[{id, idx}], forward } 或 null */
export function planLeg(view, lineId, fromId, toId) {
    const line = store.getLine(lineId);
    const model = view.model;
    if (!line || !model) return null;
    const st = line.nodes.filter(n => n.type === 'station').map(n => n.id);
    const secs = model.sections.filter(s => s.line.id === line.id && s.aId && s.bId);
    const between = (a, b) => {
        const f = secs.find(s => s.aId === a && s.bId === b);
        if (f) return f.path;
        const r = secs.find(s => s.aId === b && s.bId === a);
        return r ? [...r.path].reverse() : null;
    };
    const i = st.indexOf(fromId), j = st.indexOf(toId);
    if (i < 0 || j < 0) return null;
    let seq;
    const loop = line.loop && line.nodes.length >= 3;
    if (loop) {
        const n = st.length;
        const steps = i === j ? n : ((j - i + n) % n);
        seq = [];
        for (let k = 0; k <= steps; k++) seq.push(st[(i + k) % n]);
    } else if (i === j) return null;
    else seq = i < j ? st.slice(i, j + 1) : st.slice(j, i + 1).reverse();

    const px = [], stops = [];
    for (let k = 0; k < seq.length - 1; k++) {
        const seg = between(seq[k], seq[k + 1]);
        if (!seg || seg.length < 2) return null;
        if (k === 0) px.push(seg[0]);
        stops.push({ id: seq[k], idx: px.length - 1 });
        px.push(...seg.slice(1));
    }
    stops.push({ id: seq[seq.length - 1], idx: px.length - 1 });
    const pathLL = px.map(p => { const ll = view.toLatLng(p); return { lat: ll.lat, lng: ll.lng }; });
    return { pathLL, stops, forward: loop || i < j, seq };
}

/** 車站的轉乘資訊(同站其他路線、站內連通、站外轉乘) */
function transfersOf(stationId, lineId) {
    const s = store.getStation(stationId);
    const inside = new Map(), outside = new Map();
    (s?.lines || []).filter(l => l !== lineId).forEach(l => inside.set(l, store.getLine(l)));
    store.state.corridors.forEach(c => {
        if (c.fromId !== stationId && c.toId !== stationId) return;
        const o = store.getStation(c.fromId === stationId ? c.toId : c.fromId);
        (o?.lines || []).filter(l => l !== lineId).forEach(l => (c.type === 'in-station' ? inside : outside).set(l, store.getLine(l)));
    });
    outside.forEach((_, k) => { if (inside.has(k)) outside.delete(k); });
    const pick = m => [...m.values()].filter(Boolean).map(l => ({ name: l.name, code: l.code }));
    return { inside: pick(inside), outside: pick(outside) };
}

// =====================================================
// 貼圖
// =====================================================

/** glb=true:貼到 Blender 模型(glTF UV 原點在左上,不可翻轉 Y) */
async function canvasTexture(THREE, canvas, glb = false) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    if (glb) t.flipY = false;
    t.anisotropy = 4;
    return t;
}

function stopMarkerCanvas(cars) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#F2C230'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#1B1C1F'; g.fillRect(14, 14, 228, 228);
    g.fillStyle = '#FFFFFF'; g.fillRect(24, 24, 208, 208);
    g.fillStyle = '#C8102E';
    g.font = '900 120px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('停', 128, 108);
    g.fillStyle = '#1B1C1F';
    g.font = '800 54px "JetBrains Mono", Consolas, monospace';
    g.fillText(String(cars), 128, 196);
    return c;
}

function limitCanvas(v) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 256, 256);
    g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.lineWidth = 26; g.strokeStyle = '#D0312D'; g.stroke();
    g.fillStyle = '#1B1C1F';
    g.font = `800 ${v >= 100 ? 92 : 112}px "JetBrains Mono", Consolas, monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(v), 128, 134);
    return c;
}

// =====================================================
// 開始
// =====================================================

async function startDrive(ctx, cfg, announcer) {
    if (session) return;
    const line = store.getLine(cfg.lineId);
    const spec = TRAIN_SPECS[line.type] || TRAIN_SPECS.metro;
    const env = cfg.env === 'auto' ? ({ metro: 'underground', lrt: 'ground', rail: 'ground', hsr: 'elevated' }[line.type] || 'ground') : cfg.env;
    const side = cfg.side === 'auto' ? (line.type === 'metro' ? 'left' : 'right') : cfg.side;
    const leg = planLeg(ctx.view, cfg.lineId, cfg.fromId, cfg.toId);
    const route = buildDriveRoute(leg.pathLL, leg.stops, { radius: spec.radius, scale: cfg.scale, vmax: spec.vmax, lead: spec.platform + 80, tail: 400 });
    const trainLen = spec.cars * spec.carLen;

    document.body.classList.add('drive-mode');
    const el = document.createElement('div');
    el.className = 'drive-overlay';
    el.innerHTML = `<div class="dv-canvas" data-canvas></div>
        <div class="dv-loading" data-loading><div class="dv-load-box"><b>準備駕駛艙…</b><div class="dv-bar"><i data-load-bar></i></div><small data-load-text>載入 Blender 模型</small></div></div>`;
    document.body.appendChild(el);
    const setLoad = (u, text) => {
        el.querySelector('[data-load-bar]').style.width = `${Math.round(u * 100)}%`;
        if (text) el.querySelector('[data-load-text]').textContent = text;
    };

    let THREE, DriveWorld, Assets;
    try {
        ({ THREE, DriveWorld, Assets } = await import('./scene.js'));
    } catch (err) {
        el.remove();
        document.body.classList.remove('drive-mode');
        announcer.dispose();
        toast(`無法載入 3D 引擎(three.js,需連網):${err.message}`, { warn: true });
        return;
    }
    const assets = await new Assets().load(u => setLoad(u * 0.5));

    // 車站:月台範圍、停車點、指標貼圖
    const stations = [];
    const style = store.state.signs.style;
    const n = route.stations.length;
    for (let k = 0; k < n; k++) {
        const rs = route.stations[k];
        const sStop = rs.s + spec.platform / 2 - 8;
        const d = stationSignData(store.state, rs.id, line.id, leg.forward);
        // 終點方向的「往 X」以本次行駛的訖站為準
        const term = store.getStation(leg.stops[n - 1].id);
        if (term) d.towards = { name: term.name, sub: term.sub || '' };
        const textures = {};
        try {
            textures.board = await canvasTexture(THREE, await svgToCanvas(renderSign('board', style, d), 1));
            textures.pillar = await canvasTexture(THREE, await svgToCanvas(renderSign('pillar', style, d), 1));
            textures.direction = await canvasTexture(THREE, await svgToCanvas(renderSign('direction', style, d, { arrow: side === 'left' ? 'right' : 'left' }), 1));
        } catch (err) {
            console.warn('指標貼圖失敗', err);
        }
        textures.stop = await canvasTexture(THREE, stopMarkerCanvas(spec.cars), true);
        stations.push({
            idx: k, id: rs.id, s: rs.s, sStop, p1: sStop + 8, p0: sStop + 8 - spec.platform, side,
            name: d.name, sub: d.sub, data: d, textures,
            transfer: transfersOf(rs.id, line.id)
        });
        setLoad(0.5 + 0.45 * (k + 1) / n, `繪製指標:${d.name}`);
    }

    // 速限標誌:限速區段起點
    const limitSigns = [];
    const texCache = new Map();
    for (let i = 1; i < route.limit.length; i++) {
        const v = route.limit[i];
        if (v < route.limit[i - 1]) {
            if (!texCache.has(v)) texCache.set(v, await canvasTexture(THREE, limitCanvas(v), true));
            limitSigns.push({ s: Math.max(0, i * route.step - 30), v, tex: texCache.get(v) });
        }
    }

    // 捷運高運量為第三軌供電(無架空線);輕軌、台鐵、高鐵有架空線
    const termName = stations[stations.length - 1].name;
    const world = new DriveWorld(el.querySelector('[data-canvas]'), {
        route, env, time: cfg.time, quality: cfg.quality || 'medium', stations, spec, assets, platformSide: side,
        overhead: line.type !== 'metro', limitSigns, destText: `${line.code ? line.code + ' ' : ''}往 ${termName}`
    });
    setLoad(0.97, '載入天空與環境光');
    await world.ready;

    // 駕駛艙螢幕
    const speedCv = document.createElement('canvas'); speedCv.width = 256; speedCv.height = 180;
    const infoCv = document.createElement('canvas'); infoCv.width = 512; infoCv.height = 300;
    world.setScreens(speedCv, infoCv);

    session = new DriveSession({ ctx, cfg, el, world, route, stations, spec, line, announcer, trainLen, side, env, speedCv, infoCv, leg });
    el.querySelector('[data-loading]').remove();
    session.start();
    if (window.v2) window.v2.drive = session; // 除錯用(同 window.v2)
}

// =====================================================
// 行駛中
// =====================================================

class DriveSession {
    constructor(o) {
        Object.assign(this, o);
        this.train = createTrain(this.spec, this.stations[0].sStop);
        this.target = 1;              // 下一個停靠站索引
        this.phase = 'dwell';         // dwell(停站)/ run
        this.doors = 'open';          // open / closing / closed
        this.dwellLeft = 8;
        this.results = [];
        this.time = 0;
        this.legStart = 0;
        this.announced = { arrive: -1, depart: -1 };
        this.paused = false;
        this.msg = null;
        this.screenTimer = 0;
        this.firstDeparture = true;
        this.timeScale = 1; // 測試用:自動化測試在低幀率環境下加速模擬
        this.departOk = (st) => !(st.idx === this.target - 1 && this.phase === 'dwell' && this.doors !== 'closed');
        this.buildHud();
        this.bind();
    }

    start() {
        this.last = performance.now();
        this.loop = this.loop.bind(this);
        this.raf = requestAnimationFrame(this.loop);
        this.flash(`${this.stations[0].name}・旅客上車中,停站時間結束後按 D 關門`, 6);
        this.announcer.english = this.cfg.english;
        this.announcer.onState = (on, label) => {
            const c = this.el.querySelector('[data-caption]');
            if (c) { c.hidden = !on; c.textContent = label || ''; }
        };
    }

    // ------------------------------------------------------------------
    // HUD
    // ------------------------------------------------------------------

    buildHud() {
        const L = this.line;
        const hud = document.createElement('div');
        hud.className = 'dv-hud';
        const notches = [];
        for (let k = this.spec.P; k >= -(this.spec.B + 1); k--) notches.push(k);
        const term = this.stations[this.stations.length - 1];
        hud.innerHTML = `
            <div class="dv-top-left">
                <div class="dv-line"><span class="code-badge" style="background:${L.color};color:${contrastText(L.color)}">${esc(L.code || '—')}</span>
                    <div><small>${esc(L.name)}・${esc(this.spec.name)} ${this.spec.cars} 節</small><b>往 ${esc(term.name)}</b></div></div>
                <div class="dv-next"><small data-next-label>下一站</small><b data-next-name></b><span data-next-sub></span><em data-next-dist></em></div>
            </div>
            <div class="dv-top-center"><div class="dv-clock" data-clock>00:00</div><div class="dv-msg" data-msg hidden></div></div>
            <div class="dv-route" data-route>${this.stations.map((s, i) => `<div class="dv-rs" data-rs="${i}"><i></i><span>${esc(s.name)}</span><em data-rs-grade="${i}"></em></div>`).join('')}</div>
            <div class="dv-caption" data-caption hidden></div>
            <div class="dv-bottom">
                <div class="dv-notch" data-notch>${notches.map(k => `<span data-n="${k}" class="${k > 0 ? 'p' : k < 0 ? 'b' : 'n'}">${notchLabel(k, this.spec)}</span>`).join('')}</div>
                <div class="dv-meter">
                    <svg viewBox="0 0 220 130" class="dv-gauge"><path d="M20 120A90 90 0 0 1 200 120" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="12" stroke-linecap="round"/>
                        <path data-arc d="" fill="none" stroke="#F2B01E" stroke-width="12" stroke-linecap="round"/>
                        <path data-limit-tick d="" stroke="#E5484D" stroke-width="5"/></svg>
                    <div class="dv-speed"><b data-speed>0</b><small>km/h</small></div>
                    <div class="dv-limit" data-limit></div>
                    <div class="dv-flags"><span data-atp>ATP</span><span data-doors>車門</span><span data-sig>號誌</span></div>
                </div>
                <div class="dv-stopguide" data-guide hidden>
                    <small>停車位置</small>
                    <div class="dv-ruler"><i class="dv-target"></i><i class="dv-tol" data-tol></i><i class="dv-me" data-me></i></div>
                    <b data-guide-dist></b><span data-assist></span>
                </div>
                <div class="dv-btns">
                    <button data-cmd="power">▲ 牽引</button><button data-cmd="brake">▼ 制動</button>
                    <button data-cmd="doors">D 車門</button><button data-cmd="eb" class="eb">EB</button>
                    <button data-cmd="pause">❚❚</button>
                </div>
            </div>
            <div class="dv-pause" data-pause hidden></div>`;
        this.el.appendChild(hud);
        this.hud = hud;
        this.q = (s) => hud.querySelector(s);
        hud.querySelector('.dv-btns').addEventListener('click', (e) => {
            const b = e.target.closest('[data-cmd]');
            if (!b) return;
            this.announcer.unlock();
            ({ power: () => this.setNotch(this.train.notch + 1), brake: () => this.setNotch(this.train.notch - 1), doors: () => this.toggleDoors(), eb: () => this.setNotch(-(this.spec.B + 1)), pause: () => this.togglePause() })[b.dataset.cmd]();
        });
    }

    flash(text, secs = 3, warn = false) {
        this.msg = { text, until: this.time + secs, warn };
        const m = this.q('[data-msg]');
        m.textContent = text;
        m.classList.toggle('warn', warn);
        m.hidden = false;
    }

    updateHud() {
        const t = this.train;
        const q = this.q;
        const v = t.v * 3.6;
        const lim = nextLimit(this.route, t.s, 600);
        q('[data-speed]').textContent = Math.round(v);
        const ang = (u) => Math.PI * (1 - Math.min(1, u));
        const arc = (u) => { const a = ang(u); return `M20 120A90 90 0 0 1 ${110 + 90 * Math.cos(a)} ${120 - 90 * Math.sin(a)}`; };
        q('[data-arc]').setAttribute('d', v > 0.5 ? arc(v / this.spec.vmax) : '');
        const la = ang(lim.current / this.spec.vmax);
        q('[data-limit-tick]').setAttribute('d', `M${110 + 78 * Math.cos(la)} ${120 - 78 * Math.sin(la)}L${110 + 102 * Math.cos(la)} ${120 - 102 * Math.sin(la)}`);
        q('[data-limit]').innerHTML = `限速 <b>${lim.current}</b>` + (this.cfg.assist && lim.next < lim.current ? `<span>前方 ${Math.round(lim.at - t.s)} m 限 ${lim.next}</span>` : '');
        q('[data-atp]').classList.toggle('on', t.atp);
        const doorTxt = { open: '車門開', closing: '關門中', closed: '車門關' }[this.doors];
        const dEl = q('[data-doors]');
        dEl.textContent = `${this.side === 'left' ? '◀' : '▶'} ${doorTxt}`;
        dEl.className = this.doors === 'closed' ? 'ok' : 'on';
        const prevSt = this.stations[this.target - 1];
        const sigOk = prevSt ? this.departOk(prevSt) : true;
        const sEl = q('[data-sig]');
        sEl.textContent = sigOk ? '出發 ●' : '號誌 ●';
        sEl.className = sigOk ? 'ok' : 'on';
        q('[data-notch]').querySelectorAll('span').forEach(s => s.classList.toggle('cur', +s.dataset.n === t.notch));

        // 下一站
        const st = this.stations[Math.min(this.target, this.stations.length - 1)];
        const dist = st.sStop - t.s;
        const atStop = this.phase === 'dwell';
        const term = this.target >= this.stations.length - 1;
        q('[data-next-label]').textContent = atStop ? '停靠中' : term ? '終點站' : '下一站';
        const showSt = atStop ? this.stations[this.target - 1] : st;
        q('[data-next-name]').textContent = showSt.name;
        q('[data-next-sub]').textContent = showSt.sub || '';
        q('[data-next-dist]').textContent = atStop ? (this.doors === 'open' ? (this.dwellLeft > 0 ? `停站 ${Math.ceil(this.dwellLeft)} 秒` : '可關門 D') : this.doors === 'closing' ? '關門中' : '可出發') : dist > 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.max(0, Math.round(dist))} m`;

        // 停車導引(500 m 內)
        const guide = q('[data-guide]');
        const show = !atStop && dist < 500 && dist > -40;
        guide.hidden = !show;
        if (show) {
            const tol = this.cfg.tol;
            const range = dist > 50 ? 500 : dist > 8 ? 50 : 8;
            const pos = Math.max(-1, Math.min(1, -dist / range));
            q('[data-me]').style.left = `${50 + pos * 48}%`;
            q('[data-tol]').style.width = `${Math.min(96, tol / range * 96)}%`;
            q('[data-guide-dist]').textContent = Math.abs(dist) < 10 ? `${dist >= 0 ? '還有' : '超過'} ${Math.abs(dist).toFixed(2)} m` : `${Math.round(dist)} m`;
            const sug = this.cfg.assist ? suggestNotch(t, this.spec, dist) : null;
            q('[data-assist]').textContent = sug && t.v > 0.3 ? `建議 ${notchLabel(-sug, this.spec)}` : '';
        }
        // 路線圖
        this.q('[data-route]').querySelectorAll('[data-rs]').forEach(r => {
            const i = +r.dataset.rs;
            r.classList.toggle('done', atStop ? i < this.target - 1 : i < this.target);
            r.classList.toggle('here', atStop && i === this.target - 1);
            r.classList.toggle('next', !atStop && i === this.target);
        });
        const mm = Math.floor(this.time / 60), ss = Math.floor(this.time % 60);
        q('[data-clock]').textContent = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
        if (this.msg && this.time > this.msg.until) { q('[data-msg]').hidden = true; this.msg = null; }
    }

    drawScreens() {
        const t = this.train;
        const g = this.speedCv.getContext('2d');
        g.fillStyle = '#06110D'; g.fillRect(0, 0, 256, 180);
        g.fillStyle = t.atp ? '#FF5A4E' : '#7CFFB2';
        g.font = '700 86px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(Math.round(t.v * 3.6)), 128, 74);
        g.font = '600 22px Consolas, monospace';
        g.fillStyle = '#A9C7B8';
        g.fillText(`LIMIT ${nextLimit(this.route, t.s).current}  ${notchLabel(t.notch, this.spec)}`, 128, 150);
        const h = this.infoCv.getContext('2d');
        h.fillStyle = '#06110D'; h.fillRect(0, 0, 512, 300);
        h.fillStyle = this.line.color; h.fillRect(0, 0, 512, 46);
        h.fillStyle = contrastText(this.line.color);
        h.font = '700 28px "Microsoft JhengHei", sans-serif'; h.textAlign = 'left'; h.textBaseline = 'middle';
        h.fillText(`${this.line.code || ''} ${this.line.name}`, 16, 24);
        const st = this.stations[Math.min(this.target, this.stations.length - 1)];
        h.fillStyle = '#E8F5EE';
        h.font = '800 54px "Microsoft JhengHei", sans-serif';
        h.fillText(this.phase === 'dwell' ? this.stations[this.target - 1].name : st.name, 16, 120);
        h.font = '500 26px Consolas, "Microsoft JhengHei", monospace';
        h.fillStyle = '#A9C7B8';
        const d = st.sStop - t.s;
        h.fillText(this.phase === 'dwell' ? `DOORS ${this.doors.toUpperCase()}` : `NEXT ${Math.max(0, Math.round(d))} m`, 16, 200);
        h.fillText(`ODO ${(t.odo / 1000).toFixed(2)} km`, 16, 252);
    }

    // ------------------------------------------------------------------
    // 操作
    // ------------------------------------------------------------------

    setNotch(n) {
        const min = -(this.spec.B + 1), max = this.spec.P;
        n = Math.max(min, Math.min(max, n));
        if (n > 0 && this.doors !== 'closed') { this.flash('車門未關閉,無法牽引', 2, true); n = Math.min(n, 0); }
        if (n > 0 && this.phase === 'dwell' && !this.departOk(this.stations[this.target - 1])) { this.flash('出發號誌未開放', 2, true); n = 0; }
        this.train.notch = n;
    }

    toggleDoors() {
        const t = this.train;
        if (this.doors === 'closing') return;
        if (this.doors === 'open') {
            if (this.dwellLeft > 0) { this.flash(`旅客上下車中,還要 ${Math.ceil(this.dwellLeft)} 秒`, 2); return; }
            if (this.phase === 'dwell' && this.target >= this.stations.length) return;
            this.doors = 'closing';
            this.announcer.announce(scriptDoorsClosing(), `${PHRASES.zh_doors_closing.text} ${PHRASES.en_doors_closing.text}`);
            this.doorTimer = 3.5;
            return;
        }
        // 開門:必須停妥且在月台範圍
        if (t.v > 0.05) { this.flash('列車尚未停妥', 2, true); return; }
        const st = this.stations[this.target];
        if (!st || this.phase === 'dwell') return;
        const err = t.s - st.sStop;
        if (err < -this.cfg.tol) { this.flash(`停車不到位:還差 ${(-err).toFixed(2)} m,請再往前`, 3, true); return; }
        if (t.s - this.trainLen > st.p1 || t.s < st.p0) { this.flash('不在月台範圍內', 3, true); return; }
        if (t.notch > -1) { this.flash('開門前請先施加制動', 2, true); return; }
        this.arrive(st, err);
    }

    arrive(st, err) {
        const grade = gradeStop(err, this.cfg.tol);
        const legTime = this.time - this.legStart;
        const prev = this.stations[this.target - 1];
        const ideal = (st.s - prev.s) / (this.spec.vmax / 3.6 * 0.72) + 20;
        this.results.push({ name: st.name, err, grade, legTime, ideal });
        const tag = this.q(`[data-rs-grade="${st.idx}"]`);
        if (tag) { tag.textContent = grade.label; tag.className = grade.key; }
        this.flash(`${grade.label}・停車誤差 ${err >= 0 ? '+' : ''}${(err * 100).toFixed(0)} cm`, 4, grade.key === 'miss');
        this.phase = 'dwell';
        this.doors = 'open';
        this.dwellLeft = DWELL;
        this.target++;
        if (this.target >= this.stations.length) {
            setTimeout(() => this.finish(), 2500);
        }
    }

    togglePause(force) {
        this.paused = force ?? !this.paused;
        const p = this.q('[data-pause]');
        p.hidden = !this.paused;
        if (this.paused) {
            p.innerHTML = `<div class="dv-card"><h3>暫停</h3>
                <button class="btn btn-primary block" data-p="resume">繼續駕駛</button>
                <button class="btn block" data-p="mute">${this.announcer.muted ? '開啟聲音' : '靜音'}</button>
                <button class="btn block" data-p="credits">模型與素材來源</button>
                <button class="btn block" data-p="restart">從起站重新開始</button>
                <button class="btn block btn-danger" data-p="exit">結束駕駛,回到路網</button></div>`;
            p.onclick = (e) => {
                const b = e.target.closest('[data-p]');
                if (!b) return;
                const a = b.dataset.p;
                if (a === 'resume') this.togglePause(false);
                else if (a === 'mute') { this.announcer.muted = !this.announcer.muted; this.togglePause(true); }
                else if (a === 'credits') this.showCredits();
                else if (a === 'restart') this.restart();
                else if (a === 'exit') this.exit();
            };
        } else {
            this.last = performance.now();
        }
    }

    bind() {
        this.onKey = (e) => {
            if (document.querySelector('.modal-overlay')) return;
            this.announcer.unlock();
            const k = e.key.toLowerCase();
            const handled = () => { e.preventDefault(); e.stopPropagation(); };
            if (k === 'escape' || k === 'p') { handled(); if (this.finished) this.exit(); else this.togglePause(); return; }
            if (this.paused || this.finished) return;
            if (e.repeat && !['arrowup', 'arrowdown', 'w', 's'].includes(k)) { handled(); return; }
            if (k === 'arrowup' || k === 'w') { handled(); if (!e.repeat || this._rep()) this.setNotch(this.train.notch + 1); }
            else if (k === 'arrowdown' || k === 's') { handled(); if (!e.repeat || this._rep()) this.setNotch(this.train.notch - 1); }
            else if (k === 'n' || k === '0') { handled(); this.setNotch(0); }
            else if (k === 'e' || k === 'backspace') { handled(); this.setNotch(-(this.spec.B + 1)); }
            else if (k === 'd') { handled(); this.toggleDoors(); }
            else if (k === 'h') { handled(); this.announcer.horn(true); }
            else if (k === 'm') { handled(); this.announcer.muted = !this.announcer.muted; this.flash(this.announcer.muted ? '已靜音' : '已開啟聲音', 1.5); if (this.announcer.muted) this.announcer.stop(); }
            else if (k === 'r') { handled(); if (this.lastScript) this.announcer.announce(this.lastScript.parts, this.lastScript.label); }
            else if (k === 'c') { handled(); this.world.look.yaw = 0; this.world.look.pitch = -0.07; }
            else if (k === 'v') {
                handled();
                const order = ['cab', 'chase', 'side'];
                const next = order[(order.indexOf(this.world.view) + 1) % order.length];
                this.world.look.yaw = 0; this.world.look.pitch = next === 'cab' ? -0.07 : 0;
                this.world.setView(next);
                this.flash({ cab: '駕駛室視角', chase: '車外追蹤視角', side: '車側視角' }[next], 1.5);
            }
        };
        this.onKeyUp = (e) => { if (e.key.toLowerCase() === 'h') this.announcer.horn(false); };
        window.addEventListener('keydown', this.onKey, true);
        window.addEventListener('keyup', this.onKeyUp, true);
        const cv = this.el.querySelector('[data-canvas]');
        this.onWheel = (e) => {
            e.preventDefault();
            if (this.paused || this.finished) return;
            const now = performance.now();
            if (now - (this._wheelT || 0) < 120) return;
            this._wheelT = now;
            this.setNotch(this.train.notch + (e.deltaY < 0 ? 1 : -1));
        };
        cv.addEventListener('wheel', this.onWheel, { passive: false });
        cv.addEventListener('pointerdown', (e) => {
            this.announcer.unlock();
            const sx = e.clientX, sy = e.clientY, y0 = this.world.look.yaw, p0 = this.world.look.pitch;
            const move = (ev) => {
                this.world.look.yaw = Math.max(-1.3, Math.min(1.3, y0 - (ev.clientX - sx) * 0.004));
                this.world.look.pitch = Math.max(-0.7, Math.min(0.45, p0 - (ev.clientY - sy) * 0.004));
            };
            const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
        });
        cv.addEventListener('dblclick', () => { this.world.look.yaw = 0; this.world.look.pitch = -0.07; });
        this.onResize = () => this.world.resize();
        window.addEventListener('resize', this.onResize);
    }

    _rep() {
        const now = performance.now();
        if (now - (this._repT || 0) < 160) return false;
        this._repT = now;
        return true;
    }

    // ------------------------------------------------------------------
    // 主迴圈
    // ------------------------------------------------------------------

    loop(now) {
        if (!session || session !== this) return;
        const dt = Math.min(0.1, (now - this.last) / 1000) * this.timeScale;
        this.last = now;
        if (!this.paused && !this.finished) {
            const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
            for (let i = 0; i < sub; i++) this.step(dt / sub);
            this.time += dt;
        }
        this.screenTimer -= dt;
        const dirty = this.screenTimer <= 0;
        if (dirty) { this.screenTimer = 0.2; this.drawScreens(); }
        this.world.update({ s: this.train.s, v: this.train.v, notch: this.train.notch, time: this.time, dt: this.paused ? 0 : dt, departOk: this.departOk, screensDirty: dirty });
        this.updateHud();
        this.announcer.motor(this.train.v / (this.spec.vmax / 3.6), this.train.notch > 0);
        this.raf = requestAnimationFrame(this.loop);
    }

    step(dt) {
        const t = this.train;
        // 停站計時與關門
        if (this.phase === 'dwell') {
            if (this.doors === 'open' && this.dwellLeft > 0) {
                this.dwellLeft -= dt;
                if (this.dwellLeft <= 0) this.flash(this.target >= this.stations.length ? '終點站' : '停站時間到,按 D 關門', 3);
            }
            if (this.doors === 'closing') {
                this.doorTimer -= dt;
                if (this.doorTimer <= 0) { this.doors = 'closed'; this.flash('車門已關閉・出發號誌開放', 2.5); }
            }
            if (this.doors === 'closed' && t.v > 0.3) {
                this.phase = 'run';
                this.legStart = this.time;
            }
        }
        const limit = nextLimit(this.route, t.s, 1).current;
        const ev = stepTrain(t, this.spec, dt, limit);
        if (ev.atpOn) this.flash(`ATP 超速制動(限速 ${limit})`, 3, true);

        if (this.phase !== 'run') return;
        const st = this.stations[this.target];
        if (!st) return;
        const prev = this.stations[this.target - 1];
        const dist = st.sStop - t.s;
        // 出站廣播:車頭駛出月台後
        if (this.announced.depart < this.target && t.s > prev.sStop + 25) {
            this.announced.depart = this.target;
            const term = this.stations[this.stations.length - 1];
            const parts = scriptDeparture({ next: st, terminal: term, nextTransfer: st.transfer, first: this.firstDeparture });
            const label = this.firstDeparture ? `歡迎搭乘,本列車開往 ${term.name}・下一站 ${st.name}` : `下一站 ${st.name}${st.sub ? ' Next station ' + st.sub : ''}`;
            this.say(parts, label);
            this.firstDeparture = false;
        }
        // 進站廣播:依速度提早,且不超過站距的六成
        const gap = st.s - prev.s;
        const trigger = Math.min(gap * 0.6, Math.max(260, t.v * 24));
        if (this.announced.arrive < this.target && dist < trigger && this.announced.depart >= this.target) {
            this.announced.arrive = this.target;
            const terminal = this.target === this.stations.length - 1;
            this.say(scriptArrival({ station: st, transfer: st.transfer, terminal, side: this.side }),
                terminal ? `終點站 ${st.name} 到了,請全部旅客下車` : `${st.name} 到了${st.transfer.inside.length ? `・可轉乘 ${st.transfer.inside.map(l => l.name).join('、')}` : ''}`);
        }
        // 冒進太多:越過月台後強制停車
        if (t.s > st.p1 + 60 && !this.overrun) {
            this.overrun = true;
            t.notch = -(this.spec.B + 1);
            this.flash(`冒進!已越過 ${st.name} 月台,緊急制動`, 4, true);
        }
        // 停妥時提示
        if (t.v === 0 && !this._stoppedHint && Math.abs(dist) < 60) {
            this._stoppedHint = true;
            const err = -dist;
            if (err < -this.cfg.tol) this.flash(`停車不到位:還差 ${(-err).toFixed(2)} m`, 3, true);
            else this.flash(`已停妥(誤差 ${err >= 0 ? '+' : ''}${(err * 100).toFixed(0)} cm),按 D 開門`, 4);
        }
        if (t.v > 0.2) this._stoppedHint = false;
        // 冒進後停車:自動以冒進結算,讓遊戲能繼續
        if (this.overrun && t.v === 0) {
            this.overrun = false;
            this.arrive(st, t.s - st.sStop);
            this.flash(`冒進 ${(t.s - this.stations[this.target - 1].sStop).toFixed(1)} m,本站不開門`, 4, true);
            this.doors = 'closed';
            this.dwellLeft = 0;
            if (this.target >= this.stations.length) return;
            // 冒進後回到停站狀態但車門未開:直接可出發
        }
    }

    say(parts, label) {
        this.lastScript = { parts, label };
        this.announcer.announce(parts, label);
    }

    finish() {
        if (this.finished) return;
        this.finished = true;
        const r = this.results;
        const avg = r.length ? Math.round(r.reduce((a, x) => a + x.grade.score, 0) / r.length) : 0;
        const rank = avg >= 92 ? 'S' : avg >= 80 ? 'A' : avg >= 65 ? 'B' : avg >= 45 ? 'C' : 'D';
        const fmt = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
        const p = this.q('[data-pause]');
        p.hidden = false;
        p.onclick = (e) => {
            const b = e.target.closest('[data-p]');
            if (b?.dataset.p === 'restart') this.restart();
            else if (b?.dataset.p === 'exit') this.exit();
        };
        p.innerHTML = `<div class="dv-card wide"><div class="dv-rank ${rank}">${rank}</div>
            <h3>${esc(this.line.name)}・${esc(this.stations[0].name)} → ${esc(this.stations[this.stations.length - 1].name)}</h3>
            <p class="hint">平均得分 ${avg}・行駛 ${(this.train.odo / 1000).toFixed(2)} km・總時間 ${fmt(this.time)}</p>
            <table class="help-table"><tr><th>車站</th><th>停車誤差</th><th>評等</th><th>站間時間</th><th>參考時間</th></tr>
            ${r.map(x => `<tr><td>${esc(x.name)}</td><td class="mono">${x.err >= 0 ? '+' : ''}${(x.err * 100).toFixed(0)} cm</td><td><span class="dv-grade ${x.grade.key}">${x.grade.label}</span></td><td class="mono">${fmt(x.legTime)}</td><td class="mono">${fmt(x.ideal)}</td></tr>`).join('')}</table>
            <div style="display:flex;gap:8px;margin-top:14px"><button class="btn" data-p="restart">再開一次</button><span class="grow" style="flex:1"></span><button class="btn btn-primary" data-p="exit">回到路網 <kbd>Esc</kbd></button></div></div>`;
    }

    showCredits() {
        const list = this.world.assets.rail?.credits() || [];
        const p = this.q('[data-pause]');
        const rows = list.map(c => `<tr><td>${esc(c.kind)}</td><td>${esc(c.title || c.id)}</td><td>${esc(c.author || '')}</td><td>${esc(c.license || '')}</td></tr>`).join('');
        p.innerHTML = `<div class="dv-card wide"><h3>模型與素材來源</h3>
            <p class="hint">列車、月台、街屋為 Blender 程序化建模;街道物件、樹木、天空與材質來自 Poly Haven(CC0);人物來自 Microsoft Rocketbox(MIT)。完整清單見 assets/rail/CREDITS.md。</p>
            <table class="help-table"><tr><th>類別</th><th>名稱</th><th>作者</th><th>授權</th></tr>${rows || '<tr><td colspan="4">未載入模型庫</td></tr>'}</table>
            <button class="btn btn-primary" data-p="resume" style="margin-top:12px">返回</button></div>`;
    }

    restart() {
        const { ctx, cfg, announcer } = this;
        this.exit(true);
        startDrive(ctx, cfg, announcer);
    }

    exit(keepAnnouncer = false) {
        cancelAnimationFrame(this.raf);
        window.removeEventListener('keydown', this.onKey, true);
        window.removeEventListener('keyup', this.onKeyUp, true);
        window.removeEventListener('resize', this.onResize);
        if (keepAnnouncer) { this.announcer.stop(); this.announcer.horn(false); this.announcer.motor(0, false); }
        else this.announcer.dispose();
        this.world.dispose();
        this.el.remove();
        document.body.classList.remove('drive-mode');
        session = null;
        if (window.v2) window.v2.drive = null;
        setTimeout(() => this.ctx.map.invalidateSize(), 0);
    }
}
