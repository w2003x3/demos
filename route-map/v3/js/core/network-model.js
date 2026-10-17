/**
 * network-model.js
 * 由 store.state 與投影函式計算「可繪製模型」(像素座標)。
 * 地圖顯示(network-layer)與匯出(exporter)都用同一份模型 → 所見即所得。
 *
 * buildModel(state, project, opts)
 *   project(lat, lng) → {x, y}
 *   opts: { scale, selectedLineId, theme }
 */
import {
    routeEdge, catmullRom, dedupe, offsetPolyline, endNormal, autoLabelDir,
    nearestDir8, DIR_VEC, longestSegmentMid, textWidth
} from './geometry.js';
import { LINE_TYPE_WIDTH, WIDTH_SCALE, BASEMAPS } from './constants.js';

/** 依底圖/背景色決定文字與暈邊顏色 */
export function themeFor(settings) {
    const bm = BASEMAPS[settings.basemap];
    let dark = !!(bm && bm.dark);
    if (!bm || !bm.url) dark = luminance(settings.bgColor) < 0.4;
    return dark
        ? { dark: true, text: '#f2f2f2', halo: '#1d1f24', ink: '#111111', orphan: '#888888', panel: 'rgba(30,32,38,0.92)', panelText: '#eeeeee' }
        : { dark: false, text: '#1f1f1f', halo: '#ffffff', ink: '#1f1f1f', orphan: '#9a9a9a', panel: 'rgba(255,255,255,0.93)', panelText: '#222222' };
}

