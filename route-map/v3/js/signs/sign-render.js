/**
 * sign-render.js
 * 指標繪製(純函式,無 DOM):站名牌、月台方向指標、柱面站名、路線徽章、自繪圖示。
 * 回傳完整 <svg> 字串 —— 指標設計器預覽、PNG/SVG 下載、駕駛模式 3D 月台貼圖共用同一份。
 *
 * 圖示 icon = { shapes: [...] },座標系 100×100:
 *   { t:'rect', x, y, w, h, rx, fill, stroke, sw }
 *   { t:'ellipse', cx, cy, rx, ry, fill, stroke, sw }
 *   { t:'line', x1, y1, x2, y2, stroke, sw }
 *   { t:'path', pts:[[x,y],...], closed, fill, stroke, sw }
 *   { t:'text', x, y, text, size, weight, fill }
 */
import { textWidth } from '../core/geometry.js';
import { contrastText } from '../core/network-model.js';
import { SIGN_FONTS, DEFAULT_SIGN_STYLE } from '../core/constants.js';
import { esc } from '../render/svg-renderer.js';

export const SIGN_SIZES = {
    board: { w: 1200, h: 300 },
    direction: { w: 1200, h: 220 },
    pillar: { w: 300, h: 900 }
};

const r1 = v => Math.round(v * 10) / 10;
const fontCss = (style) => (SIGN_FONTS[style.font] || SIGN_FONTS.sans).css;

/** 讓字串寬度不超過 maxW 的字級 */
export function fitSize(str, fs, maxW) {
    const w = textWidth(str, fs);
    return w > maxW && w > 0 ? Math.max(8, fs * maxW / w) : fs;
}

function svgOpen(w, h, style, bg) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${esc(fontCss(style))}">` +
        (bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : '');
}

// =====================================================
// 自繪圖示
// =====================================================

const paint = (s, defFill = 'none') => {
    const fill = s.fill || defFill;
    const stroke = s.stroke && s.stroke !== 'none' && s.sw > 0 ? ` stroke="${s.stroke}" stroke-width="${s.sw}"` : '';
    return `fill="${fill}"${stroke}`;
};

export function shapeSvg(s, font = SIGN_FONTS.sans.css) {
    switch (s.t) {
        case 'rect':
            return `<rect x="${r1(s.x)}" y="${r1(s.y)}" width="${r1(s.w)}" height="${r1(s.h)}" rx="${r1(s.rx || 0)}" ${paint(s, '#1B1C1F')} stroke-linejoin="round"/>`;
        case 'ellipse':
            return `<ellipse cx="${r1(s.cx)}" cy="${r1(s.cy)}" rx="${r1(s.rx)}" ry="${r1(s.ry)}" ${paint(s, '#1B1C1F')}/>`;
        case 'line':
            return `<line x1="${r1(s.x1)}" y1="${r1(s.y1)}" x2="${r1(s.x2)}" y2="${r1(s.y2)}" stroke="${s.stroke || '#1B1C1F'}" stroke-width="${s.sw || 4}" stroke-linecap="round"/>`;
        case 'path': {
            if (!s.pts || s.pts.length < 2) return '';
            const d = 'M' + s.pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L') + (s.closed ? 'Z' : '');
            return `<path d="${d}" ${paint(s, 'none')} stroke-linecap="round" stroke-linejoin="round"/>`;
        }
        case 'text':
            return `<text x="${r1(s.x)}" y="${r1(s.y)}" font-size="${s.size || 30}" font-weight="${s.weight || 700}" text-anchor="middle" dominant-baseline="central" font-family="${esc(font)}" fill="${s.fill || '#1B1C1F'}">${esc(s.text)}</text>`;
        default:
            return '';
    }
}

/** 圖示放進 (x, y) 起、邊長 size 的方框 */
export function iconGroup(icon, x, y, size, font) {
    if (!icon || !icon.shapes?.length) return '';
    return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${(size / 100).toFixed(4)})">${icon.shapes.map(s => shapeSvg(s, font)).join('')}</g>`;
}

export function iconSvg(icon, size = 100, bg = null) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">` +
        (bg ? `<rect width="100" height="100" fill="${bg}"/>` : '') +
        iconGroup(icon, 0, 0, 100) + '</svg>';
}

