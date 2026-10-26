/**
 * scene.js
 * 駕駛模式 3D 世界(three.js)。
 *   - 模型:共用模型庫 rail-assets(assets/rail,由 rail-assets/tools/sync.mjs 同步):
 *     台北捷運高運量列車與駕駛室、月台、軌旁設備(Blender 程序化建模)、Poly Haven(CC0)街道物件/樹木/天空/材質、
 *     Microsoft Rocketbox(MIT)寫實人物;模型庫缺檔時退回 assets/drive 的舊版 Blender 模型,再不行用簡易幾何
 *   - 路線:route3d 的等距取樣曲線;軌道、道床、隧道、高架、道路、街屋以 100 m 為一段隨列車串流產生/回收
 *   - 車站:月台模組沿曲線排列;站名牌/柱面站名/方向指標使用「指標設計」的貼圖
 *   - 視角:駕駛室(預設)/ 車外追蹤;地面與高架段有對向列車
 * 座標:three.js y 向上;路線 x/z 對應 route3d。模型前進 -Z、右 +X(與 rail-assets 契約相同)。
 */
import * as THREE from 'three';
import { buildCab } from './cab.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RailAssets } from '../core/railAssets.js';
import { poseAt, heightAt, sectionKind, COVER_DEPTH } from './route3d.js';
import { createMiniatureLook, refineMaterials } from '../core/miniature-look.js';

const CHUNK = 100;
const BEHIND = 250;
const DETAIL = 450;  // 細節(冷氣、消防栓、配電箱、月台旅客)只在列車附近產生
const GAUGE = 1.435;
const OTHER_TRACK = 4.0;                       // 對向軌道中心距
const EDGE = 1.6, PW = 6.0, PH = 1.1, SEG = 10; // 與月台模組一致
const CAR_L = 23.5, CAR_GAP = 0.6, CARS = 6;
/** 未指定列車時的預設編組(台北捷運高運量) */
const DEFAULT_TRAIN = { cars: 6, gap: 0.6, tailCab: true, lead: { slot: 'train/taipei-hc/lead', length: 23.5 }, middle: { slot: 'train/taipei-hc/middle', length: 23.5 } };
const RAIL_BASE = 'assets/models/rail';
const LEGACY_BASE = 'assets/drive/';

/** 時段:HDRI、霧、補光、夜間發光比例 */
export const TIMES = {
    day: { hdri: 'day', fog: 0xC3D3DF, hemi: [0xEAF4FF, 0x6B6B5A, 0.45], sun: [0xFFF1DE, 2.6], env: 1.0, night: 0, exposure: 0.95, sky: 0xA9CFEA },
    overcast: { hdri: 'overcast', fog: 0xB9BEC2, hemi: [0xDDE3E8, 0x5A5A55, 0.5], sun: [0xE8ECEF, 0.8], env: 1.0, night: 0.15, exposure: 1.0, sky: 0xB9BEC2 },
    dusk: { hdri: 'dusk', fog: 0xC99A7A, hemi: [0xFFD9B0, 0x3A2E2E, 0.35], sun: [0xFFB070, 1.4], env: 0.9, night: 0.65, exposure: 1.0, sky: 0xE7A56B },
    night: { hdri: 'night', fog: 0x10141C, hemi: [0x34405A, 0x0A0A0A, 0.25], sun: [0x8090B0, 0.12], env: 0.7, night: 1, exposure: 1.15, sky: 0x0B1222 }
};

/** 畫質:像素比、陰影、人物/街景密度;refine 材質精修、ao 環境光遮蔽(微縮模型風格) */
export const QUALITY = {
    high: { pixel: 2, shadow: 2048, people: 1, street: 1, aa: true, ahead: 1600, refine: true, ao: true },
    medium: { pixel: 1.25, shadow: 0, people: 0.7, street: 0.8, aa: true, ahead: 1200, refine: true },
    low: { pixel: 1, shadow: 0, people: 0.35, street: 0.5, aa: false, ahead: 900 }
};

/** 空拍鏡頭:視角與高度倍率(原 50° → 30°,高度 × tan25°/tan15°) */
const AERIAL_FOV = 30, AERIAL_K = Math.tan(25 * Math.PI / 180) / Math.tan(15 * Math.PI / 180);

/** 決定性亂數(同一段每次產生相同街景) */
function rng(seed) {
    let a = (seed * 2654435761) >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// =====================================================
// 資產:rail-assets 槽位 → 舊版 Blender 模型 → 簡易幾何
// =====================================================

const SLOTS = [
    'train/taipei-hc/lead', 'train/taipei-hc/middle', 'train/taipei-hc/cab',
    'train/emu3000/lead', 'train/emu3000/middle', 'train/pp/lead', 'train/pp/middle', 'train/emu800/lead', 'train/emu800/middle',
    'train/puyuma/lead', 'train/puyuma/middle', 'train/chukuang/lead', 'train/chukuang/middle', 'train/thsr-700t/lead', 'train/thsr-700t/middle',
    'train/taichung-mrt/lead', 'train/taichung-mrt/middle', 'train/kaohsiung-mrt/lead', 'train/kaohsiung-mrt/middle',
    'train/circular-line/lead', 'train/circular-line/middle', 'train/kaohsiung-lrt/lead', 'train/kaohsiung-lrt/middle',
    'train/danhai-lrt/lead', 'train/danhai-lrt/middle',
    'platform/underground', 'platform/open', 'platform/psd-full', 'platform/psd-half', 'platform/pillar',
    'platform/bench', 'platform/trash-can', 'platform/payphone',
    'trackside/signal-post', 'trackside/stop-marker', 'trackside/speed-limit', 'trackside/mast', 'trackside/pier',
    'trackside/tunnel-light', 'trackside/electric-pole', 'trackside/utility-box', 'trackside/barrier',
    'street/lamp', 'street/hydrant', 'street/aircon', 'vegetation/tree', 'vegetation/shrub',
    'building/street', 'building/tower', 'people/standing'
];
const TEXTURES = { ballast: 2, concrete: 3, tunnel: 4, asphalt: 6, metal: 1 };

/** 舊版模型名稱(assets/drive)對應:沒有 rail-assets 時使用 */
const LEGACY = {
    'train/taipei-hc/cab': ['CabBody', 'MasterLever', 'SpeedScreen', 'InfoScreen'],
    'platform/underground': 'PlatformUnderground', 'platform/open': 'PlatformOpen', 'platform/psd-full': 'PSDFull',
    'platform/psd-half': 'PSDHalf', 'platform/pillar': 'Pillar', 'platform/bench': 'Bench',
    'trackside/signal-post': ['SignalPost', 'SignalRedLamp', 'SignalGreenLamp'],
    'trackside/stop-marker': 'StopMarker', 'trackside/speed-limit': ['SpeedLimitSign', 'SpeedLimitFace'],
    'trackside/mast': 'Mast', 'trackside/pier': 'Pier', 'trackside/tunnel-light': 'TunnelLight',
    'street/lamp': 'Lamp', 'vegetation/tree': ['Tree0', 'Tree1'],
    'building/street': ['Building0', 'Building2', 'Building4'], 'building/tower': ['Building1', 'Building3', 'Building5'],
    'people/standing': ['Person0', 'Person1', 'Person2', 'Person3', 'Person4', 'Person5']
};
const LEGACY_GROUPED = new Set(['train/taipei-hc/cab', 'trackside/signal-post', 'trackside/speed-limit']);

export class Assets {
    constructor() {
        this.rail = null;
        this.legacy = new Map();
        this.tex = {};
        this.mode = 'rail';
    }

    async load(onProgress) {
        try {
            this.rail = await new RailAssets(RAIL_BASE).init();
            await this.rail.loadSlots(SLOTS.filter(s => this.rail.has(s)), (u) => onProgress && onProgress(u * 0.9));
            for (const [id, repeat] of Object.entries(TEXTURES)) this.tex[id] = await this.rail.material(id, { repeat: 1 });
            this.texRepeat = TEXTURES;
        } catch (err) {
            console.warn('模型庫 rail-assets 載入失敗,改用舊版模型', err);
            this.rail = null;
            this.mode = 'legacy';
        }
        // 模型庫缺少的槽位:舊版 Blender 模型
        if (SLOTS.some(s => !this.rail?.has(s))) await this._loadLegacy();
        onProgress && onProgress(1);
        return this;
    }

    async _loadLegacy() {
        try {
            const loader = new GLTFLoader();
            const res = await Promise.all(['cab.glb', 'platform.glb', 'scenery.glb'].map(f => loader.loadAsync(LEGACY_BASE + f)));
            res.forEach(g => g.scene.children.forEach(o => this.legacy.set(o.name, o)));
        } catch (err) {
            console.warn('舊版模型也載入失敗,改用簡易幾何', err);
            this._buildFallback();
        }
    }

    has(slot) { return !!(this.rail?.has(slot) || LEGACY[slot]); }

    /** 取得槽位模型副本;opts.rng/index 選變體 */
    slot(slot, opts = {}) {
        if (this.rail?.has(slot)) return this.rail.instance(slot, opts);
        const names = LEGACY[slot];
        if (!names) return null;
        const clone = (n, keepPos) => {
            const src = this.legacy.get(n);
            if (!src) return new THREE.Group();
            const c = src.clone(true);
            if (!keepPos) { c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); }
            c.name = n;
            return c;
        };
        if (LEGACY_GROUPED.has(slot)) {
            const g = new THREE.Group();
            names.forEach(n => g.add(clone(n, slot === 'train/taipei-hc/cab')));
            return g;
        }
        const list = Array.isArray(names) ? names : [names];
        const n = list[opts.index != null ? opts.index % list.length : Math.floor((opts.rng || Math.random)() * list.length)];
        return clone(n);
    }

    /** 槽位第一個變體的外框(glTF 座標) */
    bounds(slot, id) {
        const vs = this.rail?.variants(slot) || [];
        const v = id ? vs.find(x => x.id === id) : vs[0];
        return v?.bounds || null;
    }

    instanced(slot, matrices, opts) {
        if (this.rail?.has(slot)) return this.rail.instanced(slot, matrices, opts);
        const g = new THREE.Group();
        matrices.forEach(m => { const o = this.slot(slot, opts); if (o) { o.applyMatrix4(m); g.add(o); } });
        return g;
    }

    _buildFallback() {
        const box = (w, h, d, color, x = 0, y = 0, z = 0, name) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
            m.position.set(x, y + h / 2, z);
            if (name) m.material.name = name;
            return m;
        };
        const group = (name, ...kids) => { const g = new THREE.Group(); g.name = name; kids.forEach(k => g.add(k)); this.legacy.set(name, g); return g; };
        group('CabBody', box(2.9, 0.82, 0.75, 0x3A3F46, 0, 0, -0.9), box(0.2, 2.25, 0.2, 0xD9D6CF, -1.35, 0, -1.4), box(0.2, 2.25, 0.2, 0xD9D6CF, 1.35, 0, -1.4),
            box(2.9, 0.3, 0.2, 0xD9D6CF, 0, 1.98, -1.4), box(2.9, 1.02, 0.2, 0xD9D6CF, 0, 0, -1.4));
        group('MasterLever', box(0.18, 0.06, 0.07, 0x1B1C1F, 0, 0.2, 0)).position.set(-0.45, 0.92, -0.75);
        ['SpeedScreen', 'InfoScreen'].forEach((n, i) => {
            const p = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.32), new THREE.MeshBasicMaterial({ color: 0x0B1A14 }));
            p.rotation.x = -1.1;
            p.position.set(i ? 0.57 : 0.02, 0.92, -0.85);
            group(n, p);
        });
        const slab = () => box(PW, PH + 1, SEG, 0xB9B4AA, EDGE + PW / 2, -1, 0);
        group('PlatformUnderground', slab(), box(0.3, 3.5, SEG, 0xEDE9E0, EDGE + PW + 0.15, PH, 0), box(11, 0.3, SEG, 0xC9C6BF, 2.5, 4.5, 0));
        group('PlatformOpen', slab(), box(PW, 0.15, SEG, 0x5F6B73, EDGE + PW / 2 + 0.5, 4.2, 0));
        group('Pillar', box(0.6, 3.4, 0.6, 0xEDE9E0, 0, PH, 0));
        ['PSDFull', 'PSDHalf', 'Bench', 'TunnelLight'].forEach(n => group(n));
        for (let i = 0; i < 6; i++) {
            group(`Person${i}`, box(0.4, 1.6, 0.3, [0x2F4A6B, 0x7A2E2E, 0x3D5C3A, 0x5A4A6E, 0xB07A2A, 0x2B2B2B][i]));
            const [w, d, h] = [[14, 12, 18], [10, 10, 36], [18, 14, 12], [12, 12, 54], [8, 10, 9], [20, 16, 26]][i];
            group(`Building${i}`, box(w, h, d, [0xD9D2C3, 0xB7BDC4, 0xC9A88A, 0xE6E1D6, 0x8C9AA6, 0xD7C7A5][i], 0, 0, d / 2));
        }
        for (let i = 0; i < 2; i++) {
            const t = new THREE.Mesh(new THREE.ConeGeometry(2, 5, 7), new THREE.MeshStandardMaterial({ color: 0x3F7D3A }));
            t.position.y = 4;
            group(`Tree${i}`, box(0.3, 2, 0.3, 0x5C4630), t);
        }
        group('Lamp', box(0.15, 7, 0.15, 0xA7ABB0));
        group('Mast', box(0.3, 6.8, 0.3, 0xA7ABB0), box(3.4, 0.1, 0.1, 0xA7ABB0, -1.7, 6.1, 0));
        group('Pier', box(2, 10.8, 2, 0xB9B4AA, 0, -12, 0), box(7.2, 0.9, 2.8, 0xB9B4AA, 0, -1.2, 0));
        group('SignalPost', box(0.14, 3.6, 0.14, 0xA7ABB0), box(0.44, 1, 0.24, 0x2B2E33, 0, 3.4, 0));
        const lamp = (n, y, c) => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), new THREE.MeshStandardMaterial({ color: c, emissive: c })); m.position.set(0, y, 0.13); m.material.name = n === 'SignalRedLamp' ? 'SignalRed' : 'SignalGreen'; return group(n, m); };
        lamp('SignalRedLamp', 4.1, 0xFF2A1A);
        lamp('SignalGreenLamp', 3.7, 0x1AFF6A);
        group('StopMarker', box(0.1, 1.5, 0.1, 0xA7ABB0), box(0.7, 0.7, 0.06, 0xFFFFFF, 0, 1.5, 0, 'StopFace'));
        group('SpeedLimitSign', box(0.1, 2.4, 0.1, 0xA7ABB0));
        const lf = new THREE.Mesh(new THREE.CircleGeometry(0.33, 20), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        lf.material.name = 'LimitFace';
        lf.position.set(0, 2.75, 0.06);
        group('SpeedLimitFace', lf);
    }

    geometries() {
        const s = new Set();
        const add = o => o.traverse(m => { if (m.isMesh) s.add(m.geometry); });
        this.legacy.forEach(add);
        this.rail?.loaded.forEach(add);
        return s;
    }
}

