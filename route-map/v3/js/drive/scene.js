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
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RailAssets } from '../vendor/rail-assets.js';
import { poseAt } from './route3d.js';

const CHUNK = 100;
const BEHIND = 250;
const DETAIL = 450;  // 細節(冷氣、消防栓、配電箱、月台旅客)只在列車附近產生
const GAUGE = 1.435;
const OTHER_TRACK = 4.0;                       // 對向軌道中心距
const EDGE = 1.6, PW = 6.0, PH = 1.1, SEG = 10; // 與月台模組一致
const CAR_L = 23.5, CAR_GAP = 0.6, CARS = 6;
const RAIL_BASE = 'assets/rail';
const LEGACY_BASE = 'assets/drive/';

/** 時段:HDRI、霧、補光、夜間發光比例 */
export const TIMES = {
    day: { hdri: 'day', fog: 0xC3D3DF, hemi: [0xEAF4FF, 0x6B6B5A, 0.45], sun: [0xFFF1DE, 2.6], env: 1.0, night: 0, exposure: 0.95, sky: 0xA9CFEA },
    overcast: { hdri: 'overcast', fog: 0xB9BEC2, hemi: [0xDDE3E8, 0x5A5A55, 0.5], sun: [0xE8ECEF, 0.8], env: 1.0, night: 0.15, exposure: 1.0, sky: 0xB9BEC2 },
    dusk: { hdri: 'dusk', fog: 0xC99A7A, hemi: [0xFFD9B0, 0x3A2E2E, 0.35], sun: [0xFFB070, 1.4], env: 0.9, night: 0.65, exposure: 1.0, sky: 0xE7A56B },
    night: { hdri: 'night', fog: 0x10141C, hemi: [0x34405A, 0x0A0A0A, 0.25], sun: [0x8090B0, 0.12], env: 0.7, night: 1, exposure: 1.15, sky: 0x0B1222 }
};

