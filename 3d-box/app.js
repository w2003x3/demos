/**
 * 3D 紙箱生成器 - 展開圖與摺疊動畫 v2
 * Box Generator with Dieline and Folding Animation
 * 
 * 參考: https://graphicdesign.stackexchange.com/questions/124429/dieline-image-to-a-box-in-three-js
 * 使用 pivot points 和 hierarchies 實現真實的摺疊效果
 */

// ===== 全域變數 =====
let scene, camera, renderer, controls;
let boxGroup = null;
let boxParts = {};
let foldProgress = 0; // 0 = 展開, 1 = 摺疊完成
let openProgress = 0; // 0 = 合箱, 1 = 開箱
let isAnimating = false;

// 紙箱參數
let boxParams = {
    width: 150,
    depth: 100,
    height: 120,
    thickness: 3,        // 紙板厚度 (mm)
    type: 'standard',
    color: 0xb5895a,
    showTexture: true
};

// ===== 初始化 =====
function init() {
    // 場景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f0f1a);

    // 相機
    camera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.1,
        2000
    );
    camera.position.set(350, 400, 450);

    // 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // 軌道控制器
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 150;
    controls.maxDistance = 1000;
    controls.target.set(0, 50, 0);

    // 燈光
    setupLights();

    // 地板
    setupGround();

    // 初始紙箱（展開狀態）
    createDieline();

    // 事件監聽
    setupEventListeners();

    // 動畫循環
    animate();
}

// ===== 燈光設置 =====
function setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(300, 500, 400);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    // 消除薄板自陰影的同心弧紋(shadow acne)
    mainLight.shadow.bias = -0.0002;
    mainLight.shadow.normalBias = 3;
    mainLight.shadow.camera.near = 100;
    mainLight.shadow.camera.far = 1200;
    mainLight.shadow.camera.left = -400;
    mainLight.shadow.camera.right = 400;
    mainLight.shadow.camera.top = 400;
    mainLight.shadow.camera.bottom = -400;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x6366f1, 0.25);
    fillLight.position.set(-200, 100, -100);
    scene.add(fillLight);

    const backLight = new THREE.DirectionalLight(0x22c55e, 0.15);
    backLight.position.set(0, 100, -300);
    scene.add(backLight);
}

// ===== 地板設置 =====
function setupGround() {
    const gridHelper = new THREE.GridHelper(800, 40, 0x333355, 0x222244);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    const groundGeometry = new THREE.PlaneGeometry(800, 800);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.9,
        metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);
}

