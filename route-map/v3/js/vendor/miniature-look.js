// 由 rail-assets/tools/sync.mjs 複製(2026-10-25),請勿在此修改,改 rail-assets/adapters/three/miniature-look.js
/**
 * miniature-look.js — 微縮模型風格後製(由 rail-assets/tools/sync.mjs 複製到各專案,請勿在專案內修改)
 *
 *   import { createMiniatureLook } from './miniature-look.js';
 *   const look = createMiniatureLook(THREE, renderer, { preset: 'diorama' });
 *   look.render(scene, camera);          // 取代 renderer.render(scene, camera)
 *   look.setPreset('grade');             // 換風格(參數會平滑過渡;第二個參數 true = 立即)
 *   look.set({ center: 0.42 });          // 個別參數(例:移軸清晰帶跟著主角)
 *   look.enabled = false;                // 關閉 = 直接 renderer.render
 *
 * 效果(依序):場景 → HDR 緩衝(MSAA) → 光暈 → 移軸景深(畫面上下模糊,中間清晰帶)
 *   → ACES 色調映射(沿用 renderer.toneMapping / toneMappingExposure)→ 飽和/對比/暖調 → 暗角 → 顆粒/抖色 → sRGB 輸出
 *
 * 不依賴 EffectComposer,THREE 由呼叫端傳入:r128(全域 THREE)與 r160+(ES module)都能用。
 * 不需要深度緩衝(對數深度緩衝的場景也適用);緩衝大小每幀自動對齊 renderer,不用另外呼叫 setSize。
 */

/** 風格預設 —— tilt 移軸強度、band 清晰帶半高(畫面高的比例)、soft 模糊漸層寬、center 清晰帶中心(0 下緣、1 上緣)、
 *  blur 模糊半徑倍率、bloom 光暈量、threshold 光暈門檻(HDR 亮度)、saturation 飽和、contrast 對比、warmth 暖調、vignette 暗角、grain 顆粒、
 *  ao 環境光遮蔽強度(需 opts.ao)。threshold 以 HDR 線性亮度計(曝光前);白天/室內被直射的淺色表面常超過 2,夜景再調低(約 0.8) */
export const LOOK_PRESETS = {
    // 微縮模型:俯視/空拍/展示台,強移軸 + 飽和
    diorama: { tilt: 1, band: 0.1, soft: 0.3, center: 0.5, blur: 1.5, bloom: 0.3, threshold: 2.4, saturation: 1.12, contrast: 1.07, warmth: 0.035, vignette: 0.55, grain: 0.03, ao: 0.9 },
    // 遊戲盤面:清晰帶寬,只模糊盤面外的上下緣
    board: { tilt: 0.9, band: 0.3, soft: 0.22, center: 0.5, blur: 0.9, bloom: 0.25, threshold: 2.2, saturation: 1.16, contrast: 1.06, warmth: 0.03, vignette: 0.45, grain: 0.025, ao: 0.8 },
    // 第三人稱/車外追蹤:輕移軸
    soft: { tilt: 0.7, band: 0.22, soft: 0.3, center: 0.5, blur: 0.8, bloom: 0.25, threshold: 2.2, saturation: 1.12, contrast: 1.04, warmth: 0.025, vignette: 0.42, grain: 0.025, ao: 0.8 },
    // 第一人稱/室內:不移軸,只做調色、光暈、暗角
    grade: { tilt: 0, band: 0.3, soft: 0.3, center: 0.5, blur: 1, bloom: 0.2, threshold: 2.2, saturation: 1.07, contrast: 1.03, warmth: 0.02, vignette: 0.32, grain: 0.02, ao: 0.7 }
};

const VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// 光暈:亮部擷取 + 4 點降採樣(柔和門檻)
const FS_BRIGHT = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTx; uniform float uThr;
varying vec2 vUv;
vec3 pick(vec2 o) {
    vec3 c = texture2D(tSrc, vUv + o * uTx).rgb;
    float l = max(c.r, max(c.g, c.b));
    float k = clamp((l - uThr * 0.85) / (uThr * 0.5 + 1e-4), 0.0, 1.0);
    return c / max(1.0, l / 4.0) * k * k;   // 壓住 HDR 高光(太陽反射)的能量,避免一小點擴成大片光暈
}
void main() { gl_FragColor = vec4((pick(vec2(-1.0)) + pick(vec2(1.0, -1.0)) + pick(vec2(-1.0, 1.0)) + pick(vec2(1.0))) * 0.25, 1.0); }`;

// 降採樣(13 點近似成 5 點)
const FS_DOWN = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTx;
varying vec2 vUv;
void main() {
    vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
    c += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTx).rgb + texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTx).rgb;
    c += texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTx).rgb + texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTx).rgb;
    gl_FragColor = vec4(c / 8.0, 1.0);
}`;

