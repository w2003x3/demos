/**
 * 鐵道模型展示台 —— 把 rail-assets 的模型擺上微縮模型底座(黑色底座 + 黃銅銘牌),
 * 窄視角鏡頭 + 移軸景深 + 光暈 + 暗角(adapters/three/miniature-look.js)。
 *
 *   npm run viewer → http://localhost:8095/viewer/
 *   網址參數:?s=<場景 id>(例 train:emu3000、platform、street、slot:people/standing)、&t=day|dusk|night、&auto=0
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RailAssets } from '../adapters/three/rail-assets.js';
import { createMiniatureLook, refineMaterials } from '../adapters/three/miniature-look.js';

const qs = new URLSearchParams(location.search);
const fail = (e) => { const el = document.getElementById('load'); el.classList.remove('done'); el.style.letterSpacing = '.06em'; el.textContent = '載入失敗:' + (e && (e.message || e.reason?.message || e.reason) || e); console.error(e); };
addEventListener('error', fail);
addEventListener('unhandledrejection', fail);
const $ = (id) => document.getElementById(id);

// ---------- 渲染器(抗鋸齒交給後製的 MSAA 緩衝) ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const look = createMiniatureLook(THREE, renderer, { preset: 'diorama', samples: 4, ao: true, aoRadius: 0.9 });

const scene = new THREE.Scene();
scene.background = backdrop();
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = 1.42;
controls.autoRotateSpeed = 0.55;

const hemi = new THREE.HemisphereLight(0xdfe6f0, 0x2a2622, 0.35);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.04;
// 背光:從後上方勾出底座與模型輪廓(展示櫃的輪廓光)
const rim = new THREE.DirectionalLight(0xb8c8ff, 0.9);
scene.add(hemi, sun, sun.target, rim, rim.target);

/** 背景:中央微亮的深色漸層(展示櫃的感覺) */
function backdrop() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(256, 210, 20, 256, 256, 380);
    g.addColorStop(0, '#20232a');
    g.addColorStop(0.55, '#0e1015');
    g.addColorStop(1, '#050608');
    x.fillStyle = g;
    x.fillRect(0, 0, 512, 512);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

// ---------- 模型庫 ----------
// 模型庫位置:預設本 repo 的 dist;發布到作品展示時由 index.html 的 window.RAIL_BASE 指向已發布的模型庫
const ra = await new RailAssets(window.RAIL_BASE || '../dist').init();
const owned = [];   // 本頁自己產生的幾何/材質(換場景時釋放)
const own = (o) => { owned.push(o); return o; };
const matCache = new Map();
/** 模型庫 PBR 材質;UV 以公尺計,repeat = 每公尺幾張 */
const texMat = (id, repeat = 0.5, color = 0xffffff) => {
    const k = `${id}:${repeat}:${color}`;
    if (!matCache.has(k)) matCache.set(k, ra.material(id, { repeat, color }));
    return matCache.get(k);
};

/** 方塊,UV 以公尺計(貼圖比例在各面一致) */
function slabGeo(w, h, d) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
        const j = f * 4 + i;
        uv.setXY(j, uv.getX(j) * dims[f][0], uv.getY(j) * dims[f][1]);
    }
    if (!g.attributes.uv2) g.setAttribute('uv2', uv.clone());
    return own(g);
}
function slab(mat, w, h, d, x, y, z) {
    const m = new THREE.Mesh(slabGeo(w, h, d), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    return m;
}

// ---------- 底座 + 銘牌 ----------
const plinthMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0a09, roughness: 0.32, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 0.3 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x6f5532, roughness: 0.42, metalness: 1 });

