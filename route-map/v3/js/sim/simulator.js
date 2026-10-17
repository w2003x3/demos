/**
 * simulator.js
 * 營運模擬(唯讀模式):為各路線安排營運班次(行駛區段、方向、班距、速度、停站時間),
 * 以模擬時鐘讓多台列車沿著路線(含共線平行偏移後的實際畫線位置)移動。
 * 介面依 docs/ui-design/Sim.html。
 */
import { store } from '../core/store.js';
import { bus } from '../core/event-bus.js';
import { contrastText } from '../core/network-model.js';
import { esc } from '../render/svg-renderer.js';
import { buildTimeline, stateAt, pointAt, activeDepartures, haversine, fmtClock } from './timetable.js';

const PATTERNS = { both: '雙向往返', forward: '起 → 訖', backward: '訖 → 起' };
const PATTERN_SHORT = { both: '雙向', forward: '起→訖', backward: '訖→起' };
const SPEEDS = [1, 10, 60, 300];

let sim = null;

export function startSimulation(ctx) {
    if (sim) return;
    const { view, map } = ctx;
    document.body.classList.add('sim-mode');
    view.readOnly = true;
    setTimeout(() => map.invalidateSize(), 0);

    // 沒有班次時,每條路線自動建立一個全線雙向班次
    if (!(store.state.services || []).length) {
        store.getLines().forEach(l => { if (!l.hidden) store.addService(l.id); });
    }

    sim = {
        ctx, t: 7 * 3600, playing: true, speed: 60, last: performance.now(), routes: [], raf: 0,
        panel: document.getElementById('sim-panel'),
        legend: document.getElementById('sim-legend'),
        expanded: (store.state.services || [])[0]?.id || null,
        unsub: []
    };
    const rebuild = () => { sim.routes = buildRoutes(view); };
    const onState = () => { if (!sim.panel.contains(document.activeElement)) renderPanel(); };
    bus.on('NETWORK_RENDERED', rebuild);
    bus.on('STATE_CHANGED', onState);
    bus.on('STATE_LOADED', onState);
    sim.unsub.push(() => bus.off('NETWORK_RENDERED', rebuild), () => bus.off('STATE_CHANGED', onState), () => bus.off('STATE_LOADED', onState));

    // 頂列:模擬標籤與結束按鈕
    const badge = document.getElementById('sim-badge');
    const exitBtn = document.getElementById('btn-sim-exit');
    badge.hidden = false;
    exitBtn.hidden = false;
    exitBtn.onclick = () => stopSimulation();
    sim.legend.hidden = false;

    // 狀態列
    const st = ['st-tool', 'st-selection', 'st-hint'].map(id => document.getElementById(id));
    sim.statusBackup = st.map(el => el.innerHTML);
    st[0].textContent = '營運模擬(唯讀)';
    st[1].textContent = '路網不可編輯';
    st[2].innerHTML = '<kbd>Space</kbd> 播放/暫停・<kbd>Esc</kbd> 結束模擬';
    sim.unsub.push(() => st.forEach((el, i) => { el.innerHTML = sim.statusBackup[i]; }));

    view.extraRender = () => drawTrains();
    view.render();
    renderPanel();
    sim.panel.hidden = false;
    bindPanel();
    loop();
    const onKey = (e) => {
        if (sim.panel.contains(document.activeElement)) return;
        if (e.key === 'Escape') stopSimulation();
        else if (e.key === ' ') { e.preventDefault(); sim.playing = !sim.playing; renderControls(); }
    };
    window.addEventListener('keydown', onKey);
    sim.unsub.push(() => window.removeEventListener('keydown', onKey));
}

export function stopSimulation() {
    if (!sim) return;
    const { view, map } = sim.ctx;
    cancelAnimationFrame(sim.raf);
    sim.unsub.forEach(f => f());
    sim.panel.hidden = true;
    sim.panel.innerHTML = '';
    sim.legend.hidden = true;
    document.getElementById('sim-badge').hidden = true;
    document.getElementById('btn-sim-exit').hidden = true;
    view.extraRender = null;
    view.setExtra('');
    view.readOnly = false;
    document.body.classList.remove('sim-mode');
    sim = null;
    setTimeout(() => { map.invalidateSize(); view.render(); }, 0);
}

// =====================================================
// 路徑
// =====================================================

