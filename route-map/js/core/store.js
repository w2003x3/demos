/**
 * store.js
 * Single Source of Truth for application state.
 */
import { bus } from './event-bus.js';

class Store {
    constructor() {
        this.state = {
            stations: [], // { id, lat, lng, name, lines: [] }
            lines: [],    // { id, name, color, type, code, nodes: [] }
            corridors: [], // { id, type, fromId, toId }
            activeLineId: null, // 當前操作路線
            extensionDirection: 'end', // 功能3: 延伸方向 'start' 或 'end'
            selectedStationIds: [], // 複數選取的車站 ID 陣列
            settings: {
                showMap: true
            }
        };

        // ID Counters
        this.stationIdCounter = 1;
        this.lineIdCounter = 1;
        this.corridorIdCounter = 1;
    }

    // ========================
    // Active Line (當前操作路線)
    // ========================

    setActiveLine(lineId) {
        this.state.activeLineId = lineId;
        // 切換路線時，預設延伸方向還原為 'end'
        this.state.extensionDirection = 'end';
        const line = lineId ? this.state.lines.find(l => l.id === lineId) : null;
        bus.emit('ACTIVE_LINE_CHANGED', line);
    }

    getActiveLine() {
        if (!this.state.activeLineId) return null;
        return this.state.lines.find(l => l.id === this.state.activeLineId) || null;
    }

    // ========================
    // Extension Direction (當前路線延伸端點)
    // ========================

    setExtensionDirection(dir) {
        if (dir === 'start' || dir === 'end') {
            this.state.extensionDirection = dir;
            import('./event-bus.js').then(m => m.bus.emit('EXTENSION_DIRECTION_CHANGED', dir));
        }
    }

    getExtensionDirection() {
        return this.state.extensionDirection;
    }

    // ========================
    // Selection Management (複數選取)
    // ========================

    setStationSelection(ids) {
        this.state.selectedStationIds = [...ids];
        bus.emit('SELECTION_CHANGED', this.state.selectedStationIds);
    }

    toggleStationSelection(id) {
        const idx = this.state.selectedStationIds.indexOf(id);
        if (idx === -1) {
            this.state.selectedStationIds.push(id);
        } else {
            this.state.selectedStationIds.splice(idx, 1);
        }
        bus.emit('SELECTION_CHANGED', this.state.selectedStationIds);
    }

    clearStationSelection() {
        if (this.state.selectedStationIds.length > 0) {
            this.state.selectedStationIds = [];
            bus.emit('SELECTION_CHANGED', this.state.selectedStationIds);
        }
    }

    getSelectedStations() {
        return this.state.selectedStationIds;
    }

    // ========================
    // Station Actions
    // ========================

    addStation(lat, lng, name = '') {
        const id = `s${this.stationIdCounter++}`;
        const newStation = {
            id,
            lat,
            lng,
            name: name || `車站 ${id}`,
            lines: []
        };

        this.state.stations.push(newStation);
        bus.emit('STATION_ADDED', newStation);
        bus.emit('STATE_CHANGED', this.state);
        return newStation;
    }

    deleteStation(id) {
        const idx = this.state.stations.findIndex(s => s.id === id);
        if (idx === -1) return;

        const station = this.state.stations[idx];

        // 從所有路線中清除此車站的 node 引用
        this.state.lines.forEach(line => {
            line.nodes = line.nodes.filter(n => !(n.type === 'station' && n.id === id));
        });

        // 從連通道中清除
        this.state.corridors = this.state.corridors.filter(c => c.fromId !== id && c.toId !== id);

        this.state.stations.splice(idx, 1);
        
        // 如果這個車站在選取清單中，移除它
        if (this.state.selectedStationIds.includes(id)) {
            this.toggleStationSelection(id);
        }

        bus.emit('STATION_DELETED', station);

        // 通知受影響路線更新
        station.lines.forEach(lineId => {
            const line = this.state.lines.find(l => l.id === lineId);
            if (line) bus.emit('LINE_UPDATED', line);
        });

        bus.emit('STATE_CHANGED', this.state);
    }

    renameStation(id, name) {
        const station = this.state.stations.find(s => s.id === id);
        if (station) {
            station.name = name;
            bus.emit('STATION_UPDATED', station);
        }
    }

    updateStationPosition(id, lat, lng) {
        const station = this.state.stations.find(s => s.id === id);
        if (station) {
            station.lat = lat;
            station.lng = lng;
            bus.emit('STATION_UPDATED', station);
            if (station.lines.length > 0) {
                // 功能1: 移除受影響的轉折點
                station.lines.forEach(lineId => {
                    const line = this.state.lines.find(l => l.id === lineId);
                    if (line) {
                        this._removeAdjacentTurnings(line, id);
                        bus.emit('LINE_UPDATED', line);
                    }
                });
                bus.emit('RELATED_LINES_UPDATED', station.lines);
            }
            return true;
        }
        return false;
    }

