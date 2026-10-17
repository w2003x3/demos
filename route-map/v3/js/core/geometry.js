/**
 * geometry.js
 * 純幾何運算(像素座標,y 向下),不依賴 Leaflet,地圖顯示與匯出共用。
 * - 八方位(45°)走線
 * - 共線平行偏移
 * - 45°/90° 吸附
 * - 標籤自動方位
 */

export const DIR_KEYS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];

const R2 = Math.SQRT1_2;
export const DIR_VEC = {
    E: { x: 1, y: 0 }, NE: { x: R2, y: -R2 }, N: { x: 0, y: -1 }, NW: { x: -R2, y: -R2 },
    W: { x: -1, y: 0 }, SW: { x: -R2, y: R2 }, S: { x: 0, y: 1 }, SE: { x: R2, y: R2 }
};

// 自動標籤的偏好順序(同分時)
const LABEL_PREF = ['E', 'W', 'S', 'N', 'NE', 'SE', 'NW', 'SW'];

const TAU = Math.PI * 2;

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function angDiff(a, b) {
    let d = Math.abs(a - b) % TAU;
    return d > Math.PI ? TAU - d : d;
}

/** 螢幕向量 → 角度(以右為 0、逆時針為正,即 y 取負) */
const angleOf = v => Math.atan2(-v.y, v.x);

export function nearestDir8(v) {
    const idx = Math.round(angleOf(v) / (Math.PI / 4));
    return DIR_KEYS[((idx % 8) + 8) % 8];
}

/**
 * 單一邊的走線。
 * mode: diag-first(先斜後直) | orth-first(先直後斜) | hv / vh(直角) | straight
 */
export function routeEdge(p, q, mode) {
    const dx = q.x - p.x, dy = q.y - p.y;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (mode === 'straight' || ax < 0.5 || ay < 0.5) return [p, q];
    if (Math.abs(ax - ay) < 0.5 && mode !== 'hv' && mode !== 'vh') return [p, q];
    if (mode === 'hv') return [p, { x: q.x, y: p.y }, q];
    if (mode === 'vh') return [p, { x: p.x, y: q.y }, q];
    const m = Math.min(ax, ay), sx = Math.sign(dx), sy = Math.sign(dy);
    if (mode === 'orth-first') return [p, { x: q.x - m * sx, y: q.y - m * sy }, q];
    return [p, { x: p.x + m * sx, y: p.y + m * sy }, q];
}

/** Catmull-Rom 曲線:回傳 p1→p2 間的取樣點(含兩端) */
export function catmullRom(p0, p1, p2, p3, steps = 16) {
    const out = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
    return out;
}

export function dedupe(pts, eps = 0.01) {
    const out = [];
    pts.forEach(p => {
        const last = out[out.length - 1];
        if (!last || Math.abs(last.x - p.x) > eps || Math.abs(last.y - p.y) > eps) out.push(p);
    });
    return out;
}

/** 法向量(行進方向左手側,螢幕座標) */
function normalOf(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dy / len, y: -dx / len };
}

/** 折線平行偏移 d 像素(斜接,過尖時改為斜切) */
export function offsetPolyline(input, d) {
    const pts = dedupe(input);
    if (!d || pts.length < 2) return pts.slice();
    const normals = [];
    for (let i = 0; i < pts.length - 1; i++) normals.push(normalOf(pts[i], pts[i + 1]));
    const out = [];
    const n0 = normals[0];
    out.push({ x: pts[0].x + n0.x * d, y: pts[0].y + n0.y * d });
    for (let i = 1; i < pts.length - 1; i++) {
        const n1 = normals[i - 1], n2 = normals[i];
        const mx = n1.x + n2.x, my = n1.y + n2.y;
        const ml = Math.hypot(mx, my);
        const p = pts[i];
        if (ml < 1e-6) {
            out.push({ x: p.x + n1.x * d, y: p.y + n1.y * d }, { x: p.x + n2.x * d, y: p.y + n2.y * d });
            continue;
        }
        const m = { x: mx / ml, y: my / ml };
        const cos = m.x * n1.x + m.y * n1.y;
        if (cos < 0.3) {
            out.push({ x: p.x + n1.x * d, y: p.y + n1.y * d }, { x: p.x + n2.x * d, y: p.y + n2.y * d });
        } else {
            out.push({ x: p.x + m.x * d / cos, y: p.y + m.y * d / cos });
        }
    }
    const nl = normals[normals.length - 1];
    const last = pts[pts.length - 1];
    out.push({ x: last.x + nl.x * d, y: last.y + nl.y * d });
    return out;
}

