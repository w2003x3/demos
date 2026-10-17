/**
 * icon-editor.js
 * 100×100 向量圖示繪製器(系統標誌、車站圖示共用)。
 * 工具:選取/移動、筆刷、直線、矩形、圓/橢圓、多邊形、文字。
 * 每完成一筆就呼叫 onChange({ shapes }),由呼叫端寫回 store。
 */
import { shapeSvg } from './sign-render.js';
import { esc } from '../render/svg-renderer.js';

export const ICON_TOOLS = {
    select: { name: '選取/移動', key: 'V', glyph: '<path d="m5 3 14 7-6 2-2 6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' },
    pen: { name: '筆刷', key: 'B', glyph: '<path d="M4 20c4-1 5-5 9-9l3 3c-4 4-8 5-12 6zM14 9l3-3 3 3-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' },
    line: { name: '直線', key: 'L', glyph: '<path d="M5 19 19 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' },
    rect: { name: '矩形', key: 'R', glyph: '<rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>' },
    ellipse: { name: '圓/橢圓', key: 'O', glyph: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>' },
    poly: { name: '多邊形', key: 'P', glyph: '<path d="M12 3 21 10 17 20H7L3 10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' },
    text: { name: '文字', key: 'T', glyph: '<path d="M5 6V4h14v2M12 4v16M9 20h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' }
};

/** 範本:作為起點再修改(皆為通用幾何,不仿任何實際系統標誌) */
export const ICON_TEMPLATES = {
    ring: { name: '圓環字母', shapes: [{ t: 'ellipse', cx: 50, cy: 50, rx: 40, ry: 40, fill: 'none', stroke: '#1E5A4E', sw: 9 }, { t: 'text', x: 50, y: 52, text: 'M', size: 50, weight: 900, fill: '#1E5A4E' }] },
    disc: { name: '實心圓', shapes: [{ t: 'ellipse', cx: 50, cy: 50, rx: 44, ry: 44, fill: '#0070BD' }, { t: 'text', x: 50, y: 52, text: 'M', size: 56, weight: 900, fill: '#FFFFFF' }] },
    square: { name: '方塊', shapes: [{ t: 'rect', x: 8, y: 8, w: 84, h: 84, rx: 16, fill: '#E3002C' }, { t: 'text', x: 50, y: 52, text: 'R', size: 58, weight: 900, fill: '#FFFFFF' }] },
    rails: { name: '雙軌', shapes: [{ t: 'ellipse', cx: 50, cy: 50, rx: 44, ry: 44, fill: '#173F37' }, { t: 'path', pts: [[22, 70], [42, 30], [58, 30], [78, 70]], closed: false, fill: 'none', stroke: '#FFFFFF', sw: 7 }, { t: 'line', x1: 34, y1: 55, x2: 66, y2: 55, stroke: '#F2B01E', sw: 6 }] },
    train: { name: '列車', shapes: [{ t: 'rect', x: 22, y: 14, w: 56, h: 62, rx: 14, fill: '#1B1C1F' }, { t: 'rect', x: 30, y: 24, w: 40, h: 22, rx: 4, fill: '#FFFFFF' }, { t: 'ellipse', cx: 35, cy: 62, rx: 5, ry: 5, fill: '#F2B01E' }, { t: 'ellipse', cx: 65, cy: 62, rx: 5, ry: 5, fill: '#F2B01E' }, { t: 'line', x1: 32, y1: 80, x2: 24, y2: 90, stroke: '#1B1C1F', sw: 5 }, { t: 'line', x1: 68, y1: 80, x2: 76, y2: 90, stroke: '#1B1C1F', sw: 5 }] },
    mountain: { name: '山景(車站圖示)', shapes: [{ t: 'rect', x: 6, y: 6, w: 88, h: 88, rx: 10, fill: '#E3EFEA' }, { t: 'path', pts: [[10, 80], [38, 34], [54, 58], [66, 44], [90, 80]], closed: true, fill: '#1E5A4E' }, { t: 'ellipse', cx: 72, cy: 26, rx: 9, ry: 9, fill: '#F2B01E' }] },
    wave: { name: '海浪(車站圖示)', shapes: [{ t: 'rect', x: 6, y: 6, w: 88, h: 88, rx: 10, fill: '#00A0E9' }, { t: 'path', pts: [[12, 52], [24, 42], [36, 52], [48, 42], [60, 52], [72, 42], [88, 52]], fill: 'none', stroke: '#FFFFFF', sw: 6 }, { t: 'path', pts: [[12, 70], [24, 60], [36, 70], [48, 60], [60, 70], [72, 60], [88, 70]], fill: 'none', stroke: '#FFFFFF', sw: 6 }] }
};

const clone = o => JSON.parse(JSON.stringify(o));
const BASE_COLORS = ['#1B1C1F', '#FFFFFF', '#1E5A4E', '#F2B01E', '#E3002C', '#0070BD', '#008659', '#C48C31', '#8246AF', '#00A0E9', '#F26F21', '#8A8D93'];

/** Ramer–Douglas–Peucker 簡化筆跡 */
function simplify(pts, eps) {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts[pts.length - 1]];
    let idx = 0, dmax = 0;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
    for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i];
        const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L;
        if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax <= eps) return [a, b];
    return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