export function luminance(hex) {
    const h = String(hex || '#ffffff').replace('#', '');
    const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const r = parseInt(f.substr(0, 2), 16) / 255, g = parseInt(f.substr(2, 2), 16) / 255, b = parseInt(f.substr(4, 2), 16) / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function contrastText(hex) {
    return luminance(hex) > 0.6 ? '#1a1a1a' : '#ffffff';
}

export function buildModel(state, project, opts = {}) {
    const S = opts.scale || 1;
    const settings = state.settings;
    const theme = opts.theme || themeFor(settings);
    const baseW = (settings.lineWidth || 6) * S;
    const fontSize = (settings.labelSize || 13) * S;

    const stationById = new Map(state.stations.map(s => [s.id, s]));
    const stationPts = new Map();
    const P = id => {
        if (!stationPts.has(id)) {
            const s = stationById.get(id);
            stationPts.set(id, project(s.lat, s.lng));
        }
        return stationPts.get(id);
    };

    const sections = [];
    const lineEdges = {};   // lineId → edges(給控制點與點擊定位用)
    const linePts = {};     // lineId → 各節點像素座標

    // ---------- 1. 路線 → 邊 → 區間 ----------
    state.lines.forEach((line, li) => {
        if (line.hidden) return;
        const nodes = line.nodes;
        const n = nodes.length;
        const pts = nodes.map(nd => nd.type === 'station' ? P(nd.id) : project(nd.lat, nd.lng));
        linePts[line.id] = pts;
        const w = baseW * (LINE_TYPE_WIDTH[line.type] || 1) * (WIDTH_SCALE[line.widthScale] || 1);
        const defMode = line.routing || 'diag-first';
        const loop = !!line.loop && n >= 3;

        const edges = [];
        const pairs = [];
        for (let i = 0; i < n - 1; i++) pairs.push([i, i + 1]);
        if (loop) pairs.push([n - 1, 0]);
        const prevOf = i => (i > 0 ? i - 1 : (loop ? n - 1 : i));
        const nextOf = i => (i < n - 1 ? i + 1 : (loop ? 0 : i));

        pairs.forEach(([a, b]) => {
            const mode = nodes[a].route || defMode;
            const path = mode === 'curve'
                ? catmullRom(pts[prevOf(a)], pts[a], pts[b], pts[nextOf(b)])
                : routeEdge(pts[a], pts[b], mode);
            edges.push({ lineId: line.id, from: a, to: b, mode, explicit: !!nodes[a].route, path });
        });
        lineEdges[line.id] = edges;

        // 區間:在車站節點處切開
        let cur = null;
        edges.forEach(e => {
            if (!cur || nodes[e.from].type === 'station') {
                cur = { line, li, edges: [], w, color: line.color, type: line.type || 'metro' };
                sections.push(cur);
            }
            cur.edges.push(e);
        });
    });

    sections.forEach((sec, idx) => {
        const nodes = sec.line.nodes;
        const first = sec.edges[0], last = sec.edges[sec.edges.length - 1];
        const aNode = nodes[first.from], bNode = nodes[last.to];
        sec.idx = idx;
        sec.aId = aNode.type === 'station' ? aNode.id : null;
        sec.bId = bNode.type === 'station' ? bNode.id : null;
        sec.startIdx = first.from;
        sec.status = aNode.status || sec.line.status || 'open';
        const path = [];
        sec.edges.forEach(e => path.push(...e.path));
        sec.path = dedupe(path);
        sec.drawPath = sec.path;
        sec.offset = 0;
        sec.leader = sec;
    });

    // ---------- 2. 共線區間平行排開 ----------
    const groups = new Map();
    sections.forEach(sec => {
        if (!sec.aId || !sec.bId || sec.aId === sec.bId) return;
        const key = [sec.aId, sec.bId].sort().join('|');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(sec);
    });
    const sharedGroups = [];
    groups.forEach((members, key) => {
        if (new Set(members.map(m => m.line.id)).size < 2) return;
        members.sort((a, b) => a.li - b.li);
        const leader = members[0];
        const spacing = Math.max(...members.map(m => m.w)) + 1.5 * S;
        const k = members.length;
        members.forEach((m, i) => {
            const off = (i - (k - 1) / 2) * spacing;
            const reversed = m.aId !== leader.aId;
            const p = offsetPolyline(leader.path, off);
            m.drawPath = reversed ? p.reverse() : p;
            m.offset = off;
            m.leader = leader;
            m.shared = key;
        });
        sharedGroups.push({ key, leader, members, min: members[0].offset, max: members[k - 1].offset });
    });

    // ---------- 3. 車站 ----------
    const corridorTypesOf = new Map();
    state.corridors.forEach(c => {
        [c.fromId, c.toId].forEach(id => {
            if (!corridorTypesOf.has(id)) corridorTypesOf.set(id, new Set());
            corridorTypesOf.get(id).add(c.type);
        });
    });

    const incident = new Map(); // stationId → 向外方向向量
    const addIncident = (id, v) => {
        const l = Math.hypot(v.x, v.y);
        if (l < 0.01) return;
        if (!incident.has(id)) incident.set(id, []);
        incident.get(id).push({ x: v.x / l, y: v.y / l });
    };
    sections.forEach(sec => {
        const p = sec.drawPath;
        if (p.length < 2) return;
        if (sec.aId) addIncident(sec.aId, { x: p[1].x - p[0].x, y: p[1].y - p[0].y });
        if (sec.bId) addIncident(sec.bId, { x: p[p.length - 2].x - p[p.length - 1].x, y: p[p.length - 2].y - p[p.length - 1].y });
    });
    state.corridors.forEach(c => {
        if (!stationById.has(c.fromId) || !stationById.has(c.toId)) return;
        const a = P(c.fromId), b = P(c.toId);
        addIncident(c.fromId, { x: b.x - a.x, y: b.y - a.y });
        addIncident(c.toId, { x: a.x - b.x, y: a.y - b.y });
    });

    const lineById = new Map(state.lines.map((l, i) => [l.id, { line: l, li: i }]));
    const isTerminalOf = (station) => station.lines.some(lid => {
        const L = lineById.get(lid);
        if (!L || L.line.loop) return false;
        const st = L.line.nodes.filter(n => n.type === 'station');
        return st.length > 1 && (st[0].id === station.id || st[st.length - 1].id === station.id);
    });

    const stations = state.stations.map(st => {
        const pt = P(st.id);
        const served = st.lines.map(lid => lineById.get(lid)).filter(l => l && !l.line.hidden).sort((a, b) => a.li - b.li);
        const cTypes = corridorTypesOf.get(st.id) || new Set();

        let kind = st.kind || 'auto';
        if (kind === 'auto') {
            if (served.length === 0) kind = 'orphan';
            else if (served.length > 1 || cTypes.has('in-station')) kind = 'interchange';
            else if (cTypes.has('out-station')) kind = 'out-transfer';
            else if (isTerminalOf(st)) kind = 'terminal';
            else kind = 'normal';
        }
        const color = served.length ? served[0].line.color : theme.orphan;

        // 共線站 → 膠囊形
        let capsule = null;
        sharedGroups.forEach(g => {
            if (g.leader.aId !== st.id && g.leader.bId !== st.id) return;
            const spread = g.max - g.min;
            if (spread <= 0 || (capsule && capsule.spread >= spread)) return;
            const nrm = endNormal(g.leader.path, g.leader.aId === st.id);
            capsule = {
                spread,
                x1: pt.x + nrm.x * g.min, y1: pt.y + nrm.y * g.min,
                x2: pt.x + nrm.x * g.max, y2: pt.y + nrm.y * g.max
            };
        });

        const big = kind === 'interchange' || kind === 'out-transfer';
        let r = baseW * (big ? 1.1 : kind === 'terminal' ? 0.95 : 0.8);
        let fill, stroke, sw;
        if (big) {
            fill = '#ffffff'; stroke = theme.ink; sw = baseW * 0.42;
        } else if (kind === 'orphan') {
            fill = '#ffffff'; stroke = theme.orphan; sw = baseW * 0.4;
        } else if (settings.stationStyle === 'dot') {
            fill = color; stroke = '#ffffff'; sw = baseW * 0.32;
        } else {
            fill = '#ffffff'; stroke = color; sw = baseW * 0.45;
        }
        let dash = kind === 'out-transfer' ? `${baseW * 0.55} ${baseW * 0.35}` : null;
        let opacity = 1;
        const status = st.status || 'open';
        if (status === 'construction') dash = `${baseW * 0.45} ${baseW * 0.3}`;
        if (status === 'planned') { dash = `${baseW * 0.3} ${baseW * 0.3}`; opacity = 0.75; }
        if (status === 'closed') { fill = '#e3e3e3'; stroke = '#9e9e9e'; }

        return {
            id: st.id, x: pt.x, y: pt.y, r, fill, stroke, sw, dash, opacity,
            kind, status, capsule, name: st.name, sub: st.sub || '', labelPos: st.labelPos || 'auto',
            numbers: settings.showNumbers ? served.map(l => st.numbers && st.numbers[l.line.id]).filter(Boolean).join(' ') : ''
        };
    });
    const stationModel = new Map(stations.map(s => [s.id, s]));

    // ---------- 4. 端點路線代碼標籤 ----------
    const badges = [];
    if (settings.showCodes) {
        const stack = new Map();
        state.lines.forEach(line => {
            if (!line.code || line.loop || line.hidden || line.showCode === false) return;
            const st = line.nodes.filter(n => n.type === 'station');
            if (!st.length) return;
            const ends = st.length > 1 && st[0].id !== st[st.length - 1].id ? [st[0].id, st[st.length - 1].id] : [st[0].id];
            ends.forEach(id => {
                const sm = stationModel.get(id);
                if (!sm) return;
                const secs = sections.filter(s => s.line.id === line.id && (s.aId === id || s.bId === id));
                let outward = { x: 0, y: -1 };
                if (secs.length) {
                    const p = secs[0].drawPath;
                    const v = secs[0].aId === id
                        ? { x: p[0].x - p[1].x, y: p[0].y - p[1].y }
                        : { x: p[p.length - 1].x - p[p.length - 2].x, y: p[p.length - 1].y - p[p.length - 2].y };
                    if (Math.hypot(v.x, v.y) > 0.01) outward = v;
                }
                const dirKey = nearestDir8(outward);
                const u = DIR_VEC[dirKey];
                const k = `${id}|${dirKey}`;
                const n = stack.get(k) || 0;
                stack.set(k, n + 1);
                const fs = fontSize * 0.95;
                const h = fs * 1.45;
                const bw = Math.max(h, textWidth(line.code, fs) + fs * 0.8);
                const reach = Math.abs(u.x) * bw / 2 + Math.abs(u.y) * h / 2;
                const radius = sm.capsule ? sm.r + sm.capsule.spread / 2 : sm.r;
                const d = radius + 4 * S + reach + n * (reach * 2 + 3 * S);
                badges.push({
                    lineId: line.id, stationId: id, text: line.code, color: line.color, textColor: contrastText(line.color),
                    x: sm.x + u.x * d, y: sm.y + u.y * d, w: bw, h, fs
                });
                addIncident(id, u);
            });
        });
    }

    // ---------- 5. 站名標籤 ----------
    const labels = [];
    if (settings.showLabels) {
        stations.forEach(sm => {
            const dirKey = sm.labelPos !== 'auto' && DIR_VEC[sm.labelPos] ? sm.labelPos : autoLabelDir(incident.get(sm.id) || []);
            const u = DIR_VEC[dirKey];
            const radius = sm.capsule ? sm.r + sm.capsule.spread / 2 : sm.r;
            const gap = radius + sm.sw / 2 + 3 * S;
            const ax = sm.x + u.x * gap, ay = sm.y + u.y * gap;
            const f = fontSize, fsub = fontSize * 0.72;
            const H = f + (sm.sub ? fsub * 1.15 : 0) + (sm.numbers ? fsub * 1.15 : 0);
            const anchor = u.x > 0.3 ? 'start' : u.x < -0.3 ? 'end' : 'middle';
            const top = u.y < -0.3 ? ay - H : u.y > 0.3 ? ay : ay - H / 2;
            const tw = Math.max(textWidth(sm.name, f), sm.sub ? textWidth(sm.sub, fsub) : 0, sm.numbers ? textWidth(sm.numbers, fsub) : 0);
            const left = anchor === 'start' ? ax : anchor === 'end' ? ax - tw : ax - tw / 2;
            labels.push({
                stationId: sm.id, dir: dirKey, x: ax, anchor,
                nameY: top + f * 0.86, subY: top + f + fsub * 0.95,
                numY: top + f + (sm.sub ? fsub * 1.15 : 0) + fsub * 0.95,
                name: sm.name, sub: sm.sub, numbers: sm.numbers, f, fsub, closed: sm.status === 'closed',
                box: { x: left, y: top, w: tw, h: H }
            });
        });
    }

    // ---------- 6. 連通道 ----------
    const corridors = state.corridors
        .filter(c => stationById.has(c.fromId) && stationById.has(c.toId))
        .map(c => ({ id: c.id, type: c.type, a: P(c.fromId), b: P(c.toId), w: baseW }));

    // ---------- 7. 選取路線的編輯控制點 ----------
    const handles = [];
    const selLine = opts.selectedLineId && state.lines.find(l => l.id === opts.selectedLineId);
    if (selLine) {
        const pts = linePts[selLine.id];
        const followerEdges = new Set();
        sections.forEach(sec => {
            if (sec.line.id === selLine.id && sec.leader !== sec) sec.edges.forEach(e => followerEdges.add(e));
        });
        (lineEdges[selLine.id] || []).forEach(e => {
            if (followerEdges.has(e)) return;
            if (['diag-first', 'orth-first', 'hv', 'vh'].includes(e.mode) && e.path.length === 3) {
                handles.push({ kind: 'elbow', lineId: selLine.id, idx: e.from, mode: e.mode, x: e.path[1].x, y: e.path[1].y });
            }
            const mid = longestSegmentMid(e.path);
            if (mid && mid.len > 28 * S) {
                handles.push({ kind: 'mid', lineId: selLine.id, idx: e.from, to: e.to, x: mid.x, y: mid.y });
            }
        });
        selLine.nodes.forEach((nd, i) => {
            if (nd.type === 'turning') handles.push({ kind: 'turn', lineId: selLine.id, idx: i, x: pts[i].x, y: pts[i].y, color: selLine.color });
        });
    }

    // ---------- 8. 外框 ----------
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x, y) => {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    };
    sections.forEach(s => s.drawPath.forEach(p => grow(p.x, p.y)));
    stations.forEach(s => { grow(s.x - s.r * 2, s.y - s.r * 2); grow(s.x + s.r * 2, s.y + s.r * 2); });
    labels.forEach(l => { grow(l.box.x, l.box.y); grow(l.box.x + l.box.w, l.box.y + l.box.h); });
    badges.forEach(b => { grow(b.x - b.w / 2, b.y - b.h / 2); grow(b.x + b.w / 2, b.y + b.h / 2); });
    Object.values(linePts).forEach(arr => arr.forEach(p => grow(p.x, p.y)));
    const bbox = Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;

    return {
        scale: S, baseW, fontSize, theme, settings,
        sections, stations, labels, badges, corridors, handles,
        lineEdges, linePts, stationPts, bbox
    };
}