// 升採樣:本層與下一層(9 點帳篷濾波)各半混合 → 各層權重 1/2、1/4…,總能量維持 1
const FS_UP = /* glsl */`
uniform sampler2D tBase; uniform sampler2D tLow; uniform vec2 uTx;
varying vec2 vUv;
void main() {
    vec3 l = texture2D(tLow, vUv).rgb * 4.0;
    l += (texture2D(tLow, vUv + vec2(-uTx.x, 0.0)).rgb + texture2D(tLow, vUv + vec2(uTx.x, 0.0)).rgb
        + texture2D(tLow, vUv + vec2(0.0, -uTx.y)).rgb + texture2D(tLow, vUv + vec2(0.0, uTx.y)).rgb) * 2.0;
    l += texture2D(tLow, vUv - uTx).rgb + texture2D(tLow, vUv + uTx).rgb
        + texture2D(tLow, vUv + vec2(uTx.x, -uTx.y)).rgb + texture2D(tLow, vUv + vec2(-uTx.x, uTx.y)).rgb;
    gl_FragColor = vec4(mix(texture2D(tBase, vUv).rgb, l / 16.0, 0.5), 1.0);
}`;

// 景深模糊:單向 9 點高斯(uDir 決定方向與步距)
const FS_BLUR = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uDir;
varying vec2 vUv;
void main() {
    vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270;
    c += (texture2D(tSrc, vUv + uDir * 1.3846154).rgb + texture2D(tSrc, vUv - uDir * 1.3846154).rgb) * 0.3162162;
    c += (texture2D(tSrc, vUv + uDir * 3.2307692).rgb + texture2D(tSrc, vUv - uDir * 3.2307692).rgb) * 0.0702703;
    gl_FragColor = vec4(c, 1.0);
}`;

// 環境光遮蔽(SSAO):由深度重建視空間位置與法線,12 點螺旋取樣(半解析度)
const FS_AO = /* glsl */`
uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear, uFar, uTanY, uAspect, uRadius;
varying vec2 vUv;
float viewZ(float d) { return (uNear * uFar) / ((uFar - uNear) * d - uFar); }
vec3 viewPos(vec2 uv) { float z = viewZ(texture2D(tDepth, uv).x); return vec3((uv * 2.0 - 1.0) * vec2(uTanY * uAspect, uTanY) * -z, z); }
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() {
    float d = texture2D(tDepth, vUv).x;
    if (d >= 0.99999) { gl_FragColor = vec4(1.0, -viewZ(d), 0.0, 1.0); return; }
    vec2 px = 1.0 / uRes;
    vec3 P = viewPos(vUv);
    vec3 Pr = viewPos(vUv + vec2(px.x, 0.0)), Pl = viewPos(vUv - vec2(px.x, 0.0));
    vec3 Pt = viewPos(vUv + vec2(0.0, px.y)), Pb = viewPos(vUv - vec2(0.0, px.y));
    vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
    vec3 dy = abs(Pt.z - P.z) < abs(P.z - Pb.z) ? Pt - P : P - Pb;
    vec3 N = normalize(cross(dx, dy));
    float rad = min(uRadius / (-P.z * uTanY * 2.0), 0.12);
    float ang = hash(gl_FragCoord.xy) * 6.2831853;
    float occ = 0.0;
    for (int i = 0; i < 12; i++) {
        float t = (float(i) + 0.5) / 12.0;
        float a = ang + t * 18.849556;
        vec3 v = viewPos(vUv + vec2(cos(a) / uAspect, sin(a)) * t * rad) - P;
        float vv = dot(v, v);
        occ += max(0.0, 1.0 - vv / (uRadius * uRadius)) * max(0.0, dot(v, N) / sqrt(vv + 1e-6) - 0.08);
    }
    gl_FragColor = vec4(clamp(1.0 - occ / 12.0 * 2.2, 0.0, 1.0), -P.z, 0.0, 1.0);
}`;

// AO 去雜訊:依深度加權的 5×5 模糊
const FS_AOBLUR = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTx;
varying vec2 vUv;
void main() {
    vec2 c = texture2D(tSrc, vUv).rg;
    float s = 0.0, w = 0.0;
    for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
        vec2 o = texture2D(tSrc, vUv + vec2(float(i), float(j)) * uTx).rg;
        float ww = exp(-abs(o.g - c.g) / max(c.g * 0.03, 1e-3));
        s += o.r * ww; w += ww;
    }
    gl_FragColor = vec4(s / w, c.g, 0.0, 1.0);
}`;

