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
import { buildDriveRoute, suggestScale, nextLimit, applyProfile, poseAt } from './route3d.js';
import { stationLevel, getPortal, LEVEL_HEIGHT } from '../core/levels.js';
import { TRAIN_SPECS, createTrain, stepTrain, notchLabel, suggestNotch, gradeStop, atoNotch } from './physics.js';
import { Announcer, scriptDeparture, scriptArrival, scriptDoorsClosing } from './announcer.js';
import { PHRASES } from './phrases.js';
import { loadTrains, defaultTrain, composeSpec } from './trains.js';

const VIEW_NAMES = { cab: '駕駛室視角', third: '第三人稱視角', chase: '車外追蹤視角', side: '車側視角', aerial: '空拍視角' };
const ENVS = { auto: '依車站層級', underground: '全線地下', elevated: '全線高架', ground: '全線平面' };
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
    const trains = await loadTrains();
    const trainOpts = (sel) => Object.entries(trains).map(([k, t]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(t.name)}・${t.cars} 節</option>`).join('');

    const cfg = await openModal({
        title: '駕駛模式(3D)',
        size: 'mid',
        body: `<div class="modal-body drive-setup">
            <div class="field"><label>路線</label><select class="sel" id="dv-line">${lines.map(l => `<option value="${l.id}" ${l.id === lineId ? 'selected' : ''}>${esc((l.code ? l.code + ' ' : '') + l.name)}・${LINE_TYPES[l.type] || ''}</option>`).join('')}</select></div>
            <div class="field"><label>列車</label><select class="sel" id="dv-train"></select></div>
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
            <div class="toggle-row"><span>ATP 列車自動防護(關閉時超速不會自動制動,彎道過速可能出軌)</span><label class="switch"><input type="checkbox" id="dv-atp" ${prev.atp !== false ? 'checked' : ''}><span></span></label></div>
            <p class="hint" id="dv-info"></p>
            <p class="hint">廣播常用詞:${esc(announcer.sourceLabel)};站名與路線名使用瀏覽器/作業系統內建語音即時合成。
                沿途站名牌、柱面站名、方向指標使用「指標設計」的樣式。</p>
            <table class="help-table drive-keys">
                <tr><td><kbd>↑</kbd>/<kbd>W</kbd> <kbd>↓</kbd>/<kbd>S</kbd></td><td>主控制器:牽引 P ⇄ 惰行 N ⇄ 制動 B(滾輪亦可)</td><td><kbd>D</kbd></td><td>開門/關門</td></tr>
                <tr><td><kbd>E</kbd></td><td>緊急制動 EB</td><td><kbd>H</kbd></td><td>鳴笛</td></tr>
                <tr><td><kbd>N</kbd></td><td>回到惰行</td><td><kbd>R</kbd></td><td>重播廣播</td></tr>
                <tr><td>滑鼠拖曳</td><td>環顧(雙擊回正)</td><td><kbd>M</kbd> / <kbd>Esc</kbd></td><td>靜音 / 暫停選單</td></tr>
                <tr><td><kbd>V</kbd></td><td>視角:駕駛室 / 第三人稱 / 車外追蹤 / 車側 / 空拍</td><td><kbd>A</kbd></td><td>自動駕駛開關</td></tr>
                <tr><td><kbd>T</kbd></td><td>ATP 開/關</td><td><kbd>B</kbd></td><td>車內廣播(輸入文字或語音)</td></tr>
                <tr><td>主控制器</td><td colspan="3">按住握把上下拖曳(滑鼠或手指),或點刻度直接換檔;手動操作會解除自動駕駛</td></tr>
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
                $('#dv-train').innerHTML = trainOpts(defaultTrain(trains, line));
                info();
            };
            const info = () => {
                const line = store.getLine(lineId);
                const spec = composeSpec(line.type, trains[$('#dv-train').value]);
                let leg = null;
                try { leg = planLeg(ctx.view, lineId, $('#dv-from').value, $('#dv-to').value); } catch { /* */ }
                const prevScale = $('#dv-scale').value;
                if (!leg) {
                    $('#dv-info').textContent = '起訖站相同(非環狀線)或路段無法行駛。';
                    $('#dv-scale').innerHTML = opt({ 1: '實際距離' }, 1);
                    return;
                }
                const r = buildDriveRoute(leg.pathLL, leg.stops, { radius: spec.radius, vmax: spec.vmax, lead: spec.platform + 80, straight: spec.platform / 2 + 40 });
                const len = r.stations[r.stations.length - 1].s - r.stations[0].s;
                const sug = suggestScale(r);
                const scales = { 1: `實際距離(${(len / 1000).toFixed(1)} km)` };
                [0.5, 0.25, 0.1].forEach(k => { scales[k] = `縮為 ${k}×(${(len * k / 1000).toFixed(1)} km)`; });
                $('#dv-scale').innerHTML = opt(scales, prevScale && scales[prevScale] ? prevScale : (sug < 1 ? (sug >= 0.5 ? 0.5 : sug >= 0.25 ? 0.25 : 0.1) : 1));
                const avg = len / Math.max(1, leg.stops.length - 1);
                $('#dv-info').innerHTML = `${spec.name}・${spec.cars} 節 ${Math.round(spec.length || spec.cars * spec.carLen)} m・最高 ${spec.vmax} km/h・共 ${leg.stops.length} 站,平均站距 ${Math.round(avg)} m` +
                    (sug < 1 ? `<br>站距較長,建議縮小距離比例(全程約 ${Math.round(len / (spec.vmax / 3.6 * 0.6) / 60)} 分鐘)。` : '');
            };
            $('#dv-line').onchange = (e) => { lineId = e.target.value; fill(); };
            $('#dv-from').onchange = info;
            $('#dv-train').onchange = info;
            $('#dv-to').onchange = info;
            fill();
            const go = () => {
                const c = {
                    lineId, fromId: $('#dv-from').value, toId: $('#dv-to').value, trainId: $('#dv-train').value,
                    env: $('#dv-env').value, time: $('#dv-time').value, side: $('#dv-side').value,
                    scale: parseFloat($('#dv-scale').value) || 1, tol: parseFloat($('#dv-tol').value) || 1, quality: $('#dv-quality').value,
                    english: $('#dv-en').checked, assist: $('#dv-assist').checked, atp: $('#dv-atp').checked
                };
                if (!planLeg(ctx.view, c.lineId, c.fromId, c.toId)) { toast('起訖站相同(非環狀線)或路段無法行駛', { warn: true }); return; }
                sessionStorage.setItem('drive-setup', JSON.stringify({ env: c.env, time: c.time, side: c.side, tol: c.tol, quality: c.quality, english: c.english, assist: c.assist, atp: c.atp }));
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
    const trainDef = (await loadTrains())[cfg.trainId] || null;
    const spec = composeSpec(line.type, trainDef);
    const side = cfg.side === 'auto' ? (line.type === 'metro' ? 'left' : 'right') : cfg.side;
    const leg = planLeg(ctx.view, cfg.lineId, cfg.fromId, cfg.toId);
    const route = buildDriveRoute(leg.pathLL, leg.stops, { radius: spec.radius, scale: cfg.scale, vmax: spec.vmax, lead: spec.platform + 80, tail: 400, straight: spec.platform / 2 + 40 });
    // 高程剖面:各站層級(或全線統一)→ 軌面高度;相鄰兩站不同時依路線的出土段位置銜接
    const levelOf = (id) => cfg.env === 'auto' ? stationLevel(store.getStation(id), line) : cfg.env;
    const levels = route.stations.map(rs => levelOf(rs.id));
    applyProfile(route,
        levels.map(lv => ({ y: LEVEL_HEIGHT[lv], half: spec.platform / 2 })),
        route.stations.slice(0, -1).map((rs, k) => getPortal(line, rs.id, route.stations[k + 1].id)));
    const env = levels.every(l => l === levels[0]) ? levels[0] : 'mixed';
    const trainLen = spec.length || spec.cars * spec.carLen;

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
            idx: k, id: rs.id, s: rs.s, sStop, p1: sStop + 8, p0: sStop + 8 - spec.platform, side, level: levels[k],
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
        overhead: trainDef ? trainDef.collect === 'pan' : line.type !== 'metro', noPsd: trainDef ? trainDef.system === 'tra' || trainDef.system === 'thsr' : false, train: trainDef, limitSigns, destText: `${line.code ? line.code + ' ' : ''}往 ${termName}`
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
        this.atpOn = o.cfg.atp !== false;   // ATP 列車自動防護(可在設定或介面關閉)
        this.crash = null;                  // 出軌事故(ATP 關閉時彎道過速)
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
            if (!c) return;
            const t = c.querySelector('[data-caption-text]');
            // 廣播結束後跑馬燈至少要完整捲過一輪才收起
            clearTimeout(this._marqueeHide);
            if (!on) { this._marqueeHide = setTimeout(() => { c.hidden = true; t.textContent = ''; }, Math.max(0, (this._marqueeUntil || 0) - performance.now())); return; }
            c.hidden = false;
            if (t.textContent !== (label || '')) {
                t.textContent = label || '';
                // LED 跑馬燈:由右往左捲動,速度固定(約每秒 110 px)
                t.style.animation = 'none';
                void t.offsetWidth;
                const secs = Math.max(6, (t.scrollWidth + c.clientWidth) / 110);
                t.style.animationDuration = `${secs}s`;
                t.style.animation = '';
                this._marqueeUntil = performance.now() + secs * 1000;
            }
        };
        this.setAtp(this.atpOn, true);
    }

    // ------------------------------------------------------------------
    // HUD
    // ------------------------------------------------------------------

    buildHud() {
        const L = this.line;
        const hud = document.createElement('div');
        hud.className = 'dv-hud';
        const notches = this.notches = [];
        for (let k = this.spec.P; k >= -(this.spec.B + 1); k--) notches.push(k);
        const term = this.stations[this.stations.length - 1];
        const cls = (k) => k > 0 ? 'p' : k === 0 ? 'n' : k <= -(this.spec.B + 1) ? 'eb' : 'b';
        hud.innerHTML = `
            <div class="dv-top-left">
                <div class="dv-line"><span class="code-badge" style="background:${L.color};color:${contrastText(L.color)}">${esc(L.code || '—')}</span>
                    <div><small>${esc(L.name)}・${esc(this.spec.name)} ${this.spec.cars} 節</small><b>往 ${esc(term.name)}</b></div></div>
                <div class="dv-next"><small data-next-label>下一站</small><b data-next-name></b><span data-next-sub></span><em data-next-dist></em></div>
            </div>
            <div class="dv-top-center">
                <div class="dv-marquee" data-caption hidden><span data-caption-text></span></div>
                <div class="dv-clock" data-clock>00:00</div><div class="dv-msg" data-msg hidden></div>
                <div class="dv-pa" data-pa hidden>
                    <textarea data-pa-text maxlength="140" rows="2" placeholder="輸入要廣播的內容(例:本列車因號誌故障暫停,請旅客稍候)"></textarea>
                    <div class="dv-pa-row"><button class="btn" data-pa-mic title="用麥克風說話,轉成文字">🎤 語音輸入</button><span class="grow"></span>
                        <button class="btn" data-pa-cancel>取消</button><button class="btn btn-primary" data-pa-send>📢 播出</button></div>
                </div>
            </div>
            <button class="dv-route-toggle" data-cmd="route" title="站序">☰</button>
            <div class="dv-route" data-route>${this.stations.map((s, i) => `<div class="dv-rs" data-rs="${i}"><i></i><span>${esc(s.name)}</span><em data-rs-grade="${i}"></em></div>`).join('')}</div>
            <div class="dv-console" data-console>
                <div class="cs-unit cs-mc" title="主控制器:按住握把上下拖曳(或點刻度)換檔">
                    <div class="mc-label">主控制器</div>
                    <div class="mc-body">
                        <div class="mc-plate">${notches.map(k => `<span data-n="${k}" class="${cls(k)}">${notchLabel(k, this.spec)}</span>`).join('')}</div>
                        <div class="mc-slot" data-mc-slot style="--n:${notches.length}">
                            <div class="mc-knob" data-mc-knob><i></i><b></b></div>
                        </div>
                    </div>
                </div>
                <div class="cs-unit cs-gauge">
                    ${this.gaugeSvg()}
                    <div class="cs-digital"><b data-speed>0</b><small>km/h</small></div>
                </div>
                <div class="cs-unit cs-mid">
                    <div class="cs-lamps">
                        <span class="lamp" data-lamp="atp"><i></i>ATP</span>
                        <span class="lamp" data-lamp="doors"><i></i>車門</span>
                        <span class="lamp" data-lamp="sig"><i></i>出發</span>
                        <span class="lamp" data-lamp="ato"><i></i>自動</span>
                        <span class="lamp" data-lamp="eb"><i></i>緊急</span>
                    </div>
                    <div class="cs-tims">
                        <div class="tims-row"><span data-tims-label>下一站</span><b data-tims-name></b></div>
                        <div class="tims-row"><span>距離</span><b data-tims-dist></b><span>限速</span><b data-limit-v></b></div>
                        <div class="tims-limit" data-limit></div>
                        <div class="tims-guide" data-guide hidden>
                            <div class="dv-ruler"><i class="dv-target"></i><i class="dv-tol" data-tol></i><i class="dv-me" data-me></i></div>
                            <div class="tims-row"><b data-guide-dist></b><span data-assist></span></div>
                        </div>
                    </div>
                </div>
                <div class="cs-unit cs-btns">
                    <button class="pb door" data-cmd="doors" title="車門(D)"><span data-door-ico>◀▶</span><small data-door-txt>車門</small></button>
                    <button class="pb horn" data-cmd="horn" title="鳴笛(H,按住)"><span>📯</span><small>鳴笛</small></button>
                    <button class="pb ato" data-cmd="ato" title="自動駕駛(A)"><span class="key"><i></i></span><small>自動駕駛</small></button>
                    <button class="pb view" data-cmd="view" title="切換視角(V)"><span>🎥</span><small data-view-txt>駕駛室</small></button>
                    <button class="pb eb" data-cmd="eb" title="緊急制動(E)"><span></span><small>緊急制動</small></button>
                    <button class="pb pause" data-cmd="pause" title="暫停(Esc)"><span>❚❚</span><small>暫停</small></button>
                    <button class="pb atp-btn" data-cmd="atp" title="ATP 列車自動防護開/關(T)"><span>🛡</span><small data-atp-txt>ATP 開</small></button>
                    <button class="pb pa-btn" data-cmd="pa" title="車內廣播(B)"><span>📢</span><small>廣播</small></button>
                </div>
            </div>
            <div class="dv-pause" data-pause hidden></div>`;
        this.el.appendChild(hud);
        this.hud = hud;
        this.q = (s) => hud.querySelector(s);
        this.bindConsole();
    }

    /** 類比速度表(SVG):270° 刻度、指針、限速標記 */
    gaugeSvg() {
        const vmax = this.spec.vmax;
        const major = vmax > 200 ? 50 : vmax > 100 ? 20 : 10;
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
        this.gaugeAng = ang;
        this.gaugeArc = arc;
        return `<svg viewBox="0 0 200 200" class="cs-dial">
            <defs><radialGradient id="dvBezel" cx="40%" cy="30%"><stop offset="0" stop-color="#F4F6F7"/><stop offset=".55" stop-color="#8E979C"/><stop offset="1" stop-color="#3B4246"/></radialGradient>
                <radialGradient id="dvFace" cx="50%" cy="40%"><stop offset="0" stop-color="#20272B"/><stop offset="1" stop-color="#0B0E10"/></radialGradient></defs>
            <circle cx="100" cy="100" r="98" fill="url(#dvBezel)"/>
            <circle cx="100" cy="100" r="90" fill="url(#dvFace)" stroke="#000" stroke-width="2"/>
            <path d="${arc(-225, 45, 86)}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="6"/>
            <path data-ok-arc d="" fill="none" stroke="#2FB36B" stroke-width="6"/>
            <path data-over-arc d="" fill="none" stroke="#E5484D" stroke-width="6"/>
            <g class="cs-ticks">${ticks}</g>
            <text x="100" y="146" class="cs-unit-txt">km/h</text>
            <g data-limit-mark><path d="M100 10l-6 -0.1 6 11 6 -11z" fill="#FF4B4B" stroke="#000" stroke-width=".8"/></g>
            <g data-needle><path d="M97.6 100L100 22 102.4 100z" fill="#FF6A2B"/><path d="M98 100h4l-1 18h-2z" fill="#FF6A2B"/></g>
            <circle cx="100" cy="100" r="9" fill="#2A3034" stroke="#9AA3A8" stroke-width="2"/>
            <circle cx="96" cy="96" r="70" fill="url(#dvFace)" opacity="0"/>
            <path d="M30 60A80 80 0 0 1 150 28" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="16" stroke-linecap="round"/>
        </svg>`;
    }

    /** 主控制器拖曳、按鈕(含按住鳴笛)、站序面板開合 */
    bindConsole() {
        const slot = this.q('[data-mc-slot]');
        const pick = (clientY) => {
            const r = slot.getBoundingClientRect();
            const u = (clientY - r.top) / r.height;
            const i = Math.max(0, Math.min(this.notches.length - 1, Math.round(u * this.notches.length - 0.5)));
            return this.notches[i];
        };
        const manual = (n) => {
            if (this.paused || this.finished) return;
            if (this.ato) { this.setAto(false); this.flash('手動操作主控制器,自動駕駛解除', 2.5, true); }
            if (n !== this.train.notch) { this.setNotch(n); navigator.vibrate?.(8); }
        };
        slot.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.announcer.unlock();
            try { slot.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
            slot.classList.add('grab');
            manual(pick(e.clientY));
            const move = (ev) => manual(pick(ev.clientY));
            const up = () => { slot.classList.remove('grab'); slot.removeEventListener('pointermove', move); slot.removeEventListener('pointerup', up); slot.removeEventListener('pointercancel', up); };
            slot.addEventListener('pointermove', move);
            slot.addEventListener('pointerup', up);
            slot.addEventListener('pointercancel', up);
        });
        this.q('.mc-plate').addEventListener('click', (e) => {
            const n = e.target.closest('[data-n]');
            if (n) manual(+n.dataset.n);
        });
        const horn = this.q('[data-cmd="horn"]');
        const hornOff = () => { horn.classList.remove('on'); this.announcer.horn(false); };
        horn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.announcer.unlock(); horn.classList.add('on'); this.announcer.horn(true); try { horn.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ } });
        horn.addEventListener('pointerup', hornOff);
        horn.addEventListener('pointercancel', hornOff);
        this.hud.addEventListener('click', (e) => {
            const b = e.target.closest('[data-cmd]');
            if (!b || b.dataset.cmd === 'horn') return;
            this.announcer.unlock();
            const act = {
                doors: () => this.toggleDoors(),
                eb: () => { if (this.ato) this.setAto(false); this.setNotch(-(this.spec.B + 1)); },
                ato: () => this.setAto(!this.ato),
                view: () => this.cycleView(),
                pause: () => this.togglePause(),
                atp: () => this.setAtp(!this.atpOn),
                pa: () => this.openPA(),
                route: () => this.hud.classList.toggle('show-route')
            }[b.dataset.cmd];
            if (act && (!this.finished || b.dataset.cmd === 'route')) act();
        });
    }

    setAto(on) {
        this.ato = !!on;
        this.train.atoStop = false;
        this.flash(on ? '自動駕駛(ATO)啟動:自動加減速、停車與開關門' : '自動駕駛解除,改為手動駕駛', 2.5);
    }

    /** ATP 開/關:關閉後超速不會自動制動,彎道過速可能出軌 */
    setAtp(on, quiet = false) {
        this.atpOn = !!on;
        if (!on) { this.train.atp = false; }
        const b = this.q('[data-cmd="atp"]');
        b?.classList.toggle('off', !on);
        const tx = this.q('[data-atp-txt]');
        if (tx) tx.textContent = on ? 'ATP 開' : 'ATP 關';
        if (!quiet) this.flash(on ? 'ATP 已投入:超速時自動制動' : 'ATP 已切除:超速不會自動制動,彎道過速可能出軌!', 3, !on);
    }

    // ---- 車內廣播:輸入文字(或麥克風語音輸入)→ 即時合成語音播出,跑馬燈同步 ----
    openPA() {
        const p = this.q('[data-pa]');
        if (!p.hidden) { this.closePA(); return; }
        p.hidden = false;
        const ta = p.querySelector('[data-pa-text]');
        ta.focus();
        if (!this._paBound) {
            this._paBound = true;
            p.querySelector('[data-pa-send]').onclick = () => this.sendPA();
            p.querySelector('[data-pa-cancel]').onclick = () => this.closePA();
            const mic = p.querySelector('[data-pa-mic]');
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) { mic.disabled = true; mic.title = '此瀏覽器不支援語音輸入(請用 Chrome 或 Edge)'; }
            mic.onclick = () => {
                if (this._rec) { this._rec.stop(); return; }
                const rec = this._rec = new SR();
                rec.lang = 'zh-TW';
                rec.interimResults = true;
                rec.continuous = false;
                const base = ta.value;
                rec.onresult = (e) => { ta.value = base + Array.from(e.results).map(r => r[0].transcript).join(''); };
                rec.onend = () => { this._rec = null; mic.classList.remove('rec'); mic.textContent = '🎤 語音輸入'; };
                rec.onerror = (e) => { this.flash(`語音輸入失敗:${e.error === 'not-allowed' ? '未允許使用麥克風' : e.error}`, 3, true); };
                mic.classList.add('rec');
                mic.textContent = '● 錄音中…(再按一次停止)';
                try { rec.start(); } catch { this._rec = null; }
            };
        }
    }

    closePA() {
        const p = this.q('[data-pa]');
        p.hidden = true;
        this._rec?.stop();
    }

    sendPA() {
        const ta = this.q('[data-pa-text]');
        const text = ta.value.trim();
        if (!text) { ta.focus(); return; }
        this.announcer.unlock();
        this.announcer.announceText(text);
        this.flash('車內廣播播出中', 2);
        ta.value = '';
        this.closePA();
    }

    /** ATP 用的限速:前方較低限速依常用制動減速度換算成「現在」允許的速度(提早制動,不會衝進彎道) */
    atpLimit(t, current) {
        const nl = nextLimit(this.route, t.s, 900);
        if (nl.next >= current) return current;
        const b = this.spec.brake * 0.75;
        const allow = Math.sqrt((nl.next / 3.6) ** 2 + 2 * b * Math.max(0, nl.at - t.s)) * 3.6;
        return Math.min(current, Math.max(nl.next, allow));
    }

    /** 彎道過速出軌:高架墜落地面、地下(隧道/引道)撞擊牆壁、平面衝出軌道 → 遊戲結束 */
    derail(limit) {
        const t = this.train, s = t.s;
        const kind0 = this.world._kindAt(s);
        const h = this.route.ys ? this.route.ys[Math.min(this.route.ys.length - 1, Math.round(s))] : 0;
        const kind = kind0 === 'tunnel' || kind0 === 'station-under' || kind0 === 'trough' ? 'wall' : (kind0 === 'viaduct' && h > 2.6) ? 'fall' : 'off';
        // 離心方向:彎道外側
        const a = poseAt(this.route, s), b = poseAt(this.route, s + 15);
        const turn = b.tx * -a.tz + b.tz * a.tx;   // 前方切線在左右方向的分量
        const out = turn > 0 ? -1 : 1;
        this.crash = { kind, out, s0: s, v0: t.v, t: 0, h, limit, vKmh: t.v * 3.6, shown: false };
        this.world.crashFx = this.crash;
        this.setAto(false);
        this.announcer.stop();
        this.announcer.stopBuzzer?.();
        this.announcer.crash(kind);
        this.flash({ fall: '出軌!列車自高架墜落', wall: '出軌!列車撞擊隧道壁', off: '出軌!列車衝出軌道' }[kind], 6, true);
        this.el.classList.add('dv-crash');
    }

    /** 事故動畫期間列車沿軌道滑行的里程 */
    crashStep(dt) {
        const c = this.crash;
        c.t += dt;
        const stopT = c.kind === 'wall' ? 0.8 : c.kind === 'fall' ? 1.6 : 2.6;
        const u = Math.min(c.t, stopT);
        this.train.s = c.s0 + c.v0 * (u - u * u / (2 * stopT)) * (c.kind === 'fall' ? 0.7 : 1);
        this.train.v = Math.max(0, c.v0 * (1 - c.t / stopT));
        if (c.t > 3.2 && !c.shown) { c.shown = true; this.gameOver(); }
    }

    gameOver() {
        this.finished = true;
        const c = this.crash;
        const title = { fall: '列車於高架段出軌,墜落地面', wall: '列車於地下段出軌,撞擊隧道壁', off: '列車於平面段出軌,衝出軌道' }[c.kind];
        const p = this.q('[data-pause]');
        p.hidden = false;
        p.onclick = (e) => {
            const b = e.target.closest('[data-p]');
            if (b?.dataset.p === 'restart') this.restart();
            else if (b?.dataset.p === 'exit') this.exit();
        };
        p.innerHTML = `<div class="dv-card wide dv-gameover"><h3>出軌事故・遊戲結束</h3>
            <p class="dv-go-title">${esc(title)}</p>
            <p class="hint">彎道限速 ${c.limit} km/h,事故時速度 ${Math.round(c.vKmh)} km/h(超過 ${Math.round(c.vKmh - c.limit)} km/h)。
                ATP 切除時,進彎前務必依限速預告提早減速。</p>
            <div style="display:flex;gap:8px;margin-top:14px"><button class="btn btn-primary" data-p="restart">從起站重新開始</button><span class="grow" style="flex:1"></span><button class="btn" data-p="exit">回到路網 <kbd>Esc</kbd></button></div></div>`;
    }

    cycleView() {
        const order = ['cab', 'third', 'chase', 'side', 'aerial'];
        const next = order[(order.indexOf(this.world.view) + 1) % order.length];
        this.world.look.yaw = 0;
        this.world.look.pitch = next === 'cab' ? -0.07 : 0;
        this.world.setView(next);
        this.flash(VIEW_NAMES[next], 1.5);
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
        const vmax = this.spec.vmax;
        // 速度表:指針、綠色(限速內)/紅色(超過限速)弧、限速標記
        q('[data-speed]').textContent = Math.round(v);
        q('[data-needle]').setAttribute('transform', `rotate(${(this.gaugeAng(v) + 90).toFixed(2)} 100 100)`);
        q('[data-limit-mark]').setAttribute('transform', `rotate(${(this.gaugeAng(lim.current) + 90).toFixed(2)} 100 100)`);
        const a0 = this.gaugeAng(0), av = this.gaugeAng(Math.min(v, lim.current)), al = this.gaugeAng(lim.current);
        q('[data-ok-arc]').setAttribute('d', v > 0.5 ? this.gaugeArc(a0, av, 86) : '');
        q('[data-over-arc]').setAttribute('d', v > lim.current ? this.gaugeArc(al, this.gaugeAng(Math.min(v, vmax)), 86) : '');
        q('[data-limit-v]').textContent = `${lim.current}`;
        q('[data-limit]').textContent = this.cfg.assist && lim.next < lim.current ? `前方 ${Math.round(lim.at - t.s)} m 限速 ${lim.next}` : '';
        // 指示燈
        const prevSt = this.stations[this.target - 1];
        const sigOk = prevSt ? this.departOk(prevSt) : true;
        const lamp = (k, cls) => { q(`[data-lamp="${k}"]`).className = `lamp ${cls || ''}`; };
        lamp('atp', t.atp ? 'red blink' : '');
        lamp('doors', this.doors === 'closed' ? 'green' : this.doors === 'closing' ? 'amber blink' : 'amber');
        lamp('sig', sigOk ? 'green' : 'red');
        lamp('ato', this.ato ? 'blue' : '');
        lamp('eb', t.notch <= -(this.spec.B + 1) ? 'red' : '');
        q('[data-door-txt]').textContent = this.doors === 'open' ? '關門' : this.doors === 'closing' ? '關門中' : '開門';
        q('[data-door-ico]').textContent = this.side === 'left' ? '◀' : '▶';
        this.q('.pb.ato').classList.toggle('on', !!this.ato);
        q('[data-view-txt]').textContent = VIEW_NAMES[this.world.view].replace(/視角$/, '');
        // 主控制器握把位置與刻度
        const i = this.notches.indexOf(t.notch);
        this.q('[data-mc-knob]').style.setProperty('--i', i);
        this.q('[data-mc-knob]').className = `mc-knob ${t.notch > 0 ? 'p' : t.notch === 0 ? 'n' : t.notch <= -(this.spec.B + 1) ? 'eb' : 'b'}`;
        this.q('[data-mc-knob] b').textContent = notchLabel(t.notch, this.spec);
        this.q('.mc-plate').querySelectorAll('span').forEach(s => s.classList.toggle('cur', +s.dataset.n === t.notch));

        // 下一站
        const st = this.stations[Math.min(this.target, this.stations.length - 1)];
        const dist = st.sStop - t.s;
        const atStop = this.phase === 'dwell';
        const term = this.target >= this.stations.length - 1;
        q('[data-next-label]').textContent = atStop ? '停靠中' : term ? '終點站' : '下一站';
        const showSt = atStop ? this.stations[this.target - 1] : st;
        q('[data-next-name]').textContent = showSt.name;
        q('[data-next-sub]').textContent = showSt.sub || '';
        const distTxt = atStop ? (this.doors === 'open' ? (this.dwellLeft > 0 ? `停站 ${Math.ceil(this.dwellLeft)} 秒` : '可關門') : this.doors === 'closing' ? '關門中' : '可出發') : dist > 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.max(0, Math.round(dist))} m`;
        q('[data-next-dist]').textContent = distTxt;
        q('[data-tims-label]').textContent = atStop ? '停靠' : '下一站';
        q('[data-tims-name]').textContent = showSt.name;
        q('[data-tims-dist]').textContent = atStop ? distTxt : dist > 1000 ? `${(dist / 1000).toFixed(2)}km` : `${Math.max(0, Math.round(dist))}m`;

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
            const sug = this.cfg.assist && !this.ato ? suggestNotch(t, this.spec, dist) : null;
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
                else if (a === 'mute') { this.announcer.muted = !this.announcer.muted; if (this.announcer.muted) this.announcer.stopBuzzer(); this.togglePause(true); }
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
            if (e.target.closest?.('[data-pa]')) {           // 廣播輸入框:Esc 關閉、Ctrl+Enter 播出,其餘按鍵不當快捷鍵
                if (e.key === 'Escape') { e.preventDefault(); this.closePA(); }
                else if (e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) { e.preventDefault(); this.sendPA(); }
                e.stopPropagation();
                return;
            }
            this.announcer.unlock();
            const k = e.key.toLowerCase();
            const handled = () => { e.preventDefault(); e.stopPropagation(); };
            if (k === 'escape' || k === 'p') { handled(); if (this.finished) this.exit(); else this.togglePause(); return; }
            if (this.paused || this.finished) return;
            if (e.repeat && !['arrowup', 'arrowdown', 'w', 's'].includes(k)) { handled(); return; }
            if (['arrowup', 'w', 'arrowdown', 's'].includes(k) && this.ato) { this.setAto(false); }
            if (k === 'arrowup' || k === 'w') { handled(); if (!e.repeat || this._rep()) this.setNotch(this.train.notch + 1); }
            else if (k === 'arrowdown' || k === 's') { handled(); if (!e.repeat || this._rep()) this.setNotch(this.train.notch - 1); }
            else if (k === 'n' || k === '0') { handled(); if (this.ato) this.setAto(false); this.setNotch(0); }
            else if (k === 'e' || k === 'backspace') { handled(); if (this.ato) this.setAto(false); this.setNotch(-(this.spec.B + 1)); }
            else if (k === 'd') { handled(); this.toggleDoors(); }
            else if (k === 'h') { handled(); this.announcer.horn(true); }
            else if (k === 'm') { handled(); this.announcer.muted = !this.announcer.muted; this.flash(this.announcer.muted ? '已靜音' : '已開啟聲音', 1.5); if (this.announcer.muted) { this.announcer.stop(); this.announcer.stopBuzzer(); } }
            else if (k === 'r') { handled(); if (this.lastScript) this.announcer.announce(this.lastScript.parts, this.lastScript.label); }
            else if (k === 'c') { handled(); this.world.look.yaw = 0; this.world.look.pitch = -0.07; }
            else if (k === 'v') { handled(); this.cycleView(); }
            else if (k === 'a') { handled(); this.setAto(!this.ato); }
            else if (k === 't') { handled(); this.setAtp(!this.atpOn); }
            else if (k === 'b') { handled(); this.openPA(); }
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
            if (this.ato) this.setAto(false);
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
        if (this.crash) {
            if (!this.paused) this.crashStep(dt);
        } else if (!this.paused && !this.finished) {
            const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
            for (let i = 0; i < sub; i++) { this.step(dt / sub); if (this.crash) break; }
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
                if (this.dwellLeft <= 0) {
                    const terminal = this.target >= this.stations.length;
                    this.flash(terminal ? '終點站' : '停站時間到,按 D 關門', 3);
                    if (!terminal) this.announcer.buzzer(3); // 倒數結束:關門蜂鳴
                }
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
        if (this.ato) this.atoStep(limit);
        const ev = stepTrain(t, this.spec, dt, this.atpOn ? this.atpLimit(t, limit) : Infinity);
        if (ev.atpOn) this.flash(`ATP 超速制動(限速 ${limit})`, 3, true);
        // 彎道過速出軌(彎道限速低於列車最高速;超過約 1.35 倍 + 5 km/h)
        if (limit < this.spec.vmax && t.v * 3.6 > limit * 1.35 + 5) { this.derail(limit); return; }

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

    /** 自動駕駛:停站時間到自動關門、號誌開放後出發,依減速曲線停車並自動開門 */
    atoStep(limit) {
        const t = this.train;
        const term = this.target >= this.stations.length;
        if (this.phase === 'dwell') {
            if (this.doors === 'open') { if (this.dwellLeft <= 0 && !term) this.toggleDoors(); t.notch = -this.spec.B; return; }
            if (this.doors === 'closing' || term) { t.notch = -this.spec.B; return; }
        }
        const st = this.stations[this.target];
        if (!st) return;
        const stopDist = st.sStop - t.s;
        // 停妥:開門
        if (this.phase === 'run' && t.v === 0 && Math.abs(stopDist) <= Math.min(0.5, this.cfg.tol) && this.doors === 'closed') {
            t.notch = -this.spec.B;
            this.toggleDoors();
            return;
        }
        const nl = nextLimit(this.route, t.s, 800);
        const n = atoNotch(t, this.spec, { stopDist, limit, nextLimit: nl.next < limit ? { next: nl.next, at: nl.at - t.s } : null });
        if (n !== t.notch) this.setNotch(n);
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
        if (keepAnnouncer) { this.announcer.stop(); this.announcer.stopBuzzer(); this.announcer.horn(false); this.announcer.motor(0, false); }
        else this.announcer.dispose();
        this.world.dispose();
        this.el.remove();
        document.body.classList.remove('drive-mode');
        session = null;
        if (window.v2) window.v2.drive = null;
        setTimeout(() => this.ctx.map.invalidateSize(), 0);
    }
}
