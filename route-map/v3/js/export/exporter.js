/**
 * exporter.js
 * 自行合成輸出圖:底圖圖磚 → canvas,路網向量(與地圖同一支 svg-renderer)→ 疊上。
 * 支援:目前視窗 / 全部路網 / 自訂框選;1–4× 倍率;PNG / SVG;標題、圖例、比例尺、著作權標示。
 */
import { store } from '../core/store.js';
import { buildModel, themeFor } from '../core/network-model.js';
import { renderNetwork, renderLegend, esc, FONT_FAMILY } from '../render/svg-renderer.js';
import { textWidth } from '../core/geometry.js';
import { BASEMAPS } from '../core/constants.js';

const MAX_SIDE = 16000;
const MAX_AREA = 150e6;
const MAX_TILES = 900;

/**
 * opts: {
 *   map, area: 'view'|'network'|'custom', bounds (L.LatLngBounds, custom 用), padding (px),
 *   scale, format: 'png'|'svg', background: basemap key | 'none' | 'transparent', bgColor,
 *   title, subtitle, legend: bool, legendPos: 'br'|'bl'|'tr'|'tl', numbers: bool, scalebar: bool
 * }
 * 回傳 { width, height, svg, blob(PNG 時), warnings[] }
 */
export async function composeExport(opts) {
    const { map } = opts;
    const S = opts.scale || 1;
    const Z = map.getZoom() + Math.log2(S);
    const crs = L.CRS.EPSG3857;
    const proj = (lat, lng) => crs.latLngToPoint(L.latLng(lat, lng), Z);
    const warnings = [];

    const bgKey = opts.format === 'svg' ? (opts.background === 'transparent' ? 'transparent' : 'none') : opts.background;
    const bm = BASEMAPS[bgKey];
    const useTiles = !!(bm && bm.url);
    const settings = {
        ...store.state.settings,
        showNumbers: !!opts.numbers,
        basemap: useTiles ? bgKey : 'none',
        bgColor: opts.bgColor || store.state.settings.bgColor,
        basemapGray: opts.gray ?? store.state.settings.basemapGray,
        basemapOpacity: opts.opacity ?? store.state.settings.basemapOpacity
    };
    const state = { ...store.state, settings };
    const theme = themeFor(settings);

    // ---------- 範圍 ----------
    let min, max;
    const titleH = opts.title ? (opts.subtitle ? 64 : 46) * S : 0;
    if (opts.area === 'network') {
        const m0 = buildModel(state, proj, { scale: S, theme });
        if (!m0.bbox) throw new Error('路網是空的,沒有可輸出的內容');
        const pad = (opts.padding ?? 40) * S;
        min = { x: m0.bbox.minX - pad, y: m0.bbox.minY - pad - (titleH ? titleH + 12 * S : 0) };
        max = { x: m0.bbox.maxX + pad, y: m0.bbox.maxY + pad };
        if (opts.legend) {
            const lg = renderLegend(state, m0, S);
            if (lg) {
                // 圖例放在外側留白,避免壓到路網
                if (opts.legendPos === 'br' || opts.legendPos === 'bl') max.y += lg.h + 12 * S;
                else max.x += lg.w + 12 * S;
                min.y = Math.min(min.y, max.y - Math.max(max.y - min.y, lg.h + 2 * pad));
            }
        }
    } else {
        const b = opts.area === 'custom' && opts.bounds ? opts.bounds : map.getBounds();
        const p1 = proj(b.getNorth(), b.getWest()), p2 = proj(b.getSouth(), b.getEast());
        min = { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y) };
        max = { x: Math.max(p1.x, p2.x), y: Math.max(p1.y, p2.y) };
    }
    min.x = Math.floor(min.x); min.y = Math.floor(min.y);
    const W = Math.ceil(max.x - min.x), H = Math.ceil(max.y - min.y);
    if (W < 10 || H < 10) throw new Error('輸出範圍太小');
    if (W > MAX_SIDE || H > MAX_SIDE || W * H > MAX_AREA) {
        throw new Error(`輸出尺寸 ${W}×${H} 過大,請降低倍率或縮小範圍`);
    }

    // ---------- 向量 ----------
    const model = buildModel(state, (lat, lng) => { const p = proj(lat, lng); return { x: p.x - min.x, y: p.y - min.y }; }, { scale: S, theme });
    const parts = [renderNetwork(model, { interactive: false })];
    const margin = 14 * S;

    if (opts.title) {
        const tf = 24 * S, sf = 13 * S;
        const tw = Math.max(textWidth(opts.title, tf), opts.subtitle ? textWidth(opts.subtitle, sf) : 0) + margin * 2;
        const th = tf * 1.4 + (opts.subtitle ? sf * 1.6 : 0) + margin;
        parts.push(`<g font-family="${esc(FONT_FAMILY)}"><rect x="${margin}" y="${margin}" width="${tw}" height="${th}" rx="${8 * S}" fill="${theme.panel}"/>` +
            `<text x="${margin * 2}" y="${margin + tf * 1.25}" font-size="${tf}" font-weight="800" fill="${theme.panelText}">${esc(opts.title)}</text>` +
            (opts.subtitle ? `<text x="${margin * 2}" y="${margin + tf * 1.3 + sf * 1.3}" font-size="${sf}" fill="${theme.panelText}" fill-opacity="0.7">${esc(opts.subtitle)}</text>` : '') + '</g>');
    }

    if (opts.legend) {
        const lg = renderLegend(state, model, S);
        if (lg) {
            const pos = opts.legendPos || 'br';
            const x = pos.includes('r') ? W - lg.w - margin : margin;
            let y = pos.includes('b') ? H - lg.h - margin - (useTiles ? 16 * S : 0) : margin;
            if (!pos.includes('b') && opts.title && pos === 'tl') y += 80 * S;
            parts.push(`<g transform="translate(${x} ${y})">${lg.svg}</g>`);
        }
    }

    if (opts.scalebar) {
        const cy = (min.y + max.y) / 2;
        const lat = crs.pointToLatLng(L.point((min.x + max.x) / 2, cy), Z).lat;
        const mpp = 40075016.686 * Math.cos(lat * Math.PI / 180) / (256 * Math.pow(2, Z));
        const target = 120 * S * mpp;
        const pow = Math.pow(10, Math.floor(Math.log10(target)));
        const nice = [5, 2, 1].map(k => k * pow).find(v => v <= target) || pow;
        const px = nice / mpp;
        const label = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
        const x = opts.legend && (opts.legendPos || 'br') === 'bl' ? W - px - margin * 2 : margin * 1.5;
        const y = H - margin * 1.6 - (useTiles ? 12 * S : 0);
        parts.push(`<g font-family="${esc(FONT_FAMILY)}"><path d="M${x} ${y - 6 * S}V${y}H${x + px}V${y - 6 * S}" fill="none" stroke="${theme.halo}" stroke-width="${5 * S}"/>` +
            `<path d="M${x} ${y - 6 * S}V${y}H${x + px}V${y - 6 * S}" fill="none" stroke="${theme.text}" stroke-width="${1.6 * S}"/>` +
            `<text x="${x + px / 2}" y="${y - 9 * S}" text-anchor="middle" font-size="${11 * S}" fill="${theme.text}" stroke="${theme.halo}" stroke-width="${3 * S}" paint-order="stroke">${label}</text></g>`);
    }

    if (useTiles) {
        const fs = 10 * S;
        const text = bm.attribution;
        const tw = textWidth(text, fs) + 10 * S;
        parts.push(`<g font-family="${esc(FONT_FAMILY)}"><rect x="${W - tw}" y="${H - fs * 1.7}" width="${tw}" height="${fs * 1.7}" fill="rgba(255,255,255,0.8)"/>` +
            `<text x="${W - 5 * S}" y="${H - fs * 0.5}" text-anchor="end" font-size="${fs}" fill="#333">${esc(text)}</text></g>`);
    }

    const bgRect = bgKey === 'transparent' ? '' : `<rect width="${W}" height="${H}" fill="${settings.bgColor}"/>`;
    const vector = parts.join('');

    if (opts.format === 'svg') {
        const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bgRect}${vector}</svg>`;
        return { width: W, height: H, svg, blob: new Blob([svg], { type: 'image/svg+xml' }), warnings };
    }

    // ---------- PNG ----------
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (bgKey !== 'transparent') {
        ctx.fillStyle = settings.bgColor;
        ctx.fillRect(0, 0, W, H);
    }
    if (useTiles) {
        const failed = await drawTiles(ctx, bm, Z, min, W, H, settings, S);
        if (failed) warnings.push(`${failed} 張底圖圖磚載入失敗`);
    }
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${vector}</svg>`;
    const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr));
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('無法產生 PNG')), 'image/png'));
    return { width: W, height: H, blob, warnings };
}

