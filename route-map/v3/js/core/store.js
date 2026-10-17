/**
 * store.js
 * Single Source of Truth。所有資料變更都經由這裡,並統一發出 STATE_CHANGED
 * (history 以此拍快照、network-layer 以此重繪)。
 *
 * 資料模型(v3):
 *   station  { id, lat, lng, name, sub, kind, status, labelPos, lines[] }
 *            kind: auto|normal|terminal|interchange|out-transfer
 *            lines 由路線 nodes 推導(_sync),僅為相容與查詢方便而保存
 *   line     { id, name, code, color, type, status, routing, loop, nodes[] }
 *   node     { type:'station', id } | { type:'turning', lat, lng }
 *            皆可帶 route(此節點→下一節點的走線方式)、status(區間狀態,放在區間起點站)
 *   corridor { id, type:'in-station'|'out-station', fromId, toId }
 *   signs    { systemName, systemNameEn, logo, style, stationIcons }(指標設計,見 constants.defaultSigns)
 */
import { bus } from './event-bus.js';
import { DEFAULT_SETTINGS, BASEMAPS, defaultSigns } from './constants.js';
import { withPortal } from './levels.js';

/** 讀檔時補齊指標設計欄位 */
function normalizeSigns(s) {
    const d = defaultSigns();
    if (!s || typeof s !== 'object') return d;
    return {
        ...d, ...s,
        style: { ...d.style, ...(s.style || {}) },
        stationIcons: { ...(s.stationIcons || {}) }
    };
}

/** 合併專案時,出土段的鍵(兩站 id)換成新的車站 id(比例保持「自原 a 往原 b」的方向) */
function remapPortals(line, idMap) {
    const out = {};
    Object.entries(line.portals || {}).forEach(([key, t]) => {
        const [a, b] = key.split('|');
        const na = idMap.get(a), nb = idMap.get(b);
        if (!na || !nb || !Number.isFinite(t)) return;
        Object.assign(out, withPortal({ portals: out }, na, nb, t));
    });
    return out;
}

const FORMAT_VERSION = 3;

export function flipRoute(route) {
    if (route === 'diag-first') return 'orth-first';
    if (route === 'orth-first') return 'diag-first';
    if (route === 'hv') return 'vh';
    if (route === 'vh') return 'hv';
    return route;
}

class Store {
    constructor() {
        this.state = this._emptyState();
        this.stationIdCounter = 1;
        this.lineIdCounter = 1;
        this.corridorIdCounter = 1;
    }

    _emptyState() {
        return {
            stations: [],
            lines: [],
            corridors: [],
            services: [], // 營運班次(模擬模式用)
            signs: defaultSigns(),
            settings: { ...DEFAULT_SETTINGS },
            activeLineId: null,
            extensionDirection: 'end',
            selection: { type: null, ids: [] } // type: station|line|corridor
        };
    }

    // ========================
    // 內部
    // ========================

    /** 由路線 nodes 重新推導 station.lines,並移除懸空引用 */
    _sync() {
        const ids = new Set(this.state.stations.map(s => s.id));
        const map = new Map(this.state.stations.map(s => [s.id, []]));
        this.state.lines.forEach(line => {
            line.nodes = line.nodes.filter(n => n.type !== 'station' || ids.has(n.id));
            line.nodes.forEach(n => {
                if (n.type === 'station') {
                    const arr = map.get(n.id);
                    if (!arr.includes(line.id)) arr.push(line.id);
                }
            });
        });
        this.state.stations.forEach(s => { s.lines = map.get(s.id); });
        this.state.corridors = this.state.corridors.filter(c => ids.has(c.fromId) && ids.has(c.toId));
        const lineIds = new Set(this.state.lines.map(l => l.id));
        this.state.services = (this.state.services || []).filter(v => lineIds.has(v.lineId));
        const icons = this.state.signs.stationIcons;
        Object.keys(icons).forEach(id => { if (!ids.has(id)) delete icons[id]; });
        const sel = this.state.selection;
        const valid = sel.type === 'station' ? ids
            : sel.type === 'line' ? new Set(this.state.lines.map(l => l.id))
                : sel.type === 'corridor' ? new Set(this.state.corridors.map(c => c.id)) : null;
        if (valid) {
            const kept = sel.ids.filter(id => valid.has(id));
            if (kept.length !== sel.ids.length) {
                this.state.selection = { type: kept.length ? sel.type : null, ids: kept };
                bus.emit('SELECTION_CHANGED', this.state.selection);
            }
        }
        if (this.state.activeLineId && !this.getLine(this.state.activeLineId)) {
            this.setActiveLine(null);
        }
    }

