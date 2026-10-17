/**
 * svg-renderer.js
 * 把 network-model 轉成 SVG 字串。地圖上(interactive)與匯出共用同一支程式。
 * interactive 模式額外輸出:點擊熱區、選取高亮、編輯控制點、data-k 屬性。
 */
import { STATUSES } from '../core/constants.js';
import { textWidth } from '../core/geometry.js';
import { contrastText } from '../core/network-model.js';

export const MONO_FAMILY = `'JetBrains Mono',Consolas,monospace`;
export const FONT_FAMILY = `'Noto Sans TC','Microsoft JhengHei','PingFang TC','Heiti TC',sans-serif`;

export function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const f1 = v => Math.round(v * 10) / 10;

export function pathD(pts) {
    if (!pts.length) return '';
    return 'M' + pts.map(p => `${f1(p.x)} ${f1(p.y)}`).join('L');
}

/** 單一區間(依路線類型與狀態) */
export function sectionSVG(color, w, type, status, d) {
    const col = status === 'closed' ? '#a3a3a3' : color;
    const round = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';
    let out = '';
    if (status === 'planned') {
        out += `<path d="${d}" ${round} stroke="${col}" stroke-width="${f1(w)}" stroke-dasharray="${f1(w * 0.1)} ${f1(w * 1.5)}" opacity="0.85"/>`;
        return out;
    }
    out += `<path d="${d}" ${round} stroke="${col}" stroke-width="${f1(w)}"/>`;
    if (type === 'rail') {
        out += `<path d="${d}" fill="none" stroke-linejoin="round" stroke="#ffffff" stroke-width="${f1(w * 0.45)}" stroke-dasharray="${f1(w * 1.8)} ${f1(w * 1.8)}"/>`;
    } else if (type === 'hsr') {
        out += `<path d="${d}" fill="none" stroke-linejoin="round" stroke="#ffffff" stroke-width="${f1(w * 0.2)}"/>`;
    }
    if (status === 'construction') {
        out += `<path d="${d}" fill="none" stroke-linejoin="round" stroke="#ffffff" stroke-width="${f1(w * 0.6)}" stroke-dasharray="${f1(w * 0.7)} ${f1(w * 0.7)}" opacity="0.9"/>`;
    }
    return out;
}

function stationShape(s, extra = '') {
    const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
    const op = s.opacity < 1 ? ` opacity="${s.opacity}"` : '';
    if (s.capsule) {
        const c = s.capsule;
        const pts = `x1="${f1(c.x1)}" y1="${f1(c.y1)}" x2="${f1(c.x2)}" y2="${f1(c.y2)}"`;
        return `<g${op}${extra}><line ${pts} stroke="${s.stroke}" stroke-width="${f1(s.r * 2 + s.sw)}" stroke-linecap="round"/>` +
            `<line ${pts} stroke="${s.fill}" stroke-width="${f1(Math.max(1, s.r * 2 - s.sw))}" stroke-linecap="round"/></g>`;
    }
    return `<circle cx="${f1(s.x)}" cy="${f1(s.y)}" r="${f1(s.r)}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${f1(s.sw)}"${dash}${op}${extra}/>`;
}

/**
 * opts: { interactive, selection:{type, ids}, extensionStationId, selectedLineId }
 */