// 合成:移軸混合 → AO → 光暈 → ACES → 調色 → 暗角 → sRGB → 顆粒
const FS_COMP = /* glsl */`
uniform sampler2D tScene; uniform sampler2D tBlur; uniform sampler2D tBloom; uniform sampler2D tAO;
uniform float uTilt, uBand, uSoft, uCenter, uBloom, uExposure, uSat, uContrast, uWarm, uVig, uGrain, uTime, uAspect, uAO;
uniform int uTone; uniform int uSrgb; uniform int uUseBlur; uniform int uUseBloom; uniform int uUseAO; uniform int uFxaa; uniform vec2 uPx;
varying vec2 vUv;
// FXAA(簡化版):沒有 MSAA 時在合成階段柔化鋸齒邊緣;亮度以 x/(1+x) 壓縮 HDR 後判斷
float fxLuma(vec3 c) { c = c / (1.0 + c); return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 fxaa(vec2 uv) {
    vec3 nw = texture2D(tScene, uv + vec2(-1.0, -1.0) * uPx).rgb, ne = texture2D(tScene, uv + vec2(1.0, -1.0) * uPx).rgb;
    vec3 sw = texture2D(tScene, uv + vec2(-1.0, 1.0) * uPx).rgb, se = texture2D(tScene, uv + vec2(1.0, 1.0) * uPx).rgb;
    vec3 m = texture2D(tScene, uv).rgb;
    float lNW = fxLuma(nw), lNE = fxLuma(ne), lSW = fxLuma(sw), lSE = fxLuma(se), lM = fxLuma(m);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    if (lMax - lMin < max(0.0312, lMax * 0.125)) return m;
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
    float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
    dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * uPx;
    vec3 a = 0.5 * (texture2D(tScene, uv - dir / 6.0).rgb + texture2D(tScene, uv + dir / 6.0).rgb);
    vec3 b = a * 0.5 + 0.25 * (texture2D(tScene, uv - dir * 0.5).rgb + texture2D(tScene, uv + dir * 0.5).rgb);
    float lb = fxLuma(b);
    return (lb < lMin || lb > lMax) ? a : b;
}
vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 color) {
    const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    color *= uExposure / 0.6;
    color = ACESOutputMat * RRTAndODTFit(ACESInputMat * color);
    return clamp(color, 0.0, 1.0);
}
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() {
    vec3 c = uFxaa == 1 ? fxaa(vUv) : texture2D(tScene, vUv).rgb;
    if (uUseAO == 1) c *= mix(1.0, texture2D(tAO, vUv).r, uAO);
    if (uUseBlur == 1) {
        float d = abs(vUv.y - uCenter);
        float coc = smoothstep(uBand, uBand + uSoft, d) * uTilt;
        c = mix(c, texture2D(tBlur, vUv).rgb, coc);
    }
    if (uUseBloom == 1) c += texture2D(tBloom, vUv).rgb * uBloom;
    c = uTone == 1 ? aces(c) : clamp(c * uExposure, 0.0, 1.0);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = max(mix(vec3(l), c, uSat), 0.0);
    c *= vec3(1.0 + uWarm, 1.0 + uWarm * 0.25, 1.0 - uWarm);
    vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
    c *= 1.0 - dot(q, q) / (0.25 * uAspect * uAspect + 0.25) * uVig * 0.6;   // 四角暗化 = vignette × 0.6
    if (uSrgb == 1) c = toSrgb(clamp(c, 0.0, 1.0));
    c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
    float n = hash(gl_FragCoord.xy + fract(uTime * 7.31) * 173.0) - 0.5;
    c += n * (uGrain * (1.0 - l * 0.6) + 1.5 / 255.0);
    gl_FragColor = vec4(c, 1.0);
}`;

