// 程序化貼圖(Canvas),避免外部圖檔依賴。
import * as THREE from 'three';

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(w, h, draw, { repeat = [1, 1], srgb = true, wrap = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function speckle(ctx, w, h, n, colors, r = [0.5, 1.5], R = Math.random) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(R() * colors.length) | 0];
    const s = r[0] + R() * (r[1] - r[0]);
    ctx.fillRect(R() * w, R() * h, s, s);
  }
}

export const Tex = {
  /** 車廂地板:深灰止滑地板,1 m 一格。 */
  floor() {
    const R = rng(3);
    return canvasTexture(256, 256, (c, w, h) => {
      c.fillStyle = '#6a6c70';
      c.fillRect(0, 0, w, h);
      speckle(c, w, h, 5000, ['#5c5e62', '#77797d', '#808287', '#55575b'], [1, 2.5], R);
      c.strokeStyle = 'rgba(0,0,0,0.12)';
      c.lineWidth = 2;
      c.strokeRect(0, 0, w, h);
    });
  },

  /** 座椅布料:藍灰色織紋(UV 以公尺計,repeat 讓一格約 12 cm)。 */
  fabric() {
    const R = rng(7);
    return canvasTexture(128, 128, (c, w, h) => {
      c.fillStyle = '#41526b';
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) {
        c.fillStyle = y % 4 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.07)';
        c.fillRect(0, y, w, 1);
      }
      for (let x = 0; x < w; x += 2) {
        c.fillStyle = x % 4 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
        c.fillRect(x, 0, 1, h);
      }
      speckle(c, w, h, 600, ['#5a6c88', '#33425a', '#6d7f9c'], [1, 1.5], R);
      c.strokeStyle = 'rgba(160,190,230,0.18)';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(0, h * 0.5); c.lineTo(w * 0.5, 0); c.moveTo(w * 0.5, h); c.lineTo(w, h * 0.5);
      c.stroke();
    }, { repeat: [8, 8] });
  },

  /** 地面:依主題畫出田地/草地拼布,一張 64 m。 */
  ground(theme) {
    const R = rng(11);
    const palettes = {
      town: ['#5f7a3c', '#6c8442', '#7b8a52', '#8a8f6a', '#646f45'],
      rural: ['#5f8c3a', '#6fa043', '#86aa4c', '#4f7a34', '#7d9a5a'],
      coast: ['#5d7f3f', '#6e8b48', '#829456', '#59743c'],
      valley: ['#86a83f', '#9db84e', '#c2b45a', '#6f9a3a', '#b5a24a', '#5f8d3b'],
    };
    const pal = palettes[theme] || palettes.rural;
    return canvasTexture(512, 512, (c, w, h) => {
      const n = 8;
      const cw = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const col = pal[(R() * pal.length) | 0];
        c.fillStyle = col;
        c.fillRect(i * cw, j * cw, cw, cw);
        // 稻作行列
        c.fillStyle = 'rgba(0,0,0,0.06)';
        for (let k = 0; k < cw; k += 4) c.fillRect(i * cw + k, j * cw, 1, cw);
        if (R() < 0.12) { // 水田反光
          c.fillStyle = 'rgba(150,180,200,0.35)';
          c.fillRect(i * cw + 3, j * cw + 3, cw - 6, cw - 6);
        }
      }
      speckle(c, w, h, 8000, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.05)'], [1, 2], R);
      c.strokeStyle = '#9a8a62';
      c.lineWidth = 3;
      for (let i = 0; i <= n; i++) {
        c.beginPath(); c.moveTo(i * cw, 0); c.lineTo(i * cw, h); c.stroke();
        c.beginPath(); c.moveTo(0, i * cw); c.lineTo(w, i * cw); c.stroke();
      }
    });
  },

  /** 道碴 + 枕木,沿 X 方向一張 6 m(10 根枕木)。 */
  ballast() {
    const R = rng(5);
    return canvasTexture(512, 128, (c, w, h) => {
      c.fillStyle = '#7b756c';
      c.fillRect(0, 0, w, h);
      speckle(c, w, h, 9000, ['#5e5952', '#8f897f', '#a19a8f', '#4c4843'], [1.5, 4], R);
      for (let i = 0; i < 10; i++) {
        const x = (i + 0.5) * (w / 10);
        c.fillStyle = '#8c8984';
        c.fillRect(x - 8, h * 0.18, 16, h * 0.64);
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.fillRect(x + 6, h * 0.18, 2, h * 0.64);
      }
    });
  },

  /** 透天厝/公寓立面:窗格。 */
  facade(seed = 1) {
    const R = rng(seed);
    return canvasTexture(256, 256, (c, w, h) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
      speckle(c, w, h, 3000, ['rgba(0,0,0,0.05)', 'rgba(80,60,40,0.06)'], [1, 3], R);
      const rows = 4, cols = 3;
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
        const x = 20 + k * 80, y = 18 + r * 62;
        c.fillStyle = R() < 0.3 ? '#3a4652' : '#24303a';
        c.fillRect(x, y, 56, 34);
        c.fillStyle = 'rgba(180,200,220,0.25)';
        c.fillRect(x, y, 56, 6);
        c.fillStyle = 'rgba(60,60,60,0.5)'; // 鐵窗
        for (let b = 0; b < 56; b += 7) c.fillRect(x + b, y, 1.5, 34);
      }
    }, { wrap: false });
  },

  /** 文字標籤(站名牌、便當貼紙、車內顯示器)。 */
  label(draw, w = 512, h = 128) {
    const t = canvasTexture(w, h, draw, { wrap: false });
    t.generateMipmaps = true;
    return t;
  },

  bubble(emoji) {
    return canvasTexture(128, 128, (c) => {
      c.fillStyle = 'rgba(255,255,255,0.95)';
      c.beginPath();
      c.arc(64, 56, 46, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(52, 96); c.lineTo(64, 122); c.lineTo(76, 96); c.fill();
      c.font = '56px "Segoe UI Emoji","Noto Color Emoji",sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(emoji, 64, 60);
    }, { wrap: false });
  },
};
