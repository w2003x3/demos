// 由 rail-assets/tools/sync.mjs 複製(2026-10-21),請勿在此修改,改 rail-assets/adapters/three/rail-assets.js
/**
 * rail-assets.js — three.js 載入器(由 rail-assets/tools/sync.mjs 複製到各專案,請勿在專案內修改)
 *
 *   import { RailAssets } from './rail-assets.js';
 *   const ra = await new RailAssets('assets/rail').init();
 *   await ra.loadSlots(['train/taipei-hc/lead', 'people/standing'], p => console.log(p));
 *   const car = ra.instance('train/taipei-hc/lead');          // 共用幾何/材質的副本
 *   const person = ra.instance('people/standing', { rng });   // 多變體時隨機
 *   const env = await ra.environment('day', renderer);        // { envMap, background }
 *   const mat = await ra.material('ballast', { repeat: 2 });  // PBR 材質(color/normal/arm)
 *   ra.setNight(scene, 1.0);                                  // 依材質用途切換夜間發光
 *
 * 需要 importmap:"three" 與 "three/addons/"(three.js r160+)。
 * 座標:Y 向上、前進 -Z、右 +X、公尺(與 dist/manifest.json 的 conventions 相同)。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const DEFAULT_DRACO = `https://cdn.jsdelivr.net/npm/three@0.${THREE.REVISION}.0/examples/jsm/libs/draco/gltf/`;

/** 夜間發光的材質(名稱 → 夜間 emissive 強度);名稱是 rail-assets 的契約 */
export const NIGHT_ROLES = {
    Window: 0.0, WindowLit: 1.6, ShopGlass: 1.2, LampHead: 6.0, LightPanel: 3.0,
    TrainCeilingLight: 2.5, HeadLight: 6.0, TailLight: 3.0,
    ShopSign0: 1.4, ShopSign1: 1.4, ShopSign2: 1.4, ShopSign3: 1.4, ShopSign4: 1.4, ShopSign5: 1.4
};

export class RailAssets {
    /**
     * @param {string} base dist 資料夾的網址(含 manifest.json)
     * @param {{ dracoPath?: string }} opts
     */
    constructor(base, opts = {}) {
        this.base = base.replace(/\/$/, '');
        this.manifest = null;
        this.cache = new Map();      // file → Promise<gltf.scene>
        this.loaded = new Map();     // variant id → Object3D
        this.texCache = new Map();
        const draco = new DRACOLoader();
        draco.setDecoderPath(opts.dracoPath || DEFAULT_DRACO);
        this.loader = new GLTFLoader();
        this.loader.setDRACOLoader(draco);
    }

    async init() {
        const r = await fetch(`${this.base}/manifest.json`, { cache: 'no-cache' });
        if (!r.ok) throw new Error(`rail-assets manifest 讀取失敗(${r.status})`);
        this.manifest = await r.json();
        return this;
    }

    /** 槽位是否有可用(已登錄;loadSlots 後為已成功載入)的變體 */
    has(slot) { return this.loaded.size ? this.variants(slot).some(v => this.loaded.has(v.id)) : !!this.variants(slot).length; }

    variants(slot) { return (this.manifest?.slots?.[slot] || []).filter(v => !v.private || this.allowPrivate); }

    /** 載入槽位的全部變體(已載入的略過) */
    async loadSlots(slots, onProgress) {
        const list = slots.flatMap(s => this.variants(s));
        let done = 0;
        this.failed = this.failed || [];
        await Promise.all(list.map(async v => {
            if (!this.loaded.has(v.id)) {
                try {
                    const gltf = await this._load(v.file);
                    const root = gltf.scene;
                    root.name = v.id;
                    root.userData.variant = v;
                    root.animations = gltf.animations || [];
                    prepare(root);
                    this.loaded.set(v.id, root);
                } catch (err) {
                    // 單一模型壞掉不影響其他模型;該變體略過
                    console.warn(`rail-assets:${v.file} 載入失敗,已略過`, err);
                    this.failed.push({ id: v.id, file: v.file, error: String(err) });
                }
            }
            onProgress && onProgress(++done / list.length, v);
        }));
        return this;
    }

    _load(file) {
        if (!this.cache.has(file)) this.cache.set(file, this.loader.loadAsync(`${this.base}/${file}`));
        return this.cache.get(file);
    }

    /**
     * 取得槽位模型的副本(共用幾何與材質)。
     * opts.index 指定變體;opts.rng 隨機函式(0..1);opts.id 指定變體 id。
     */
    instance(slot, opts = {}) {
        const vs = this.variants(slot).filter(v => this.loaded.has(v.id));
        if (!vs.length) return null;
        let v = opts.id ? vs.find(x => x.id === opts.id) : null;
        if (!v) v = vs[opts.index != null ? opts.index % vs.length : Math.floor((opts.rng || Math.random)() * vs.length)];
        const src = this.loaded.get(v.id);
        const c = src.clone(true);
        c.userData = { ...src.userData, slot };
        c.animations = src.animations;
        return c;
    }