function plaqueTexture(title, sub) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1024, 256);
    g.addColorStop(0, '#6e5329'); g.addColorStop(0.35, '#c9a464'); g.addColorStop(0.6, '#8a6a36'); g.addColorStop(1, '#d3b073');
    x.fillStyle = g;
    x.fillRect(0, 0, 1024, 256);
    // 拉絲紋
    for (let i = 0; i < 900; i++) {
        x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,240,210' : '40,28,10'},${Math.random() * 0.06})`;
        x.fillRect(0, Math.random() * 256, 1024, 1);
    }
    x.strokeStyle = 'rgba(40,26,8,.7)'; x.lineWidth = 6; x.strokeRect(14, 14, 996, 228);
    x.strokeStyle = 'rgba(255,236,190,.35)'; x.lineWidth = 2; x.strokeRect(24, 24, 976, 208);
    x.textAlign = 'center';
    const engrave = (txt, y, font) => {
        x.font = font;
        x.fillStyle = 'rgba(255,240,205,.45)'; x.fillText(txt, 513, y + 2);
        x.fillStyle = '#2a1c08'; x.fillText(txt, 512, y);
    };
    const fit = (txt, px, max) => { x.font = `700 ${px}px "Noto Serif TC", serif`; let s = px; while (x.measureText(txt).width > max && s > 20) { s -= 2; x.font = `700 ${s}px "Noto Serif TC", serif`; } return s; };
    const tp = fit(title, 84, 900);
    engrave(title, 128, `700 ${tp}px "Noto Serif TC", serif`);
    engrave(sub, 196, '500 30px "Noto Sans TC", sans-serif');
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return own(t);
}

/**
 * 底座:台面範圍 [x0,x1]×[z0,z1](台面頂 y=0,地面材質由場景鋪),往下是黑色亮面底座、黃銅收邊、正面銘牌。
 */
function plinth(x0, x1, z0, z1, title, sub, plaqueSide = 1) {
    const g = new THREE.Group();
    const w = x1 - x0, d = z1 - z0, size = Math.max(w, d);
    const m = size * 0.035, H = Math.max(1.2, size * 0.09);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const base = new THREE.Mesh(own(new THREE.BoxGeometry(w + m * 2, H, d + m * 2)), plinthMat);
    base.position.set(cx, -0.3 - H / 2, cz);
    base.receiveShadow = true;
    const trim = new THREE.Mesh(own(new THREE.BoxGeometry(w + m * 2 + 0.03, 0.05, d + m * 2 + 0.03)), trimMat);
    trim.position.set(cx, -0.33, cz);
    const foot = new THREE.Mesh(own(new THREE.BoxGeometry(w + m * 2 + 0.3, 0.12, d + m * 2 + 0.3)), plinthMat);
    foot.position.set(cx, -0.3 - H - 0.06, cz);
    g.add(base, trim, foot);
    // 銘牌:放在長邊(細長場景 = +X 面,否則 +Z 面),鏡頭預設從這一側看
    const side = d > w * 1.3;
    const pw = Math.min((side ? d : w) * 0.42, Math.max(3.2, size * 0.2)), ph = pw / 4;
    const pl = new THREE.Mesh(own(new THREE.PlaneGeometry(pw, ph)), own(new THREE.MeshStandardMaterial({ map: plaqueTexture(title, sub), roughness: 0.38, metalness: 0.9 })));
    if (side) {
        pl.position.set(plaqueSide < 0 ? x0 - m - 0.012 : x1 + m + 0.012, -0.3 - H * 0.52, cz);
        pl.rotation.y = plaqueSide < 0 ? -Math.PI / 2 : Math.PI / 2;
    } else pl.position.set(cx, -0.3 - H * 0.52, z1 + m + 0.012);
    g.add(pl);
    return g;
}

// ---------- 軌道 ----------
const railMat = new THREE.MeshStandardMaterial({ color: 0x8d9094, metalness: 0.9, roughness: 0.35 });
const railSideMat = new THREE.MeshStandardMaterial({ color: 0x5b4a3c, metalness: 0.4, roughness: 0.85 });
const RAIL_TOP = 0.62;

