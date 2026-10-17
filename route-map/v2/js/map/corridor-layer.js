import { store } from '../core/store.js';
import { bus } from '../core/event-bus.js';

export class CorridorLayer {
    constructor(map) {
        this.map = map;
        this.layerGroup = L.layerGroup().addTo(this.map);
        this.corridors = {}; // store polylines by id
        this.bindEvents();
    }

    bindEvents() {
        // Redraw all on load
        bus.on('STATE_LOADED', () => this.renderAll());
        
        // Single Add/Delete
        bus.on('CORRIDOR_ADDED', (corridor) => this.renderCorridor(corridor));
        bus.on('CORRIDOR_DELETED', (corridor) => this.removeCorridor(corridor.id));
        
        // When a station moves or is deleted, we must redraw relevant corridors
        bus.on('STATION_UPDATED', (station) => this.updateCorridorsForStation(station.id));
        bus.on('STATION_DELETED', () => {
            // Because store automatically purges invalid corridors silently, 
            // redraw everything when a station is deleted to clean them up.
            this.renderAll();
        });
    }

    renderAll() {
        this.layerGroup.clearLayers();
        this.corridors = {};
        store.state.corridors.forEach(c => this.renderCorridor(c));
    }

    removeCorridor(id) {
        if (this.corridors[id]) {
            this.corridors[id].forEach(layer => this.layerGroup.removeLayer(layer));
            delete this.corridors[id];
        }
    }

    updateCorridorsForStation(stationId) {
        store.state.corridors
            .filter(c => c.fromId === stationId || c.toId === stationId)
            .forEach(c => this.renderCorridor(c));
    }

    renderCorridor(corridor) {
        this.removeCorridor(corridor.id); // Clear existing layers for this corridor

        const fromStation = store.getStations().find(s => s.id === corridor.fromId);
        const toStation = store.getStations().find(s => s.id === corridor.toId);
        
        if (!fromStation || !toStation) return;

        const latlngs = [
            [fromStation.lat, fromStation.lng],
            [toStation.lat, toStation.lng]
        ];

        const layers = [];

        if (corridor.type === 'in-station') {
            // 一條虛線
            const line = L.polyline(latlngs, {
                color: '#666666',
                weight: 4,
                dashArray: '6, 6',
                interactive: false
            });
            layers.push(line);
            this.layerGroup.addLayer(line);
        } else if (corridor.type === 'out-station') {
            // 二條虛線 (透過疊加一底、一實線產生雙虛線軌道效果)
            const bottom = L.polyline(latlngs, {
                color: '#333333',
                weight: 8,
                dashArray: '8, 8',
                interactive: false
            });
            const top = L.polyline(latlngs, {
                color: '#ffffff',
                weight: 4, // 內部白色實線
                interactive: false
            });
            layers.push(bottom, top);
            this.layerGroup.addLayer(bottom);
            this.layerGroup.addLayer(top);
        }

        this.corridors[corridor.id] = layers;
    }
}