    _changed() {
        this._sync();
        bus.emit('STATE_CHANGED', this.state);
    }

    getStation(id) { return this.state.stations.find(s => s.id === id) || null; }
    getLine(id) { return this.state.lines.find(l => l.id === id) || null; }
    getCorridor(id) { return this.state.corridors.find(c => c.id === id) || null; }
    getStations() { return this.state.stations; }
    getLines() { return this.state.lines; }

    // ========================
    // 選取
    // ========================

    select(type, ids) {
        this.state.selection = { type: ids.length ? type : null, ids: [...ids] };
        if (type === 'line' && ids.length === 1) this.setActiveLine(ids[0]);
        bus.emit('SELECTION_CHANGED', this.state.selection);
    }

    toggleStationSelection(id) {
        const sel = this.state.selection;
        const ids = sel.type === 'station' ? [...sel.ids] : [];
        const i = ids.indexOf(id);
        if (i === -1) ids.push(id); else ids.splice(i, 1);
        this.select('station', ids);
    }

    clearSelection() {
        if (this.state.selection.type) this.select(null, []);
    }

    getSelection() { return this.state.selection; }

    selectedStationIds() {
        const sel = this.state.selection;
        return sel.type === 'station' ? sel.ids : [];
    }

    // ========================
    // 當前(延伸中)路線
    // ========================

    setActiveLine(lineId, direction = 'end') {
        this.state.activeLineId = lineId;
        this.state.extensionDirection = direction;
        bus.emit('ACTIVE_LINE_CHANGED', lineId ? this.getLine(lineId) : null);
    }

    setExtensionDirection(dir) {
        if (dir !== 'start' && dir !== 'end') return;
        this.state.extensionDirection = dir;
        bus.emit('ACTIVE_LINE_CHANGED', this.getActiveLine());
    }

    getActiveLine() {
        return this.state.activeLineId ? this.getLine(this.state.activeLineId) : null;
    }

    getExtensionDirection() { return this.state.extensionDirection; }

    /** 當前延伸端的節點(可能是轉折點) */
    getExtensionNode() {
        const line = this.getActiveLine();
        if (!line || !line.nodes.length) return null;
        return this.state.extensionDirection === 'start' ? line.nodes[0] : line.nodes[line.nodes.length - 1];
    }

    // ========================
    // 車站
    // ========================

    addStation(lat, lng, name = '', props = {}) {
        const id = `s${this.stationIdCounter++}`;
        const station = {
            id, lat, lng,
            name: name || `車站 ${id}`,
            sub: '',
            kind: 'auto',
            status: 'open',
            level: 'auto',
            labelPos: 'auto',
            numbers: {},
            lines: [],
            ...props
        };
        this.state.stations.push(station);
        this._changed();
        return station;
    }

    updateStation(id, props) {
        const s = this.getStation(id);
        if (!s) return;
        ['name', 'sub', 'kind', 'status', 'level', 'labelPos'].forEach(k => {
            if (props[k] !== undefined) s[k] = props[k];
        });
        this._changed();
    }

    updateStations(ids, props) {
        ids.forEach(id => {
            const s = this.getStation(id);
            if (!s) return;
            ['kind', 'status', 'level', 'labelPos'].forEach(k => {
                if (props[k] !== undefined) s[k] = props[k];
            });
        });
        this._changed();
    }

    /** 站號(每條路線各自一組,例如 BL12) */
    setStationNumber(stationId, lineId, number) {
        const s = this.getStation(stationId);
        if (!s) return;
        s.numbers = { ...(s.numbers || {}) };
        if (number) s.numbers[lineId] = number; else delete s.numbers[lineId];
        this._changed();
    }

