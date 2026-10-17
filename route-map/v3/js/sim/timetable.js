/**
 * timetable.js
 * 營運模擬的純運算(無 DOM):行駛時刻表、列車位置內插。
 * 距離單位公尺、時間單位秒。
 */

/**
 * 由停靠點(沿路徑距離)建立行駛時間軸。
 * 站間以等效均速行駛(含加減速修正 ×1.15),中途站停靠 dwell 秒。
 */
export function buildTimeline(stops, speedKmh, dwellS) {
    const v = Math.max(1, speedKmh) / 3.6;
    const segs = [];
    let t = 0;
    for (let i = 0; i < stops.length - 1; i++) {
        const d0 = stops[i].d, d1 = stops[i + 1].d;
        const dur = Math.max(20, (Math.abs(d1 - d0) / v) * 1.15);
        segs.push({ type: 'run', t0: t, t1: t + dur, d0, d1, from: i, to: i + 1 });
        t += dur;
        if (i + 1 < stops.length - 1 && dwellS > 0) {
            segs.push({ type: 'dwell', t0: t, t1: t + dwellS, d0: d1, d1, at: i + 1 });
            t += dwellS;
        }
    }
    return { segs, T: t };
}

/** 行駛中第 age 秒的位置;站間以餘弦緩動模擬加減速 */
export function stateAt(timeline, age) {
    const segs = timeline.segs;
    if (!segs.length) return null;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (segs[mid].t1 < age) lo = mid + 1; else hi = mid;
    }
    const s = segs[lo];
    if (s.type === 'dwell') return { d: s.d0, dwell: true, stop: s.at, next: s.at + 1 };
    const u = Math.min(1, Math.max(0, (age - s.t0) / (s.t1 - s.t0)));
    const e = (1 - Math.cos(Math.PI * u)) / 2;
    return { d: s.d0 + (s.d1 - s.d0) * e, dwell: false, next: s.to };
}

/** 路徑上距離 d 公尺處的點與行進角度(度) */
export function pointAt(path, cum, d) {
    const n = path.length;
    if (n < 2) return { x: path[0].x, y: path[0].y, angle: 0 };
    d = Math.max(0, Math.min(cum[n - 1], d));
    let lo = 0, hi = n - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= d) lo = mid; else hi = mid;
    }
    const a = path[lo], b = path[hi];
    const seg = cum[hi] - cum[lo] || 1;
    const u = (d - cum[lo]) / seg;
    return {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
    };
}

/**
 * 在時間 t(秒,自 00:00)仍在路上的各班次出發時間。
 * 首班 start 分、末班 end 分,每 headway 分一班。
 */
export function activeDepartures(t, T, startMin, endMin, headwayMin) {
    const h = Math.max(0.5, headwayMin) * 60;
    const s = startMin * 60, e = endMin * 60;
    const out = [];
    const kMin = Math.max(0, Math.ceil((t - T - s) / h));
    const kMax = Math.floor((Math.min(t, e) - s) / h);
    for (let k = kMin; k <= kMax; k++) {
        const dep = s + k * h;
        const age = t - dep;
        if (age >= 0 && age <= T) out.push({ dep, age, k });
    }
    return out;
}

/** 經緯度距離(公尺) */
export function haversine(a, b) {
    const R = 6371008.8, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

export function fmtClock(t) {
    t = ((Math.floor(t) % 86400) + 86400) % 86400;
    const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