/** 道碴路基 + 枕木 + 鋼軌(沿 z 從 z0 到 z1,軌道中心 x) */
async function track(x, z0, z1, { third = false } = {}) {
    const g = new THREE.Group();
    const L = z1 - z0, zc = (z0 + z1) / 2;
    const shape = new THREE.Shape([new THREE.Vector2(-2.1, 0), new THREE.Vector2(2.1, 0), new THREE.Vector2(1.45, 0.32), new THREE.Vector2(-1.45, 0.32)]);
    const bg = own(new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false }));
    bg.setAttribute('uv2', bg.attributes.uv.clone());
    const ballast = new THREE.Mesh(bg, await texMat('ballast', 0.6));
    ballast.position.set(x, 0, z0);
    ballast.receiveShadow = true;
    g.add(ballast);
    const n = Math.floor(L / 0.6);
    const sl = new THREE.InstancedMesh(own(new THREE.BoxGeometry(2.4, 0.16, 0.24)), await texMat('concrete', 1, 0xb8b2a8), n);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < n; i++) sl.setMatrixAt(i, mtx.makeTranslation(x, 0.4, z0 + 0.3 + i * 0.6));
    sl.castShadow = sl.receiveShadow = true;
    g.add(sl);
    for (const s of [-1, 1]) {
        const head = new THREE.Mesh(own(new THREE.BoxGeometry(0.07, 0.07, L)), railMat);
        head.position.set(x + s * 0.7175, RAIL_TOP - 0.035, zc);
        const web = new THREE.Mesh(own(new THREE.BoxGeometry(0.03, 0.09, L)), railSideMat);
        web.position.set(x + s * 0.7175, RAIL_TOP - 0.115, zc);
        head.castShadow = true;
        g.add(head, web);
    }
    if (third) {
        const tr = new THREE.Mesh(own(new THREE.BoxGeometry(0.12, 0.1, L)), railSideMat);
        tr.position.set(x - 1.45, 0.55, zc);
        g.add(tr);
    }
    return g;
}