    /**
     * 大量重複擺放同一模型(護欄、枕木、路燈…):每個網格一個 InstancedMesh,省 draw call。
     * matrices:THREE.Matrix4 陣列(世界變換);回傳 Group
     */
    instanced(slot, matrices, opts = {}) {
        const src = this.instance(slot, opts);
        const g = new THREE.Group();
        if (!src || !matrices.length) return g;
        src.updateMatrixWorld(true);
        const tmp = new THREE.Matrix4();
        src.traverse(o => {
            if (!o.isMesh) return;
            const im = new THREE.InstancedMesh(o.geometry, o.material, matrices.length);
            matrices.forEach((m, i) => im.setMatrixAt(i, tmp.multiplyMatrices(m, o.matrixWorld)));
            im.instanceMatrix.needsUpdate = true;
            im.computeBoundingSphere();
            im.castShadow = !!opts.castShadow;
            im.receiveShadow = true;
            g.add(im);
        });
        return g;
    }

    /** 找出名稱以 prefix 開頭的子節點(例如街屋的 Anchor_Aircon_*) */
    anchors(root, prefix = 'Anchor') {
        const out = [];
        root.traverse(o => { if (o.name && o.name.startsWith(prefix)) out.push(o); });
        return out;
    }

    /** PBR 材質(dist/textures/<id>/{color,normal,arm}.webp;arm = AO/粗糙/金屬) */
    async material(id, { repeat = 1, color = 0xffffff, side = THREE.FrontSide } = {}) {
        const t = this.manifest?.textures?.[id];
        if (!t) return new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
        const tl = new THREE.TextureLoader();
        const load = async (k, srgb) => {
            if (!t.maps[k]) return null;
            const key = `${id}:${k}`;
            if (!this.texCache.has(key)) this.texCache.set(key, tl.loadAsync(`${this.base}/${t.maps[k]}`).then(tex => {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
                tex.anisotropy = 8;
                return tex;
            }));
            const tex = (await this.texCache.get(key)).clone();
            tex.repeat.set(repeat, repeat);
            tex.needsUpdate = true;
            return tex;
        };
        const [map, normalMap, arm] = await Promise.all([load('color', true), load('normal', false), load('arm', false)]);
        return new THREE.MeshStandardMaterial({
            name: `tex:${id}`, color, map, normalMap, side,
            roughnessMap: arm, metalnessMap: arm, aoMap: arm, roughness: 1, metalness: arm ? 1 : 0
        });
    }

    /** HDRI 環境光與背景(Poly Haven 等 CC0 天空) */
    async environment(id, renderer) {
        const h = this.manifest?.hdri?.[id];
        if (!h) return null;
        const key = `hdri:${id}`;
        if (!this.texCache.has(key)) this.texCache.set(key, new RGBELoader().loadAsync(`${this.base}/${h.file}`));
        const tex = await this.texCache.get(key);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        const pmrem = new THREE.PMREMGenerator(renderer);
        const envMap = pmrem.fromEquirectangular(tex).texture;
        pmrem.dispose();
        return { envMap, background: tex };
    }

    /** 夜間發光:strength 0(白天)~1(夜間) */
    setNight(root, strength) {
        root.traverse(o => {
            if (!o.isMesh) return;
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
                const base = NIGHT_ROLES[m.name] ?? (m.name.startsWith('ShopSign') ? 1.4 : null);
                if (base == null) return;
                if (!m.userData.dayEmissive) m.userData.dayEmissive = m.emissiveIntensity;
                m.emissiveIntensity = Math.max(m.userData.dayEmissive * (1 - strength), base * strength);
            });
        });
    }

    /** 授權標示(CC-BY 必須顯示) */
    credits() {
        const out = [];
        const add = (kind, v) => out.push({ kind, id: v.id, title: v.title, author: v.author, license: v.license, source: v.source });
        Object.entries(this.manifest?.slots || {}).forEach(([s, vs]) => vs.forEach(v => add(s, v)));
        Object.entries(this.manifest?.textures || {}).forEach(([id, v]) => add('texture', { ...v, id }));
        Object.entries(this.manifest?.hdri || {}).forEach(([id, v]) => add('hdri', { ...v, id }));
        return out;
    }
}

/** 載入後的材質修正:玻璃半透明不寫深度、樹葉 alpha 裁切、預設不投影 */
function prepare(root) {
    root.traverse(o => {
        if (!o.isMesh) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
            if (m.transparent && /glass|windshield/i.test(m.name)) { m.depthWrite = false; m.side = THREE.DoubleSide; }
            if (m.alphaTest > 0 || /leaf|leaves|foliage/i.test(m.name)) {
                // 葉片:alpha 測試 + alpha-to-coverage(需開啟 MSAA);門檻低一點,遠處 mipmap 平均後葉子才不會消失
                m.side = THREE.DoubleSide;
                m.transparent = false;
                m.depthWrite = true;
                m.alphaTest = 0.22;
                m.alphaToCoverage = true;
            }
            if (m.map) m.map.anisotropy = 8;
        });
    });
}

export { THREE };