/** 畫質:像素比、陰影、人物/街景密度 */
export const QUALITY = {
    high: { pixel: 2, shadow: 2048, people: 1, street: 1, aa: true, ahead: 1600 },
    medium: { pixel: 1.25, shadow: 0, people: 0.7, street: 0.8, aa: true, ahead: 1200 },
    low: { pixel: 1, shadow: 0, people: 0.35, street: 0.5, aa: false, ahead: 900 }
};

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
function sweep(route, s0, s1, step, profile, { closed = false, offset = 0, base = 0, uv = 0 } = {}) {
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
            const [lat, up] = profile[j];
            const k = (i * m + j) * 3;
            pos[k] = p.x + rx * (lat + offset);
            pos[k + 1] = base + up;
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
        this.base = cfg.env === 'elevated' ? 9 : 0;
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

        const scene = this.scene = new THREE.Scene();
        const T = this.T = TIMES[cfg.time] || TIMES.day;
        const under = this.under = cfg.env === 'underground';
        r.toneMappingExposure = under ? 1.0 : T.exposure;
        scene.background = new THREE.Color(under ? 0x0A0B0D : T.sky);
        this.ahead = this.Q.ahead;
        scene.fog = new THREE.Fog(under ? 0x0A0B0D : T.fog, under ? 80 : this.ahead * 0.25, under ? 700 : this.ahead - 50);
        scene.add(new THREE.HemisphereLight(T.hemi[0], T.hemi[1], under ? 0.7 : T.hemi[2]));
        const sun = this.sun = new THREE.DirectionalLight(T.sun[0], under ? 0.1 : T.sun[1]);
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

        // 地面(跟著鏡頭移動的大平面;貼圖座標隨位置位移,看起來是固定的)
        if (!under) {
            const g = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), this.M.ground);
            g.rotation.x = -Math.PI / 2;
            g.position.y = -0.36;
            g.receiveShadow = true;
            if (this.M.ground.map) [this.M.ground.map, this.M.ground.normalMap, this.M.ground.roughnessMap].forEach(t => t && t.repeat.set(6000 / 6, 6000 / 6));
            scene.add(g);
            this.ground = g;
        }

        // 駕駛室與鏡頭
        this.camera = new THREE.PerspectiveCamera(68, 1, 0.05, 3000);
        this.cab = new THREE.Group();
        const cab = this.assets.slot('train/taipei-hc/cab') || new THREE.Group();
        this.cab.add(cab);
        this.lever = cab.getObjectByName('MasterLever');
        this._SpeedScreen = cab.getObjectByName('SpeedScreen');
        this._InfoScreen = cab.getObjectByName('InfoScreen');
        this.cabLight = new THREE.PointLight(0xFFF2DA, under || T.night > 0.5 ? 1.2 : 0.5, 4, 2);
        this.cabLight.position.set(0, 2.0, 0);
        this.cab.add(this.cabLight, this.camera);
        this.camera.position.set(0, 1.62, 0.05);
        this.look = { yaw: 0, pitch: -0.07 };
        scene.add(this.cab);

        this.trackLateral = 0;
        this.otherLateral = cfg.platformSide === 'left' ? OTHER_TRACK : -OTHER_TRACK;
        this.hasOther = !under;
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
        this.scene.environmentIntensity = this.under ? 0.25 : this.T.env;
        if (!this.under) {
            this.scene.background = env.background;
            this.scene.backgroundIntensity = this.T.night ? 0.8 : 1.0;
            this.scene.backgroundBlurriness = 0.02;
        }
    }

    /** 6 節編組:前導車 + 4 中間車 + 尾端前導車(反向) */
    _makeConsist(own) {
        const g = new THREE.Group();
        const cars = [];
        for (let i = 0; i < CARS; i++) {
            const slot = i === 0 || i === CARS - 1 ? 'train/taipei-hc/lead' : 'train/taipei-hc/middle';
            const car = this.assets.slot(slot) || new THREE.Group();
            ownMaterials(car, ['HeadLight', 'TailLight', 'DestLED']);
            const isHead = i === 0, isTail = i === CARS - 1;
            findMat(car, 'HeadLight').forEach(m => { m.emissiveIntensity = isHead ? 6 : 0; m.color.setScalar(isHead ? 1 : 0.4); });
            findMat(car, 'TailLight').forEach(m => { m.emissiveIntensity = isTail ? 4 : 0; });
            if (isHead && this.cfg.destText) this._setDest(car, this.cfg.destText);
            car.traverse(o => { if (o.isMesh) { o.castShadow = !!this.Q.shadow; o.receiveShadow = true; } });
            g.add(car);
            cars.push({ car, reversed: isTail && i > 0 });
        }
        g.userData.cars = cars;
        g.userData.own = own;
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
        g.userData.cars.forEach(({ car, reversed }, i) => {
            const front = frontS - dir * i * (CAR_L + CAR_GAP);
            const tail = front - dir * CAR_L;
            const pa = poseAt(this.route, front), pb = poseAt(this.route, tail);
            const fx = pa.x - pa.tz * lateral, fz = pa.z + pa.tx * lateral;
            const bx = pb.x - pb.tz * lateral, bz = pb.z + pb.tx * lateral;
            // 車體方向取前後轉向架連線(彎道上較自然)
            const yaw = Math.atan2(-(fx - bx), -(fz - bz));
            if (!reversed) { car.position.set(fx, this.base, fz); car.rotation.set(0, yaw, 0); }
            else { car.position.set(bx, this.base, bz); car.rotation.set(0, yaw + Math.PI, 0); }
        });
    }

    /** 駕駛艙螢幕貼上 canvas(由 driver 每幾格更新) */
    setScreens(speedCanvas, infoCanvas) {
        const apply = (obj, canvas) => {
            if (!obj || !canvas) return null;
            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = false; // glTF 的 UV 原點在左上
            const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
            obj.traverse(m => { if (m.isMesh) m.material = mat; });
            return tex;
        };
        this.speedTex = apply(this._SpeedScreen, speedCanvas);
        this.infoTex = apply(this._InfoScreen, infoCanvas);
    }

    setView(v) {
        this.view = v;
        this.cab.children.forEach(c => { if (c !== this.camera) c.visible = v === 'cab'; });
        this.consist.visible = v !== 'cab';
        if (v !== 'cab') this.scene.add(this.camera); else this.cab.add(this.camera);
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

    _buildChunk(k) {
        const route = this.route;
        const s0 = k * CHUNK, s1 = Math.min(route.length, s0 + CHUNK);
        if (s1 <= s0) return null;
        const g = new THREE.Group();
        const R = rng(k + 17);
        const B = this.base;
        const under = this.under;
        const elevated = this.env === 'elevated';
        const side = this.cfg.platformSide === 'left' ? -1 : 1;
        const A = this.assets;

        // 軌道(鋼軌、道床、枕木)
        const tracks = [0, ...(this.hasOther ? [this.otherLateral] : [])];
        tracks.forEach(off => {
            [-GAUGE / 2, GAUGE / 2].forEach(r => {
                g.add(new THREE.Mesh(sweep(route, s0, s1, 2, [[r - 0.036, 0.13], [r + 0.036, 0.13], [r + 0.036, 0.165], [r - 0.036, 0.165]], { closed: true, offset: off, base: B - 0.15 }), this.M.rail));
                g.add(new THREE.Mesh(sweep(route, s0, s1, 2, [[r - 0.075, 0], [r + 0.075, 0], [r + 0.012, 0.13], [r - 0.012, 0.13]], { closed: true, offset: off, base: B - 0.15 }), this.M.railSide));
            });
            g.add(new THREE.Mesh(sweep(route, s0, s1, 4, [[-2.0, -0.34], [-1.45, -0.1], [1.45, -0.1], [2.0, -0.34]], { offset: off, base: B - 0.15, uv: 2 }), this.M.ballast));
            const cnt = Math.floor((s1 - s0) / 0.6);
            const inst = new THREE.InstancedMesh(this.sleeperGeo, this.M.sleeper, cnt);
            const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
            for (let i = 0; i < cnt; i++) {
                const p = poseAt(route, s0 + i * 0.6 + 0.3);
                e.set(0, Math.atan2(-p.tx, -p.tz), 0);
                q.setFromEuler(e);
                v.set(p.x - p.tz * off, B - 0.25, p.z + p.tx * off);
                m4.compose(v, q, one);
                inst.setMatrixAt(i, m4);
            }
            inst.receiveShadow = true;
            g.add(inst);
            if (!under && this.cfg.overhead) {
                g.add(new THREE.Mesh(sweep(route, s0, s1, 4, [[-0.012, 5.4], [0.012, 5.4], [0.012, 5.425], [-0.012, 5.425]], { closed: true, offset: off, base: B }), this.M.wire));
                g.add(new THREE.Mesh(sweep(route, s0, s1, 4, [[-0.01, 6.3], [0.01, 6.3], [0.01, 6.32], [-0.01, 6.32]], { closed: true, offset: off, base: B }), this.M.wire));
            }
        });

        const inStation = (s, pad = 2) => !!this.stationCovering(s, pad);

        // 速限標誌(限速區段起點,立在本線外側;牌面朝向進站列車)
        (this.cfg.limitSigns || []).forEach(ls => {
            if (ls.s < s0 || ls.s >= s1) return;
            const outer = this.otherLateral > 0 ? -1 : 1;
            const sign = A.slot('trackside/speed-limit');
            if (!sign) return;
            place(sign, route, ls.s, outer * (under ? 2.1 : 2.6), B);
            if (ls.tex) sign.traverse(m => { if (m.isMesh && /LimitFace/.test(m.material?.name || m.name)) m.material = new THREE.MeshBasicMaterial({ map: ls.tex, toneMapped: false }); });
            g.add(sign);
        });

        if (under) {
            // 單線隧道(月台區段由車站模組提供牆與天花)
            const wallIn = -2.6 * side, wallOut = 2.4 * side;
            let a = s0;
            const flush = (b) => {
                if (b - a < 0.5) return;
                g.add(new THREE.Mesh(sweep(route, a, b, 2, side > 0
                    ? [[wallIn, -0.4], [wallIn, 4.6], [-1.2, 5.3], [1.2, 5.3], [wallOut, 4.6], [wallOut, -0.4]]
                    : [[wallOut, -0.4], [wallOut, 4.6], [-1.2, 5.3], [1.2, 5.3], [wallIn, 4.6], [wallIn, -0.4]], { base: B, uv: 4 }), this.M.tunnel));
            };
            for (let s = s0; s <= s1; s += 2) {
                if (inStation(s, 1)) { flush(s); a = s + 2; }
            }
            flush(s1);
            // 隧道燈、走道
            const lights = [];
            for (let s = Math.ceil(s0 / 25) * 25; s < s1; s += 25) if (!inStation(s, 8)) lights.push(placeMatrix(route, s, -2.45 * side, B + 3.2));
            g.add(A.instanced('trackside/tunnel-light', lights));
        } else {
            if (elevated) {
                const lo = Math.min(0, this.otherLateral) - 2.4, hi = Math.max(0, this.otherLateral) + 2.4;
                g.add(new THREE.Mesh(sweep(route, s0, s1, 4, [[lo, -0.35], [hi, -0.35], [hi, -1.35], [lo, -1.35]], { closed: true, base: B, uv: 3 }), this.M.deck));
                g.add(new THREE.Mesh(sweep(route, s0, s1, 4, [[lo, -0.35], [lo, 0.95], [lo + 0.22, 0.95], [lo + 0.22, -0.35]], { closed: true, base: B, uv: 3 }), this.M.deck));
                g.add(new THREE.Mesh(sweep(route, s0, s1, 4, [[hi - 0.22, -0.35], [hi - 0.22, 0.95], [hi, 0.95], [hi, -0.35]], { closed: true, base: B, uv: 3 }), this.M.deck));
                for (let s = Math.ceil(s0 / 30) * 30; s < s1; s += 30) {
                    const pier = A.slot('trackside/pier');
                    if (!pier) continue;
                    place(pier, route, s, (lo + hi) / 2, B);
                    pier.scale.y = (B + 0.4) / 10.8;
                    g.add(pier);
                }
            }
            if (this.cfg.overhead) {
                const outer = this.otherLateral > 0 ? -1 : 1;
                const ms = [];
                for (let s = Math.ceil(s0 / 50) * 50; s < s1; s += 50) if (!inStation(s, 6)) ms.push(placeMatrix(route, s, outer * 3.2, B, outer > 0 ? 0 : Math.PI));
                g.add(A.instanced('trackside/mast', ms));
            }
            this._buildStreet(g, s0, s1, R, side, elevated);
        }
        if (this.T.night && A.rail) A.rail.setNight(g, this.T.night);
        this._shadowify(g);
        this.scene.add(g);
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
    _buildStreet(g, s0, s1, R, side, elevated) {
        const route = this.route;
        const A = this.assets;
        const dens = this.Q.street;
        const detail = g.userData.detail = { 'street/aircon': [], 'street/hydrant': [], 'trackside/utility-box': [] };
        const useRail = !!A.rail;
        const faceTrack = new THREE.Matrix4().makeRotationY(Math.PI);
        [-1, 1].forEach(dir => {
            const trackEdge = (dir === Math.sign(this.otherLateral) ? Math.abs(this.otherLateral) : 0) + (elevated ? 3.0 : 2.6);
            const st = this.stationCovering((s0 + s1) / 2, 40);
            const stationSide = st && dir === side;
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
            if (!elevated && !stationSide) {
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
        const under = this.under;
        const B = this.base;
        const flip = st.side === 'left';
        const n = Math.ceil((st.p1 - st.p0) / SEG);
        const mirror = (o) => { if (o && flip) o.scale.x = -1; return o; };
        const lat = (x) => flip ? -x : x;
        const add = (o) => { if (o) g.add(o); return o; };

        for (let i = 0; i < n; i++) {
            const s = st.p0 + SEG * (i + 0.5);
            add(mirror(place(A.slot(under ? 'platform/underground' : 'platform/open'), route, s, 0, B)));
            add(mirror(place(A.slot(under ? 'platform/psd-full' : 'platform/psd-half'), route, s, 0, B)));
            if (this.env === 'elevated') {
                const deck = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.4, 1.2, SEG), this.M.deck);
                place(deck, route, s, lat(EDGE + PW / 2), B - 1.6);
                g.add(deck);
                if (i % 3 === 1) { const pier = A.slot('trackside/pier'); if (pier) { place(pier, route, s, lat(EDGE + PW / 2), B - 1.0); pier.scale.y = B / 10.8; g.add(pier); } }
            }
        }
        if (under) {
            [st.p0, st.p1].forEach((s, k) => {
                const w = new THREE.Mesh(new THREE.PlaneGeometry(PW + EDGE - 2.4 + 0.4, 4.8), this.M.head);
                place(w, route, s + (k ? 0.05 : -0.05), lat((2.4 + EDGE + PW + 0.3) / 2), B + 2.4);
                g.add(w);
            });
        }

        // 指標:站名牌(牆面/欄杆)、柱面站名、吊掛方向指標
        const tex = st.textures || {};
        const signMat = (t) => t ? new THREE.MeshBasicMaterial({ map: t, toneMapped: false }) : new THREE.MeshBasicMaterial({ color: 0xffffff });
        const faceToTrack = flip ? -Math.PI / 2 : Math.PI / 2;
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
            const d = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.6), signMat(tex.direction));
            place(d, route, s, lat(EDGE + 2.6), B + PH + 2.75);
            g.add(d);
            const back = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.68, 0.06), this.M.wire);
            place(back, route, s + 0.04, lat(EDGE + 2.6), B + PH + 2.75);
            g.add(back);
            [-1.3, 1.3].forEach(dx => {
                const rod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, 0.03), this.M.wire);
                place(rod, route, s + 0.04, lat(EDGE + 2.6 + dx), B + PH + 3.5);
                g.add(rod);
            });
        });
        // 停車位置標
        const sm = add(place(A.slot('trackside/stop-marker'), route, st.sStop + 1.5, lat(EDGE + 0.45), B + PH));
        if (sm && tex.stop) sm.traverse(m => { if (m.isMesh && /StopFace/.test(m.material?.name || '')) m.material = new THREE.MeshBasicMaterial({ map: tex.stop, toneMapped: false }); });
        // 出發號誌(月台前端外 18 m,對向側);燈用獨立材質才能個別切換
        const sig = add(place(A.slot('trackside/signal-post'), route, st.p1 + 18, lat(-2.3), B));
        if (sig) {
            ownMaterials(sig, null);
            this.signals.push({ st, red: findMat(sig, 'SignalRed'), green: findMat(sig, 'SignalGreen') });
        }
        // 月台設施:座椅、垃圾桶、壁掛公共電話
        for (let s = st.p0 + 18; s < st.p1 - 10; s += 36) {
            add(place(A.slot('platform/bench'), route, s, lat(EDGE + PW - 0.5), B + PH, flip ? -Math.PI / 2 : Math.PI / 2));
            add(place(A.slot('platform/trash-can'), route, s + 2.2, lat(EDGE + PW - 0.45), B + PH));
        }
        add(place(A.slot('platform/payphone'), route, st.p0 + 30, lat(EDGE + PW - 0.12), B + PH + 0.95, flip ? Math.PI / 2 : -Math.PI / 2));
        // 候車旅客(寫實人物):先算好位置,列車接近時才產生
        const R = rng(st.s | 0);
        const people = Math.round((10 + R() * 16) * this.Q.people);
        const crowd = [];
        for (let i = 0; i < people; i++) {
            const s = st.p0 + 6 + R() * (st.p1 - st.p0 - 12);
            const face = (flip ? -1 : 1) * Math.PI / 2 + (R() - 0.5) * 1.6; // 大多面向軌道
            crowd.push(placeMatrix(route, s, lat(EDGE + 1.3 + R() * (PW - 2.4)), B + PH, face));
        }
        g.userData.crowd = crowd;
        g.userData.crowdSeed = st.s | 0;
        const light = new THREE.PointLight(0xFFF1D6, under || this.T.night > 0.5 ? 60 : 8, 90, 1.6);
        place(light, route, (st.p0 + st.p1) / 2, lat(EDGE + 2), B + 4.2);
        g.add(light);
        if (A.rail && (under || this.T.night)) A.rail.setNight(g, under ? 1 : this.T.night);
        this._shadowify(g);
        this.scene.add(g);
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
            if (g && !g.userData.detailBuilt && Math.abs((k + 0.5) * CHUNK - s) < DETAIL) this._buildDetail(g);
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
            this.scene.add(g);
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
        this.cab.position.set(p.x - p.tz * lat, this.base + PH, p.z + p.tx * lat);
        const t = st.time || 0;
        const vr = Math.min(1, st.v / 25);
        const sway = vr * (Math.sin(t * 1.7) * 0.004 + Math.sin(t * 5.3) * 0.0015);
        const bob = vr * Math.sin(t * 9.1) * 0.006;
        this.cab.rotation.set(0, 0, 0);
        this.cab.rotateY(Math.atan2(-p.tx, -p.tz));
        this.cab.rotateZ(sway);
        if (this.lever) this.lever.rotation.x = st.notch * 0.085;

        if (this.view === 'cab') {
            this.camera.position.set(0, 1.62 + bob, 0.05);
            this.camera.rotation.set(this.look.pitch, this.look.yaw, 0, 'YXZ');
        } else {
            this._poseConsist(this.consist, st.s, lat, 1);
            // 車外追蹤:列車左後上方,滑鼠可環顧
            const back = poseAt(route, Math.max(0, st.s - 34));
            const side = this.view === 'side' ? 14 : 9;
            const yaw = this.look.yaw;
            const cx = back.x + back.tz * side * Math.cos(yaw) - back.tx * 6 * Math.sin(yaw);
            const cz = back.z - back.tx * side * Math.cos(yaw) - back.tz * 6 * Math.sin(yaw);
            this.camera.position.set(cx, this.base + (this.view === 'side' ? 3.2 : 5.2) - this.look.pitch * 10, cz);
            const tgt = poseAt(route, st.s + 10);
            this.camera.lookAt(tgt.x, this.base + 2.0, tgt.z);
        }

        // 陰影相機跟著列車
        if (this.sun.castShadow) {
            this.sun.position.set(p.x - 120, this.base + 200, p.z + 80);
            this.sun.target.position.set(p.x, this.base, p.z);
        }
        if (this.ground) {
            const gx = Math.round(p.x / 60) * 60, gz = Math.round(p.z / 60) * 60;
            this.ground.position.set(gx, -0.36, gz);
            const m = this.M.ground;
            [m.map, m.normalMap, m.roughnessMap].forEach(tx => tx && tx.offset.set(gx / 6, -gz / 6));
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
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        this.chunks.forEach(g => this._dispose(g));
        this.stationGroups.forEach(g => this._dispose(g));
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}

export { THREE };
