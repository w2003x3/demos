/**
 * editor.js
 * 所有地圖上的編輯互動:四種工具(選取 V / 車站 S / 路線 L / 連通道 C)、
 * 拖曳(車站、站名、轉折點、彎折控制點)、45° 吸附、框選、路段浮動工具列、HUD 與快捷鍵。
 *
 * 互動來源:
 *   - 路網 SVG 上帶 data-k 的元素(pointerdown/up 自行判斷點擊或拖曳)
 *   - Leaflet 的 map click / mousemove(空白處)
 */
import { store, flipRoute } from '../core/store.js';
import { bus } from '../core/event-bus.js';
import { history } from '../core/history.js';
import { routeEdge, snapPoint, nearestDir8, dist, distToPolyline } from '../core/geometry.js';
import { ROUTE_MODES, STATUSES } from '../core/constants.js';
import { withPortal, fractionOnPath } from '../core/levels.js';
import { contrastText } from '../core/network-model.js';
import { esc } from '../render/svg-renderer.js';
import { toast } from '../ui/toast.js';
import { showContextMenu } from '../ui/context-menu.js';
import { promptNewLine } from '../ui/modal.js';

const DRAGGABLE = new Set(['station', 'label', 'turn', 'elbow', 'mid', 'portal']);
const SNAP_PX = 10;
const HOVER_PX = 14;

export const TOOL_NAMES = { select: '選取', station: '車站', line: '路線', corridor: '連通道' };
const TOOL_KEYS = { select: 'V', station: 'S', line: 'L', corridor: 'C' };