// =====================================================
// 幾何工具
// =====================================================

/**
 * 沿路線掃出斷面。profile: [[lateral, up], ...](lateral 向右為正);closed 時首尾相連。
 * offset:斷面整體橫移;uv:貼圖一次重複的公尺數(u 沿斷面、v 沿路線)
 */
/**
 * 沿路線掃出剖面。rel=true 時剖面高度相對於軌面(隨路線高程);
 * 剖面點可帶第三個值 true,表示該點為絕對高度(例:引道擋土牆頂、路堤底部貼地)。
 */
function sweep(route, s0, s1, step, profile, { closed = false, offset = 0, base = 0, uv = 0, rel = false } = {}) {
    const n = Math.max(2, Math.ceil((s1 - s0) / step) + 1);
    const m = profile.length;
    const pos = new Float32Array(n * m * 3);
    const uvs = uv ? new Float32Array(n * m * 2) : null;
    const along = [0];
    for (let j = 1; j < m; j++) along.push(along[j - 1] + Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]));
    for (let i = 0; i < n; i++) {
        const s = Math.min(s1, s0 + i * step);
        const p = poseAt(route, s);
        const rx = -p.tz, rz = p.tx;
        for (let j = 0; j < m; j++) {
            const [lat, up, abs] = profile[j];
            const k = (i * m + j) * 3;
            pos[k] = p.x + rx * (lat + offset);
            pos[k + 1] = abs ? up : base + up + (rel ? p.y : 0);
            pos[k + 2] = p.z + rz * (lat + offset);
            if (uvs) { uvs[(i * m + j) * 2] = along[j] / uv; uvs[(i * m + j) * 2 + 1] = s / uv; }
        }
    }
    const idx = [];
    const segs = closed ? m : m - 1;
    for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < segs; j++) {
            const a = i * m + j, b = i * m + (j + 1) % m, c = (i + 1) * m + j, d = (i + 1) * m + (j + 1) % m;
            idx.push(a, c, b, b, c, d);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (uvs) g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}

/** 物件放到里程 s、橫向 lateral、高度 y,朝行進方向(模型 -Z 對齊切線) */
function place(obj, route, s, lateral = 0, y = 0, yaw = 0) {
    if (!obj) return null;
    const p = poseAt(route, s);
    obj.position.set(p.x - p.tz * lateral, y, p.z + p.tx * lateral);
    obj.rotation.set(0, Math.atan2(-p.tx, -p.tz) + yaw, 0);
    return obj;
}

/** 同 place,但高度 y 相對於該處軌面 */
function placeT(obj, route, s, lateral = 0, y = 0, yaw = 0) {
    return place(obj, route, s, lateral, y + heightAt(route, s), yaw);
}

/**
 * 出軌事故的車體姿態(依經過時間 t):lat 往外側滑出、drop 下沉、yaw 偏轉、roll 側傾、pitch 俯仰、shake 鏡頭震動。
 * wall:撞上隧道/擋土牆後停住;fall:越過高架護欄後墜落到地面;off:衝出道床在地上滑行。
 */
function crashPose(c) {
    const t = c.t;
    if (c.kind === 'wall') {
        return { lat: Math.min(1.25, t * 3.2), drop: 0, yaw: Math.min(0.1, t * 0.35), roll: Math.min(0.14, t * 0.4), pitch: 0, shake: 0.09 * Math.exp(-t * 1.6) };
    }
    if (c.kind === 'fall') {
        const ft = Math.max(0, t - 0.55);
        return { lat: Math.min(5, t * 3.4), drop: Math.min(c.h + 0.3, 4.9 * ft * ft), yaw: Math.min(0.35, t * 0.3), roll: Math.min(1.1, ft * 1.3), pitch: Math.min(0.35, ft * 0.5), shake: 0.05 * Math.exp(-Math.abs(t - 1.3) * 3) + 0.03 * Math.exp(-t * 2) };
    }
    return { lat: Math.min(6, 1.1 * t * t), drop: Math.min(0.8, t * 0.5), yaw: Math.min(0.5, t * 0.28), roll: Math.min(0.3, t * 0.2), pitch: 0, shake: 0.05 * Math.exp(-t * 0.9) };
}

function placeMatrixT(route, s, lateral = 0, y = 0, yaw = 0, scale = 1) {
    return placeMatrix(route, s, lateral, y + heightAt(route, s), yaw, scale);
}