    /**
     * 把車站加入路線。position:
     *   'auto'  插在繞行增加最少的位置(需 project)
     *   'start' / 'end'
     *   數字    插在 nodes 的該索引
     */
    addStationToLine(stationId, lineId, position = 'auto', project) {
        const station = this.getStation(stationId);
        const line = this.getLine(lineId);
        if (!station || !line) return;
        let idx;
        if (position === 'start') idx = 0;
        else if (position === 'end') idx = line.nodes.length;
        else if (typeof position === 'number') idx = position;
        else idx = this._bestInsertIndex(line, station, project);
        line.nodes.splice(idx, 0, { type: 'station', id: stationId });
        this._changed();
    }

    removeStationFromLine(stationId, lineId) {
        const line = this.getLine(lineId);
        if (!line) return;
        line.nodes = line.nodes.filter(n => !(n.type === 'station' && n.id === stationId));
        const s = this.getStation(stationId);
        if (s && s.numbers) delete s.numbers[lineId];
        this._changed();
    }

    /**
     * 拆出為獨立站:共站的第 2 條以後路線各自改用新車站(位置微移),
     * 並以站內連通道相連。offsetFn(station, k) → {lat, lng}
     */
    splitStation(stationId, offsetFn) {
        const s = this.getStation(stationId);
        if (!s || s.lines.length < 2) return [];
        const created = [];
        s.lines.slice(1).forEach((lineId, k) => {
            const pos = offsetFn(s, k + 1);
            const ns = {
                id: `s${this.stationIdCounter++}`, lat: pos.lat, lng: pos.lng,
                name: s.name, sub: s.sub, kind: 'auto', status: s.status, labelPos: 'auto',
                numbers: s.numbers && s.numbers[lineId] ? { [lineId]: s.numbers[lineId] } : {},
                lines: []
            };
            this.state.stations.push(ns);
            const line = this.getLine(lineId);
            line.nodes.forEach(n => { if (n.type === 'station' && n.id === stationId) n.id = ns.id; });
            if (s.numbers) delete s.numbers[lineId];
            this.state.corridors.push({ id: `c${this.corridorIdCounter++}`, type: 'in-station', fromId: stationId, toId: ns.id });
            created.push(ns.id);
        });
        this._changed();
        return created;
    }

    /** 依點選順序把多個車站串成一條新路線 */
    chainNewLine(stationIds, props) {
        const line = this.addLine(props);
        line.nodes = stationIds.map(id => ({ type: 'station', id }));
        this._changed();
        return line;
    }

    /**
     * 批次移動。stations: [{id, lat, lng}];turnings: [{lineId, idx, lat, lng}]
     * 不再自動刪除相鄰轉折點,轉折由使用者自行控制。
     */
    moveItems(stations = [], turnings = []) {
        stations.forEach(m => {
            const s = this.getStation(m.id);
            if (s) { s.lat = m.lat; s.lng = m.lng; }
        });
        turnings.forEach(t => {
            const line = this.getLine(t.lineId);
            const node = line && line.nodes[t.idx];
            if (node && node.type === 'turning') { node.lat = t.lat; node.lng = t.lng; }
        });
        this._changed();
    }

    deleteStations(ids) {
        const set = new Set(ids);
        this.state.stations = this.state.stations.filter(s => !set.has(s.id));
        this.state.lines.forEach(line => {
            line.nodes = line.nodes.filter(n => !(n.type === 'station' && set.has(n.id)));
        });
        this._changed();
    }

