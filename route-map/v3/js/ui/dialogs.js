/**
 * dialogs.js
 * 快捷鍵說明、載入預設路網。
 */
import { store } from '../core/store.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { esc } from '../render/svg-renderer.js';

export function openHelp() {
    const rows = [
        ['左鍵點車站', '選取(Shift 加選)', '選取', '連接到路線', '設為起點/終點'],
        ['左鍵點空白', '取消選取', '建立車站', '建站並連接', '取消'],
        ['左鍵點路線', '選取+路段工具列', '在路段插入車站', '建站並連接', '—'],
        ['左鍵拖曳空白', '平移地圖', '平移地圖', '平移地圖', '平移地圖'],
        ['Shift + 拖曳', '框選', '—', '—', '—'],
        ['Alt + 點', '—', '—', '加入轉折點', '—'],
        ['右鍵', '情境選單', '情境選單', '退一步', '取消'],
        ['Enter / Esc', '— / 取消選取', '— / 回選取', '完成 / 取消', '— / 回選取']
    ];
    const keys = [
        ['V / S / L / C', '切換工具:選取/車站/路線/連通道(Shift+L 一律新增路線)'],
        ['F', '全部適配'], ['Space + 拖曳', '任何工具下平移'], ['Delete', '刪除選取'],
        ['M', '合併選取車站為共站'], ['F2 / Enter', '重新命名選取車站'], ['方向鍵', '微調選取車站 1px(Shift 10px)'],
        ['Alt + 拖曳', '拖曳時不吸附 45°'], ['Ctrl+Z / Ctrl+Y', '復原 / 重做'], ['Ctrl+S / Ctrl+O', '下載 / 讀取 JSON'],
        ['Ctrl+A', '選取全部車站']
    ];
    return openModal({
        title: '操作與快捷鍵',
        size: 'mid',
        body: `<div class="modal-body">
            <table class="help-table"><tr><th>操作</th><th>選取 V</th><th>車站 S</th><th>路線 L</th><th>連通道 C</th></tr>
            ${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>
            <h4 style="margin:18px 0 8px">彎折控制(選取路線時)</h4>
            <table class="help-table">
                <tr><td>■ 轉折點</td><td>拖曳移動;雙擊或右鍵刪除</td></tr>
                <tr><td>◇ 自動彎角</td><td>點擊切換 先斜↔先直、先橫↔先直;拖曳則固定為轉折點</td></tr>
                <tr><td>＋ 路段中點</td><td>拖曳即新增轉折點</td></tr>
                <tr><td>點擊路段</td><td>浮出工具列:6 種彎折、路段營運狀態、插入車站/轉折點、刪除轉折點</td></tr>
                <tr><td>拖曳站名</td><td>放開時吸附到最近的 8 方位</td></tr>
            </table>
            <h4 style="margin:18px 0 8px">快捷鍵</h4>
            <table class="help-table">${keys.map(([k, t]) => `<tr><td style="white-space:nowrap"><kbd>${esc(k)}</kbd></td><td>${esc(t)}</td></tr>`).join('')}</table>
        </div>`
    });
}

// ---------------------------------------------------------
// 預設路網
// ---------------------------------------------------------

async function fetchJSON(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
}

function thumbSVG(p) {
    // 以預設檔提供的縮圖折線(0..1 座標)畫出示意
    const paths = (p.thumb || []).map(t =>
        `<path d="M${t.pts.map(([x, y]) => `${(x * 180 + 10).toFixed(1)} ${(y * 76 + 10).toFixed(1)}`).join('L')}" fill="none" stroke="${t.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    return `<svg viewBox="0 0 200 96" width="100%" height="96" preserveAspectRatio="xMidYMid meet">${paths}</svg>`;
}

export async function openPresets(ctx) {
    let index = [];
    try {
        index = await fetchJSON('presets/index.json');
    } catch (e) {
        index = [];
    }
    let chosen = index.find(p => p.file)?.id || null;
    let mode = 'new';

    const card = (p) => `<div class="preset-card ${p.file ? '' : 'disabled'} ${p.id === chosen ? 'on' : ''}" data-id="${p.id}">
        <div class="pc-thumb">${thumbSVG(p)}</div>
        <div class="pc-title">${esc(p.title)}</div>
        <div class="pc-sub">${p.file ? `${p.lines} 條路線・${p.stations} 站` : '尚未產生資料'}${p.note ? `<br>${esc(p.note)}` : ''}</div></div>`;

    await openModal({
        title: '載入預設路網',
        size: 'mid',
        body: `<div class="modal-body">
            ${index.length ? `<div class="preset-grid">${index.map(card).join('')}</div>` : '<p class="empty">找不到預設路網資料(presets/index.json)。</p>'}
            <p class="hint">資料來源:交通部 TDX 運輸資料流通服務(官方車站座標與站序)。目前僅收錄已營運路線;規劃中/興建中路線待有官方站位資料後再加入。</p>
        </div>`,
        foot: `<span class="hint" style="margin:0">載入方式</span>
            <span class="chips c2" style="width:200px"><button class="chip on" data-mode="new">開新專案</button><button class="chip" data-mode="merge">合併到目前專案</button></span>
            <span class="grow hint" style="margin:0">合併時,同名且位置相近的車站會自動設為共站。</span>
            <button class="btn" data-close>取消</button><button class="btn btn-primary" id="pr-go">載入</button>`,
        onMount: (m, close) => {
            m.addEventListener('click', async (e) => {
                const c = e.target.closest('.preset-card');
                if (c && !c.classList.contains('disabled')) {
                    chosen = c.dataset.id;
                    m.querySelectorAll('.preset-card').forEach(x => x.classList.toggle('on', x === c));
                }
                const md = e.target.closest('[data-mode]');
                if (md) {
                    mode = md.dataset.mode;
                    m.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === md));
                }
            });
            m.querySelector('#pr-go').onclick = async () => {
                const p = index.find(x => x.id === chosen);
                if (!p || !p.file) return;
                const btn = m.querySelector('#pr-go');
                btn.disabled = true; btn.textContent = '載入中…';
                try {
                    const data = await fetchJSON(`presets/${p.file}`);
                    if (mode === 'new') {
                        store.importJSON(JSON.stringify({ ...data, settings: { ...store.state.settings, ...(data.settings || {}), projectName: p.title } }));
                    } else {
                        store.appendProject(data);
                    }
                    close(true);
                    setTimeout(() => ctx.mapCore.fitNetwork(), 50);
                    toast(`已載入「${p.title}」`, { undo: true });
                } catch (err) {
                    btn.disabled = false; btn.textContent = '載入';
                    toast(`載入失敗:${err.message}`, { warn: true });
                }
            };
        }
    });
}