/**
 * @param {object} THREE three.js 命名空間(ES module 的 import * as THREE,或 r128 的全域 THREE)
 * @param {object} renderer WebGLRenderer
 * @param {{ preset?: string, samples?: number, res?: number, bloom?: boolean, ao?: boolean, aoRadius?: number }} opts
 *   samples:場景緩衝的 MSAA 取樣數(預設 4;0 = 改用 FXAA,內顯省很多:半浮點 MSAA 是最吃效能的部分);res:模糊/光暈緩衝的解析度倍率(預設 1);bloom:false = 不算光暈;
 *   ao:環境光遮蔽(需 WebGL2 + 透視相機;對數深度緩衝不適用);aoRadius:遮蔽半徑(世界單位,預設 0.8)
 */
export function createMiniatureLook(THREE, renderer, opts = {}) {
    const webgl2 = renderer.capabilities.isWebGL2 !== false;
    const halfFloat = webgl2 || renderer.extensions.has('OES_texture_half_float');
    const rtOpts = {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
        type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false
    };
    const makeRT = (depth, samples, depthTex) => {
        const o = { ...rtOpts, depthBuffer: depth };
        // r128 用 WebGLMultisampleRenderTarget;r138+ 的 WebGLRenderTarget 直接吃 samples
        const Ctor = samples && webgl2 && THREE.WebGLMultisampleRenderTarget ? THREE.WebGLMultisampleRenderTarget : THREE.WebGLRenderTarget;
        const rt = new Ctor(1, 1, samples && webgl2 ? { ...o, samples } : o);
        if (samples && webgl2) rt.samples = samples;
        if (depthTex) { rt.depthTexture = new THREE.DepthTexture(1, 1); rt.depthTexture.type = THREE.UnsignedIntType; }
        rt.texture.generateMipmaps = false;
        return rt;
    };
    let samples = opts.samples == null ? 4 : opts.samples;
    const aoOK = webgl2 && !!THREE.DepthTexture && !renderer.capabilities.logarithmicDepthBuffer;
    let aoOn = !!opts.ao && aoOK;
    let sceneRT = makeRT(true, samples, aoOn);
    const aoA = makeRT(false), aoB = makeRT(false);
    const blurA = makeRT(false), blurB = makeRT(false);
    const bloomD = [makeRT(false), makeRT(false), makeRT(false), makeRT(false)];
    const bloomU = [makeRT(false), makeRT(false), makeRT(false)];

    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    quad.frustumCulled = false;
    quadScene.add(quad);
    const mat = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    const v2 = () => ({ value: new THREE.Vector2() });
    const M = {
        bright: mat(FS_BRIGHT, { tSrc: { value: null }, uTx: v2(), uThr: { value: 1 } }),
        down: mat(FS_DOWN, { tSrc: { value: null }, uTx: v2() }),
        up: mat(FS_UP, { tBase: { value: null }, tLow: { value: null }, uTx: v2() }),
        blur: mat(FS_BLUR, { tSrc: { value: null }, uDir: v2() }),
        ao: mat(FS_AO, { tDepth: { value: null }, uRes: v2(), uNear: { value: 0.1 }, uFar: { value: 100 }, uTanY: { value: 1 }, uAspect: { value: 1 }, uRadius: { value: 0.8 } }),
        aoBlur: mat(FS_AOBLUR, { tSrc: { value: null }, uTx: v2() }),
        comp: mat(FS_COMP, {
            tScene: { value: null }, tBlur: { value: null }, tBloom: { value: null }, tAO: { value: null }, uAO: { value: 0 }, uUseAO: { value: 0 },
            uTilt: { value: 0 }, uBand: { value: 0.2 }, uSoft: { value: 0.3 }, uCenter: { value: 0.5 }, uBloom: { value: 0 },
            uExposure: { value: 1 }, uSat: { value: 1 }, uContrast: { value: 1 }, uWarm: { value: 0 }, uVig: { value: 0 },
            uGrain: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 },
            uTone: { value: 1 }, uSrgb: { value: 1 }, uUseBlur: { value: 0 }, uUseBloom: { value: 0 }, uFxaa: { value: 0 }, uPx: v2()
        })
    };
    const pass = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); };

    const cur = { ...LOOK_PRESETS[opts.preset] || LOOK_PRESETS.diorama };
    let aoRadius = opts.aoRadius || 0.8;
    const goal = { ...cur };
    const size = new THREE.Vector2();
    let W = 0, H = 0, lastT = 0;

    function fit() {
        renderer.getDrawingBufferSize(size);
        const w = Math.max(1, Math.floor(size.x)), h = Math.max(1, Math.floor(size.y));
        if (w === W && h === H) return;
        W = w; H = h;
        sceneRT.setSize(w, h);
        const r = look.res;
        const bw = Math.max(1, Math.round(w / 2 * r)), bh = Math.max(1, Math.round(h / 2 * r));
        blurA.setSize(bw, bh); blurB.setSize(bw, bh);
        aoA.setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2))); aoB.setSize(aoA.width, aoA.height);
        bloomD.forEach((rt, i) => rt.setSize(Math.max(1, bw >> i), Math.max(1, bh >> i)));
        bloomU.forEach((rt, i) => rt.setSize(Math.max(1, bw >> i), Math.max(1, bh >> i)));
    }

    const look = {
        enabled: true,
        res: opts.res || 1,
        bloomEnabled: opts.bloom !== false,
        /** 目前(過渡中)的參數 */
        params: cur,
        preset: opts.preset || 'diorama',
        /** 換預設;instant = 不過渡 */
        setPreset(name, instant) {
            const p = LOOK_PRESETS[name];
            if (!p) return look;
            look.preset = name;
            Object.assign(goal, p);
            if (instant) Object.assign(cur, p);
            return look;
        },
        /** 調整個別參數(會成為過渡目標;instant = 立即) */
        set(p, instant) { Object.assign(goal, p); if (instant) Object.assign(cur, p); return look; },
        /** 改變 MSAA 取樣數(畫質切換用) */
        setSamples(n) {
            if (n === samples) return look;
            samples = n;
            sceneRT.dispose();
            sceneRT = makeRT(true, samples, aoOn);
            W = H = 0;
            return look;
        },
        /** 開關環境光遮蔽;radius = 遮蔽半徑(世界單位) */
        setAO(on, radius) {
            if (radius) aoRadius = radius;
            on = !!on && aoOK;
            if (on !== aoOn) { aoOn = on; sceneRT.dispose(); sceneRT = makeRT(true, samples, aoOn); W = H = 0; }
            return look;
        },
        get aoSupported() { return aoOK; },
        setResolution(r) { if (r !== look.res) { look.res = r; W = H = 0; } return look; },
        render(scene, camera) {
            if (!look.enabled) { renderer.render(scene, camera); return; }
            const now = performance.now() / 1000;
            const dt = lastT ? Math.min(0.1, now - lastT) : 1;
            lastT = now;
            const k = 1 - Math.exp(-dt * 5);
            for (const key in goal) cur[key] += (goal[key] - cur[key]) * k;
            fit();

            const prevTarget = renderer.getRenderTarget();
            const prevTone = renderer.toneMapping;
            const prevAuto = renderer.autoClear;
            // 場景以線性 HDR 畫進緩衝,色調映射與 sRGB 由合成階段處理
            renderer.toneMapping = THREE.NoToneMapping;
            renderer.autoClear = true;
            renderer.setRenderTarget(sceneRT);
            renderer.render(scene, camera);

            const useAO = aoOn && camera.isPerspectiveCamera && cur.ao > 0.01;
            if (useAO) {
                const a = M.ao.uniforms;
                a.tDepth.value = sceneRT.depthTexture;
                a.uRes.value.set(aoA.width, aoA.height);
                a.uNear.value = camera.near; a.uFar.value = camera.far;
                a.uTanY.value = Math.tan(camera.fov * Math.PI / 360) / (camera.zoom || 1); a.uAspect.value = camera.aspect;
                a.uRadius.value = aoRadius;
                pass(M.ao, aoA);
                M.aoBlur.uniforms.tSrc.value = aoA.texture;
                M.aoBlur.uniforms.uTx.value.set(1 / aoA.width, 1 / aoA.height);
                pass(M.aoBlur, aoB);
                M.comp.uniforms.tAO.value = aoB.texture;
            }
            const useBlur = cur.tilt > 0.01;
            if (useBlur) {
                M.down.uniforms.tSrc.value = sceneRT.texture;
                M.down.uniforms.uTx.value.set(0.5 / W, 0.5 / H);
                pass(M.down, blurA);
                const bw = blurA.width, bh = blurA.height, s = cur.blur * look.res;
                const dirs = [[1, 0, 1], [0, 1, 1], [1, 0, 2.2], [0, 1, 2.2]];
                let src = blurA, dst = blurB;
                for (const [x, y, step] of dirs) {
                    M.blur.uniforms.tSrc.value = src.texture;
                    M.blur.uniforms.uDir.value.set(x * step * s / bw, y * step * s / bh);
                    pass(M.blur, dst);
                    [src, dst] = [dst, src];
                }
                M.comp.uniforms.tBlur.value = src.texture;
            }
            const useBloom = look.bloomEnabled && cur.bloom > 0.005;
            if (useBloom) {
                M.bright.uniforms.tSrc.value = sceneRT.texture;
                M.bright.uniforms.uTx.value.set(0.5 / W, 0.5 / H);
                M.bright.uniforms.uThr.value = cur.threshold;
                pass(M.bright, bloomD[0]);
                for (let i = 1; i < bloomD.length; i++) {
                    M.down.uniforms.tSrc.value = bloomD[i - 1].texture;
                    M.down.uniforms.uTx.value.set(1 / bloomD[i - 1].width, 1 / bloomD[i - 1].height);
                    pass(M.down, bloomD[i]);
                }
                let low = bloomD[bloomD.length - 1];
                for (let i = bloomU.length - 1; i >= 0; i--) {
                    M.up.uniforms.tBase.value = bloomD[i].texture;
                    M.up.uniforms.tLow.value = low.texture;
                    M.up.uniforms.uTx.value.set(1 / low.width, 1 / low.height);
                    pass(M.up, bloomU[i]);
                    low = bloomU[i];
                }
                M.comp.uniforms.tBloom.value = bloomU[0].texture;
            }

            const u = M.comp.uniforms;
            u.tScene.value = sceneRT.texture;
            u.uTilt.value = cur.tilt; u.uBand.value = cur.band; u.uSoft.value = Math.max(0.01, cur.soft); u.uCenter.value = cur.center;
            u.uBloom.value = cur.bloom; u.uSat.value = cur.saturation; u.uContrast.value = cur.contrast; u.uWarm.value = cur.warmth;
            u.uVig.value = cur.vignette; u.uGrain.value = cur.grain; u.uTime.value = now; u.uAspect.value = W / H;
            u.uExposure.value = renderer.toneMappingExposure;
            u.uTone.value = prevTone === THREE.NoToneMapping ? 0 : 1;
            u.uSrgb.value = renderer.outputColorSpace !== undefined
                ? (renderer.outputColorSpace === 'srgb' ? 1 : 0)
                : (renderer.outputEncoding === THREE.sRGBEncoding ? 1 : 0);
            u.uUseBlur.value = useBlur ? 1 : 0;
            u.uUseBloom.value = useBloom ? 1 : 0;
            u.uUseAO.value = useAO ? 1 : 0; u.uAO.value = cur.ao || 0;
            u.uFxaa.value = samples && webgl2 ? 0 : 1; u.uPx.value.set(1 / W, 1 / H);
            pass(M.comp, prevTarget);

            renderer.toneMapping = prevTone;
            renderer.autoClear = prevAuto;
        },
        dispose() {
            [sceneRT, aoA, aoB, blurA, blurB, ...bloomD, ...bloomU].forEach(rt => rt.dispose());
            Object.values(M).forEach(m => m.dispose());
            quad.geometry.dispose();
        }
    };
    return look;
}