// =====================================================
// 路線徽章
// =====================================================

/** 以 (cx, cy) 為中心、高 h 的徽章;回傳 { svg, w }。textColor 省略時自動取對比色 */
export function badge(shape, color, text, cx, cy, h, textColor) {
    const tc = textColor || contrastText(color);
    const label = String(text || '');
    let fs = h * (label.length > 3 ? 0.42 : 0.5);
    const tw = textWidth(label, fs);
    let w, body;
    if (shape === 'circle') {
        w = Math.max(h, tw + h * 0.5);
        body = `<rect x="${r1(cx - w / 2)}" y="${r1(cy - h / 2)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(h / 2)}" fill="${color}"/>`;
    } else if (shape === 'hexagon') {
        w = Math.max(h * 1.1, tw + h * 0.7);
        const k = h * 0.3;
        const pts = [[cx - w / 2, cy], [cx - w / 2 + k, cy - h / 2], [cx + w / 2 - k, cy - h / 2], [cx + w / 2, cy], [cx + w / 2 - k, cy + h / 2], [cx - w / 2 + k, cy + h / 2]];
        body = `<polygon points="${pts.map(p => p.map(r1).join(',')).join(' ')}" fill="${color}"/>`;
    } else if (shape === 'diamond') {
        w = Math.max(h, tw + h * 0.9);
        const pts = [[cx - w / 2, cy], [cx, cy - h / 2], [cx + w / 2, cy], [cx, cy + h / 2]];
        body = `<polygon points="${pts.map(p => p.map(r1).join(',')).join(' ')}" fill="${color}"/>`;
        fs = Math.min(fs, fitSize(label, fs, w * 0.55));
    } else {
        w = Math.max(h, tw + h * 0.45);
        const rx = shape === 'square' ? 0 : h * 0.22;
        body = `<rect x="${r1(cx - w / 2)}" y="${r1(cy - h / 2)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(rx)}" fill="${color}"/>`;
    }
    const txt = label ? `<text x="${r1(cx)}" y="${r1(cy)}" font-size="${r1(fs)}" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="${tc}">${esc(label)}</text>` : '';
    return { svg: body + txt, w };
}

// =====================================================
// 由專案資料組出指標內容
// =====================================================

/**
 * 車站在某路線(行進方向)上的指標資料。
 * forward=false 代表逆著路線車站順序行駛(前後站互換、往訖站改往起站)。
 */
export function stationSignData(state, stationId, lineId = null, forward = true) {
    const st = state.stations.find(s => s.id === stationId);
    if (!st) return null;
    const lineOf = id => state.lines.find(l => l.id === id);
    const served = (st.lines || []).map(lineOf).filter(Boolean);
    const cur = (lineId && lineOf(lineId)) || served[0] || null;
    const ordered = cur ? [cur, ...served.filter(l => l !== cur)] : served;
    const signs = state.signs || {};
    const pick = s => s ? { name: s.name, sub: s.sub || '' } : null;
    let prev = null, next = null, towards = null;
    if (cur) {
        let seq = cur.nodes.filter(n => n.type === 'station').map(n => n.id);
        if (!forward) seq = [...seq].reverse();
        const i = seq.indexOf(stationId);
        const at = k => state.stations.find(s => s.id === seq[k]);
        const n = seq.length;
        if (i >= 0) {
            prev = pick(i > 0 ? at(i - 1) : (cur.loop ? at(n - 1) : null));
            next = pick(i < n - 1 ? at(i + 1) : (cur.loop ? at(0) : null));
            towards = pick(cur.loop ? next : at(n - 1));
        }
    }
    return {
        id: st.id,
        name: st.name,
        sub: st.sub || '',
        lines: ordered.map(l => ({ id: l.id, color: l.color, code: l.code || '', name: l.name, number: (st.numbers || {})[l.id] || '' })),
        prev, next, towards,
        icon: (signs.stationIcons || {})[st.id] || null,
        logo: signs.logo || null,
        systemName: signs.systemName || '',
        systemNameEn: signs.systemNameEn || ''
    };
}

// =====================================================
// 站名牌
// =====================================================

