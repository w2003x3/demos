/**
 * station-tool.js
 * Tool for creating new stations.
 * 功能5: 預設名稱 = 路線名前綴 + 序號
 * 功能7: 需有當前操作路線才能新增車站
 */
import { store } from '../core/store.js';

export class StationTool {
    activate() {
        // 功能7: 檢查是否有當前操作路線
        const activeLine = store.getActiveLine();
        if (!activeLine) {
            alert('請先建立或選擇一條路線作為「當前操作路線」！');
            // 切回 select
            const selectBtn = document.getElementById('btn-select');
            if (selectBtn) selectBtn.click();
            return;
        }
        document.getElementById('map').style.cursor = 'crosshair';
    }

    deactivate() {
        document.getElementById('map').style.cursor = '';
    }

    onClick(e) {
        const activeLine = store.getActiveLine();
        if (!activeLine) {
            alert('請先建立或選擇一條路線作為「當前操作路線」！');
            const selectBtn = document.getElementById('btn-select');
            if (selectBtn) selectBtn.click();
            return;
        }

        const { lat, lng } = e.latlng;
        // 功能5: 預設名稱依路線車站數決定
        const defaultName = store.getNextStationName(activeLine.id);

        setTimeout(() => {
            const name = prompt('請輸入車站名稱:', defaultName);
            if (name) {
                const station = store.addStation(lat, lng, name);
                // 自動加入當前操作路線
                store.addNodeToLine(activeLine.id, { type: 'station', id: station.id });
            }
        }, 10);
    }

    onStationClick(e) {
        const activeLine = store.getActiveLine();
        if (!activeLine) {
            alert('請先選擇或建立一條路線作為「當前路線」再進行延伸！');
            const selectBtn = document.getElementById('btn-select');
            if (selectBtn) selectBtn.click();
            return;
        }

        const stationId = e.id;
        const line = activeLine;

        // 如果這個車站已經在當前路線上了，則判斷是否為端點站以切換延伸方向
        if (line.nodes.some(n => n.type === 'station' && n.id === stationId)) {
            const firstNode = line.nodes[0];
            const lastNode = line.nodes[line.nodes.length - 1];
            if (firstNode.id === stationId) {
                store.setExtensionDirection('start');
                // 可考慮使用非阻擋提示，或依使用者習慣
                alert('接續延伸方向已設為此端點 (起點側)');
            } else if (lastNode.id === stationId) {
                store.setExtensionDirection('end');
                alert('接續延伸方向已設為此端點 (終點側)');
            }
            return;
        }

        // 詢問轉乘
        if (confirm('是否與此車站設定為「轉乘站」(共構)？\n\n按「確定」：共用此車站並連線\n按「取消」：在旁邊新增獨立車站')) {
            // 共構
            store.addNodeToLine(activeLine.id, { type: 'station', id: stationId });
        } else {
            // 獨立車站 (偏移位置)
            const station = store.getStations().find(s => s.id === stationId);
            if (station) {
                const offset = 0.003;
                const newLat = station.lat + offset;
                const newLng = station.lng + offset;

                const defaultName = store.getNextStationName(activeLine.id);
                setTimeout(() => {
                    const name = prompt('請輸入新車站名稱:', defaultName);
                    if (name) {
                        const newStation = store.addStation(newLat, newLng, name);
                        store.addNodeToLine(activeLine.id, { type: 'station', id: newStation.id });
                    }
                }, 10);
            }
        }
    }
}