const place = (o, x, y, z, ry = 0) => { if (!o) return null; o.position.set(x, y, z); o.rotation.y = ry; o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

// ---------- 場景 ----------
const trainEntries = Object.entries(ra.trains);
const SCENES = {};
for (const [id, t] of trainEntries) {
    SCENES['train:' + id] = {
        group: '列車', name: t.name, en: `${id.toUpperCase()} · ${t.cars} cars`, desc: t.desc,
        slots: [t.lead.slot, t.middle.slot, 'trackside/mast', 'trackside/signal-post', 'trackside/speed-limit', 'vegetation/tree', 'vegetation/shrub', 'trackside/electric-pole'],
        build: (g) => buildTrain(g, t)
    };
}
SCENES.platform = {
    group: '綜合場景', name: '地面車站月台', en: 'Open Platform · Taipei Metro', desc: '月台模組、半高月台門、柱、座椅、垃圾桶與候車旅客,旁邊停靠台北捷運高運量列車',
    slots: ['platform/open', 'platform/psd-half', 'platform/pillar', 'platform/bench', 'platform/trash-can', 'platform/camera', 'people/standing', 'train/taipei-hc/lead', 'train/taipei-hc/middle'],
    build: buildPlatform
};
SCENES.street = {
    group: '綜合場景', name: '台灣街角', en: 'Street Corner · Shophouses', desc: '騎樓街屋(冷氣室外機掛點)、路燈、行道樹、消防栓、座椅與行人',
    slots: ['building/street', 'street/lamp', 'street/hydrant', 'street/aircon', 'street/seating', 'vegetation/tree', 'vegetation/shrub', 'people/standing'],
    build: buildStreet
};
const skipSingle = /^train\/|^platform\/(underground|open|psd)/;
for (const slot of Object.keys(ra.manifest.slots)) {
    if (skipSingle.test(slot)) continue;
    const vs = ra.variants(slot);
    SCENES['slot:' + slot] = {
        group: '單品', name: slot, en: `${vs.length} variant${vs.length > 1 ? 's' : ''} · ${vs[0].tris} tris`, desc: [...new Set(vs.map((v) => v.title).filter(Boolean))].slice(0, 3).join('、') || slot,
        slots: [slot], build: (g) => buildSingle(g, slot)
    };
}

async function buildTrain(g, t) {
    const lead = ra.instance(t.lead.slot), mid = ra.instance(t.middle.slot);
    const len = t.lead.length + t.gap + t.middle.length;
    const z0 = -len / 2;
    const overhead = t.collect !== 'third';
    g.add(await track(0, z0 - 4, z0 + len + 4, { third: t.collect === 'third' }));
    g.add(place(lead, 0, RAIL_TOP, z0));
    g.add(place(mid, 0, RAIL_TOP, z0 + t.lead.length + t.gap));
    const W0 = -6.5, W1 = 7.5, Z0 = z0 - 4, Z1 = z0 + len + 4;
    g.add(slab(await texMat('grass', 0.35, 0x8e9a74), W1 - W0, 0.3, Z1 - Z0, (W0 + W1) / 2, -0.15, (Z0 + Z1) / 2));
    if (overhead) {
        for (let z = Z0 + 3; z < Z1; z += 22) g.add(place(ra.instance('trackside/mast'), 2.6, 0, z));
        const wire = new THREE.Mesh(own(new THREE.CylinderGeometry(0.015, 0.015, Z1 - Z0, 4).rotateX(Math.PI / 2)), railSideMat);
        wire.position.set(0, 5.2, (Z0 + Z1) / 2);
        g.add(wire);
    } else {
        g.add(place(ra.instance('trackside/barrier'), 2.9, 0, Z1 - 6, Math.PI / 2));
    }
    g.add(place(ra.instance('trackside/signal-post'), -2.6, 0, Z0 + 1.6));
    g.add(place(ra.instance('trackside/speed-limit'), -2.6, 0, Z1 - 3));
    g.add(place(ra.instance('trackside/electric-pole'), -5.2, 0, Z0 + 9));
    g.add(place(ra.instance('vegetation/tree', { index: 0 }), -4.6, 0, Z1 - 9, 0.4));
    g.add(place(ra.instance('vegetation/tree', { index: 1 }), 5.6, 0, Z0 + 12, 1.3));
    g.add(place(ra.instance('vegetation/shrub'), -4.2, 0, 2, 0.8));
    g.add(place(ra.instance('vegetation/shrub'), 5.2, 0, Z1 - 4, 2));
    return { box: [W0, W1, Z0, Z1], title: t.name, sub: `${t.short || ''} · ${t.cars} 節編組 · 最高 ${t.spec?.vmax ?? '?'} km/h` };
}

async function buildPlatform(g) {
    const Z0 = -26, Z1 = 26;
    g.add(await track(0, Z0, Z1, { third: true }));
    for (let z = -20; z <= 20; z += 10) {
        g.add(place(ra.instance('platform/open'), 0, RAIL_TOP, z));
        g.add(place(ra.instance('platform/psd-half'), 0, RAIL_TOP, z));
    }
    const FLOOR = RAIL_TOP + 1.1;
    for (let z = -18; z <= 18; z += 9) g.add(place(ra.instance('platform/pillar'), 5.4, RAIL_TOP, z));
    for (const z of [-13.5, 4.5]) g.add(place(ra.instance('platform/bench'), 6.6, FLOOR, z));
    for (const z of [-4.5, 13.5]) g.add(place(ra.instance('platform/trash-can'), 6.9, FLOOR, z, -Math.PI / 2));
    let k = 0;
    for (const [x, z, r] of [[3.2, -16, 1.5], [3.4, -15, -2], [4.6, -7, 1.6], [3.3, 1, 1.4], [5.8, 2, 3], [3.5, 9, 1.7], [4.2, 10.2, -1.2], [6.2, 15, 2.5], [3.1, 18, 1.5]])
        g.add(place(ra.instance('people/standing', { index: k++ }), x, FLOOR, z, r));
    // 列車正要進站:只停半邊,另一半露出候車旅客
    g.add(place(ra.instance('train/taipei-hc/lead'), 0, RAIL_TOP, 4));
    const W0 = -4, W1 = 9;
    g.add(slab(await texMat('concrete', 0.4, 0x9c978e), W1 - W0, 0.3, Z1 - Z0, (W0 + W1) / 2, -0.15, 0));
    const lamps = [];
    for (let z = -18; z <= 18; z += 9) lamps.push([4, FLOOR + 3.4, z]);
    return { box: [W0, W1, Z0, Z1], title: '地面車站月台', sub: 'platform/open · psd-half · pillar · bench · people', view: { yaw: -1.0, pitch: 0.36 }, lamps };
}

async function buildStreet(g) {
    const X0 = -14, X1 = 14, Z0 = -16, Z1 = 13;
    // 騎樓街屋(立面原本朝 -Z,轉 180° 面向鏡頭)
    const ac = [];
    [-9, -3, 3, 9].forEach((x, i) => {
        const b = place(ra.instance('building/street', { index: i }), x, 0, 0, Math.PI);
        g.add(b);
        ra.anchors(b, 'Anchor_Aircon').forEach((a) => ac.push(a));
    });
    ac.forEach((a, i) => { if (i % 2 === 0) a.add(place(ra.instance('street/aircon'), 0, 0, 0)); });
    g.add(slab(await texMat('concrete', 0.5, 0xc9c3b6), X1 - X0, 0.3, 4.2, 0, -0.15 + 0.12, 3.1));       // 人行道(高出路面)
    g.add(slab(await texMat('asphalt', 0.3, 0x8a8a88), X1 - X0, 0.3, Z1 - 5.2, 0, -0.15, (5.2 + Z1) / 2)); // 路面
    g.add(slab(await texMat('concrete', 0.5, 0xb4aea3), X1 - X0, 0.3, 1 - Z0, 0, -0.15, (Z0 + 1) / 2));    // 建築基地
    const lineMat = own(new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.6 }));
    for (let x = X0 + 1; x < X1; x += 4) g.add(slab(lineMat, 2, 0.02, 0.15, x + 1, 0.011, 9.2));
    for (const x of [-11, 1]) g.add(place(ra.instance('street/lamp'), x, 0.12, 4.8, 0));
    g.add(place(ra.instance('vegetation/tree', { index: 0 }), -5.5, 0.12, 4.4, 0.6));
    g.add(place(ra.instance('vegetation/tree', { index: 1 }), 7, 0.12, 4.4, 2.1));
    g.add(place(ra.instance('street/hydrant'), 4.2, 0.12, 4.6));
    g.add(place(ra.instance('street/seating'), 10.5, 0.12, 3.4));
    g.add(place(ra.instance('vegetation/shrub'), 12.5, 0.12, 4.3, 1));
    let k = 3;
    for (const [x, z, r] of [[-8.2, 2.4, 0.4], [-7.6, 2.8, -2.6], [-1.5, 3.2, 1.6], [2.6, 2.1, -1.4], [5.6, 3.6, 3], [10.4, 3, 0.2], [-12, 2.2, 1.2]])
        g.add(place(ra.instance('people/standing', { index: k++ }), x, 0.12, z, r));
    return { box: [X0, X1, Z0, Z1], title: '台灣街角', sub: 'building/street · street/* · vegetation/* · people/standing', lamps: [[-11 + 2.7, 9, 4.8], [1 + 2.7, 9, 4.8]] };
}

