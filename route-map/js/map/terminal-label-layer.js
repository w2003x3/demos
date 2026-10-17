import { bus } from '../core/event-bus.js';
import { store } from '../core/store.js';

export class TerminalLabelLayer {
    constructor(map) {
        this.map = map;
        this.layerGroup = L.layerGroup().addTo(this.map);
        this.bindEvents();
    }

    bindEvents() {
        const render = () => this.renderAll();
        bus.on('LINE_ADDED', render);
        bus.on('LINE_UPDATED', render);
        bus.on('LINE_DELETED', render);
        bus.on('STATION_UPDATED', render);
        bus.on('STATION_DELETED', render);
        bus.on('STATE_LOADED', render);
    }

    renderAll() {
        this.layerGroup.clearLayers();

        store.getLines().forEach(line => {
            if (!line.code || line.nodes.length === 0) return;

            const stationNodes = line.nodes.filter(n => n.type === 'station');
            if (stationNodes.length === 0) return;

            const firstNode = stationNodes[0];
            const lastNode = stationNodes[stationNodes.length - 1];

            this.renderLabel(line, firstNode, true, stationNodes);
            if (stationNodes.length > 1 && firstNode.id !== lastNode.id) {
                this.renderLabel(line, lastNode, false, stationNodes);
            }
        });
    }

    renderLabel(line, node, isFirst, stationNodes) {
        const station = store.getStations().find(s => s.id === node.id);
        if (!station) return;

        // 預設朝正上方推遠一點，避免壓在車站上
        let offsetLat = 0.003;
        let offsetLng = 0;

        if (stationNodes.length > 1) {
            let adjacentNode = isFirst ? stationNodes[1] : stationNodes[stationNodes.length - 2];
            const adjacentStation = store.getStations().find(s => s.id === adjacentNode.id);
            if (adjacentStation) {
                const dx = station.lng - adjacentStation.lng;
                const dy = station.lat - adjacentStation.lat;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0) {
                    const pushFactor = 0.006; // 增加推移的經緯度長度，將標籤確實推到圓圈外面
                    offsetLng = (dx / len) * pushFactor;
                    offsetLat = (dy / len) * pushFactor;
                }
            }
        }

        const labelLat = station.lat + offsetLat;
        const labelLng = station.lng + offsetLng;

        const textColor = this.getContrastColor(line.color);

        const html = `<div class="route-code-label" style="background-color: ${line.color}; color: ${textColor};">${line.code}</div>`;

        const icon = L.divIcon({
            html: html,
            className: '', // 清除 Leaflet 預設的小白色方塊
            iconSize: null, // 自動適應內容大小
            iconAnchor: [12, 12] // 讓標籤大約置中在推算出的點上
        });

        const marker = L.marker([labelLat, labelLng], {
            icon: icon,
            interactive: false // 標籤不需要被點擊阻擋
        });

        this.layerGroup.addLayer(marker);
    }

    getContrastColor(hexcolor) {
        if (!hexcolor) return 'black';
        if (hexcolor.slice(0, 1) === '#') hexcolor = hexcolor.slice(1);
        if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(c => c + c).join('');
        const r = parseInt(hexcolor.substr(0, 2), 16);
        const g = parseInt(hexcolor.substr(2, 2), 16);
        const b = parseInt(hexcolor.substr(4, 2), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (yiq >= 128) ? 'black' : 'white';
    }
}
