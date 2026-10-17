/**
 * inspector.js
 * 右側屬性面板:依選取內容切換 無(專案)/路線/車站/多選/連通道。
 * 輸入框即時寫回 store;面板內有焦點時不整頁重繪(避免打字被打斷),失焦後補繪。
 */
import { store } from '../core/store.js';
import { bus } from '../core/event-bus.js';
import {
    STATION_KINDS, STATUSES, LINE_TYPES, ROUTE_MODES, COLOR_PRESETS, CORRIDOR_TYPES, LABEL_POSITIONS
} from '../core/constants.js';
import { contrastText } from '../core/network-model.js';
import { esc } from '../render/svg-renderer.js';
import { routeIcon } from '../tools/editor.js';
import { toast } from './toast.js';
import { renderSign, stationSignData } from '../signs/sign-render.js';

const KIND_GLYPH = {
    auto: '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 5v3l2 1" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
    normal: '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="4.5" fill="#fff" stroke="currentColor" stroke-width="2"/></svg>',
    terminal: '<svg width="20" height="16" viewBox="0 0 20 16"><rect x="3" y="4" width="14" height="8" rx="4" fill="#fff" stroke="currentColor" stroke-width="2"/></svg>',
    interchange: '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="#fff" stroke="currentColor" stroke-width="3"/></svg>',
    'out-transfer': '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="#fff" stroke="currentColor" stroke-width="2.5" stroke-dasharray="3 2"/></svg>'
};
const KIND_SHORT = { auto: '自動', normal: '一般', terminal: '端點', interchange: '轉乘', 'out-transfer': '站外轉乘' };
const RESOLVED = { normal: '一般站', terminal: '端點站', interchange: '轉乘站', 'out-transfer': '站外轉乘站', orphan: '未屬任何路線' };
const DIR_LABEL = { NW: '↖', N: '↑', NE: '↗', W: '←', auto: '自動', E: '→', SW: '↙', S: '↓', SE: '↘' };

const badge = (l) => `<span class="code-badge" style="background:${l.color};color:${contrastText(l.color)}">${esc(l.code || '—')}</span>`;
const chips = (cls, obj, cur, attr) => `<div class="chips ${cls}">${Object.entries(obj).map(([k, t]) =>
    `<button class="chip ${cur === k ? 'on' : ''}" data-${attr}="${k}">${t}</button>`).join('')}</div>`;
const sw = (name, checked, attrs) => `<label class="switch"><input type="checkbox" ${checked ? 'checked' : ''} ${attrs}><span></span></label>`;