async function buildSingle(g, slot) {
    const vs = ra.variants(slot);
    const items = vs.map((v, i) => ra.instance(slot, { id: v.id, index: i })).filter(Boolean);
    const sizes = items.map((o) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()));
    const gapX = Math.max(0.4, Math.max(...sizes.map((s) => s.x)) * 0.25);
    const total = sizes.reduce((a, s) => a + s.x, 0) + gapX * (items.length - 1);
    let x = -total / 2;
    let minY = 0;
    items.forEach((o, i) => {
        const b = new THREE.Box3().setFromObject(o);
        minY = Math.min(minY, b.min.y);
        place(o, x - b.min.x, 0, 0);
        x += sizes[i].x + gapX;
        g.add(o);
    });
    const depth = Math.max(...sizes.map((s) => s.z), 1);
    const half = Math.max(total, depth) / 2 + Math.max(0.6, Math.max(total, depth) * 0.18);
    const hx = Math.max(half, total / 2 + gapX), hz = Math.max(depth / 2 + gapX * 2, half * 0.6);
    if (minY < -0.5) g.position.y = -minY;   // 橋墩等往下延伸的模型:整組抬到台面上
    g.add(slab(await texMat('concrete', Math.min(2, 4 / hx), 0xa8a39a), hx * 2, 0.3, hz * 2, 0, -0.15 + (g.position.y ? -g.position.y : 0), 0));
    return { box: [-hx, hx, -hz, hz], title: slot, sub: `${vs.length} 種變體 · ${vs[0].license || ''}`, lift: g.position.y };
}

