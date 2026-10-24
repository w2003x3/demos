// ====================================================================
//  3D 渲染器 v2(three.js r128)
//  - game.js 照常執行完整遊戲模擬(2D canvas 隱藏),本檔每幀同步 3D 場景
//  - 貼圖一律取自 SVG_ATLAS(data URI):避免 file:// 下 WebGL 的 CORS 黑圖
//  - 角色 = voxel 積木模型;貢丸/道具/寵物 = Blender 寫實模型(props.glb);爆炸 = shader 火焰特效
//  - 地圖物件 = Blender 製作的寫實 GLB(Poly Haven CC0 掃描模型 + 程序化組合件),
//    PBR 材質 + HDRI 環境光 + 柔和陰影;來源/建置腳本見 tools/assets/
// ====================================================================
(function () {
  const container = document.getElementById('game3d');
  if (!container || typeof THREE === 'undefined') return;

  // ---------- 基本場景 ----------
  // ---------- 畫質 / 效能設定(省電・低・中・高・自動),記在 localStorage ----------
  //  pixel:解析度倍率  shadows:即時陰影  env:HDRI 環境光反射  decor:場外造景比例
  //  fx:爆炸特效等級(0 火焰 / 1 +煙與焦痕 / 2 +火星)  realChars:寫實人物(否則積木人)
  //  charShadow:人物投射即時陰影(陰影圖每幀重算)  lights:夜市燈籠點光源
  const QUALITY_ORDER = ['off', 'low', 'mid', 'high'];
  const QUALITY = {
    off:  { name: '省電', pixel: 0.7,  aa: false, shadows: false, env: false, decor: 0,   fx: 0, realChars: false, charShadow: false, lights: false, floorNormal: false },
    low:  { name: '低',   pixel: 0.85, aa: false, shadows: false, env: true,  decor: 0.5, fx: 1, realChars: true,  charShadow: false, lights: false, floorNormal: true },
    mid:  { name: '中',   pixel: 1,    aa: true,  shadows: true,  shadowSize: 1024, soft: false, env: true, decor: 1, fx: 2, realChars: true, charShadow: false, lights: true, floorNormal: true },
    high: { name: '高',   pixel: 2,    aa: true,  shadows: true,  shadowSize: 2048, soft: true,  env: true, decor: 1, fx: 2, realChars: true, charShadow: true,  lights: true, floorNormal: true },
  };
  let qualityPref = 'auto';
  try { qualityPref = localStorage.getItem('bbw3d_quality') || 'auto'; } catch (e) { /* 無痕模式等 */ }
  if (qualityPref !== 'auto' && !QUALITY[qualityPref]) qualityPref = 'auto';
  let qualityLevel = qualityPref === 'auto' ? 'mid' : qualityPref;
  let Q = QUALITY[qualityLevel];
  const pixelRatioFor = (q) => q.pixel >= 2 ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1) * q.pixel;
  // 抗鋸齒只能在建立 WebGL 時決定(切換畫質後,下次開啟頁面才會跟著變)
  const renderer = new THREE.WebGLRenderer({ antialias: Q.aa });
  renderer.setPixelRatio(pixelRatioFor(Q));
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  const CX = COLS / 2, CZ = ROWS / 2;
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(CX, 0, CZ);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 4;
  controls.maxDistance = 40;

  // ---------- 鏡頭模式:free(全景/俯視,可拖曳環繞)/ follow(第三人稱跟隨)/ fps(第一人稱) ----------
  let camMode = 'free';
  let followLock = false; // 跟隨:鏡頭固定朝北(和地圖同方向,不隨人物轉動)
  let fpsWide = false;    // 第一人稱:廣角(FOV 100°,方便看兩側來的貢丸)
  let smoothYaw = 0;      // 平滑後的面向角(避免 4 方向切換時鏡頭猛轉)
  let camView = 'overview';
  function setCamMode(m) {
    camMode = m;
    controls.enabled = (m === 'free'); // 跟隨/第一人稱時停用滑鼠環繞
  }
  function viewOverview() { setCamMode('free'); camera.position.set(CX, 12, CZ + 10.5); controls.target.set(CX, 0, CZ); }
  function viewTop() { setCamMode('free'); camera.position.set(CX, 17, CZ + 0.01); controls.target.set(CX, 0, CZ); }

  // 視角選單:4 種視角卡片 + 只在該視角出現的選項 + 方向鍵說明
  const CAM_NAMES = { overview: '全景', top: '俯視', follow: '跟隨', fps: '第一人稱' };
  const camPanel = document.getElementById('cam-panel');
  const camBtn = document.getElementById('cam-btn');
  function refreshCamUi() {
    const nameEl = document.getElementById('cam-name');
    if (nameEl) nameEl.textContent = CAM_NAMES[camView] + (camView === 'fps' && fpsWide ? '・廣角' : camView === 'follow' && followLock ? '・固定' : '');
    if (!camPanel) return;
    camPanel.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('active', b.dataset.cam === camView));
    camPanel.querySelectorAll('.cam-opt').forEach((o) => o.classList.toggle('hidden', o.dataset.for !== camView));
    camPanel.querySelectorAll('[data-lock]').forEach((b) => b.classList.toggle('active', (b.dataset.lock === '1') === followLock));
    camPanel.querySelectorAll('[data-wide]').forEach((b) => b.classList.toggle('active', (b.dataset.wide === '1') === fpsWide));
    const note = document.getElementById('cam-note');
    if (note) note.textContent = (camView === 'fps' || (camView === 'follow' && !followLock))
      ? '方向鍵以鏡頭前方為準:↑ 往前走' : '方向鍵 = 地圖上的上下左右' + (camView === 'overview' || camView === 'top' ? ';拖曳旋轉、滾輪縮放' : '');
  }
  function setCamView(v, save) {
    camView = CAM_NAMES[v] ? v : 'overview';
    if (camView === 'overview') viewOverview();
    else if (camView === 'top') viewTop();
    else setCamMode(camView);
    refreshCamUi();
    if (save) { try { localStorage.setItem('bbw.cam', JSON.stringify({ v: camView, lock: followLock, wide: fpsWide })); } catch (e) { /* 無痕模式 */ } }
  }
  try {
    const c = JSON.parse(localStorage.getItem('bbw.cam') || 'null');
    if (c) { followLock = !!c.lock; fpsWide = !!c.wide; camView = c.v || 'overview'; }
  } catch (e) { /* 忽略 */ }
  setCamView(camView, false);
  if (camBtn && camPanel) {
    const open = (on) => { camPanel.classList.toggle('hidden', !on); camBtn.setAttribute('aria-expanded', on ? 'true' : 'false'); };
    camBtn.addEventListener('click', (e) => { e.stopPropagation(); open(camPanel.classList.contains('hidden')); camBtn.blur(); });
    camPanel.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest && e.target.closest('button');
      if (!b) return;
      if (b.dataset.cam) setCamView(b.dataset.cam, true);
      if (b.dataset.lock) { followLock = b.dataset.lock === '1'; setCamView('follow', true); }
      if (b.dataset.wide) { fpsWide = b.dataset.wide === '1'; setCamView('fps', true); }
      b.blur();
    });
    document.addEventListener('click', () => open(false));            // 點其他地方收起
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  }

  // 角度差(取最短旋轉方向)
  const angleDelta = (from, to) => ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

  // 跟隨(會轉)/第一人稱:方向鍵改以「鏡頭前方」為基準(game.js 只在 3D 模式呼叫)
  // 用平滑後的鏡頭角量化到 90°,鏡頭轉到位前仍以舊基準,天然防止原地打轉
  window.moveTransform = (v) => {
    if (camMode === 'free' || !player || (camMode === 'follow' && followLock)) return v;
    const k = ((Math.round(smoothYaw / (Math.PI / 2)) % 4) + 4) % 4;
    const F = [[0, 1], [1, 0], [0, -1], [-1, 0]][k]; // 鏡頭前方(遊戲座標)
    const R = [-F[1], F[0]];                          // 畫面右方
    const [mx, my] = v;
    const out = [F[0] * -my + R[0] * mx, F[1] * -my + R[1] * mx];
    // 第一人稱按 ↓:倒退走,不轉身(鏡頭不迴轉)
    if (camMode === 'fps' && my === 1) out.keepFacing = true;
    return out;
  };

  // 依模式驅動鏡頭(每幀)
  const camTmp = new THREE.Vector3();
  function updateCamera() {
    // 視野角:第一人稱 72°(廣角 100°),其他模式 50°;平滑過渡
    const targetFov = camMode === 'fps' ? (fpsWide ? 100 : 72) : 50;
    if (Math.abs(camera.fov - targetFov) > 0.5) {
      camera.fov += (targetFov - camera.fov) * 0.15;
      camera.updateProjectionMatrix();
    }
    if (camMode === 'free' || !player) { controls.update(); return; }
    const tYaw = Math.atan2(player.dir.x, player.dir.y);
    // 固定方向開啟時,跟隨模式的鏡頭角不再追人物面向(第一人稱不受影響)
    const goal = camMode === 'follow' && followLock ? Math.PI : tYaw; // 固定不轉:鏡頭朝北,和地圖同方向
    smoothYaw += angleDelta(smoothYaw, goal) * 0.14;
    const px = W2(player.x), pz = W2(player.y);
    if (camMode === 'follow') {
      // 第三人稱近距離:在玩家背後斜上方,平滑追蹤
      const dist = 3.4, h = 2.3;
      camTmp.set(px - Math.sin(smoothYaw) * dist, h, pz - Math.cos(smoothYaw) * dist);
      camera.position.lerp(camTmp, 0.12);
      camera.lookAt(px, 0.7, pz);
    } else { // fps 第一人稱:視點在頭頂高度、視線微微向下(約 14°),像眼睛看出去
      camera.position.set(
        px - Math.sin(smoothYaw) * 0.1, 1.32, pz - Math.cos(smoothYaw) * 0.1);
      camera.lookAt(px + Math.sin(smoothYaw) * 4, 0.35, pz + Math.cos(smoothYaw) * 4);
    }
  }

  function resize() {
    const w = container.clientWidth || 640, h = container.clientHeight || 480;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- 畫質:ACES 色調映射 + 柔和陰影(PBR 寫實地圖) ----------
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = Q.shadows;
  renderer.shadowMap.type = Q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

  // ---------- 打光(天光 + 投影主光 + 環境 HDRI;依主題調色) ----------
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x5a4a38, 0.85); // 天空/地面反射光
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(CX + 10, 11, CZ + 5); // 斜側光:影子拉長,立體感更好
  sun.target.position.set(CX, 0, CZ);
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadowSize || 1024, Q.shadowSize || 1024);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 50 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(hemi, sun, sun.target, ambient);
  // 爆炸閃光(單一動態光源,永遠掛在最近的爆炸上)
  const boomLight = new THREE.PointLight(0xffa726, 0, 7);
  scene.add(boomLight);

  // env:PBR 物件吃環境光的強度;lantern:燈籠自發光強度
  const THEME_LIGHT = {
    park:   { bg: 0x87b8e0, hemi: 0.7,  sun: 1.5,  amb: 0.2,  sunColor: 0xffecc8, exposure: 0.9,  env: 0.85, lantern: 1.0 },
    market: { bg: 0xb9c4cc, hemi: 0.75, sun: 1.25, amb: 0.25, sunColor: 0xfff8ee, exposure: 0.95, env: 1.0,  lantern: 1.0 },
    night:  { bg: 0x0d1024, hemi: 0.32, sun: 0.38, amb: 0.2,  sunColor: 0x9db4ff, exposure: 1.15, env: 0.55, lantern: 2.2 },
  };
  let lastMapId = null;
  const pbrMats = new Set(); // 地圖用的 PBR 材質(套用主題環境光強度)
  function applyThemeLight() {
    const t = THEME_LIGHT[currentMapId] || THEME_LIGHT.park;
    const e = themeEnv(currentMapId);
    scene.background = e.bg || new THREE.Color(t.bg);
    scene.environment = Q.env ? (e.env || null) : null;
    hemi.intensity = t.hemi + (Q.env ? 0 : 0.25);     // 關掉環境反射時補一點天光
    sun.intensity = t.sun;
    sun.color.set(t.sunColor);
    ambient.intensity = t.amb + (Q.env ? 0 : 0.15);
    renderer.toneMappingExposure = t.exposure;
    for (const m of pbrMats) {
      m.envMapIntensity = t.env;
      if (m.userData.glow) m.emissiveIntensity = t.lantern * m.userData.glow;
    }
    lastMapId = currentMapId;
  }

  // ---------- 貼圖(data URI 圖集 → WebGL 安全) ----------
  const texLoader = new THREE.TextureLoader();
  const texCache = new Map();
  function tex(path) {
    if (!texCache.has(path)) {
      const src = (typeof SVG_ATLAS !== 'undefined' && SVG_ATLAS[path])
        ? SVG_ATLAS[path] : 'assets/' + path + '.svg';
      const t = texLoader.load(src);
      // 平滑卡通貼圖(不再是 8-bit 像素風,改用線性過濾避免鋸齒)
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.encoding = THREE.sRGBEncoding;
      texCache.set(path, t);
    }
    return texCache.get(path);
  }
  const matCache = new Map();
  function colorMat(c) {
    const key = 'c:' + c;
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color: c }));
    return matCache.get(key);
  }

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const ballGeo = new THREE.SphereGeometry(0.5, 20, 16);
  const smallBall = new THREE.SphereGeometry(0.5, 10, 8);
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const coneGeo = new THREE.ConeGeometry(0.5, 1, 10);
  const ringGeo = new THREE.RingGeometry(0.3, 0.44, 20);

  // 積木小幫手:在 parent 裡放一顆縮放過的 box
  function V(parent, w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(boxGeo, colorMat(color));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  // ---------- 環境 HDRI(Poly Haven CC0):背景天空 + PBR 反射/環境光 ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envCache = {};
  function themeEnv(id) {
    if (envCache[id]) return envCache[id];
    const e = envCache[id] = { bg: null, env: null };
    if (typeof MAP_TEX === 'undefined' || !MAP_TEX[id + '_env']) return e;
    texLoader.load(MAP_TEX[id + '_env'], (t) => {
      t.encoding = THREE.sRGBEncoding;
      t.mapping = THREE.EquirectangularReflectionMapping;
      e.env = pmrem.fromEquirectangular(t).texture;
      // 背景用調暗、略模糊的版本(原圖經 ACES 後太亮,夜市尤其刺眼);反射光仍用原圖
      const BG_LOOK = { park: 'brightness(0.92) blur(1px)', market: 'brightness(0.78) blur(1.5px)', night: 'brightness(0.42) saturate(0.85) blur(1.5px)' };
      let bgTex = t;
      try {
        const cv = document.createElement('canvas');
        cv.width = t.image.width; cv.height = t.image.height;
        const g = cv.getContext('2d');
        g.filter = BG_LOOK[id] || 'none';
        g.drawImage(t.image, 0, 0);
        bgTex = new THREE.CanvasTexture(cv);
        bgTex.encoding = THREE.sRGBEncoding;
        bgTex.mapping = THREE.EquirectangularReflectionMapping;
      } catch (err) { /* 舊瀏覽器沒有 canvas filter:直接用原圖 */ }
      e.bg = new THREE.WebGLCubeRenderTarget(1024).fromEquirectangularTexture(renderer, bgTex).texture;
      if (currentMapId === id) applyThemeLight();
    });
    return e;
  }

  // ---------- 地板:PBR 貼圖(漫射/法線/ARM)+ 場內棋盤格、場外略暗 ----------
  const FLOOR_REPEAT = { park: 2.6, market: 2, night: 3 }; // 一張貼圖覆蓋幾格
  const FLOOR_TINT = { park: 0xb4d98a, market: 0xffffff, night: 0xd8d8e0 }; // 公園草地偏綠
  const floorMats = {};
  function floorMaterial(id) {
    if (floorMats[id]) return floorMats[id];
    const has = typeof MAP_TEX !== 'undefined' && MAP_TEX[id + '_diff'];
    const SIZE = 80;
    const rep = SIZE / (FLOOR_REPEAT[id] || 2);
    const load = (k, srgb) => {
      const t = texLoader.load(MAP_TEX[id + '_' + k]);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep);
      t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      if (srgb) t.encoding = THREE.sRGBEncoding;
      return t;
    };
    const m = has
      ? new THREE.MeshStandardMaterial({
        map: load('diff', true), normalMap: Q.floorNormal ? load('nor') : null, roughnessMap: load('arm'),
        metalnessMap: load('arm'), aoMap: load('arm'), roughness: 1, metalness: 1, color: FLOOR_TINT[id] || 0xffffff })
      : new THREE.MeshStandardMaterial({ color: 0x7a8f5a, roughness: 1 });
    // 棋盤格(只在場內)用 shader 依世界座標調暗相間格子,地板仍是一整張無接縫貼圖
    const checker = id === 'market' ? 0.06 : 0.1;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uBoard = { value: new THREE.Vector4(0, 0, COLS, ROWS) };
      sh.uniforms.uCheck = { value: checker };
      sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vWPos;\nuniform vec4 uBoard;\nuniform float uCheck;\n' +
        sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  {
    float inB = step(uBoard.x, vWPos.x) * step(vWPos.x, uBoard.z) * step(uBoard.y, vWPos.z) * step(vWPos.z, uBoard.w);
    float ck = mod(floor(vWPos.x) + floor(vWPos.z), 2.0);
    diffuseColor.rgb *= (1.0 - inB * ck * uCheck) * mix(0.8, 1.0, inB);
  }`);
    };
    if (has) m.userData.normalSrc = () => load('nor');
    pbrMats.add(m);
    floorMats[id] = { mat: m, size: SIZE };
    return floorMats[id];
  }
  function makeFloor(id) {
    const f = floorMaterial(id);
    const geo = new THREE.PlaneGeometry(f.size, f.size);
    geo.setAttribute('uv2', geo.attributes.uv); // aoMap 需要第二組 UV
    const mesh = new THREE.Mesh(geo, f.mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(CX, 0, CZ);
    mesh.receiveShadow = true;
    mesh.userData.noFade = true;
    return mesh;
  }

  // ---------- 地圖 3D 物件庫(Blender 製作的 GLB,每主題一檔) ----------
  // 節點名稱:wall / pillar / brick / trash / bush(可有 _a/_b/_c 變體)+ 造景
  const mapLib = {};
  let needRebuild = false;
  let propsJustLoaded = false;
  let charsJustLoaded = false;
  function loadMapLib(id) {
    if (mapLib[id]) return mapLib[id];
    const lib = mapLib[id] = { ready: false, failed: false, nodes: {} };
    const b64 = (typeof MAP_GLB !== 'undefined' && MAP_GLB[id]) || (typeof CHAR_GLB !== 'undefined' && CHAR_GLB[id]) ||
      (typeof EXTRA_GLB !== 'undefined' && EXTRA_GLB[id]);
    if (!b64 || !THREE.GLTFLoader) { lib.failed = true; return lib; }
    try {
      const str = atob(b64);
      const u8 = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i);
      new THREE.GLTFLoader().parse(u8.buffer, '', (gltf) => {
        for (const n of gltf.scene.children.slice()) { prepModel(n); lib.nodes[n.name] = n; }
        lib.animations = gltf.animations || [];
        lib.ready = true;
        if (currentMapId === id) needRebuild = true;
        if (id === 'chars' || id === 'anims') charsJustLoaded = true; // 積木人換成寫實人物
        if (id === 'props' || id === 'extra') propsJustLoaded = true; // 先前用替代模型建立的貢丸/道具/寵物要換成正式模型
      }, (err) => {
        console.warn('地圖模型載入失敗', id, err);
        lib.failed = true;
        if (currentMapId === id) needRebuild = true;
      });
    } catch (e) { lib.failed = true; }
    return lib;
  }
  // 材質後處理:去背貼圖改 alphaTest(葉片/菜籃格孔)、葉片法線不翻面、燈籠自發光、全部投影
  function prepModel(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const m = o.material;
      if (!m || m.userData.prepped) {
        if (m && m.userData.cutout) o.customDepthMaterial = m.userData.depthMat;
        return;
      }
      m.userData.prepped = true;
      pbrMats.add(m);
      const name = (m.name || '').toLowerCase();
      const cutout = m.transparent || m.alphaTest > 0 || /leaf|fern|crate_0?2|pcrate|crate_(yellow|red|blue|green)/.test(name);
      if (cutout && m.map) {
        m.transparent = false;
        m.alphaTest = 0.5;
        m.depthWrite = true;
        m.userData.cutout = true;
        // 陰影也照貼圖鏤空(否則葉卡會投出方形影子)
        m.userData.depthMat = new THREE.MeshDepthMaterial({
          depthPacking: THREE.RGBADepthPacking, map: m.map, alphaTest: 0.5 });
        o.customDepthMaterial = m.userData.depthMat;
      }
      if (/leaf|fern/.test(name)) {
        m.side = THREE.DoubleSide;
        // 葉卡背面不翻法線 → 整叢光照一致,不會出現黑卡
        m.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
            THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
        };
      }
      if (/lantern|amber/.test(name)) {
        // 自發光燈籠不做色調映射:ACES 會把飽和的紅色壓成近白色
        m.userData.glow = name.indexOf('amber') >= 0 ? 1.2 : 0.75;
        m.toneMapped = false;
      }
    });
  }

  // 依格子座標產生穩定的亂數(同一格每次重建長相一致)
  function hash2(c, r, k) {
    let h = (c * 374761393 + r * 668265263 + (k || 0) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function variants(lib, base) {
    if (!lib.variantCache) lib.variantCache = {};
    if (!lib.variantCache[base]) {
      const re = new RegExp('^' + base + '(_[a-z])?$');
      lib.variantCache[base] = Object.keys(lib.nodes).filter((k) => re.test(k)).sort();
    }
    return lib.variantCache[base];
  }
  // clone() 不會複製 customDepthMaterial(鏤空陰影),要補上
  function cloneNode(n) {
    const o = n.clone();
    o.traverse((m) => {
      if (m.isMesh && m.material && m.material.userData.depthMat) m.customDepthMaterial = m.material.userData.depthMat;
    });
    return o;
  }
  function cloneAsset(lib, base, c, r) {
    const vs = variants(lib, base);
    if (!vs.length) return null;
    return cloneNode(lib.nodes[vs[Math.floor(hash2(c, r, 1) * vs.length)]]);
  }
  // 模型尚未載入(或失敗)時的簡易替代方塊
  const FALLBACK = { wall: [0x8b96a1, 1], pillar: [0x8b96a1, 1], brick: [0xc9985c, 0.8], trash: [0x4caf50, 0.7], bush: [0x43a047, 0.6] };
  function fallbackModel(base) {
    const [col, h] = FALLBACK[base];
    const g = new THREE.Group();
    const m = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 }));
    m.scale.set(0.9, h, 0.9); m.position.y = h / 2; m.castShadow = m.receiveShadow = true;
    g.add(m);
    return g;
  }

  // 每種格子的模型與擺放方式(旋轉/縮放變化讓地圖不會像複製貼上)
  // 回傳擺放資訊 { name, x, z, rot, sc };name = GLB 內的資產節點名稱
  function cellPlacement(t, c, r) {
    const id = currentMapId;
    const edge = c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1;
    let base, rot = 0, sc = 1;
    if (t === TILE.SOLID) {
      base = edge ? 'wall' : 'pillar';
      if (edge) {
        // 左右兩側的牆轉 90°(夜市護欄、菜籃堆順著牆的走向)
        const side = (c === 0 || c === COLS - 1) && r !== 0 && r !== ROWS - 1;
        rot = side ? Math.PI / 2 : 0;
        if (id === 'park') rot = Math.floor(hash2(c, r, 2) * 4) * Math.PI / 2; // 石牆紋理隨機轉向
      } else if (id === 'park') {
        rot = hash2(c, r, 2) * Math.PI * 2;            // 巨岩任意角度
        sc = 0.94 + hash2(c, r, 3) * 0.1;
      }
    } else if (t === TILE.BRICK) {
      base = 'brick';
      rot = Math.floor(hash2(c, r, 2) * 4) * Math.PI / 2 + (hash2(c, r, 4) - 0.5) * 0.24;
    } else if (t === TILE.TRASH) {
      base = 'trash';
      rot = hash2(c, r, 2) * Math.PI * 2;
    } else if (t === TILE.BUSH) {
      base = 'bush';
      rot = hash2(c, r, 2) * Math.PI * 2;
      sc = 0.92 + hash2(c, r, 3) * 0.14;
    } else {
      return null;
    }
    const lib = loadMapLib(id);
    const vs = lib.ready ? variants(lib, base) : [];
    const name = vs.length ? vs[Math.floor(hash2(c, r, 1) * vs.length)] : null;
    return { base, name, x: c + 0.5, z: r + 0.5, rot, sc };
  }

  // ---------- 棋盤(地板 + 地圖物件 + 場外造景) ----------
  // 效能:同一資產的所有副本合併成 InstancedMesh(每種零件只要 1 個 draw call),
  //       地圖靜態 → 陰影貼圖只在地圖變動時重算(shadowMap.autoUpdate = false)
  renderer.shadowMap.autoUpdate = false; // 畫質「高」會在下方改成每幀更新
  const boardGroup = new THREE.Group();
  scene.add(boardGroup);
  let lastGridRef = null;
  let lastBoardMap = null;
  let gridSnapshot = null;
  let placements = [];           // 所有擺放(格子 + 造景)
  const cellPlace = new Map();   // 格子 key → 擺放
  const decorLights = [];
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  function placeMatrix(p) {
    return new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot),
      new THREE.Vector3(p.sc, p.sc, p.sc));
  }
  // 資產節點 → 子網格清單(幾何、材質、相對於資產原點的矩陣)
  function assetParts(lib, name) {
    if (!lib.parts) lib.parts = {};
    if (!lib.parts[name]) {
      const root = lib.nodes[name];
      root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      const parts = [];
      root.traverse((o) => {
        if (o.isMesh) parts.push({ geo: o.geometry, mat: o.material, local: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
      });
      lib.parts[name] = parts;
    }
    return lib.parts[name];
  }
  // 單獨物件(模型未載入的替代方塊、遊戲中新出現的格子、跟隨模式的半透明替身)
  function standalone(p) {
    const lib = mapLib[currentMapId];
    const o = (p.name && lib && lib.ready) ? cloneNode(lib.nodes[p.name]) : fallbackModel(p.base);
    o.position.set(p.x, 0, p.z);
    o.rotation.y = p.rot;
    o.scale.multiplyScalar(p.sc);
    return o;
  }
  function setPlacementVisible(p, on) {
    if (p.obj) { p.obj.visible = on; return; }
    for (const [im, i, m] of p.slots) {
      im.setMatrixAt(i, on ? m : ZERO);
      im.instanceMatrix.needsUpdate = true;
    }
  }
  function removePlacement(p) {
    setPlacementVisible(p, false);
    if (p.obj) boardGroup.remove(p.obj);
    if (p.ghost) { boardGroup.remove(p.ghost); p.ghost = null; }
    p.dead = true;
  }

  // 依擺放清單建立 InstancedMesh
  function buildInstances(lib, list) {
    const byName = new Map();
    for (const p of list) {
      p.slots = [];
      if (!p.name || !lib.ready) { p.obj = standalone(p); boardGroup.add(p.obj); continue; }
      if (!byName.has(p.name)) byName.set(p.name, []);
      byName.get(p.name).push(p);
    }
    for (const [name, ps] of byName) {
      for (const part of assetParts(lib, name)) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, ps.length);
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false; // 實例散佈整張地圖,包圍球只算單一幾何會誤裁切
        if (part.mat.userData.depthMat) im.customDepthMaterial = part.mat.userData.depthMat;
        ps.forEach((p, i) => {
          const m = new THREE.Matrix4().multiplyMatrices(p.matrix, part.local);
          im.setMatrixAt(i, m);
          p.slots.push([im, i, m]);
        });
        im.instanceMatrix.needsUpdate = true;
        boardGroup.add(im);
      }
    }
  }

  // 場外造景(圍牆外):公園=藍花楹樹+草叢+岩石、菜市場=攤位+遮陽傘+菜籃、夜市=燈籠竿+攤車+桌椅
  // 鏡頭在南方(+Z)俯視,所以高的東西只放北側與東西兩側,南側只放低矮物件
  function decorPlacements(lib) {
    for (const l of decorLights) scene.remove(l);
    decorLights.length = 0;
    const out = [];
    if (!lib.ready) return out;
    let seed = 0;
    const rnd = () => hash2(seed++, 7, 9);
    const put = (base, x, z, rot, sc) => {
      const vs = variants(lib, base);
      if (vs.length) out.push({ base, name: vs[Math.floor(rnd() * vs.length)], x, z, rot: rot || 0, sc: sc || 1, decor: true });
    };
    const id = currentMapId;
    if (id === 'park') {
      for (let x = 0.5; x < COLS; x += 2.6) put('tree', x + rnd() * 0.8, -2.0 - rnd() * 1.2, rnd() * 6.3, 0.9 + rnd() * 0.25);
      for (let z = 1.5; z < ROWS; z += 3) {
        put('tree', -2.0 - rnd(), z + rnd(), rnd() * 6.3, 0.85 + rnd() * 0.3);
        put('tree', COLS + 2.0 + rnd(), z + rnd(), rnd() * 6.3, 0.85 + rnd() * 0.3);
      }
      for (let i = 0; i < 26; i++) { // 圍牆外散落草叢與小石
        const side = i % 4, u = rnd();
        const x = side < 2 ? u * COLS : (side === 2 ? -0.8 - rnd() * 2.5 : COLS + 0.8 + rnd() * 2.5);
        const z = side === 0 ? -0.8 - rnd() * 1.5 : (side === 1 ? ROWS + 0.7 + rnd() * 1.6 : u * ROWS);
        if (i % 3 === 2) put('pillar', x, z, rnd() * 6.3, 0.35 + rnd() * 0.3);
        else put('bush', x, z, rnd() * 6.3, 0.8 + rnd() * 0.5);
      }
    } else if (id === 'market') {
      for (let x = 1; x < COLS; x += 2) put('pillar', x, -1.3, 0);
      for (let z = 1.5; z < ROWS; z += 2) {
        put('pillar', -1.3, z, Math.PI / 2);
        put('pillar', COLS + 1.3, z, -Math.PI / 2);
      }
      for (let x = 2.5; x < COLS; x += 4) put('umbrella', x, -2.9, rnd() * 6.3);
      for (const x of [-2.6, COLS + 2.6]) for (let z = 3; z < ROWS; z += 4) put('umbrella', x, z, rnd() * 6.3);
      for (let x = 0.7; x < COLS; x += 1.7) put('brick', x + rnd() * 0.4, ROWS + 0.75 + rnd() * 0.3, rnd() * 0.6 - 0.3);
    } else {
      for (let x = 1.5; x < COLS; x += 3) put('lantern_pole', x, -1.1, 0);
      for (let x = 0.5; x < COLS; x += 2) put('pillar', x + 0.5, -2.5, 0);
      for (let z = 2; z < ROWS; z += 3.5) {
        put('lantern_pole', -1.1, z, Math.PI / 2);
        put('lantern_pole', COLS + 1.1, z, Math.PI / 2);
        put('pillar', -2.4, z + 1.2, Math.PI / 2);
        put('pillar', COLS + 2.4, z + 1.2, -Math.PI / 2);
      }
      for (let x = 1; x < COLS; x += 2.6) put('brick', x + rnd() * 0.5, ROWS + 0.9, rnd() * 0.8);
      // 燈籠暖光(只放兩盞,兼顧內顯效能)
      for (const [x, z] of (Q.lights ? [[COLS * 0.3, -1.1], [COLS * 0.7, -1.1]] : [])) {
        const l = new THREE.PointLight(0xff5a36, 1.8, 9, 2);
        l.position.set(x, 1.7, z);
        scene.add(l);
        decorLights.push(l);
      }
    }
    if (Q.decor <= 0) return [];
    if (Q.decor < 1) return out.filter((p, i) => i % 2 === 0);  // 低畫質:造景減半
    return out;
  }

  function buildBoard() {
    while (boardGroup.children.length) {
      const o = boardGroup.children[0];
      boardGroup.remove(o);
      if (o.isInstancedMesh) o.dispose && o.dispose();
    }
    cellPlace.clear();
    fadedSet.clear();
    const lib = loadMapLib(currentMapId);
    boardGroup.add(makeFloor(currentMapId));
    placements = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = cellPlacement(grid[r][c], c, r);
        if (p) { placements.push(p); cellPlace.set(r * COLS + c, p); }
      }
    }
    placements.push(...decorPlacements(lib));
    for (const p of placements) p.matrix = placeMatrix(p);
    buildInstances(lib, placements);
    gridSnapshot = grid.map((row) => row.slice());
    lastGridRef = grid;
    lastBoardMap = currentMapId;
    renderer.shadowMap.needsUpdate = true;
  }

  // 單格變動(炸掉箱子等):隱藏該格的實例;若出現新物件就用單獨模型補上
  function syncCell(c, r) {
    const key = r * COLS + c;
    const old = cellPlace.get(key);
    if (old) { removePlacement(old); cellPlace.delete(key); }
    const p = cellPlacement(grid[r][c], c, r);
    if (p) {
      p.matrix = placeMatrix(p);
      p.slots = [];
      p.obj = standalone(p);
      boardGroup.add(p.obj);
      placements.push(p);
      cellPlace.set(key, p);
    }
    renderer.shadowMap.needsUpdate = true;
  }

  function syncBoard() {
    if (grid !== lastGridRef || currentMapId !== lastBoardMap || needRebuild) {
      needRebuild = false;
      buildBoard();
      applyThemeLight();
      return;
    }
    let changed = false;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (gridSnapshot[r][c] !== grid[r][c]) {
          gridSnapshot[r][c] = grid[r][c];
          syncCell(c, r);
          changed = true;
        }
      }
    }
    if (changed) placements = placements.filter((p) => !p.dead);
    if (currentMapId !== lastMapId) applyThemeLight();
  }

  // ---------- 通用同步 ----------
  function syncSet(cache, list, create, update) {
    const seen = new Set();
    for (const obj of list) {
      seen.add(obj);
      let m = cache.get(obj);
      if (!m) { m = create(obj); scene.add(m); cache.set(obj, m); }
      update(obj, m);
    }
    for (const [obj, m] of cache) {
      if (!seen.has(obj)) { scene.remove(m); cache.delete(obj); }
    }
  }
  const W2 = (px) => px / TS;

  // ---------- 腳下柔影(角色/貢丸不投即時陰影,改用便宜的圓形漸層影子) ----------
  const blobTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
  function blobShadow(size) {
    const m = new THREE.Mesh(planeGeo, blobMat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(size, size, 1);
    m.position.y = 0.012;
    m.renderOrder = 1;
    return m;
  }

  // ---------- 道具/貢丸/寵物模型庫(Blender 製作的 props.glb) ----------
  const propsLib = loadMapLib('props');
  const extraLib = loadMapLib('extra'); // 新增的貢丸/道具(models/extra_models.js)
  function propModel(name) {
    const lib = [extraLib, propsLib].find((l) => l.ready && l.nodes[name]);
    if (!lib) return null;
    const o = cloneNode(lib.nodes[name]);
    o.traverse((c) => { if (c.isMesh) c.castShadow = false; }); // 會動的小物件改用圓形柔影
    return o;
  }
  // 發光貼圖(火花 / 光點):放射狀漸層
  function glowTexture(stops) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (const [p, c] of stops) gr.addColorStop(p, c);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  }
  const sparkTex = glowTexture([[0, 'rgba(255,255,240,1)'], [0.25, 'rgba(255,214,110,0.9)'], [0.6, 'rgba(255,120,30,0.35)'], [1, 'rgba(255,80,0,0)']]);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

  // ---------- 貢丸:寫實貢丸(各口味配料)+ 竹籤引信火花;快爆閃白、發霉變綠 ----------
  const ballCache = new Map();
  const BALL_R = { 3: 0.46, 4: 0.26, 10: 0.4, 11: 0.36, 12: 0.38, 13: 0.4 };
  // 中心離地高度(相對直徑):球 0.5;香腸/米腸/大腸包小腸是躺著的,較低
  const BALL_Y = { 11: 0.2, 12: 0.25, 13: 0.33 };

  // ---------- 新增的特殊貢丸/道具:用基本幾何組出 3D 模型 ----------
  const std = (color, rough = 0.55, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
  const sphereGeo = new THREE.SphereGeometry(0.5, 24, 16);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1);
  const coneGeo4 = new THREE.ConeGeometry(0.5, 1, 4);
  function part(geo, mat, sx, sy, sz, x, y, z) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    return mesh;
  }
  // 腸子:圓柱 + 兩端半球;axis 'z' 沿上下方向(香腸)、'x' 沿左右方向(米腸)
  function sausageBody(len, rad, color, axis) {
    const grp = new THREE.Group();
    const mat = std(color, 0.45);
    const tube = part(cylGeo, mat, rad * 2, len, rad * 2, 0, 0, 0);
    grp.add(tube);
    grp.add(part(sphereGeo, mat, rad * 2, rad * 2, rad * 2, 0, len / 2, 0));
    grp.add(part(sphereGeo, mat, rad * 2, rad * 2, rad * 2, 0, -len / 2, 0));
    if (axis === 'z') grp.rotation.x = Math.PI / 2; else grp.rotation.z = Math.PI / 2;
    grp.userData.mat = mat;
    grp.userData.tube = tube;
    return grp;
  }
  function fuseTip(g, x, y, z) { // g:customMeatball 內層群組
    const wick = part(cylGeo, std(0x8d6e63, 0.8), 0.05, 0.22, 0.05, x, y, z);
    wick.rotation.z = -0.5;
    g.add(wick);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.position.set(x + 0.06, y + 0.11, z);
    g.add(s);
    g.userData.spark = s;
  }
  // 回傳 { group, body }:body 是會被「發霉變綠」改色的主體
  function customMeatball(id) {
    const g = new THREE.Group();
    if (id === 10) {            // 黑豬肉貢丸:黑色小豬頭
      const body = part(sphereGeo, std(0x1c1212, 0.4), 1, 0.95, 1, 0, 0, 0);
      g.add(body);
      const pink = std(0xe39a9a, 0.5);
      const snout = part(cylGeo, pink, 0.36, 0.14, 0.28, 0, -0.05, 0.47);
      snout.rotation.x = Math.PI / 2;
      g.add(snout);
      const dark = std(0x1a1010, 0.6);
      g.add(part(sphereGeo, dark, 0.06, 0.08, 0.04, -0.07, -0.05, 0.55));
      g.add(part(sphereGeo, dark, 0.06, 0.08, 0.04, 0.07, -0.05, 0.55));
      const white = std(0xffffff, 0.3);
      g.add(part(sphereGeo, white, 0.13, 0.13, 0.08, -0.18, 0.13, 0.41));
      g.add(part(sphereGeo, white, 0.13, 0.13, 0.08, 0.18, 0.13, 0.41));
      g.add(part(sphereGeo, dark, 0.07, 0.07, 0.05, -0.18, 0.13, 0.46));
      g.add(part(sphereGeo, dark, 0.07, 0.07, 0.05, 0.18, 0.13, 0.46));
      const ear = std(0x2b1f1f, 0.6);
      const e1 = part(coneGeo4, ear, 0.22, 0.26, 0.12, -0.27, 0.44, 0.05); e1.rotation.z = 0.5; g.add(e1);
      const e2 = part(coneGeo4, ear, 0.22, 0.26, 0.12, 0.27, 0.44, 0.05); e2.rotation.z = -0.5; g.add(e2);
      fuseTip(g, 0, 0.5, -0.05);
      return { group: g, body };
    }
    if (id === 11) {            // 香腸:沿上下方向,紅色帶烤痕
      const sg = sausageBody(1.1, 0.26, 0xc2412a, 'z');
      g.add(sg);
      const mark = std(0x5d1a0e, 0.8);
      for (const z of [-0.3, 0, 0.3]) {
        const m = part(new THREE.BoxGeometry(1, 1, 1), mark, 0.34, 0.03, 0.05, 0, 0.255, z);
        m.rotation.y = 0.6; g.add(m);
      }
      fuseTip(g, 0, 0.3, -0.62);
      return { group: g, body: sg.userData.tube };
    }
    if (id === 12) {            // 米腸:沿左右方向,米白色帶米粒
      const rg = sausageBody(1.1, 0.3, 0xeadcc0, 'x');
      g.add(rg);
      const grain = std(0xffffff, 0.35);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, x = -0.5 + (i % 5) * 0.25;
        g.add(part(sphereGeo, grain, 0.08, 0.05, 0.05, x, Math.sin(a) * 0.29, Math.cos(a) * 0.29));
      }
      fuseTip(g, 0.62, 0.3, 0);
      return { group: g, body: rg.userData.tube };
    }
    if (id === 13) {            // 大腸包小腸:米腸剖開夾香腸 + 酸菜
      const bun = sausageBody(1.15, 0.3, 0xeadcc0, 'x');
      bun.scale.set(1, 1, 0.8);
      bun.position.y = -0.1;
      g.add(bun);
      const sg = sausageBody(1.0, 0.18, 0xc2412a, 'x');
      sg.position.set(0, 0.2, 0);
      g.add(sg);
      const green = std(0x4caf50, 0.6);
      for (const x of [-0.35, -0.1, 0.15, 0.38]) g.add(part(new THREE.BoxGeometry(1, 1, 1), green, 0.12, 0.04, 0.1, x, 0.36, (x * 7) % 0.1));
      fuseTip(g, 0.66, 0.25, 0);
      return { group: g, body: bun.userData.tube };
    }
    return null;
  }
  // 黑豬肉(道具):一塊帶黑皮的豬肉
  function customItemModel(key) {
    if (key !== 'blackpork') return null;
    const g = new THREE.Group();
    const meat = part(sphereGeo, std(0xc95b5b, 0.5), 0.62, 0.26, 0.44, 0, 0.16, 0);
    const fat = part(sphereGeo, std(0xf5e6d8, 0.4), 0.64, 0.12, 0.46, 0, 0.27, 0);
    const skin = part(sphereGeo, std(0x2b1f1f, 0.6), 0.6, 0.08, 0.42, 0, 0.33, 0);
    g.add(meat, fat, skin);
    const bone = part(cylGeo, std(0xfff8e1, 0.35), 0.07, 0.3, 0.07, 0.34, 0.17, 0);
    bone.rotation.z = Math.PI / 2;
    g.add(bone);
    g.add(part(sphereGeo, std(0xfff8e1, 0.35), 0.11, 0.11, 0.11, 0.49, 0.17, 0));
    g.scale.setScalar(0.9);
    return g;
  }

  function makeMeatball(m) {
    const g = new THREE.Group();
    // 優先用 Blender 模型;模型還沒載入時,新增的種類先用幾何組合的替代模型
    const model = propModel('mb_' + m.def.id);
    const custom = model ? null : customMeatball(m.def.id);
    let body = custom ? custom.body : null;
    if (custom) {
      g.add(custom.group);
      if (custom.group.userData.spark) g.userData.spark = custom.group.userData.spark;
    }
    if (model) {
      model.traverse((c) => {
        if (c.isMesh && /^meat_/.test(c.material.name)) { c.material = c.material.clone(); body = c; }
        if (/_tip$/.test(c.name)) {
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
          c.add(s);
          g.userData.spark = s;
        }
      });
      g.add(model);
    }
    if (!body) { // 模型未載入時的替代球
      body = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: m.def.color, roughness: 0.6 }));
      g.add(body);
    }
    // 快爆閃光:外罩一層加亮球殼(不動到貼圖材質,避免重新編譯 shader)
    const flash = new THREE.Mesh(ballGeo, flashMat);
    flash.scale.setScalar(1.06);
    flash.visible = false;
    g.add(flash);
    g.userData.body = body;
    g.userData.flash = flash;
    g.userData.baseColor = body.material.color.clone();
    g.userData.shadow = blobShadow(1.05);
    g.add(g.userData.shadow);
    return g;
  }
  const MOLD_TINT = new THREE.Color(0.55, 0.78, 0.3);
  function syncBalls() {
    const list = meatballs.filter((m) => !m.exploded && !m.eaten);
    syncSet(ballCache, list, makeMeatball, (m, g) => {
      const r = (BALL_R[m.def.id] || 0.36) * 2;
      const bob = Math.sin(elapsed * 8) * 0.03;
      const lift = (m.held ? 0.7 : 0) + (m.jump || 0) * 0.9; // 手持舉高、黑豬肉彈跳
      g.scale.set(r, r, r);
      g.position.set(W2(m.x), (BALL_Y[m.def.id] || 0.5) * r + bob + lift, W2(m.y));
      // 慢慢轉,增加生命感;香腸/米腸/大腸包小腸固定方向,一眼看出爆炸方向
      g.rotation.y = (m.def.axis || m.def.behavior === 'square') ? 0 : elapsed * 0.6;
      g.userData.shadow.position.y = (0.012 - g.position.y) / r; // 影子貼地(抵銷彈跳與舉起高度)
      const u = g.userData;
      u.flash.visible = m.fuse < 0.6 && Math.floor(m.fuse * 12) % 2 === 0;
      u.body.material.color.copy(m.moldy ? MOLD_TINT : u.baseColor);
      if (u.spark) { // 引信火花:越接近爆炸越大越亮
        const urgent = m.fuse < 1.2 ? 1.6 : 1;
        const s = (0.16 + Math.random() * 0.12) * urgent;
        u.spark.scale.set(s, s, 1);
        u.spark.material.opacity = 0.75 + Math.random() * 0.25;
      }
    });
  }

  // ---------- 角色:寫實學生(Quaternius CC0 人體 + Blender 制服/球帽)+ 骨架動畫 ----------
  // 模型未載入或畫質設為「省電」時,退回 voxel 積木學生
  const charCache = new Map();
  const charLib = loadMapLib('chars');
  const animLib = loadMapLib('anims');
  const CHAR_H = 1.12;            // 遊戲中的身高(格;Q 版 2 頭身)
  const CHAR_SRC_H = 1.52;        // 原始模型身高(公尺;tools/assets/15_build_chibi.py)
  const charClock = new THREE.Clock();
  let charDt = 0;
  const deadAt = new WeakMap();
  function variantFor(f) { return 'char_' + (f.char || 'aman'); } // 每位角色一個模型(17_build_roster.py)
  function charColors(f) {
    return {
      bottom: f.team === 'red' ? 0x8a2f2f : 0x2a3b6b,
      accent: f === player ? 0xffd54f : (f.team === 'red' ? 0xe74c3c : 0x3aa6ff),
    };
  }
  // 動畫片段:只保留旋轉 + 骨盆位移(依體型縮放骨盆高度,避免女生腳浮空/陷地)
  const clipCache = {};
  function clipsFor(vname, model) {
    if (clipCache[vname]) return clipCache[vname];
    const rig = animLib.nodes.anim_rig;
    const aP = rig && rig.getObjectByName('pelvis');
    const cP = model.getObjectByName('pelvis');
    const k = aP && cP ? cP.position.length() / (aP.position.length() || 1) : 1;
    const out = {};
    for (const c of animLib.animations || []) {
      const clip = c.clone();
      clip.tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion') || t.name === 'pelvis.position');
      for (const t of clip.tracks) {
        if (t.name === 'pelvis.position') for (let i = 0; i < t.values.length; i++) t.values[i] *= k;
      }
      out[c.name] = clip;
    }
    return (clipCache[vname] = out);
  }
  // GLTFLoader 會把同檔案內重複的節點名稱改成 pelvis_1、spine_01_1…(四個角色共用骨架名)
  // → 依動畫軌道的骨頭名稱改回來,動畫才綁得上
  let boneNames = null;
  function fixBoneNames(model) {
    if (!boneNames) {
      boneNames = new Set();
      for (const c of animLib.animations || []) for (const t of c.tracks) boneNames.add(t.name.split('.')[0]);
    }
    model.traverse((o) => {
      if (!o.isBone || boneNames.has(o.name)) return;
      const base = o.name.replace(/_\d+$/, '');
      if (boneNames.has(base)) o.name = base;
    });
  }
  // 名稱標籤:Canvas 畫成貼圖的 Sprite(固定大小比例、不受燈光影響)
  function makeNameSprite(text, bg) {
    const cv = document.createElement('canvas');
    const g2 = cv.getContext('2d');
    const font = 'bold 44px "Noto Sans TC", sans-serif';
    g2.font = font;
    const w = Math.ceil(g2.measureText(text).width) + 36;
    cv.width = w; cv.height = 64;
    g2.font = font;
    g2.fillStyle = bg; g2.globalAlpha = 0.9;
    const r = 14;
    g2.beginPath(); g2.moveTo(r, 0); g2.lineTo(w - r, 0); g2.quadraticCurveTo(w, 0, w, r); g2.lineTo(w, 64 - r); g2.quadraticCurveTo(w, 64, w - r, 64);
    g2.lineTo(r, 64); g2.quadraticCurveTo(0, 64, 0, 64 - r); g2.lineTo(0, r); g2.quadraticCurveTo(0, 0, r, 0); g2.fill();
    g2.globalAlpha = 1; g2.fillStyle = '#fff'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.fillText(text, w / 2, 34);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
    sp.renderOrder = 10;
    const hgt = 0.26;
    sp.scale.set(hgt * w / 64, hgt, 1);
    return sp;
  }

  // 共用:頭上箭頭、防護盾、口罩光環、腳下柔影
  function addCharExtras(g, accent) {
    const marker = new THREE.Mesh(coneGeo, colorMat(accent));
    marker.scale.set(0.18, 0.18, 0.18);
    marker.rotation.x = Math.PI;
    marker.position.y = 1.5;
    g.add(marker);
    const shield = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({
      color: 0xffd54f, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    shield.scale.set(1.7, 1.9, 1.7);
    shield.position.y = 0.7;
    shield.visible = false;
    g.add(shield);
    const maskRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0x90caf9, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    maskRing.rotation.x = -Math.PI / 2;
    maskRing.position.y = 0.04;
    maskRing.scale.set(1.5, 1.5, 1);
    maskRing.visible = false;
    g.add(maskRing);
    g.add(blobShadow(0.75));
    // 開局光柱 + 地面光圈:標出自己的位置
    const beacon = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 5, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = 2.5;
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe082, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
    beacon.add(beam, ring);
    beacon.visible = false;
    g.add(beacon);
    Object.assign(g.userData, { marker, shield, maskRing, beacon, beam, ring });
  }
  function makeRealChar(f) {
    const vname = variantFor(f);
    const src = charLib.nodes[vname];
    if (!src || !THREE.SkeletonUtils) return null;
    const { bottom, accent } = charColors(f);
    const g = new THREE.Group();
    const model = THREE.SkeletonUtils.clone(src);
    fixBoneNames(model);
    model.scale.setScalar(CHAR_H / CHAR_SRC_H);
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = Q.charShadow;
      o.receiveShadow = true;
      o.frustumCulled = false; // 骨架動畫會改變包圍盒
      const n = o.material.name || '';
      if (n.startsWith('outfit_team')) { o.material = o.material.clone(); o.material.color.set(bottom); }
    });
    g.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const acts = {};
    const clips = clipsFor(vname, model);
    for (const name in clips) acts[name] = mixer.clipAction(clips[name]);
    g.userData = { real: true, model, mixer, acts, cur: null, busyUntil: 0, lastHp: f.hp, lastBombs: 0 };
    addCharExtras(g, accent);
    playAct(g.userData, 'Idle_Loop');
    return g;
  }
  function playAct(u, name, opt = {}) {
    const a = u.acts[name];
    if (!a) return 0;
    const speed = opt.speed || 1;
    if (u.cur === a && !opt.once) { a.timeScale = speed; return 0; }
    a.reset();
    a.timeScale = speed;
    a.setLoop(opt.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = !!opt.once;
    a.play();
    if (u.cur && u.cur !== a) u.cur.crossFadeTo(a, opt.fade || 0.18, false);
    u.cur = a;
    return a.getClip().duration / speed;
  }
  // 動畫狀態機:死亡 > 勝利跳舞 > 一次性動作(受擊/放貢丸)> 跑步 / 待機
  function animateRealChar(f, g) {
    const u = g.userData;
    const now = performance.now() / 1000;
    let owned = 0;
    for (const m of meatballs) if (m.owner === f && !m.exploded && !m.eaten) owned++;
    if (!f.alive) {
      if (u.state !== 'dead') { u.state = 'dead'; playAct(u, 'Death01', { once: true, fade: 0.1 }); }
    } else if ((gameState === 'win' && f.team === 'blue') || (gameState === 'lose' && f.team === 'red')) {
      if (u.state !== 'dance') { u.state = 'dance'; playAct(u, 'Dance_Loop', { fade: 0.3 }); }
    } else {
      if (f.hp < u.lastHp) {                       // 被炸到:受擊反應
        u.busyUntil = now + playAct(u, 'Hit_Chest', { once: true, fade: 0.06, speed: 1.2 }) * 0.9;
        u.state = 'busy';
      } else if (owned > u.lastBombs) {            // 放下貢丸:彎腰放置
        u.busyUntil = now + playAct(u, 'PickUp_Table', { once: true, fade: 0.08, speed: 1.9 }) * 0.85;
        u.state = 'busy';
      }
      if (now >= u.busyUntil) {
        if (f.mvTarget) { u.state = 'run'; playAct(u, 'Jog_Fwd_Loop', { speed: Math.max(0.7, Math.min(1.6, f.speed / 150)) }); }
        else { u.state = 'idle'; playAct(u, 'Idle_Loop', { fade: 0.25 }); }
      }
    }
    u.lastHp = f.hp;
    u.lastBombs = owned;
    u.mixer.update(charDt);
  }
  function makeVoxelChar(f) {
    if (Q.realChars && charLib.ready && animLib.ready) {
      const g = makeRealChar(f);
      if (g) return g;
    }
    const g = new THREE.Group();
    const skin = 0xf2c9a0, shirt = 0xf5f5f5, hair = 0x2b2622, sock = 0xeeeeee, shoe = 0x333940;
    const { bottom, accent } = charColors(f);
    const legL = new THREE.Group(), legR = new THREE.Group();
    for (const leg of [legL, legR]) {
      V(leg, 0.15, 0.14, 0.15, skin, 0, -0.07, 0);
      V(leg, 0.15, 0.06, 0.15, sock, 0, -0.17, 0);
      V(leg, 0.16, 0.1, 0.2, shoe, 0, -0.25, 0.02);
    }
    legL.position.set(-0.11, 0.3, 0);
    legR.position.set(0.11, 0.3, 0);
    g.add(legL, legR);
    V(g, 0.4, 0.14, 0.26, bottom, 0, 0.37, 0);
    V(g, 0.42, 0.3, 0.28, shirt, 0, 0.59, 0);
    V(g, 0.1, 0.12, 0.02, accent, 0, 0.62, 0.15);
    const armL = new THREE.Group(), armR = new THREE.Group();
    for (const a of [armL, armR]) {
      V(a, 0.11, 0.13, 0.12, shirt, 0, -0.05, 0);
      V(a, 0.1, 0.16, 0.1, skin, 0, -0.18, 0);
    }
    armL.position.set(-0.27, 0.72, 0);
    armR.position.set(0.27, 0.72, 0);
    g.add(armL, armR);
    V(g, 0.36, 0.32, 0.34, skin, 0, 0.93, 0);
    V(g, 0.38, 0.1, 0.36, hair, 0, 1.08, -0.01);
    V(g, 0.38, 0.06, 0.36, hair, 0, 0.99, -0.06);
    V(g, 0.4, 0.08, 0.38, accent, 0, 1.14, 0);
    V(g, 0.2, 0.05, 0.16, accent, 0, 1.12, 0.24);
    V(g, 0.05, 0.06, 0.02, 0x1a1a1a, -0.09, 0.93, 0.18);
    V(g, 0.05, 0.06, 0.02, 0x1a1a1a, 0.09, 0.93, 0.18);
    g.userData = { legL, legR, armL, armR };
    addCharExtras(g, accent);
    g.userData.marker.position.y = 1.42;
    return g;
  }
  function syncChars() {
    charDt = Math.min(0.1, charClock.getDelta());
    const now = performance.now() / 1000;
    for (const f of fighters()) {
      if (!f) continue;
      if (f.alive) deadAt.delete(f);
      else if (!deadAt.has(f)) deadAt.set(f, now);
    }
    // 死亡後保留 2.5 秒讓倒地動畫播完
    const list = fighters().filter((f) => f && (f.alive || f.invuln > 0 || (deadAt.has(f) && now - deadAt.get(f) < 2.5)));
    syncSet(charCache, list, makeVoxelChar, (f, g) => {
      g.position.set(W2(f.x), 0, W2(f.y));
      const u = g.userData;
      const yaw = Math.atan2(f.dir.x, f.dir.y);
      if (u.real) g.rotation.y += angleDelta(g.rotation.y, yaw) * 0.35; // 轉身平滑
      else g.rotation.y = yaw;
      const blink = f.alive && f.invuln > 0 && Math.floor(f.invuln * 12) % 2 === 0;
      // 第一人稱時隱藏自己的模型(不擋視線)
      g.visible = !blink && !(camMode === 'fps' && f === player);
      // 躺在長椅上:人物轉成順著長椅、仰躺在椅面上
      const bench = typeof onBench === 'function' && onBench(f) ? benchAt(f.col, f.row) : null;
      if (u.real && u.model) {
        if (!u.modelPos) u.modelPos = u.model.position.clone();
        if (bench) {
          g.rotation.y = (bench.back === 'n' || bench.back === 's') ? Math.PI / 2 : 0;
          u.model.rotation.x = -Math.PI / 2;
          u.model.position.set(u.modelPos.x, u.modelPos.y + 0.36, u.modelPos.z + 0.5);
        } else if (u.model.rotation.x) {
          u.model.rotation.x = 0;
          u.model.position.copy(u.modelPos);
        }
      }
      if (u.real) {
        animateRealChar(f, g);
      } else {
        const walking = !!f.mvTarget;
        const sw = walking ? Math.sin(elapsed * 12 + f.x * 0.01) * 0.5 : 0;
        u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
        u.armL.rotation.x = -sw * 0.8; u.armR.rotation.x = sw * 0.8;
      }
      u.marker.visible = f.alive;
      if (u.beacon) {                                   // 開局亮光(只有自己)
        const on = f === player && f.alive && typeof spotT !== 'undefined' && spotT > 0;
        u.beacon.visible = on;
        if (on) {
          const k = Math.min(1, spotT / 0.6), pulse = 0.75 + 0.25 * Math.sin(elapsed * 10);
          u.beam.material.opacity = 0.32 * k * pulse;
          const rr = 1.2 + ((elapsed * 1.2) % 1) * 1.6;
          u.ring.scale.set(rr, rr, 1);
          u.ring.material.opacity = 0.9 * k * (1 - ((elapsed * 1.2) % 1));
        }
      }
      u.marker.position.y = (u.real ? 1.5 : 1.42) + Math.sin(elapsed * 5) * 0.05;
      // 頭上名稱(畫在箭頭上方,永遠面向鏡頭、不被擋住)
      const nm = typeof displayName === 'function' ? displayName(f) : '';
      const nmKey = nm + '|' + (f === player ? 'me' : f.team);
      if (u.nameKey !== nmKey) {
        if (u.nameSprite) { g.remove(u.nameSprite); u.nameSprite.material.map.dispose(); u.nameSprite.material.dispose(); }
        u.nameSprite = makeNameSprite(nm, f === player ? '#c79a00' : f.team === 'red' ? '#aa281e' : '#195faa');
        g.add(u.nameSprite);
        u.nameKey = nmKey;
      }
      u.nameSprite.visible = f.alive && !(camMode === 'fps' && f === player);
      u.nameSprite.position.y = u.marker.position.y + 0.32;
      // 防護盾:金色護罩球(呼吸脈動);口罩:藍色地環(旋轉)
      u.shield.visible = f.alive && f.shieldT > 0;
      if (u.shield.visible) {
        u.shield.material.opacity = 0.16 + 0.1 * Math.sin(elapsed * 6);
        const sp = 1.7 + Math.sin(elapsed * 6) * 0.06;
        u.shield.scale.set(sp, sp * 1.12, sp);
      }
      u.maskRing.visible = f.alive && false;
      if (u.maskRing.visible) u.maskRing.rotation.z = elapsed * 1.5;
    });
  }

  // ---------- 寵物:寫實老鼠(Poly Haven 掃描)/ 程序建模蟑螂(三腳架步態擺動) ----------
  const petCache = new Map(), wildCache = new Map();
  function makeVoxelPetFallback(id) {
    const g = new THREE.Group();
    if (id === 'rat') {
      V(g, 0.3, 0.18, 0.42, 0x9aa7b4, 0, 0.12, 0);
      V(g, 0.22, 0.18, 0.2, 0xb7c2cd, 0, 0.16, 0.26);
      V(g, 0.04, 0.04, 0.28, 0x6f7b88, 0, 0.1, -0.32);
    } else {
      V(g, 0.3, 0.14, 0.44, 0x6d4c33, 0, 0.1, 0);
      V(g, 0.2, 0.12, 0.16, 0x4e3625, 0, 0.12, 0.28);
    }
    return g;
  }
  function makeVoxelPet(id) {
    const g = new THREE.Group();
    const model = propModel('pet_' + id);
    const u = { id, inner: model || makeVoxelPetFallback(id), phase: Math.random() * 6.3 };
    if (model) {
      model.traverse((c) => {
        if (!c.isMesh) return;
        if (/roach_legA/.test(c.material.name)) u.legsA = c;
        if (/roach_legB/.test(c.material.name)) u.legsB = c;
      });
    }
    g.add(u.inner);
    g.add(blobShadow(id === 'rat' ? 0.55 : 0.42));
    g.userData = u;
    return g;
  }
  // 依移動方向轉身(平滑),並播放小動作:蟑螂腳快速交替、老鼠身體起伏
  function animatePet(g, x, z, speedHint) {
    const u = g.userData;
    const dx = x - (u.px === undefined ? x : u.px), dz = z - (u.pz === undefined ? z : u.pz);
    u.px = x; u.pz = z;
    const moving = dx * dx + dz * dz > 1e-7 || speedHint;
    if (dx * dx + dz * dz > 1e-7) {
      const yaw = Math.atan2(dx, dz);
      g.rotation.y += angleDelta(g.rotation.y, yaw) * 0.35;
    }
    const t = elapsed + u.phase;
    if (u.legsA) {
      const sw = moving ? Math.sin(t * 38) * 0.22 : 0;
      u.legsA.rotation.y = sw; u.legsB.rotation.y = -sw;
      u.inner.position.y = moving ? Math.abs(Math.sin(t * 38)) * 0.006 : 0;
    } else {
      u.inner.position.y = moving ? Math.abs(Math.sin(t * 14)) * 0.025 : Math.sin(t * 3) * 0.004;
      u.inner.rotation.z = moving ? Math.sin(t * 14) * 0.05 : 0;
    }
  }
  function syncPets() {
    syncSet(petCache, player ? allPets().filter((p) => p.alive) : [],
      (p) => makeVoxelPet(p.def.id),
      (p, g) => {
        const x = W2(p.x), z = W2(p.y);
        g.position.set(x, 0.01, z);
        animatePet(g, x, z, !!p.target);
      });
    syncSet(wildCache, wildCritters,
      (w) => makeVoxelPet(w.def.id),
      (w, g) => {
        const x = W2(w.x), z = W2(w.y);
        g.position.set(x, 0.01, z);
        animatePet(g, x, z, true);
        const s = Math.max(0.2, Math.min(1, w.life));
        g.scale.set(s, s, s);
      });
  }

  // ---------- 道具:寫實 3D 模型(懸浮、旋轉)+ 稀有品發光底環 ----------
  const itemCache = new Map();
  const RARE = new Set(['luckybag', 'chicken', 'bloodcake', 'milktea', 'boba', 'tofu']);
  function makeItem(it) {
    const g = new THREE.Group();
    const model = propModel('it_' + it.key) || customItemModel(it.key);
    if (model) {
      model.scale.setScalar(1.2);
      const pivot = new THREE.Group();
      pivot.add(model);
      g.add(pivot);
      g.userData.pivot = pivot;
      g.userData.spin = Math.random() * 6.3;
    } else { // 模型未載入:沿用 SVG 圖示
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('items/' + it.key), transparent: true, toneMapped: false }));
      s.center.set(0.5, 0.1);
      s.scale.set(0.62, 0.62, 1);
      g.add(s);
    }
    g.userData.shadow = blobShadow(0.6);
    g.add(g.userData.shadow);
    // 發霉:綠色黴菌光暈(平常隱藏)
    const mold = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), new THREE.MeshBasicMaterial({
      color: 0x8bc34a, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }));
    mold.position.y = 0.3;
    mold.visible = false;
    g.add(mold);
    g.userData.mold = mold;
    if (RARE.has(it.key)) {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: it.key === 'luckybag' ? 0xff5252 : 0xffd54f, toneMapped: false,
        transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      g.add(ring);
      g.userData.ring = ring;
    }
    return g;
  }
  function syncItems() {
    syncSet(itemCache, items.filter((it) => !it.dead), makeItem, (it, g) => {
      const hover = 0.08 + Math.sin(it.t * 4) * 0.05;
      g.position.set(W2(it.x), 0, W2(it.y));
      const u = g.userData;
      if (u.pivot) {
        u.pivot.position.y = hover;
        u.pivot.rotation.y = u.spin + elapsed * 1.3;
        u.shadow.scale.setScalar(0.6 - hover * 0.6);
      }
      if (u.ring) {
        u.ring.rotation.z = elapsed * 2;
        u.ring.material.opacity = 0.5 + 0.3 * Math.sin(elapsed * 6);
      }
      // 發霉:綠色光暈、慢慢縮小,快消失時閃爍
      const rot = it.moldy ? Math.max(0, Math.min(1, (it.age - it.fresh) / MOLD_STAGE)) : 0;
      u.mold.visible = !!it.moldy;
      if (it.moldy) u.mold.material.opacity = 0.35 + 0.15 * Math.sin(elapsed * 5);
      g.scale.setScalar(1 - rot * 0.35);
      g.visible = !(rot > 0.7 && Math.floor(elapsed * 8) % 2 === 0);
    });
  }

  // ---------- 爆炸波:shader 火焰(沿十字逐格擴散)+ 濃煙 + 火星 + 地面衝擊波 + 焦痕 ----------
  const fxGroup = new THREE.Group();
  scene.add(fxGroup);
  const NOISE_GLSL = `
    float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }`;
  // 面向鏡頭的四邊形:position = 中心,aCorner = 角落,aParam = (亂數種子, 延遲, 大小)
  const BILL_VERT = `
    attribute vec2 aCorner; attribute vec3 aParam;
    uniform float uT; uniform float uRise; uniform float uGrow;
    varying vec2 vUv; varying float vSeed; varying float vLt;
    void main(){
      vUv = aCorner * 0.5 + 0.5; vSeed = aParam.x;
      float lt = uT - aParam.y; vLt = lt;
      vec3 c = position; c.y += max(lt, 0.0) * uRise;
      vec4 mv = modelViewMatrix * vec4(c, 1.0);
      mv.xy += aCorner * aParam.z * (0.5 + clamp(lt, 0.0, 2.0) * uGrow);
      gl_Position = projectionMatrix * mv;
    }`;
  const FIRE_FRAG = `
    uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uDark; uniform float uLife; uniform float uGain;
    varying vec2 vUv; varying float vSeed; varying float vLt;
    ${NOISE_GLSL}
    void main(){
      if (vLt < 0.0) discard;
      float k = clamp(vLt / uLife, 0.0, 1.0);
      vec2 p = vUv * 2.0 - 1.0;
      float n = fbm(vUv * 3.2 + vec2(vSeed * 13.1, -vLt * 4.5));
      float r = length(p) + (n - 0.5) * 0.95;
      float body = 1.0 - smoothstep(0.3 - k * 0.2, 0.95 - k * 0.3, r);
      float heat = body * (1.3 - k * 1.35) + (n - 0.5) * 0.35;
      vec3 col = mix(uDark, uMid, smoothstep(0.05, 0.45, heat));
      col = mix(col, uCore, smoothstep(0.75, 1.05, heat));
      float a = body * (1.0 - smoothstep(0.6, 1.0, k));
      if (a < 0.01) discard;
      gl_FragColor = vec4(col, a * uGain);
    }`;
  const SMOKE_FRAG = `
    uniform vec3 uDark; uniform float uLife; uniform float uOpacity;
    varying vec2 vUv; varying float vSeed; varying float vLt;
    ${NOISE_GLSL}
    void main(){
      if (vLt < 0.0) discard;
      float k = clamp(vLt / uLife, 0.0, 1.0);
      vec2 p = vUv * 2.0 - 1.0;
      float n = fbm(vUv * 2.4 + vec2(vSeed * 7.3, -vLt * 1.1));
      float r = length(p) + (n - 0.5) * 0.85;
      float a = (1.0 - smoothstep(0.25, 0.9, r)) * smoothstep(0.0, 0.18, k) * (1.0 - k) * uOpacity;
      if (a < 0.01) discard;
      gl_FragColor = vec4(uDark * (0.55 + n * 0.7), a);
    }`;
  const SPARK_VERT = `
    attribute vec3 aVel; attribute float aSeed;
    uniform float uT; uniform float uScale; varying float vA;
    void main(){
      float t = uT;
      vec3 p = position + aVel * t + vec3(0.0, -5.0, 0.0) * t * t;
      p.y = max(p.y, 0.02);
      vA = 1.0 - clamp(t / (0.35 + aSeed * 0.45), 0.0, 1.0);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = max(1.0, (0.025 + aSeed * 0.03) * uScale / -mv.z * vA);
      gl_Position = projectionMatrix * mv;
    }`;
  const SPARK_FRAG = `
    uniform vec3 uCore; varying float vA;
    void main(){
      vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
      if (d > 0.25 || vA <= 0.0) discard;
      gl_FragColor = vec4(uCore, vA * (1.0 - d * 4.0));
    }`;
  // 三種爆炸配色:一般火焰 / 黴毒(綠) / 墨汁(黑紫,不發光)
  const FX_PAL = {
    fire:   { core: 0xfff3c4, mid: 0xff7a1a, dark: 0x5c1606, smoke: 0x2f2a27, spark: 0xffd27a, ring: 0xffb04a, add: true },
    poison: { core: 0xeaffb4, mid: 0x86cc22, dark: 0x1f3d08, smoke: 0x40602a, spark: 0xc8ff6a, ring: 0x9ee34a, add: true },
    ink:    { core: 0x47434c, mid: 0x1c1a20, dark: 0x060607, smoke: 0x121114, spark: 0x9a96a0, ring: 0x2a282e, add: false },
  };
  const scorchTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    for (let i = 0; i < 26; i++) { // 不規則焦痕:多個半透明暗斑疊加
      // 斑點完全落在貼圖內(否則會看到方形邊界)
      const ox = (Math.random() - 0.5) * 40, oy = (Math.random() - 0.5) * 40;
      const x = 64 + ox, y = 64 + oy, r = 12 + Math.random() * (40 - Math.max(Math.abs(ox), Math.abs(oy)));
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(20,14,10,0.22)'); gr.addColorStop(1, 'rgba(20,14,10,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }
    return new THREE.CanvasTexture(cv);
  })();

  function billboards(list) {
    const n = list.length;
    const pos = new Float32Array(n * 12), cor = new Float32Array(n * 8), par = new Float32Array(n * 12), idx = [];
    const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    list.forEach((q, i) => {
      for (let k = 0; k < 4; k++) {
        pos.set([q[0], q[1], q[2]], (i * 4 + k) * 3);
        cor.set(C[k], (i * 4 + k) * 2);
        par.set([q[3], q[4], q[5]], (i * 4 + k) * 3);
      }
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(cor, 2));
    geo.setAttribute('aParam', new THREE.BufferAttribute(par, 3));
    geo.setIndex(idx);
    return geo;
  }
  const fxList = [];
  const fxSeen = new WeakSet();
  const fxClock = () => performance.now() / 1000;
  function spawnFx(ex) {
    const kind = ex.poison ? 'poison' : (ex.ink ? 'ink' : 'fire');
    const P = FX_PAL[kind];
    const c0 = ex.cells[0];
    const tint = new THREE.Color(P.mid).lerp(new THREE.Color(ex.color || P.mid), kind === 'fire' ? 0.25 : 0);
    const fire = [], smoke = [], scorch = [];
    const rnd = Math.random;
    for (const cl of ex.cells) {
      const d = Math.abs(cl.c - c0.c) + Math.abs(cl.r - c0.r);
      const delay = d * 0.035; // 火焰沿著十字一格一格往外推進
      for (let k = 0; k < 2; k++) {
        fire.push([cl.c + 0.5 + (rnd() - 0.5) * 0.4, 0.25 + rnd() * 0.35, cl.r + 0.5 + (rnd() - 0.5) * 0.4,
          rnd(), delay + rnd() * 0.06, 0.42 + rnd() * 0.22]);
      }
      smoke.push([cl.c + 0.5 + (rnd() - 0.5) * 0.3, 0.45, cl.r + 0.5 + (rnd() - 0.5) * 0.3, rnd(), delay + 0.12 + rnd() * 0.1, 0.55 + rnd() * 0.3]);
      scorch.push(cl);
    }
    for (let k = 0; k < 4; k++) { // 中心火球
      fire.push([c0.c + 0.5 + (rnd() - 0.5) * 0.2, 0.45 + k * 0.16, c0.r + 0.5 + (rnd() - 0.5) * 0.2, rnd(), k * 0.02, 0.85 + rnd() * 0.35]);
    }
    const uni = (extra) => Object.assign({ uT: { value: 0 } }, extra);
    const fireMat = new THREE.ShaderMaterial({
      vertexShader: BILL_VERT, fragmentShader: FIRE_FRAG, transparent: true, depthWrite: false,
      blending: P.add ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false,
      uniforms: uni({ uRise: { value: 0.7 }, uGrow: { value: 1.0 }, uLife: { value: 0.75 }, uGain: { value: P.add ? 0.5 : 0.9 },
        uCore: { value: new THREE.Color(P.core) }, uMid: { value: tint }, uDark: { value: new THREE.Color(P.dark) } }) });
    const smokeMat = new THREE.ShaderMaterial({
      vertexShader: BILL_VERT, fragmentShader: SMOKE_FRAG, transparent: true, depthWrite: false,
      uniforms: uni({ uRise: { value: 0.9 }, uGrow: { value: 0.7 }, uLife: { value: 1.9 },
        uOpacity: { value: kind === 'ink' ? 0.95 : 0.6 }, uDark: { value: new THREE.Color(P.smoke) } }) });
    const fireMesh = new THREE.Mesh(billboards(fire), fireMat);
    const smokeMesh = new THREE.Mesh(billboards(smoke), smokeMat);
    fireMesh.frustumCulled = smokeMesh.frustumCulled = false;
    fireMesh.renderOrder = 4; smokeMesh.renderOrder = 3;
    // 火星
    const N = 36, sp = new Float32Array(N * 3), vel = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const cl = ex.cells[Math.floor(rnd() * ex.cells.length)];
      sp.set([cl.c + 0.5, 0.35, cl.r + 0.5], i * 3);
      const a = rnd() * Math.PI * 2, s = 1 + rnd() * 2.5;
      vel.set([Math.cos(a) * s, 1.5 + rnd() * 3, Math.sin(a) * s], i * 3);
      seed[i] = rnd();
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const sparkMat = new THREE.ShaderMaterial({ vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { uT: { value: 0 }, uScale: { value: 400 }, uCore: { value: new THREE.Color(P.spark) } } });
    const sparks = new THREE.Points(sg, sparkMat);
    sparks.frustumCulled = false;
    // 地面衝擊波
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({
      color: P.ring, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      blending: P.add ? THREE.AdditiveBlending : THREE.NormalBlending }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(c0.c + 0.5, 0.03, c0.r + 0.5);
    // 焦痕(爆炸後在地上留幾秒)
    const sq = new Float32Array(scorch.length * 12), suv = new Float32Array(scorch.length * 8), sidx = [];
    scorch.forEach((cl, i) => {
      const x = cl.c + 0.5, z = cl.r + 0.5, h = 0.55 + rnd() * 0.15;
      sq.set([x - h, 0.008, z - h, x + h, 0.008, z - h, x + h, 0.008, z + h, x - h, 0.008, z + h], i * 12);
      suv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
      sidx.push(i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2);
    });
    const scg = new THREE.BufferGeometry();
    scg.setAttribute('position', new THREE.BufferAttribute(sq, 3));
    scg.setAttribute('uv', new THREE.BufferAttribute(suv, 2));
    scg.setIndex(sidx);
    const scorchMesh = new THREE.Mesh(scg, new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true,
      depthWrite: false, opacity: 1, color: kind === 'poison' ? 0x3a5a1a : 0xffffff,
      polygonOffset: true, polygonOffsetFactor: -2 }));
    scorchMesh.renderOrder = 1;
    const parts = [fireMesh, ring];                  // 省電:只有火焰 + 衝擊波
    if (Q.fx >= 1) parts.push(smokeMesh, scorchMesh); // 低:+ 濃煙、焦痕
    if (Q.fx >= 2) parts.push(sparks);                // 中/高:+ 火星
    for (const p of parts) fxGroup.add(p);
    fxList.push({ t0: fxClock(), parts, fireMat, smokeMat, sparkMat, ring, scorchMesh });
  }
  function updateFxList() {
    const now = fxClock();
    const scale = renderer.domElement.height * 0.5 / Math.tan(camera.fov * Math.PI / 360);
    for (let i = fxList.length - 1; i >= 0; i--) {
      const f = fxList[i], t = now - f.t0;
      f.fireMat.uniforms.uT.value = t;
      f.smokeMat.uniforms.uT.value = t;
      f.sparkMat.uniforms.uT.value = t;
      f.sparkMat.uniforms.uScale.value = scale;
      const rk = Math.min(1, t / 0.35);
      f.ring.scale.setScalar(0.3 + rk * 2.2);
      f.ring.material.opacity = 0.8 * (1 - rk);
      f.ring.visible = rk < 1;
      f.scorchMesh.material.opacity = Math.max(0, 1 - Math.max(0, t - 2.5) / 3.5);
      if (t > 6) {
        for (const p of f.parts) { fxGroup.remove(p); p.geometry.dispose(); p.material.dispose(); }
        fxList.splice(i, 1);
      }
    }
  }
  // 危險預警:重複使用同一批地面方塊(不再每幀新建網格)
  const dangerTex = glowTexture([[0, 'rgba(255,60,40,0.85)'], [0.7, 'rgba(255,60,40,0.55)'], [1, 'rgba(255,60,40,0)']]);
  const dangerMat = new THREE.MeshBasicMaterial({ map: dangerTex, transparent: true, depthWrite: false, toneMapped: false });
  const dangerPool = [];
  function syncFx() {
    for (const ex of explosions) {
      if (!fxSeen.has(ex) && ex.cells.length) { fxSeen.add(ex); spawnFx(ex); }
    }
    updateFxList();
    let brightest = 0, lightPos = null, lightColor = 0xffa726;
    for (const ex of explosions) {
      const a = Math.max(0, ex.t / EXPLOSION_TIME);
      if (a > brightest && ex.cells.length) {
        brightest = a;
        const c0 = ex.cells[0];
        lightPos = [c0.c + 0.5, 1.2, c0.r + 0.5];
        lightColor = ex.poison ? 0x8bc34a : (ex.ink ? 0x546e7a : 0xffa726);
      }
    }
    if (lightPos) {
      boomLight.position.set(lightPos[0], lightPos[1], lightPos[2]);
      boomLight.color.set(lightColor);
      boomLight.intensity = brightest * 2.6;
    } else {
      boomLight.intensity = 0;
    }
    let n = 0;
    if (danger && gameState === 'playing') {
      dangerMat.opacity = 0.35 + 0.25 * Math.sin(elapsed * 12);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (danger[r][c] < 1.0 && isFloor(c, r)) {
            let p = dangerPool[n];
            if (!p) {
              p = new THREE.Mesh(planeGeo, dangerMat);
              p.rotation.x = -Math.PI / 2;
              p.renderOrder = 2;
              fxGroup.add(p);
              dangerPool.push(p);
            }
            p.position.set(c + 0.5, 0.02, r + 0.5);
            p.scale.set(0.96, 0.96, 1);
            p.visible = true;
            n++;
          }
        }
      }
    }
    for (let i = n; i < dangerPool.length; i++) dangerPool[i].visible = false;
  }

  // ---------- 公園小鴨(Poly Haven CC0 橡皮鴨,在北側圍牆頂上來回散步) ----------
  let duck = null;
  function syncDuck() {
    if (!duck) {
      const lib = mapLib.park;
      if (!lib || !lib.ready || !lib.nodes.duck) return;
      duck = cloneNode(lib.nodes.duck);
      scene.add(duck);
    }
    duck.visible = currentMapId === 'park';
    if (!duck.visible) return;
    const t = elapsed * 0.25;
    const x = CX + Math.sin(t) * (CX - 2.5);
    duck.position.set(x, 0.96, 0.5);
    duck.rotation.y = Math.cos(t) > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  // ---------- 點地圖操作(射線;拖曳=旋轉,原地點=移動/放彈) ----------
  const ray = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let downPos = null;
  let tap3d = { t: 0, c: -1, r: -1 };
  renderer.domElement.addEventListener('pointerdown', (ev) => {
    downPos = { x: ev.clientX, y: ev.clientY };
  });
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (!downPos) return;
    const moved = Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y);
    downPos = null;
    if (moved > 6) return;
    if (gameState !== 'playing' || !player || !player.alive) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(groundPlane, hit)) return;
    const c = Math.floor(hit.x), r = Math.floor(hit.z);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
    const now = performance.now();
    if (now - tap3d.t < 350 && tap3d.c === c && tap3d.r === r) {
      tapCell(c, r, true);  // 點兩下:放貢丸
      tap3d = { t: 0, c: -1, r: -1 };
    } else {
      tap3d = { t: now, c, r };
      tapCell(c, r, false); // 點一下:走過去
    }
  });

  // ---------- 跟隨模式:擋住視線的模型變半透明(玩家本人永遠可見) ----------
  // 判定方式:凡是位於「鏡頭 → 玩家」視線圓柱內的物件全部淡化(牆/箱/桶/草叢/場外造景)
  // 實例化的物件:先把該實例藏起來,改放一個半透明替身
  function fadeMaterial(m) {
    if (!m.userData.fadeMat) {
      const t = m.clone();
      t.transparent = true;
      t.opacity = 0.5; // 半透明程度:保留物體的存在感,又不擋視線
      t.depthWrite = false;
      t.onBeforeCompile = m.onBeforeCompile;
      m.userData.fadeMat = t;
    }
    return m.userData.fadeMat;
  }
  function setFade(obj, on) {
    obj.traverse((o) => {
      if (!o.material) return;
      if (on) {
        if (!o.userData.origMat) o.userData.origMat = o.material;
        o.material = fadeMaterial(o.userData.origMat);
      } else if (o.userData.origMat) {
        o.material = o.userData.origMat;
      }
    });
  }
  const fadedSet = new Set();
  function unfade(p) {
    if (!p.dead) {
      if (p.obj) setFade(p.obj, false);
      else setPlacementVisible(p, true);
    }
    if (p.ghost) { boardGroup.remove(p.ghost); p.ghost = null; }
  }
  function updateOcclusion() {
    const want = new Set();
    if (camMode === 'follow' && player && player.alive) {
      const px = W2(player.x), pz = W2(player.y);
      const cx = camera.position.x, cz = camera.position.z;
      const dx = px - cx, dz = pz - cz;
      const len2 = dx * dx + dz * dz || 1;
      for (const p of placements) {
        if (p.dead) continue;
        const t = ((p.x - cx) * dx + (p.z - cz) * dz) / len2;
        if (t < 0.05 || t > 0.94) continue;               // 不在鏡頭與玩家之間
        const lx = cx + dx * t - p.x;
        const lz = cz + dz * t - p.z;
        if (lx * lx + lz * lz > 0.95 * 0.95) continue;    // 離視線太遠
        want.add(p);
      }
    }
    for (const p of fadedSet) {
      if (!want.has(p)) { unfade(p); fadedSet.delete(p); }
    }
    for (const p of want) {
      if (fadedSet.has(p)) continue;
      if (p.obj) {
        setFade(p.obj, true);
      } else {
        setPlacementVisible(p, false);
        p.ghost = standalone(p);
        p.ghost.traverse((o) => { o.castShadow = false; });
        setFade(p.ghost, true);
        boardGroup.add(p.ghost);
      }
      fadedSet.add(p);
    }
  }

  const inkEl = document.getElementById('ink-overlay');

  // ---------- 畫質切換 + 自動調整 + FPS 顯示 ----------
  const qSel = document.getElementById('quality-sel');
  const fpsEl = document.getElementById('fps-meter');
  function applyQuality(level) {
    const prev = Q;
    qualityLevel = level;
    Q = QUALITY[level];
    renderer.setPixelRatio(pixelRatioFor(Q));
    resize();
    if (prev.shadows !== Q.shadows || prev.soft !== Q.soft || prev.shadowSize !== Q.shadowSize) {
      renderer.shadowMap.enabled = Q.shadows;
      renderer.shadowMap.type = Q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      sun.shadow.mapSize.set(Q.shadowSize || 1024, Q.shadowSize || 1024);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    }
    renderer.shadowMap.autoUpdate = Q.charShadow;   // 只有「高」每幀重算陰影(人物有即時影子)
    renderer.shadowMap.needsUpdate = true;
    for (const id in floorMats) {
      const m = floorMats[id].mat;
      const want = Q.floorNormal && m.userData.normalSrc ? (m.userData.norTex || (m.userData.norTex = m.userData.normalSrc())) : null;
      if (m.normalMap !== want) { m.normalMap = want; m.needsUpdate = true; }
    }
    if (prev.realChars !== Q.realChars || prev.charShadow !== Q.charShadow) {
      for (const g of charCache.values()) scene.remove(g);
      charCache.clear();
    }
    needRebuild = true;          // 造景數量、燈光
    applyThemeLight();
    updateQualityUi();
  }
  function updateQualityUi() {
    if (!qSel) return;
    qSel.value = qualityPref;
    if (qSel.options[0]) qSel.options[0].text = qualityPref === 'auto' ? '自動·' + Q.name : '自動';
  }
  // 自動:每秒看一次 FPS,太低就降一級;持續很順就升一級(降過的等級不再升回,避免來回跳)
  let fpsFrames = 0, fpsT0 = performance.now(), fpsHigh = 0;
  let autoCap = QUALITY_ORDER.length - 1;
  let autoCool = performance.now() + 9000;  // 剛載入時模型解碼會卡,先不判斷
  let fpsLowRun = 0;
  if (qSel) {
    qSel.addEventListener('change', () => {
      qualityPref = qSel.value;
      try { localStorage.setItem('bbw3d_quality', qualityPref); } catch (e) { /* 忽略 */ }
      autoCap = QUALITY_ORDER.length - 1;
      autoCool = performance.now() + 4000;
      applyQuality(qualityPref === 'auto' ? 'mid' : qualityPref);
      qSel.blur(); // 讓鍵盤操作回到遊戲
    });
    qSel.addEventListener('keydown', (e) => e.stopPropagation()); // 方向鍵不要同時移動角色
  }
  function trackFps() {
    fpsFrames++;
    const now = performance.now();
    if (now - fpsT0 < 1000) return;
    const fps = fpsFrames * 1000 / (now - fpsT0);
    fpsFrames = 0; fpsT0 = now;
    if (fpsEl) fpsEl.textContent = Math.round(fps) + ' fps';
    if (qualityPref !== 'auto' || document.hidden || now < autoCool) return;
    const i = QUALITY_ORDER.indexOf(qualityLevel);
    // 自動模式最低停在「低」(保留寫實人物);只有在「低」仍持續低於 14 fps 才降到「省電」
    const floorHit = i === 1 && fps >= 14;
    if (fps < 24 && i > 0 && !floorHit) {
      if (++fpsLowRun >= (i === 1 ? 3 : 2)) {   // 連續數秒偏低才降,避免偶發卡頓誤判
        autoCap = i - 1;
        applyQuality(QUALITY_ORDER[i - 1]);
        autoCool = now + 4000;
        fpsLowRun = 0;
      }
      fpsHigh = 0;
    } else if (fps > 57 && i < autoCap) {
      fpsLowRun = 0;
      if (++fpsHigh >= 6) { applyQuality(QUALITY_ORDER[i + 1]); autoCool = now + 4000; fpsHigh = 0; }
    } else {
      fpsHigh = 0; fpsLowRun = 0;
    }
  }
  renderer.shadowMap.autoUpdate = Q.charShadow;
  updateQualityUi();

  // ---------- 豪雨:雨絲(線段)+ 地面水花圈 ----------
  const RAIN_N = 420, SPLASH_N = 48;
  const rainPos = new Float32Array(RAIN_N * 6);
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xcfe3ff, transparent: true, opacity: 0.55 }));
  rain.frustumCulled = false; rain.visible = false;
  scene.add(rain);
  const drops = [];
  for (let i = 0; i < RAIN_N; i++) drops.push({ x: Math.random() * (COLS + 4) - 2, y: Math.random() * 7, z: Math.random() * (ROWS + 4) - 2, v: 14 + Math.random() * 6 });
  const splashGeo = new THREE.RingGeometry(0.06, 0.1, 18);
  const splashPool = [];
  for (let i = 0; i < SPLASH_N; i++) {
    const m = new THREE.Mesh(splashGeo, new THREE.MeshBasicMaterial({ color: 0xeef6ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.visible = false; m.userData.t = 1; m.userData.life = 0.5;
    scene.add(m); splashPool.push(m);
  }
  const rainClock = new THREE.Clock();
  function updateRain() {
    const dt = Math.min(0.05, rainClock.getDelta());
    const on = typeof env !== 'undefined' && env.weather === 'rain';
    rain.visible = on;
    if (!on) { for (const m of splashPool) m.visible = false; return; }
    for (let i = 0; i < RAIN_N; i++) {
      const d = drops[i];
      d.y -= d.v * dt; d.x -= 1.2 * dt;
      if (d.y < 0) { d.y = 6 + Math.random() * 1.5; d.x = Math.random() * (COLS + 4) - 2; d.z = Math.random() * (ROWS + 4) - 2; }
      rainPos.set([d.x, d.y, d.z, d.x + 0.04, d.y + 0.35, d.z], i * 6);
    }
    rainGeo.attributes.position.needsUpdate = true;
    let spawn = 3;                      // 每幀冒幾個水花(只在可走的地面)
    for (const m of splashPool) {
      const u = m.userData;
      if (u.t >= u.life) {
        if (spawn-- > 0) {
          const c = 1 + Math.floor(Math.random() * (COLS - 2)), r = 1 + Math.floor(Math.random() * (ROWS - 2));
          if (isFloor(c, r)) { m.position.set(c + Math.random(), 0.03, r + Math.random()); u.t = 0; u.life = 0.4 + Math.random() * 0.3; m.visible = true; }
          else m.visible = false;
        } else m.visible = false;
        continue;
      }
      u.t += dt;
      const k = u.t / u.life;
      m.scale.setScalar(1 + k * 3.2);
      m.material.opacity = (1 - k) * 0.8;
    }
  }

  // ---------- 公園長椅(extra.glb 的 prop_bench,椅背預設朝北;方向隨地圖)----------
  const benchGroup = new THREE.Group();
  scene.add(benchGroup);
  let benchKey = '';
  const BENCH_YAW = { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };
  function syncBenches() {
    const list = typeof benches === 'object' ? Object.values(benches) : [];
    const key = list.map((b) => b.c + ',' + b.r + b.back).join('|') + (extraLib.ready ? '+' : '-');
    if (key === benchKey) return;
    benchKey = key;
    while (benchGroup.children.length) benchGroup.remove(benchGroup.children[0]);
    for (const b of list) {
      let o = extraLib.ready && extraLib.nodes.prop_bench ? cloneNode(extraLib.nodes.prop_bench) : null;
      if (!o) {   // 模型還沒載入:先用木色方塊代替
        o = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.36), new THREE.MeshStandardMaterial({ color: 0x7a4a24 }));
        box.position.y = 0.15;
        o.add(box);
      }
      o.position.set(b.c + 0.5, 0, b.r + 0.5);
      o.rotation.y = BENCH_YAW[b.back] || 0;
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      benchGroup.add(o);
    }
    renderer.shadowMap.needsUpdate = true;
  }

  // ---------- 下雪(雪花 + 地面雪跡)、火山灰、外星人飛碟 ----------
  const FLAKE_N = 500;
  const flakePos = new Float32Array(FLAKE_N * 3);
  const flakeGeo = new THREE.BufferGeometry();
  flakeGeo.setAttribute('position', new THREE.BufferAttribute(flakePos, 3));
  const flakeTex = glowTexture([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
  const flakeMat = new THREE.PointsMaterial({ size: 0.09, map: flakeTex, transparent: true, depthWrite: false, color: 0xffffff });
  const flakes = new THREE.Points(flakeGeo, flakeMat);
  flakes.frustumCulled = false; flakes.visible = false;
  scene.add(flakes);
  const flakeV = [];
  for (let i = 0; i < FLAKE_N; i++) {
    flakePos.set([Math.random() * (COLS + 4) - 2, Math.random() * 6, Math.random() * (ROWS + 4) - 2], i * 3);
    flakeV.push(0.6 + Math.random() * 0.7);
  }
  // 地面雪跡:一張半透明的白斑貼圖蓋在地面上,越下越白
  const snowCv = document.createElement('canvas'); snowCv.width = COLS * 32; snowCv.height = ROWS * 32;
  (function paintSnow() {
    const g = snowCv.getContext('2d');
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < COLS * ROWS * 6; i++) {
      const x = rnd() * snowCv.width, y = rnd() * snowCv.height, r = 4 + rnd() * 12;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(250,252,255,0.95)'); gr.addColorStop(1, 'rgba(250,252,255,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r * 1.4, r, rnd() * 3, 0, Math.PI * 2); g.fill();
    }
  })();
  const snowGround = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(snowCv), transparent: true, opacity: 0, depthWrite: false }));
  snowGround.rotation.x = -Math.PI / 2;
  snowGround.position.set(COLS / 2, 0.012, ROWS / 2);
  snowGround.visible = false;
  scene.add(snowGround);
  // 飛碟 + 光束
  const ufo = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(0.6, 28, 12), new THREE.MeshStandardMaterial({ color: 0xa7b0b8, metalness: 0.8, roughness: 0.3 }));
  disc.scale.set(1, 0.24, 1);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x8be6ff, transparent: true, opacity: 0.8, roughness: 0.1 }));
  dome.position.y = 0.08;
  ufo.add(disc, dome);
  const ufoLights = [];
  for (let i = 0; i < 8; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffeb3b }));
    l.position.set(Math.cos(i / 8 * Math.PI * 2) * 0.55, -0.02, Math.sin(i / 8 * Math.PI * 2) * 0.55);
    ufo.add(l); ufoLights.push(l);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.62, 1, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xbaff8c, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  ufo.visible = false; beam.visible = false;
  scene.add(ufo, beam);
  const wxClock = new THREE.Clock();
  function updateWeatherFx() {
    const dt = Math.min(0.05, wxClock.getDelta());
    const w = typeof weatherDef === 'function' ? weatherDef() : {};
    const fall = !!(w.snow || w.ash);
    flakes.visible = fall;
    if (fall) {
      flakeMat.color.set(w.ash ? 0x3d3530 : 0xffffff);
      flakeMat.size = w.ash ? 0.07 : 0.09;
      const t = performance.now() / 1000;
      for (let i = 0; i < FLAKE_N; i++) {
        let y = flakePos[i * 3 + 1] - flakeV[i] * dt;
        let x = flakePos[i * 3] + Math.sin(t + i) * 0.15 * dt;
        if (y < 0) { y = 5 + Math.random(); x = Math.random() * (COLS + 4) - 2; flakePos[i * 3 + 2] = Math.random() * (ROWS + 4) - 2; }
        flakePos[i * 3] = x; flakePos[i * 3 + 1] = y;
      }
      flakeGeo.attributes.position.needsUpdate = true;
    }
    snowGround.visible = !!w.snow;
    if (w.snow) snowGround.material.opacity = Math.min(0.85, 0.15 + env.t / 6);
    const a = typeof env !== 'undefined' && env.abduct;
    ufo.visible = beam.visible = !!(a && a.f);
    if (ufo.visible) {
      const f = a.f, k = Math.min(1, a.t / ALIEN_BEAM);
      const x = f.x / TS, z = f.y / TS, top = 2.6 + Math.sin(performance.now() / 300) * 0.08;
      ufo.position.set(x, top, z);
      ufo.rotation.y += dt * 2;
      ufoLights.forEach((l, i) => l.material.color.set((Math.floor(performance.now() / 120) + i) % 2 ? 0xffeb3b : 0xff5252));
      beam.position.set(x, top / 2, z);
      beam.scale.set(1, top, 1);
      beam.material.opacity = 0.25 + k * 0.35;
    }
  }

  // ---------- 渲染迴圈 ----------
  function frame() {
    requestAnimationFrame(frame);
    if (window.VIEW && VIEW.mode !== '3d') return; // 2D 模式:3D 暫停,不耗效能
    if (typeof player === 'undefined' || !player || !grid.length) {
      renderer.render(scene, camera);
      return;
    }
    syncBoard();
    syncBenches();
    if (propsJustLoaded) { // 模型庫剛載入:清掉替代模型,下面的 sync 會用正式模型重建
      propsJustLoaded = false;
      for (const cache of [ballCache, itemCache, petCache, wildCache]) {
        for (const g of cache.values()) scene.remove(g);
        cache.clear();
      }
    }
    if (charsJustLoaded && mapLib.chars && mapLib.chars.ready && mapLib.anims && mapLib.anims.ready) {
      charsJustLoaded = false;
      for (const g of charCache.values()) scene.remove(g);
      charCache.clear();
    }
    syncBalls();
    syncChars();
    syncPets();
    syncItems();
    syncFx();
    syncDuck();
    updateRain();
    updateWeatherFx();
    if (inkEl) inkEl.style.opacity = blindAlpha(); // 墨魚黑畫面 / 火山灰
    updateCamera();
    updateOcclusion();
    renderer.render(scene, camera);
    trackFps();
  }
  frame();
})();
