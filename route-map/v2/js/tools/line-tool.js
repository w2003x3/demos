/**
 * line-tool.js
 * Tool for managing and extending lines.
 * 功能4: 預設路線名稱按字母排序
 * 功能5: 新增車站預設名稱
 */
import { store } from '../core/store.js';
import { bus } from '../core/event-bus.js';
import { Modal } from '../ui/modal.js';

export class LineTool {
    constructor() {
        this.activeLineId = null;
    }

    activate() {
        document.getElementById('map').style.cursor = 'pointer';

        // Ask to create a new line immediately when activated
        if (!this.activeLineId) {
            this.createNewLine();
        }
    }

    deactivate() {
        document.getElementById('map').style.cursor = '';
        this.activeLineId = null;
    }

    async createNewLine() {
        // 功能4: 預設名稱依字母排序，且自動選擇其他顏色
        const defaultName = store.getNextLineName();
        const defaultCode = defaultName.substring(0, 1); // 預設首字代碼，例如 "A線" -> "A"
        const colors = ['#e6194B', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990', '#dcbeff', '#9A6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075', '#a9a9a9'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        
        const result = await Modal.promptLineCreation(defaultName, randomColor, defaultCode);
        if (result.result && result.data) {
            const { name, color, code } = result.data;
            const line = store.addLine(name, color, code);
            this.activeLineId = line.id;
            // 功能7: 新增路線時自動設為當前操作路線
            store.setActiveLine(line.id);
            console.log(`[LineTool] active line: ${this.activeLineId}`);

            // 自動切換到新增車站模式，以符合使用者直覺
            bus.emit('TOOL_CHANGED', 'station');
            
            // 更新 UI 上方的按鈕高亮狀態
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            const stationBtn = document.getElementById('btn-station');
            if (stationBtn) stationBtn.classList.add('active');
            const statusText = document.getElementById('status-text');
            if (statusText) statusText.textContent = `模式: station`;

        } else {
            // Cancelled - switch back to select
            bus.emit('TOOL_CHANGED', 'select');
            
            // 更新 UI 上方的按鈕高亮狀態
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            const selectBtn = document.getElementById('btn-select');
            if (selectBtn) selectBtn.classList.add('active');
            const statusText = document.getElementById('status-text');
            if (statusText) statusText.textContent = `模式: select`;
        }
    }
}