function stripeBands(lines, x, y, w, h, vertical) {
    const cols = lines.length ? lines.map(l => l.color) : ['#8A8D93'];
    return cols.map((c, i) => vertical
        ? `<rect x="${r1(x)}" y="${r1(y + h * i / cols.length)}" width="${r1(w)}" height="${r1(h / cols.length + 0.5)}" fill="${c}"/>`
        : `<rect x="${r1(x + w * i / cols.length)}" y="${r1(y)}" width="${r1(w / cols.length + 0.5)}" height="${r1(h)}" fill="${c}"/>`).join('');
}

function neighborsRow(d, x0, x1, cy, fs, color, subColor, showSub) {
    const one = (nb, right) => {
        if (!nb) return '';
        const arrow = right ? ' ▶' : '◀ ';
        const main = right ? `${nb.name}${arrow}` : `${arrow}${nb.name}`;
        const sub = showSub && nb.sub ? nb.sub : '';
        const x = right ? x1 : x0;
        const anchor = right ? 'end' : 'start';
        const mainW = textWidth(main, fs);
        const subFs = fs * 0.62;
        const subX = right ? x - mainW - 14 : x + mainW + 14;
        return `<text x="${r1(x)}" y="${r1(cy)}" font-size="${r1(fs)}" font-weight="700" text-anchor="${anchor}" dominant-baseline="central" fill="${color}">${esc(main)}</text>` +
            (sub ? `<text x="${r1(subX)}" y="${r1(cy + 2)}" font-size="${r1(subFs)}" font-weight="500" text-anchor="${anchor}" dominant-baseline="central" fill="${subColor}">${esc(sub)}</text>` : '');
    };
    return one(d.prev, false) + one(d.next, true);
}

export function renderStationBoard(styleIn, d) {
    const style = { ...DEFAULT_SIGN_STYLE, ...(styleIn || {}) };
    const { w: W, h: H } = SIGN_SIZES.board;
    const primary = d.lines[0]?.color || '#5F6168';
    const full = style.stripe === 'full';
    const bg = full ? primary : style.boardBg;
    const text = full ? contrastText(primary) : style.boardText;
    const subC = full ? (contrastText(primary) === '#ffffff' ? 'rgba(255,255,255,0.82)' : 'rgba(0,0,0,0.65)') : style.subText;
    const font = fontCss(style);
    const showNb = style.showNeighbors && (d.prev || d.next);
    let out = svgOpen(W, H, style, bg);

    // 色帶與內容區
    let cx0 = 36, cx1 = W - 36, cy0 = 0, cy1 = H;
    const band = 64;
    if (style.stripe === 'bottom') {
        out += stripeBands(d.lines, 0, H - band, W, band, false);
        if (showNb) out += neighborsRow(d, 30, W - 30, H - band / 2, 30, contrastText(primary), contrastText(primary), style.showSub);
        cy1 = H - band;
    } else if (style.stripe === 'top') {
        out += stripeBands(d.lines, 0, 0, W, band, false);
        if (showNb) out += neighborsRow(d, 30, W - 30, band / 2, 30, contrastText(primary), contrastText(primary), style.showSub);
        cy0 = band;
    } else {
        if (style.stripe === 'left') { out += stripeBands(d.lines, 0, 0, 40, H, true); cx0 = 76; }
        if (showNb) {
            const y = H - 34;
            out += `<rect x="${cx0 - 10}" y="${H - 64}" width="${W - cx0 - 26}" height="2" fill="${subC}" opacity="0.35"/>`;
            out += full ? `<rect x="0" y="${H - 62}" width="${W}" height="62" fill="rgba(0,0,0,0.16)"/>` : '';
            out += neighborsRow(d, cx0, cx1, y, 28, text, subC, style.showSub);
            cy1 = H - 64;
        }
    }

    // 左:車站圖示或系統標誌
    const ch = cy1 - cy0;
    let x = cx0;
    const art = (style.showIcon && d.icon) ? d.icon : (style.showLogo && d.logo) ? d.logo : null;
    if (art) {
        const size = ch * 0.74;
        const pad = (ch - size) / 2;
        if (full) out += `<rect x="${r1(x - 6)}" y="${r1(cy0 + pad - 6)}" width="${r1(size + 12)}" height="${r1(size + 12)}" rx="10" fill="#ffffff"/>`;
        out += iconGroup(art, x, cy0 + pad, size, font);
        x += size + 34;
    }

    // 站號徽章(直排)
    const nums = style.showNumber ? d.lines.filter(l => l.number || l.code) : [];
    if (nums.length) {
        const bh = Math.min(64, (ch - 24) / Math.min(nums.length, 3) - 8);
        const shown = nums.slice(0, 3);
        const widths = shown.map(l => badge(style.badgeShape, l.color, l.number || l.code, 0, 0, bh).w);
        const colW = Math.max(...widths);
        const total = shown.length * bh + (shown.length - 1) * 8;
        shown.forEach((l, i) => {
            const by = cy0 + (ch - total) / 2 + i * (bh + 8) + bh / 2;
            out += badge(style.badgeShape, full ? '#ffffff' : l.color, l.number || l.code, x + colW / 2, by, bh, full ? l.color : null).svg;
        });
        x += colW + 30;
    }

    // 站名
    const avail = cx1 - x;
    const hasSub = style.showSub && d.sub;
    const nameFs = fitSize(d.name, hasSub ? ch * 0.48 : ch * 0.56, avail);
    const subFs = hasSub ? fitSize(d.sub, Math.min(44, ch * 0.19), avail) : 0;
    const blockH = nameFs + (hasSub ? subFs * 1.25 : 0);
    const top = cy0 + (ch - blockH) / 2;
    out += `<text x="${r1(x)}" y="${r1(top + nameFs * 0.5)}" font-size="${r1(nameFs)}" font-weight="900" dominant-baseline="central" fill="${text}">${esc(d.name)}</text>`;
    if (hasSub) out += `<text x="${r1(x + 2)}" y="${r1(top + nameFs + subFs * 0.7)}" font-size="${r1(subFs)}" font-weight="500" dominant-baseline="central" fill="${subC}">${esc(d.sub)}</text>`;
    return out + '</svg>';
}

