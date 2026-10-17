/**
 * app.js
 * Main entry point
 */
import { MapCore } from './map/map-core.js';
import { StationLayer } from './map/station-layer.js';
import { LineLayer } from './map/line-layer.js';
import { CorridorLayer } from './map/corridor-layer.js';
import { TurningLayer } from './map/turning-layer.js';
import { TerminalLabelLayer } from './map/terminal-label-layer.js';
import { RouteListPanel } from './ui/route-list-panel.js';
import { store } from './core/store.js';
import { bus } from './core/event-bus.js';
import { history } from './core/history.js';
import { ToolManager } from './tools/tool-manager.js';
import { StationTool } from './tools/station-tool.js';
import { SelectTool } from './tools/select-tool.js';
import { LineTool } from './tools/line-tool.js';
import { ContextMenu } from './ui/context-menu.js';
import { Modal } from './ui/modal.js';

// Initialize Map
const mapCore = new MapCore('map');
const map = mapCore.getMap();

// Context Menu
const contextMenu = new ContextMenu();

// Initialize Layers
const lineLayer = new LineLayer(map);
const corridorLayer = new CorridorLayer(map);
const turningLayer = new TurningLayer(map);
const stationLayer = new StationLayer(map);
const terminalLabelLayer = new TerminalLabelLayer(map);

// Initialize UI Panels
const routeListPanel = new RouteListPanel();

// Initialize Tools
const toolManager = new ToolManager();
toolManager.registerTool('select', new SelectTool());
toolManager.registerTool('station', new StationTool());
toolManager.registerTool('line', new LineTool());
toolManager.activateTool('select');

// 還原上次自動儲存的專案,並建立初始快照(需在圖層都建好後執行)
history.init();

// 測試用：在 Console 可以存取
window.v2 = { store, bus, map, toolManager, history };

// ========================
// ↶↷ 復原 / 重做
// ========================
const undoBtn = document.getElementById('btn-undo');
const redoBtn = document.getElementById('btn-redo');

undoBtn.addEventListener('click', () => history.undo());
redoBtn.addEventListener('click', () => history.redo());

bus.on('HISTORY_CHANGED', ({ canUndo, canRedo }) => {
    undoBtn.disabled = !canUndo;
    redoBtn.disabled = !canRedo;
});

window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    // 避免攔截 prompt/輸入框內的快捷鍵
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        history.undo();
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        history.redo();
    }
});

