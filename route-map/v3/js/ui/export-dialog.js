/**
 * export-dialog.js
 * 匯出圖片對話框:左側即時預覽、右側設定。自訂框選時暫時關閉對話框讓使用者在地圖上拖曳範圍。
 */
import { store } from '../core/store.js';
import { BASEMAPS } from '../core/constants.js';
import { composeExport, downloadBlob } from '../export/exporter.js';
import { openModal } from './modal.js';
import { esc } from '../render/svg-renderer.js';
import { toast } from './toast.js';

let last = null;

const thumbUrl = (bm) => bm.url
    ? bm.url.replace('{s}', (bm.subdomains || 'abc')[0]).replace('{z}', 12).replace('{x}', 3430).replace('{y}', 1753).replace('{r}', '')
    : null;

export async function openExportDialog(ctx) {
    const s = store.state.settings;
    const opts = last ? { ...last } : {
        area: 'network', padding: 40, scale: 2, format: 'png',
        background: s.basemap, bgColor: s.bgColor,
        legend: true, legendPos: 'br', numbers: s.showNumbers, scalebar: false
    };
    opts.title = s.title || '';
    opts.subtitle = s.subtitle || '';
    opts.bgColor = s.bgColor;
    if (opts.gray === undefined) opts.gray = s.basemapGray;
    if (opts.opacity === undefined) opts.opacity = s.basemapOpacity;
    if (!BASEMAPS[opts.background] && opts.background !== 'transparent') opts.background = s.basemap;

    while (true) {
        const res = await showDialog(ctx, opts);
        if (res === 'pick') {
            const b = await pickArea(ctx.map);
            if (b) { opts.area = 'custom'; opts.bounds = b; }
            continue;
        }
        break;
    }
    last = { ...opts };
    store.updateSettings({ title: opts.title, subtitle: opts.subtitle });
}

