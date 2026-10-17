/**
 * sign-designer.js
 * 指標設計(全螢幕):站名牌、月台方向指標、柱面站名、系統標誌、車站圖示。
 * 內容即時寫回 store.state.signs(隨專案存檔,可復原);駕駛模式的 3D 月台直接使用這裡的設計。
 */
import { store } from '../core/store.js';
import { bus } from '../core/event-bus.js';
import { history } from '../core/history.js';
import { SIGN_PRESETS, SIGN_STRIPES, BADGE_SHAPES, SIGN_FONTS } from '../core/constants.js';
import { esc } from '../render/svg-renderer.js';
import { renderSign, stationSignData, iconSvg, SAMPLE_SIGN_DATA } from '../signs/sign-render.js';
import { IconEditor } from '../signs/icon-editor.js';
import { downloadBlob, downloadSvgAsPng } from '../signs/sign-raster.js';
import { toast } from './toast.js';

const TABS = {
    board: '站名牌',
    direction: '月台方向指標',
    pillar: '柱面站名',
    logo: '系統標誌',
    icon: '車站圖示'
};
const ARROWS = { left: '←', right: '→', up: '↑' };

let dz = null; // 目前開啟的設計器

/** 依路線順序列出車站(未屬路線的放最後) */
function orderedStations() {
    const seen = new Set();
    const out = [];
    store.getLines().forEach(l => l.nodes.forEach(n => {
        if (n.type === 'station' && !seen.has(n.id)) { seen.add(n.id); out.push(store.getStation(n.id)); }
    }));
    store.getStations().forEach(s => { if (!seen.has(s.id)) out.push(s); });
    return out.filter(Boolean);
}

export function openSignDesigner(opts = {}) {
    if (dz) { dz.setTab(opts.tab || dz.tab); return; }
    dz = new SignDesigner(opts);
}

class SignDesigner {
    constructor({ tab = 'board', stationId = null }) {
        const st = orderedStations();
        this.tab = tab;
        this.stationId = stationId || store.selectedStationIds()[0] || st[0]?.id || null;
        this.lineId = null;
        this.forward = true;
        this.arrow = 'right';
        this.editor = null;

        this.el = document.createElement('div');
        this.el.className = 'sd-overlay';
        this.el.innerHTML = `
            <div class="sd-top">
                <div class="sd-title"><small>指標設計</small><b>${esc(store.state.settings.projectName || '未命名路網')}</b></div>
                <nav class="sd-tabs">${Object.entries(TABS).map(([k, t]) => `<button class="sd-tab" data-tab="${k}">${t}</button>`).join('')}</nav>
                <span class="grow"></span>
                <button class="btn" data-dl="svg">下載 SVG</button>
                <button class="btn" data-dl="png">下載 PNG</button>
                <button class="btn btn-primary" data-close>完成 <kbd>Esc</kbd></button>
            </div>
            <div class="sd-main">
                <section class="sd-stage" data-stage></section>
                <aside class="sd-props" data-props></aside>
            </div>`;
        document.body.appendChild(this.el);
        document.body.classList.add('sd-open');
        this.stage = this.el.querySelector('[data-stage]');
        this.props = this.el.querySelector('[data-props]');

        this.el.querySelector('.sd-tabs').addEventListener('click', (e) => {
            const b = e.target.closest('[data-tab]');
            if (b) this.setTab(b.dataset.tab);
        });
        this.el.querySelector('[data-close]').onclick = () => this.close();
        this.el.querySelectorAll('[data-dl]').forEach(b => { b.onclick = () => this.download(b.dataset.dl); });
        this.stage.addEventListener('change', (e) => this.onStageChange(e));
        this.stage.addEventListener('click', (e) => this.onStageClick(e));
        this.props.addEventListener('input', (e) => this.onPropInput(e));
        this.props.addEventListener('click', (e) => this.onPropClick(e));
        this.props.addEventListener('change', (e) => { if (e.target.matches('input[type=checkbox]')) this.onPropInput(e); });

        this.onKey = (e) => this.handleKey(e);
        window.addEventListener('keydown', this.onKey, true);
        this.onLoaded = () => this.render();
        bus.on('STATE_LOADED', this.onLoaded);
        this.render();
    }

    close() {
        window.removeEventListener('keydown', this.onKey, true);
        bus.off('STATE_LOADED', this.onLoaded);
        this.el.remove();
        document.body.classList.remove('sd-open');
        dz = null;
    }

    setTab(tab) {
        this.tab = tab;
        this.render();
    }