export function renderNetwork(model, opts = {}) {
    const { interactive = false } = opts;
    const sel = opts.selection || { type: null, ids: [] };
    const selStations = new Set(sel.type === 'station' ? sel.ids : []);
    const selLine = sel.type === 'line' ? sel.ids[0] : opts.selectedLineId;
    const theme = model.theme;
    const out = [];

    // --- 選取路線光暈 ---
    if (interactive && selLine) {
        out.push('<g class="net-glow">');
        model.sections.filter(s => s.line.id === selLine).forEach(s => {
            out.push(`<path d="${pathD(s.drawPath)}" fill="none" stroke="#1E5A4E" stroke-opacity="0.35" stroke-linecap="round" stroke-linejoin="round" stroke-width="${f1(s.w + 10)}"/>`);
        });
        out.push('</g>');
    }

    // --- 路線 ---
    out.push('<g class="net-lines">');
    model.sections.forEach(s => {
        out.push(sectionSVG(s.color, s.w, s.type, s.status, pathD(s.drawPath)));
    });
    out.push('</g>');

    // --- 連通道 ---
    out.push('<g class="net-corridors">');
    model.corridors.forEach(c => {
        const d = pathD([c.a, c.b]);
        const w = c.w;
        const selected = interactive && sel.type === 'corridor' && sel.ids.includes(c.id);
        if (selected) out.push(`<path d="${d}" stroke="#1E5A4E" stroke-opacity="0.4" stroke-width="${f1(w * 1.4 + 8)}" stroke-linecap="round"/>`);
        if (c.type === 'out-station') {
            out.push(`<path d="${d}" stroke="${theme.ink}" stroke-width="${f1(w * 0.95)}" stroke-linecap="round"/>`);
            out.push(`<path d="${d}" stroke="#ffffff" stroke-width="${f1(w * 0.5)}" stroke-linecap="round"/>`);
        } else {
            out.push(`<path d="${d}" stroke="${theme.ink}" stroke-width="${f1(w * 0.4)}" stroke-dasharray="${f1(w * 0.6)} ${f1(w * 0.5)}"/>`);
        }
        if (interactive) out.push(`<path class="hit" data-k="corridor" data-id="${c.id}" d="${d}" stroke="transparent" stroke-width="${f1(Math.max(12, w * 2))}"/>`);
    });
    out.push('</g>');

    // --- 路線點擊熱區 ---
    if (interactive) {
        out.push('<g class="net-hits">');
        model.sections.forEach(s => {
            out.push(`<path class="hit" data-k="line" data-line="${s.line.id}" data-sec="${s.idx}" d="${pathD(s.drawPath)}" fill="none" stroke="transparent" stroke-width="${f1(Math.max(14, s.w + 8))}" stroke-linecap="round" stroke-linejoin="round"/>`);
        });
        out.push('</g>');
    }

    // --- 出土段標記(僅編輯畫面;橫跨路線的短白條,可拖曳) ---
    if (interactive && model.portals?.length) {
        const LV = { underground: '地下', ground: '平面', elevated: '高架' };
        out.push('<g class="net-portals">');
        model.portals.forEach(p => {
            const deg = p.angle * 180 / Math.PI;
            const len = Math.max(14, p.w * 2.6), th = Math.max(5, p.w * 0.75);
            out.push(`<g class="handle portal" data-k="portal" data-line="${p.lineId}" data-a="${p.aId}" data-b="${p.bId}" transform="translate(${f1(p.x)} ${f1(p.y)}) rotate(${f1(deg)})">` +
                `<rect x="${f1(-th / 2)}" y="${f1(-len / 2)}" width="${f1(th)}" height="${f1(len)}" rx="${f1(th * 0.3)}" fill="#ffffff" stroke="${theme.ink}" stroke-width="1.6"/>` +
                `<path d="M${f1(-th / 2)} 0H${f1(th / 2)}" stroke="${p.color}" stroke-width="1.6"/>` +
                `<title>出土段:${LV[p.la]} → ${LV[p.lb]}(拖曳調整位置)</title></g>`);
        });
        out.push('</g>');
    }

    // --- 車站 ---
    out.push('<g class="net-stations">');
    model.stations.forEach(s => {
        if (interactive && selStations.has(s.id)) {
            const rr = (s.capsule ? s.capsule.spread / 2 : 0) + s.r + s.sw + 4;
            out.push(`<circle cx="${f1(s.x)}" cy="${f1(s.y)}" r="${f1(rr)}" fill="#1E5A4E" fill-opacity="0.18" stroke="#1E5A4E" stroke-width="2"/>`);
        }
        if (interactive && opts.extensionStationId === s.id) {
            out.push(`<circle class="ext-target" cx="${f1(s.x)}" cy="${f1(s.y)}" r="${f1(s.r + s.sw + 6)}" fill="none" stroke="#E0A010" stroke-width="2.5" stroke-dasharray="5 4"/>`);
        }
        const extra = interactive ? ` class="station" data-k="station" data-id="${s.id}"` : '';
        out.push(stationShape(s, extra));
        if (interactive && s.r < 9 && !s.capsule) {
            out.push(`<circle class="hit" data-k="station" data-id="${s.id}" cx="${f1(s.x)}" cy="${f1(s.y)}" r="10" fill="transparent"/>`);
        }
    });
    out.push('</g>');

    // --- 站名 ---
    out.push(`<g class="net-labels" font-family="${esc(FONT_FAMILY)}">`);
    model.labels.forEach(l => {
        const fill = l.closed ? '#9a9a9a' : theme.text;
        const halo = `stroke="${theme.halo}" stroke-linejoin="round" paint-order="stroke"`;
        const k = interactive ? ` class="label" data-k="label" data-id="${l.stationId}"` : '';
        out.push(`<g${k}>`);
        out.push(`<text x="${f1(l.x)}" y="${f1(l.nameY)}" text-anchor="${l.anchor}" font-size="${f1(l.f)}" font-weight="700" fill="${fill}" ${halo} stroke-width="${f1(l.f * 0.3)}"${l.closed ? ' text-decoration="line-through"' : ''}>${esc(l.name)}</text>`);
        if (l.numbers) out.push(`<text x="${f1(l.x)}" y="${f1(l.numY)}" text-anchor="${l.anchor}" font-size="${f1(l.fsub)}" font-weight="700" font-family="${esc(MONO_FAMILY)}" fill="${fill}" fill-opacity="0.75" ${halo} stroke-width="${f1(l.fsub * 0.3)}">${esc(l.numbers)}</text>`);
        if (l.sub) out.push(`<text x="${f1(l.x)}" y="${f1(l.subY)}" text-anchor="${l.anchor}" font-size="${f1(l.fsub)}" font-weight="500" fill="${fill}" fill-opacity="0.8" ${halo} stroke-width="${f1(l.fsub * 0.3)}">${esc(l.sub)}</text>`);
        out.push('</g>');
    });
    out.push('</g>');

    // --- 路線代碼 ---
    out.push(`<g class="net-badges" font-family="${esc(FONT_FAMILY)}">`);
    model.badges.forEach(b => {
        out.push(`<rect x="${f1(b.x - b.w / 2)}" y="${f1(b.y - b.h / 2)}" width="${f1(b.w)}" height="${f1(b.h)}" rx="${f1(b.h * 0.22)}" fill="${b.color}" stroke="#ffffff" stroke-width="${f1(b.h * 0.08)}"/>`);
        out.push(`<text x="${f1(b.x)}" y="${f1(b.y + b.fs * 0.35)}" text-anchor="middle" font-size="${f1(b.fs)}" font-weight="800" fill="${b.textColor}">${esc(b.text)}</text>`);
    });
    out.push('</g>');

    // --- 編輯控制點 ---
    if (interactive && model.handles.length) {
        out.push('<g class="net-handles">');
        model.handles.forEach(h => {
            const data = `data-line="${h.lineId}" data-idx="${h.idx}"`;
            if (h.kind === 'turn') {
                out.push(`<rect class="handle" data-k="turn" ${data} x="${f1(h.x - 6)}" y="${f1(h.y - 6)}" width="12" height="12" fill="#1E5A4E" stroke="#ffffff" stroke-width="2"><title>轉折點:拖曳移動・雙擊或右鍵刪除</title></rect>`);
            } else if (h.kind === 'elbow') {
                out.push(`<path class="handle" data-k="elbow" ${data} data-mode="${h.mode}" d="M${f1(h.x)} ${f1(h.y - 7)}L${f1(h.x + 7)} ${f1(h.y)}L${f1(h.x)} ${f1(h.y + 7)}L${f1(h.x - 7)} ${f1(h.y)}Z" fill="#FFF4D6" stroke="#E0A010" stroke-width="2"><title>自動彎折:點擊切換先斜/先直・拖曳改為固定轉折點</title></path>`);
            } else if (h.kind === 'mid') {
                out.push(`<g class="handle" data-k="mid" ${data} data-to="${h.to}"><circle cx="${f1(h.x)}" cy="${f1(h.y)}" r="7" fill="#ffffff" stroke="#1E5A4E" stroke-width="2"/>` +
                    `<path d="M${f1(h.x - 3.5)} ${f1(h.y)}H${f1(h.x + 3.5)}M${f1(h.x)} ${f1(h.y - 3.5)}V${f1(h.y + 3.5)}" stroke="#1E5A4E" stroke-width="2"/><title>拖曳以新增轉折點</title></g>`);
            }
        });
        out.push('</g>');
    }

    return out.join('');
}