// ===== 創建紙板材質 =====
// 牛皮紙面：平整底色 + 雲狀色斑 + 紙纖維噪點。
// （不畫規律的深色橫線與邊框——那會看起來像木板拼接）
function createCardboardTexture(width, height, label = '', isInside = false) {
    const canvas = document.createElement('canvas');
    // 固定 2 次冪尺寸:WebGL1 下非 2 次冪貼圖無法產生 mipmap,
    // 縮小時會出現嚴重摩爾紋(弧形干涉紋)
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // 基礎顏色（內面為未印刷的原色，略淺）
    const baseColor = new THREE.Color(boxParams.color);
    let r = Math.floor(baseColor.r * 255);
    let g = Math.floor(baseColor.g * 255);
    let b = Math.floor(baseColor.b * 255);

    if (isInside) {
        r = Math.min(255, r + 18);
        g = Math.min(255, g + 15);
        b = Math.min(255, b + 12);
    }

    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (boxParams.showTexture) {
        // 紙纖維細點(稀疏、低對比;有 mipmap 後縮小時會自然融為霧面質感)
        for (let i = 0; i < 130; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            ctx.fillStyle = Math.random() > 0.55 ? 'rgba(80, 50, 20, 0.05)' : 'rgba(255, 245, 220, 0.05)';
            ctx.fillRect(x, y, 2 + Math.random() * 3, 2);
        }
    }

    // 面板標籤（淡浮水印，摺疊後幾乎不干擾外觀）
    if (label) {
        ctx.fillStyle = 'rgba(60, 35, 10, 0.1)';
        ctx.font = `bold ${Math.min(canvas.width, canvas.height) * 0.22}px "Noto Sans TC", Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, canvas.width / 2, canvas.height / 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    if (renderer) texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    return new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.DoubleSide
    });
}

// ===== 瓦楞斷面材質（紙板側邊露出的波浪芯紙）=====
// vertical=false：波浪沿貼圖 U 方向（用於 ±Y 邊）；true：沿 V 方向（用於 ±X 邊）
function createFluteMaterial(edgeLengthMM, vertical = false) {
    const t = Math.max(0.5, boxParams.thickness);
    const canvas = document.createElement('canvas');
    canvas.width = vertical ? 32 : 128;
    canvas.height = vertical ? 128 : 32;
    const ctx = canvas.getContext('2d');

    const base = new THREE.Color(boxParams.color).multiplyScalar(0.9);
    ctx.fillStyle = `rgb(${base.r * 255 | 0}, ${base.g * 255 | 0}, ${base.b * 255 | 0})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (vertical) {
        ctx.translate(16, 64);
        ctx.rotate(Math.PI / 2);
        ctx.translate(-64, -16);
    }

    if (boxParams.showTexture) {
        // 中央波浪芯紙（瓦楞的視覺特徵）
        ctx.strokeStyle = 'rgba(85, 55, 25, 0.55)';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        for (let x = 0; x <= 128; x += 2) {
            const y = 16 + Math.sin((x / 128) * Math.PI * 8) * 9;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // 上下兩層襯紙
        ctx.strokeStyle = 'rgba(85, 55, 25, 0.4)';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(0, 1.5); ctx.lineTo(128, 1.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 30.5); ctx.lineTo(128, 30.5); ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    // 每張貼圖畫 4 個波峰，波距約 2.4 倍紙厚 → 依邊長計算重複次數
    const repeats = Math.max(1, Math.round(edgeLengthMM / (t * 9.6)));
    if (vertical) {
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, repeats);
    } else {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.repeat.set(repeats, 1);
    }

    return new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.95,
        metalness: 0.0
    });
}