// =====================================================================
//  材質精修:讓程序化/低多邊形模型不再有「塑膠感」
// =====================================================================

/** 依材質名稱分類(rail-assets 的材質命名契約 + 一般常見命名) */
const KIND_RULES = [
    ['skip', /HeadLight|TailLight|Screen|DestLED|LED|Signal(Red|Green)|LampHead|LightPanel|WindowLit|ShopSign|StopFace|LimitFace|CeilingLight|_opacity|Btn|emissive|neon|fire|flame|smoke|sky/i],
    ['glass', /glass|windshield|^Window$|_window|curtainwall|vitre/i],
    ['skin', /_head$|_body$(?<=^[fm]\d{3}_body)|skin|face|hair/i],
    ['foliage', /leaves|leaf|foliage|grass|bark|shrub|tree/i],
    ['rubber', /rubber|tire|tyre|wheel_rubber|gasket/i],
    ['metal', /steel|metal|wheel|bogie|coupler|pantograph|pole|alumin|iron|chrome|stainless|rail|_grip|_rack|seat_frame|doorframe|lever|insulator|trash_can|utility_box|camera|lamp|mast/i],
    ['paint', /_body|_front|_door|_stripe|_roof|_cover|_under_front|_part|aircon|hydrant|payphone|accent|car|bus|vehicle|paint|shutter/i],
    ['rough', /concrete|plaster|tile|facade|asphalt|road|ballast|stone|brick|wall|floor|ground|platform|tactile|barrier|pier|tunnel|ceiling|roof|tower|wood|timber/i]
];