    get style() { return store.state.signs.style; }
    get isIconTab() { return this.tab === 'logo' || this.tab === 'icon'; }

    signData() {
        const s = this.stationId && store.getStation(this.stationId);
        if (!s) {
            const sg = store.state.signs;
            return { ...SAMPLE_SIGN_DATA, logo: sg.logo, systemName: sg.systemName };
        }
        if (this.lineId && !s.lines.includes(this.lineId)) this.lineId = null;
        return stationSignData(store.state, s.id, this.lineId || s.lines[0] || null, this.forward);
    }

    // ------------------------------------------------------------------
    // 畫面
    // ------------------------------------------------------------------

    render() {
        this.el.querySelectorAll('.sd-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab));
        if (this.isIconTab) this.renderIconTab();
        else {
            this.editor = null;
            this.renderStage();
            this.renderSignProps();
        }
    }

    stationPicker(withLine = true) {
        const st = orderedStations();
        if (!st.length) return '<span class="hint" style="margin:0">尚無車站,以範例資料預覽。</span>';
        const s = store.getStation(this.stationId);
        const lines = s ? s.lines.map(id => store.getLine(id)).filter(Boolean) : [];
        return `<label class="sd-pick">預覽車站
                <select class="sel" data-pick="station">${st.map(x => `<option value="${x.id}" ${x.id === this.stationId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
            ${withLine && lines.length ? `<label class="sd-pick">路線
                <select class="sel" data-pick="line">${lines.map(l => `<option value="${l.id}" ${l.id === (this.lineId || lines[0].id) ? 'selected' : ''}>${esc((l.code ? l.code + ' ' : '') + l.name)}</option>`).join('')}</select></label>
            <span class="seg-toggle"><button class="${this.forward ? 'on' : ''}" data-dir="1">順向</button><button class="${this.forward ? '' : 'on'}" data-dir="0">逆向</button></span>` : ''}`;
    }

    renderStage() {
        const d = this.signData();
        const kind = this.tab;
        const svg = renderSign(kind, this.style, d, { arrow: this.arrow });
        const s = store.getStation(this.stationId);
        const lineId = this.lineId || s?.lines[0];
        const line = lineId && store.getLine(lineId);
        // 同路線其他車站一覽
        let strip = '';
        if (line && kind !== 'direction') {
            let ids = line.nodes.filter(n => n.type === 'station').map(n => n.id);
            if (!this.forward) ids = ids.reverse();
            strip = ids.slice(0, 40).map(id => {
                const dd = stationSignData(store.state, id, line.id, this.forward);
                return `<button class="sd-thumb ${id === this.stationId ? 'on' : ''} ${kind}" data-thumb="${id}" title="${esc(dd.name)}">${renderSign(kind, this.style, dd)}</button>`;
            }).join('');
        }
        this.stage.innerHTML = `
            <div class="sd-bar">${this.stationPicker()}
                ${kind === 'direction' ? `<span class="sd-pick">箭頭<span class="seg-toggle">${Object.entries(ARROWS).map(([k, t]) => `<button class="${this.arrow === k ? 'on' : ''}" data-arrow="${k}">${t}</button>`).join('')}</span></span>` : ''}
            </div>
            <div class="sd-wall ${kind}"><div class="sd-sign ${kind}">${svg}</div></div>
            ${strip ? `<div class="sd-strip-title">${esc(line.name)}・全線預覽(點選切換)</div><div class="sd-strip ${kind}">${strip}</div>` : ''}`;
    }

    renderSignProps() {
        const s = this.style;
        const sg = store.state.signs;
        const chips = (cls, obj, cur, attr, label = v => v) => `<div class="chips ${cls}">${Object.entries(obj).map(([k, v]) =>
            `<button class="chip ${cur === k ? 'on' : ''}" data-${attr}="${k}">${label(v)}</button>`).join('')}</div>`;
        const color = (key, label) => `<div class="toggle-row"><span>${label}</span><input type="color" class="color-inp" data-scolor="${key}" value="${s[key]}"></div>`;
        const tog = (key, label) => `<div class="toggle-row"><span>${label}</span><label class="switch"><input type="checkbox" data-sbool="${key}" ${s[key] ? 'checked' : ''}><span></span></label></div>`;
        this.props.innerHTML = `
        <div class="insp-sec"><h3>系統名稱</h3>
            <div class="field"><label>中文(顯示於無標誌時)</label><input class="inp" data-sys="systemName" value="${esc(sg.systemName)}" placeholder="例:海港捷運"></div>
            <div class="field"><label>英文</label><input class="inp" data-sys="systemNameEn" value="${esc(sg.systemNameEn)}" placeholder="Harbor Metro"></div>
        </div>
        <div class="insp-sec"><h3>配色預設</h3>
            <div class="sd-presets">${Object.entries(SIGN_PRESETS).map(([k, p]) => `<button class="sd-preset ${s.preset === k ? 'on' : ''}" data-preset="${k}">
                <i style="background:${p.boardBg};border-color:${p.stripe === 'full' ? '#0070BD' : '#ddd'}"><b style="background:${p.stripe === 'full' ? '#0070BD' : p.boardText}"></b><u style="background:#0070BD"></u></i>
                <i style="background:${p.dirBg}"><b style="background:${p.dirText}"></b></i><span>${esc(p.name)}</span></button>`).join('')}</div>
        </div>
        <div class="insp-sec"><h3>版型</h3>
            <div class="field"><label>色帶</label>${chips('c3', SIGN_STRIPES, s.stripe, 'stripe')}</div>
            <div class="field"><label>站號徽章形狀</label>${chips('c5', BADGE_SHAPES, s.badgeShape, 'badge', v => v)}</div>
            <div class="field"><label>字體</label>${chips('c3', Object.fromEntries(Object.entries(SIGN_FONTS).map(([k, f]) => [k, f.name])), s.font, 'font')}</div>
        </div>
        <div class="insp-sec"><h3>顏色</h3>
            ${color('boardBg', '站名牌底色')}${color('boardText', '站名文字')}${color('subText', '副站名/英文')}
            ${color('dirBg', '方向指標底色')}${color('dirText', '方向指標文字')}
            <p class="hint">色帶與站號徽章使用各路線的代表色;「路線色滿版」以路線色作底。</p>
        </div>
        <div class="insp-sec"><h3>顯示內容</h3>
            ${tog('showNumber', '站號徽章')}${tog('showSub', '副站名(英文)')}${tog('showLogo', '系統標誌')}${tog('showIcon', '車站圖示(優先於系統標誌)')}${tog('showNeighbors', '前一站/下一站')}
        </div>
        <div class="insp-sec"><p class="hint" style="margin:0">這些指標會出現在<b>駕駛模式</b>的 3D 月台上:站名牌掛在月台牆面、柱面站名在月台柱、方向指標吊掛在月台上方。</p></div>`;
    }

    renderIconTab() {
        const isLogo = this.tab === 'logo';
        const sg = store.state.signs;
        const s = !isLogo && this.stationId && store.getStation(this.stationId);
        if (!isLogo && !s) {
            this.editor = null;
            this.stage.innerHTML = '<div class="sd-empty"><p>專案中還沒有車站。先回到地圖用連連看畫出車站,再為車站設計圖示。</p></div>';
            this.props.innerHTML = '';
            return;
        }
        const icon = isLogo ? sg.logo : sg.stationIcons[s.id];
        const editorKey = isLogo ? 'logo' : `st:${s.id}`;
        const lineColors = store.getLines().map(l => l.color);
        this.stage.innerHTML = `
            <div class="sd-bar">${isLogo ? '<span class="sd-pick"><b>系統標誌</b>・會出現在站名牌、柱面站名與駕駛模式月台</span>' : this.stationPicker(false)}
                ${!isLogo && icon ? '<button class="btn sm btn-danger" data-act="rm-icon">移除此站圖示</button>' : ''}</div>
            <div class="sd-icon-layout">
                <div class="sd-icon-editor" data-editor></div>
                <div class="sd-icon-preview" data-icon-preview></div>
            </div>`;
        const host = this.stage.querySelector('[data-editor]');
        this.editor = new IconEditor(host, {
            icon,
            font: SIGN_FONTS[this.style.font]?.css,
            extraColors: lineColors,
            onChange: (ic) => {
                if (isLogo) store.setLogo(ic); else store.setStationIcon(s.id, ic);
                this.renderIconPreview();
                const rm = this.stage.querySelector('[data-act="rm-icon"]');
                if (!isLogo && !rm && ic.shapes.length) this.renderIconTabBarOnly();
            }
        });
        this.editorKey = editorKey;
        this.editor.bindProps(this.props);
        this.renderIconPreview();
    }

    renderIconTabBarOnly() {
        const bar = this.stage.querySelector('.sd-bar');
        if (bar && !bar.querySelector('[data-act="rm-icon"]')) bar.insertAdjacentHTML('beforeend', '<button class="btn sm btn-danger" data-act="rm-icon">移除此站圖示</button>');
    }

    renderIconPreview() {
        const el = this.stage.querySelector('[data-icon-preview]');
        if (!el) return;
        const d = this.signData();
        const st = { ...this.style, showLogo: true, showIcon: true };
        el.innerHTML = `<div class="sd-strip-title">套用效果</div>
            <div class="sd-sign board sm">${renderSign('board', st, d)}</div>
            <div class="sd-mini-row"><div class="sd-sign pillar sm">${renderSign('pillar', st, d)}</div>
            <div class="sd-icon-sizes">${[96, 48, 24].map(z => `<div><div class="sd-icon-chip">${iconSvg(this.editor.getIcon(), z)}</div><small>${z}px</small></div>`).join('')}</div></div>
            ${this.tab === 'icon' ? '<p class="hint">站名牌上車站圖示優先於系統標誌;柱面站名則優先顯示系統標誌。</p>' : ''}`;
    }

    // ------------------------------------------------------------------
    // 事件
    // ------------------------------------------------------------------

    onStageChange(e) {
        const p = e.target.dataset.pick;
        if (p === 'station') { this.stationId = e.target.value; this.lineId = null; this.render(); }
        else if (p === 'line') { this.lineId = e.target.value; this.renderStage(); }
    }

    onStageClick(e) {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if (d.dir !== undefined) { this.forward = d.dir === '1'; this.renderStage(); }
        else if (d.arrow) { this.arrow = d.arrow; this.renderStage(); }
        else if (d.thumb) { this.stationId = d.thumb; this.renderStage(); }
        else if (d.act === 'rm-icon') { store.setStationIcon(this.stationId, null); toast('已移除車站圖示', { undo: true }); this.render(); }
    }

    onPropInput(e) {
        if (this.isIconTab) return;
        const t = e.target, d = t.dataset;
        if (d.sys) store.updateSigns({ [d.sys]: t.value });
        else if (d.scolor) store.updateSigns({ style: { [d.scolor]: t.value, preset: 'custom' } });
        else if (d.sbool) store.updateSigns({ style: { [d.sbool]: t.checked } });
        else return;
        this.renderStage();
        if (d.scolor) this.props.querySelectorAll('.sd-preset').forEach(x => x.classList.remove('on'));
    }

    onPropClick(e) {
        if (this.isIconTab) return;
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if (d.preset) { const { name, ...p } = SIGN_PRESETS[d.preset]; void name; store.updateSigns({ style: { ...p, preset: d.preset } }); }
        else if (d.stripe) store.updateSigns({ style: { stripe: d.stripe } });
        else if (d.badge) store.updateSigns({ style: { badgeShape: d.badge } });
        else if (d.font) store.updateSigns({ style: { font: d.font } });
        else return;
        this.renderStage();
        this.renderSignProps();
    }

    handleKey(e) {
        const typing = e.target.matches && e.target.matches('input, select, textarea');
        if (e.key === 'Escape') {
            if (typing) { e.target.blur(); }
            else if (!(this.editor && this.editor.draft && this.editor.handleKey(e))) this.close();
            e.preventDefault(); e.stopPropagation();
            return;
        }
        if (typing) { e.stopPropagation(); return; }
        if (this.editor && this.editor.handleKey(e)) { e.preventDefault(); e.stopPropagation(); return; }
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); }
        else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); history.redo(); }
        e.stopPropagation();
    }

    async download(fmt) {
        let svg, name;
        const base = store.state.settings.projectName || '路網';
        if (this.isIconTab) {
            const icon = this.editor?.getIcon();
            if (!icon || !icon.shapes.length) { toast('目前沒有圖形可下載', { warn: true }); return; }
            svg = iconSvg(icon, 512);
            name = this.tab === 'logo' ? `${base}-系統標誌` : `${store.getStation(this.stationId)?.name || ''}-車站圖示`;
        } else {
            const d = this.signData();
            svg = renderSign(this.tab, this.style, d, { arrow: this.arrow });
            name = `${d.name}-${TABS[this.tab]}`;
        }
        try {
            if (fmt === 'svg') downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);
            else await downloadSvgAsPng(svg, `${name}.png`, this.isIconTab ? 1 : 2);
            toast(`已下載 ${name}.${fmt}`);
        } catch (err) {
            toast(`下載失敗:${err.message}`, { warn: true });
        }
    }
}

