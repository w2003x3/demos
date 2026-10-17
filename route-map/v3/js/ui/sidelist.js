/**
 * sidelist.js
 * 左側清單:分頁「路線 / 車站 / 連通道」+ 圖例。取代舊版「行駛區間」浮動視窗。
 */
import { store } from '../core/store.js';
import { bus } from '../core/event-bus.js';
import { CORRIDOR_TYPES } from '../core/constants.js';
import { contrastText } from '../core/network-model.js';
import { esc } from '../render/svg-renderer.js';

const badge = (l) => `<span class="code-badge" style="background:${l.color};color:${contrastText(l.color)}">${esc(l.code || '—')}</span>`;
const EYE = '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const EYE_OFF = '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

export class SideList {
    constructor({ view, editor }) {
        this.el = document.getElementById('sidelist');
        this.view = view;
        this.editor = editor;
        this.tab = 'lines';
        this.query = '';
        ['STATE_CHANGED', 'STATE_LOADED', 'SELECTION_CHANGED'].forEach(ev => bus.on(ev, () => this.schedule()));
        this.el.addEventListener('click', (e) => this.onClick(e));
        this.el.addEventListener('dblclick', (e) => this.onDbl(e));
        this.el.addEventListener('input', (e) => {
            if (e.target.matches('.list-search')) { this.query = e.target.value; this.renderBody(); }
        });
        this.render();
    }