/** 各類別的處理:physical 轉成 MeshPhysicalMaterial;rough 粗糙度變化幅度;bump 微凹凸高度(公尺);freq 紋理頻率(每公尺) */
const KIND_FX = {
    glass: { physical: true, clearcoat: 1, clearcoatRoughness: 0.02, roughness: [0, 0.06], metalness: [0, 0], env: 1.35, rough: 0.15, bump: 0, freq: 1.2 },
    paint: { physical: true, clearcoat: 0.7, clearcoatRoughness: 0.14, roughness: [0.28, 0.55], env: 1, rough: 0.45, bump: 0.0004, freq: 1.6 },
    metal: { roughness: [0.22, 0.5], metalnessMin: 0.75, env: 1.05, rough: 0.6, bump: 0.0006, freq: 3, brushed: true },
    rough: { roughness: [0.7, 1], metalnessMax: 0.1, env: 0.9, rough: 0.35, bump: 0.006, freq: 2.2 },
    rubber: { roughness: [0.75, 1], env: 0.6, rough: 0.2, bump: 0.001, freq: 6 },
    foliage: { roughness: [0.6, 0.95], env: 0.7, rough: 0.25, bump: 0, freq: 2 },
    skin: { roughness: [0.5, 0.8], env: 0.8, rough: 0.2, bump: 0, freq: 4 },
    other: { roughness: [0.3, 1], env: 1, rough: 0.35, bump: 0.002, freq: 2 }
};