/** 折線在某端點的法向量(依折線方向) */
export function endNormal(pts, atStart) {
    const p = dedupe(pts);
    if (p.length < 2) return { x: 0, y: -1 };
    return atStart ? normalOf(p[0], p[1]) : normalOf(p[p.length - 2], p[p.length - 1]);
}

const SNAP_DIRS = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: R2, y: R2 }, { x: R2, y: -R2 }];

function intersect(a, u, b, v) {
    const cross = u.x * v.y - u.y * v.x;
    if (Math.abs(cross) < 1e-9) return null;
    const s = ((b.x - a.x) * v.y - (b.y - a.y) * v.x) / cross;
    return { x: a.x + u.x * s, y: a.y + u.y * s };
}

/**
 * 45°/90° 吸附:優先吸到「同時對齊兩個錨點」的交點,其次吸到任一錨點的八方位射線。
 * 回傳 { x, y, snapped, guides:[{from, to}] }
 */
export function snapPoint(p, anchors, th = 10) {
    const A = anchors.slice(0, 6);
    let best = null, bestD = th * 1.2;
    for (let i = 0; i < A.length; i++) {
        for (let j = i + 1; j < A.length; j++) {
            for (const u of SNAP_DIRS) {
                for (const v of SNAP_DIRS) {
                    if (u === v) continue;
                    const X = intersect(A[i], u, A[j], v);
                    if (!X) continue;
                    const d = dist(p, X);
                    if (d < bestD) { bestD = d; best = { ...X, guides: [A[i], A[j]] }; }
                }
            }
        }
    }
    if (!best) {
        bestD = th;
        for (const a of A) {
            for (const u of SNAP_DIRS) {
                const t = (p.x - a.x) * u.x + (p.y - a.y) * u.y;
                const X = { x: a.x + u.x * t, y: a.y + u.y * t };
                const d = dist(p, X);
                if (d < bestD) { bestD = d; best = { ...X, guides: [a] }; }
            }
        }
    }
    if (!best) return { x: p.x, y: p.y, snapped: false, guides: [] };
    return { x: best.x, y: best.y, snapped: true, guides: best.guides };
}

/** 依連出去的線段方向,選一個最空曠的標籤方位 */
export function autoLabelDir(vectors) {
    if (!vectors.length) return 'E';
    const angles = vectors.map(angleOf);
    let bestKey = 'E', bestScore = -Infinity;
    LABEL_PREF.forEach((k, i) => {
        const a = angleOf(DIR_VEC[k]);
        const minDiff = Math.min(...angles.map(b => angDiff(a, b)));
        const orthBonus = (k.length === 1) ? 0.25 : 0;
        const score = minDiff + orthBonus - i * 0.001;
        if (score > bestScore) { bestScore = score; bestKey = k; }
    });
    return bestKey;
}

export function pointToSegmentDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distToPolyline(p, pts) {
    let m = Infinity;
    for (let i = 0; i < pts.length - 1; i++) m = Math.min(m, pointToSegmentDist(p, pts[i], pts[i + 1]));
    return m;
}

/** 折線中最長一段的中點(放「+」控制點用) */
export function longestSegmentMid(pts) {
    let best = null, bestLen = -1;
    for (let i = 0; i < pts.length - 1; i++) {
        const l = dist(pts[i], pts[i + 1]);
        if (l > bestLen) {
            bestLen = l;
            best = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2, len: l };
        }
    }
    return best;
}

/** 粗估文字寬度(CJK 以全形計) */
export function textWidth(str, size) {
    let w = 0;
    for (const ch of String(str || '')) {
        const c = ch.codePointAt(0);
        w += c > 0x2E80 ? size : (c === 32 ? size * 0.3 : size * 0.58);
    }
    return w;
}