    schedule() {
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => { this._raf = null; this.renderBody(); this.renderTabs(); });
    }

    render() {
        this.el.innerHTML = `<div class="tabs"></div><div class="list-body"></div>
            <div class="legend"><h4>圖例</h4><div class="legend-grid">
                <span><svg width="14" height="14"><circle cx="7" cy="7" r="4.5" fill="#fff" stroke="#5F6168" stroke-width="2"/></svg>一般站</span>
                <span><svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="#fff" stroke="#1b1c1f" stroke-width="3"/></svg>轉乘站</span>
                <span><svg width="26" height="8"><path d="M1 4h24" stroke="#1b1c1f" stroke-width="2" stroke-dasharray="3 2.5"/></svg>站內連通</span>
                <span><svg width="26" height="8"><path d="M1 4h24" stroke="#1b1c1f" stroke-width="6"/><path d="M1 4h24" stroke="#fff" stroke-width="3"/></svg>站外轉乘</span>
                <span><svg width="26" height="8"><path d="M1 4h24" stroke="#777" stroke-width="5"/><path d="M1 4h24" stroke="#fff" stroke-width="3" stroke-dasharray="3 3"/></svg>興建中</span>
                <span><svg width="26" height="8"><path d="M2 4h22" stroke="#777" stroke-width="5" stroke-linecap="round" stroke-dasharray="0.5 7"/></svg>規劃中</span>
            </div></div>`;
        this.renderTabs();
        this.renderBody();
    }

    renderTabs() {
        const st = store.state;
        const tabs = [['lines', '路線', st.lines.length], ['stations', '車站', st.stations.length], ['corridors', '連通道', st.corridors.length]];
        this.el.querySelector('.tabs').innerHTML = tabs.map(([k, t, n]) =>
            `<button class="tab ${this.tab === k ? 'active' : ''}" data-tab="${k}">${t}<span class="count">${n}</span></button>`).join('');
    }

    renderBody() {
        const body = this.el.querySelector('.list-body');
        const sel = store.getSelection();
        const st = store.state;
        let html = '';
        if (this.tab === 'lines') {
            html = st.lines.map(l => {
                const stn = l.nodes.filter(n => n.type === 'station');
                const a = stn.length ? store.getStation(stn[0].id)?.name : '';
                const b = stn.length > 1 ? store.getStation(stn[stn.length - 1].id)?.name : '';
                const range = !stn.length ? '空路線' : l.loop ? `${a}(環狀)` : b ? `${a} ↔ ${b}` : a;
                const on = sel.type === 'line' && sel.ids.includes(l.id);
                return `<div class="row ${on ? 'selected' : ''} ${l.hidden ? 'dim' : ''}" data-line="${l.id}">
                    ${badge(l)}
                    <div class="row-main"><div class="row-title">${esc(l.name)}</div><div class="row-sub">${esc(range)}・${stn.length} 站</div></div>
                    <div class="row-actions">
                        <button class="mini-btn" data-order="${l.id}" data-delta="-1" title="上移(共線時決定排列順序)">▲</button>
                        <button class="mini-btn" data-order="${l.id}" data-delta="1" title="下移">▼</button>
                        <button class="mini-btn" data-eye="${l.id}" title="${l.hidden ? '顯示' : '隱藏'}">${l.hidden ? EYE_OFF : EYE}</button>
                    </div></div>`;
            }).join('') + `<button class="add-row" data-act="new-line">＋ 新增路線 <kbd>Shift+L</kbd></button>`;
        } else if (this.tab === 'stations') {
            const q = this.query.trim().toLowerCase();
            const list = st.stations.filter(s => !q || s.name.toLowerCase().includes(q) || (s.sub || '').toLowerCase().includes(q));
            html = `<input class="list-search" placeholder="搜尋站名…" value="${esc(this.query)}">` +
                list.slice(0, 500).map(s => {
                    const on = sel.type === 'station' && sel.ids.includes(s.id);
                    const lines = s.lines.map(id => store.getLine(id)).filter(Boolean);
                    return `<div class="row ${on ? 'selected' : ''}" data-station="${s.id}">
                        <span class="st-glyph" style="border-color:${lines.length > 1 ? '#1b1c1f' : lines[0]?.color || '#999'}"></span>
                        <div class="row-main"><div class="row-title">${esc(s.name)}</div>
                        <div class="row-sub">${lines.map(l => esc(l.code || l.name)).join('・') || '未屬任何路線'}${s.sub ? '・' + esc(s.sub) : ''}</div></div></div>`;
                }).join('') + (list.length > 500 ? `<p class="hint">僅顯示前 500 筆,請用搜尋縮小範圍。</p>` : '') +
                (!list.length ? '<p class="empty">沒有車站</p>' : '');
        } else {
            html = st.corridors.map(c => {
                const a = store.getStation(c.fromId), b = store.getStation(c.toId);
                const on = sel.type === 'corridor' && sel.ids.includes(c.id);
                return `<div class="row ${on ? 'selected' : ''}" data-corridor="${c.id}">
                    <div class="row-main"><div class="row-title">${esc(a?.name)} ⇄ ${esc(b?.name)}</div><div class="row-sub">${CORRIDOR_TYPES[c.type]}</div></div></div>`;
            }).join('') || '<p class="empty">尚無連通道<br>按 <kbd>C</kbd> 後依序點兩站建立</p>';
        }
        const focused = document.activeElement && document.activeElement.matches('.list-search');
        body.innerHTML = html;
        if (focused) {
            const inp = body.querySelector('.list-search');
            inp.focus();
            inp.setSelectionRange(inp.value.length, inp.value.length);
        }
    }

    onClick(e) {
        const t = e.target.closest('[data-tab], [data-eye], [data-order], [data-act], [data-line], [data-station], [data-corridor]');
        if (!t) return;
        const d = t.dataset;
        if (d.tab) { this.tab = d.tab; this.renderTabs(); this.renderBody(); return; }
        if (d.eye) { e.stopPropagation(); const l = store.getLine(d.eye); store.updateLine(l.id, { hidden: !l.hidden }); return; }
        if (d.order) { e.stopPropagation(); store.moveLineOrder(d.order, +d.delta); return; }
        if (d.act === 'new-line') { this.editor.setTool('line', { forceNew: true }); return; }
        if (d.line) {
            if (this.editor.tool !== 'select') this.editor.setTool('select');
            store.select('line', [d.line]);
        } else if (d.station) {
            const s = store.getStation(d.station);
            if (e.shiftKey) store.toggleStationSelection(s.id);
            else this.editor.selectStation(s.id);
            if (!this.view.map.getBounds().pad(-0.1).contains([s.lat, s.lng])) this.view.map.panTo([s.lat, s.lng]);
        } else if (d.corridor) {
            store.select('corridor', [d.corridor]);
        }
    }

    /** 雙擊路線 → 縮放到該路線 */
    onDbl(e) {
        const t = e.target.closest('[data-line]');
        if (!t) return;
        const l = store.getLine(t.dataset.line);
        const pts = l.nodes.map(n => n.type === 'station' ? store.getStation(n.id) : n).filter(Boolean).map(p => [p.lat, p.lng]);
        if (pts.length) this.view.map.fitBounds(pts, { padding: [60, 60], maxZoom: 16 });
    }
}