    /** 將多站合併為一個共站(targetId 保留) */
    mergeStations(ids, targetId, newName) {
        const target = this.getStation(targetId);
        if (!target) return;
        const others = new Set(ids.filter(id => id !== targetId));
        this.state.lines.forEach(line => {
            line.nodes.forEach(n => {
                if (n.type === 'station' && others.has(n.id)) n.id = targetId;
            });
            // 合併後同一路線相鄰重複的站節點只留一個
            line.nodes = line.nodes.filter((n, i, arr) =>
                !(i > 0 && n.type === 'station' && arr[i - 1].type === 'station' && arr[i - 1].id === n.id));
        });
        this.state.corridors.forEach(c => {
            if (others.has(c.fromId)) c.fromId = targetId;
            if (others.has(c.toId)) c.toId = targetId;
        });
        this.state.corridors = this.state.corridors.filter(c => c.fromId !== c.toId);
        this.state.stations.filter(s => others.has(s.id)).forEach(s => {
            target.numbers = { ...(s.numbers || {}), ...(target.numbers || {}) };
        });
        this.state.stations = this.state.stations.filter(s => !others.has(s.id));
        if (newName) target.name = newName;
        this.select('station', [targetId]);
        this._changed();
    }

    /**
     * 設定車站所屬路線。新加入的路線會把車站插入「繞行距離增加最少」的位置,
     * 而不是一律接在尾端。project(lat,lng) → {x,y} 用於以像素距離計算。
     */
    setStationLines(stationId, lineIds, project) {
        const station = this.getStation(stationId);
        if (!station) return;
        const old = station.lines;
        old.filter(l => !lineIds.includes(l)).forEach(lid => {
            const line = this.getLine(lid);
            if (line) line.nodes = line.nodes.filter(n => !(n.type === 'station' && n.id === stationId));
        });
        lineIds.filter(l => !old.includes(l)).forEach(lid => {
            const line = this.getLine(lid);
            if (!line) return;
            const idx = this._bestInsertIndex(line, station, project);
            line.nodes.splice(idx, 0, { type: 'station', id: stationId });
        });
        this._changed();
    }

    _bestInsertIndex(line, station, project) {
        const n = line.nodes.length;
        if (n === 0 || !project) return n;
        const pt = (node) => {
            if (node.type === 'station') {
                const s = this.getStation(node.id);
                return project(s.lat, s.lng);
            }
            return project(node.lat, node.lng);
        };
        const P = project(station.lat, station.lng);
        const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const pts = line.nodes.map(pt);
        let bestIdx = n, bestCost = d(P, pts[n - 1]);
        if (d(P, pts[0]) < bestCost) { bestIdx = 0; bestCost = d(P, pts[0]); }
        for (let i = 0; i < n - 1; i++) {
            const cost = d(pts[i], P) + d(P, pts[i + 1]) - d(pts[i], pts[i + 1]);
            if (cost < bestCost) { bestCost = cost; bestIdx = i + 1; }
        }
        return bestIdx;
    }

    getNextStationName(lineId) {
        const line = this.getLine(lineId);
        if (!line) return '新車站';
        const prefix = line.name.replace(/線$/, '');
        const count = line.nodes.filter(n => n.type === 'station').length;
        return `${prefix}${count + 1}站`;
    }

    // ========================
    // 路線
    // ========================

    getNextLineName() {
        const existing = new Set(this.state.lines.map(l => l.name));
        for (let i = 0; i < 26; i++) {
            const name = `${String.fromCharCode(65 + i)}線`;
            if (!existing.has(name)) return name;
        }
        let n = 27;
        while (existing.has(`${n}線`)) n++;
        return `${n}線`;
    }

    addLine(props) {
        const id = `l${this.lineIdCounter++}`;
        const line = {
            id,
            name: props.name || this.getNextLineName(),
            code: props.code || '',
            color: props.color || '#0070BD',
            type: props.type || 'metro',
            status: props.status || 'open',
            routing: props.routing || 'diag-first',
            loop: false,
            hidden: false,
            widthScale: 'normal', // thin|normal|thick
            showCode: true,
            portals: {},
            nodes: []
        };
        this.state.lines.push(line);
        this._changed();
        return line;
    }

    updateLine(id, props) {
        const line = this.getLine(id);
        if (!line) return;
        ['name', 'code', 'color', 'type', 'status', 'routing', 'loop', 'hidden', 'widthScale', 'showCode', 'portals'].forEach(k => {
            if (props[k] !== undefined) line[k] = props[k];
        });
        this._changed();
        if (this.state.activeLineId === id) bus.emit('ACTIVE_LINE_CHANGED', line);
    }

