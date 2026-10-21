/**
 * cab.js — 駕駛室(three.js 程序化建模,取代模型庫的簡易駕駛室)。
 * 座標:地板 y = 0、前方 -Z、右 +X、公尺;鏡頭在 (0, 1.62, 0.05)。
 * 保留執行端用到的節點名稱:MasterLever(主控制器握把)、SpeedScreen / InfoScreen(螢幕,貼 canvas)。
 */
import * as THREE from 'three';

const W = 1.45;          // 半寬(車體內側)
const H = 2.15;          // 天花板高
const FRONT = -1.62;     // 前擋玻璃下緣位置
const BACK = 1.62;       // 後牆(第三人稱鏡頭在 z = 1.36,要在牆內)

function canvasTex(w, h, draw, repeat = [1, 1]) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 4;
    return t;
}

export function buildCab() {
    const g = new THREE.Group();
    g.name = 'Cab';
    const M = {
        panel: new THREE.MeshStandardMaterial({ color: 0xC3C8CC, roughness: 0.55, metalness: 0.05,
            map: canvasTex(256, 256, (c, w, h) => {      // 牆板:淡灰 + 板縫
                c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
                c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, 0, w, 2); c.fillRect(0, 0, 2, h);
                c.fillStyle = 'rgba(0,0,0,0.05)';
                for (let i = 0; i < 900; i++) c.fillRect(Math.random() * w, Math.random() * h, 1, 1);
            }, [2, 1]) }),
        trim: new THREE.MeshStandardMaterial({ color: 0x2A2E33, roughness: 0.45, metalness: 0.2 }),
        desk: new THREE.MeshStandardMaterial({ color: 0x33383E, roughness: 0.6, metalness: 0.1 }),
        black: new THREE.MeshStandardMaterial({ color: 0x0E0F11, roughness: 0.85 }),
        rubber: new THREE.MeshStandardMaterial({ color: 0x15171A, roughness: 0.9 }),
        steel: new THREE.MeshStandardMaterial({ color: 0xB9BEC3, roughness: 0.3, metalness: 0.9 }),
        body: new THREE.MeshStandardMaterial({ color: 0xD6DADD, roughness: 0.4, metalness: 0.3 }),
        ceiling: new THREE.MeshStandardMaterial({ color: 0xE9EBEC, roughness: 0.7 }),
        floor: new THREE.MeshStandardMaterial({ color: 0x3B3F44, roughness: 0.95,
            map: canvasTex(128, 128, (c, w, h) => {       // 止滑地板:圓點凸紋
                c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
                c.fillStyle = 'rgba(0,0,0,0.35)';
                for (let y = 8; y < h; y += 16) for (let x = (y / 16 % 2) * 8 + 8; x < w; x += 16) { c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill(); }
            }, [6, 6]) }),
        seat: new THREE.MeshStandardMaterial({ color: 0x23324A, roughness: 0.9 }),
        glass: new THREE.MeshStandardMaterial({ color: 0x9FB8C8, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }),
        blind: new THREE.MeshStandardMaterial({ color: 0x1B2026, roughness: 0.8, transparent: true, opacity: 0.72, side: THREE.DoubleSide }),
        light: new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0xFFF3DD, emissiveIntensity: 1.6, roughness: 0.4, name: 'LightPanel' }),
        red: new THREE.MeshStandardMaterial({ color: 0xC0201C, roughness: 0.4, metalness: 0.2 }),
        screen: new THREE.MeshBasicMaterial({ color: 0x0A1410, name: 'Screen' }),
        btnG: new THREE.MeshStandardMaterial({ color: 0x1FA35A, emissive: 0x0B5A2E, emissiveIntensity: 0.6, roughness: 0.4 }),
        btnR: new THREE.MeshStandardMaterial({ color: 0xD02A2A, emissive: 0x5A0B0B, emissiveIntensity: 0.6, roughness: 0.4 }),
        btnY: new THREE.MeshStandardMaterial({ color: 0xE6B21E, emissive: 0x5A440B, emissiveIntensity: 0.5, roughness: 0.4 }),
        door: new THREE.MeshStandardMaterial({ color: 0xA9AFB4, roughness: 0.5, metalness: 0.2 })
    };
    const box = (w, h, d, mat, x, y, z, name) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        if (name) m.name = name;
        g.add(m);
        return m;
    };
    const winTop = 2.02, winBot = 1.02, rake = 0.14;   // 前擋上緣往後傾 0.14 m

    // ---- 地板、天花板、後牆 ----
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, BACK - FRONT), M.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, (BACK + FRONT) / 2);
    g.add(floor);
    box(2 * W, 0.06, BACK - FRONT + 0.2, M.ceiling, 0, H + 0.03, (BACK + FRONT) / 2);
    // 天花板兩側斜角(圓弧化的車頂內襯)
    [-1, 1].forEach(sx => {
        const c = box(0.36, 0.06, BACK - FRONT, M.ceiling, sx * (W - 0.13), H - 0.1, (BACK + FRONT) / 2);
        c.rotation.z = sx * 0.62;
    });
    box(0.9, 0.025, 0.32, M.light, 0, H - 0.02, 0.25);            // 照明燈條
    for (let i = 0; i < 7; i++) box(0.5, 0.012, 0.022, M.trim, 0, H - 0.01, -0.55 + i * 0.05);   // 冷氣出風格柵
    box(2 * W, H, 0.06, M.panel, 0, H / 2, BACK);                  // 後牆
    // 通往客室的門(門框、門扇、門窗、門把)
    box(0.98, 1.98, 0.04, M.trim, 0, 0.99, BACK - 0.035);
    box(0.86, 1.9, 0.03, M.door, 0, 0.97, BACK - 0.06);
    box(0.5, 0.46, 0.012, new THREE.MeshStandardMaterial({ color: 0xF4EEDC, emissive: 0xFFF1D6, emissiveIntensity: 0.6, roughness: 0.2 }), 0, 1.5, BACK - 0.08);
    box(0.03, 0.18, 0.05, M.steel, 0.32, 1.02, BACK - 0.09);
    // 滅火器(後牆角落)
    const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 16), M.red);
    ext.position.set(-W + 0.18, 0.32, BACK - 0.16);
    g.add(ext);

    // ---- 側牆與側窗 ----
    [-1, 1].forEach(sx => {
        const x = sx * W;
        // 下方踢腳板(深色)、窗下牆板、窗上牆板
        box(0.05, 0.55, BACK - FRONT, M.trim, x, 0.275, (BACK + FRONT) / 2);
        box(0.05, 0.6, BACK - FRONT, M.panel, x, 0.85, (BACK + FRONT) / 2);
        box(0.05, H - 1.86, BACK - FRONT, M.panel, x, 1.86 + (H - 1.86) / 2, (BACK + FRONT) / 2);
        // 側窗:前段(駕駛側窗)與後段之間有窗柱
        const z0 = -1.3, z1 = 0.25;
        box(0.05, 0.71, 0.06, M.trim, x, 1.505, z0 - 0.03);
        box(0.05, 0.71, 0.1, M.trim, x, 1.505, z1 + 0.05);
        box(0.05, 0.71, 0.08, M.trim, x, 1.505, (z0 + z1) / 2);
        box(0.06, 0.05, z1 - z0 + 0.2, M.rubber, x, 1.15, (z0 + z1) / 2);
        box(0.06, 0.05, z1 - z0 + 0.2, M.rubber, x, 1.86, (z0 + z1) / 2);
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, 0.71), M.glass);
        gl.rotation.y = Math.PI / 2;
        gl.position.set(x + sx * 0.01, 1.505, (z0 + z1) / 2);
        g.add(gl);
        box(0.05, 1.86, BACK - z1 - 0.1, M.panel, x, 0.93, (BACK + z1 + 0.1) / 2);
        // 扶手
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.1, 10), M.steel);
        rail.rotation.x = Math.PI / 2;
        rail.position.set(x - sx * 0.08, 1.2, 0.7);
        g.add(rail);
    });

    // ---- 前擋風玻璃與周邊 ----
    const fz = (y) => FRONT + (y - winBot) / (winTop - winBot) * rake;   // 前擋在高度 y 的 z
    const shield = new THREE.Mesh(new THREE.PlaneGeometry(2 * (W - 0.12), winTop - winBot), M.glass);
    shield.position.set(0, (winTop + winBot) / 2, (fz(winTop) + fz(winBot)) / 2);
    shield.rotation.x = -Math.atan2(rake, winTop - winBot);
    shield.name = 'Windshield';
    g.add(shield);
    // 橡膠框(上、下)與 A 柱(車體色 + 內側黑框)
    box(2 * W, 0.06, 0.08, M.rubber, 0, winTop + 0.03, fz(winTop));
    box(2 * W, 0.05, 0.08, M.rubber, 0, winBot - 0.02, fz(winBot));
    [-1, 1].forEach(sx => {
        const p = box(0.07, winTop - winBot + 0.1, 0.08, M.trim, sx * (W - 0.04), (winTop + winBot) / 2, (fz(winTop) + fz(winBot)) / 2);
        p.rotation.x = -Math.atan2(rake, winTop - winBot);
    });
    // 前擋上方頂板(深色,內含行先顯示器背面)與遮陽捲簾(半拉下)
    box(2 * W, H - winTop + 0.04, 0.36, M.black, 0, (H + winTop) / 2, fz(winTop) + 0.16);
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 12), M.trim);
    roller.rotation.z = Math.PI / 2;
    roller.position.set(-0.35, winTop - 0.03, fz(winTop) + 0.08);
    g.add(roller);
    const blind = new THREE.Mesh(new THREE.PlaneGeometry(1.46, 0.2), M.blind);
    blind.position.set(-0.35, winTop - 0.13, fz(winTop) + 0.05);
    blind.rotation.x = -Math.atan2(rake, winTop - winBot);
    g.add(blind);
    // 雨刷(車外,停在前擋下緣)
    [-0.55, 0.45].forEach(x => {
        const wp = box(0.9, 0.025, 0.02, M.black, x, winBot + 0.07, fz(winBot) - 0.05);
        wp.rotation.z = 0.12;
    });

    // ---- 操作台 ----
    // 前段:防眩遮光罩(前擋下方的黑色平台)
    box(2 * W - 0.1, 0.05, 0.42, M.black, 0, winBot - 0.04, FRONT + 0.16);
    // 主體(斜面):前高後低
    const deskShape = new THREE.Shape();
    deskShape.moveTo(FRONT + 0.36, 0); deskShape.lineTo(-0.82, 0); deskShape.lineTo(-0.82, 0.8);
    deskShape.lineTo(-0.92, 0.86); deskShape.lineTo(FRONT + 0.36, winBot - 0.08); deskShape.closePath();
    const deskGeo = new THREE.ExtrudeGeometry(deskShape, { depth: 2 * W - 0.16, bevelEnabled: false });
    deskGeo.rotateY(-Math.PI / 2);   // 形狀 (u=z, v=y) 擠出沿 X
    deskGeo.translate(-(W - 0.08), 0, 0);
    const desk = new THREE.Mesh(deskGeo, M.desk);
    // ExtrudeGeometry 擠出後 x 範圍在 [-(W-0.08)-depth .. ],修正到中央
    deskGeo.computeBoundingBox();
    const bb = deskGeo.boundingBox;
    desk.position.x = -(bb.min.x + bb.max.x) / 2;
    g.add(desk);
    // 斜面上的面板:兩個螢幕、按鈕列、無線電話筒
    const tilt = Math.atan2(0.06 + (winBot - 0.08 - 0.86), (FRONT + 0.36) - (-0.92));   // 斜面角度
    const onDesk = (obj, x, u) => {               // u:0 = 後緣、1 = 前緣
        const z = -0.92 + ((FRONT + 0.36) - (-0.92)) * u;
        const y = 0.86 + ((winBot - 0.08) - 0.86) * u;
        obj.position.set(x, y + 0.012, z);
        obj.rotation.x = -Math.PI / 2 - tilt;
        g.add(obj);
        return obj;
    };
    const screen = (name, x, w) => {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.2, 0.02), M.black);
        onDesk(frame, x, 0.45);
        const sc = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.15), M.screen.clone());
        sc.name = name;
        sc.userData.flipY = true;
        onDesk(sc, x, 0.45);
        sc.position.y += 0.012;
        return sc;
    };
    screen('SpeedScreen', -0.22, 0.34);
    screen('InfoScreen', 0.32, 0.5);
    [M.btnG, M.btnY, M.btnR, M.btnG, M.btnY].forEach((m, i) => {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 14), m);
        onDesk(b, 0.62 + i * 0.06, 0.15).rotation.x = -tilt;
    });
    const radio = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.12), M.trim);
    onDesk(radio, 0.95, 0.6).rotation.x = -tilt;
    // 主控制器(左側):底座 + 握把(名稱 MasterLever,執行端依檔位轉動)
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.32), M.trim);
    onDesk(base, -0.72, 0.3).rotation.x = -tilt;
    const lever = new THREE.Group();
    lever.name = 'MasterLever';
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 10), M.steel);
    stem.position.y = 0.08;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 12), M.black);
    grip.rotation.z = Math.PI / 2;
    grip.position.y = 0.16;
    lever.add(stem, grip);
    lever.position.set(-0.72, 0.9, -1.05);
    g.add(lever);

    // ---- 駕駛座椅(第三人稱視角看得到) ----
    box(0.52, 0.1, 0.5, M.seat, 0, 0.52, 0.32);
    const back = box(0.5, 0.62, 0.1, M.seat, 0, 0.88, 0.6);
    back.rotation.x = -0.12;
    box(0.3, 0.18, 0.08, M.seat, 0, 1.3, 0.66);
    box(0.08, 0.47, 0.08, M.trim, 0, 0.24, 0.35);
    box(0.5, 0.04, 0.5, M.trim, 0, 0.02, 0.35);

    g.traverse(o => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = false; } });
    return g;
}
