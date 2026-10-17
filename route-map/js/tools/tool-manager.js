/**
 * tool-manager.js
 * Manages active tool state and delegates events.
 * 功能6: 通用車站拖曳邏輯（不限工具模式）
 */
import { bus } from '../core/event-bus.js';
import { store } from '../core/store.js';

export class ToolManager {
    constructor() {
        this.tools = {};
        this.activeTool = null;

        // 功能6: 通用拖曳狀態
        this.draggingStationId = null;
        this.isDragging = false;
        this.wasDragged = false;

        this.bindEvents();
    }

    registerTool(name, toolInstance) {
        this.tools[name] = toolInstance;
    }

    activateTool(name) {
        if (this.activeTool) {
            this.activeTool.deactivate();
        }

        const tool = this.tools[name];
        if (tool) {
            this.activeTool = tool;
            this.activeTool.activate();
            console.log(`[ToolManager] Activated: ${name}`);
        }
    }

    bindEvents() {
        bus.on('TOOL_CHANGED', (name) => {
            this.activateTool(name);
        });

        // Delegate Map Events to Active Tool
        bus.on('MAP_CLICK', (e) => {
            // 功能5: 車站移動後不應該觸發新增車站視窗，透過判斷 wasDragged 阻擋點擊事件向下傳遞
            if (this.wasDragged) return;

            if (this.activeTool && this.activeTool.onClick) {
                this.activeTool.onClick(e);
            }
        });

        bus.on('MAP_MOUSEMOVE', (e) => {
            // 功能6: 通用拖曳 - 在任何模式下都能拖曳車站
            if (this.draggingStationId) {
                this.isDragging = true;
                const { lat, lng } = e.latlng;
                store.updateStationPosition(this.draggingStationId, lat, lng);
            }

            if (this.activeTool && this.activeTool.onMouseMove) {
                this.activeTool.onMouseMove(e);
            }
        });

        bus.on('MAP_MOUSEUP', (e) => {
            // 功能6: 通用拖曳結束
            if (this.draggingStationId) {
                console.log(`[ToolManager] Stopped dragging station: ${this.draggingStationId}`);
                if (this.isDragging) {
                    this.wasDragged = true;
                    // 功能6: 檢查是否能共站合併
                    this.checkStationMerge(this.draggingStationId);

                    setTimeout(() => { this.wasDragged = false; }, 200);
                }
                this.draggingStationId = null;
                this.isDragging = false;
            }

            if (this.activeTool && this.activeTool.onMouseUp) {
                this.activeTool.onMouseUp(e);
            }
        });

        // 功能6: 通用車站 mousedown → 啟動拖曳（不限模式）
        bus.on('STATION_MOUSEDOWN', (e) => {
            this.draggingStationId = e.id;
            this.isDragging = false;
            this.wasDragged = false;
            console.log(`[ToolManager] Started dragging station: ${e.id}`);
        });

        bus.on('STATION_CLICK', (e) => {
            if (this.activeTool && this.activeTool.onStationClick) {
                this.activeTool.onStationClick(e);
            }
        });
    }

    // 功能6: 檢查車站是否能與其他車站合併
    checkStationMerge(draggedId) {
        const dragged = store.getStations().find(s => s.id === draggedId);
        if (!dragged) return;

        const mergeThreshold = 0.0005; // 經緯度大約 50 公尺
        const others = store.getStations().filter(s => s.id !== draggedId);
        
        for (const target of others) {
            const dx = dragged.lat - target.lat;
            const dy = dragged.lng - target.lng;
            const dist = Math.hypot(dx, dy);
            
            if (dist < mergeThreshold) {
                if (confirm(`是否與「${target.name}」共站？\n\n按確定：將合併至此車站\n按取消：保留為獨立車站`)) {
                    store.mergeStations(dragged.id, target.id);
                }
                break; // 只處理第一個碰到的車站
            }
        }
    }
}