// ===== 創建單個面板（具真實厚度）=====
function createPanel(width, height, label = '') {
    const t = Math.max(0.1, boxParams.thickness);

    // 用 BoxGeometry 取代 PlaneGeometry，讓紙板有厚度
    const geometry = new THREE.BoxGeometry(width, height, t);

    const outerMat = createCardboardTexture(width, height, label, false); // 外面（有標籤）
    const innerMat = createCardboardTexture(width, height, '', true);      // 內面（較亮）
    const edgeMatH = createFluteMaterial(height, true);   // ±X 邊（長度 = height）
    const edgeMatW = createFluteMaterial(width, false);   // ±Y 邊（長度 = width）

    // BoxGeometry 材質順序：[+X, -X, +Y, -Y, +Z, -Z]
    // +Z 為外面、-Z 為內面，其餘四邊為瓦楞斷面
    const materials = [edgeMatH, edgeMatH, edgeMatW, edgeMatW, outerMat, innerMat];

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

// ===== 建立展開圖 (Dieline) =====
function createDieline() {
    if (boxGroup) {
        scene.remove(boxGroup);
        boxGroup = null;
        boxParts = {};
    }

    boxGroup = new THREE.Group();

    const w = boxParams.width;
    const d = boxParams.depth;
    const h = boxParams.height;

    switch (boxParams.type) {
        case 'standard':
            createStandardDieline(w, d, h);
            break;
        case 'lidbase':
            createLidBaseDieline(w, d, h);
            break;
        case 'airplane':
            createAirplaneDieline(w, d, h);
            break;
    }

    scene.add(boxGroup);

    // 重置動畫狀態
    foldProgress = 0;
    openProgress = 0;
    updateAnimation();
    document.getElementById('animation-progress').value = 0;
    updateButtonStates();
}

// ===== 通用摺疊面板 =====
/**
 * 在「標準座標系」中建立一片可摺疊的牆面，再用 orientY 旋轉到正確方向。
 * 標準座標系：朝外方向 = 區域 +Z，鉸鏈線沿著 X 軸。
 * 所有牆面都用同一套邏輯：hinge.rotation.x = -角度 → 一律「向上摺起」，
 * 因此不會有左右正負號相反的問題。
 *
 * @returns {{orienter:THREE.Group, hinge:THREE.Group, flapPivot:THREE.Group|null}}
 */
function makeWall(parent, options) {
    const {
        orientY = 0,        // 繞 Y 軸旋轉，決定這片牆朝哪個方向
        edge,               // 中心到鉸鏈的距離
        wallWidth,          // 牆面寬（沿鉸鏈方向）
        wallHeight,         // 牆面高（摺起後的高度）
        flapDepth = 0,      // 頂蓋深度，0 = 沒有頂蓋
        flapWidth = wallWidth, // 頂蓋寬（預設同牆寬；牆板為補轉角加寬時,蓋片仍維持箱口尺寸）
        flapLift = 0,       // 頂蓋墊高量（讓後闔的蓋片疊在先闔的上方，避免穿模）
        tabWidth = 0,       // 左右兩側膠摺片寬度，0 = 沒有摺片
        label = '',
        flapLabel = ''
    } = options;

    const orienter = new THREE.Group();
    orienter.rotation.y = orientY;
    parent.add(orienter);

    // 鉸鏈：位於底板邊緣再外推半個紙厚，
    // 摺起後牆板「內面貼齊底板邊緣、厚度向外」，四面牆才會與底板及彼此相接不留縫
    const tHalf = Math.max(0.1, boxParams.thickness) / 2;
    const hinge = new THREE.Group();
    hinge.position.set(0, tHalf, edge + tHalf);
    orienter.add(hinge);

    // 牆面：平躺向 +Z 延伸；hinge.rotation.x = -角度 時往上立起
    const wall = createPanel(wallWidth, wallHeight, label);
    wall.rotation.x = -Math.PI / 2;
    wall.position.set(0, 0, wallHeight / 2);
    hinge.add(wall);

    let flapPivot = null;
    if (flapDepth > 0) {
        // 頂蓋鉸鏈掛在「牆面鉸鏈」上（不是掛在已旋轉的 mesh 上），
        // 位於牆面頂端，會跟著牆面一起立起，再各自往內摺。
        flapPivot = new THREE.Group();
        flapPivot.position.set(0, 0, wallHeight + flapLift);
        hinge.add(flapPivot);

        const flap = createPanel(flapWidth, flapDepth, flapLabel);
        flap.rotation.x = -Math.PI / 2;
        flap.position.set(0, 0, flapDepth / 2);
        flapPivot.add(flap);
    }

    // 左右兩側的膠摺片（防塵/黏合摺片）：沿牆面兩條垂直邊，組裝時往內摺 90°
    // 摺片內縮一個紙厚，使其摺入後「嵌在相鄰牆內側」而非與其共面（避免穿模）
    const tabs = [];
    if (tabWidth > 0) {
        const inset = Math.max(0, boxParams.thickness);
        [1, -1].forEach(sign => {
            const tabPivot = new THREE.Group();
            tabPivot.position.set(sign * (wallWidth / 2 - inset), 0, 0);
            hinge.add(tabPivot);

            const tab = createPanel(tabWidth, wallHeight);
            tab.rotation.x = -Math.PI / 2;
            tab.position.set(sign * tabWidth / 2, 0, wallHeight / 2);
            tabPivot.add(tab);

            tabs.push({ pivot: tabPivot, sign });
        });
    }

    return { orienter, hinge, flapPivot, tabs };
}

// ===== 一般紙箱展開圖 =====
function createStandardDieline(w, d, h) {
    const t = Math.max(0.1, boxParams.thickness);

    // 底板 (中心基準點)，平放於地面上
    const bottom = createPanel(w, d, '底板');
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(0, t / 2, 0);
    boxGroup.add(bottom);
    boxParts.bottom = bottom;

    // 前後牆兩側帶膠摺片（組裝時往內摺、貼合左右牆形成箱角）
    const tabW = Math.min(30, Math.min(w, d) * 0.3);

    // 蓋片分兩層：前後蓋先闔（貼住箱口），左右蓋疊在其上方一個紙厚，
    // 各層內兩片蓋互補（各蓋一半），不會穿模也不會懸空
    const L = t + 0.3;

    // 四面牆 + 頂蓋。前後蓋片深度各 d/2、左右蓋片深度各 w/2，各自成層蓋滿頂部。
    // 左右牆(後摺的外層)各加寬 2t 包住前後牆邊緣,補起轉角因紙厚產生的缺口;
    // 蓋片以 flapWidth 維持箱口尺寸,不隨牆加寬。
    boxParts.walls = [
        makeWall(boxGroup, { orientY: 0, edge: d / 2, wallWidth: w, wallHeight: h, flapDepth: d / 2, flapLift: 0, tabWidth: tabW, label: '前面', flapLabel: '前蓋' }),
        makeWall(boxGroup, { orientY: Math.PI, edge: d / 2, wallWidth: w, wallHeight: h, flapDepth: d / 2, flapLift: 0, tabWidth: tabW, label: '後面', flapLabel: '後蓋' }),
        makeWall(boxGroup, { orientY: Math.PI / 2, edge: w / 2, wallWidth: d + 2 * t, wallHeight: h, flapDepth: w / 2, flapWidth: d, flapLift: L, label: '右面', flapLabel: '右蓋' }),
        makeWall(boxGroup, { orientY: -Math.PI / 2, edge: w / 2, wallWidth: d + 2 * t, wallHeight: h, flapDepth: w / 2, flapWidth: d, flapLift: L, label: '左面', flapLabel: '左蓋' })
    ];

    // 組裝時序（避免穿模）：膠片→前後牆→左右牆；闔蓋依序 前後（內層）→ 左右（外層）。
    // 開箱則相反（由外而內）：左右先掀、前後後掀。
    boxParts.walls[0].seq = { fold: [0.12, 0.40], flap: [0.62, 0.78], openFlap: [0.50, 0.95] }; // 前
    boxParts.walls[1].seq = { fold: [0.12, 0.40], flap: [0.62, 0.78], openFlap: [0.50, 0.95] }; // 後
    boxParts.walls[2].seq = { fold: [0.42, 0.60], flap: [0.82, 1.00], openFlap: [0.00, 0.45] }; // 右
    boxParts.walls[3].seq = { fold: [0.42, 0.60], flap: [0.82, 1.00], openFlap: [0.00, 0.45] }; // 左
}

// ===== 天地蓋展開圖 =====
function createLidBaseDieline(w, d, h) {
    const baseH = h * 0.6;
    const lidH = h * 0.4;
    const overlap = 10;
    const gap = w + 80;

    // ===== 底座 =====
    const baseGroup = new THREE.Group();
    baseGroup.position.set(-gap / 2, 0, 0);
    boxGroup.add(baseGroup);
    boxParts.baseGroup = baseGroup;

    const baseBottom = createPanel(w, d, '底座');
    baseBottom.rotation.x = -Math.PI / 2;
    baseBottom.position.set(0, Math.max(0.1, boxParams.thickness) / 2, 0);
    baseGroup.add(baseBottom);

    const t = Math.max(0.1, boxParams.thickness);
    const tabW = Math.min(25, Math.min(w, d) * 0.3);
    boxParts.baseWalls = [
        makeWall(baseGroup, { orientY: 0, edge: d / 2, wallWidth: w, wallHeight: baseH, tabWidth: tabW }),
        makeWall(baseGroup, { orientY: Math.PI, edge: d / 2, wallWidth: w, wallHeight: baseH, tabWidth: tabW }),
        makeWall(baseGroup, { orientY: Math.PI / 2, edge: w / 2, wallWidth: d + 2 * t, wallHeight: baseH }),
        makeWall(baseGroup, { orientY: -Math.PI / 2, edge: w / 2, wallWidth: d + 2 * t, wallHeight: baseH })
    ];

    // ===== 蓋子（略大，可罩住底座）=====
    const lidW = w + overlap;
    const lidD = d + overlap;
    const lidGroup = new THREE.Group();
    lidGroup.position.set(gap / 2, 0, 0);
    boxGroup.add(lidGroup);
    boxParts.lidGroup = lidGroup;

    const lidTop = createPanel(lidW, lidD, '蓋子');
    lidTop.rotation.x = -Math.PI / 2;
    lidTop.position.set(0, Math.max(0.1, boxParams.thickness) / 2, 0);
    lidGroup.add(lidTop);

    boxParts.lidWalls = [
        makeWall(lidGroup, { orientY: 0, edge: lidD / 2, wallWidth: lidW, wallHeight: lidH }),
        makeWall(lidGroup, { orientY: Math.PI, edge: lidD / 2, wallWidth: lidW, wallHeight: lidH }),
        makeWall(lidGroup, { orientY: Math.PI / 2, edge: lidW / 2, wallWidth: lidD + 2 * t, wallHeight: lidH }),
        makeWall(lidGroup, { orientY: -Math.PI / 2, edge: lidW / 2, wallWidth: lidD + 2 * t, wallHeight: lidH })
    ];

    boxParts.lidDims = { baseH, lidH, gap };
}

// ===== 飛機盒 / 對開蓋（前插舌 mailer）展開圖 =====
function createAirplaneDieline(w, d, h) {
    const t = boxParams.thickness;
    const tabW = Math.min(45, w * 0.4);        // 側牆防塵摺片寬度
    const tuckDepth = Math.min(h * 0.7, 45);   // 上蓋前緣插舌深度
    const lidLift = Math.max(1.5, t * 1.5);    // 上蓋墊高，避免壓到側牆頂
    const tuckInset = t * 1.5 + 1;             // 插舌內縮，插入前牆內側而非共面

    // 底板，平放於地面上
    const bottom = createPanel(w, d, '底板');
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(0, t / 2, 0);
    boxGroup.add(bottom);
    boxParts.bottom = bottom;

    // 左右側牆（各帶前後兩片防塵摺片，組裝時往內摺）
    const left = makeWall(boxGroup, { orientY: -Math.PI / 2, edge: w / 2, wallWidth: d, wallHeight: h, tabWidth: tabW, label: '左側' });
    const right = makeWall(boxGroup, { orientY: Math.PI / 2, edge: w / 2, wallWidth: d, wallHeight: h, tabWidth: tabW, label: '右側' });
    boxParts.sideWalls = [left, right];

    // 前牆（插舌會插入此牆內側；加寬 2t 包住左右側牆邊緣,補轉角缺口）
    boxParts.frontWall = makeWall(boxGroup, { orientY: 0, edge: d / 2, wallWidth: w + 2 * t, wallHeight: h, label: '前牆' });

    // 後牆（上蓋鉸接於此頂端,同樣加寬補轉角）
    const back = makeWall(boxGroup, { orientY: Math.PI, edge: d / 2, wallWidth: w + 2 * t, wallHeight: h, label: '後牆' });
    boxParts.backWall = back;

    // 上蓋：鉸接在後牆頂端，往前蓋住整個盒口（深度 = d）
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0, h + lidLift);
    back.hinge.add(lidPivot);

    const lid = createPanel(w, d, '上蓋');
    lid.rotation.x = -Math.PI / 2;
    lid.position.set(0, 0, d / 2);
    lidPivot.add(lid);

    // 插舌：鉸接在上蓋前緣，蓋好後往下插入前牆內側
    const tuckPivot = new THREE.Group();
    tuckPivot.position.set(0, 0, d - tuckInset);
    lidPivot.add(tuckPivot);

    const tuck = createPanel(w, tuckDepth, '插舌');
    tuck.rotation.x = -Math.PI / 2;
    tuck.position.set(0, 0, tuckDepth / 2);
    tuckPivot.add(tuck);

    boxParts.mailer = { lidPivot, tuckPivot };
}