    /**
     * 功能1 & 3: 移除車站前後相鄰的連續 turning 節點
     */
    _removeAdjacentTurnings(line, stationId) {
        for (let i = line.nodes.length - 1; i >= 0; i--) {
            const node = line.nodes[i];
            if (node.type === 'station' && node.id === stationId) {
                // 移除後面的連續 turning
                while (i + 1 < line.nodes.length && line.nodes[i + 1].type === 'turning') {
                    line.nodes.splice(i + 1, 1);
                }
                // 移除前面的連續 turning
                while (i - 1 >= 0 && line.nodes[i - 1].type === 'turning') {
                    line.nodes.splice(i - 1, 1);
                    i--;
                }
            }
        }
    }

    /**
     * 功能2: 更新車站所屬路線（必選、複選）
     */
    updateStationLines(stationId, newLineIds) {
        const station = this.state.stations.find(s => s.id === stationId);
        if (!station) return;

        const oldLineIds = [...station.lines];

        // 要新增的路線
        const toAdd = newLineIds.filter(lid => !oldLineIds.includes(lid));
        // 要移除的路線
        const toRemove = oldLineIds.filter(lid => !newLineIds.includes(lid));

        // 從路線中移除車站
        toRemove.forEach(lineId => {
            const line = this.state.lines.find(l => l.id === lineId);
            if (line) {
                line.nodes = line.nodes.filter(n => !(n.type === 'station' && n.id === stationId));
                bus.emit('LINE_UPDATED', line);
            }
        });

        // 將車站加入新路線（加到 nodes 尾端）
        toAdd.forEach(lineId => {
            const line = this.state.lines.find(l => l.id === lineId);
            if (line) {
                line.nodes.push({ type: 'station', id: stationId });
                bus.emit('LINE_UPDATED', line);
            }
        });

        // 更新 station.lines
        station.lines = [...newLineIds];
        bus.emit('STATION_UPDATED', station);
        bus.emit('STATE_CHANGED', this.state);
    }

    /**
     * 功能6: 車站合併 (當車站拖曳至距離過近時)
     */
    mergeStations(fromId, toId) {
        const fromStation = this.state.stations.find(s => s.id === fromId);
        if (!fromStation) return;

        // 將 fromStation 參與的所有路線中的 node id 替換為 toId
        fromStation.lines.forEach(lineId => {
            const line = this.state.lines.find(l => l.id === lineId);
            if (line) {
                line.nodes.forEach(n => {
                    if (n.type === 'station' && n.id === fromId) {
                        n.id = toId;
                    }
                });
                
                // 確保 toStation 知道它現在屬於這個路線
                this._updateStationLink({ type: 'station', id: toId }, lineId);
                
                bus.emit('LINE_UPDATED', line);
            }
        });

        // 將 fromStation 參與的連通道更新為 toId
        this.state.corridors.forEach(c => {
            if (c.fromId === fromId) c.fromId = toId;
            if (c.toId === fromId) c.toId = toId;
        });

        // 刪除原本的 fromStation (會觸發 STATION_DELETED，由於我們已經將對應連通道轉換，
        // 為了避免被一併刪除，必需在 delete 之前更新它，刪除機制只會刪還存在的關聯)
        this.deleteStation(fromId);
    }

    /**
     * 功能3: 重排路線車站順序（移除所有 turning 節點）
     */
    reorderLineStations(lineId, orderedStationIds) {
        const line = this.state.lines.find(l => l.id === lineId);
        if (!line) return;

        // 依照新順序重建 nodes，只保留 station 節點
        line.nodes = orderedStationIds.map(sid => ({ type: 'station', id: sid }));
        bus.emit('LINE_UPDATED', line);
        bus.emit('STATE_CHANGED', this.state);
    }

    // ========================
    // Line Actions
    // ========================

    /**
     * 功能4: 取得下一個可用的路線預設名稱 (A線, B線, C線…)
     */
    getNextLineName() {
        const existingNames = new Set(this.state.lines.map(l => l.name));
        for (let i = 0; i < 26; i++) {
            const letter = String.fromCharCode(65 + i); // A=65
            const name = `${letter}線`;
            if (!existingNames.has(name)) {
                return name;
            }
        }
        // 超過 26 條時用數字
        let n = 27;
        while (existingNames.has(`${n}線`)) n++;
        return `${n}線`;
    }

    /**
     * 功能5: 取得下一個車站預設名稱 (路線名前綴 + 序號)
     * 例如: A1站, B5站
     */
    getNextStationName(lineId) {
        const line = this.state.lines.find(l => l.id === lineId);
        if (!line) return '新車站';

        // 取路線名的前綴 (去掉「線」字)
        const prefix = line.name.replace(/線$/, '');

        // 計算路線中目前的車站數量
        const stationCount = line.nodes.filter(n => n.type === 'station').length;

        return `${prefix}${stationCount + 1}站`;
    }