function placeMatrix(route, s, lateral = 0, y = 0, yaw = 0, scale = 1) {
    const p = poseAt(route, s);
    return new THREE.Matrix4().compose(
        new THREE.Vector3(p.x - p.tz * lateral, y, p.z + p.tx * lateral),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-p.tx, -p.tz) + yaw, 0)),
        new THREE.Vector3(scale, scale, scale));
}

/** 材質副本(個別調整發光等,不影響共用材質) */
function ownMaterials(obj, names) {
    obj.traverse(o => {
        if (!o.isMesh) return;
        if (Array.isArray(o.material)) o.material = o.material.map(m => (!names || names.includes(m.name)) ? m.clone() : m);
        else if (!names || names.includes(o.material.name)) o.material = o.material.clone();
    });
    return obj;
}

function findMat(obj, name) {
    const out = [];
    obj.traverse(o => {
        if (!o.isMesh) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.name === name || m.name.startsWith(name + '.')) out.push(m); });
    });
    return out;
}

// =====================================================
// 世界
// =====================================================

export class DriveWorld {
    /**
     * @param {HTMLElement} host
     * @param {object} cfg { route, env, time, quality, stations, spec, assets, platformSide, overhead, limitSigns, destText }
     */
    constructor(host, cfg) {
        this.cfg = cfg;
        this.route = cfg.route;
        this.assets = cfg.assets;
        this.env = cfg.env;
        this.Q = QUALITY[cfg.quality] || QUALITY.medium;
        // 剖面:每公尺的軌面高度(未設定時全線 0);全線皆為有頂隧道時沿用純地下的簡化場景
        const ys = this.route.ys;
        this.allUnder = !!ys && ys.every(y => y <= COVER_DEPTH);
        this.chunks = new Map();
        this.stationGroups = new Map();
        this.view = 'cab';
        this.assetGeos = this.assets.geometries();

        const r = this.renderer = new THREE.WebGLRenderer({ antialias: this.Q.aa, powerPreference: 'high-performance' });
        r.setPixelRatio(Math.min(this.Q.pixel, window.devicePixelRatio || 1));
        r.outputColorSpace = THREE.SRGBColorSpace;
        r.toneMapping = THREE.ACESFilmicToneMapping;
        if (this.Q.shadow) { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; }
        host.appendChild(r.domElement);
        this.host = host;
        // 微縮模型風格後製(this.look 是鏡頭角度,後製用 this.mini):空拍 = 完整微縮、車外 = 輕移軸、駕駛室 = 只調色
        this.mini = createMiniatureLook(THREE, r, { preset: 'grade', samples: this.Q === QUALITY.high ? 4 : 0, bloom: this.Q !== QUALITY.low, ao: !!this.Q.ao, aoRadius: 1.2 });
        this.mini.enabled = cfg.miniature !== false;

        const scene = this.scene = new THREE.Scene();
        const T = this.T = TIMES[cfg.time] || TIMES.day;
        const under = this.under = this.allUnder;
        this.ahead = this.Q.ahead;
        this.skyColor = new THREE.Color(T.sky);
        this.tunnelColor = new THREE.Color(0x0A0B0D);
        scene.background = this.skyColor.clone();
        scene.fog = new THREE.Fog(T.fog, this.ahead * 0.25, this.ahead - 50);
        this.hemi = new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]);
        scene.add(this.hemi);
        const sun = this.sun = new THREE.DirectionalLight(T.sun[0], T.sun[1]);
        sun.position.set(-120, 200, 80);
        if (this.Q.shadow && !under) {
            sun.castShadow = true;
            sun.shadow.mapSize.set(this.Q.shadow, this.Q.shadow);
            const c = sun.shadow.camera;
            c.left = c.bottom = -90; c.right = c.top = 90; c.near = 1; c.far = 600;
            sun.shadow.bias = -0.0004;
            sun.shadow.normalBias = 0.03;
        }
        scene.add(sun, sun.target);

        // 材質(模型庫的 PBR 材質;沒有時用純色)
        // 每個用途各自複製材質與貼圖(貼圖的重複/位移各自獨立)
        const tex = (id, color) => {
            const src = this.assets.tex[id];
            if (!src) return new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
            const m = src.clone();
            const arm = src.roughnessMap ? src.roughnessMap.clone() : null; // AO/粗糙/金屬共用同一張 arm 貼圖
            m.map = src.map ? src.map.clone() : null;
            m.normalMap = src.normalMap ? src.normalMap.clone() : null;
            m.roughnessMap = m.metalnessMap = m.aoMap = arm;
            return m;
        };
        this.M = {
            rail: new THREE.MeshStandardMaterial({ color: 0x9A9DA1, metalness: 0.9, roughness: 0.32 }),
            railSide: new THREE.MeshStandardMaterial({ color: 0x5B4A3C, metalness: 0.5, roughness: 0.8 }),
            sleeper: tex('concrete', 0x9E9890),
            ballast: tex('ballast', under ? 0x55524C : 0x7A746A),
            tunnel: tex('tunnel', 0x7A766D),
            deck: tex('concrete', 0xB4AFA5),
            road: tex('asphalt', 0x3A3A3A),
            walk: tex('concrete', 0xA9A49A),
            ground: tex('asphalt', 0x5C5A55),
            line: new THREE.MeshStandardMaterial({ color: 0xE8E8E2, roughness: 0.6 }),
            wire: new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.5, metalness: 0.6 }),
            head: tex('tunnel', 0xE8E2D2)
        };
        this.M.tunnel.side = THREE.DoubleSide;
        this.M.head.side = THREE.DoubleSide;
        this.M.ground.color.set(0x77736C);
        this.M.walk.color.set(0xC9C3B6);
        this.sleeperGeo = new THREE.BoxGeometry(2.4, 0.16, 0.24);
        this.columnGeo = new THREE.BoxGeometry(0.5, 5.75, 0.7).translate(0, 5.75 / 2 - 0.42, 0);   // 雙線隧道/地下站中柱(軌面下 0.42 到頂板)

        // 地面:涵蓋整條路線的靜態平面,明挖引道處挖洞(看得到引道內的軌道)
        this.otherLateral = cfg.platformSide === 'left' ? OTHER_TRACK : -OTHER_TRACK;
        if (!under) this._buildGround();

        // 駕駛室與鏡頭
        this.camera = new THREE.PerspectiveCamera(68, 1, 0.05, 3000);
        this.cab = new THREE.Group();
        const cab = buildCab();   // 程序化駕駛室(前擋、A 柱、遮陽捲簾、操作台、側窗、後牆門…)
        this._refine(cab);
        this.cab.add(cab);
        this.lever = cab.getObjectByName('MasterLever');
        this._SpeedScreen = cab.getObjectByName('SpeedScreen');
        this._InfoScreen = cab.getObjectByName('InfoScreen');
        this.cabLight = new THREE.PointLight(0xFFF2DA, T.night > 0.5 ? 1.2 : 0.5, 4, 2);
        this.cabLight.position.set(0, 2.0, 0);
        this.cab.add(this.cabLight, this.camera);
        this.camera.position.set(0, 1.62, 0.05);
        this.look = { yaw: 0, pitch: -0.07 };
        scene.add(this.cab);

        this.trackLateral = 0;
        this.hasOther = true;   // 對向軌道全線都有(地下段為雙線箱型隧道,看得到反向軌道與對向列車)
        // 隧道內外的環境光(0=戶外、1=隧道內),每格依鏡頭位置漸變
        this.amb = -1;
        this._setAmbience(this._coverAt(this.cfg.stations[0]?.sStop ?? 0));
        this.signals = [];

        // 本列車(車外視角用)與對向列車
        this.consist = this._makeConsist(true);
        this.consist.visible = false;
        scene.add(this.consist);
        this.oncoming = null;

        this.resize();
        this.ready = this._loadEnvironment();
    }

    async _loadEnvironment() {
        const ra = this.assets.rail;
        if (!ra) return;
        const env = await ra.environment(this.T.hdri, this.renderer).catch(() => null);
        if (!env) return;
        this.scene.environment = env.envMap;
        this.envBackground = this.allUnder ? null : env.background;
        this.scene.backgroundIntensity = this.T.night ? 0.8 : 1.0;
        this.scene.backgroundBlurriness = 0.02;
        const a = this.amb;
        this.amb = -1;
        this._setAmbience(a);
    }

    /** 里程 s 是否在有頂的地下空間(隧道或地下車站) */
    _coverAt(s) {
        const st = this.stationCovering(s, 6);
        if (st) return st.level === 'underground' ? 1 : 0;
        return heightAt(this.route, s) <= COVER_DEPTH + 0.5 ? 1 : 0;
    }

    /** 環境光:a=0 戶外、1 隧道內(霧、背景、日光、曝光) */
    _setAmbience(a) {
        a = Math.max(0, Math.min(1, a));
        if (Math.abs(a - this.amb) < 0.004) return;
        this.amb = a;
        const T = this.T, sc = this.scene, lerp = (x, y) => x + (y - x) * a;
        sc.fog.color.set(T.fog).lerp(this.tunnelColor, a);
        sc.fog.near = lerp(this.ahead * 0.25, 80);
        sc.fog.far = lerp(this.ahead - 50, 700);
        sc.background = a > 0.5 ? this.tunnelColor : (this.envBackground || this.skyColor);
        this.hemi.intensity = lerp(T.hemi[2], 0.7);
        this.sun.intensity = lerp(T.sun[1], 0.1);
        this.renderer.toneMappingExposure = lerp(T.exposure, 1.0);
        sc.environmentIntensity = lerp(T.env, 0.25);
        if (this.cabLight) this.cabLight.intensity = Math.max(lerp(0.5, 1.2), T.night > 0.5 ? 1.2 : 0);
    }

    /** 靜態地面:路線外框外加 3 km;明挖引道(開口段)挖空 */
    _buildGround() {
        const { xs, zs, ys } = this.route;
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let i = 0; i < xs.length; i += 10) { x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); z0 = Math.min(z0, zs[i]); z1 = Math.max(z1, zs[i]); }
        const M = 3000;
        // ShapeGeometry 在 XY 平面,轉成水平面後 world z = -shape y
        const shape = new THREE.Shape([
            new THREE.Vector2(x0 - M, -(z0 - M)), new THREE.Vector2(x1 + M, -(z0 - M)),
            new THREE.Vector2(x1 + M, -(z1 + M)), new THREE.Vector2(x0 - M, -(z1 + M))
        ]);
        const lo = Math.min(0, this.otherLateral) - 2.9, hi = Math.max(0, this.otherLateral) + 2.9;
        if (ys) {
            let a = -1;
            const flush = (b) => {
                if (b - a < 4) return;
                const L = [], R = [];
                for (let s = a; s <= b; s += 3) {
                    const p = poseAt(this.route, Math.min(b, s));
                    L.push(new THREE.Vector2(p.x - p.tz * lo, -(p.z + p.tx * lo)));
                    R.push(new THREE.Vector2(p.x - p.tz * hi, -(p.z + p.tx * hi)));
                }
                shape.holes.push(new THREE.Path([...L, ...R.reverse()]));
            };
            for (let i = 0; i < ys.length; i++) {
                const open = sectionKind(ys[i]) === 'trough';
                if (open && a < 0) a = i * this.route.step;
                if (!open && a >= 0) { flush(i * this.route.step); a = -1; }
            }
            if (a >= 0) flush((ys.length - 1) * this.route.step);
        }
        const geo = new THREE.ShapeGeometry(shape);
        const pos = geo.attributes.position, uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) / 6; uv[i * 2 + 1] = pos.getY(i) / 6; }
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        const g = new THREE.Mesh(geo, this.M.ground);
        g.rotation.x = -Math.PI / 2;
        g.position.y = -0.36;
        g.receiveShadow = true;
        this.scene.add(this._refine(g));
        this.ground = g;
    }

    /** 編組:依所選列車(cfg.train,見 rail-assets catalog/trains.json)—— 前導車 + 中間車(客車)+ 尾端前導車(反向,tailCab) */
    _makeConsist(own) {
        const T = this.cfg.train || DEFAULT_TRAIN;
        const n = Math.max(1, T.cars || 6);
        const g = new THREE.Group();
        const cars = [];
        let off = 0;
        for (let i = 0; i < n; i++) {
            const isHead = i === 0, isTail = i === n - 1 && n > 1;
            const lead = isHead || (isTail && T.tailCab !== false);
            const part = lead ? T.lead : T.middle;
            const car = this.cfg.carFactory?.(isHead || isTail) || this.assets.slot(part.slot) || new THREE.Group();
            ownMaterials(car, ['HeadLight', 'TailLight', 'DestLED']);
            findMat(car, 'HeadLight').forEach(m => { m.emissiveIntensity = isHead ? 6 : 0; m.color.setScalar(isHead ? 1 : 0.4); });
            findMat(car, 'TailLight').forEach(m => { m.emissiveIntensity = isTail ? 4 : 0; });
            if (isHead && this.cfg.destText) this._setDest(car, this.cfg.destText);
            car.traverse(o => { if (o.isMesh) { o.castShadow = !!this.Q.shadow; o.receiveShadow = true; } });
            g.add(car);
            cars.push({ car, reversed: isTail && lead, off, len: part.length });
            off += part.length + (T.gap ?? CAR_GAP);
        }
        g.userData.cars = cars;
        g.userData.own = own;
        g.userData.length = off - (T.gap ?? CAR_GAP);
        return g;
    }

    _setDest(car, text) {
        const mats = findMat(car, 'DestLED');
        if (!mats.length) return;
        const c = document.createElement('canvas');
        c.width = 512; c.height = 96;
        const x = c.getContext('2d');
        x.fillStyle = '#050505'; x.fillRect(0, 0, 512, 96);
        x.fillStyle = '#FF9A1F';
        x.font = '800 62px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(text, 256, 50, 490);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.flipY = false;
        mats.forEach(m => { m.map = t; m.emissiveMap = t; m.emissive.set(0xffffff); m.emissiveIntensity = 1.6; m.needsUpdate = true; });
    }

    /** 把編組擺在路線上:frontS=列車前端里程,lateral=軌道橫移,dir=+1 往里程增加方向行駛 */
    _poseConsist(g, frontS, lateral, dir) {
        const cf = g === this.consist && this.crashFx ? crashPose(this.crashFx) : null;
        g.userData.cars.forEach(({ car, reversed, off, len }, i) => {
            const L = len || CAR_L;
            const front = frontS - dir * (off ?? i * (CAR_L + CAR_GAP));
            const tail = front - dir * L;
            const pa = poseAt(this.route, front), pb = poseAt(this.route, tail);
            const fx = pa.x - pa.tz * lateral, fz = pa.z + pa.tx * lateral;
            const bx = pb.x - pb.tz * lateral, bz = pb.z + pb.tx * lateral;
            // 車體方向取前後轉向架連線(彎道上較自然)
            const yaw = Math.atan2(-(fx - bx), -(fz - bz));
            const pitch = Math.atan2(pa.y - pb.y, L);
            if (!reversed) { car.position.set(fx, pa.y, fz); car.rotation.set(pitch, yaw, 0, 'YXZ'); }
            else { car.position.set(bx, pb.y, bz); car.rotation.set(-pitch, yaw + Math.PI, 0, 'YXZ'); }
            if (cf) {
                const k = Math.max(0, 1 - i * 0.22), o = this.crashFx.out * (reversed ? -1 : 1);
                car.translateX(o * cf.lat * k);
                car.position.y -= cf.drop * Math.min(1, k + 0.3);
                car.rotateY(-o * cf.yaw * k);
                car.rotateZ(-o * cf.roll * k);
            }
        });
    }

    /** 駕駛艙螢幕貼上 canvas(由 driver 每幾格更新) */
    setScreens(speedCanvas, infoCanvas) {
        const apply = (obj, canvas) => {
            if (!obj || !canvas) return null;
            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = !!obj.userData.flipY; // glTF 的 UV 原點在左上;程序化平面(cab.js)為左下
            const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
            obj.traverse(m => { if (m.isMesh) m.material = mat; });
            return tex;
        };
        this.speedTex = apply(this._SpeedScreen, speedCanvas);
        this.infoTex = apply(this._InfoScreen, infoCanvas);
    }

    /** 視角:cab 駕駛室、third 第三人稱(駕駛員身後)、chase 車外追蹤、side 車側、aerial 空拍 */
    setView(v) {
        this.view = v;
        const inCab = v === 'cab' || v === 'third';
        this.cab.children.forEach(c => { if (c !== this.camera && c !== this.driver) c.visible = inCab; });
        if (this.driver) this.driver.visible = v === 'third';
        this.consist.visible = !inCab;
        this.camera.up.set(0, 1, 0);
        // 空拍用 30° 窄視角(高度同步放大,畫面範圍不變),微縮模型的望遠感
        this.camera.fov = v === 'aerial' ? AERIAL_FOV : v === 'third' ? 78 : 68;
        this.camera.updateProjectionMatrix();
        this.mini.setPreset(v === 'aerial' ? 'diorama' : inCab ? 'grade' : 'soft');
        if (v === 'chase' || v === 'side') this.mini.set({ center: 0.56 });   // 列車在畫面中央偏上
        if (inCab) this.cab.add(this.camera); else this.scene.add(this.camera);
    }

    /**
     * 駕駛員(第三人稱用):坐在駕駛室模型的座椅上(座面約 z 0.15、高 0.42),
     * 制服、帽子,左手握主控制器(模型 MasterLever,位於左側)、右手放在操作台。
     * 駕駛室座標:+X 右、+Y 上、-Z 前;後牆約在 z 1.44。
     */
    _buildDriver() {
        // 鐵飯碗:由遊戲提供寫實司機員(坐姿、制服、大盤帽)
        if (this.cfg.makeDriver) {
            const d = this.cfg.makeDriver(this);
            if (d) { d.visible = this.view === 'third'; this.cab.add(d); this.driver = d; return; }
        }
        const g = new THREE.Group();
        const mat = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
        const uniform = mat(0x1F2B44), shirt = mat(0xC9D8E8), skin = mat(0xD9A882, 0.6), shoe = mat(0x111214, 0.4);
        const box = (w, h, d, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; };
        const cyl = (r1, r2, h, m, x, y, z) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 18), m); o.position.set(x, y, z); g.add(o); return o; };
        const limb = (from, to, r, m) => {
            const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, from.distanceTo(to), 10), m);
            o.position.copy(from).add(to).multiplyScalar(0.5);
            o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
            g.add(o);
            return o;
        };
        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        // 腿:大腿往前、小腿垂下、鞋
        [-0.11, 0.11].forEach(x => {
            limb(V(x, 0.62, 0.15), V(x, 0.6, -0.3), 0.085, uniform);
            limb(V(x, 0.6, -0.3), V(x, 0.1, -0.34), 0.07, uniform);
            box(0.11, 0.08, 0.26, shoe, x, 0.04, -0.4);
        });
        // 軀幹、領口、名牌
        box(0.42, 0.56, 0.24, uniform, 0, 0.95, 0.2, -0.06);
        box(0.15, 0.1, 0.04, shirt, 0, 1.2, 0.08);
        box(0.08, 0.025, 0.01, mat(0xD8C27A, 0.4), 0.12, 1.08, 0.075);
        // 頭、帽子(帽沿朝前)
        cyl(0.045, 0.05, 0.1, skin, 0, 1.29, 0.16);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 16), skin);
        head.position.set(0, 1.45, 0.14);
        g.add(head);
        cyl(0.122, 0.125, 0.09, uniform, 0, 1.56, 0.15);
        cyl(0.124, 0.124, 0.02, mat(0xE8E2CC), 0, 1.525, 0.15);
        box(0.2, 0.015, 0.1, shoe, 0, 1.52, 0.04);
        // 手臂:左手握主控制器、右手放操作台
        const lv = this.lever ? this.cab.worldToLocal(this.lever.getWorldPosition(new THREE.Vector3())) : V(-0.45, 0.84, -0.72);
        const arm = (sx, hand) => {
            const sh = V(sx, 1.17, 0.18);
            const elbow = V(sx * 1.25, 0.95, (sh.z + hand.z) / 2 + 0.08);
            limb(sh, elbow, 0.055, uniform);
            limb(elbow, hand, 0.045, uniform);
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), skin);
            h.position.copy(hand);
            g.add(h);
        };
        arm(-0.22, V(lv.x, lv.y + 0.24, lv.z));
        arm(0.22, V(0.3, 1.16, -0.38));
        g.traverse(o => { if (o.isMesh) o.castShadow = true; });
        g.visible = this.view === 'third';
        this.cab.add(g);
        this.driver = g;
    }

    resize() {
        const w = this.host.clientWidth || 800, h = this.host.clientHeight || 600;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    // ------------------------------------------------------------------
    // 串流
    // ------------------------------------------------------------------

    stationCovering(s, pad = 0) {
        return this.cfg.stations.find(st => s >= st.p0 - pad && s <= st.p1 + pad) || null;
    }

    _shadowify(g) {
        if (!this.Q.shadow) return g;
        g.traverse(o => { if (o.isMesh) { o.castShadow = o.castShadow || !o.isInstancedMesh; o.receiveShadow = true; } });
        return g;
    }

    /** 把 [s0,s1) 依每公尺的路段類型切成連續區間:[{ kind, a, b }] */
    _runs(s0, s1, kindAt) {
        const runs = [];
        let cur = null;
        for (let s = s0; s < s1; s += 1) {
            const k = kindAt(s);
            if (!cur || cur.kind !== k) { cur = { kind: k, a: s, b: s + 1 }; runs.push(cur); } else cur.b = s + 1;
        }
        if (cur) cur.b = s1;
        return runs;
    }

    /** 里程 s 的路段類型:tunnel / trough / ground / viaduct,或地下車站 station-under */
    _kindAt(s) {
        const st = this.stationCovering(s, 1);
        if (st) return st.level === 'underground' ? 'station-under' : st.level === 'elevated' ? 'viaduct' : 'ground';
        return sectionKind(heightAt(this.route, s));
    }

    _buildChunk(k) {
        const route = this.route;
        const s0 = k * CHUNK, s1 = Math.min(route.length, s0 + CHUNK);
        if (s1 <= s0) return null;
        const g = new THREE.Group();
        const R = rng(k + 17);
        const side = this.cfg.platformSide === 'left' ? -1 : 1;
        const A = this.assets;
        const kindAt = (s) => this._kindAt(s);
        const runs = this._runs(s0, s1, kindAt);
        const has = (kind) => runs.some(r => r.kind === kind);
        const allTunnel = runs.every(r => r.kind === 'tunnel' || r.kind === 'station-under');
        const lo = Math.min(0, this.otherLateral) - 2.4, hi = Math.max(0, this.otherLateral) + 2.4;
        const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); g.add(m); return m; };

        // 軌道(鋼軌、道床、枕木):本線與對向線
        const tracks = [0, ...(this.hasOther ? [this.otherLateral] : [])];
        tracks.forEach(off => {
            [-GAUGE / 2, GAUGE / 2].forEach(r => {
                add(sweep(route, s0, s1, 2, [[r - 0.036, 0.13], [r + 0.036, 0.13], [r + 0.036, 0.165], [r - 0.036, 0.165]], { closed: true, offset: off, base: -0.15, rel: true }), this.M.rail);
                add(sweep(route, s0, s1, 2, [[r - 0.075, 0], [r + 0.075, 0], [r + 0.012, 0.13], [r - 0.012, 0.13]], { closed: true, offset: off, base: -0.15, rel: true }), this.M.railSide);
            });
            add(sweep(route, s0, s1, 4, [[-2.0, -0.34], [-1.45, -0.1], [1.45, -0.1], [2.0, -0.34]], { offset: off, base: -0.15, uv: 2, rel: true }), this.M.ballast);
            const cnt = Math.floor((s1 - s0) / 0.6);
            const inst = new THREE.InstancedMesh(this.sleeperGeo, this.M.sleeper, cnt);
            const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
            for (let i = 0; i < cnt; i++) {
                const p = poseAt(route, s0 + i * 0.6 + 0.3);
                e.set(Math.atan(p.grade), Math.atan2(-p.tx, -p.tz), 0, 'YXZ');
                q.setFromEuler(e);
                v.set(p.x - p.tz * off, p.y - 0.25, p.z + p.tx * off);
                m4.compose(v, q, one);
                inst.setMatrixAt(i, m4);
            }
            inst.receiveShadow = true;
            g.add(inst);
        });

        const inStation = (s, pad = 2) => !!this.stationCovering(s, pad);
        const outer = this.otherLateral > 0 ? -1 : 1;

        // 速限標誌(限速區段起點,立在本線外側;牌面朝向進站列車)
        (this.cfg.limitSigns || []).forEach(ls => {
            if (ls.s < s0 || ls.s >= s1) return;
            const sign = A.slot('trackside/speed-limit');
            if (!sign) return;
            placeT(sign, route, ls.s, outer * (kindAt(ls.s) === 'tunnel' ? 2.1 : 2.6), 0);
            if (ls.tex) sign.traverse(m => { if (m.isMesh && /LimitFace/.test(m.material?.name || m.name)) m.material = new THREE.MeshBasicMaterial({ map: ls.tex, toneMapped: false }); });
            g.add(sign);
        });

        // 雙線箱型隧道(明挖覆蓋):兩側牆在 lo/hi(與明挖引道的擋土牆對齊)、頂板 5.3 m,兩線之間一排中柱
        const ROOF = 5.3;
        const tunnelProfile = [[lo, -0.42], [lo, ROOF - 0.35], [lo + 0.35, ROOF], [hi - 0.35, ROOF], [hi, ROOF - 0.35], [hi, -0.42]];
        const midLat = this.otherLateral / 2;
        const masts = [], lights = [], columns = [];
        const mastsAt = (a, b) => {
            if (!this.cfg.overhead) return;
            for (let s = Math.ceil(a / 50) * 50; s < b; s += 50) if (!inStation(s, 6)) masts.push(placeMatrixT(route, s, outer * 3.2, 0, outer > 0 ? 0 : Math.PI));
        };
        runs.forEach(({ kind, a, b }) => {
            if (b - a < 0.5) return;
            if (kind === 'tunnel') {
                const m = add(sweep(route, a, b, 2, tunnelProfile, { uv: 4, rel: true }), this.M.tunnel);
                m.userData.tunnel = true;
                // 兩側牆燈(各自面向隧道內)與中柱
                for (let s = Math.ceil(a / 25) * 25; s < b; s += 25) {
                    if (inStation(s, 8)) continue;
                    lights.push(placeMatrixT(route, s, lo + 0.15, 3.2), placeMatrixT(route, s + 12, hi - 0.15, 3.2, Math.PI));
                }
                for (let s = Math.ceil(a / 6) * 6; s < b; s += 6) if (!inStation(s, 3)) columns.push(placeMatrixT(route, s, midLat, 0));
                // 洞口:隧道與明挖引道交界處的端牆(隧道頂到地面以上)
                [a, b].forEach(edge => {
                    if (edge <= 0 || edge >= route.length) return;
                    if (kindAt(edge === a ? edge - 1 : edge + 0.5) !== 'trough') return;
                    const y = heightAt(route, edge);
                    const top = y + 5.3, h = Math.max(0.6, 0.6 - top);
                    const w = new THREE.Mesh(new THREE.BoxGeometry(hi - lo + 2.4, h, 0.6), this.M.deck);
                    place(w, route, edge, (lo + hi) / 2, top + h / 2);
                    g.add(w);
                });
            } else if (kind === 'trough') {
                // 明挖引道:兩側擋土牆(底部隨軌面、頂部在地面上 0.45 m)與底板
                add(sweep(route, a, b, 2, [[lo - 0.35, -0.4], [lo, -0.4], [lo, 0.45, true], [lo - 0.35, 0.45, true]], { closed: true, rel: true, uv: 3 }), this.M.deck);
                add(sweep(route, a, b, 2, [[hi, -0.4], [hi + 0.35, -0.4], [hi + 0.35, 0.45, true], [hi, 0.45, true]], { closed: true, rel: true, uv: 3 }), this.M.deck);
                add(sweep(route, a, b, 4, [[lo, -0.42], [hi, -0.42]], { rel: true, uv: 3 }), this.M.walk);
                mastsAt(a, b);
            } else if (kind === 'viaduct') {
                // 高架:橋面板與護欄;低於 2.6 m 為路堤(斜坡貼地),較高處為橋墩
                add(sweep(route, a, b, 4, [[lo, -0.35], [hi, -0.35], [hi, -1.35], [lo, -1.35]], { closed: true, uv: 3, rel: true }), this.M.deck);
                add(sweep(route, a, b, 4, [[lo, -0.35], [lo, 0.95], [lo + 0.22, 0.95], [lo + 0.22, -0.35]], { closed: true, uv: 3, rel: true }), this.M.deck);
                add(sweep(route, a, b, 4, [[hi - 0.22, -0.35], [hi - 0.22, 0.95], [hi, 0.95], [hi, -0.35]], { closed: true, uv: 3, rel: true }), this.M.deck);
                this._runs(a, b, (s) => heightAt(route, s) < 2.6 ? 'low' : 'high').forEach(r => {
                    if (r.kind === 'low') {
                        add(sweep(route, r.a, r.b, 2, [[lo, -1.35], [hi, -1.35], [hi + 1.6, -0.36, true], [lo - 1.6, -0.36, true]], { closed: true, rel: true, uv: 3 }), this.M.deck);
                        return;
                    }
                    for (let s = Math.ceil(r.a / 30) * 30; s < r.b; s += 30) {
                        if (inStation(s, 2)) continue;
                        const pier = A.slot('trackside/pier');
                        if (!pier) continue;
                        placeT(pier, route, s, (lo + hi) / 2, 0);
                        pier.scale.y = (heightAt(route, s) + 0.4) / 10.8;
                        g.add(pier);
                    }
                });
                mastsAt(a, b);
            } else if (kind === 'ground') {
                mastsAt(a, b);
            }
            // 架空線(隧道與地下車站以外)
            if (this.cfg.overhead && kind !== 'tunnel' && kind !== 'station-under') {
                tracks.forEach(off => {
                    add(sweep(route, a, b, 4, [[-0.012, 5.4], [0.012, 5.4], [0.012, 5.425], [-0.012, 5.425]], { closed: true, offset: off, rel: true }), this.M.wire);
                    add(sweep(route, a, b, 4, [[-0.01, 6.3], [0.01, 6.3], [0.01, 6.32], [-0.01, 6.32]], { closed: true, offset: off, rel: true }), this.M.wire);
                });
            }
        });
        if (lights.length) g.add(A.instanced('trackside/tunnel-light', lights));
        if (columns.length) {
            const col = new THREE.InstancedMesh(this.columnGeo, this.M.deck, columns.length);
            columns.forEach((m, i) => col.setMatrixAt(i, m));
            col.receiveShadow = true;
            g.add(col);
        }
        if (masts.length) g.add(A.instanced('trackside/mast', masts));

        // 兩側街道(全段都是隧道時不建;高架段道路貼近橋下;隧道/引道上方不設軌道護欄)
        if (!this.allUnder && !allTunnel) this._buildStreet(g, s0, s1, R, side, has('viaduct') && !has('ground'), has('tunnel') || has('trough') || has('station-under'));
        if (this.T.night && A.rail) A.rail.setNight(g, this.T.night);
        this._shadowify(g);
        this.scene.add(this._refine(g));
        return g;
    }

    /** 槽位的某個已載入變體(依 R 隨機) */
    _variant(slot, R) {
        const ra = this.assets.rail;
        const vs = ra ? ra.variants(slot).filter(v => ra.loaded.has(v.id)) : [];
        return vs.length ? vs[Math.floor(R() * vs.length)] : null;
    }

    /** 依變體分組的矩陣 → 實例化網格(一個變體一組 draw call) */
    _addInstanced(g, slot, byId, castShadow = false) {
        Object.entries(byId).forEach(([id, mats]) => {
            if (mats.length) g.add(this.assets.rail.instanced(slot, mats, { id, castShadow: castShadow && !!this.Q.shadow }));
        });
    }

    /** 街屋變體上的冷氣掛點(相對於模型原點的矩陣,快取) */
    _anchorMatrices(id) {
        this._anchorCache = this._anchorCache || new Map();
        if (!this._anchorCache.has(id)) {
            const o = this.assets.rail.instance('building/street', { id });
            o.updateMatrixWorld(true);
            this._anchorCache.set(id, this.assets.rail.anchors(o, 'Anchor_Aircon').map(a => a.matrixWorld.clone()));
        }
        return this._anchorCache.get(id);
    }

    /**
     * 兩側街道:軌道邊護欄 → 雙線道路 → 人行道(路燈、行道樹、電線桿)→ 連續街屋(騎樓朝軌道)→ 後排高樓。
     * 街屋與樹以實例化繪製;冷氣、消防栓、配電箱記在 detail,列車接近時才產生(見 stream)。
     */
    _buildStreet(g, s0, s1, R, side, elevated, sunken = false) {
        const route = this.route;
        const A = this.assets;
        const dens = this.Q.street;
        const detail = g.userData.detail = { 'street/aircon': [], 'street/hydrant': [], 'trackside/utility-box': [] };
        const useRail = !!A.rail;
        const faceTrack = new THREE.Matrix4().makeRotationY(Math.PI);
        [-1, 1].forEach(dir => {
            const trackEdge = (dir === Math.sign(this.otherLateral) ? Math.abs(this.otherLateral) : 0) + (elevated ? 3.0 : 2.6);
            const st = this.stationCovering((s0 + s1) / 2, 40);
            const stationSide = !!st;   // 兩側都有月台:兩側道路都讓出月台寬度
            const roadIn = trackEdge + (elevated ? 0.5 : 1.2) + (stationSide ? PW + EDGE : 0);
            const roadOut = roadIn + 8;
            const walkOut = roadOut + 3.2;
            const L = x => dir * x;
            const prof = (a, b, y) => dir > 0 ? [[a, y], [b, y]] : [[-b, y], [-a, y]];
            // 道路與人行道、路緣、標線
            g.add(new THREE.Mesh(sweep(route, s0, s1, 4, prof(roadIn, roadOut, -0.3), { uv: 6 }), this.M.road));
            g.add(new THREE.Mesh(sweep(route, s0, s1, 4, dir > 0 ? [[roadOut, -0.3], [roadOut, -0.15], [walkOut, -0.15]] : [[-walkOut, -0.15], [-roadOut, -0.15], [-roadOut, -0.3]], { uv: 3 }), this.M.walk));
            g.add(new THREE.Mesh(sweep(route, s0, s1, 4, prof(roadOut - 0.35, roadOut - 0.2, -0.295)), this.M.line));
            g.add(new THREE.Mesh(sweep(route, s0, s1, 4, prof(roadIn + 0.2, roadIn + 0.35, -0.295)), this.M.line));
            // 軌道邊護欄(地面段)
            if (!elevated && !stationSide && !sunken) {
                const ms = [];
                for (let s = s0 + 1; s < s1; s += 2) ms.push(placeMatrix(route, s, L(trackEdge + 0.4), -0.3, Math.PI / 2));
                g.add(A.instanced('trackside/barrier', ms));
            }
            // 人行道設施
            const lamps = [], poles = [], trees = {};
            for (let s = s0 + (dir > 0 ? 6 : 21); s < s1; s += 30) lamps.push(placeMatrix(route, s, L(roadOut + 0.5), -0.15, dir > 0 ? Math.PI : 0));
            for (let s = s0 + 14; s < s1; s += 40) poles.push(placeMatrix(route, s, L(walkOut - 0.4), -0.15));
            g.add(A.instanced('street/lamp', lamps));
            g.add(A.instanced('trackside/electric-pole', poles));
            for (let s = s0 + 2 + R() * 6; s < s1; s += 9 + R() * 6) {
                if (R() > 0.85 * dens) continue;
                const m = placeMatrix(route, s, L(roadOut + 1.5), -0.15, R() * 6.28, 0.85 + R() * 0.35);
                const v = this._variant('vegetation/tree', R);
                if (v) (trees[v.id] = trees[v.id] || []).push(m);
                else { const t = A.slot('vegetation/tree', { rng: R }); if (t) { t.applyMatrix4(m); g.add(t); } }
            }
            if (useRail) this._addInstanced(g, 'vegetation/tree', trees, true);
            if (R() < 0.6) detail['street/hydrant'].push(placeMatrix(route, s0 + R() * CHUNK, L(roadOut + 0.6), -0.15, R() * 6));
            if (R() < 0.5) detail['trackside/utility-box'].push(placeMatrix(route, s0 + R() * CHUNK, L(walkOut - 0.8), -0.15, dir > 0 ? -Math.PI / 2 : Math.PI / 2));
            // 連續街屋(臨街面朝軌道)
            const houses = {};
            let s = s0 + R() * 3;
            while (s < s1) {
                if (R() < 0.08) { s += 2.5; continue; } // 巷口
                const v = this._variant('building/street', R);
                if (!v) {
                    const house = A.slot('building/street', { rng: R });
                    if (!house) break;
                    g.add(place(house, route, s + 4, L(walkOut + 0.2), -0.15, dir * Math.PI / 2));
                    s += 8;
                    continue;
                }
                const w = v.bounds ? v.bounds.max[0] - v.bounds.min[0] : 8;
                const m = placeMatrix(route, s + w / 2, L(walkOut + 0.2), -0.15, dir * Math.PI / 2);
                (houses[v.id] = houses[v.id] || []).push(m);
                // 冷氣室外機(約八成掛點有),面向街道
                this._anchorMatrices(v.id).forEach(a => { if (R() < 0.8) detail['street/aircon'].push(m.clone().multiply(a).multiply(faceTrack)); });
                s += w;
            }
            if (useRail) this._addInstanced(g, 'building/street', houses, true);
            // 後排高樓
            if (R() < 0.55 * dens) {
                const t = A.slot('building/tower', { rng: R });
                if (t) g.add(place(t, route, s0 + R() * CHUNK, L(walkOut + 30 + R() * 50), -0.15, R() * 6.28));
            }
        });
    }

    /** 列車接近時補上近距離細節 */
    _buildDetail(g) {
        const d = g.userData.detail;
        if (!d) return;
        const dg = new THREE.Group();
        Object.entries(d).forEach(([slot, mats]) => { if (mats.length && this.assets.has(slot)) dg.add(this.assets.instanced(slot, mats)); });
        if (this.T.night && this.assets.rail) this.assets.rail.setNight(dg, this.T.night);
        g.add(dg);
        g.userData.detailBuilt = true;
    }

    _buildStation(st) {
        const route = this.route;
        const A = this.assets;
        const g = new THREE.Group();
        // 每站依自己的層級:地下站用封閉月台與全高月台門,其餘為開放月台;高度取該站軌面
        const under = st.level === 'underground';
        const B = heightAt(route, (st.p0 + st.p1) / 2);
        const flip = st.side === 'left';
        const n = Math.ceil((st.p1 - st.p0) / SEG);
        const add = (o) => { if (o) g.add(o); return o; };
        // 兩側月台(雙線車站的實際配置,車站結構左右對稱):
        // 本線月台在 d 側(右 = +1);對向線的月台在對向軌道的外側(-d)
        const d0 = flip ? -1 : 1;
        const sides = [{ base: 0, d: d0, main: true }];
        if (this.hasOther) sides.push({ base: this.otherLateral, d: -d0, main: false });
        const BACK = EDGE + PW + 0.3;            // 軌道中心到月台後牆
        // 地下站模組中會擋到對向軌道的部分(遠側牆、軌道上方的樑與天花板)改由下方統一建造
        const UNDER_HIDE = /^(ConcreteDark|SteelDark|Ceiling)$/;
        const tex = st.textures || {};
        const signMat = (t) => t ? new THREE.MeshBasicMaterial({ map: t, toneMapped: false }) : new THREE.MeshBasicMaterial({ color: 0xffffff });
        const R = rng(st.s | 0);
        const crowd = [];

        sides.forEach(({ base, d, main }) => {
            const lat = (x) => base + d * x;
            const mirror = (o) => { if (o && d < 0) o.scale.x = -1; return o; };
            const faceToTrack = d > 0 ? Math.PI / 2 : -Math.PI / 2;
            for (let i = 0; i < n; i++) {
                const s = st.p0 + SEG * (i + 0.5);
                const mod = add(mirror(place(A.slot(under ? 'platform/underground' : 'platform/open'), route, s, base, B)));
                if (mod && under) mod.traverse(o => { if (o.isMesh && UNDER_HIDE.test(o.material?.name || '')) o.visible = false; });
                if (!this.cfg.noPsd) add(mirror(place(A.slot(under ? 'platform/psd-full' : 'platform/psd-half'), route, s, base, B)));   // 鈦鐵月台沒有月台門
                if (st.level === 'elevated') {
                    const deck = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.4, 1.2, SEG), this.M.deck);
                    place(deck, route, s, lat(EDGE + PW / 2), B - 1.6);
                    g.add(deck);
                    if (i % 3 === 1) { const pier = A.slot('trackside/pier'); if (pier) { place(pier, route, s, lat(EDGE + PW / 2), B - 1.0); pier.scale.y = B / 10.8; g.add(pier); } }
                }
            }
            // 指標:站名牌(牆面/欄杆)、柱面站名、吊掛方向指標(對向月台的方向指標朝反方向)
            for (let s = st.p0 + 12; s < st.p1 - 6; s += 24) {
                const board = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), signMat(tex.board));
                place(board, route, s, lat(under ? EDGE + PW - 0.04 : EDGE + PW - 0.12), B + PH + (under ? 1.9 : 1.75), faceToTrack + Math.PI);
                g.add(board);
                if (!under) {
                    const back = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.3, 0.08), this.M.wire);
                    place(back, route, s, lat(EDGE + PW - 0.06), B + PH + 1.75, Math.PI / 2);
                    g.add(back);
                    for (const dy of [-1.5, 1.5]) {
                        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.08), this.M.wire);
                        place(post, route, s + dy, lat(EDGE + PW - 0.06), B + PH + 1.2);
                        g.add(post);
                    }
                }
            }
            for (let s = st.p0 + 24; s < st.p1 - 6; s += 24) {
                add(place(A.slot('platform/pillar'), route, s, lat(EDGE + 3.4), B));
                const ps = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 1.68), signMat(tex.pillar));
                place(ps, route, s, lat(EDGE + 3.4 - 0.305), B + PH + 1.7, faceToTrack + Math.PI);
                g.add(ps);
                const ps2 = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 1.68), signMat(tex.pillar));
                place(ps2, route, s - 0.305, lat(EDGE + 3.4), B + PH + 1.7);
                g.add(ps2);
            }
            [st.p0 + (st.p1 - st.p0) * 0.35, st.p1 - 20].forEach(s => {
                const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.6), signMat(tex.direction));
                place(sg, route, s, lat(EDGE + 2.6), B + PH + 2.75, main ? 0 : Math.PI);
                g.add(sg);
                const back = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.68, 0.06), this.M.wire);
                place(back, route, s + (main ? 0.04 : -0.04), lat(EDGE + 2.6), B + PH + 2.75);
                g.add(back);
                [-1.3, 1.3].forEach(dx => {
                    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, 0.03), this.M.wire);
                    place(rod, route, s, lat(EDGE + 2.6 + dx), B + PH + 3.5);
                    g.add(rod);
                });
            });
            // 月台設施:座椅、垃圾桶、壁掛公共電話
            for (let s = st.p0 + 18; s < st.p1 - 10; s += 36) {
                add(place(A.slot('platform/bench'), route, s, lat(EDGE + PW - 0.5), B + PH, faceToTrack));
                add(place(A.slot('platform/trash-can'), route, s + 2.2, lat(EDGE + PW - 0.45), B + PH));
            }
            add(place(A.slot('platform/payphone'), route, st.p0 + 30, lat(EDGE + PW - 0.12), B + PH + 0.95, -faceToTrack));
            // 候車旅客(寫實人物):先算好位置,列車接近時才產生
            const people = Math.round((10 + R() * 16) * this.Q.people * (main ? 1 : 0.7));
            for (let i = 0; i < people; i++) {
                const s = st.p0 + 6 + R() * (st.p1 - st.p0 - 12);
                const face = d * Math.PI / 2 + (R() - 0.5) * 1.6; // 大多面向軌道
                crowd.push(placeMatrix(route, s, lat(EDGE + 1.3 + R() * (PW - 2.4)), B + PH, face));
            }
        });

        if (under) {
            // 地下站結構:跨兩線的天花板、軌道區地面、兩線之間的中柱、站端與隧道銜接的端牆
            const lats = sides.map(({ base, d }) => base + d * BACK);
            const L0 = Math.min(...lats), L1 = Math.max(...lats);
            add(new THREE.Mesh(sweep(route, st.p0, st.p1, 4, [[L0, 4.8], [L1, 4.8]], { rel: true, uv: 4 }), this.M.head));
            add(new THREE.Mesh(sweep(route, st.p0, st.p1, 4, [[L1, -0.44], [L0, -0.44]], { rel: true, uv: 3 }), this.M.walk));
            if (this.hasOther) {
                const cols = [];
                for (let s = st.p0 + 4; s < st.p1 - 2; s += 8) cols.push(placeMatrixT(route, s, this.otherLateral / 2, 0));
                const col = new THREE.InstancedMesh(this.columnGeo, this.M.deck, cols.length);
                cols.forEach((m, i) => col.setMatrixAt(i, m));
                g.add(col);
            }
            // 端牆:站體寬度大於隧道(lo~hi),兩側補牆、上方補到隧道頂板高度
            const lo = Math.min(0, this.otherLateral) - 2.4, hi = Math.max(0, this.otherLateral) + 2.4;
            [st.p0, st.p1].forEach((s, k) => {
                const off = k ? 0.05 : -0.05;
                const wall = (a, b, y0, y1) => {
                    if (b - a < 0.05) return;
                    const w = new THREE.Mesh(new THREE.PlaneGeometry(b - a, y1 - y0), this.M.head);
                    place(w, route, s + off, (a + b) / 2, B + (y0 + y1) / 2);
                    g.add(w);
                };
                wall(L0, lo, -1, 5.3);
                wall(hi, L1, -1, 5.3);
                wall(lo, hi, 4.8, 5.3);
            });
        }
        const lat = (x) => d0 * x;   // 本線側
        // 停車位置標
        const sm = add(place(A.slot('trackside/stop-marker'), route, st.sStop + 1.5, lat(EDGE + 0.45), B + PH));
        if (sm && tex.stop) sm.traverse(m => { if (m.isMesh && /StopFace/.test(m.material?.name || '')) m.material = new THREE.MeshBasicMaterial({ map: tex.stop, toneMapped: false }); });
        // 出發號誌(月台前端外 18 m,對向側);燈用獨立材質才能個別切換
        const sig = add(place(A.slot('trackside/signal-post'), route, st.p1 + 18, lat(-2.3), B));
        if (sig) {
            ownMaterials(sig, null);
            this.signals.push({ st, red: findMat(sig, 'SignalRed'), green: findMat(sig, 'SignalGreen') });
        }
        g.userData.crowd = crowd;
        g.userData.crowdSeed = st.s | 0;
        const light = new THREE.PointLight(0xFFF1D6, under || this.T.night > 0.5 ? 60 : 8, 90, 1.6);
        place(light, route, (st.p0 + st.p1) / 2, lat(EDGE + 2), B + 4.2);
        g.add(light);
        if (A.rail && (under || this.T.night)) A.rail.setNight(g, under ? 1 : this.T.night);
        this._shadowify(g);
        this.scene.add(this._refine(g));
        return g;
    }

    /** 依列車位置產生/回收路段與車站;接近時補上細節 */
    stream(s) {
        const k0 = Math.max(0, Math.floor((s - BEHIND) / CHUNK)), k1 = Math.floor((s + this.ahead) / CHUNK);
        let built = 0;
        for (let k = k0; k <= k1; k++) {
            // 每格最多新建 2 段,避免一次卡頓
            if (!this.chunks.has(k) && (built++ < 2 || Math.abs(k * CHUNK - s) < 400)) this.chunks.set(k, this._buildChunk(k));
        }
        this.chunks.forEach((g, k) => {
            if (k < k0 - 1 || k > k1 + 1) { this._dispose(g); this.chunks.delete(k); return; }
            if (g && !g.userData.detailBuilt && Math.abs((k + 0.5) * CHUNK - s) < DETAIL) { this._buildDetail(g); this._refine(g); }
        });
        this.cfg.stations.forEach((st, i) => {
            const vis = st.p1 > s - BEHIND - 100 && st.p0 < s + this.ahead;
            const g0 = this.stationGroups.get(i);
            if (g0 && g0.userData.crowd && st.p0 - s < DETAIL + 100 && s - st.p1 < DETAIL) {
                const R = rng(g0.userData.crowdSeed);
                const byId = {};
                g0.userData.crowd.forEach(m => {
                    const v = this._variant('people/standing', R);
                    if (v) (byId[v.id] = byId[v.id] || []).push(m);
                    else { const p = this.assets.slot('people/standing', { rng: R }); if (p) { p.applyMatrix4(m); g0.add(p); } }
                });
                if (this.assets.rail) this._addInstanced(g0, 'people/standing', byId, true);
                g0.userData.crowd = null;
            }
            if (vis && !this.stationGroups.has(i)) this.stationGroups.set(i, this._buildStation(st));
            else if (!vis && this.stationGroups.has(i)) {
                const g = this.stationGroups.get(i);
                this.signals = this.signals.filter(x => x.st !== st);
                this._dispose(g);
                this.stationGroups.delete(i);
            }
        });
    }

    _dispose(g) {
        if (!g) return;
        this.scene.remove(g);
        g.traverse(o => {
            // 只釋放本模組自建的幾何(模型庫共用幾何不可釋放)
            if (o.isMesh && o.geometry && o.geometry !== this.sleeperGeo && !this.assetGeos.has(o.geometry)) o.geometry.dispose();
            if (o.isInstancedMesh) o.dispose();
        });
    }

    // ------------------------------------------------------------------
    // 對向列車(地面、高架段)
    // ------------------------------------------------------------------

    _updateOncoming(s, dt) {
        if (!this.hasOther) return;
        const o = this.oncoming;
        if (!o) {
            this._oncomingWait = (this._oncomingWait ?? 25) - dt;
            if (this._oncomingWait > 0 || s + 1400 > this.route.length) return;
            const g = this._makeConsist(false);
            this.scene.add(this._refine(g));
            this.oncoming = { g, s: s + 1400, v: 16 };
            return;
        }
        o.s -= o.v * dt;
        this._poseConsist(o.g, o.s, this.otherLateral, -1);
        if (o.s < s - 400) {
            this.scene.remove(o.g);
            this.oncoming = null;
            this._oncomingWait = 60 + Math.random() * 90;
        }
    }

    // ------------------------------------------------------------------
    // 每格更新
    // ------------------------------------------------------------------

    /**
     * @param {object} st { s(列車前端里程), v(m/s), notch, departOk(st), time, dt, screensDirty }
     */
    update(st) {
        const route = this.route;
        const cabS = Math.max(0, st.s - 1.4);
        const p = poseAt(route, cabS);
        const lat = this.trackLateral;
        this.cab.position.set(p.x - p.tz * lat, p.y + PH, p.z + p.tx * lat);
        const t = st.time || 0;
        const vr = Math.min(1, st.v / 25);
        const sway = vr * (Math.sin(t * 1.7) * 0.004 + Math.sin(t * 5.3) * 0.0015);
        const bob = vr * Math.sin(t * 9.1) * 0.006;
        this.cab.rotation.set(0, 0, 0);
        this.cab.rotateY(Math.atan2(-p.tx, -p.tz));
        this.cab.rotateX(Math.atan(p.grade));
        this.cab.rotateZ(sway);
        if (this.lever) this.lever.rotation.x = st.notch * 0.085;
        // 出軌事故:車體往彎道外側滑出、下沉、偏轉、側傾(墜落時落到地面)
        const cf = this.crashFx ? crashPose(this.crashFx) : null;
        if (cf) {
            this.cab.translateX(cf.lat);
            this.cab.position.y -= cf.drop;
            this.cab.rotateY(-this.crashFx.out * cf.yaw);
            this.cab.rotateZ(-this.crashFx.out * cf.roll);
            this.cab.rotateX(-cf.pitch);
        }
        if (!this.driver && this.view === 'third') this._buildDriver();

        const covered = this._coverAt(st.s) > 0.5;
        if (this.view === 'cab') {
            this.camera.position.set(0, 1.62 + bob, 0.05);
            this.camera.rotation.set(this.look.pitch, this.look.yaw, 0, 'YXZ');
            if (cf) { this.camera.rotation.x += (Math.random() - 0.5) * cf.shake; this.camera.rotation.y += (Math.random() - 0.5) * cf.shake; }
        } else if (this.view === 'third') {
            // 駕駛員右後上方,越過肩膀看前方
            // 貼近天花板、往下俯看:駕駛員頭肩在畫面中央,上方仍看得到前窗
            // 鐵飯碗:鏡頭在司機員右前側,看得到司機員側身與前方路線
            this.camera.position.set(0.95, 1.72 + bob, 1.25);
            this.camera.rotation.set(-0.3 + this.look.pitch, this.look.yaw + 0.42, 0, 'YXZ');
        } else if (this.view === 'aerial') {
            this._poseConsist(this.consist, st.s, lat, 1);
            // 空拍:列車正上方往下看,畫面上方為行進方向;拖曳左右旋轉、上下調整高度
            const c = poseAt(route, Math.max(0, st.s - 25));
            const h = 90 * AERIAL_K * Math.exp(-this.look.pitch * 2.2);
            const ang = Math.atan2(c.tx, c.tz) + this.look.yaw;
            this.camera.position.set(c.x, Math.max(c.y, 0) + h, c.z);
            this.camera.up.set(-Math.sin(ang), 0, -Math.cos(ang));
            this.camera.lookAt(c.x, c.y, c.z);
        } else {
            this._poseConsist(this.consist, st.s, lat, 1);
            // 車外追蹤/車側:列車左後上方,滑鼠可環顧;隧道內鏡頭收在隧道裡
            const back = poseAt(route, Math.max(0, st.s - (covered ? 30 : 34)));
            const side = covered ? 0.6 : this.view === 'side' ? 14 : 9;
            const up = covered ? 4.5 : (this.view === 'side' ? 3.2 : 5.2) - this.look.pitch * 10;
            const yaw = covered ? 0 : this.look.yaw;
            const cx = back.x + back.tz * side * Math.cos(yaw) - back.tx * 6 * Math.sin(yaw);
            const cz = back.z - back.tx * side * Math.cos(yaw) - back.tz * 6 * Math.sin(yaw);
            // 明挖引道段:鏡頭不可降到地面以下(否則會從地底看到擋土牆背面與地面底部)
            const camY = !covered && back.y < 0 ? Math.max(back.y + up, 1.8) : back.y + up;
            this.camera.position.set(cx, camY, cz);
            const tgt = poseAt(route, st.s + 10);
            this.camera.lookAt(tgt.x, tgt.y + 2.0, tgt.z);
        }

        // 空拍時地下段:地面半透明、隱藏隧道頂,看得到隧道內的列車
        const xray = this.view === 'aerial' && covered;
        if (this.ground && this._xray !== xray) {
            this._xray = xray;
            this.M.ground.transparent = xray;
            this.M.ground.opacity = xray ? 0.3 : 1;
            this.M.ground.depthWrite = !xray;
            this.M.ground.needsUpdate = true;
        }
        this.chunks.forEach(g => g && g.children.forEach(o => { if (o.userData.tunnel) o.visible = !xray; }));

        // 隧道內外環境光(依鏡頭所在位置,漸變)
        const camS = this.view === 'aerial' ? -1 : this.view === 'cab' || this.view === 'third' ? st.s : st.s - 30;
        const target = camS < 0 ? 0 : this._coverAt(camS);
        this._setAmbience(this.amb + (target - this.amb) * Math.min(1, (st.dt || 0.016) * 2.5));

        // 陰影相機跟著列車
        if (this.sun.castShadow) {
            this.sun.position.set(p.x - 120, p.y + 200, p.z + 80);
            this.sun.target.position.set(p.x, p.y, p.z);
        }
        this.signals.forEach(sg => {
            const ok = st.departOk(sg.st);
            if (sg.state === ok) return;
            const set = (mats, on) => mats.forEach(m => {
                if (m.emissive) m.emissiveIntensity = on ? 5 : 0.02;
                m.color.setScalar(on ? 1 : 0.12);
            });
            set(sg.red, !ok);
            set(sg.green, ok);
            sg.state = ok;
        });
        this._updateOncoming(st.s, st.dt || 0);
        this.stream(st.s);
        if (this.speedTex) this.speedTex.needsUpdate = !!st.screensDirty;
        if (this.infoTex) this.infoTex.needsUpdate = !!st.screensDirty;
        if (this.T.night > 0.5) this.mini.set({ threshold: 0.8 });
        this.mini.render(this.scene, this.camera);
    }

    /** 微縮模型風格開關 */
    setMiniature(on) { this.mini.enabled = !!on; }

    /** 材質精修(粗糙度變化、微凹凸、金屬/玻璃/烤漆分類);不轉 Physical,保留材質參照(隧道 X 光、號誌燈) */
    _refine(g) {
        if (g && this.Q.refine) refineMaterials(THREE, g, { physical: false });
        return g;
    }

    dispose() {
        this.mini.dispose();
        this.chunks.forEach(g => this._dispose(g));
        this.stationGroups.forEach(g => this._dispose(g));
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}

export { THREE };