const NOISE_GLSL = /* glsl */`
varying vec3 vRfPos;
float rfHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rfNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(rfHash(i), rfHash(i + vec3(1, 0, 0)), f.x), mix(rfHash(i + vec3(0, 1, 0)), rfHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(rfHash(i + vec3(0, 0, 1)), rfHash(i + vec3(1, 0, 1)), f.x), mix(rfHash(i + vec3(0, 1, 1)), rfHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float rfFbm(vec3 p) { return rfNoise(p) * 0.55 + rfNoise(p * 2.7 + 13.1) * 0.3 + rfNoise(p * 7.3 + 41.7) * 0.15; }`;

function patchShader(m, fx) {
    const freq = fx.freq.toFixed(3), rough = fx.rough.toFixed(3), bump = fx.bump.toFixed(5);
    const brushed = fx.brushed ? 'vec3(1.0, 1.0, 14.0)' : 'vec3(1.0)';
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
        if (prev) prev.call(m, sh, r);
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vRfPos;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRfPos = transformed;');
        let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + NOISE_GLSL);
        // 粗糙度:大尺度(污漬、使用痕跡)+ 小尺度(表面紋理)的變化;金屬為拉絲方向性
        fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
    float rfN = rfFbm(vRfPos * ${freq} * ${brushed});
    roughnessFactor = clamp(roughnessFactor * (1.0 + (rfN - 0.5) * ${rough} * 2.0), 0.02, 1.0);`);
        // 微凹凸:以程序化高度場擾動法線(不需要 UV)
        if (fx.bump > 0) fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
    {
        float rfH = rfFbm(vRfPos * ${freq} * 6.0) * ${bump};
        vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
        vec3 R1 = cross(sY, normal), R2 = cross(normal, sX);
        float det = dot(sX, R1);
        vec3 grad = sign(det) * (dFdx(rfH) * R1 + dFdy(rfH) * R2);
        if (abs(det) > 1e-12) normal = normalize(abs(det) * normal - grad);
    }`);
        sh.fragmentShader = fs;
    };
    const prevKey = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
    m.customProgramCacheKey = () => prevKey() + `|rf${freq}${rough}${bump}${fx.brushed ? 'b' : ''}`;
}

