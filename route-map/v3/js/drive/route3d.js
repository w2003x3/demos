/**
 * route3d.js
 * 駕駛模式的路線幾何(純運算,無 DOM/three):
 *   路網圖上畫出的折線(經緯度)→ 區域平面公尺座標 → 轉角以圓弧化順 → 等距取樣 →
 *   車站在路線上的里程、彎道限速。
 * 座標:x = 東(公尺)、z = 南(公尺),對應 three.js 的 x/z(y 向上)。
 */

const R_EARTH = 6371008.8;
export const STEP = 1; // 取樣間距(公尺)

/** 經緯度 → 以 origin 為原點的平面公尺座標 */
export function projectLL(ll, origin) {
    const rad = Math.PI / 180;
    return {
        x: (ll.lng - origin.lng) * rad * R_EARTH * Math.cos(origin.lat * rad),
        z: -(ll.lat - origin.lat) * rad * R_EARTH
    };
}

function dedupe(pts, eps = 0.05) {
    const out = [];
    pts.forEach(p => {
        const q = out[out.length - 1];
        if (!q || Math.hypot(p.x - q.x, p.z - q.z) > eps) out.push({ ...p });
    });
    return out;
}

/**
 * 轉角圓弧化。每個轉角用半徑 radius 的圓弧取代;
 * 切線長最多佔相鄰兩段長度的 45%,避免相鄰圓弧重疊(半徑因此可能變小)。
 * 回傳 { pts, arcs:[{ i0, i1, r }] }(arcs 為圓弧在 pts 中的索引範圍與實際半徑)
 */
export function filletPolyline(input, radius, arcStep = 2) {
    const P = dedupe(input);
    if (P.length < 3) return { pts: P, arcs: [] };
    const out = [P[0]];
    const arcs = [];
    for (let i = 1; i < P.length - 1; i++) {
        const a = P[i - 1], b = P[i], c = P[i + 1];
        const l1 = Math.hypot(b.x - a.x, b.z - a.z), l2 = Math.hypot(c.x - b.x, c.z - b.z);
        const u = { x: (b.x - a.x) / l1, z: (b.z - a.z) / l1 };
        const v = { x: (c.x - b.x) / l2, z: (c.z - b.z) / l2 };
        const dot = Math.max(-1, Math.min(1, u.x * v.x + u.z * v.z));
        const theta = Math.acos(dot); // 轉向角
        if (theta < 0.004 || theta > Math.PI - 0.01) { out.push({ ...b }); continue; }
        const half = Math.tan(theta / 2);
        const t = Math.min(radius * half, 0.45 * l1, 0.45 * l2);
        const r = t / half;
        const p1 = { x: b.x - u.x * t, z: b.z - u.z * t };
        // 圓心在轉向的一側
        const cross = u.x * v.z - u.z * v.x;
        const n = cross > 0 ? { x: -u.z, z: u.x } : { x: u.z, z: -u.x };
        const ctr = { x: p1.x + n.x * r, z: p1.z + n.z * r };
        const a0 = Math.atan2(p1.z - ctr.z, p1.x - ctr.x);
        const sweep = (cross > 0 ? 1 : -1) * theta;
        const k = Math.max(2, Math.ceil(Math.abs(sweep) * r / arcStep));
        const i0 = out.length;
        for (let j = 0; j <= k; j++) {
            const ang = a0 + sweep * j / k;
            out.push({ x: ctr.x + Math.cos(ang) * r, z: ctr.z + Math.sin(ang) * r });
        }
        arcs.push({ i0, i1: out.length - 1, r });
    }
    out.push(P[P.length - 1]);
    return { pts: dedupe(out, 0.01), arcs };
}

/** 折線 → 等距取樣(Float64Array x/z),並回傳每個輸入頂點對應的里程 */
export function resample(pts, step = STEP) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const L = cum[cum.length - 1];
    const n = Math.max(2, Math.floor(L / step) + 1);
    const xs = new Float64Array(n), zs = new Float64Array(n);
    let j = 0;
    for (let k = 0; k < n; k++) {
        const s = Math.min(L, k * step);
        while (j < pts.length - 2 && cum[j + 1] < s) j++;
        const seg = cum[j + 1] - cum[j] || 1;
        const u = (s - cum[j]) / seg;
        xs[k] = pts[j].x + (pts[j + 1].x - pts[j].x) * u;
        zs[k] = pts[j].z + (pts[j + 1].z - pts[j].z) * u;
    }
    return { xs, zs, length: (n - 1) * step, cum };
}