function moveShape(s, dx, dy) {
    if (s.t === 'rect' || s.t === 'text') { s.x += dx; s.y += dy; }
    else if (s.t === 'ellipse') { s.cx += dx; s.cy += dy; }
    else if (s.t === 'line') { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
    else if (s.t === 'path') s.pts = s.pts.map(([x, y]) => [x + dx, y + dy]);
}

export class IconEditor {
    /**
     * @param {HTMLElement} host
     * @param {{ icon, onChange, font, extraColors }} opts
     */
    constructor(host, { icon, onChange, font, extraColors = [] }) {
        this.host = host;
        this.onChange = onChange;
        this.font = font;
        this.colors = [...new Set([...extraColors.map(c => c.toUpperCase()), ...BASE_COLORS])].slice(0, 20);
        this.tool = 'pen';
        this.fill = '#1E5A4E';
        this.stroke = '#1B1C1F';
        this.sw = 6;
        this.text = 'M';
        this.textSize = 40;
        this.snap = true;
        this.sel = -1;
        this.draft = null;
        this.undoStack = [];
        this.redoStack = [];
        this.setIcon(icon);
        this.build();
    }

    setIcon(icon) {
        this.shapes = clone(icon?.shapes || []);
        this.sel = -1;
        this.undoStack = [];
        this.redoStack = [];
        if (this.svg) this.renderAll();
    }

    getIcon() { return { shapes: clone(this.shapes) }; }

    // ------------------------------------------------------------------
    // 版面
    // ------------------------------------------------------------------

    build() {
        this.host.innerHTML = `
        <div class="ie">
            <div class="ie-tools">${Object.entries(ICON_TOOLS).map(([k, t]) =>
                `<button class="ie-tool" data-tool="${k}" title="${t.name} (${t.key})"><svg width="20" height="20" viewBox="0 0 24 24">${t.glyph}</svg><kbd>${t.key}</kbd></button>`).join('')}
                <span class="ie-sep"></span>
                <button class="ie-tool" data-ie="undo" title="復原 (Ctrl+Z)">↶</button>
                <button class="ie-tool" data-ie="redo" title="重做 (Ctrl+Y)">↷</button>
            </div>
            <div class="ie-canvas-wrap">
                <svg class="ie-canvas" viewBox="-4 -4 108 108" tabindex="0">
                    <defs><pattern id="ie-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#d9d2bf" stroke-width="0.3"/></pattern></defs>
                    <rect x="0" y="0" width="100" height="100" fill="#fff"/>
                    <rect x="0" y="0" width="100" height="100" fill="url(#ie-grid)"/>
                    <g data-layer="shapes"></g>
                    <g data-layer="draft"></g>
                    <g data-layer="sel"></g>
                    <rect x="0" y="0" width="100" height="100" fill="none" stroke="#b9ae92" stroke-width="0.4" stroke-dasharray="1.5 1.5"/>
                </svg>
                <div class="ie-hint" data-ie-hint></div>
            </div>
        </div>`;
        this.svg = this.host.querySelector('.ie-canvas');
        this.gShapes = this.svg.querySelector('[data-layer="shapes"]');
        this.gDraft = this.svg.querySelector('[data-layer="draft"]');
        this.gSel = this.svg.querySelector('[data-layer="sel"]');
        this.hintEl = this.host.querySelector('[data-ie-hint]');

        this.host.querySelector('.ie-tools').addEventListener('click', (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.tool) this.setTool(b.dataset.tool);
            else if (b.dataset.ie === 'undo') this.undo();
            else if (b.dataset.ie === 'redo') this.redo();
        });
        this.svg.addEventListener('pointerdown', (e) => this.onDown(e));
        this.svg.addEventListener('dblclick', () => this.finishPoly());
        this.svg.addEventListener('pointermove', (e) => this.onHover(e));
        this.setTool(this.tool);
        this.renderAll();
    }

    /** 屬性面板 HTML(由設計器放到右側欄);bindProps 綁定事件 */
    propsHtml() {
        const sw = (attr, cur) => `<div class="swatches sm">${this.colors.map(c =>
            `<button class="swatch ${cur && cur.toUpperCase() === c ? 'on' : ''}" data-${attr}="${c}" style="background:${c}" title="${c}"></button>`).join('')}
            <input type="color" class="color-inp" data-${attr}-custom value="${cur && cur !== 'none' ? cur : '#000000'}"></div>`;
        const s = this.shapes[this.sel];
        return `
        <div class="insp-sec"><h3>${s ? '選取的圖形' : '畫筆設定'}</h3>
            <div class="field"><label>填色 ${this.fill === 'none' ? '(無)' : ''}<button class="link-btn" data-fill-none>無填色</button></label>${sw('fill', this.fill)}</div>
            <div class="field"><label>線條色 ${this.stroke === 'none' ? '(無)' : ''}<button class="link-btn" data-stroke-none>無線條</button></label>${sw('stroke', this.stroke)}</div>
            <div class="field"><label>線寬</label><div class="range-row"><input type="range" min="0" max="20" step="0.5" value="${this.sw}" data-ie-sw><output>${this.sw}</output></div></div>
            <div class="field-row">
                <div class="field" style="flex:2"><label>文字內容(文字工具)</label><input class="inp" data-ie-text value="${esc(this.text)}" maxlength="8"></div>
                <div class="field"><label>字級</label><input class="inp" type="number" min="6" max="100" data-ie-tsize value="${this.textSize}"></div>
            </div>
            <div class="toggle-row"><span>吸附格線(2.5)</span><label class="switch"><input type="checkbox" data-ie-snap ${this.snap ? 'checked' : ''}><span></span></label></div>
        </div>
        <div class="insp-sec"><h3>圖層・${this.shapes.length}</h3>
            <div class="ie-layers">${this.shapes.map((sh, i) => ({ sh, i })).reverse().map(({ sh, i }) =>
                `<div class="ie-layer ${i === this.sel ? 'on' : ''}" data-layer-i="${i}"><span class="ie-lt">${{ rect: '▭ 矩形', ellipse: '◯ 圓', line: '╱ 直線', path: sh.closed ? '⬠ 多邊形' : '〰 筆跡', text: `T ${esc(sh.text)}` }[sh.t] || sh.t}</span>
                <span class="ie-ldot" style="background:${sh.t === 'line' || (sh.t === 'path' && !sh.closed) ? sh.stroke : sh.fill}"></span></div>`).join('') || '<p class="hint">尚未繪製任何圖形。</p>'}</div>
            <div class="icon-row" style="margin-top:8px">
                <button data-ie="up" title="上移一層" ${this.sel < 0 ? 'disabled' : ''}>↑</button>
                <button data-ie="down" title="下移一層" ${this.sel < 0 ? 'disabled' : ''}>↓</button>
                <button data-ie="dup" title="複製" ${this.sel < 0 ? 'disabled' : ''}>⧉</button>
                <button data-ie="del" title="刪除 (Delete)" ${this.sel < 0 ? 'disabled' : ''}>✕</button>
            </div>
        </div>
        <div class="insp-sec"><h3>範本</h3>
            <div class="ie-templates">${Object.entries(ICON_TEMPLATES).map(([k, t]) =>
                `<button class="ie-tpl" data-tpl="${k}" title="${esc(t.name)}"><svg viewBox="0 0 100 100" width="44" height="44">${t.shapes.map(x => shapeSvg(x)).join('')}</svg><span>${esc(t.name)}</span></button>`).join('')}</div>
            <p class="hint">套用範本會取代目前圖形(可復原)。</p>
            <button class="btn sm btn-danger" data-ie="clear" style="margin-top:6px">清除全部</button>
        </div>`;
    }

    bindProps(el) {
        this.propsEl = el;
        const refresh = () => { el.innerHTML = this.propsHtml(); };
        this.refreshProps = refresh;
        refresh();
        el.addEventListener('click', (e) => {
            const b = e.target.closest('button, [data-layer-i]');
            if (!b || b.disabled) return;
            const d = b.dataset;
            if (d.fill) this.setPaint('fill', d.fill);
            else if (d.stroke) this.setPaint('stroke', d.stroke);
            else if (d.fillNone !== undefined) this.setPaint('fill', 'none');
            else if (d.strokeNone !== undefined) this.setPaint('stroke', 'none');
            else if (d.layerI !== undefined) { this.sel = +d.layerI; this.setTool('select'); this.renderAll(); }
            else if (d.tpl) { this.commit(() => { this.shapes = clone(ICON_TEMPLATES[d.tpl].shapes); this.sel = -1; }); }
            else if (d.ie === 'clear') { if (this.shapes.length) this.commit(() => { this.shapes = []; this.sel = -1; }); }
            else if (d.ie) this.layerOp(d.ie);
        });
        el.addEventListener('input', (e) => {
            const t = e.target, d = t.dataset;
            if (d.ieSw !== undefined) {
                this.sw = parseFloat(t.value);
                t.parentElement.querySelector('output').textContent = this.sw;
                this.applyToSel({ sw: this.sw }, true);
            } else if (d.ieText !== undefined) {
                this.text = t.value;
                const s = this.shapes[this.sel];
                if (s && s.t === 'text' && t.value) this.applyToSel({ text: t.value }, true);
            } else if (d.ieTsize !== undefined) {
                this.textSize = Math.max(6, Math.min(100, parseFloat(t.value) || 40));
                const s = this.shapes[this.sel];
                if (s && s.t === 'text') this.applyToSel({ size: this.textSize }, true);
            } else if (d.fillCustom !== undefined) this.setPaint('fill', t.value, true);
            else if (d.strokeCustom !== undefined) this.setPaint('stroke', t.value, true);
        });
        el.addEventListener('change', (e) => {
            const d = e.target.dataset;
            if (d.ieSnap !== undefined) this.snap = e.target.checked;
            // 連續調整(滑桿、色票、文字)結束時才記一次復原點並回寫
            if (this._live) { this._live = false; this.emit(); refresh(); }
        });
    }

    setPaint(key, val, live = false) {
        this[key] = val;
        if (this.sel >= 0) {
            const s = this.shapes[this.sel];
            if (key === 'fill' && (s.t === 'line' || (s.t === 'path' && !s.closed))) {
                // 線段與筆跡沒有填色 → 改變線條色
                this.applyToSel({ stroke: val === 'none' ? s.stroke : val }, live);
            } else this.applyToSel({ [key]: val }, live);
        }
        if (!live && this.refreshProps) this.refreshProps();
    }

    /** 修改選取圖形;live=true 表示連續調整中(change 時才回寫) */
    applyToSel(props, live = false) {
        const s = this.shapes[this.sel];
        if (!s) return;
        if (!this._live) this.pushUndo();
        Object.assign(s, props);
        this.renderAll(false);
        if (live) this._live = true; else this.emit();
    }

    layerOp(op) {
        const i = this.sel;
        if (i < 0) return;
        this.commit(() => {
            const a = this.shapes;
            if (op === 'up' && i < a.length - 1) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; this.sel = i + 1; }
            else if (op === 'down' && i > 0) { [a[i], a[i - 1]] = [a[i - 1], a[i]]; this.sel = i - 1; }
            else if (op === 'dup') { const c = clone(a[i]); moveShape(c, 4, 4); a.push(c); this.sel = a.length - 1; }
            else if (op === 'del') { a.splice(i, 1); this.sel = -1; }
        });
    }

    // ------------------------------------------------------------------
    // 復原
    // ------------------------------------------------------------------

    pushUndo() {
        this.undoStack.push(JSON.stringify(this.shapes));
        if (this.undoStack.length > 80) this.undoStack.shift();
        this.redoStack = [];
    }

    commit(fn) {
        this.pushUndo();
        fn();
        this.renderAll();
        this.emit();
    }

    undo() {
        if (!this.undoStack.length) return;
        this.redoStack.push(JSON.stringify(this.shapes));
        this.shapes = JSON.parse(this.undoStack.pop());
        this.sel = -1;
        this.renderAll();
        this.emit();
    }

    redo() {
        if (!this.redoStack.length) return;
        this.undoStack.push(JSON.stringify(this.shapes));
        this.shapes = JSON.parse(this.redoStack.pop());
        this.sel = -1;
        this.renderAll();
        this.emit();
    }

    emit() { if (this.onChange) this.onChange(this.getIcon()); }

    // ------------------------------------------------------------------
    // 繪製
    // ------------------------------------------------------------------

    setTool(t) {
        if (this.draft && this.draft.t === 'poly') this.finishPoly();
        this.tool = t;
        this.host.querySelectorAll('.ie-tool[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
        this.svg.style.cursor = t === 'select' ? 'default' : 'crosshair';
        const hints = {
            select: '點選圖形後可拖曳移動;方向鍵微調、Delete 刪除。',
            pen: '按住拖曳自由繪製線條。',
            line: '拖曳畫直線;按住 Shift 鎖定 45°。',
            rect: '拖曳畫矩形;Shift 為正方形。',
            ellipse: '拖曳畫橢圓;Shift 為正圓。',
            poly: '逐點點擊;雙擊或點回起點完成,Esc 取消。',
            text: '在右側輸入文字,再點畫布放置。'
        };
        this.hintEl.textContent = hints[t];
        if (t !== 'select') { this.sel = -1; }
        this.renderAll(false);
        if (this.refreshProps) this.refreshProps();
    }

    renderAll(props = true) {
        this.gShapes.innerHTML = this.shapes.map((s, i) => shapeSvg(s, this.font).replace(/^<(\w+)/, `<$1 data-i="${i}"`)).join('');
        this.renderSel();
        if (props && this.refreshProps) this.refreshProps();
    }

    renderSel() {
        this.gSel.innerHTML = '';
        const el = this.sel >= 0 && this.gShapes.querySelector(`[data-i="${this.sel}"]`);
        if (!el) return;
        const b = el.getBBox();
        const pad = 1.5;
        this.gSel.innerHTML = `<rect x="${b.x - pad}" y="${b.y - pad}" width="${b.width + pad * 2}" height="${b.height + pad * 2}" fill="none" stroke="#1E5A4E" stroke-width="0.6" stroke-dasharray="2 1.2"/>`;
    }

    renderDraft() {
        const d = this.draft;
        if (!d) { this.gDraft.innerHTML = ''; return; }
        if (d.t === 'poly') {
            const pts = [...d.pts, ...(d.hover ? [d.hover] : [])];
            this.gDraft.innerHTML = shapeSvg({ t: 'path', pts, closed: false, fill: 'none', stroke: '#1E5A4E', sw: 0.8 }) +
                d.pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === 0 ? 2 : 1.2}" fill="${i === 0 ? '#F2B01E' : '#1E5A4E'}"/>`).join('');
        } else {
            this.gDraft.innerHTML = shapeSvg(d.shape, this.font);
        }
    }

    pt(e, snap = this.snap) {
        const m = this.svg.getScreenCTM().inverse();
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
        const q = v => snap ? Math.round(v / 2.5) * 2.5 : Math.round(v * 10) / 10;
        return [q(Math.max(-4, Math.min(104, p.x))), q(Math.max(-4, Math.min(104, p.y)))];
    }

    paintProps(closed = true) {
        return closed
            ? { fill: this.fill, stroke: this.stroke, sw: this.stroke === 'none' ? 0 : this.sw }
            : { fill: 'none', stroke: this.stroke === 'none' ? this.fill : this.stroke, sw: Math.max(0.5, this.sw) };
    }

    onHover(e) {
        if (this.draft && this.draft.t === 'poly') {
            this.draft.hover = this.pt(e);
            this.renderDraft();
        }
    }

    onDown(e) {
        if (e.button !== 0) return;
        this.svg.focus();
        const p0 = this.pt(e);
        const tool = this.tool;

        if (tool === 'select') {
            const hit = e.target.closest('[data-i]');
            this.sel = hit ? +hit.dataset.i : -1;
            this.renderAll();
            if (!hit) return;
            const start = this.pt(e, false);
            let moved = false;
            const move = (ev) => {
                const p = this.pt(ev, false);
                const s = this.shapes[this.sel];
                let dx = p[0] - start[0], dy = p[1] - start[1];
                if (this.snap) { dx = Math.round(dx / 2.5) * 2.5; dy = Math.round(dy / 2.5) * 2.5; }
                if (!dx && !dy) return;
                if (!moved) { this.pushUndo(); moved = true; }
                moveShape(s, dx, dy);
                start[0] += dx; start[1] += dy;
                this.renderAll(false);
            };
            const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                if (moved) this.emit();
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            return;
        }

        if (tool === 'text') {
            if (!this.text.trim()) return;
            this.commit(() => {
                this.shapes.push({ t: 'text', x: p0[0], y: p0[1], text: this.text.trim(), size: this.textSize, weight: 900, fill: this.fill === 'none' ? '#1B1C1F' : this.fill });
            });
            return;
        }

        if (tool === 'poly') {
            if (!this.draft) this.draft = { t: 'poly', pts: [p0] };
            else {
                const f = this.draft.pts[0];
                if (this.draft.pts.length >= 3 && Math.hypot(p0[0] - f[0], p0[1] - f[1]) < 3) { this.finishPoly(true); return; }
                this.draft.pts.push(p0);
            }
            this.renderDraft();
            return;
        }

        // 拖曳型工具
        e.preventDefault();
        this.svg.setPointerCapture(e.pointerId);
        const pts = [p0];
        const build = (p, shift) => {
            const [x0, y0] = p0;
            let [x1, y1] = p;
            if (tool === 'line') {
                if (shift) {
                    const a = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 4)) * (Math.PI / 4);
                    const L = Math.hypot(x1 - x0, y1 - y0);
                    x1 = x0 + Math.cos(a) * L; y1 = y0 + Math.sin(a) * L;
                }
                return { t: 'line', x1: x0, y1: y0, x2: x1, y2: y1, stroke: this.stroke === 'none' ? this.fill : this.stroke, sw: Math.max(0.5, this.sw) };
            }
            if (tool === 'pen') return { t: 'path', pts: [...pts], closed: false, ...this.paintProps(false) };
            let w = x1 - x0, h = y1 - y0;
            if (shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
            const x = Math.min(x0, x0 + w), y = Math.min(y0, y0 + h);
            if (tool === 'rect') return { t: 'rect', x, y, w: Math.abs(w), h: Math.abs(h), rx: 0, ...this.paintProps() };
            return { t: 'ellipse', cx: x + Math.abs(w) / 2, cy: y + Math.abs(h) / 2, rx: Math.abs(w) / 2, ry: Math.abs(h) / 2, ...this.paintProps() };
        };
        this.draft = { t: tool, shape: build(p0, e.shiftKey) };
        const move = (ev) => {
            const p = this.pt(ev, tool === 'pen' ? false : this.snap);
            if (tool === 'pen') {
                const last = pts[pts.length - 1];
                if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.8) return;
                pts.push(p);
            }
            this.draft.shape = build(p, ev.shiftKey);
            this.renderDraft();
        };
        const up = (ev) => {
            this.svg.removeEventListener('pointermove', move);
            this.svg.removeEventListener('pointerup', up);
            let s = build(this.pt(ev, tool === 'pen' ? false : this.snap), ev.shiftKey);
            this.draft = null;
            this.renderDraft();
            if (tool === 'pen') {
                if (pts.length < 2) return;
                s = { ...s, pts: simplify(pts, 0.5) };
            }
            const tiny = (s.t === 'rect' && (s.w < 1 || s.h < 1)) || (s.t === 'ellipse' && (s.rx < 0.5 || s.ry < 0.5)) ||
                (s.t === 'line' && Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 1);
            if (tiny) return;
            this.commit(() => { this.shapes.push(s); });
        };
        this.svg.addEventListener('pointermove', move);
        this.svg.addEventListener('pointerup', up);
    }

    finishPoly(closed = true) {
        const d = this.draft;
        if (!d || d.t !== 'poly') return;
        this.draft = null;
        this.renderDraft();
        if (d.pts.length < 2) return;
        const pts = d.pts.filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
        const isClosed = closed && pts.length >= 3;
        this.commit(() => { this.shapes.push({ t: 'path', pts, closed: isClosed, ...this.paintProps(isClosed) }); });
    }

    /** 由設計器轉送的鍵盤事件;回傳 true 表示已處理 */
    handleKey(e) {
        const k = e.key;
        const mod = e.ctrlKey || e.metaKey;
        if (mod && k.toLowerCase() === 'z') { e.shiftKey ? this.redo() : this.undo(); return true; }
        if (mod && k.toLowerCase() === 'y') { this.redo(); return true; }
        if (mod) return false;
        if (k === 'Escape' && this.draft) { this.draft = null; this.renderDraft(); return true; }
        if (k === 'Enter' && this.draft) { this.finishPoly(true); return true; }
        if ((k === 'Delete' || k === 'Backspace') && this.sel >= 0) { this.layerOp('del'); return true; }
        if (k.startsWith('Arrow') && this.sel >= 0) {
            const st = e.shiftKey ? 5 : 1;
            this.commit(() => moveShape(this.shapes[this.sel], k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, k === 'ArrowUp' ? -st : k === 'ArrowDown' ? st : 0));
            return true;
        }
        const tool = Object.entries(ICON_TOOLS).find(([, t]) => t.key === k.toUpperCase());
        if (tool && k.length === 1) { this.setTool(tool[0]); return true; }
        return false;
    }
}