/** 依路線目前畫出來的區間(layer 像素)組出班次行駛路徑 */
function serviceLegs(svc, model, view) {
    const line = store.getLine(svc.lineId);
    if (!line || line.hidden) return [];
    const st = line.nodes.filter(n => n.type === 'station').map(n => n.id);
    const secs = model.sections.filter(s => s.line.id === line.id && s.aId && s.bId);
    const secBetween = (a, b) => {
        const f = secs.find(s => s.aId === a && s.bId === b);
        if (f) return f.drawPath;
        const r = secs.find(s => s.aId === b && s.bId === a);
        return r ? [...r.drawPath].reverse() : null;
    };
    const i = st.indexOf(svc.fromId), j = st.indexOf(svc.toId);
    if (i < 0 || j < 0) return [];
    let seq = [];
    if (line.loop && line.nodes.length >= 3) {
        const n = st.length;
        const steps = i === j ? n : ((j - i + n) % n);
        for (let k = 0; k <= steps; k++) seq.push(st[(i + k) % n]);
    } else if (i === j) {
        return [];
    } else if (i < j) {
        seq = st.slice(i, j + 1);
    } else {
        seq = st.slice(j, i + 1).reverse();
    }
    const legs = [];
    const make = (stations) => {
        const path = [], stops = [];
        for (let k = 0; k < stations.length - 1; k++) {
            const seg = secBetween(stations[k], stations[k + 1]);
            if (!seg) return null;
            if (k === 0) path.push(seg[0]);
            stops.push({ idx: path.length - 1, id: stations[k] });
            path.push(...seg.slice(1));
        }
        stops.push({ idx: path.length - 1, id: stations[stations.length - 1] });
        // 距離以真實經緯度計算(公尺)
        const lls = path.map(p => view.toLatLng(p));
        const cum = [0];
        for (let k = 1; k < lls.length; k++) cum.push(cum[k - 1] + haversine(lls[k - 1], lls[k]));
        const stopsD = stops.map(s => ({ id: s.id, d: cum[s.idx] }));
        return { path, cum, stops: stopsD, timeline: buildTimeline(stopsD, svc.speed, svc.dwell) };
    };
    const fwd = make(seq);
    const bwd = make([...seq].reverse());
    if (svc.pattern !== 'backward' && fwd) legs.push({ ...fwd, dir: 'fwd' });
    if (svc.pattern !== 'forward' && bwd) legs.push({ ...bwd, dir: 'bwd' });
    return legs;
}

function buildRoutes(view) {
    const model = view.model;
    if (!model) return [];
    return (store.state.services || []).map(svc => ({ svc, line: store.getLine(svc.lineId), legs: serviceLegs(svc, model, view) }))
        .filter(r => r.line && r.legs.length);
}

// =====================================================
// 繪製
// =====================================================

function drawTrains() {
    if (!sim) return '';
    const view = sim.ctx.view;
    const bw = view.model ? view.model.baseW : 6;
    const L = bw * 3.4, H = bw * 1.6;
    const out = [];
    sim.counts = {};
    sim.routes.forEach(r => {
        const color = r.line.color;
        const tc = contrastText(color);
        let n = 0;
        r.legs.forEach(leg => {
            const T = leg.timeline.T;
            activeDepartures(sim.t, T, r.svc.start, r.svc.end, r.svc.headway).forEach(dep => {
                const s = stateAt(leg.timeline, dep.age);
                if (!s) return;
                const p = pointAt(leg.path, leg.cum, s.d);
                const terminal = store.getStation(leg.stops[leg.stops.length - 1].id)?.name || '';
                const nextName = store.getStation(leg.stops[Math.min(s.next, leg.stops.length - 1)]?.id)?.name || '';
                const status = s.dwell ? `停靠 ${store.getStation(leg.stops[s.stop].id)?.name || ''}` : `下一站 ${nextName}`;
                out.push(`<g class="train" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.angle.toFixed(1)})">` +
                    `<title>${esc(r.svc.name)}・往 ${esc(terminal)}\n${esc(status)}\n發車 ${fmtClock(dep.dep).slice(0, 5)}</title>` +
                    `<rect x="${-L / 2}" y="${-H / 2}" width="${L}" height="${H}" rx="${H / 2}" fill="${color}" stroke="#ffffff" stroke-width="${Math.max(1.5, bw * 0.28)}"/>` +
                    `<path d="M${L / 2 - H * 1.0} ${-H * 0.28}L${L / 2 - H * 0.45} 0L${L / 2 - H * 1.0} ${H * 0.28}" fill="none" stroke="${tc}" stroke-width="${Math.max(1.2, bw * 0.22)}" stroke-linecap="round" stroke-linejoin="round"/></g>`);
                n++;
            });
        });
        sim.counts[r.svc.id] = (sim.counts[r.svc.id] || 0) + n;
    });
    return out.join('');
}

function loop() {
    if (!sim) return;
    const now = performance.now();
    const dt = Math.min(0.25, (now - sim.last) / 1000);
    sim.last = now;
    if (sim.playing && !sim.scrubbing) sim.t = (sim.t + dt * sim.speed) % 86400;
    sim.ctx.view.setExtra(drawTrains());
    updateLive();
    sim.raf = requestAnimationFrame(loop);
}