/** 路線上里程 s 處的位置與切線方向 */
export function poseAt(route, s) {
    const { xs, zs } = route;
    const n = xs.length;
    const f = Math.max(0, Math.min(n - 1.0001, s / route.step));
    const i = Math.floor(f), u = f - i;
    const x = xs[i] + (xs[i + 1] - xs[i]) * u;
    const z = zs[i] + (zs[i + 1] - zs[i]) * u;
    // 切線取前後各 3 m 平均,避免取樣折角造成視角抖動
    const a = Math.max(0, i - 3), b = Math.min(n - 1, i + 4);
    let tx = xs[b] - xs[a], tz = zs[b] - zs[a];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    return { x, z, tx, tz, heading: Math.atan2(tx, -tz) };
}

/** 曲線半徑 → 允許速度(km/h);橫向加速度上限 latA(m/s²) */
export function curveSpeed(r, latA = 0.85) {
    return Math.sqrt(latA * r) * 3.6;
}

/**
 * 建立駕駛路線。
 * @param {Array<{lat,lng}>} pathLL 沿路線的折線(含車站點)
 * @param {Array<{id, idx}>} stops 車站與其在 pathLL 的索引(依行駛順序)
 * @param {object} opts { radius 轉彎半徑(m), scale 距離比例, lead 起點前延伸, tail 終點後延伸, vmax(km/h) }
 */
export function buildDriveRoute(pathLL, stops, opts = {}) {
    const radius = opts.radius || 300;
    const scale = opts.scale || 1;
    const lead = opts.lead ?? 250, tail = opts.tail ?? 400;
    const vmax = opts.vmax || 80;
    const origin = pathLL[0];
    let pts = pathLL.map(ll => { const p = projectLL(ll, origin); return { x: p.x * scale, z: p.z * scale }; });
    const stopPts = stops.map(st => pts[st.idx]);
    pts = dedupe(pts);
    if (pts.length < 2) throw new Error('路線太短,無法行駛');

    // 起訖兩端延伸(起點前讓列車停在第一站月台、終點後給冒進空間)
    const ext = (p, q, d) => { const l = Math.hypot(p.x - q.x, p.z - q.z) || 1; return { x: p.x + (p.x - q.x) / l * d, z: p.z + (p.z - q.z) / l * d }; };
    pts.unshift(ext(pts[0], pts[1], lead));
    pts.push(ext(pts[pts.length - 1], pts[pts.length - 2], tail));

    const fl = filletPolyline(pts, radius);
    const rs = resample(fl.pts, STEP);
    const route = { xs: rs.xs, zs: rs.zs, step: STEP, length: rs.length, origin, scale };

    // 每個圓弧區段的限速
    const n = rs.xs.length;
    const limit = new Float32Array(n).fill(vmax);
    fl.arcs.forEach(a => {
        const v = Math.min(vmax, Math.floor(curveSpeed(a.r) / 5) * 5);
        if (v >= vmax) return;
        const s0 = rs.cum[a.i0], s1 = rs.cum[a.i1];
        for (let k = Math.floor(s0 / STEP); k <= Math.min(n - 1, Math.ceil(s1 / STEP)); k++) limit[k] = Math.min(limit[k], Math.max(25, v));
    });
    route.limit = limit;

    // 車站里程:依序在曲線上找最近點(單調前進,環狀線不會跳回起點)
    let from = 0;
    route.stations = stops.map((st, k) => {
        const p = stopPts[k];
        let best = from, bd = Infinity;
        const searchEnd = k === 0 ? Math.min(n, Math.ceil((lead + 50) / STEP) + 1) : n;
        for (let i = from; i < searchEnd; i++) {
            const d = (rs.xs[i] - p.x) ** 2 + (rs.zs[i] - p.z) ** 2;
            if (d < bd) { bd = d; best = i; }
            // 已遠離且距離明顯增加時提早結束,避免環狀線抓到後段
            if (k > 0 && bd < 400 && d > bd * 4 + 1e6) break;
        }
        from = best + 1;
        return { id: st.id, s: best * STEP };
    });
    return route;
}

/**
 * 將站間距離壓縮到合理範圍時建議的比例:平均站距超過 maxGap 公尺就縮小。
 */
export function suggestScale(route) {
    const st = route.stations;
    if (st.length < 2) return 1;
    const avg = (st[st.length - 1].s - st[0].s) / (st.length - 1);
    return avg > 2500 ? Math.max(0.1, Math.round(2000 / avg * 20) / 20) : 1;
}

/** 前方 lookahead 公尺內最低的限速與其位置 */
export function nextLimit(route, s, lookahead = 600) {
    const n = route.limit.length;
    const i0 = Math.max(0, Math.floor(s / route.step));
    const cur = route.limit[Math.min(n - 1, i0)];
    let min = cur, at = s;
    for (let i = i0; i < Math.min(n, i0 + lookahead / route.step); i++) {
        if (route.limit[i] < min) { min = route.limit[i]; at = i * route.step; break; }
    }
    return { current: cur, next: min, at };
}