// =====================================================
// 月台方向指標(往 終點站・下一站)
// =====================================================

export function renderDirectionSign(styleIn, d, arrow = 'right') {
    const style = { ...DEFAULT_SIGN_STYLE, ...(styleIn || {}) };
    const { w: W, h: H } = SIGN_SIZES.direction;
    const line = d.lines[0] || { color: '#5F6168', code: '' };
    const fg = style.dirText;
    let out = svgOpen(W, H, style, style.dirBg);
    const mainH = 160;

    let x = 40;
    const bh = 96;
    if (line.code || line.number) {
        const b = badge(style.badgeShape, line.color, line.code || line.number, 0, 0, bh);
        out += badge(style.badgeShape, line.color, line.code || line.number, x + b.w / 2, mainH / 2 + 4, bh).svg;
        x += b.w + 34;
    }

    // 箭頭(右側)
    const ax = W - 40 - 110;
    const ay = mainH / 2 + 4;
    const rot = { right: 0, left: 180, up: -90, down: 90 }[arrow] || 0;
    out += `<g transform="translate(${ax + 55} ${ay}) rotate(${rot})"><circle r="52" fill="${fg}"/>` +
        `<path d="M-26 0H22M4 -20L24 0L4 20" fill="none" stroke="${style.dirBg}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></g>`;

    const t = d.towards || d.next || { name: d.name, sub: d.sub };
    const avail = ax - x - 30;
    const pre = '往';
    const preFs = 44;
    out += `<text x="${x}" y="${r1(mainH / 2 - (style.showSub && t.sub ? 18 : 0))}" font-size="${preFs}" font-weight="700" dominant-baseline="central" fill="${fg}" opacity="0.85">${pre}</text>`;
    const nx = x + preFs + 16;
    const nameFs = fitSize(t.name, style.showSub && t.sub ? 80 : 92, avail - preFs - 16);
    const hasSub = style.showSub && t.sub;
    out += `<text x="${nx}" y="${r1(mainH / 2 - (hasSub ? 18 : 0))}" font-size="${r1(nameFs)}" font-weight="900" dominant-baseline="central" fill="${fg}">${esc(t.name)}</text>`;
    if (hasSub) out += `<text x="${nx + 2}" y="${r1(mainH / 2 + 46)}" font-size="${r1(fitSize('To ' + t.sub, 32, avail - preFs))}" font-weight="500" dominant-baseline="central" fill="${fg}" opacity="0.8">To ${esc(t.sub)}</text>`;

    // 下緣:下一站
    out += `<rect x="0" y="${mainH}" width="${W}" height="${H - mainH}" fill="${line.color}"/>`;
    if (d.next) {
        const tc = contrastText(line.color);
        const nx2 = `下一站 ${d.next.name}`;
        out += `<text x="40" y="${mainH + (H - mainH) / 2}" font-size="30" font-weight="800" dominant-baseline="central" fill="${tc}">${esc(nx2)}</text>`;
        if (style.showSub && d.next.sub) out += `<text x="${40 + textWidth(nx2, 30) + 20}" y="${mainH + (H - mainH) / 2 + 2}" font-size="22" font-weight="500" dominant-baseline="central" fill="${tc}" opacity="0.85">Next: ${esc(d.next.sub)}</text>`;
    }
    return out + '</svg>';
}