function toPhysical(THREE, m) {
    const p = new THREE.MeshPhysicalMaterial();
    THREE.MeshStandardMaterial.prototype.copy.call(p, m);
    p.type = 'MeshPhysicalMaterial';
    p.defines = { STANDARD: '', PHYSICAL: '' };
    return p;
}

/**
 * 精修場景(或模型)內的 MeshStandardMaterial:依材質名稱分類套用
 *   烤漆 → 透明清漆(車體、招牌鐵件);玻璃 → 低粗糙度高反射;金屬 → 拉絲粗糙度紋理;混凝土/外牆 → 微凹凸
 * 並加上程序化的粗糙度變化,避免整片均勻的塑膠感。同一材質只處理一次(共用材質仍共用)。
 * @param {object} THREE
 * @param {object} root Object3D
 * @param {{ classify?: (name:string, m:object) => string|null, physical?: boolean, envScale?: number }} opts
 *   classify:自訂分類(回傳 glass/paint/metal/rough/rubber/foliage/skin/other/skip,null = 用預設規則);
 *   physical:false = 不轉 MeshPhysicalMaterial(低畫質省效能);envScale:環境反射強度倍率
 * @returns {number} 處理的材質數
 */
export function refineMaterials(THREE, root, opts = {}) {
    let n = 0;
    const physical = opts.physical !== false && !!THREE.MeshPhysicalMaterial;
    const swap = (m) => {
        if (!m || !m.isMeshStandardMaterial) return m;
        if (m.userData.rfTo) return m.userData.rfTo;
        if (m.userData.rfDone) return m;
        const name = m.name || '';
        let kind = opts.classify ? opts.classify(name, m) : null;
        if (!kind) {
            kind = 'other';
            for (const [k, re] of KIND_RULES) if (re.test(name)) { kind = k; break; }
        }
        if (kind === 'skip' || (m.emissiveMap && kind !== 'glass') || m.isMeshPhysicalMaterial && m.transmission > 0) { m.userData.rfDone = true; return m; }
        const fx = KIND_FX[kind] || KIND_FX.other;
        let out = m;
        if (fx.physical && physical && !m.isMeshPhysicalMaterial && !(kind === 'paint' && m.metalness > 0.6)) {
            out = toPhysical(THREE, m);
            m.userData.rfTo = out;
        }
        if (out.isMeshPhysicalMaterial && fx.clearcoat != null && !out.clearcoat) {
            out.clearcoat = fx.clearcoat;
            out.clearcoatRoughness = fx.clearcoatRoughness;
        }
        if (!m.roughnessMap) out.roughness = Math.min(fx.roughness[1], Math.max(fx.roughness[0], out.roughness));
        if (fx.metalness) out.metalness = fx.metalness[1];
        if (fx.metalnessMin && !m.metalnessMap) out.metalness = Math.max(fx.metalnessMin, out.metalness);
        if (fx.metalnessMax != null && !m.metalnessMap) out.metalness = Math.min(fx.metalnessMax, out.metalness);
        if (kind === 'glass' && out.transparent) out.opacity = Math.max(out.opacity, 0.35);
        out.envMapIntensity = (out.envMapIntensity || 1) * fx.env * (opts.envScale || 1);
        patchShader(out, fx);
        out.userData.rfDone = true;
        out.userData.rfKind = kind;
        out.needsUpdate = true;
        n++;
        return out;
    };
    root.traverse((o) => {
        if (!o.material) return;
        o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
    return n;
}
