/**
 * app.js
 * 進入點:建立地圖、路網圖層、編輯器與各面板,並綁定頂列/工具欄/狀態列。
 */
import { MapCore } from './map/map-core.js';
import { NetworkLayer } from './map/network-layer.js';
import { store } from './core/store.js';
import { bus } from './core/event-bus.js';
import { history } from './core/history.js';
import { BASEMAPS } from './core/constants.js';
import { Editor, TOOL_NAMES, TOOL_KEYS } from './tools/editor.js';
import { Inspector } from './ui/inspector.js';
import { SideList } from './ui/sidelist.js';
import { openExportDialog } from './ui/export-dialog.js';
import { openHelp, openPresets } from './ui/dialogs.js';
import { toast } from './ui/toast.js';
import { esc } from './render/svg-renderer.js';

const mapCore = new MapCore('map');
const map = mapCore.getMap();
const view = new NetworkLayer(map);
const editor = new Editor({ map, view, mapCore });
const ctx = { map, view, editor, mapCore };
new Inspector(ctx);
new SideList(ctx);

// 還原上次自動儲存(需在各面板建立後)
history.init();
if (store.getStations().length) mapCore.fitNetwork();

window.v2 = { store, bus, map, view, editor, history };

// ========================
// 頂列
// ========================
const undoBtn = document.getElementById('btn-undo');
const redoBtn = document.getElementById('btn-redo');
undoBtn.onclick = () => history.undo();
redoBtn.onclick = () => history.redo();
const saveStatus = document.getElementById('save-status');
bus.on('HISTORY_CHANGED', ({ canUndo, canRedo }) => {
    undoBtn.disabled = !canUndo;
    redoBtn.disabled = !canRedo;
    const t = new Date();
    saveStatus.textContent = `已自動儲存・${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
});

const nameInput = document.getElementById('project-name');
const syncName = () => { if (document.activeElement !== nameInput) nameInput.value = store.state.settings.projectName || '未命名路網'; };
nameInput.addEventListener('change', () => store.updateSettings({ projectName: nameInput.value.trim() || '未命名路網' }));
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });
bus.on('STATE_LOADED', syncName);
bus.on('SETTINGS_CHANGED', syncName);
syncName();

// 下拉選單
document.querySelectorAll('.dropdown').forEach(dd => {
    dd.querySelector('[data-dd-toggle]').addEventListener('click', (e) => {
        e.stopPropagation();
        const open = dd.classList.contains('open');
        document.querySelectorAll('.dropdown.open').forEach(x => x.classList.remove('open'));
        if (!open) dd.classList.add('open');
    });
});
document.addEventListener('click', () => document.querySelectorAll('.dropdown.open').forEach(x => x.classList.remove('open')));

// 底圖
const basemapMenu = document.getElementById('basemap-menu');
const renderBasemapMenu = () => {
    const cur = store.state.settings.basemap;
    const groups = [
        ['國土測繪中心(官方)', ['nlsc-emap', 'nlsc-emap8']],
        ['OpenStreetMap', ['osm', 'osm-hot', 'opentopo']],
        ['', ['none']]
    ];
    basemapMenu.innerHTML = groups.map(([g, keys]) =>
        (g ? `<div class="dd-group">${g}</div>` : '<div class="dd-sep"></div>') +
        keys.map(k => `<button data-bm="${k}" class="${k === cur ? 'checked' : ''}">${esc(BASEMAPS[k].name)}${k === cur ? '<span>✓</span>' : ''}</button>`).join('')).join('');
    document.getElementById('basemap-label').textContent = `底圖:${BASEMAPS[cur]?.name.replace('國土測繪中心 ', '') || '—'}`;
};
basemapMenu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bm]');
    if (b) store.updateSettings({ basemap: b.dataset.bm });
});
bus.on('SETTINGS_CHANGED', renderBasemapMenu);
renderBasemapMenu();

// 檔案
document.querySelector('#dd-file .dd-menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (b) bus.emit('CMD', b.dataset.action);
});
document.getElementById('btn-export').onclick = () => bus.emit('CMD', 'export');
document.getElementById('btn-signs').onclick = () => bus.emit('CMD', 'signs');
document.getElementById('btn-drive').onclick = () => bus.emit('CMD', 'drive');

bus.on('CMD', async (cmd) => {
    switch (cmd) {
        case 'save': {
            const blob = new Blob([store.exportJSON()], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${(store.state.settings.projectName || 'metro-project').replace(/[\\/:*?"<>|]/g, '_')}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            toast('已下載專案 JSON');
            break;
        }
        case 'open': {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.onchange = () => {
                const file = input.files[0];
                if (!file) return;
                file.text().then(text => {
                    try {
                        store.importJSON(text);
                        mapCore.fitNetwork();
                        toast(`已讀取「${file.name}」`, { undo: true });
                    } catch (err) {
                        toast(`讀取失敗:${err.message}`, { warn: true });
                    }
                });
            };
            input.click();
            break;
        }
        case 'new':
            editor.setTool('select');
            store.newProject();
            toast('已開新專案', { undo: true });
            break;
        case 'presets': openPresets(ctx); break;
        case 'export': editor.setTool('select'); openExportDialog(ctx); break;
        case 'help': openHelp(); break;
        case 'fit': mapCore.fitNetwork(); break;
        case 'merge': {
            const ids = store.selectedStationIds();
            if (ids.length > 1) {
                const name = store.getStation(ids[0]).name;
                store.mergeStations(ids, ids[0]);
                toast(`已合併為共站「${name}」`, { undo: true });
            }
            break;
        }
        case 'signs': {
            const { openSignDesigner } = await import('./ui/sign-designer.js');
            editor.setTool('select');
            openSignDesigner();
            break;
        }
        case 'station-icon': {
            const { openSignDesigner } = await import('./ui/sign-designer.js');
            openSignDesigner({ tab: 'icon', stationId: store.selectedStationIds()[0] });
            break;
        }
        case 'drive': {
            const { openDriveSetup } = await import('./drive/driver.js');
            editor.setTool('select');
            openDriveSetup(ctx);
            break;
        }
        case 'simulate': {
            const { startSimulation } = await import('./sim/simulator.js');
            editor.setTool('select');
            store.clearSelection();
            startSimulation(ctx);
            break;
        }
    }
});

// ========================
// 工具欄
// ========================
document.getElementById('toolrail').addEventListener('click', (e) => {
    const b = e.target.closest('.tool');
    if (!b) return;
    if (b.dataset.tool) editor.setTool(b.dataset.tool);
    else if (b.dataset.cmd) bus.emit('CMD', b.dataset.cmd);
});

// ========================
// 狀態列
// ========================
const stTool = document.getElementById('st-tool');
const stSel = document.getElementById('st-selection');
const stHint = document.getElementById('st-hint');
const stCoords = document.getElementById('st-coords');
const stZoom = document.getElementById('st-zoom');

bus.on('TOOL_CHANGED', (name) => { stTool.innerHTML = `${TOOL_NAMES[name]} <kbd>${TOOL_KEYS[name]}</kbd>`; });
bus.on('STATUS_HINT', (html) => { stHint.innerHTML = html; });

const renderSel = () => {
    const sel = store.getSelection();
    if (sel.type === 'station') {
        stSel.textContent = sel.ids.length === 1 ? `已選取:${store.getStation(sel.ids[0])?.name}` : `已選取 ${sel.ids.length} 個車站`;
    } else if (sel.type === 'line') {
        const l = store.getLine(sel.ids[0]);
        const n = l.nodes.filter(x => x.type === 'station').length, t = l.nodes.length - n;
        stSel.textContent = `已選取:路線 ${l.code || l.name}・${n} 站・${t} 個轉折點`;
    } else if (sel.type === 'corridor') {
        stSel.textContent = '已選取:連通道';
    } else {
        stSel.textContent = `${store.getLines().length} 條路線・${store.getStations().length} 站`;
    }
};
['SELECTION_CHANGED', 'STATE_CHANGED', 'STATE_LOADED'].forEach(ev => bus.on(ev, renderSel));
renderSel();

map.on('mousemove', (e) => { stCoords.textContent = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`; });
const renderZoom = () => { stZoom.textContent = `Z${map.getZoom().toFixed(map.getZoom() % 1 ? 2 : 0)}`; };
map.on('zoomend', renderZoom);
renderZoom();
stTool.innerHTML = `${TOOL_NAMES[editor.tool]} <kbd>${TOOL_KEYS[editor.tool]}</kbd>`;
stHint.innerHTML = editor.statusHint();

console.log('路網連連看 v3 ready');