// ========================
// 車站左鍵選單
// ========================
bus.on('STATION_CLICK', (e) => {
    // 檢查是否剛剛拖曳了車站（功能6: wasDragged 現在在 ToolManager）
    if (toolManager.wasDragged) {
        return;
    }

    // 如果不在選取模式('select')，不應該觸發右鍵選單或切換焦點路線
    if (toolManager.activeTool && toolManager.activeTool !== toolManager.tools['select']) {
        return;
    }

    const station = store.getStations().find(s => s.id === e.id);
    if (!station) return;

    const ev = e.originalEvent.originalEvent;

    // ========================
    // 多重選取處理
    // ========================
    const selectedIds = store.getSelectedStations();
    
    // 如果按下 Shift，直接切換選取狀態，不彈出選單
    if (ev && ev.shiftKey) {
        store.toggleStationSelection(station.id);
        return;
    }

    // 如果沒有按下 Shift，且目前站不在已選清單中，清除其他並選取目前站
    if (!selectedIds.includes(station.id)) {
        store.setStationSelection([station.id]);
    }

    // 更新目前已選取的車站數量
    const currentSelected = store.getSelectedStations();

    if (ev && ev.stopPropagation) {
        ev.stopPropagation();
    }

    // ========================
    // 複數選取功能選單
    // ========================
    if (currentSelected.length > 1) {
        const items = [
            {
                label: `👥 將 ${currentSelected.length} 個選取車站改為共站`,
                action: () => {
                    const targetStation = store.getStations().find(s => s.id === station.id);
                    const newName = prompt('請輸入共站後的新名稱:', targetStation.name);
                    if (newName) {
                        store.renameStation(station.id, newName);
                        // 將其他選取車站合併到此車站
                        currentSelected.filter(id => id !== station.id).forEach(id => {
                            store.mergeStations(id, station.id);
                        });
                        store.clearStationSelection();
                    }
                }
            },
            {
                label: '🚶 建立站內連通道 (單虛線)',
                action: () => {
                    if (currentSelected.length === 2) {
                        store.addCorridor(currentSelected[0], currentSelected[1], 'in-station');
                        store.clearStationSelection();
                    } else {
                        alert('建立連通道功能限定一次選取 2 個車站！');
                    }
                }
            },
            {
                label: '🚶 建立站外轉乘連通道 (雙虛線)',
                action: () => {
                    if (currentSelected.length === 2) {
                        store.addCorridor(currentSelected[0], currentSelected[1], 'out-station');
                        store.clearStationSelection();
                    } else {
                        alert('建立連通道功能限定一次選取 2 個車站！');
                    }
                }
            }
        ];
        
        setTimeout(() => contextMenu.show(ev.clientX, ev.clientY, items), 10);
        return;
    }

    // ========================
    // 單一車站常規選單
    // ========================

    // 功能2 & 3: 點擊單一車站時，當前路線自動為車站所屬路線
    if (station.lines.length === 1) {
        store.setActiveLine(station.lines[0]);
        // 功能3: 檢查是否為端點站，以設定延伸方向
        const activeLine = store.getActiveLine();
        if (activeLine && activeLine.nodes.length > 0) {
            const firstNode = activeLine.nodes[0];
            const lastNode = activeLine.nodes[activeLine.nodes.length - 1];
            if (firstNode.id === station.id) {
                store.setExtensionDirection('start');
            } else {
                // 若為最後一站或中間站，皆預設為 end
                store.setExtensionDirection('end');
            }
        }
    } else {
        // 共站 (>1) 或尚未有所屬路線 (0)
        store.setActiveLine(null);
    }

    const manageLinesAction = async () => {
        const result = await Modal.promptStationLines(station);
        if (result.result && result.data) {
            store.updateStationLines(station.id, result.data.lineIds);
        }
    };

    const items = [
        {
            label: '📌 設為延伸端點 (設為當前路線)',
            action: () => {
                let lineId = station.lines[0];
                if (station.lines.length > 1) {
                    const lineNames = store.getLines()
                        .filter(l => station.lines.includes(l.id))
                        .map((l, i) => `${i + 1}: ${l.name}`)
                        .join('\\n');
                    const ans = prompt(`此車站為多線共構，請輸入要延伸的路線編號：\\n${lineNames}`, '1');
                    if (!ans) return;
                    const idx = parseInt(ans) - 1;
                    if (idx >= 0 && idx < station.lines.length) {
                        lineId = station.lines[idx];
                    } else {
                        alert('輸入無效');
                        return;
                    }
                }
                
                // 確認要延伸的路線後，設定當前路線與方向
                store.setActiveLine(lineId);
                const line = store.getLines().find(l => l.id === lineId);
                if (line && line.nodes.length > 0) {
                    const firstNode = line.nodes[0];
                    const lastNode = line.nodes[line.nodes.length - 1];
                    if (firstNode.id === station.id) {
                        store.setExtensionDirection('start');
                        alert('已將延伸方向設為：起點側');
                    } else if (lastNode.id === station.id) {
                        store.setExtensionDirection('end');
                        alert('已將延伸方向設為：終點側');
                    } else {
                        store.setExtensionDirection('end');
                        alert('此車站位於路線中間，延伸將預設加在終點側');
                    }
                }
                
                // 自動切換到新增車站模式方便接續作圖
                const stationBtn = document.getElementById('btn-station');
                if (stationBtn) stationBtn.click();
            }
        },
        {
            label: '📝 重新命名',
            action: () => {
                const name = prompt('請輸入新名稱:', station.name);
                if (name && name !== station.name) {
                    store.renameStation(station.id, name);
                }
            }
        },
        {
            label: '🗑️ 刪除車站',
            action: () => {
                if (confirm(`確定刪除「${station.name}」？`)) {
                    store.deleteStation(station.id);
                }
            }
        }
    ];

    // 功能1: 顯示所屬路線，且點選可編輯
    if (station.lines.length > 0) {
        const lines = store.getLines().filter(l => station.lines.includes(l.id));
        // Put the edit button at the second place
        items.splice(1, 0, {
            label: `🏷️ 所屬：${lines.map(l => l.name).join(', ')} (點擊修改)`,
            action: manageLinesAction
        });
    } else {
        items.splice(1, 0, {
            label: '📋 調整所屬路線',
            action: manageLinesAction
        });
    }

    setTimeout(() => {
        contextMenu.show(ev.clientX, ev.clientY, items);
    }, 10);
});

