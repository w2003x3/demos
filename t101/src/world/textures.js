// 程序化貼圖(Canvas 繪製),免外部圖檔。
import * as THREE from 'three';

let ANISO = 8;
export function setAnisotropy(a) { ANISO = a; }

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function canvasTex(w, h, draw, { srgb = true, repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  return t;
}

function noise(g, w, h, amount, seed = 1, size = 1) {
  const r = rng(seed);
  for (let i = 0; i < (w * h * amount) / (size * size); i++) {
    const v = r();
    g.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.12})` : `rgba(0,0,0,${(0.5 - v) * 0.14})`;
    g.fillRect(r() * w, r() * h, size, size);
  }
}

/**
 * 101 帷幕牆:一張貼圖 = 寬 6m × 高 2 層(8.6m)。
 * 每層:上方深色窗間牆(spandrel)+ 下方大片藍綠玻璃,直料每 1.5m。
 * 回傳 { map, rough, emissive }。
 */
export function facadeTextures() {
  const W = 512, H = 1024;
  const floorPx = H / 2, colPx = W / 4;
  const r = rng(101);
  const panelShade = [];
  for (let i = 0; i < 16; i++) panelShade.push(r());
  const map = canvasTex(W, H, (g) => {
    for (let f = 0; f < 2; f++) {
      const y0 = f * floorPx;
      for (let c = 0; c < 4; c++) {
        const x0 = c * colPx;
        const s = panelShade[f * 4 + c];
        // 玻璃:由上往下漸層,模擬天空反射
        const grd = g.createLinearGradient(0, y0, 0, y0 + floorPx);
        const l = 20 + s * 7;
        grd.addColorStop(0, `hsl(172, 26%, ${l + 10}%)`);
        grd.addColorStop(0.55, `hsl(178, 30%, ${l + 3}%)`);
        grd.addColorStop(1, `hsl(184, 32%, ${l - 3}%)`);
        g.fillStyle = grd;
        g.fillRect(x0, y0, colPx, floorPx);
        // 窗間牆(遮住樓板)
        g.fillStyle = `hsl(178, 18%, ${15 + s * 3}%)`;
        g.fillRect(x0, y0, colPx, floorPx * 0.14);
        // 玻璃上微弱的斜向反光
        g.fillStyle = 'rgba(255,255,255,0.05)';
        g.beginPath();
        g.moveTo(x0 + colPx * 0.15, y0 + floorPx);
        g.lineTo(x0 + colPx * 0.6, y0 + floorPx * 0.2);
        g.lineTo(x0 + colPx * 0.8, y0 + floorPx * 0.2);
        g.lineTo(x0 + colPx * 0.35, y0 + floorPx);
        g.fill();
      }
      // 橫料
      g.fillStyle = '#8e9c9e';
      g.fillRect(0, y0 + floorPx * 0.14 - 2, W, 4);
      g.fillStyle = '#7d8a8c';
      g.fillRect(0, y0, W, 5);
    }
    // 直料(鋁擠型,帶陰影)
    for (let c = 0; c <= 4; c++) {
      const x = c * colPx;
      g.fillStyle = '#9aa7a9';
      g.fillRect(x - 3, 0, 6, H);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x + 3, 0, 2, H);
    }
  });
  const rough = canvasTex(W, H, (g) => {
    g.fillStyle = '#1a1a1a'; // 玻璃:很光滑
    g.fillRect(0, 0, W, H);
    for (let f = 0; f < 2; f++) {
      g.fillStyle = '#707070';
      g.fillRect(0, f * floorPx, W, floorPx * 0.14);
    }
    g.fillStyle = '#5a5a5a';
    for (let c = 0; c <= 4; c++) g.fillRect(c * colPx - 4, 0, 8, H);
  }, { srgb: false });
  const emissive = interiorLights(16, 8, 0.14, 7, 0.62);
  emissive.repeat.set(6 / 24, 8.6 / 34.4);
  return { map, rough, emissive };
}

/**
 * 夜間室內燈光(發光貼圖):cols × rows 格窗,依「房間」決定亮或暗,
 * 每格由天花板往下漸暗(燈從室內照出),偶爾有窗簾或人影。
 * band = 每層頂部窗間牆比例;lit = 整體亮燈比例;inset = 窗框內縮(城市大樓用)。
 */
export function interiorLights(cols, rows, band, seed, lit, inset = false) {
  const W = 1024, H = 1024;
  const cw = W / cols, rh = H / rows;
  return canvasTex(W, H, (g) => {
    const r = rng(seed);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    const palettes = [[255, 226, 170], [255, 214, 150], [235, 240, 255], [255, 236, 200], [210, 228, 255]];
    for (let y = 0; y < rows; y++) {
      // 每層樓:有些整層辦公室亮燈,有些只亮幾間
      const floorMode = r();
      const floorLit = floorMode < 0.25 ? 0.92 : floorMode < 0.4 ? 0.08 : lit;
      const floorCol = palettes[Math.floor(r() * palettes.length)];
      let room = 0, roomOn = false, roomCol = floorCol, roomK = 1;
      for (let x = 0; x < cols; x++) {
        if (room <= 0) { // 新房間(1~4 格)
          room = 1 + Math.floor(r() * 4);
          roomOn = r() < floorLit;
          roomCol = r() < 0.7 ? floorCol : palettes[Math.floor(r() * palettes.length)];
          roomK = 0.55 + r() * 0.45;
        }
        room--;
        if (!roomOn) {
          // 暗房間也有一點點反射光
          g.fillStyle = 'rgba(40,50,70,0.25)';
          g.fillRect(x * cw, y * rh + rh * band, cw, rh * (1 - band));
          continue;
        }
        const x0 = x * cw + (inset ? cw * 0.12 : 2), x1 = (x + 1) * cw - (inset ? cw * 0.12 : 2);
        const y0 = y * rh + rh * band + (inset ? rh * 0.12 : 2), y1 = (y + 1) * rh - (inset ? rh * 0.1 : 2);
        const grd = g.createLinearGradient(0, y0, 0, y1);
        const [cr, cg, cb] = roomCol;
        grd.addColorStop(0, `rgba(${cr},${cg},${cb},${roomK})`);
        grd.addColorStop(0.35, `rgba(${cr * 0.85},${cg * 0.82},${cb * 0.78},${roomK * 0.85})`);
        grd.addColorStop(1, `rgba(${cr * 0.45},${cg * 0.4},${cb * 0.38},${roomK * 0.55})`);
        g.fillStyle = grd;
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
        // 天花板燈管的亮點
        g.fillStyle = `rgba(255,255,250,${0.35 * roomK})`;
        g.fillRect(x0 + (x1 - x0) * 0.2, y0 + 2, (x1 - x0) * 0.6, Math.max(2, rh * 0.03));
        // 窗簾 / 百葉窗
        const k = r();
        if (k < 0.15) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x0, y0, x1 - x0, (y1 - y0) * (0.3 + r() * 0.5)); }
        else if (k < 0.25) { g.fillStyle = 'rgba(0,0,0,0.35)'; for (let s = y0; s < y1; s += 6) g.fillRect(x0, s, x1 - x0, 2); }
        else if (k < 0.32) { // 人影或家具
          g.fillStyle = 'rgba(0,0,0,0.45)';
          const px = x0 + r() * (x1 - x0 - 12);
          g.fillRect(px, y1 - (y1 - y0) * 0.55, 10, (y1 - y0) * 0.55);
          g.beginPath(); g.arc(px + 5, y1 - (y1 - y0) * 0.62, 6, 0, 7); g.fill();
        }
      }
    }
  });
}

/** 城市大樓外牆:灰階窗格(顏色由 instance color 決定)。一張 = 寬 24m × 高 8 層。 */
export function cityFacadeTextures() {
  const W = 256, H = 256, cols = 8, rows = 8;
  const map = canvasTex(W, H, (g) => {
    g.fillStyle = '#c4c4c4';
    g.fillRect(0, 0, W, H);
    noise(g, W, H, 0.9, 3, 2);
    const cw = W / cols, rh = H / rows;
    const r = rng(11);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const v = 28 + r() * 34;
        g.fillStyle = `rgb(${v},${v + 5},${v + 10})`;
        g.fillRect(x * cw + 4, y * rh + 6, cw - 8, rh - 12);
        // 冷氣機/遮陽
        if (r() < 0.12) { g.fillStyle = '#bbb'; g.fillRect(x * cw + 6, y * rh + rh - 10, 10, 6); }
      }
    }
  });
  const emissive = interiorLights(cols, rows, 0.1, 12, 0.42, true);
  return { map, emissive };
}

/** 屋頂:混凝土 + 設備。 */
export function roofTexture() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#8a8a86';
    g.fillRect(0, 0, 128, 128);
    noise(g, 128, 128, 2, 5, 2);
    g.fillStyle = '#6d6d6a';
    g.fillRect(20, 30, 30, 22);
    g.fillRect(80, 70, 26, 34);
    g.strokeStyle = '#9d9d98';
    g.strokeRect(2, 2, 124, 124);
  });
}

/** 地面:一張 = 一個 120m 街廓(含道路、人行道、斑馬線)。 */
export function groundTexture() {
  const S = 1024;
  return canvasTex(S, S, (g) => {
    const m = S / 120; // px / m
    g.fillStyle = '#3a3c3f'; // 柏油
    g.fillRect(0, 0, S, S);
    noise(g, S, S, 0.5, 21, 2);
    const road = 16 * m, walk = 4 * m;
    // 街廓
    g.fillStyle = '#9a968c';
    g.fillRect(road / 2, road / 2, S - road, S - road);
    g.fillStyle = '#6f7466';
    g.fillRect(road / 2 + walk, road / 2 + walk, S - road - 2 * walk, S - road - 2 * walk);
    noise(g, S, S, 0.4, 22, 3);
    // 行道樹
    const r = rng(23);
    g.fillStyle = '#3f5a33';
    for (let i = road / 2 + 8; i < S - road / 2; i += 8 * m) {
      for (const p of [road / 2 + walk / 2, S - road / 2 - walk / 2]) {
        g.beginPath(); g.arc(i, p, 1.8 * m + r() * 4, 0, 7); g.fill();
        g.beginPath(); g.arc(p, i, 1.8 * m + r() * 4, 0, 7); g.fill();
      }
    }
    // 車道線
    g.strokeStyle = 'rgba(240,240,230,0.7)';
    g.lineWidth = 3;
    g.setLineDash([3 * m, 3 * m]);
    for (const p of [0, S]) {
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
    }
    g.setLineDash([]);
    g.strokeStyle = 'rgba(230,190,60,0.8)';
    g.lineWidth = 2;
    // 斑馬線
    g.fillStyle = 'rgba(235,235,230,0.85)';
    for (const [cx, cy] of [[road / 2 + walk + 10, 0], [S - road / 2 - walk - 40, S - 0]]) {
      for (let k = -road / 2; k < road / 2; k += 1.2 * m) g.fillRect(cx, cy + k, 30, 0.6 * m);
    }
  });
}

export function concreteTexture(base = '#b9b6ae', seed = 31) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, 3, seed, 1);
    noise(g, 256, 256, 0.6, seed + 1, 4);
  });
}

/** 木地板,一張約 2m × 2m。 */
export function woodTexture(hue = 28, light = 38) {
  return canvasTex(512, 512, (g) => {
    const r = rng(41);
    const plankH = 512 / 8;
    for (let i = 0; i < 8; i++) {
      let x = -r() * 300;
      while (x < 512) {
        const len = 200 + r() * 260;
        const l = light + (r() - 0.5) * 10;
        g.fillStyle = `hsl(${hue + (r() - 0.5) * 6}, 42%, ${l}%)`;
        g.fillRect(x, i * plankH, len, plankH);
        g.strokeStyle = `hsla(${hue}, 40%, ${l - 12}%, 0.35)`;
        g.lineWidth = 1;
        for (let k = 0; k < 7; k++) {
          const yy = i * plankH + 4 + r() * (plankH - 8);
          g.beginPath();
          g.moveTo(x, yy);
          g.bezierCurveTo(x + len * 0.3, yy + (r() - 0.5) * 6, x + len * 0.7, yy + (r() - 0.5) * 6, x + len, yy);
          g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x, i * plankH, 2, plankH);
        x += len;
      }
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(0, i * plankH, 512, 2);
    }
  });
}

/** 石材地磚(觀景台、電梯廳)。 */
export function stoneTileTexture(base = [222, 216, 205], seam = '#8d877c', seed = 51) {
  return canvasTex(512, 512, (g) => {
    const r = rng(seed);
    const n = 4, s = 512 / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const d = (r() - 0.5) * 14;
        g.fillStyle = `rgb(${base[0] + d},${base[1] + d},${base[2] + d})`;
        g.fillRect(x * s, y * s, s, s);
        // 大理石紋
        g.strokeStyle = `rgba(120,110,100,${0.08 + r() * 0.1})`;
        g.lineWidth = 1 + r() * 1.5;
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          let px = x * s + r() * s, py = y * s;
          g.moveTo(px, py);
          for (let j = 0; j < 6; j++) { px += (r() - 0.5) * 40; py += s / 6; g.lineTo(px, py); }
          g.stroke();
        }
      }
    }
    g.strokeStyle = seam;
    g.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 512); g.stroke();
      g.beginPath(); g.moveTo(0, i * s); g.lineTo(512, i * s); g.stroke();
    }
  });
}

/** 地毯(圖紋)。 */
export function carpetTexture(c1 = '#3b3a45', c2 = '#4a4856') {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = c1;
    g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, 5, 61, 1);
    g.strokeStyle = c2;
    g.lineWidth = 3;
    for (let i = 0; i < 256; i += 32) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke();
    }
  });
}

/** 文字招牌貼圖。 */
export function textTexture(text, { w = 512, h = 128, bg = '#0d3b2e', fg = '#ffffff', font = '900 72px "Noto Sans TC", sans-serif', sub, subFont = '500 30px "Noto Sans TC", sans-serif', align = 'center', border } = {}) {
  return canvasTex(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    if (border) { g.strokeStyle = border; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); }
    g.fillStyle = fg;
    g.textAlign = align;
    g.textBaseline = 'middle';
    // 文字太長時縮小字級,避免左右被裁切
    const fit = (f, str) => {
      g.font = f;
      const maxW = w * 0.92 - (align === 'center' ? 0 : 24);
      const tw = g.measureText(str).width;
      if (tw > maxW) g.font = f.replace(/(\d+(?:\.\d+)?)px/, (m, n) => `${Math.floor(Number(n) * maxW / tw)}px`);
    };
    fit(font, text);
    const x = align === 'center' ? w / 2 : 24;
    g.fillText(text, x, sub ? h * 0.4 : h / 2);
    if (sub) { fit(subFont, sub); g.globalAlpha = 0.85; g.fillText(sub, x, h * 0.78); }
  }, { repeat: false });
}

/** 樓梯間樓層號碼(可重繪)。 */
export function drawStairSign(tex, floor) {
  const c = tex.image, g = c.getContext('2d');
  g.fillStyle = '#d9d6cc';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#1b6b3a';
  g.fillRect(0, 0, c.width, 18);
  g.fillStyle = '#20242a';
  g.font = '700 150px "Barlow Condensed", "Noto Sans TC", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`${floor}F`, c.width / 2, c.height * 0.52);
  g.font = '500 28px "Noto Sans TC", sans-serif';
  g.fillText(floor >= 91 ? '終點 室外觀景台' : `往上 ${91 - floor} 層 · 終點 91F`, c.width / 2, c.height * 0.88);
  tex.needsUpdate = true;
}
