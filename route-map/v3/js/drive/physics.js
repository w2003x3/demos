/**
 * physics.js
 * 列車動力學(純運算):單柄主控制器檔位、牽引/制動力延遲、行車阻力、ATP 超速防護、停車評分。
 * 單位:速度 m/s、距離 m、加速度 m/s²。
 */

/** 各路線類型的列車性能(vmax km/h;accel/brake m/s²) */
export const TRAIN_SPECS = {
    metro: { name: '捷運電聯車', vmax: 80, accel: 1.0, brake: 1.1, eb: 1.4, P: 4, B: 7, cars: 6, carLen: 23, platform: 145, radius: 350 },
    lrt: { name: '輕軌電車', vmax: 50, accel: 1.1, brake: 1.2, eb: 2.2, P: 4, B: 7, cars: 3, carLen: 11, platform: 40, radius: 120 },
    rail: { name: '區間車', vmax: 110, accel: 0.75, brake: 0.95, eb: 1.25, P: 5, B: 8, cars: 8, carLen: 20, platform: 175, radius: 600 },
    hsr: { name: '高速列車', vmax: 300, accel: 0.55, brake: 0.9, eb: 1.15, P: 5, B: 7, cars: 12, carLen: 25, platform: 310, radius: 4000 }
};

/** 檔位:正數=牽引 P1..P、0=惰行 N、負數=制動 B1..B、-(B+1)=緊急制動 EB */
export function notchLabel(notch, spec) {
    if (notch > 0) return `P${notch}`;
    if (notch === 0) return 'N';
    if (notch <= -(spec.B + 1)) return 'EB';
    return `B${-notch}`;
}

export function createTrain(spec, s0 = 0) {
    return { s: s0, v: 0, a: 0, notch: -spec.B, atp: false, eb: false, odo: 0 };
}

/** 牽引力隨速度遞減(定扭矩區 → 定功率區) */
function tractionFactor(v, vmaxMs) {
    const v1 = vmaxMs * 0.38;
    return v <= v1 ? 1 : Math.max(0.12, v1 / v);
}

/**
 * 前進 dt 秒。limitKmh:目前限速(ATP 依此動作)。
 * 回傳本步的事件:{ atpOn, atpOff }
 */
export function stepTrain(t, spec, dt, limitKmh = spec.vmax) {
    const vmax = spec.vmax / 3.6;
    const ev = {};
    // ATP:超過限速 2 km/h 自動常用最大制動,降到限速 −5 km/h 以下解除
    const vKmh = t.v * 3.6;
    if (!t.atp && vKmh > limitKmh + 2) { t.atp = true; ev.atpOn = true; }
    else if (t.atp && vKmh < limitKmh - 5) { t.atp = false; ev.atpOff = true; }

    let notch = t.notch;
    if (t.atp && notch > -spec.B) notch = -spec.B;

    let target;
    if (notch > 0) target = spec.accel * (notch / spec.P) * tractionFactor(t.v, vmax);
    else if (notch === 0) target = 0;
    else if (notch <= -(spec.B + 1)) target = -spec.eb;
    else target = -spec.brake * (-notch / spec.B);

    // 制動/牽引的建立需要時間(時間常數 0.45 s),這也是「到位停車」的難度來源
    const tau = notch <= -(spec.B + 1) ? 0.25 : 0.45;
    t.a += (target - t.a) * Math.min(1, dt / tau);

    // 行車阻力(含空氣阻力)
    const res = t.v > 0.01 ? 0.012 + 0.00055 * t.v + 0.000018 * t.v * t.v : 0;
    let acc = t.a - res;
    // 超過設計最高速不再加速
    if (t.v >= vmax && acc > 0) acc = 0;

    const v0 = t.v;
    t.v = Math.max(0, t.v + acc * dt);
    // 極低速且沒有牽引時視為停妥(否則阻力門檻以下會以 1 cm/s 永遠蠕行)
    if (t.v < 0.03 && acc <= 0.001) t.v = 0;
    // 靜止時制動力不會讓車倒退
    if (t.v === 0 && acc < 0) t.a = Math.max(t.a, target);
    const ds = (v0 + t.v) / 2 * dt;
    t.s += ds;
    t.odo += ds;
    return ev;
}

/** 以目前速度停在 dist 公尺處所需的減速度 */
export function requiredDecel(v, dist) {
    if (dist <= 0) return v > 0 ? Infinity : 0;
    return v * v / (2 * dist);
}

/** 建議檔位(駕駛輔助顯示用) */
export function suggestNotch(t, spec, dist) {
    const need = requiredDecel(t.v, Math.max(0.01, dist - 0.3));
    if (need <= 0.05) return null;
    const k = Math.ceil(need / spec.brake * spec.B);
    return Math.min(spec.B + 1, Math.max(1, k));
}

/** 停車誤差評分(誤差單位 m,正=冒進) */
export function gradeStop(err, tol = 1) {
    const a = Math.abs(err);
    if (a <= 0.3) return { key: 'perfect', label: '完美', score: 100 };
    if (a <= Math.min(0.6, tol)) return { key: 'great', label: '優良', score: 85 };
    if (a <= tol) return { key: 'good', label: '良好', score: 70 };
    if (a <= tol * 2) return { key: 'ok', label: '尚可', score: 45 };
    return { key: 'miss', label: err > 0 ? '冒進' : '停車不到位', score: 10 };
}