// ===== 時序輔助：把全域進度 p 映射到 [start,end] 視窗內的 0~1 =====
function phase(p, start, end) {
    if (end <= start) return p >= end ? 1 : 0;
    return Math.max(0, Math.min(1, (p - start) / (end - start)));
}

// 緩入緩出，讓每個階段的起停更自然
function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ===== 更新動畫 =====
function updateAnimation() {
    switch (boxParams.type) {
        case 'standard':
            updateWallsAnimation();
            break;
        case 'airplane':
            updateMailerAnimation();
            break;
        case 'lidbase':
            updateLidBaseAnimation();
            break;
    }
}

// 飛機盒 / 對開蓋：① 左右側牆+防塵摺片 → ② 前後牆 → ③ 上蓋蓋下 → ④ 插舌插入
// 開蓋則相反：插舌先抽出 → 再掀蓋
function updateMailerAnimation() {
    const m = boxParts.mailer;
    if (!m) return;

    // ① 左右側牆立起，防塵摺片先往內摺
    const sideFold = easeInOut(phase(foldProgress, 0.05, 0.28));
    const dustFold = easeInOut(phase(foldProgress, 0.10, 0.30));
    if (boxParts.sideWalls) boxParts.sideWalls.forEach(p => {
        p.hinge.rotation.x = -sideFold * Math.PI / 2;
        if (p.tabs) p.tabs.forEach(tb => { tb.pivot.rotation.z = tb.sign * dustFold * Math.PI / 2; });
    });

    // ② 前、後牆立起（蓋住防塵摺片）
    const endFold = easeInOut(phase(foldProgress, 0.32, 0.50));
    if (boxParts.frontWall) boxParts.frontWall.hinge.rotation.x = -endFold * Math.PI / 2;
    if (boxParts.backWall) boxParts.backWall.hinge.rotation.x = -endFold * Math.PI / 2;

    // ③ 上蓋蓋下、④ 插舌插入；組裝完成後 openProgress 控制開蓋
    if (foldProgress >= 1) {
        const tuckOut = easeInOut(phase(openProgress, 0.00, 0.30)); // 插舌先抽出
        const lidUp = easeInOut(phase(openProgress, 0.30, 0.90));   // 再掀蓋
        m.tuckPivot.rotation.x = -Math.PI / 2 + tuckOut * Math.PI / 2;
        m.lidPivot.rotation.x = -Math.PI / 2 + lidUp * Math.PI / 2;
    } else {
        const lidFold = easeInOut(phase(foldProgress, 0.54, 0.78));
        const tuckFold = easeInOut(phase(foldProgress, 0.82, 1.00));
        m.lidPivot.rotation.x = -lidFold * Math.PI / 2;
        m.tuckPivot.rotation.x = -tuckFold * Math.PI / 2;
    }
}

