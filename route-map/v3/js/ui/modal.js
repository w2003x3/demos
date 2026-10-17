/**
 * modal.js
 * 通用對話框與「新增路線」對話框。
 */
import { store } from '../core/store.js';
import { COLOR_PRESETS, LINE_TYPES, ROUTE_MODES } from '../core/constants.js';
import { esc } from '../render/svg-renderer.js';

/**
 * openModal({ title, body(html), size, foot(html), onMount(el, close) })
 * 回傳 Promise,resolve(close 傳入的值;按 × / Esc / 點背景 → null)
 */
export function openModal({ title, body, size = '', foot = '', onMount }) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal ${size}" role="dialog" aria-label="${esc(title)}">
                <div class="modal-head"><h3>${esc(title)}</h3>
                    <button class="icon-btn" data-close title="關閉 (Esc)">
                        <svg width="16" height="16" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    </button>
                </div>
                ${body}
                ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
            </div>`;
        document.getElementById('modal-host').appendChild(overlay);
        const modal = overlay.firstElementChild;
        let done = false;
        const close = (value = null) => {
            if (done) return;
            done = true;
            overlay.remove();
            document.removeEventListener('keydown', onKey, true);
            resolve(value);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
        };
        document.addEventListener('keydown', onKey, true);
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
        modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => close(null)));
        if (onMount) onMount(modal, close);
        const first = modal.querySelector('input[type=text], input:not([type])');
        if (first) { first.focus(); first.select(); }
    });
}

/** 新增路線對話框 → { name, code, color, type, routing } | null */
export function promptNewLine() {
    const used = new Set(store.getLines().map(l => l.color.toUpperCase()));
    const color = (COLOR_PRESETS.find(p => !used.has(p.color.toUpperCase())) || COLOR_PRESETS[0]).color;
    const name = store.getNextLineName();
    const code = name.replace(/線$/, '');
    const opt = (obj, v) => Object.entries(obj).map(([k, t]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${t}</option>`).join('');

    return openModal({
        title: '新增路線',
        body: `<div class="modal-body">
            <div class="field-row">
                <div class="field" style="flex:2"><label>路線名稱</label><input class="inp" id="nl-name" value="${esc(name)}"></div>
                <div class="field"><label>代碼</label><input class="inp mono" id="nl-code" value="${esc(code)}" placeholder="BL"></div>
            </div>
            <div class="field"><label>代表色</label>
                <div class="swatches" id="nl-swatches">
                    ${COLOR_PRESETS.map(p => `<button class="swatch ${p.color === color ? 'on' : ''}" data-color="${p.color}" title="${esc(p.hint)}" style="background:${p.color}"></button>`).join('')}
                    <input type="color" class="color-inp" id="nl-color" value="${color}" title="自訂顏色">
                </div>
            </div>
            <div class="field-row">
                <div class="field"><label>類型</label><select class="sel" id="nl-type">${opt(LINE_TYPES, 'metro')}</select></div>
                <div class="field"><label>預設彎折</label><select class="sel" id="nl-routing">${opt(ROUTE_MODES, 'diag-first')}</select></div>
            </div>
            <p class="hint">建立後進入連連看:點空白處建站並連接,點既有車站即成為轉乘站。</p>
        </div>`,
        foot: `<span class="grow"></span><button class="btn" data-close>取消</button><button class="btn btn-primary" id="nl-ok">建立並開始繪製 <kbd>Enter</kbd></button>`,
        onMount: (m, close) => {
            const colorInp = m.querySelector('#nl-color');
            m.querySelector('#nl-swatches').addEventListener('click', (e) => {
                const b = e.target.closest('.swatch');
                if (!b) return;
                colorInp.value = b.dataset.color;
                m.querySelectorAll('.swatch').forEach(x => x.classList.toggle('on', x === b));
            });
            colorInp.addEventListener('input', () => m.querySelectorAll('.swatch').forEach(x => x.classList.remove('on')));
            const ok = () => {
                const nm = m.querySelector('#nl-name').value.trim();
                if (!nm) { m.querySelector('#nl-name').focus(); return; }
                close({
                    name: nm,
                    code: m.querySelector('#nl-code').value.trim(),
                    color: colorInp.value,
                    type: m.querySelector('#nl-type').value,
                    routing: m.querySelector('#nl-routing').value
                });
            };
            m.querySelector('#nl-ok').onclick = ok;
            m.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'SELECT') { e.preventDefault(); e.stopPropagation(); ok(); } });
        }
    });
}