    deleteLine(id) {
        this.state.lines = this.state.lines.filter(l => l.id !== id);
        this._changed();
    }

    moveLineOrder(id, delta) {
        const arr = this.state.lines;
        const i = arr.findIndex(l => l.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        this._changed();
    }

    /** 依延伸方向把節點接到路線前端或尾端 */
    extendLine(lineId, node) {
        const line = this.getLine(lineId);
        if (!line) return;
        if (this.state.extensionDirection === 'start') line.nodes.unshift(node);
        else line.nodes.push(node);
        this._changed();
    }

    insertNode(lineId, index, node) {
        const line = this.getLine(lineId);
        if (!line) return;
        line.nodes.splice(Math.max(0, Math.min(index, line.nodes.length)), 0, node);
        this._changed();
    }

    updateNode(lineId, idx, props) {
        const line = this.getLine(lineId);
        const node = line && line.nodes[idx];
        if (!node) return;
        Object.entries(props).forEach(([k, v]) => {
            if (v === null || v === undefined) delete node[k]; else node[k] = v;
        });
        this._changed();
    }

    removeNode(lineId, idx) {
        const line = this.getLine(lineId);
        if (!line || !line.nodes[idx]) return;
        line.nodes.splice(idx, 1);
        this._changed();
    }

    /** 在路線中把某站與上/下一個「車站節點」對調(轉折點位置不動) */
    moveStationInLine(lineId, stationIdx, delta) {
        const line = this.getLine(lineId);
        if (!line) return;
        const sIdx = line.nodes.map((n, i) => n.type === 'station' ? i : -1).filter(i => i >= 0);
        const k = sIdx.indexOf(stationIdx);
        const k2 = k + delta;
        if (k < 0 || k2 < 0 || k2 >= sIdx.length) return;
        const a = sIdx[k], b = sIdx[k2];
        [line.nodes[a], line.nodes[b]] = [line.nodes[b], line.nodes[a]];
        this._changed();
    }

    /** 反轉路線方向;區間屬性跟著區間走,先斜/先直互換以維持同一幾何 */
    reverseLine(lineId) {
        const line = this.getLine(lineId);
        if (!line || line.nodes.length < 2) return;
        const n = line.nodes.length;
        const edgeProps = line.nodes.map(nd => ({ route: nd.route, status: nd.status }));
        const rev = [...line.nodes].reverse().map(nd => {
            const c = { ...nd };
            delete c.route; delete c.status;
            return c;
        });
        for (let k = 0; k < n; k++) {
            // 新邊 k(rev[k]→rev[k+1]) = 原邊 n-2-k;閉合邊(環狀)= 原閉合邊 n-1
            const src = k < n - 1 ? edgeProps[n - 2 - k] : edgeProps[n - 1];
            if (src.route) rev[k].route = flipRoute(src.route);
            if (src.status) rev[k].status = src.status;
        }
        line.nodes = rev;
        if (this.state.activeLineId === lineId) {
            this.state.extensionDirection = this.state.extensionDirection === 'start' ? 'end' : 'start';
        }
        this._changed();
    }

    clearTurnings(lineId) {
        const line = this.getLine(lineId);
        if (!line) return;
        line.nodes = line.nodes.filter(n => n.type !== 'turning');
        this._changed();
    }

    // ========================
    // 連通道
    // ========================

    addCorridor(fromId, toId, type = 'in-station') {
        if (fromId === toId) return null;
        const exists = this.state.corridors.find(c =>
            (c.fromId === fromId && c.toId === toId) || (c.fromId === toId && c.toId === fromId));
        if (exists) {
            exists.type = type;
            this._changed();
            return exists;
        }
        const corridor = { id: `c${this.corridorIdCounter++}`, type, fromId, toId };
        this.state.corridors.push(corridor);
        this._changed();
        return corridor;
    }

    updateCorridor(id, props) {
        const c = this.getCorridor(id);
        if (!c) return;
        if (props.type) c.type = props.type;
        this._changed();
    }

    deleteCorridor(id) {
        this.state.corridors = this.state.corridors.filter(c => c.id !== id);
        this._changed();
    }

    // ========================
    // 營運班次(模擬模式)
    // service { id, lineId, name, fromId, toId, pattern: both|forward|backward,
    //           headway(分), speed(km/h), dwell(秒), start(分,自 00:00), end(分) }
    // ========================

    addService(lineId, props = {}) {
        const line = this.getLine(lineId);
        if (!line) return null;
        const st = line.nodes.filter(n => n.type === 'station');
        if (st.length < 2) return null;
        const preset = { metro: [35, 6, 30], lrt: [22, 10, 25], rail: [70, 20, 60], hsr: [200, 30, 90] }[line.type] || [35, 6, 30];
        this.state.services = this.state.services || [];
        const n = this.state.services.filter(s => s.lineId === lineId).length;
        const svc = {
            id: `v${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
            lineId,
            name: n ? `${line.name} 區間${n + 1}` : `${line.name} 全線`,
            fromId: st[0].id,
            toId: line.loop ? st[0].id : st[st.length - 1].id,
            pattern: 'both',
            speed: preset[0], headway: preset[1], dwell: preset[2],
            start: 6 * 60, end: 23 * 60 + 59,
            ...props
        };
        this.state.services.push(svc);
        this._changed();
        return svc;
    }

    updateService(id, props) {
        const s = (this.state.services || []).find(x => x.id === id);
        if (!s) return;
        Object.assign(s, props);
        this._changed();
    }

    deleteService(id) {
        this.state.services = (this.state.services || []).filter(x => x.id !== id);
        this._changed();
    }

    // ========================
    // 指標設計
    // ========================

    /** props 可含 systemName / systemNameEn;style 欄位放在 props.style */
    updateSigns(props) {
        const sg = this.state.signs;
        if (props.systemName !== undefined) sg.systemName = props.systemName;
        if (props.systemNameEn !== undefined) sg.systemNameEn = props.systemNameEn;
        if (props.style) sg.style = { ...sg.style, ...props.style };
        this._changed();
    }

    /** icon: { shapes } 或 null(移除) */
    setLogo(icon) {
        this.state.signs.logo = icon && icon.shapes.length ? icon : null;
        this._changed();
    }

    setStationIcon(stationId, icon) {
        const icons = this.state.signs.stationIcons;
        if (icon && icon.shapes.length) icons[stationId] = icon; else delete icons[stationId];
        this._changed();
    }

    // ========================
    // 顯示設定(屬於專案,一併存檔)
    // ========================

    updateSettings(props) {
        Object.assign(this.state.settings, props);
        bus.emit('SETTINGS_CHANGED', this.state.settings);
        this._changed();
    }

    // ========================
    // Save / Load
    // ========================

    exportJSON() {
        return JSON.stringify({
            version: FORMAT_VERSION,
            stations: this.state.stations,
            lines: this.state.lines,
            corridors: this.state.corridors,
            services: this.state.services,
            signs: this.state.signs,
            settings: this.state.settings,
            activeLineId: this.state.activeLineId,
            counters: {
                station: this.stationIdCounter,
                line: this.lineIdCounter,
                corridor: this.corridorIdCounter
            }
        }, null, 2);
    }

    /** 讀入專案;相容 v2 格式(補齊新欄位預設值) */
    importJSON(jsonString) {
        const data = JSON.parse(jsonString);
        const state = this._emptyState();

        state.stations = (data.stations || []).map(s => ({
            sub: '', kind: 'auto', status: 'open', level: 'auto', labelPos: 'auto', numbers: {}, ...s, lines: []
        }));
        state.lines = (data.lines || []).map(l => ({
            code: '', type: 'metro', status: 'open', routing: 'diag-first', loop: false, hidden: false, widthScale: 'normal', showCode: true, portals: {},
            ...l,
            nodes: (l.nodes || []).filter(n => n && (n.type === 'station' || n.type === 'turning'))
        }));
        state.corridors = data.corridors || [];
        state.services = data.services || [];
        state.signs = normalizeSigns(data.signs);
        state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
        if (!BASEMAPS[state.settings.basemap]) state.settings.basemap = DEFAULT_SETTINGS.basemap;
        state.activeLineId = data.activeLineId || null;
        this.state = state;

        const maxNum = (arr, prefix) => arr.reduce((m, x) => {
            const n = parseInt(String(x.id).replace(prefix, ''), 10);
            return Number.isFinite(n) ? Math.max(m, n) : m;
        }, 0) + 1;
        const c = data.counters || {};
        this.stationIdCounter = Math.max(c.station || 1, maxNum(state.stations, 's'));
        this.lineIdCounter = Math.max(c.line || 1, maxNum(state.lines, 'l'));
        this.corridorIdCounter = Math.max(c.corridor || 1, maxNum(state.corridors, 'c'));

        this._sync();
        bus.emit('STATE_LOADED', this.state);
        bus.emit('SETTINGS_CHANGED', this.state.settings);
        bus.emit('SELECTION_CHANGED', this.state.selection);
        bus.emit('ACTIVE_LINE_CHANGED', this.getActiveLine());
    }

    /**
     * 把另一份專案資料併入目前專案(載入預設路網「合併」用)。
     * 重新編號避免 id 衝突;同名且距離 < mergeMeters 的車站自動設為共站。
     */
    appendProject(data, { mergeMeters = 300 } = {}) {
        const idMap = new Map();
        const near = (a, b) => {
            const dLat = (a.lat - b.lat) * 111320;
            const dLng = (a.lng - b.lng) * 111320 * Math.cos(a.lat * Math.PI / 180);
            return Math.hypot(dLat, dLng) < mergeMeters;
        };
        const norm = (n) => String(n || '').replace(/站$/, '').trim();
        (data.stations || []).forEach(s => {
            const same = mergeMeters > 0 && this.state.stations.find(x => norm(x.name) === norm(s.name) && near(x, s));
            if (same) {
                idMap.set(s.id, same.id);
                same.numbers = { ...(same.numbers || {}) };
                return;
            }
            const id = `s${this.stationIdCounter++}`;
            idMap.set(s.id, id);
            this.state.stations.push({
                sub: '', kind: 'auto', status: 'open', level: 'auto', labelPos: 'auto', ...s, id, numbers: {}, lines: []
            });
        });
        const lineMap = new Map();
        (data.lines || []).forEach(l => {
            const id = `l${this.lineIdCounter++}`;
            lineMap.set(l.id, id);
            this.state.lines.push({
                code: '', type: 'metro', status: 'open', routing: 'diag-first', loop: false, hidden: false,
                widthScale: 'normal', showCode: true, ...l, id,
                nodes: (l.nodes || []).map(n => n.type === 'station' ? { ...n, id: idMap.get(n.id) } : { ...n }),
                portals: remapPortals(l, idMap)
            });
        });
        // 站號依新的路線 id 對應
        (data.stations || []).forEach(s => {
            const target = this.getStation(idMap.get(s.id));
            Object.entries(s.numbers || {}).forEach(([lid, num]) => {
                if (lineMap.has(lid)) target.numbers[lineMap.get(lid)] = num;
            });
        });
        (data.corridors || []).forEach(c => {
            const a = idMap.get(c.fromId), b = idMap.get(c.toId);
            if (a && b && a !== b) this.state.corridors.push({ id: `c${this.corridorIdCounter++}`, type: c.type, fromId: a, toId: b });
        });
        // 車站圖示跟著新 id;既有的優先
        Object.entries(data.signs?.stationIcons || {}).forEach(([sid, icon]) => {
            const nid = idMap.get(sid);
            if (nid && !this.state.signs.stationIcons[nid]) this.state.signs.stationIcons[nid] = icon;
        });
        this._sync();
        bus.emit('STATE_LOADED', this.state);
        bus.emit('STATE_CHANGED', this.state);
    }

    newProject() {
        const settings = { ...this.state.settings, title: '' };
        this.importJSON(JSON.stringify({ settings }));
        bus.emit('STATE_CHANGED', this.state);
    }
}

export const store = new Store();
