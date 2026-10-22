/**
 * trains.js
 * 駕駛模式可選的列車(rail-assets 列車目錄 manifest.trains):依路線類型與名稱挑預設車種,
 * 並把車種性能併入物理參數(spec)。
 */
import { TRAIN_SPECS } from './physics.js';

let cache = null;

/** 讀取模型庫的列車目錄:{ id: { name, cars, gap, tailCab, lead:{slot,length}, middle:{slot,length}, spec, lines } } */
export async function loadTrains(base = 'assets/models/rail') {
    if (!cache) {
        try {
            const r = await fetch(`${base}/manifest.json`, { cache: 'no-cache' });
            cache = r.ok ? ((await r.json()).trains || {}) : {};
        } catch { cache = {}; }
    }
    return cache;
}

/** 依路線挑預設列車(路線名稱優先,其次路線類型) */
export function defaultTrain(trains, line) {
    const n = `${line.name || ''} ${line.code || ''}`;
    const by = [
        [/高鐵|高速|THSR|HSR/i, 'thsr-700t'],
        [/環狀輕軌|高雄輕軌|LK|水岸輕軌/i, 'kaohsiung-lrt'],
        [/淡海|安坑|輕軌|LRT|^\s*V\b/i, 'danhai-lrt'],
        [/環狀線|^\s*Y\b/i, 'circular-line'],
        [/台中|臺中|綠線|烏日文心/i, 'taichung-mrt'],
        [/高雄|紅線|橘線|^\s*[RO]\d?\b/i, 'kaohsiung-mrt'],
        [/普悠瑪/, 'puyuma'],
        [/莒光/, 'chukuang'],
        [/區間|支線|集集|內灣|平溪|深澳|六家|沙崙|成追/, 'emu800'],
    ];
    const byType = { metro: 'taipei-hc', lrt: 'danhai-lrt', rail: 'emu3000', hsr: 'thsr-700t' };
    for (const [re, id] of by) {
        if (!re.test(n) || !trains[id]) continue;
        // 名稱對到但系統類型不符(例如捷運線名稱含「高雄」卻是 lrt 類型)時,以類型為準
        const sys = trains[id].system, t = line.type;
        if ((t === 'lrt') !== (sys === 'lrt') || (t === 'hsr') !== (sys === 'thsr')) continue;
        return id;
    }
    return trains[byType[line.type]] ? byType[line.type] : Object.keys(trains)[0];
}

/** 列車總長(m) */
export function trainLength(t) {
    if (!t) return 0;
    const n = Math.max(1, t.cars);
    const tail = n > 1 ? (t.tailCab !== false ? t.lead.length : t.middle.length) : 0;
    return t.lead.length + Math.max(0, n - 2) * t.middle.length + tail + (n - 1) * (t.gap ?? 0.6);
}

/** 物理參數:路線類型的預設值 + 車種性能;車長、節數依車種 */
export function composeSpec(lineType, t) {
    const base = TRAIN_SPECS[lineType] || TRAIN_SPECS.metro;
    if (!t) return base;
    const len = trainLength(t);
    return { ...base, ...t.spec, name: t.name, cars: t.cars, carLen: len / t.cars, length: len, platform: Math.max(t.spec?.platform || base.platform, Math.ceil(len + 10)) };
}