// 一般紙箱：依各面板的時序視窗「先後」摺動，避免穿模
function updateWallsAnimation() {
    if (!boxParts.walls) return;

    boxParts.walls.forEach(part => {
        const seq = part.seq || { fold: [0, 1] };

        // 牆面向上立起（依自己的時間窗）
        const f = easeInOut(phase(foldProgress, seq.fold[0], seq.fold[1]));
        part.hinge.rotation.x = -f * Math.PI / 2;

        // 膠摺片：在自己牆面開始立起時的前 70% 內摺好（先於相鄰牆覆蓋）
        if (part.tabs && part.tabs.length) {
            const tabEnd = seq.fold[0] + (seq.fold[1] - seq.fold[0]) * 0.7;
            const ta = easeInOut(phase(foldProgress, seq.fold[0], tabEnd));
            part.tabs.forEach(t => { t.pivot.rotation.z = t.sign * ta * Math.PI / 2; });
        }

        // 頂蓋
        if (part.flapPivot) {
            if (foldProgress >= 1) {
                // 已組裝完成 → 開箱：依 openFlap 時序「外蓋先掀、內蓋後掀」
                const ow = seq.openFlap || [0, 1];
                const oa = easeInOut(phase(openProgress, ow[0], ow[1]));
                part.flapPivot.rotation.x = -Math.PI / 2 + oa * Math.PI / 2;
            } else {
                // 組裝過程：依 flap 時序往內闔上（內蓋先、外蓋後）
                const fw = seq.flap || [0.5, 1];
                const fa = easeInOut(phase(foldProgress, fw[0], fw[1]));
                part.flapPivot.rotation.x = -fa * Math.PI / 2;
            }
        }
    });
}