// =====================================================
// 柱面站名(直書)
// =====================================================

export function renderPillarSign(styleIn, d) {
    const style = { ...DEFAULT_SIGN_STYLE, ...(styleIn || {}) };
    const { w: W, h: H } = SIGN_SIZES.pillar;
    const primary = d.lines[0]?.color || '#5F6168';
    const full = style.stripe === 'full';
    const bg = full ? primary : style.boardBg;
    const text = full ? contrastText(primary) : style.boardText;
    const font = fontCss(style);
    let out = svgOpen(W, H, style, bg);

    let y = 30;
    const art = (style.showLogo && d.logo) ? d.logo : (style.showIcon && d.icon) ? d.icon : null;
    if (art) {
        if (full) out += `<rect x="${(W - 172) / 2}" y="${y - 6}" width="172" height="172" rx="12" fill="#ffffff"/>`;
        out += iconGroup(art, (W - 160) / 2, y, 160, font);
        y += 190;
    }
    const bandH = 54;
    const nums = style.showNumber ? d.lines.filter(l => l.number || l.code).slice(0, 2) : [];
    const numH = nums.length ? nums.length * 72 + 10 : 0;
    const bottom = H - (style.stripe === 'none' ? 20 : bandH) - numH - 20;
    const chars = [...String(d.name || '')];
    const fs = Math.min(170, (bottom - y) / Math.max(1, chars.length) * 0.92, W * 0.6);
    const step = (bottom - y) / Math.max(1, chars.length);
    chars.forEach((c, i) => {
        out += `<text x="${W / 2}" y="${r1(y + step * (i + 0.5))}" font-size="${r1(fs)}" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${text}">${esc(c)}</text>`;
    });
    nums.forEach((l, i) => {
        out += badge(style.badgeShape, full ? '#ffffff' : l.color, l.number || l.code, W / 2, bottom + 20 + i * 72 + 32, 60, full ? l.color : null).svg;
    });
    if (style.stripe !== 'none') out += stripeBands(d.lines, 0, H - bandH, W, bandH, false);
    return out + '</svg>';
}

/** 依種類輸出 */
export function renderSign(kind, style, data, opts = {}) {
    if (kind === 'direction') return renderDirectionSign(style, data, opts.arrow);
    if (kind === 'pillar') return renderPillarSign(style, data);
    return renderStationBoard(style, data);
}

/** 設計器沒有任何車站時的示意資料 */
export const SAMPLE_SIGN_DATA = {
    id: 'sample', name: '範例車站', sub: 'Sample Station',
    lines: [{ color: '#0070BD', code: 'BL', name: '藍線', number: 'BL12' }, { color: '#E3002C', code: 'R', name: '紅線', number: 'R10' }],
    prev: { name: '公園', sub: 'Park' }, next: { name: '市政中心', sub: 'Civic Center' }, towards: { name: '港口', sub: 'Harbor' },
    icon: null, logo: null, systemName: '', systemNameEn: ''
};