// ========================
// 路線左鍵選單
// ========================
bus.on('LINE_CLICK', (e) => {
    const line = store.getLines().find(l => l.id === e.id);
    if (!line) return;

    const ev = e.originalEvent.originalEvent;
    if (ev && ev.stopPropagation) {
        ev.stopPropagation();
    }
    const items = [
        {
            label: '📌 設為當前路線',
            action: () => {
                store.setActiveLine(line.id);
            }
        },
        {
            label: '📍 插入車站',
            action: () => {
                // 功能5: 預設名稱
                const defaultName = store.getNextStationName(e.id);
                const name = prompt('請輸入車站名稱:', defaultName);
                if (name) {
                    const station = store.addStation(e.latlng.lat, e.latlng.lng, name);
                    store.insertNodeInLine(e.id, e.segmentIndex, { type: 'station', id: station.id });
                }
            }
        },
        {
            label: '〰️ 插入轉折點',
            action: () => {
                store.insertNodeInLine(e.id, e.segmentIndex, {
                    type: 'turning',
                    lat: e.latlng.lat,
                    lng: e.latlng.lng
                });
            }
        },
        {
            label: '🔀 調整車站排序',
            action: async () => {
                const result = await Modal.promptLineStationOrder(line);
                if (result.result && result.data) {
                    store.reorderLineStations(line.id, result.data.orderedIds);
                }
            }
        },
        {
            label: '📝 重新命名路線',
            action: () => {
                const name = prompt('請輸入新路線名稱:', line.name);
                if (name && name !== line.name) {
                    store.updateLine(line.id, { name });
                    // 如果是當前路線，更新顯示
                    if (store.state.activeLineId === line.id) {
                        bus.emit('ACTIVE_LINE_CHANGED', line);
                    }
                }
            }
        },
        {
            label: '🔤 修改路線代碼',
            action: () => {
                const code = prompt('請輸入新路線代碼 (如 R、BL 等):', line.code || '');
                if (code !== null && code !== line.code) {
                    store.updateLine(line.id, { code });
                }
            }
        },
        {
            label: '🎨 變更顏色',
            action: () => {
                const input = document.createElement('input');
                input.type = 'color';
                input.value = line.color;
                input.style.position = 'absolute';
                input.style.opacity = '0';
                document.body.appendChild(input);
                input.addEventListener('input', () => {
                    store.updateLine(line.id, { color: input.value });
                });
                input.addEventListener('change', () => {
                    input.remove();
                });
                input.click();
            }
        },
        {
            label: '🗑️ 刪除路線',
            action: () => {
                if (confirm(`確定刪除路線「${line.name}」？`)) {
                    store.deleteLine(line.id);
                }
            }
        }
    ];

    setTimeout(() => {
        contextMenu.show(ev.clientX, ev.clientY, items);
    }, 10);
});

