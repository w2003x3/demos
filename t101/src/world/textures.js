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
  const emissive = canvasTex(W, H, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    const rr = rng(7);
    for (let f = 0; f < 2; f++) {
      for (let c = 0; c < 4; c++) {
        if (rr() < 0.55) {
          const v = 120 + rr() * 110;
          g.fillStyle = `rgb(${v},${v * 0.92},${v * 0.75})`;
          g.fillRect(c * colPx + 6, f * floorPx + floorPx * 0.14 + 4, colPx - 12, floorPx * 0.86 - 8);
        }
      }
    }
  });
  return { map, rough, emissive };
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
  const emissive = canvasTex(W, H, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    const cw = W / cols, rh = H / rows;
    const r = rng(12);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (r() < 0.38) {
          const warm = r() < 0.7;
          g.fillStyle = warm ? `rgb(255,${200 + r() * 30},${130 + r() * 40})` : 'rgb(190,215,255)';
          g.fillRect(x * cw + 4, y * rh + 6, cw - 8, rh - 12);
        }
      }
    }
  });
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
    g.font = font;
    const x = align === 'center' ? w / 2 : 24;
    g.fillText(text, x, sub ? h * 0.4 : h / 2);
    if (sub) { g.font = subFont; g.globalAlpha = 0.85; g.fillText(sub, x, h * 0.78); }
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