// =====================================================
// 面板
// =====================================================

function stationOptions(line, sel) {
    return line.nodes.filter(n => n.type === 'station').map(n => {
        const s = store.getStation(n.id);
        return `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`;
    }).join('');
}

const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const badge = (line) => `<span class="code-badge" style="background:${line.color};color:${contrastText(line.color)}">${esc(line.code || '—')}</span>`;

/** 各班次首班~末班的聯集(分鐘區間) */
function serviceWindows() {
    const iv = (store.state.services || []).map(s => [s.start, s.end]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    const out = [];
    iv.forEach(([a, b]) => {
        const last = out[out.length - 1];
        if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]);
    });
    return out;
}

function cardHtml(svc) {
    const line = store.getLine(svc.lineId);
    if (!line) return '';
    const open = sim.expanded === svc.id;
    const head = `<div class="svc-top" data-toggle="${svc.id}">${badge(line)}
        ${open ? `<input class="inp sm" data-sf="name" value="${esc(svc.name)}">`
            : `<div class="svc-sum"><b>${esc(svc.name)}</b><small>${PATTERN_SHORT[svc.pattern]}・每 ${svc.headway} 分・${hhmm(svc.start)}–${hhmm(svc.end)}</small></div>`}
        <span class="svc-count"><b data-live-count="${svc.id}">0</b> 列</span>
        <span class="svc-chev">${open ? '▴' : '▾'}</span></div>`;
    if (!open) return `<div class="svc-card collapsed" data-svc="${svc.id}">${head}</div>`;
    return `<div class="svc-card open" data-svc="${svc.id}">${head}
        <div class="svc-grid">
            <div><label>起站</label><select class="sel" data-sf="fromId">${stationOptions(line, svc.fromId)}</select></div>
            <div><label>訖站${line.loop ? '(同起站=繞一圈)' : ''}</label><select class="sel" data-sf="toId">${stationOptions(line, svc.toId)}</select></div>
            <div style="grid-column:1/-1"><label>方向</label>
                <div class="chips c3">${Object.entries(PATTERNS).map(([k, t]) => `<button class="chip ${svc.pattern === k ? 'on' : ''}" data-pattern="${k}">${t}</button>`).join('')}</div></div>
            <div><label>班距(分)</label><input class="inp" type="number" min="1" step="0.5" data-sf-num="headway" value="${svc.headway}"></div>
            <div><label>表定速度(km/h)</label><input class="inp" type="number" min="5" max="350" data-sf-num="speed" value="${svc.speed}"></div>
            <div><label>停站(秒)</label><input class="inp" type="number" min="0" max="600" data-sf-num="dwell" value="${svc.dwell}"></div>
            <div></div>
            <div><label>首班</label><input class="inp" type="time" data-sf-time="start" value="${hhmm(svc.start)}"></div>
            <div><label>末班</label><input class="inp" type="time" data-sf-time="end" value="${hhmm(svc.end)}"></div>
        </div>
        <div style="text-align:right;margin-top:8px"><button class="btn sm btn-danger" data-sim-del="${svc.id}">刪除班次</button></div></div>`;
}

function renderPanel() {
    if (!sim) return;
    const services = store.state.services || [];
    if (sim.expanded && !services.some(s => s.id === sim.expanded)) sim.expanded = services[0]?.id || null;
    const lines = store.getLines().filter(l => l.nodes.filter(n => n.type === 'station').length >= 2);
    sim.panel.innerHTML = `
        <div class="sim-head">
            <div style="flex:1"><div class="eyebrow">營運模擬・模擬時間</div><div class="sim-clock" data-live="clock">${fmtClock(sim.t)}</div></div>
            <div class="sim-running"><small>運行中</small><div><b data-live="total">0</b> 列</div></div>
        </div>
        <div class="sim-controls" data-live="controls"></div>
        <div class="sim-body">
            <div class="sim-sec-title"><h3>營運班次・${services.length}</h3><span class="hint" style="margin:0">路網唯讀,班次可編輯</span></div>
            ${services.map(cardHtml).join('') || '<p class="empty">尚無營運班次</p>'}
        </div>
        <div class="sim-foot">${lines.length
            ? `<select class="sel" data-new-svc-line>${lines.map(l => `<option value="${l.id}">${esc((l.code ? l.code + ' ' : '') + l.name)}</option>`).join('')}</select>
               <button class="btn btn-primary" data-sim="add">＋ 新增班次</button>`
            : '<p class="hint" style="margin:0">路線至少需要 2 站才能安排班次。</p>'}</div>`;
    renderControls();
}