export const ROUTE_ICONS = {
    'orth-first': 'M3 3V9L11 17H18',
    'diag-first': 'M3 3L10 10V18',
    hv: 'M3 4H16V17',
    vh: 'M3 4V16H17',
    straight: 'M4 4L16 16',
    curve: 'M3 4Q16 4 16 17'
};
export const routeIcon = (k) => `<svg width="18" height="18" viewBox="0 0 20 20"><path d="${ROUTE_ICONS[k]}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export class Editor {
    constructor({ map, view, mapCore }) {
        this.map = map;
        this.view = view;
        this.mapCore = mapCore;
        this.container = map.getContainer();
        this.tool = 'select';
        this.press = null;
        this.drag = null;
        this.lineSession = null;
        this.corridorFirst = null;
        this.corridorType = 'out-station';
        this.spaceDown = false;
        this.suppressClick = null;
        this.lastTurnClick = null;
        this.rightDown = null;

        this.hud = document.getElementById('hud');
        this.hintBar = document.getElementById('hint-bar');
        this.tip = document.getElementById('cursor-tip');
        this.segBar = document.getElementById('segment-bar');
        this.boxEl = document.getElementById('box-select');

        this.bindSvg();
        this.bindMap();
        this.bindKeys();
        bus.on('STATE_LOADED', () => this.onStateLoaded());
        bus.on('SELECTION_CHANGED', () => this.refreshChrome());
        bus.on('STATE_CHANGED', () => { if (this.lineSession) this.renderHud(); });
        this.setTool('select');
    }

    // =====================================================
    // 工具切換
    // =====================================================

    async setTool(name, opts = {}) {
        if (this.tool === 'line' && name !== 'line') this.endLineSession(false);
        if (name !== 'corridor') this.corridorFirst = null;
        this.tool = name;
        this.container.classList.remove('tool-select', 'tool-station', 'tool-line', 'tool-corridor');
        this.container.classList.add(`tool-${name}`);
        document.querySelectorAll('#toolrail .tool[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === name));
        this.view.handlesEnabled = name === 'select';
        this.view.showExtension = false;
        this.view.setOverlay('');
        this.hideSegmentBar();
        this.hideTip();

        if (name === 'line') {
            const ok = await this.startLineSession(opts);
            if (!ok) { this.setTool('select'); return; }
        }
        this.view.schedule();
        this.refreshChrome();
        bus.emit('TOOL_CHANGED', name);
    }

    refreshChrome() {
        this.renderHud();
        this.renderHintBar();
        bus.emit('STATUS_HINT', this.statusHint());
    }

    statusHint() {
        switch (this.tool) {
            case 'station': return '點空白處建立車站・點車站選取';
            case 'line': return '點車站=連接・點空白=建站・Alt+點=轉折點・Backspace 退一步';
            case 'corridor': return this.corridorFirst ? '再點第二個車站完成連通道' : '點第一個車站';
            default: return '<kbd>Shift</kbd>+拖曳 框選・<kbd>Space</kbd>+拖曳 平移・<kbd>?</kbd> 快捷鍵';
        }
    }

    // =====================================================
    // SVG 事件
    // =====================================================

    hitOf(e) {
        const t = e.target.closest && e.target.closest('[data-k]');
        return t && this.view.svg.contains(t) ? t : null;
    }

    bindSvg() {
        const svg = this.view.svg;
        svg.addEventListener('pointerdown', (e) => this.onDown(e));
        svg.addEventListener('mousedown', (e) => {
            const t = this.hitOf(e);
            if (t && DRAGGABLE.has(t.dataset.k) && !this.spaceDown) e.stopPropagation();
        });
        svg.addEventListener('click', (e) => { if (this.hitOf(e)) e.stopPropagation(); });
        svg.addEventListener('dblclick', (e) => { if (this.hitOf(e)) e.stopPropagation(); });
        window.addEventListener('pointermove', (e) => this.onMove(e));
        window.addEventListener('pointerup', (e) => this.onUp(e));
    }

    onDown(e) {
        if (e.button !== 0 || this.spaceDown) return;
        const t = this.hitOf(e);
        if (!t) return;
        const d = t.dataset;
        this.press = {
            k: d.k, id: d.id, lineId: d.line, idx: d.idx !== undefined ? +d.idx : null,
            to: d.to !== undefined ? +d.to : null, sec: d.sec !== undefined ? +d.sec : null, mode: d.mode, a: d.a, b: d.b,
            cx: e.clientX, cy: e.clientY, shift: e.shiftKey, alt: e.altKey,
            latlng: this.map.mouseEventToLatLng(e)
        };
    }

    canDrag(k) {
        if (!DRAGGABLE.has(k)) return false;
        if (this.tool === 'corridor') return false;
        if (this.tool === 'line') return k === 'station';
        return true;
    }

    onMove(e) {
        if (!this.press) return;
        if (!this.drag) {
            if (Math.hypot(e.clientX - this.press.cx, e.clientY - this.press.cy) < 4) return;
            if (!this.canDrag(this.press.k)) return;
            this.beginDrag(this.press, e);
        }
        if (this.drag) this.dragMove(e);
    }

    onUp(e) {
        const p = this.press;
        this.press = null;
        if (!p) return;
        if (this.drag) {
            this.endDrag(e);
            this.suppressClickAt(e);
            return;
        }
        const moved = Math.hypot(e.clientX - p.cx, e.clientY - p.cy);
        if (moved >= 4) return; // 拖動了地圖(路線熱區不阻擋平移)
        this.suppressClickAt(e);
        this.onClickTarget(p, e);
    }

    /** 同一手勢(拖曳/點 SVG 元素)結束後,Leaflet 仍會在同一位置補發 click,需忽略 */
    suppressClickAt(e) {
        this.suppressClick = { x: e.clientX, y: e.clientY, t: Date.now() };
    }

    // =====================================================
    // 點擊
    // =====================================================

    onClickTarget(p, e) {
        const tool = this.tool;
        if (tool === 'line') {
            if (p.k === 'station' || p.k === 'label') return this.lineToolStation(p.id, e.altKey);
            if (p.k === 'line' || p.k === 'corridor') return this.lineToolBlank(p.latlng, e.altKey);
            return;
        }
        if (tool === 'corridor') {
            if (p.k === 'station' || p.k === 'label') this.corridorClick(p.id);
            return;
        }
        switch (p.k) {
            case 'station':
            case 'label':
                if (p.shift) store.toggleStationSelection(p.id);
                else this.selectStation(p.id);
                break;
            case 'line':
                if (tool === 'station') this.insertStationOnSection(p);
                else this.onLineClick(p, e);
                break;
            case 'corridor':
                store.select('corridor', [p.id]);
                break;
            case 'portal':
                store.select('line', [p.lineId]);
                break;
            case 'turn': {
                const now = Date.now();
                const last = this.lastTurnClick;
                if (last && last.lineId === p.lineId && last.idx === p.idx && now - last.t < 400) {
                    store.removeNode(p.lineId, p.idx);
                    this.lastTurnClick = null;
                    toast('已刪除轉折點', { undo: true });
                } else {
                    this.lastTurnClick = { lineId: p.lineId, idx: p.idx, t: now };
                }
                break;
            }
            case 'elbow': {
                const line = store.getLine(p.lineId);
                const cur = line.nodes[p.idx].route || line.routing || 'diag-first';
                store.updateNode(p.lineId, p.idx, { route: flipRoute(cur) });
                break;
            }
            case 'mid': {
                const idx = this.midInsertIndex(p);
                store.insertNode(p.lineId, idx, { type: 'turning', lat: p.latlng.lat, lng: p.latlng.lng });
                break;
            }
        }
    }

    selectStation(id) {
        store.select('station', [id]);
        // 單線端點站:預設為延伸該端,方便按 L 接著畫
        const s = store.getStation(id);
        if (s && s.lines.length === 1) {
            const line = store.getLine(s.lines[0]);
            const st = line.nodes.filter(n => n.type === 'station');
            const dir = st.length && st[0].id === id && st.length > 1 ? 'start' : 'end';
            store.setActiveLine(line.id, dir);
        }
    }

    midInsertIndex(p) {
        const line = store.getLine(p.lineId);
        return (p.to === 0 && p.idx === line.nodes.length - 1) ? line.nodes.length : p.idx + 1;
    }

    /** 點到的是哪一條邊(區間內最近的一段) */
    edgeAt(secIdx, latlng) {
        const sec = this.view.model && this.view.model.sections[secIdx];
        if (!sec) return null;
        const P = this.view.toLayer(latlng);
        let best = sec.edges[0], bestD = Infinity;
        sec.edges.forEach(e => {
            const d = distToPolyline(P, e.path);
            if (d < bestD) { bestD = d; best = e; }
        });
        return { sec, edge: best };
    }

    edgeInsertIndex(edge, line) {
        return (edge.to === 0 && edge.from === line.nodes.length - 1) ? line.nodes.length : edge.from + 1;
    }

    insertStationOnSection(p) {
        const hit = this.edgeAt(p.sec, p.latlng);
        if (!hit) return;
        const line = store.getLine(p.lineId);
        const s = store.addStation(p.latlng.lat, p.latlng.lng, store.getNextStationName(line.id));
        store.insertNode(line.id, this.edgeInsertIndex(hit.edge, line), { type: 'station', id: s.id });
        store.select('station', [s.id]);
        bus.emit('FOCUS_NAME');
    }

    onLineClick(p, e) {
        const line = store.getLine(p.lineId);
        if (!line) return;
        store.select('line', [line.id]);
        const hit = this.edgeAt(p.sec, p.latlng);
        if (hit) this.showSegmentBar(line, hit, p.latlng, e);
    }

    // =====================================================
    // 路段浮動工具列
    // =====================================================

    showSegmentBar(line, hit, latlng, e) {
        const { edge, sec } = hit;
        const secNode = line.nodes[sec.startIdx];
        const curRoute = line.nodes[edge.from].route || null;
        const curStatus = secNode.status || '';
        const turnIdxs = [];
        sec.edges.forEach((ed, i) => { if (i > 0 && line.nodes[ed.from].type === 'turning') turnIdxs.push(ed.from); });
        const shared = sec.leader !== sec;

        const b = this.segBar;
        b.innerHTML = `
            <span class="sb-label">路段</span>
            ${Object.keys(ROUTE_MODES).map(k => `<button data-route="${k}" class="${(curRoute || line.routing) === k ? 'on' : ''}" title="${ROUTE_MODES[k]}${!curRoute && line.routing === k ? '(路線預設)' : ''}">${routeIcon(k)}</button>`).join('')}
            <button data-route="" title="改回沿用路線預設" ${curRoute ? '' : 'disabled'} style="font-size:11px">預設</button>
            <span class="sb-sep"></span>
            <select data-status title="路段營運狀態">
                <option value="" ${!curStatus ? 'selected' : ''}>同路線(${STATUSES[line.status || 'open']})</option>
                ${Object.entries(STATUSES).map(([k, t]) => `<option value="${k}" ${curStatus === k ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
            <span class="sb-sep"></span>
            <button data-act="station" title="在此插入車站">＋站</button>
            <button data-act="turn" title="在此插入轉折點">＋轉折</button>
            <button data-act="clear" class="danger" title="刪除此路段的轉折點" ${turnIdxs.length ? '' : 'disabled'}>
                <svg width="16" height="16" viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
            </button>
            ${shared ? `<span class="sb-label" title="共線路段的走線由 ${esc(sec.leader.line.name)} 決定">共線</span>` : ''}`;
        b.hidden = false;

        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        const bw = b.offsetWidth, bh = b.offsetHeight;
        b.style.left = `${Math.max(8, Math.min(x - bw / 2, rect.width - bw - 8))}px`;
        b.style.top = `${y + 18 + bh > rect.height ? y - bh - 18 : y + 18}px`;

        b.onclick = (ev) => {
            const btn = ev.target.closest('button');
            if (!btn || btn.disabled) return;
            if (btn.dataset.route !== undefined) {
                store.updateNode(line.id, edge.from, { route: btn.dataset.route || null });
            } else if (btn.dataset.act === 'station') {
                const s = store.addStation(latlng.lat, latlng.lng, store.getNextStationName(line.id));
                store.insertNode(line.id, this.edgeInsertIndex(edge, line), { type: 'station', id: s.id });
                store.select('station', [s.id]);
                bus.emit('FOCUS_NAME');
            } else if (btn.dataset.act === 'turn') {
                store.insertNode(line.id, this.edgeInsertIndex(edge, line), { type: 'turning', lat: latlng.lat, lng: latlng.lng });
            } else if (btn.dataset.act === 'clear') {
                const l = store.getLine(line.id);
                l.nodes = l.nodes.filter((_, i) => !turnIdxs.includes(i));
                store.updateLine(line.id, {});
                toast(`已刪除 ${turnIdxs.length} 個轉折點`, { undo: true });
            }
            this.hideSegmentBar();
        };
        b.querySelector('[data-status]').onchange = (ev) => {
            store.updateNode(line.id, sec.startIdx, { status: ev.target.value || null });
        };
    }

    hideSegmentBar() {
        this.segBar.hidden = true;
    }

    // =====================================================
    // 拖曳
    // =====================================================

    neighborAnchors(stationIds) {
        const set = new Set(stationIds);
        const anchors = [];
        const m = this.view.model;
        store.getLines().forEach(line => {
            const pts = m.linePts[line.id];
            if (!pts) return;
            const n = line.nodes.length;
            line.nodes.forEach((nd, i) => {
                if (nd.type !== 'station' || !set.has(nd.id)) return;
                const nb = [i - 1, i + 1];
                if (line.loop) { if (i === 0) nb.push(n - 1); if (i === n - 1) nb.push(0); }
                nb.forEach(j => {
                    const o = line.nodes[j];
                    if (o && !(o.type === 'station' && set.has(o.id))) anchors.push(pts[j]);
                });
            });
        });
        store.state.corridors.forEach(c => {
            if (set.has(c.fromId) && !set.has(c.toId)) anchors.push(m.stationPts.get(c.toId));
            if (set.has(c.toId) && !set.has(c.fromId)) anchors.push(m.stationPts.get(c.fromId));
        });
        return anchors.filter(Boolean);
    }

    beginDrag(p) {
        this.hideSegmentBar();
        const m = this.view.model;
        if (p.k === 'station') {
            const selIds = store.selectedStationIds();
            let ids = selIds.includes(p.id) ? [...selIds] : [p.id];
            if (!selIds.includes(p.id) && this.tool === 'select') store.select('station', [p.id]);
            const set = new Set(ids);
            const turns = [];
            store.getLines().forEach(line => {
                // 兩側車站都被拖動時,中間的轉折點一起移動
                let lastStationIn = null;
                const pending = [];
                line.nodes.forEach((nd, i) => {
                    if (nd.type === 'station') {
                        const inSet = set.has(nd.id);
                        if (lastStationIn && inSet) pending.forEach(j => turns.push({ lineId: line.id, idx: j, p0: m.linePts[line.id][j] }));
                        pending.length = 0;
                        lastStationIn = inSet;
                    } else pending.push(i);
                });
            });
            this.drag = {
                type: 'stations',
                start: this.view.toLayer(p.latlng),
                items: ids.map(id => ({ id, p0: m.stationPts.get(id) })).filter(x => x.p0),
                turns,
                anchors: ids.length === 1 ? this.neighborAnchors(ids) : []
            };
        } else if (p.k === 'label') {
            this.drag = { type: 'label', id: p.id };
            if (!store.selectedStationIds().includes(p.id)) store.select('station', [p.id]);
        } else if (p.k === 'turn') {
            this.drag = { type: 'turn', lineId: p.lineId, idx: p.idx, anchors: this.turnAnchors(p.lineId, p.idx) };
        } else if (p.k === 'portal') {
            this.drag = { type: 'portal', lineId: p.lineId, a: p.a, b: p.b };
        } else if (p.k === 'elbow' || p.k === 'mid') {
            const idx = p.k === 'elbow' ? p.idx + 1 : this.midInsertIndex(p);
            const ll = p.latlng;
            if (p.k === 'elbow') {
                const h = m.handles.find(h => h.kind === 'elbow' && h.lineId === p.lineId && h.idx === p.idx);
                const at = h ? this.view.toLatLng(h) : ll;
                store.insertNode(p.lineId, idx, { type: 'turning', lat: at.lat, lng: at.lng });
            } else {
                store.insertNode(p.lineId, idx, { type: 'turning', lat: ll.lat, lng: ll.lng });
            }
            this.view.render();
            this.drag = { type: 'turn', lineId: p.lineId, idx, anchors: this.turnAnchors(p.lineId, idx) };
        }
    }

    turnAnchors(lineId, idx) {
        const line = store.getLine(lineId);
        const pts = this.view.model.linePts[lineId];
        const n = line.nodes.length;
        const nb = [idx - 1, idx + 1];
        if (line.loop) { if (idx === 0) nb.push(n - 1); if (idx === n - 1) nb.push(0); }
        return nb.filter(j => j >= 0 && j < n).map(j => pts[j]).filter(Boolean);
    }

    dragMove(e) {
        const d = this.drag;
        const P = this.view.toLayer(this.map.mouseEventToLatLng(e));
        const noSnap = e.altKey;
        if (d.type === 'stations') {
            let dx = P.x - d.start.x, dy = P.y - d.start.y;
            let guides = [];
            if (d.items.length === 1 && !noSnap && d.anchors.length) {
                const target = { x: d.items[0].p0.x + dx, y: d.items[0].p0.y + dy };
                const s = snapPoint(target, d.anchors, SNAP_PX);
                if (s.snapped) {
                    dx = s.x - d.items[0].p0.x; dy = s.y - d.items[0].p0.y;
                    guides = s.guides.map(g => [g, s]);
                }
            }
            const mv = pt => { const ll = this.view.toLatLng({ x: pt.x + dx, y: pt.y + dy }); return { lat: ll.lat, lng: ll.lng }; };
            store.moveItems(
                d.items.map(it => ({ id: it.id, ...mv(it.p0) })),
                d.turns.map(t => ({ lineId: t.lineId, idx: t.idx, ...mv(t.p0) }))
            );
            this.drawGuides(guides);
        } else if (d.type === 'label') {
            const c = this.view.model.stationPts.get(d.id);
            const v = { x: P.x - c.x, y: P.y - c.y };
            const dir = Math.hypot(v.x, v.y) < 10 ? 'auto' : nearestDir8(v);
            const s = store.getStation(d.id);
            if (s && s.labelPos !== dir) store.updateStation(d.id, { labelPos: dir });
        } else if (d.type === 'turn') {
            let target = P, guides = [];
            if (!noSnap) {
                const s = snapPoint(P, d.anchors, SNAP_PX);
                if (s.snapped) { target = s; guides = s.guides.map(g => [g, s]); }
            }
            const ll = this.view.toLatLng(target);
            store.moveItems([], [{ lineId: d.lineId, idx: d.idx, lat: ll.lat, lng: ll.lng }]);
            this.drawGuides(guides);
        } else if (d.type === 'portal') {
            // 出土段:沿該站間區段滑動
            const sec = this.view.model.sections.find(s => s.line.id === d.lineId &&
                ((s.aId === d.a && s.bId === d.b) || (s.aId === d.b && s.bId === d.a)));
            const line = store.getLine(d.lineId);
            if (!sec || !line) return;
            const t = fractionOnPath(sec.drawPath, P);
            store.updateLine(d.lineId, { portals: withPortal(line, sec.aId, sec.bId, t) });
        }
    }

    drawGuides(pairs) {
        this.view.setOverlay(pairs.map(([a, b]) =>
            `<path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="#1E5A4E" stroke-width="1" stroke-dasharray="4 3" fill="none"/>`).join(''));
    }

    endDrag() {
        const d = this.drag;
        this.drag = null;
        this.view.setOverlay('');
        if (d.type === 'stations' && d.items.length === 1) {
            const id = d.items[0].id;
            const m = this.view.model;
            const me = m.stationPts.get(id);
            let near = null, nd = 12;
            m.stationPts.forEach((pt, sid) => {
                if (sid === id) return;
                const dd = dist(pt, me);
                if (dd < nd) { nd = dd; near = sid; }
            });
            if (near) {
                const other = store.getStation(near);
                toast(`與「${other.name}」重疊`, {
                    action: { label: '合併為共站', run: () => { store.mergeStations([near, id], near); toast('已合併為共站', { undo: true }); } }
                });
            }
        }
    }

    // =====================================================
    // 空白處(Leaflet)
    // =====================================================

    bindMap() {
        this.map.on('click', (e) => {
            const sc = this.suppressClick, oe0 = e.originalEvent;
            if (sc && Date.now() - sc.t < 400 && Math.hypot(oe0.clientX - sc.x, oe0.clientY - sc.y) < 6) return;
            this.hideSegmentBar();
            const oe = e.originalEvent;
            switch (this.tool) {
                case 'select': store.clearSelection(); break;
                case 'station': this.createStation(e.latlng); break;
                case 'line': this.lineToolBlank(e.latlng, oe.altKey); break;
                case 'corridor': this.corridorFirst = null; store.clearSelection(); this.refreshChrome(); break;
            }
        });
        this.map.on('mousemove', (e) => this.onHover(e));
        this.map.on('mouseout', () => { this.hideTip(); if (this.tool === 'line') this.view.setOverlay(''); });
        this.map.on('movestart zoomstart', () => this.hideSegmentBar());

        // Shift+拖曳框選(capture 階段攔下,不讓 Leaflet 開始平移)
        this.container.addEventListener('mousedown', (e) => {
            if (e.button === 2) this.rightDown = { x: e.clientX, y: e.clientY };
            if (e.button !== 0 || !e.shiftKey || this.tool !== 'select' || this.hitOf(e)) return;
            if (e.target.closest('.leaflet-control')) return;
            e.stopPropagation();
            e.preventDefault();
            this.startBox(e);
        }, true);

        // 右鍵:選取/車站=情境選單;路線=退一步;連通道=取消
        this.container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const r = this.rightDown;
            if (r && Math.hypot(e.clientX - r.x, e.clientY - r.y) > 4) return; // 右鍵拖曳平移
            if (this.tool === 'line') { this.lineStepBack(); return; }
            if (this.tool === 'corridor') { this.corridorFirst = null; store.clearSelection(); this.refreshChrome(); return; }
            this.openContextMenu(e);
        });
    }

    startBox(e) {
        const rect = this.container.getBoundingClientRect();
        const x0 = e.clientX - rect.left, y0 = e.clientY - rect.top;
        const box = this.boxEl;
        box.hidden = false;
        const upd = (ev) => {
            const x1 = ev.clientX - rect.left, y1 = ev.clientY - rect.top;
            Object.assign(box.style, {
                left: `${Math.min(x0, x1)}px`, top: `${Math.min(y0, y1)}px`,
                width: `${Math.abs(x1 - x0)}px`, height: `${Math.abs(y1 - y0)}px`
            });
            return { x1, y1 };
        };
        upd(e);
        const move = (ev) => upd(ev);
        const up = (ev) => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
            box.hidden = true;
            const { x1, y1 } = upd(ev);
            const a = this.map.containerPointToLayerPoint([Math.min(x0, x1), Math.min(y0, y1)]);
            const b = this.map.containerPointToLayerPoint([Math.max(x0, x1), Math.max(y0, y1)]);
            const hits = [];
            this.view.model.stationPts.forEach((p, id) => {
                if (p.x >= a.x && p.x <= b.x && p.y >= a.y && p.y <= b.y) hits.push(id);
            });
            const prev = store.selectedStationIds();
            store.select('station', [...prev, ...hits.filter(id => !prev.includes(id))]);
            this.suppressClickAt(ev);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    }

    openContextMenu(e) {
        const t = this.hitOf(e);
        const latlng = this.map.mouseEventToLatLng(e);
        const items = [];
        if (t && (t.dataset.k === 'station' || t.dataset.k === 'label')) {
            const s = store.getStation(t.dataset.id);
            if (!store.selectedStationIds().includes(s.id)) this.selectStation(s.id);
            items.push({ head: s.name });
            if (s.lines.length) {
                s.lines.forEach(lid => {
                    const l = store.getLine(lid);
                    items.push({ label: `從此站延伸「${l.name}」`, action: () => this.extendFrom(lid, s.id) });
                });
            }
            items.push({ label: '重新命名 (F2)', action: () => bus.emit('FOCUS_NAME') });
            items.push({ sep: true });
            items.push({ label: '刪除車站', danger: true, action: () => this.deleteSelection() });
        } else if (t && t.dataset.k === 'turn') {
            items.push({ label: '刪除轉折點', danger: true, action: () => { store.removeNode(t.dataset.line, +t.dataset.idx); toast('已刪除轉折點', { undo: true }); } });
        } else if (t && t.dataset.k === 'line') {
            const line = store.getLine(t.dataset.line);
            store.select('line', [line.id]);
            items.push({ head: line.name });
            items.push({ label: '延伸起點端', action: () => this.extendLine(line.id, 'start') });
            items.push({ label: '延伸終點端', action: () => this.extendLine(line.id, 'end') });
            items.push({ label: '反轉方向', action: () => store.reverseLine(line.id) });
            items.push({ sep: true });
            items.push({ label: '刪除路線', danger: true, action: () => this.deleteSelection() });
        } else if (t && t.dataset.k === 'corridor') {
            store.select('corridor', [t.dataset.id]);
            items.push({ label: '刪除連通道', danger: true, action: () => this.deleteSelection() });
        } else {
            items.push({ label: '在此建立車站', action: () => this.createStation(latlng) });
            items.push({ label: '全部適配 (F)', action: () => this.mapCore.fitNetwork() });
        }
        showContextMenu(e.clientX, e.clientY, items);
    }

    onHover(e) {
        if (this.tool !== 'line' || !this.lineSession || this.press) return;
        const line = store.getLine(this.lineSession.lineId);
        const end = store.getExtensionNode();
        const P = this.view.toLayer(e.latlng);
        const m = this.view.model;

        // 游標附近的車站
        let near = null, nd = HOVER_PX;
        m.stationPts.forEach((pt, id) => {
            const d = dist(pt, P);
            if (d < nd) { nd = d; near = id; }
        });

        const endPt = end ? (end.type === 'station' ? m.stationPts.get(end.id) : this.view.toLayer([end.lat, end.lng])) : null;
        let target = P, tipHtml = '';
        if (near) {
            target = m.stationPts.get(near);
            tipHtml = this.lineHoverTip(line, near);
        } else if (endPt && !e.originalEvent.altKey) {
            const s = snapPoint(P, [endPt], 12);
            target = s;
        }
        let svg = '';
        if (endPt) {
            const path = routeEdge(endPt, target, line.routing || 'diag-first');
            svg += `<path d="M${path.map(p => `${p.x} ${p.y}`).join('L')}" fill="none" stroke="${line.color}" stroke-width="${m.baseW * 0.8}" stroke-dasharray="${m.baseW} ${m.baseW * 0.8}" stroke-linecap="butt" opacity="0.9"/>`;
        }
        if (near) {
            svg += `<circle cx="${target.x}" cy="${target.y}" r="${m.baseW * 2.4}" fill="none" stroke="#1E5A4E" stroke-width="2" stroke-dasharray="4 3"/>`;
        } else {
            svg += e.originalEvent.altKey
                ? `<rect x="${target.x - 5}" y="${target.y - 5}" width="10" height="10" fill="#1E5A4E"/>`
                : `<circle cx="${target.x}" cy="${target.y}" r="${m.baseW * 0.8}" fill="#fff" stroke="${line.color}" stroke-width="${m.baseW * 0.45}" opacity="0.8"/>`;
        }
        this.view.setOverlay(svg);
        if (tipHtml) this.showTip(e.originalEvent, tipHtml); else this.hideTip();
    }

    lineHoverTip(line, stationId) {
        const s = store.getStation(stationId);
        const st = line.nodes.filter(n => n.type === 'station');
        const onLine = st.some(n => n.id === stationId);
        const dir = store.getExtensionDirection();
        if (onLine) {
            const first = st[0].id, last = st[st.length - 1].id;
            const otherEnd = dir === 'end' ? first : last;
            if (stationId === otherEnd && st.length >= 3 && !line.loop) return `<b>點擊接回「${esc(s.name)}」</b><br><small>形成環狀線</small>`;
            if (stationId === otherEnd) return `<b>「${esc(s.name)}」是另一端點</b><br><small>點擊改從這端延伸</small>`;
            return `<b>「${esc(s.name)}」已在本線上</b>`;
        }
        const codes = s.lines.map(lid => store.getLine(lid)).map(l => l.code || l.name);
        const tail = codes.length ? `此站將成為 ${esc(codes.join('・'))} × ${esc(line.code || line.name)} 轉乘站` : '連接到路線';
        return `<b>點擊連接「${esc(s.name)}」</b><br><small>${tail}</small>`;
    }

    showTip(ev, html) {
        const rect = this.container.getBoundingClientRect();
        this.tip.innerHTML = html;
        this.tip.hidden = false;
        this.tip.style.left = `${ev.clientX - rect.left + 16}px`;
        this.tip.style.top = `${ev.clientY - rect.top - 44}px`;
    }

    hideTip() { this.tip.hidden = true; }

    // =====================================================
    // 車站工具
    // =====================================================

    createStation(latlng) {
        const n = store.getStations().length + 1;
        const s = store.addStation(latlng.lat, latlng.lng, `新車站${n}`);
        store.select('station', [s.id]);
        bus.emit('FOCUS_NAME');
    }

    // =====================================================
    // 路線工具(連連看)
    // =====================================================

    /** 開始繪製:延伸目前選取/當前路線,沒有就開新路線對話框 */
    async startLineSession(opts = {}) {
        let line = opts.lineId ? store.getLine(opts.lineId) : null;
        let dir = opts.direction || null;
        const sel = store.getSelection();
        if (!line && !opts.forceNew) {
            if (sel.type === 'line') line = store.getLine(sel.ids[0]);
            else if (sel.type === 'station' && sel.ids.length === 1) line = store.getActiveLine();
        }
        let isNew = false;
        const checkpoint = store.exportJSON();
        if (!line) {
            const data = await promptNewLine();
            if (!data) return false;
            line = store.addLine(data);
            isNew = true;
            dir = 'end';
            // 若選了單一車站,新路線從該站開始
            if (sel.type === 'station' && sel.ids.length === 1) {
                store.extendLine(line.id, { type: 'station', id: sel.ids[0] });
            }
        }
        if (!dir) dir = (line === store.getActiveLine()) ? store.getExtensionDirection() : 'end';
        store.setActiveLine(line.id, dir);
        store.clearSelection();
        this.lineSession = { lineId: line.id, checkpoint, isNew };
        this.view.showExtension = true;
        return true;
    }

    extendLine(lineId, direction) {
        this.setTool('line', { lineId, direction });
    }

    extendFrom(lineId, stationId) {
        const line = store.getLine(lineId);
        const st = line.nodes.filter(n => n.type === 'station');
        const dir = st.length > 1 && st[0].id === stationId ? 'start' : 'end';
        if (st.length > 1 && st[0].id !== stationId && st[st.length - 1].id !== stationId) {
            toast('此站位於路線中間,將從終點端延伸');
        }
        this.extendLine(lineId, dir);
    }

    endLineSession(cancel) {
        const s = this.lineSession;
        if (!s) return;
        this.lineSession = null;
        this.hideTip();
        if (cancel) {
            store.importJSON(s.checkpoint);
            bus.emit('STATE_CHANGED', store.state);
            toast('已取消繪製', { undo: true });
        } else {
            const line = store.getLine(s.lineId);
            if (line && line.nodes.length === 0 && s.isNew) {
                store.deleteLine(line.id);
            } else if (line) {
                store.select('line', [line.id]);
            }
        }
    }

    finishLine() {
        if (this.tool === 'line') this.setTool('select');
    }

    cancelLine() {
        if (this.tool !== 'line') return;
        this.endLineSession(true);
        this.setTool('select');
    }

    lineToolBlank(latlng, alt) {
        const line = this.lineSession && store.getLine(this.lineSession.lineId);
        if (!line) return;
        const end = store.getExtensionNode();
        let P = this.view.toLayer(latlng);
        if (end && !alt) {
            const endPt = end.type === 'station' ? this.view.model.stationPts.get(end.id) : this.view.toLayer([end.lat, end.lng]);
            if (endPt) P = snapPoint(P, [endPt], 12);
        }
        const ll = this.view.toLatLng(P);
        if (alt) {
            store.extendLine(line.id, { type: 'turning', lat: ll.lat, lng: ll.lng });
            return;
        }
        const s = store.addStation(ll.lat, ll.lng, store.getNextStationName(line.id));
        store.extendLine(line.id, { type: 'station', id: s.id });
    }

    lineToolStation(stationId) {
        const line = this.lineSession && store.getLine(this.lineSession.lineId);
        if (!line) return;
        const s = store.getStation(stationId);
        const st = line.nodes.filter(n => n.type === 'station');
        const dir = store.getExtensionDirection();
        if (st.some(n => n.id === stationId)) {
            const first = st[0].id, last = st[st.length - 1].id;
            const otherEnd = dir === 'end' ? first : last;
            const myEnd = dir === 'end' ? last : first;
            if (stationId === otherEnd && st.length >= 3 && !line.loop) {
                store.updateLine(line.id, { loop: true });
                toast(`「${line.name}」已接成環狀線`, { undo: true });
                this.finishLine();
            } else if (stationId === otherEnd && stationId !== myEnd) {
                store.setExtensionDirection(dir === 'end' ? 'start' : 'end');
                toast(`改從「${s.name}」這端延伸`);
            } else {
                toast(`「${s.name}」已在本線上`);
            }
            return;
        }
        const wasOn = s.lines.length;
        store.extendLine(line.id, { type: 'station', id: stationId });
        if (wasOn) toast(`已連接「${s.name}」,成為轉乘站`, { undo: true });
    }

    lineStepBack() {
        const line = this.lineSession && store.getLine(this.lineSession.lineId);
        if (!line || !line.nodes.length) return;
        const dir = store.getExtensionDirection();
        const idx = dir === 'start' ? 0 : line.nodes.length - 1;
        const node = line.nodes[idx];
        store.removeNode(line.id, idx);
        if (node.type === 'station') {
            const s = store.getStation(node.id);
            const hasCorr = store.state.corridors.some(c => c.fromId === node.id || c.toId === node.id);
            if (s && s.lines.length === 0 && !hasCorr) store.deleteStations([node.id]);
        }
    }

    // =====================================================
    // 連通道工具
    // =====================================================

    corridorClick(stationId) {
        if (!this.corridorFirst) {
            this.corridorFirst = stationId;
            store.select('station', [stationId]);
        } else if (this.corridorFirst === stationId) {
            this.corridorFirst = null;
            store.clearSelection();
        } else {
            const a = store.getStation(this.corridorFirst), b = store.getStation(stationId);
            store.addCorridor(a.id, b.id, this.corridorType);
            toast(`已建立${this.corridorType === 'out-station' ? '站外轉乘' : '站內連通'}:${a.name} ⇄ ${b.name}`, { undo: true });
            this.corridorFirst = null;
            store.clearSelection();
        }
        this.refreshChrome();
    }

    // =====================================================
    // HUD / 提示列
    // =====================================================

    renderHud() {
        const hud = this.hud;
        if (this.tool === 'line' && this.lineSession) {
            const line = store.getLine(this.lineSession.lineId);
            if (!line) { hud.hidden = true; return; }
            const dir = store.getExtensionDirection();
            let names = line.nodes.filter(n => n.type === 'station').map(n => store.getStation(n.id)?.name || '');
            if (dir === 'start') names = names.reverse();
            const shown = names.slice(-4);
            const crumbs = (names.length > 4 ? '<span class="crumb-sep">…</span>' : '') +
                shown.map(n => `<span class="crumb">${esc(n)}</span><span class="crumb-sep">›</span>`).join('') +
                `<span class="crumb next">${line.loop ? '環狀線' : '下一站…'}</span>`;
            hud.className = 'hud';
            hud.innerHTML = `
                <div class="hud-title">
                    <span class="code-badge" style="background:${line.color};color:${contrastText(line.color)}">${esc(line.code || '—')}</span>
                    <div><small>${this.lineSession.isNew ? '新增路線中' : `延伸路線中(${dir === 'start' ? '起點端' : '終點端'})`}</small><b>${esc(line.name)}</b></div>
                </div>
                <div class="crumbs">${crumbs}</div>
                <span style="flex:1"></span>
                <button class="btn sm" data-hud="cancel">取消 <kbd>Esc</kbd></button>
                <button class="btn sm btn-primary" data-hud="done">完成 <kbd>Enter</kbd></button>`;
            hud.hidden = false;
            hud.onclick = (e) => {
                const b = e.target.closest('[data-hud]');
                if (!b) return;
                if (b.dataset.hud === 'done') this.finishLine(); else this.cancelLine();
            };
            return;
        }
        if (this.tool === 'corridor') {
            const first = this.corridorFirst && store.getStation(this.corridorFirst);
            hud.className = 'hud';
            hud.innerHTML = `
                <b>建立連通道</b>
                <span class="seg-toggle">
                    <button data-ct="in-station" class="${this.corridorType === 'in-station' ? 'on' : ''}">站內連通</button>
                    <button data-ct="out-station" class="${this.corridorType === 'out-station' ? 'on' : ''}">站外轉乘</button>
                </span>
                <span style="color:var(--text-2)">${first ? `起點:${esc(first.name)} → 點第二站` : '點第一個車站'}</span>`;
            hud.hidden = false;
            hud.onclick = (e) => {
                const b = e.target.closest('[data-ct]');
                if (!b) return;
                this.corridorType = b.dataset.ct;
                this.renderHud();
            };
            return;
        }
        const sel = store.getSelection();
        if (this.tool === 'select' && sel.type === 'line') {
            hud.className = 'hud dark';
            hud.innerHTML = `<span><b style="color:#F2B01E">■</b> 拖曳轉折點</span><span>・點 ◇ 切換彎折</span><span>・拖曳 ＋ 新增轉折點</span><span>・右鍵/雙擊轉折點刪除</span>`;
            hud.hidden = false;
            hud.onclick = null;
            return;
        }
        hud.hidden = true;
    }

    renderHintBar() {
        const bar = this.hintBar;
        if (this.tool === 'line') {
            bar.innerHTML = '<span>點車站 = 連接</span><span>點空白 = 建新站並連接</span><span><kbd>Alt</kbd>+點 = 轉折點</span><span><kbd>Backspace</kbd>/右鍵 退一步</span><span>點起點 = 環狀線</span>';
            bar.hidden = false;
        } else if (this.tool === 'station') {
            bar.innerHTML = '<span>點空白 = 建立車站</span><span>點路線 = 在該路段插入車站</span><span>拖曳車站 = 移動(<kbd>Alt</kbd> 不吸附)</span>';
            bar.hidden = false;
        } else {
            bar.hidden = true;
        }
    }

    onStateLoaded() {
        if (this.lineSession && !store.getLine(this.lineSession.lineId)) {
            this.lineSession = null;
            this.setTool('select');
        }
        this.refreshChrome();
    }

    // =====================================================
    // 刪除 / 微調 / 快捷鍵
    // =====================================================

    deleteSelection() {
        const sel = store.getSelection();
        if (!sel.type) return;
        if (sel.type === 'station') {
            const names = sel.ids.map(id => store.getStation(id)?.name).filter(Boolean);
            store.deleteStations(sel.ids);
            toast(names.length === 1 ? `已刪除「${names[0]}」` : `已刪除 ${names.length} 個車站`, { undo: true });
        } else if (sel.type === 'line') {
            const l = store.getLine(sel.ids[0]);
            store.deleteLine(sel.ids[0]);
            toast(`已刪除路線「${l.name}」(車站保留)`, { undo: true });
        } else if (sel.type === 'corridor') {
            store.deleteCorridor(sel.ids[0]);
            toast('已刪除連通道', { undo: true });
        }
    }

    nudge(dx, dy) {
        const ids = store.selectedStationIds();
        if (!ids.length) return;
        const m = this.view.model;
        store.moveItems(ids.map(id => {
            const p = m.stationPts.get(id);
            const ll = this.view.toLatLng({ x: p.x + dx, y: p.y + dy });
            return { id, lat: ll.lat, lng: ll.lng };
        }));
    }

    bindKeys() {
        const isTyping = () => {
            const a = document.activeElement;
            return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
        };
        window.addEventListener('keydown', (e) => {
            if (document.querySelector('.modal-overlay')) return;
            // 營運模擬、駕駛模式、指標設計各自處理鍵盤
            const bc = document.body.classList;
            if (bc.contains('sim-mode') || bc.contains('drive-mode') || bc.contains('sd-open')) return;
            const k = e.key;
            const mod = e.ctrlKey || e.metaKey;

            if (mod && !e.altKey) {
                const kl = k.toLowerCase();
                if (kl === 'z' && !isTyping()) { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); }
                else if (kl === 'y' && !isTyping()) { e.preventDefault(); history.redo(); }
                else if (kl === 's') { e.preventDefault(); bus.emit('CMD', 'save'); }
                else if (kl === 'o') { e.preventDefault(); bus.emit('CMD', 'open'); }
                else if (kl === 'a' && !isTyping()) { e.preventDefault(); store.select('station', store.getStations().map(s => s.id)); }
                return;
            }
            if (isTyping()) {
                if (k === 'Escape') document.activeElement.blur();
                return;
            }
            if (k === ' ') {
                if (!this.spaceDown) { this.spaceDown = true; this.container.classList.add('space-pan'); }
                e.preventDefault();
                return;
            }
            if (this.tool === 'line') {
                if (k === 'Enter') { e.preventDefault(); this.finishLine(); return; }
                if (k === 'Escape') { e.preventDefault(); this.cancelLine(); return; }
                if (k === 'Backspace') { e.preventDefault(); this.lineStepBack(); return; }
            }
            if (/^[vVsSlLcCfFmM?]$/.test(k)) e.preventDefault(); // 避免快捷鍵字元落入隨後開啟的輸入框
            switch (k) {
                case 'v': case 'V': this.setTool('select'); break;
                case 's': case 'S': this.setTool('station'); break;
                case 'l': case 'L': this.setTool('line', { forceNew: e.shiftKey }); break;
                case 'c': case 'C': this.setTool('corridor'); break;
                case 'f': case 'F': this.mapCore.fitNetwork(); break;
                case '?': bus.emit('CMD', 'help'); break;
                case 'm': case 'M': bus.emit('CMD', 'merge'); break;
                case 'F2': case 'Enter': if (store.selectedStationIds().length === 1) { e.preventDefault(); bus.emit('FOCUS_NAME'); } break;
                case 'Delete': case 'Backspace': e.preventDefault(); this.deleteSelection(); break;
                case 'Escape':
                    this.hideSegmentBar();
                    if (this.tool !== 'select') this.setTool('select'); else store.clearSelection();
                    break;
                case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
                    if (!store.selectedStationIds().length) return;
                    e.preventDefault();
                    const step = e.shiftKey ? 10 : 1;
                    this.nudge(k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0);
                    break;
                }
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.key === ' ') { this.spaceDown = false; this.container.classList.remove('space-pan'); }
        });
    }
}

export { TOOL_KEYS };
