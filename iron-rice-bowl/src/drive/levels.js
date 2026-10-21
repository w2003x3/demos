/**
 * levels.js
 * 車站層級(平面/地下/高架)與路線出土段(純運算,編輯器、地圖與駕駛模式共用)。
 *
 * - station.level:'auto' | 'ground' | 'underground' | 'elevated';auto 依路線類型決定
 * - station.lineLevels:{ lineId: level } 該站在特定路線的層級(轉乘站各線不同時),優先於 level
 * - line.portals:{ '<站A>|<站B>': t } 相鄰兩站層級不同時,變換(出土/入地/上高架)的位置。
 *   鍵為兩站 id 排序後以 | 相連,t 為「自鍵中第一站起算」佔站間距離的比例(0–1),預設 0.5。
 */

export const STATION_LEVELS = {
    auto: '自動',
    ground: '平面',
    underground: '地下',
    elevated: '高架'
};

/** level=auto 時依路線類型的預設 */
export const LINE_DEFAULT_LEVEL = { metro: 'underground', lrt: 'ground', rail: 'ground', hsr: 'elevated' };

/** 各層級的軌面高度(公尺,地面為 0) */
export const LEVEL_HEIGHT = { underground: -11, ground: 0, elevated: 9 };

export const PORTAL_DEFAULT = 0.5;

export function stationLevel(station, line) {
    // 轉乘站在不同路線可能不同層級(例:忠孝復興 板南線地下、文湖線高架):station.lineLevels[lineId] 優先
    const lv = (line && station?.lineLevels?.[line.id]) || station?.level;
    if (lv && lv !== 'auto' && LEVEL_HEIGHT[lv] !== undefined) return lv;
    return LINE_DEFAULT_LEVEL[line?.type] || 'ground';
}

export function portalKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** 自 a 往 b 的出土位置比例 */
export function getPortal(line, a, b) {
    const t = line?.portals?.[portalKey(a, b)];
    const v = Number.isFinite(t) ? t : PORTAL_DEFAULT;
    return a < b ? v : 1 - v;
}

/** 以「自 a 往 b」的比例 t 寫入 line.portals(回傳新的 portals 物件) */
export function withPortal(line, a, b, t) {
    const v = Math.max(0.05, Math.min(0.95, t));
    return { ...(line.portals || {}), [portalKey(a, b)]: a < b ? v : 1 - v };
}

/** 路線上相鄰兩站層級不同的區間:[{ a, b, la, lb, t }](a、b 依路線車站順序) */
export function levelChanges(line, getStation) {
    const ids = line.nodes.filter(n => n.type === 'station').map(n => n.id);
    const pairs = [];
    for (let i = 0; i < ids.length - 1; i++) pairs.push([ids[i], ids[i + 1]]);
    if (line.loop && ids.length > 2) pairs.push([ids[ids.length - 1], ids[0]]);
    return pairs.map(([a, b]) => {
        const la = stationLevel(getStation(a), line), lb = stationLevel(getStation(b), line);
        return la === lb ? null : { a, b, la, lb, t: getPortal(line, a, b) };
    }).filter(Boolean);
}

/** 點 P 投影到折線上最近處,回傳佔全長的比例(0–1) */
export function fractionOnPath(path, P) {
    let total = 0, best = { d: Infinity, at: 0 };
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
        const l = Math.sqrt(l2);
        const u = l2 ? Math.max(0, Math.min(1, ((P.x - a.x) * dx + (P.y - a.y) * dy) / l2)) : 0;
        const d = Math.hypot(a.x + dx * u - P.x, a.y + dy * u - P.y);
        if (d < best.d) best = { d, at: total + u * l };
        total += l;
    }
    return total ? best.at / total : 0.5;
}

/** 折線上依長度比例 t 取點與方向 */
export function pointAlong(path, t) {
    const lens = [];
    let total = 0;
    for (let i = 1; i < path.length; i++) {
        const l = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
        lens.push(l);
        total += l;
    }
    if (!total) return null;
    let d = Math.max(0, Math.min(1, t)) * total;
    for (let i = 0; i < lens.length; i++) {
        if (d <= lens[i] || i === lens.length - 1) {
            const u = lens[i] ? Math.min(1, d / lens[i]) : 0;
            const p = path[i], q = path[i + 1];
            return { x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u, angle: Math.atan2(q.y - p.y, q.x - p.x), total };
        }
        d -= lens[i];
    }
    return null;
}