function updateLidBaseAnimation() {
    const h = boxParams.height;
    const dims = boxParts.lidDims || { baseH: h * 0.6, lidH: h * 0.4, gap: boxParams.width + 80 };
    const { baseH, lidH, gap } = dims;

    // 時序：① 底座四面立起 → ② 蓋子四面立起 → ③ 底座滑入中央
    //       → ④ 蓋子滑到中央上方並翻轉 → ⑤ 由上而下蓋合
    const baseFold = easeInOut(phase(foldProgress, 0.00, 0.28));
    const baseTab = easeInOut(phase(foldProgress, 0.00, 0.20));
    const lidFold = easeInOut(phase(foldProgress, 0.16, 0.44));
    const baseMove = easeInOut(phase(foldProgress, 0.44, 0.60));
    const lidMove = easeInOut(phase(foldProgress, 0.52, 0.78));
    const lidDrop = easeInOut(phase(foldProgress, 0.78, 1.00));

    if (boxParts.baseWalls) boxParts.baseWalls.forEach(p => {
        p.hinge.rotation.x = -baseFold * Math.PI / 2;
        if (p.tabs) p.tabs.forEach(t => { t.pivot.rotation.z = t.sign * baseTab * Math.PI / 2; });
    });
    if (boxParts.lidWalls) boxParts.lidWalls.forEach(p => { p.hinge.rotation.x = -lidFold * Math.PI / 2; });

    // 底座滑到中央
    if (boxParts.baseGroup) {
        boxParts.baseGroup.position.x = (-gap / 2) * (1 - baseMove);
    }

    // 蓋子滑到中央、翻轉 180°、先升到上方懸停，再垂直降下蓋住底座
    if (boxParts.lidGroup) {
        const t = Math.max(0.1, boxParams.thickness);
        const seatY = baseH + t + 0.5;       // 蓋合後蓋頂高度：蓋板落在底座牆頂上，蓋牆罩住底座外側
        const hoverY = baseH + lidH * 2 + 25; // 翻轉/移動時的懸停高度

        boxParts.lidGroup.position.x = (gap / 2) * (1 - lidMove);
        boxParts.lidGroup.rotation.x = Math.PI * lidMove;

        let y = hoverY * lidMove;            // 移動階段：升到懸停高度
        if (foldProgress >= 0.78) {
            y = hoverY + (seatY - hoverY) * lidDrop;  // 蓋合階段：由上而下降到定位
        }
        if (foldProgress >= 1) {
            y = seatY + openProgress * h * 0.5;       // 開箱：整個蓋子往上掀
        }
        boxParts.lidGroup.position.y = y;
    }
}