// ========================
// 工具列按鈕
// ========================
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        bus.emit('TOOL_CHANGED', btn.dataset.tool);
        document.getElementById('status-text').textContent = `模式: ${btn.dataset.tool}`;
    });
});

// ========================
// 功能7: 當前路線在狀態列顯示
// ========================
bus.on('ACTIVE_LINE_CHANGED', (line) => {
    const el = document.getElementById('active-line-text');
    if (el) {
        if (line) {
            el.innerHTML = `<span class="active-line-swatch" style="background:${line.color}"></span> 當前路線：${line.name}`;
        } else {
            el.textContent = '當前路線：無';
        }
    }
});

// ========================
// 🗺️ 切換底圖按鈕與自訂背景色
// ========================
const colorPicker = document.getElementById('bg-color-picker');

document.getElementById('btn-toggle-map').addEventListener('click', () => {
    const btn = document.getElementById('btn-toggle-map');
    if (btn) {
        const isVisible = mapCore.toggleBaseLayer();
        document.getElementById('status-text').textContent = isVisible ? '底圖：顯示' : '底圖：隱藏';
        btn.classList.toggle('active', isVisible);
        
        // 功能6: 自訂無底圖背景色
        if (!isVisible) {
            colorPicker.style.display = 'inline-block';
            document.getElementById('map').style.backgroundColor = colorPicker.value;
        } else {
            colorPicker.style.display = 'none';
            document.getElementById('map').style.backgroundColor = '';
        }
    }
});

colorPicker.addEventListener('input', (e) => {
    document.getElementById('map').style.backgroundColor = e.target.value;
});

// ========================
// 💾 儲存按鈕
// ========================
document.getElementById('btn-save').addEventListener('click', () => {
    const json = store.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metro-project-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    document.getElementById('status-text').textContent = '已儲存專案';
});

// ========================
// 📂 讀取按鈕
// ========================
document.getElementById('btn-load').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                store.importJSON(ev.target.result);
                document.getElementById('status-text').textContent = `已讀取：${file.name}`;
            } catch (err) {
                alert('讀取失敗：' + err.message);
            }
        };
        reader.readAsText(file);
    });
    input.click();
});

// ========================
// 座標顯示
// ========================
bus.on('MAP_MOUSEMOVE', (e) => {
    const { lat, lng } = e.latlng;
    document.getElementById('coords-text').textContent = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
});

// ========================
// 📸 匯出圖片按鈕
// ========================
document.getElementById('btn-export').addEventListener('click', async () => {
    const btn = document.getElementById('btn-export');
    const originalText = btn.textContent;
    btn.textContent = '⏳ 處理中...';
    document.body.classList.add('exporting');
    
    // 給予瀏覽器微小時間反應，套用 .exporting CSS 隱藏介面
    await new Promise(resolve => setTimeout(resolve, 150));
    
    try {
        const appEl = document.getElementById('app');
        // 如果是在有底圖的狀態，使用白色背景；若無底圖則抓取自訂顏色
        const currentBg = document.getElementById('map').style.backgroundColor;
        const exportBg = currentBg ? currentBg : '#ebf0f5';

        const url = await domtoimage.toPng(appEl, {
            bgcolor: exportBg
        });
        
        const a = document.createElement('a');
        a.download = `metro-map-${Date.now()}.png`;
        a.href = url;
        a.click();
    } catch (err) {
        console.error(err);
        alert('匯出失敗，請重試！\\n錯誤：' + err.message);
    } finally {
        document.body.classList.remove('exporting');
        btn.textContent = originalText;
    }
});

// ========================
// 📃 行駛區間視窗開關
// ========================
document.getElementById('btn-route-list').addEventListener('click', () => {
    routeListPanel.toggle();
});

bus.on('ROUTE_PANEL_TOGGLED', (isVisible) => {
    const btn = document.getElementById('btn-route-list');
    if (isVisible) {
        btn.classList.add('active');
    } else {
        btn.classList.remove('active');
    }
});

console.log('Metro Map V2 Initialized');