    addLine(name, color, code = '') {
        const id = `l${this.lineIdCounter++}`;
        const newLine = {
            id,
            name,
            color,
            code,
            nodes: []
        };
        this.state.lines.push(newLine);
        bus.emit('LINE_ADDED', newLine);
        bus.emit('STATE_CHANGED', this.state);
        return newLine;
    }

    deleteLine(id) {
        const idx = this.state.lines.findIndex(l => l.id === id);
        if (idx === -1) return;

        const line = this.state.lines[idx];

        // 從所有車站中清除此路線的引用
        this.state.stations.forEach(station => {
            station.lines = station.lines.filter(lid => lid !== id);
        });

        this.state.lines.splice(idx, 1);
        bus.emit('LINE_DELETED', line);

        // 如果刪除的是當前操作路線，清除
        if (this.state.activeLineId === id) {
            this.setActiveLine(null);
        }

        // 刷新車站樣式
        this.state.stations.forEach(s => bus.emit('STATION_UPDATED', s));
        bus.emit('STATE_CHANGED', this.state);
    }

    updateLine(id, props) {
        const line = this.state.lines.find(l => l.id === id);
        if (!line) return;
        if (props.name !== undefined) line.name = props.name;
        if (props.color !== undefined) line.color = props.color;
        if (props.code !== undefined) line.code = props.code;
        bus.emit('LINE_UPDATED', line);
    }

    addNodeToLine(lineId, node) {
        const line = this.state.lines.find(l => l.id === lineId);
        if (line) {
            // 功能3: 根據延伸方向插入陣列前端或後端
            if (this.state.extensionDirection === 'start') {
                line.nodes.unshift(node);
            } else {
                line.nodes.push(node);
            }
            this._updateStationLink(node, lineId);
            bus.emit('LINE_UPDATED', line);
        }
    }

    insertNodeInLine(lineId, index, node) {
        const line = this.state.lines.find(l => l.id === lineId);
        if (line) {
            // Insert at index + 1 (since index is the segment start node index)
            // So if clicked between 0 and 1, index is 0. We insert at 1.
            line.nodes.splice(index + 1, 0, node);
            this._updateStationLink(node, lineId);
            bus.emit('LINE_UPDATED', line);
        }
    }

    _updateStationLink(node, lineId) {
        if (node.type === 'station') {
            const station = this.state.stations.find(s => s.id === node.id);
            if (station && !station.lines.includes(lineId)) {
                station.lines.push(lineId);
            }
        }
    }

    getStations() {
        return this.state.stations;
    }

    getLines() {
        return this.state.lines;
    }

    // ========================
    // Corridors Actions (連通道)
    // ========================

    addCorridor(fromId, toId, type = 'in-station') {
        const id = `c${this.corridorIdCounter++}`;
        const newCorridor = { id, fromId, toId, type };
        this.state.corridors.push(newCorridor);
        bus.emit('CORRIDOR_ADDED', newCorridor);
        bus.emit('STATE_CHANGED', this.state);
        return newCorridor;
    }

    deleteCorridor(id) {
        const idx = this.state.corridors.findIndex(c => c.id === id);
        if (idx !== -1) {
            const corridor = this.state.corridors[idx];
            this.state.corridors.splice(idx, 1);
            bus.emit('CORRIDOR_DELETED', corridor);
            bus.emit('STATE_CHANGED', this.state);
        }
    }

    // ========================
    // Save / Load
    // ========================

    exportJSON() {
        return JSON.stringify({
            stations: this.state.stations,
            lines: this.state.lines,
            corridors: this.state.corridors,
            activeLineId: this.state.activeLineId,
            counters: {
                station: this.stationIdCounter,
                line: this.lineIdCounter,
                corridor: this.corridorIdCounter
            }
        }, null, 2);
    }

    importJSON(jsonString) {
        const data = JSON.parse(jsonString);

        // 清除現有狀態
        this.state.stations = data.stations || [];
        this.state.lines = data.lines || [];
        this.state.corridors = data.corridors || [];
        this.state.activeLineId = data.activeLineId || null;
        this.state.selectedStationIds = [];

        // 還原計數器
        if (data.counters) {
            this.stationIdCounter = data.counters.station || 1;
            this.lineIdCounter = data.counters.line || 1;
            this.corridorIdCounter = data.counters.corridor || 1;
        }

        bus.emit('STATE_LOADED', this.state);

        // 還原當前路線提示
        if (this.state.activeLineId) {
            const line = this.state.lines.find(l => l.id === this.state.activeLineId);
            bus.emit('ACTIVE_LINE_CHANGED', line || null);
        }
    }
}

export const store = new Store();