// ===== 動畫控制 =====
function animateFold(targetProgress) {
    if (isAnimating) return;
    isAnimating = true;

    gsap.to({ progress: foldProgress }, {
        progress: targetProgress,
        duration: 1.5,
        ease: "power2.inOut",
        onUpdate: function () {
            foldProgress = this.targets()[0].progress;
            updateAnimation();
            document.getElementById('animation-progress').value = foldProgress * 100;
        },
        onComplete: function () {
            isAnimating = false;
            updateButtonStates();
        }
    });
}

function animateOpen(targetProgress) {
    if (isAnimating || foldProgress < 1) return;
    isAnimating = true;

    gsap.to({ progress: openProgress }, {
        progress: targetProgress,
        duration: 1,
        ease: "power2.inOut",
        onUpdate: function () {
            openProgress = this.targets()[0].progress;
            updateAnimation();
            document.getElementById('animation-progress').value = 100 + openProgress * 50;
        },
        onComplete: function () {
            isAnimating = false;
            updateButtonStates();
        }
    });
}

function updateButtonStates() {
    const btn1 = document.getElementById('open-box');
    const btn2 = document.getElementById('close-box');

    if (foldProgress < 1) {
        btn1.innerHTML = '<span class="btn-text">📐 摺疊</span>';
        btn2.innerHTML = '<span class="btn-text">📄 展開</span>';
    } else {
        btn1.innerHTML = '<span class="btn-text">📤 開箱</span>';
        btn2.innerHTML = '<span class="btn-text">📥 合箱</span>';
    }
}