function loadImage(src, cors = false) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (cors) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image load failed'));
        img.src = src;
    });
}

function tileUrl(bm, z, x, y, retina) {
    const subs = bm.subdomains || 'abc';
    const s = subs[Math.abs(x + y) % subs.length];
    return bm.url.replace('{s}', s).replace('{z}', z).replace('{x}', x).replace('{y}', y).replace('{r}', retina ? '@2x' : '');
}

/** 畫圖磚;回傳失敗數 */
async function drawTiles(ctx, bm, Z, origin, W, H, settings, S) {
    const retina = !!bm.retina && S >= 1.5;
    let tz = Math.round(Z - (retina ? 1 : 0));
    tz = Math.max(0, Math.min(bm.maxZoom || 19, tz));
    const k = Math.pow(2, Z - tz);
    const ts = 256 * k;
    const x0 = Math.floor(origin.x / ts), x1 = Math.floor((origin.x + W) / ts);
    const y0 = Math.floor(origin.y / ts), y1 = Math.floor((origin.y + H) / ts);
    const n = Math.pow(2, tz);
    const jobs = [];
    for (let ty = y0; ty <= y1; ty++) {
        if (ty < 0 || ty >= n) continue;
        for (let tx = x0; tx <= x1; tx++) jobs.push({ tx, ty });
    }
    if (jobs.length > MAX_TILES) throw new Error(`底圖需要 ${jobs.length} 張圖磚,超過上限 ${MAX_TILES};請降低倍率或縮小範圍`);

    ctx.save();
    ctx.globalAlpha = settings.basemapOpacity ?? 1;
    if (settings.basemapGray) ctx.filter = 'grayscale(1)';
    let failed = 0, i = 0;
    const worker = async () => {
        while (i < jobs.length) {
            const { tx, ty } = jobs[i++];
            const wx = ((tx % n) + n) % n;
            try {
                const img = await loadImage(tileUrl(bm, tz, wx, ty, retina), true);
                ctx.drawImage(img, tx * ts - origin.x, ty * ts - origin.y, ts + 0.5, ts + 0.5);
            } catch (e) {
                failed++;
            }
        }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    ctx.restore();
    return failed;
}

export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