/**
 * 匯出用標題與圖例。回傳 { svg, w, h }(以 0,0 為左上角,由呼叫端 translate)
 */
export function renderLegend(state, model, S) {
    const theme = model.theme;
    const fs = 13 * S;
    const pad = 12 * S;
    const rowH = fs * 1.9;
    const sampleW = 34 * S;
    const w0 = model.baseW;
    const rows = [];

    state.lines.forEach(line => {
        const st = line.nodes.filter(n => n.type === 'station');
        if (!st.length) return;
        const first = state.stations.find(s => s.id === st[0].id);
        const last = state.stations.find(s => s.id === st[st.length - 1].id);
        const range = line.loop ? `${first?.name || ''}(環狀)` : st.length > 1 && first && last ? `${first.name} – ${last.name}` : (first?.name || '');
        rows.push({ kind: 'line', line, text: line.name, sub: range });
    });

    const usedStatus = new Set(), usedKinds = new Set(), usedCorr = new Set();
    model.sections.forEach(s => usedStatus.add(s.status));
    model.stations.forEach(s => usedKinds.add(s.kind));
    model.corridors.forEach(c => usedCorr.add(c.type));
    ['construction', 'planned', 'closed'].forEach(k => { if (usedStatus.has(k)) rows.push({ kind: 'status', status: k, text: STATUSES[k] }); });
    if (usedKinds.has('interchange')) rows.push({ kind: 'sym', sym: 'interchange', text: '轉乘站' });
    if (usedKinds.has('out-transfer') || usedCorr.has('out-station')) rows.push({ kind: 'sym', sym: 'out', text: '站外轉乘' });
    if (usedCorr.has('in-station')) rows.push({ kind: 'sym', sym: 'in', text: '站內連通' });
    if (!rows.length) return null;

    let maxText = 0;
    rows.forEach(r => {
        const t = textWidth(r.text, fs) + (r.line?.code ? textWidth(r.line.code, fs * 0.85) + fs * 1.2 : 0);
        const sub = r.sub ? textWidth(r.sub, fs * 0.8) + fs * 0.6 : 0;
        maxText = Math.max(maxText, t + sub);
    });
    const W = pad * 2 + sampleW + fs * 0.8 + maxText;
    const H = pad * 2 + rowH * rows.length;
    const out = [`<rect x="0" y="0" width="${f1(W)}" height="${f1(H)}" rx="${f1(8 * S)}" fill="${theme.panel}" stroke="rgba(0,0,0,0.12)"/>`];
    out.push(`<g font-family="${esc(FONT_FAMILY)}">`);
    rows.forEach((r, i) => {
        const cy = pad + rowH * i + rowH / 2;
        const x0 = pad, x1 = pad + sampleW;
        const d = `M${f1(x0)} ${f1(cy)}L${f1(x1)} ${f1(cy)}`;
        if (r.kind === 'line') {
            out.push(sectionSVG(r.line.color, w0, r.line.type, r.line.status || 'open', d));
        } else if (r.kind === 'status') {
            out.push(sectionSVG('#777777', w0, 'metro', r.status, d));
        } else if (r.sym === 'interchange') {
            out.push(`<circle cx="${f1((x0 + x1) / 2)}" cy="${f1(cy)}" r="${f1(w0 * 1.1)}" fill="#fff" stroke="${theme.ink}" stroke-width="${f1(w0 * 0.42)}"/>`);
        } else if (r.sym === 'out') {
            out.push(`<path d="${d}" stroke="${theme.ink}" stroke-width="${f1(w0 * 0.95)}"/><path d="${d}" stroke="#fff" stroke-width="${f1(w0 * 0.5)}"/>`);
        } else if (r.sym === 'in') {
            out.push(`<path d="${d}" stroke="${theme.ink}" stroke-width="${f1(w0 * 0.4)}" stroke-dasharray="${f1(w0 * 0.6)} ${f1(w0 * 0.5)}"/>`);
        }
        let tx = x1 + fs * 0.8;
        if (r.line?.code) {
            const bw = textWidth(r.line.code, fs * 0.85) + fs * 0.6;
            out.push(`<rect x="${f1(tx)}" y="${f1(cy - fs * 0.7)}" width="${f1(bw)}" height="${f1(fs * 1.4)}" rx="${f1(fs * 0.3)}" fill="${r.line.color}"/>`);
            const tc = contrastText(r.line.color);
            out.push(`<text x="${f1(tx + bw / 2)}" y="${f1(cy + fs * 0.3)}" text-anchor="middle" font-size="${f1(fs * 0.85)}" font-weight="800" fill="${tc}">${esc(r.line.code)}</text>`);
            tx += bw + fs * 0.4;
        }
        out.push(`<text x="${f1(tx)}" y="${f1(cy + fs * 0.35)}" font-size="${f1(fs)}" font-weight="700" fill="${theme.panelText}">${esc(r.text)}` +
            (r.sub ? `<tspan dx="${f1(fs * 0.5)}" font-size="${f1(fs * 0.8)}" font-weight="400" fill-opacity="0.7">${esc(r.sub)}</tspan>` : '') + `</text>`);
    });
    out.push('</g>');
    return { svg: out.join(''), w: W, h: H };
}