// ===== 事件監聽 =====
function setupEventListeners() {
    // 紙箱類型選擇
    document.querySelectorAll('.box-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.box-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            boxParams.type = btn.dataset.type;
            createDieline();
        });
    });

    // 尺寸控制
    ['width', 'depth', 'height'].forEach(dim => {
        const slider = document.getElementById(`${dim}-slider`);
        const input = document.getElementById(dim);
        const display = document.getElementById(`display-${dim}`);

        const updateDimension = (value) => {
            value = Math.max(50, Math.min(300, parseInt(value) || 100));
            slider.value = value;
            input.value = value;
            if (display) display.textContent = value;
            boxParams[dim] = value;
            createDieline();
        };

        slider.addEventListener('input', () => updateDimension(slider.value));
        input.addEventListener('change', () => updateDimension(input.value));
    });

    // 紙板厚度
    const thicknessSlider = document.getElementById('thickness-slider');
    const thicknessInput = document.getElementById('thickness');
    if (thicknessSlider && thicknessInput) {
        const updateThickness = (value) => {
            value = Math.max(0, Math.min(10, parseFloat(value) || 0));
            thicknessSlider.value = value;
            thicknessInput.value = value;
            boxParams.thickness = value;
            createDieline();
        };
        thicknessSlider.addEventListener('input', () => updateThickness(thicknessSlider.value));
        thicknessInput.addEventListener('change', () => updateThickness(thicknessInput.value));
    }

    // 動畫按鈕
    document.getElementById('open-box').addEventListener('click', () => {
        if (isAnimating) return;
        if (foldProgress < 1) {
            animateFold(1);
        } else if (openProgress < 1) {
            animateOpen(1);
        }
    });

    document.getElementById('close-box').addEventListener('click', () => {
        if (isAnimating) return;
        if (foldProgress >= 1 && openProgress > 0) {
            animateOpen(0);
        } else if (foldProgress > 0) {
            animateFold(0);
        }
    });

    // 動畫進度滑桿：0~100 = 摺疊組裝，100~150 = 開箱
    document.getElementById('animation-progress').addEventListener('input', (e) => {
        if (isAnimating) return;
        const v = parseInt(e.target.value);
        if (v <= 100) {
            foldProgress = v / 100;
            openProgress = 0;
        } else {
            foldProgress = 1;
            openProgress = (v - 100) / 50;
        }
        updateAnimation();
        updateButtonStates();
    });

    // 顏色
    document.getElementById('box-color').addEventListener('input', (e) => {
        boxParams.color = parseInt(e.target.value.replace('#', ''), 16);
        createDieline();
    });

    // 紋理開關
    document.getElementById('show-texture').addEventListener('change', (e) => {
        boxParams.showTexture = e.target.checked;
        createDieline();
    });

    // 視窗大小
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// ===== 動畫循環 =====
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// ===== 啟動 =====
window.addEventListener('load', init);