// ---------- 時段 ----------
const TIMES = {
    day: { label: '白天', hdri: 'day', env: 0.55, sun: [0xfff1dc, 2.6], hemi: 0.35, exp: 1.0, night: 0, sunPos: [0.55, 0.75, 0.38] },
    dusk: { label: '黃昏', hdri: 'dusk', env: 0.5, sun: [0xffa860, 2.0], hemi: 0.22, exp: 1.05, night: 0.55, sunPos: [-0.75, 0.32, 0.45] },
    night: { label: '夜晚', hdri: 'night', env: 0.35, sun: [0x8fa6d8, 0.35], hemi: 0.1, exp: 1.25, night: 1, sunPos: [0.4, 0.8, -0.4] }
};
let timeKey = TIMES[qs.get('t')] ? qs.get('t') : 'day';
const lampLights = [];

async function applyTime() {
    const T = TIMES[timeKey];
    const env = await ra.environment(T.hdri, renderer);
    if (env) { scene.environment = env.envMap; scene.environmentIntensity = T.env; }
    sun.color.set(T.sun[0]); sun.intensity = T.sun[1];
    hemi.intensity = T.hemi;
    renderer.toneMappingExposure = T.exp;
    ra.setNight(stage, T.night);
    lampLights.forEach((l) => { l.visible = T.night > 0.4; l.intensity = 30 * T.night; });
    look.set({ threshold: T.night > 0.4 ? 0.8 : 2.4, bloom: opts.bloom ? (T.night > 0.4 ? 0.55 : 0.28) : 0 });
    fitSun();
}

// ---------- 換場景 ----------
const stage = new THREE.Group();
scene.add(stage);
let current = null, bounds = null;

function clearStage() {
    stage.clear();
    lampLights.length = 0;
    owned.splice(0).forEach((o) => o.dispose && o.dispose());
}

async function show(id) {
    const S = SCENES[id] || SCENES[Object.keys(SCENES)[0]];
    id = Object.keys(SCENES).find((k) => SCENES[k] === S);
    current = id;
    $('load').classList.remove('done');
    $('load').textContent = 'LOADING';
    await ra.loadSlots(S.slots, (p) => { $('load').textContent = 'LOADING ' + Math.round(p * 100) + '%'; });
    $('load').textContent = 'BUILDING';
    if (current !== id) return;
    clearStage();
    const g = new THREE.Group();
    const info = await S.build(g);
    if (current !== id) return;
    refineMaterials(THREE, g);
    stage.add(g);
    const [x0, x1, z0, z1] = info.box;
    stage.add(plinth(x0, x1, z0, z1, info.title, info.sub, info.view && Math.sin(info.view.yaw) < 0 ? -1 : 1));
    (info.lamps || []).forEach(([x, y, z]) => {
        const l = new THREE.PointLight(0xffc98a, 0, 9, 2);
        l.position.set(x, y - 0.4, z);
        lampLights.push(l);
        stage.add(l);
    });
    bounds = new THREE.Box3().setFromObject(stage);
    viewHint = info.view || null;
    $('tk').textContent = S.name;
    $('tk').style.fontSize = S.name.length > 10 ? '22px' : '';
    $('te').textContent = S.en;
    $('ts').textContent = S.desc;
    document.title = `${S.name} · 鐵道模型展示台`;
    $('sel').value = id;
    resetView();
    await applyTime();
    $('load').classList.add('done');
    try { history.replaceState(null, '', `?s=${encodeURIComponent(id)}${timeKey !== 'day' ? '&t=' + timeKey : ''}`); } catch { /* file:// */ }
}