export class Inspector {
    constructor({ view, editor, mapCore }) {
        this.el = document.getElementById('inspector');
        this.view = view;
        this.editor = editor;
        this.mapCore = mapCore;
        this.dirty = false;
        this.addBoxOpen = false;

        bus.on('SELECTION_CHANGED', () => { this.addBoxOpen = false; this.render(true); });
        bus.on('STATE_CHANGED', () => this.render());
        bus.on('STATE_LOADED', () => this.render(true));
        bus.on('FOCUS_NAME', () => setTimeout(() => {
            const inp = this.el.querySelector('[data-f="name"]');
            if (inp) { inp.focus(); inp.select(); }
        }, 30));
        this.el.addEventListener('focusout', () => setTimeout(() => {
            if (this.dirty && !this.el.contains(document.activeElement)) this.render(true);
        }, 0));
        this.el.addEventListener('input', (e) => this.onInput(e));
        this.el.addEventListener('change', (e) => this.onChange(e));
        this.el.addEventListener('click', (e) => this.onClick(e));
        this.el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.matches('input.inp')) e.target.blur();
        });
        this.render(true);
    }

    project = (lat, lng) => this.view.toLayer([lat, lng]);

    render(force = false) {
        if (!force && this.el.contains(document.activeElement)) { this.dirty = true; return; }
        if (this._raf && !force) return;
        const run = () => {
            this._raf = null;
            this.dirty = false;
            const scroll = this.el.scrollTop;
            const sel = store.getSelection();
            let html;
            if (sel.type === 'station' && sel.ids.length === 1) html = this.stationView(store.getStation(sel.ids[0]));
            else if (sel.type === 'station' && sel.ids.length > 1) html = this.multiView(sel.ids);
            else if (sel.type === 'line') html = this.lineView(store.getLine(sel.ids[0]));
            else if (sel.type === 'corridor') html = this.corridorView(store.getCorridor(sel.ids[0]));
            else html = this.projectView();
            this.el.innerHTML = html || this.projectView();
            this.el.scrollTop = scroll;
        };
        if (force) { cancelAnimationFrame(this._raf); run(); }
        else this._raf = requestAnimationFrame(run);
    }

    // =====================================================
    // 專案
    // =====================================================

    projectView() {
        const st = store.state;
        const s = st.settings;
        const turns = st.lines.reduce((n, l) => n + l.nodes.filter(x => x.type === 'turning').length, 0);
        return `
        <div class="insp-head"><div><div class="eyebrow">專案</div><h2>${esc(s.projectName || '未命名路網')}</h2></div></div>
        <div class="insp-sec">
            <dl class="kv"><dt>路線</dt><dd>${st.lines.length}</dd><dt>車站</dt><dd>${st.stations.length}</dd><dt>連通道</dt><dd>${st.corridors.length}</dd><dt>轉折點</dt><dd>${turns}</dd></dl>
        </div>
        <div class="insp-sec"><h3>圖面標題(匯出用)</h3>
            <div class="field"><label>標題</label><input class="inp" data-set="title" value="${esc(s.title)}" placeholder="例:台北捷運路網"></div>
            <div class="field"><label>副標題</label><input class="inp" data-set="subtitle" value="${esc(s.subtitle)}" placeholder="例:2026 年 9 月"></div>
        </div>
        <div class="insp-sec"><h3>車站與路線樣式</h3>
            <div class="field"><label>一般站樣式</label>${chips('c2', { ring: '白底+路線色框', dot: '路線色實心' }, s.stationStyle, 'set-station-style')}</div>
            <div class="field"><label>線寬</label><div class="range-row"><input type="range" min="3" max="14" step="0.5" value="${s.lineWidth}" data-set-num="lineWidth"><output>${s.lineWidth}px</output></div></div>
            <div class="field"><label>站名字級</label><div class="range-row"><input type="range" min="9" max="24" step="1" value="${s.labelSize}" data-set-num="labelSize"><output>${s.labelSize}px</output></div></div>
            <div class="toggle-row"><span>顯示站名</span>${sw('', s.showLabels, 'data-set-bool="showLabels"')}</div>
            <div class="toggle-row"><span>端點顯示路線代碼</span>${sw('', s.showCodes, 'data-set-bool="showCodes"')}</div>
            <div class="toggle-row"><span>顯示站號</span>${sw('', s.showNumbers, 'data-set-bool="showNumbers"')}</div>
        </div>
        <div class="insp-sec"><h3>底圖</h3>
            <div class="field"><label>底圖透明度</label><div class="range-row"><input type="range" min="0.1" max="1" step="0.05" value="${s.basemapOpacity}" data-set-num="basemapOpacity"><output>${Math.round(s.basemapOpacity * 100)}%</output></div></div>
            <div class="toggle-row"><span>底圖灰階</span>${sw('', s.basemapGray, 'data-set-bool="basemapGray"')}</div>
            <div class="toggle-row"><span>背景色(無底圖或透明處)</span><input type="color" class="color-inp" data-set-color="bgColor" value="${s.bgColor}"></div>
        </div>
        <div class="insp-sec"><h3>開始</h3>
            <p class="hint">按 <kbd>L</kbd> 新增路線並用連連看畫出車站;點選路線可調整彎折;按 <kbd>?</kbd> 看全部快捷鍵。</p>
        </div>`;
    }

    // =====================================================
    // 路線
    // =====================================================

    lineView(line) {
        if (!line) return null;
        const nodes = line.nodes;
        const stationCount = nodes.filter(n => n.type === 'station').length;
        let k = 0;
        const seq = nodes.map((n, i) => {
            if (n.type === 'turning') {
                return `<div class="seq-turn"><i></i>轉折點・${ROUTE_MODES[n.route || line.routing] || ''}
                    <button class="mini-btn danger" data-rm-node="${i}" title="刪除轉折點">✕</button></div>`;
            }
            const s = store.getStation(n.id);
            if (!s) return '';
            k++;
            const others = s.lines.filter(l => l !== line.id).map(l => store.getLine(l)).filter(Boolean);
            const isEnd = !line.loop && (k === 1 || k === stationCount);
            return `<div class="seq-item" data-goto-station="${s.id}">
                <span class="seq-idx">${k}</span>
                <span class="seq-ring" style="border-color:${others.length ? '#1b1c1f' : line.color}"></span>
                <span class="seq-name">${esc(s.name)}</span>
                ${others.map(badge).join('')}${isEnd && !others.length ? '<span class="hint" style="margin:0">端點</span>' : ''}
                <button class="mini-btn" data-move-st="${i}" data-delta="-1" title="上移">▲</button>
                <button class="mini-btn" data-move-st="${i}" data-delta="1" title="下移">▼</button>
                <button class="mini-btn danger" data-rm-st="${s.id}" title="自本線移除">✕</button>
            </div>`;
        }).join('');

        return `
        <div class="insp-head">${badge(line)}<div style="flex:1"><div class="eyebrow">路線</div><h2>${esc(line.name)}</h2></div></div>
        <div class="insp-sec">
            <div class="field-row">
                <div class="field" style="flex:2"><label>名稱</label><input class="inp" data-lf="name" value="${esc(line.name)}"></div>
                <div class="field"><label>代碼</label><input class="inp mono" data-lf="code" value="${esc(line.code)}"></div>
            </div>
            <div class="field"><label>顏色</label>
                <div class="swatches">
                    ${COLOR_PRESETS.map(p => `<button class="swatch ${p.color.toUpperCase() === line.color.toUpperCase() ? 'on' : ''}" data-lcolor="${p.color}" title="${esc(p.hint)}" style="background:${p.color}"></button>`).join('')}
                    <input type="color" class="color-inp" data-lf-color value="${line.color}">
                    <input class="inp mono sm" style="width:84px" data-lf="color" value="${esc(line.color)}">
                </div>
            </div>
        </div>
        <div class="insp-sec"><h3>繪製樣式</h3>
            <div class="field"><label>預設彎折(個別路段可另設)</label>
                <div class="chips c3">${Object.entries(ROUTE_MODES).map(([m, t]) =>
                    `<button class="chip ${line.routing === m ? 'on' : ''}" data-lrouting="${m}" style="flex-direction:row">${routeIcon(m)}${t}</button>`).join('')}</div>
            </div>
            <div class="field"><label>營運狀態</label>${chips('c4', STATUSES, line.status || 'open', 'lstatus')}</div>
            <div class="field-row">
                <div class="field"><label>類型</label><select class="sel" data-lf-sel="type">${Object.entries(LINE_TYPES).map(([k2, t]) => `<option value="${k2}" ${line.type === k2 ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
                <div class="field"><label>線寬</label>${chips('c3', { thin: '細', normal: '標準', thick: '粗' }, line.widthScale || 'normal', 'lwidth')}</div>
            </div>
            <div class="toggle-row"><span>端點顯示路線代碼</span>${sw('', line.showCode !== false, 'data-lbool="showCode"')}</div>
            <div class="toggle-row"><span>環狀線(末站接回首站)</span>${sw('', !!line.loop, 'data-lbool="loop"')}</div>
            <div class="toggle-row"><span>顯示於地圖</span>${sw('', !line.hidden, 'data-lbool-inv="hidden"')}</div>
        </div>
        <div class="insp-sec"><h3>車站順序・${stationCount}<button class="btn sm" data-act="reverse">⇅ 反轉方向</button></h3>
            <button class="extend-btn" data-act="extend-start">＋ 從起點延伸</button>
            <div class="seq">${seq || '<p class="hint">尚無車站</p>'}</div>
            <button class="extend-btn" data-act="extend-end">＋ 從終點延伸</button>
        </div>
        <div class="insp-sec">
            <div class="action-list">
                <button class="action" data-act="clear-turns"><span class="grow">清除所有轉折點</span></button>
                <button class="action btn-danger" data-act="delete-line"><span class="grow">刪除路線(車站保留)</span><kbd>Del</kbd></button>
            </div>
        </div>`;
    }

    // =====================================================
    // 車站
    // =====================================================

    stationView(s) {
        if (!s) return null;
        const resolved = this.view.model?.stations.find(x => x.id === s.id)?.kind || 'normal';
        const lines = s.lines.map(id => store.getLine(id)).filter(Boolean);
        const lineCards = lines.map(l => {
            const st = l.nodes.filter(n => n.type === 'station');
            const i = st.findIndex(n => n.id === s.id);
            const prev = i > 0 ? store.getStation(st[i - 1].id)?.name : (l.loop ? store.getStation(st[st.length - 1].id)?.name : null);
            const next = i < st.length - 1 ? store.getStation(st[i + 1].id)?.name : (l.loop ? store.getStation(st[0].id)?.name : null);
            return `<div class="line-card">${badge(l)}
                <div class="lc-main"><div class="lc-title">${esc(l.name)}・第 ${i + 1} 站</div>
                <div class="lc-sub">${esc(prev || '(起點)')} ← 本站 → ${esc(next || '(終點)')}</div></div>
                <input class="inp mono sm" data-num="${l.id}" value="${esc(s.numbers?.[l.id] || '')}" placeholder="站號">
                <button class="mini-btn danger" data-rm-line="${l.id}" title="自此路線移除">✕</button></div>`;
        }).join('');

        const candidates = store.getLines().filter(l => !s.lines.includes(l.id));
        const addBox = this.addBoxOpen && candidates.length ? this.addBoxHtml(s, candidates) : '';
        const corrs = store.state.corridors.filter(c => c.fromId === s.id || c.toId === s.id);

        const endpointOf = lines.filter(l => {
            if (l.loop) return false;
            const st = l.nodes.filter(n => n.type === 'station');
            return st.length && (st[0].id === s.id || st[st.length - 1].id === s.id);
        });

        return `
        <div class="insp-head"><span style="color:#1b1c1f">${KIND_GLYPH[resolved === 'orphan' ? 'normal' : resolved] || KIND_GLYPH.normal}</span>
            <div><div class="eyebrow">車站・${RESOLVED[resolved] || ''}${s.kind === 'auto' ? '(自動判斷)' : ''}</div><h2>${esc(s.name)}</h2></div></div>
        <div class="insp-sec">
            <div class="field"><label>站名</label><input class="inp" data-f="name" value="${esc(s.name)}"></div>
            <div class="field"><label>副站名(英文或註記,可空白)</label><input class="inp" data-f="sub" value="${esc(s.sub || '')}" placeholder="例:Taipei Main Station"></div>
        </div>
        <div class="insp-sec"><h3>車站類型</h3>
            <div class="chips c5">${Object.keys(STATION_KINDS).map(k => `<button class="chip tall ${(s.kind || 'auto') === k ? 'on' : ''}" data-kind="${k}" title="${STATION_KINDS[k]}">${KIND_GLYPH[k]}${KIND_SHORT[k]}</button>`).join('')}</div>
            <p class="hint">自動:依所屬路線數與連通道判斷,目前為「${RESOLVED[resolved] || ''}」。</p>
        </div>
        <div class="insp-sec"><h3>營運狀態</h3>${chips('c4', STATUSES, s.status || 'open', 'sstatus')}</div>
        <div class="insp-sec"><h3>所屬路線・${lines.length}</h3>
            ${lineCards || '<p class="hint">尚未加入任何路線。</p>'}
            ${addBox || (candidates.length ? '<button class="extend-btn" data-act="open-add">＋ 加入路線</button>' : '')}
        </div>
        <div class="insp-sec"><h3>指標<button class="btn sm" data-act="open-signs">指標設計…</button></h3>
            <div class="insp-sign">${renderSign('board', store.state.signs.style, stationSignData(store.state, s.id))}</div>
            <button class="extend-btn" data-act="station-icon">${store.state.signs.stationIcons[s.id] ? '編輯車站圖示' : '＋ 繪製車站圖示'}</button>
        </div>
        <div class="insp-sec"><h3>站名位置</h3>
            <div class="pad-row">
                <div class="dir-pad">${LABEL_POSITIONS.map(d => `<button class="${(s.labelPos || 'auto') === d ? 'on' : ''}" data-labelpos="${d}" title="${d}">${DIR_LABEL[d]}</button>`).join('')}</div>
                <p class="hint" style="margin:0">點選方位;也可以直接在地圖上拖曳站名,放開時吸附到最近的方位。</p>
            </div>
        </div>
        <div class="insp-sec"><h3>連通道・${corrs.length}</h3>
            ${corrs.map(c => {
                const o = store.getStation(c.fromId === s.id ? c.toId : c.fromId);
                return `<div class="row" data-goto-corridor="${c.id}"><div class="row-main"><div class="row-title">⇄ ${esc(o?.name)}</div><div class="row-sub">${CORRIDOR_TYPES[c.type]}</div></div>
                    <button class="mini-btn" data-flip-corr="${c.id}" title="切換站內/站外">⇆</button><button class="mini-btn danger" data-rm-corr="${c.id}" title="刪除">✕</button></div>`;
            }).join('') || '<p class="hint">用連通道工具 <kbd>C</kbd> 依序點兩站即可建立。</p>'}
        </div>
        <div class="insp-sec"><div class="action-list">
            ${endpointOf.map(l => `<button class="action" data-extend-from="${l.id}">${badge(l)}<span class="grow">從此站延伸 ${esc(l.name)}</span><kbd>L</kbd></button>`).join('')}
            <button class="action" data-act="split" ${lines.length < 2 ? 'disabled' : ''}><span class="grow">拆出為獨立站(各線各一站 + 站內連通)</span></button>
            <button class="action btn-danger" data-act="delete-station"><span class="grow">刪除車站</span><kbd>Del</kbd></button>
        </div></div>`;
    }

    addBoxHtml(s, candidates) {
        const lineId = this.addLineId && candidates.some(l => l.id === this.addLineId) ? this.addLineId : candidates[0].id;
        this.addLineId = lineId;
        const line = store.getLine(lineId);
        const names = line.nodes.map(n => n.type === 'station' ? store.getStation(n.id)?.name : null);
        const bestIdx = store._bestInsertIndex(line, s, this.project);
        const around = (idx) => {
            const before = names.slice(0, idx).filter(Boolean).pop();
            const after = names.slice(idx).filter(Boolean)[0];
            return before && after ? `${before}–${after}` : before ? `接在 ${before} 後` : after ? `接在 ${after} 前` : '空路線';
        };
        const pairs = [];
        line.nodes.forEach((n, i) => {
            if (i > 0 && n.type === 'station') pairs.push({ idx: i, text: around(i) });
        });
        return `<div class="add-box">
            <div class="field-row field"><label>加入</label>
                <select class="sel" data-add-line>${candidates.map(l => `<option value="${l.id}" ${l.id === lineId ? 'selected' : ''}>${esc((l.code ? l.code + ' ' : '') + l.name)}</option>`).join('')}</select></div>
            <div class="field-row field"><label>位置</label>
                <select class="sel" data-add-pos>
                    <option value="auto">自動:插在最近路段(${esc(around(bestIdx))})</option>
                    <option value="start">接在起點前</option>
                    <option value="end">接在終點後</option>
                    ${pairs.map(p => `<option value="${p.idx}">插在 ${esc(p.text)} 之間</option>`).join('')}
                </select></div>
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="btn sm" data-act="close-add">取消</button><button class="btn sm btn-primary" data-act="do-add">加入路線</button>
            </div></div>`;
    }

    // =====================================================
    // 多選
    // =====================================================

    multiView(ids) {
        const ss = ids.map(id => store.getStation(id)).filter(Boolean);
        const statusSet = new Set(ss.map(s => s.status || 'open'));
        const posSet = new Set(ss.map(s => s.labelPos || 'auto'));
        const kindSet = new Set(ss.map(s => s.kind || 'auto'));
        const opt = (obj, set) => `<option value="" ${set.size > 1 ? 'selected' : ''} disabled>${set.size > 1 ? '混合' : '—'}</option>` +
            Object.entries(obj).map(([k, t]) => `<option value="${k}" ${set.size === 1 && set.has(k) ? 'selected' : ''}>${t}</option>`).join('');
        const posObj = Object.fromEntries(LABEL_POSITIONS.map(d => [d, d === 'auto' ? '自動' : `${DIR_LABEL[d]} ${d}`]));
        const two = ss.length === 2;
        return `
        <div class="insp-head"><div><div class="eyebrow">多選・依點選順序</div><h2>已選取 ${ss.length} 個車站</h2>
            <div class="pills">${ss.slice(0, 12).map((s, i) => `<span class="pill"><b>${i + 1}</b>${esc(s.name)}</span>`).join('')}${ss.length > 12 ? `<span class="pill">…</span>` : ''}</div></div></div>
        <div class="insp-sec"><h3>建立關係</h3><div class="action-list">
            <button class="action" data-act="merge"><span class="grow">合併為共站</span><kbd>M</kbd></button>
            <p class="hint" style="margin:0 2px">合併後保留第 1 個點選的站名與位置,所屬路線全部接到同一站。</p>
            <button class="action" data-act="corr-in"><span class="grow">建立站內連通${two ? '' : '(依序兩兩相連)'}</span></button>
            <button class="action" data-act="corr-out"><span class="grow">建立站外轉乘${two ? '' : '(依序兩兩相連)'}</span></button>
            <button class="action" data-act="chain"><span class="grow">依點選順序串成新路線</span></button>
        </div></div>
        <div class="insp-sec"><h3>排列</h3>
            <div class="icon-row">
                <button data-align="h" title="水平對齊(對齊第 1 站)">⟷</button>
                <button data-align="v" title="垂直對齊(對齊第 1 站)">↕</button>
                <button data-align="d" title="45° 對齊(通過第 1 站)">⤢</button>
                <button data-align="dist" title="等距分布" ${ss.length < 3 ? 'disabled' : ''}>⋯</button>
            </div>
            <p class="hint">等距分布需選取 3 站以上,保留頭尾位置。</p>
        </div>
        <div class="insp-sec"><h3>批次設定</h3>
            <div class="field"><label>營運狀態</label><select class="sel" data-batch="status">${opt(STATUSES, statusSet)}</select></div>
            <div class="field"><label>車站類型</label><select class="sel" data-batch="kind">${opt(STATION_KINDS, kindSet)}</select></div>
            <div class="field"><label>站名位置</label><select class="sel" data-batch="labelPos">${opt(posObj, posSet)}</select></div>
        </div>
        <div class="insp-sec"><button class="btn btn-danger block" data-act="delete-station">刪除 ${ss.length} 個車站</button></div>`;
    }

    // =====================================================
    // 連通道
    // =====================================================

    corridorView(c) {
        if (!c) return null;
        const a = store.getStation(c.fromId), b = store.getStation(c.toId);
        return `
        <div class="insp-head"><div><div class="eyebrow">連通道</div><h2>${esc(a?.name)} ⇄ ${esc(b?.name)}</h2></div></div>
        <div class="insp-sec"><h3>類型</h3>${chips('c2', CORRIDOR_TYPES, c.type, 'ctype')}
            <p class="hint">站內連通=付費區內步行轉乘(單虛線);站外轉乘=需出站步行(雙線)。</p></div>
        <div class="insp-sec"><div class="action-list">
            <button class="action" data-goto-station="${a?.id}"><span class="grow">選取 ${esc(a?.name)}</span></button>
            <button class="action" data-goto-station="${b?.id}"><span class="grow">選取 ${esc(b?.name)}</span></button>
            <button class="action btn-danger" data-act="delete-corridor"><span class="grow">刪除連通道</span><kbd>Del</kbd></button>
        </div></div>`;
    }

    // =====================================================
    // 事件
    // =====================================================

    selId() { return store.getSelection().ids[0]; }

    onInput(e) {
        const t = e.target;
        const d = t.dataset;
        if (d.f) store.updateStation(this.selId(), { [d.f]: t.value });
        else if (d.lf === 'color') { if (/^#[0-9a-f]{6}$/i.test(t.value)) store.updateLine(this.selId(), { color: t.value }); }
        else if (d.lf) store.updateLine(this.selId(), { [d.lf]: t.value });
        else if (d.lfColor !== undefined) store.updateLine(this.selId(), { color: t.value });
        else if (d.num) store.setStationNumber(this.selId(), d.num, t.value.trim());
        else if (d.set) store.updateSettings({ [d.set]: t.value });
        else if (d.setNum) {
            store.updateSettings({ [d.setNum]: parseFloat(t.value) });
            const out = t.parentElement.querySelector('output');
            if (out) out.textContent = d.setNum === 'basemapOpacity' ? `${Math.round(t.value * 100)}%` : `${t.value}px`;
        }
        else if (d.setColor) store.updateSettings({ [d.setColor]: t.value });
    }

    onChange(e) {
        const t = e.target;
        const d = t.dataset;
        if (d.lfSel) store.updateLine(this.selId(), { [d.lfSel]: t.value });
        else if (d.lbool) store.updateLine(this.selId(), { [d.lbool]: t.checked });
        else if (d.lboolInv) store.updateLine(this.selId(), { [d.lboolInv]: !t.checked });
        else if (d.setBool) store.updateSettings({ [d.setBool]: t.checked });
        else if (d.batch) store.updateStations(store.selectedStationIds(), { [d.batch]: t.value });
        else if (d.addLine !== undefined) { this.addLineId = t.value; this.render(true); }
        else return;
        if (!t.matches('input[type=range], input[type=color]')) t.blur();
    }

    onClick(e) {
        const t = e.target.closest('button, [data-goto-station], [data-goto-corridor]');
        if (!t || t.disabled) return;
        const d = t.dataset;
        const id = this.selId();

        if (d.kind) store.updateStation(id, { kind: d.kind });
        else if (d.sstatus) store.updateStation(id, { status: d.sstatus });
        else if (d.labelpos) store.updateStation(id, { labelPos: d.labelpos });
        else if (d.rmLine) { store.removeStationFromLine(id, d.rmLine); toast('已自路線移除', { undo: true }); }
        else if (d.extendFrom) this.editor.extendFrom(d.extendFrom, id);
        else if (d.flipCorr) { const c = store.getCorridor(d.flipCorr); store.updateCorridor(c.id, { type: c.type === 'in-station' ? 'out-station' : 'in-station' }); }
        else if (d.rmCorr) { store.deleteCorridor(d.rmCorr); toast('已刪除連通道', { undo: true }); }
        else if (d.gotoStation) this.gotoStation(d.gotoStation);
        else if (d.gotoCorridor) store.select('corridor', [d.gotoCorridor]);
        else if (d.lcolor) store.updateLine(id, { color: d.lcolor });
        else if (d.lrouting) store.updateLine(id, { routing: d.lrouting });
        else if (d.lstatus) store.updateLine(id, { status: d.lstatus });
        else if (d.lwidth) store.updateLine(id, { widthScale: d.lwidth });
        else if (d.moveSt) { e.stopPropagation(); store.moveStationInLine(id, +d.moveSt, +d.delta); }
        else if (d.rmSt) { e.stopPropagation(); store.removeStationFromLine(d.rmSt, id); toast('已自本線移除車站', { undo: true }); }
        else if (d.rmNode) { e.stopPropagation(); store.removeNode(id, +d.rmNode); }
        else if (d.ctype) store.updateCorridor(id, { type: d.ctype });
        else if (d.setStationStyle) store.updateSettings({ stationStyle: d.setStationStyle });
        else if (d.align) this.align(d.align);
        else if (d.act) this.action(d.act);
    }

    gotoStation(sid) {
        const s = store.getStation(sid);
        if (!s) return;
        store.select('station', [sid]);
        if (!this.view.map.getBounds().pad(-0.1).contains([s.lat, s.lng])) this.view.map.panTo([s.lat, s.lng]);
    }

    action(act) {
        const sel = store.getSelection();
        const id = sel.ids[0];
        switch (act) {
            case 'reverse': store.reverseLine(id); break;
            case 'extend-start': this.editor.extendLine(id, 'start'); break;
            case 'extend-end': this.editor.extendLine(id, 'end'); break;
            case 'clear-turns': store.clearTurnings(id); toast('已清除轉折點', { undo: true }); break;
            case 'delete-line':
            case 'delete-station':
            case 'delete-corridor': this.editor.deleteSelection(); break;
            case 'open-add': this.addBoxOpen = true; this.render(true); break;
            case 'close-add': this.addBoxOpen = false; this.render(true); break;
            case 'do-add': {
                const lineId = this.el.querySelector('[data-add-line]').value;
                const posV = this.el.querySelector('[data-add-pos]').value;
                const pos = /^\d+$/.test(posV) ? parseInt(posV, 10) : posV;
                store.addStationToLine(id, lineId, pos, this.project);
                this.addBoxOpen = false;
                this.render(true);
                break;
            }
            case 'split': {
                const created = store.splitStation(id, (s, k) => {
                    const p = this.project(s.lat, s.lng);
                    const ll = this.view.toLatLng({ x: p.x + 18 * k, y: p.y + 18 * k });
                    return { lat: ll.lat, lng: ll.lng };
                });
                if (created.length) toast(`已拆出 ${created.length} 個獨立站`, { undo: true });
                break;
            }
            case 'merge': this.merge(); break;
            case 'corr-in':
            case 'corr-out': {
                const ids = sel.ids;
                const type = act === 'corr-in' ? 'in-station' : 'out-station';
                for (let i = 0; i < ids.length - 1; i++) store.addCorridor(ids[i], ids[i + 1], type);
                const n = store.getStation(ids[0])?.name, m = store.getStation(ids[1])?.name;
                toast(`已建立${type === 'in-station' ? '站內連通' : '站外轉乘'}:${n} ⇄ ${m}${ids.length > 2 ? ' …' : ''}`, { undo: true });
                break;
            }
            case 'chain': this.chain(); break;
            case 'open-signs': bus.emit('CMD', 'signs'); break;
            case 'station-icon': bus.emit('CMD', 'station-icon'); break;
        }
    }

    merge() {
        const ids = store.selectedStationIds();
        if (ids.length < 2) return;
        const name = store.getStation(ids[0]).name;
        store.mergeStations(ids, ids[0]);
        toast(`已合併為共站「${name}」`, { undo: true });
    }

    async chain() {
        const ids = store.selectedStationIds();
        if (ids.length < 2) return;
        const { promptNewLine } = await import('./modal.js');
        const data = await promptNewLine();
        if (!data) return;
        const line = store.chainNewLine(ids, data);
        store.select('line', [line.id]);
        toast(`已建立「${line.name}」(${ids.length} 站)`, { undo: true });
    }

    align(mode) {
        const ids = store.selectedStationIds();
        if (ids.length < 2) return;
        const pts = ids.map(id => ({ id, p: this.view.model.stationPts.get(id) })).filter(x => x.p);
        const a = pts[0].p;
        let out;
        if (mode === 'h') out = pts.map(x => ({ id: x.id, x: x.p.x, y: a.y }));
        else if (mode === 'v') out = pts.map(x => ({ id: x.id, x: a.x, y: x.p.y }));
        else if (mode === 'd') {
            const last = pts[pts.length - 1].p;
            const sgn = Math.sign((last.x - a.x) * (last.y - a.y)) || 1;
            const u = { x: Math.SQRT1_2, y: sgn * Math.SQRT1_2 };
            out = pts.map(x => {
                const t = (x.p.x - a.x) * u.x + (x.p.y - a.y) * u.y;
                return { id: x.id, x: a.x + u.x * t, y: a.y + u.y * t };
            });
        } else {
            // 等距分布:依在「最遠兩站」連線上的投影排序,頭尾不動
            let i0 = 0, i1 = 1, best = -1;
            pts.forEach((p, i) => pts.forEach((q, j) => {
                const d = Math.hypot(p.p.x - q.p.x, p.p.y - q.p.y);
                if (d > best) { best = d; i0 = i; i1 = j; }
            }));
            const A = pts[i0].p, B = pts[i1].p;
            const v = { x: B.x - A.x, y: B.y - A.y };
            const L2 = v.x * v.x + v.y * v.y || 1;
            const sorted = [...pts].sort((p, q) => ((p.p.x - A.x) * v.x + (p.p.y - A.y) * v.y) - ((q.p.x - A.x) * v.x + (q.p.y - A.y) * v.y));
            out = sorted.map((x, i) => {
                const t = i / (sorted.length - 1);
                return { id: x.id, x: A.x + v.x * t, y: A.y + v.y * t };
            });
            void L2;
        }
        store.moveItems(out.map(o => { const ll = this.view.toLatLng(o); return { id: o.id, lat: ll.lat, lng: ll.lng }; }));
        toast('已排列', { undo: true });
    }
}