function showDialog(ctx, opts) {
    const cards = ['osm', 'osm-hot', 'nlsc-emap', 'nlsc-emap8', 'opentopo', 'none', 'transparent'];
    const cardHtml = (k) => {
        const bm = BASEMAPS[k];
        const name = k === 'none' ? '純色' : k === 'transparent' ? '透明' : ({ osm: 'OSM 標準', 'osm-hot': 'OSM HOT', 'nlsc-emap': '國土通用', 'nlsc-emap8': '國土英文', opentopo: '地形' }[k] || bm.name);
        const thumb = k === 'none' ? `background:${opts.bgColor}`
            : k === 'transparent' ? 'background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/12px 12px'
                : `background-image:url('${thumbUrl(bm)}')`;
        return `<div class="bm-card" data-bg="${k}" title="${esc(bm ? bm.name : name)}"><div class="bm-thumb" style="${thumb}"></div>${esc(name)}</div>`;
    };

    return openModal({
        title: '匯出圖片',
        size: 'wide',
        body: `<div class="export-grid">
            <div class="export-preview"><div class="pv-busy">產生預覽中…</div><img alt="預覽" hidden><div class="pv-info"></div></div>
            <div class="export-side">
                <h4>範圍</h4>
                <div class="chips c3">
                    <button class="chip" data-area="view">目前視窗</button>
                    <button class="chip" data-area="network">全部路網</button>
                    <button class="chip" data-area="custom">自訂框選</button>
                </div>
                <div class="field-row" style="align-items:center;margin-top:8px" data-when="network">
                    <span class="hint" style="margin:0;flex:1">自動適配所有車站,四周留白</span>
                    <input class="inp mono sm" style="width:64px" type="number" min="0" max="400" data-o="padding" value="${opts.padding}"> px
                </div>
                <div style="margin-top:8px" data-when="custom"><button class="btn sm" data-pick>重新框選範圍</button></div>

                <h4>底圖</h4>
                <div class="bm-cards">${cards.map(cardHtml).join('')}</div>
                <div class="field-row" style="align-items:center;margin-top:8px;gap:10px">
                    <label style="display:flex;align-items:center;gap:4px;white-space:nowrap"><input type="checkbox" data-b="gray" ${opts.gray ? 'checked' : ''}>灰階</label>
                    <div class="range-row" style="flex:1"><input type="range" min="0.1" max="1" step="0.05" data-o-num="opacity" value="${opts.opacity}"><output>${Math.round(opts.opacity * 100)}%</output></div>
                </div>
                <div class="field-row" style="align-items:center;margin-top:8px">
                    <span class="hint" style="margin:0;flex:1">背景色(純色或底圖下方)</span>
                    <input type="color" class="color-inp" data-o="bgColor" value="${opts.bgColor}">
                </div>
                <p class="hint">有底圖時自動加上著作權標示;透明僅限 PNG。</p>

                <h4>解析度與格式</h4>
                <div class="chips c4">${[1, 2, 3, 4].map(n => `<button class="chip" data-scale="${n}">${n}×</button>`).join('')}</div>
                <div class="chips c2" style="margin-top:6px"><button class="chip" data-format="png">PNG</button><button class="chip" data-format="svg">SVG(不含底圖)</button></div>

                <h4>圖面元素</h4>
                <div class="field"><label>標題</label><input class="inp" data-o="title" value="${esc(opts.title)}" placeholder="例:台北捷運路網"></div>
                <div class="field"><label>副標題</label><input class="inp" data-o="subtitle" value="${esc(opts.subtitle)}" placeholder="例:草稿・2026 年 9 月"></div>
                <div class="toggle-row"><span>圖例</span><span style="display:flex;gap:8px;align-items:center">
                    <select class="sel" style="height:28px;width:90px" data-o="legendPos">
                        ${[['br', '右下'], ['bl', '左下'], ['tr', '右上'], ['tl', '左上']].map(([k, t]) => `<option value="${k}" ${opts.legendPos === k ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                    <label class="switch"><input type="checkbox" data-b="legend" ${opts.legend ? 'checked' : ''}><span></span></label></span></div>
                <div class="toggle-row"><span>站號</span><label class="switch"><input type="checkbox" data-b="numbers" ${opts.numbers ? 'checked' : ''}><span></span></label></div>
                <div class="toggle-row"><span>比例尺</span><label class="switch"><input type="checkbox" data-b="scalebar" ${opts.scalebar ? 'checked' : ''}><span></span></label></div>
            </div></div>`,
        foot: `<span class="grow hint" id="ex-warn" style="margin:0"></span><button class="btn" data-close>取消</button><button class="btn btn-primary" id="ex-go">下載 PNG</button>`,
        onMount: (m, close) => {
            const img = m.querySelector('.export-preview img');
            const busy = m.querySelector('.pv-busy');
            const info = m.querySelector('.pv-info');
            const warn = m.querySelector('#ex-warn');
            let timer = null, seq = 0, url = null;

            const sync = () => {
                m.querySelectorAll('[data-area]').forEach(b => b.classList.toggle('on', b.dataset.area === opts.area));
                m.querySelectorAll('[data-bg]').forEach(b => {
                    b.classList.toggle('on', b.dataset.bg === opts.background);
                    const svgOk = b.dataset.bg === 'none' || b.dataset.bg === 'transparent';
                    b.style.opacity = opts.format === 'svg' && !svgOk ? 0.45 : 1;
                });
                m.querySelectorAll('[data-scale]').forEach(b => b.classList.toggle('on', +b.dataset.scale === opts.scale));
                m.querySelectorAll('[data-format]').forEach(b => b.classList.toggle('on', b.dataset.format === opts.format));
                m.querySelectorAll('[data-when]').forEach(el => { el.hidden = el.dataset.when !== opts.area; });
                m.querySelector('#ex-go').textContent = `下載 ${opts.format.toUpperCase()}`;
            };

            const preview = () => {
                clearTimeout(timer);
                timer = setTimeout(async () => {
                    const my = ++seq;
                    busy.hidden = false; busy.textContent = '產生預覽中…';
                    try {
                        const r = await composeExport({ ...opts, map: ctx.map, scale: 1, format: 'png', background: opts.format === 'svg' ? (opts.background === 'transparent' ? 'transparent' : 'none') : opts.background });
                        if (my !== seq) return;
                        if (url) URL.revokeObjectURL(url);
                        url = URL.createObjectURL(r.blob);
                        img.src = url; img.hidden = false; busy.hidden = true;
                        info.textContent = `預覽・實際輸出約 ${Math.round(r.width * opts.scale)} × ${Math.round(r.height * opts.scale)} px`;
                        warn.textContent = r.warnings.join(';');
                    } catch (e) {
                        if (my !== seq) return;
                        img.hidden = true; busy.hidden = false; busy.textContent = e.message; info.textContent = '';
                    }
                }, 250);
            };

            m.addEventListener('click', (e) => {
                const t = e.target.closest('[data-area],[data-bg],[data-scale],[data-format],[data-pick]');
                if (!t) return;
                if (t.dataset.pick !== undefined || t.dataset.area === 'custom' && !opts.bounds) { close('pick'); return; }
                if (t.dataset.area) opts.area = t.dataset.area;
                if (t.dataset.bg) opts.background = t.dataset.bg;
                if (t.dataset.scale) opts.scale = +t.dataset.scale;
                if (t.dataset.format) opts.format = t.dataset.format;
                sync(); preview();
            });
            m.addEventListener('input', (e) => {
                const t = e.target;
                if (t.dataset.o) opts[t.dataset.o] = t.type === 'number' ? +t.value : t.value;
                if (t.dataset.oNum) { opts[t.dataset.oNum] = +t.value; t.nextElementSibling.textContent = Math.round(t.value * 100) + '%'; }
                if (t.dataset.o === 'bgColor') m.querySelector('[data-bg="none"] .bm-thumb').style.background = t.value;
                preview();
            });
            m.addEventListener('change', (e) => {
                const t = e.target;
                if (t.dataset.b) opts[t.dataset.b] = t.checked;
                if (t.dataset.o) opts[t.dataset.o] = t.type === 'number' ? +t.value : t.value;
                preview();
            });
            m.querySelector('#ex-go').onclick = async () => {
                const btn = m.querySelector('#ex-go');
                btn.disabled = true; btn.textContent = '輸出中…';
                try {
                    const r = await composeExport({ ...opts, map: ctx.map });
                    const name = (opts.title || store.state.settings.projectName || 'metro-map').replace(/[\\/:*?"<>|]/g, '_');
                    downloadBlob(r.blob, `${name}.${opts.format}`);
                    toast(`已輸出 ${r.width} × ${r.height} px${r.warnings.length ? '(' + r.warnings.join(';') + ')' : ''}`);
                    close('done');
                } catch (e) {
                    warn.textContent = e.message;
                    btn.disabled = false; sync();
                }
            };
            sync(); preview();
        }
    });
}

/** 在地圖上拖曳一個矩形,回傳 LatLngBounds(Esc 取消 → null) */
function pickArea(map) {
    return new Promise(resolve => {
        const host = map.getContainer().parentElement;
        const cover = document.createElement('div');
        cover.style.cssText = 'position:absolute;inset:0;z-index:2000;cursor:crosshair';
        const tip = document.createElement('div');
        tip.className = 'hud';
        tip.innerHTML = '<b>拖曳框選匯出範圍</b><span style="opacity:.7">Esc 取消</span>';
        const box = document.getElementById('box-select');
        host.append(cover, tip);
        let start = null;
        const rect = () => host.getBoundingClientRect();
        const done = (b) => {
            cover.remove(); tip.remove(); box.hidden = true;
            window.removeEventListener('keydown', onKey, true);
            resolve(b);
        };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
        window.addEventListener('keydown', onKey, true);
        cover.addEventListener('mousedown', (e) => {
            const r = rect();
            start = { x: e.clientX - r.left, y: e.clientY - r.top };
            box.hidden = false;
        });
        cover.addEventListener('mousemove', (e) => {
            if (!start) return;
            const r = rect();
            const x = e.clientX - r.left, y = e.clientY - r.top;
            Object.assign(box.style, { left: `${Math.min(x, start.x)}px`, top: `${Math.min(y, start.y)}px`, width: `${Math.abs(x - start.x)}px`, height: `${Math.abs(y - start.y)}px` });
        });
        cover.addEventListener('mouseup', (e) => {
            if (!start) return;
            const r = rect();
            const end = { x: e.clientX - r.left, y: e.clientY - r.top };
            if (Math.abs(end.x - start.x) < 20 || Math.abs(end.y - start.y) < 20) { start = null; box.hidden = true; return; }
            const a = map.containerPointToLatLng([start.x, start.y]);
            const b = map.containerPointToLatLng([end.x, end.y]);
            done(L.latLngBounds(a, b));
        });
    });
}