/** 陰影範圍貼合場景 */
function fitSun() {
    if (!bounds) return;
    const T = TIMES[timeKey];
    const c = bounds.getCenter(new THREE.Vector3()), r = bounds.getSize(new THREE.Vector3()).length() / 2;
    sun.position.copy(c).addScaledVector(new THREE.Vector3(...T.sunPos).normalize(), r * 2);
    sun.target.position.copy(c);
    rim.position.copy(c).add(new THREE.Vector3(-T.sunPos[0], 0.6, -T.sunPos[2]).normalize().multiplyScalar(r * 2));
    rim.target.position.copy(c);
    rim.intensity = T.night > 0.4 ? 0.5 : 0.9;
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -r; sc.right = sc.top = r; sc.near = r * 0.2; sc.far = r * 4;
    sc.updateProjectionMatrix();
    sun.shadow.needsUpdate = true;
}

/** 預設鏡頭:斜上方 30° 俯看,整座底座入鏡 */
let viewHint = null;
function resetView() {
    if (!bounds) return;
    const c = bounds.getCenter(new THREE.Vector3());
    const r = bounds.getSize(new THREE.Vector3()).length() / 2;
    const sz = bounds.getSize(new THREE.Vector3());
    const yaw = viewHint?.yaw ?? (sz.z > sz.x * 1.3 ? 1.08 : 0.55), pitch = viewHint?.pitch ?? 0.52;
    c.y = Math.max(0.5, c.y * 0.45);
    controls.target.copy(c);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const corners = [];
    for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z));
    // 二分搜尋鏡頭距離:包圍盒角點都落在畫面 78% 範圍內
    let lo = r * 0.3, hi = r * 8, fit = hi;
    const v = new THREE.Vector3();
    for (let k = 0; k < 24; k++) {
        const d = (lo + hi) / 2;
        camera.position.copy(c).addScaledVector(dir, d);
        camera.lookAt(c); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        const ok = corners.every((p) => { v.copy(p).project(camera); return Math.abs(v.x) < 0.78 && Math.abs(v.y) < 0.74 && v.z < 1; });
        if (ok) { fit = d; hi = d; } else lo = d;
    }
    camera.position.copy(c).addScaledVector(dir, fit);
    camera.near = fit * 0.02; camera.far = fit * 8;
    camera.updateProjectionMatrix();
    controls.minDistance = r * 0.35;
    controls.maxDistance = fit * 2.5;
    controls.update();
}

// ---------- 選單 / 切換 ----------
const sel = $('sel');
const groups = {};
for (const [id, S] of Object.entries(SCENES)) (groups[S.group] ||= []).push([id, S]);
for (const [gname, list] of Object.entries(groups)) {
    const og = document.createElement('optgroup');
    og.label = gname;
    list.forEach(([id, S]) => og.appendChild(new Option(S.name, id)));
    sel.appendChild(og);
}
sel.addEventListener('change', () => show(sel.value));

const opts = { auto: qs.get('auto') !== '0', dof: true, bloom: true };
const panel = $('panel');
function pills() {
    panel.innerHTML = '';
    const btn = (label, on, fn) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.className = on ? 'on' : '';
        b.addEventListener('click', () => { fn(); pills(); });
        panel.appendChild(b);
    };
    btn('自動環繞', opts.auto, () => { opts.auto = !opts.auto; });
    btn('移軸景深', opts.dof, () => { opts.dof = !opts.dof; look.set({ tilt: opts.dof ? 1 : 0 }); });
    btn('光暈', opts.bloom, () => { opts.bloom = !opts.bloom; applyTime(); });
    for (const k of Object.keys(TIMES)) btn(TIMES[k].label, timeKey === k, () => { timeKey = k; applyTime(); });
}
pills();
renderer.domElement.addEventListener('dblclick', resetView);
controls.addEventListener('start', () => { idleT = 0; });

function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let idleT = 0, last = performance.now(), fc = 0, ft = last;
renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = (now - last) / 1000;
    last = now;
    idleT += dt;
    controls.autoRotate = opts.auto && idleT > 2.5;
    controls.update();
    look.render(scene, camera);
    fc++;
    if (now - ft > 1000) { $('fps').textContent = `${Math.round(fc * 1000 / (now - ft))} fps · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris`; fc = 0; ft = now; }
});

await show(qs.get('s') || 'train:' + (trainEntries.find(([k]) => k === 'emu3000') || trainEntries[0])[0]);
window.__viewer = { show, look, scene, camera };