function renderControls() {
    const el = sim.panel.querySelector('[data-live="controls"]');
    if (!el) return;
    const win = serviceWindows().map(([a, b]) => `<i style="left:${(a / 1440 * 100).toFixed(2)}%;width:${((b - a) / 1440 * 100).toFixed(2)}%"></i>`).join('');
    el.innerHTML = `
        <div class="sim-row">
            <button class="btn ${sim.playing ? 'btn-primary' : ''} sim-play" data-sim="play" title="Space">${sim.playing ? '❚❚' : '▶'}</button>
            <span class="seg-group">${SPEEDS.map(s => `<button class="${sim.speed === s ? 'on' : ''}" data-sim-speed="${s}">${s}×</button>`).join('')}</span>
            <input class="inp sm" style="width:118px" type="time" data-sim-time value="${fmtClock(sim.t).slice(0, 5)}" title="跳到時間">
        </div>
        <div class="sim-timeline" data-timeline>${win}<span class="tl-thumb" data-live="thumb"></span></div>
        <div class="tl-ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
        <p class="hint" style="margin:2px 0 0">拖曳時間軸跳轉;綠色區段=有班次的時段</p>`;
    updateLive();
}

function updateLive() {
    const clock = sim.panel.querySelector('[data-live="clock"]');
    if (clock) clock.textContent = fmtClock(sim.t);
    const thumb = sim.panel.querySelector('[data-live="thumb"]');
    if (thumb) thumb.style.left = `${(sim.t / 86400 * 100).toFixed(3)}%`;
    const timeInp = sim.panel.querySelector('[data-sim-time]');
    if (timeInp && document.activeElement !== timeInp) {
        const v = fmtClock(sim.t).slice(0, 5);
        if (timeInp.value !== v) timeInp.value = v;
    }
    let total = 0;
    Object.entries(sim.counts || {}).forEach(([id, n]) => {
        total += n;
        const el = sim.panel.querySelector(`[data-live-count="${id}"]`);
        if (el) el.textContent = n;
    });
    const t = sim.panel.querySelector('[data-live="total"]');
    if (t) t.textContent = total;
}

function bindPanel() {
    const p = sim.panel;
    const onClick = (e) => {
        const toggle = e.target.closest('[data-toggle]');
        if (toggle && !e.target.closest('input,select,button')) {
            sim.expanded = sim.expanded === toggle.dataset.toggle ? null : toggle.dataset.toggle;
            renderPanel();
            return;
        }
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if (d.sim === 'play') { sim.playing = !sim.playing; renderControls(); }
        else if (d.sim === 'add') {
            const lid = p.querySelector('[data-new-svc-line]').value;
            const svc = store.addService(lid);
            if (svc) sim.expanded = svc.id;
            renderPanel();
        }
        else if (d.simSpeed) { sim.speed = +d.simSpeed; renderControls(); }
        else if (d.simDel) { store.deleteService(d.simDel); renderPanel(); }
        else if (d.pattern) {
            const id = b.closest('[data-svc]').dataset.svc;
            store.updateService(id, { pattern: d.pattern });
            sim.ctx.view.render();
            renderPanel();
        }
    };
    const onChange = (e) => {
        const t = e.target;
        const card = t.closest('[data-svc]');
        if (t.dataset.simTime !== undefined) {
            const [h, m] = t.value.split(':').map(Number);
            if (Number.isFinite(h)) sim.t = h * 3600 + m * 60;
            return;
        }
        if (!card) return;
        const id = card.dataset.svc;
        const d = t.dataset;
        if (d.sf) store.updateService(id, { [d.sf]: t.value });
        else if (d.sfNum) { const v = parseFloat(t.value); if (v > 0 || (d.sfNum === 'dwell' && v >= 0)) store.updateService(id, { [d.sfNum]: v }); }
        else if (d.sfTime) { const [h, m] = t.value.split(':').map(Number); if (Number.isFinite(h)) store.updateService(id, { [d.sfTime]: h * 60 + m }); }
        sim.ctx.view.render();
        if (d.sfTime) renderControls();
    };
    // 時間軸拖曳
    const onDown = (e) => {
        const tl = e.target.closest('[data-timeline]');
        if (!tl || e.button !== 0) return;
        e.preventDefault();
        sim.scrubbing = true;
        const seek = (ev) => {
            const r = tl.getBoundingClientRect();
            const u = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
            sim.t = Math.min(86399, u * 86400);
            updateLive();
        };
        seek(e);
        const move = (ev) => seek(ev);
        const up = () => { sim.scrubbing = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };
    p.addEventListener('click', onClick);
    p.addEventListener('change', onChange);
    p.addEventListener('pointerdown', onDown);
    sim.unsub.push(() => {
        p.removeEventListener('click', onClick);
        p.removeEventListener('change', onChange);
        p.removeEventListener('pointerdown', onDown);
    });
}
