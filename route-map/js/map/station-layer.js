/**
 * station-layer.js
 * Renders stations using native Leaflet CircleMarkers for zero-drift.
 */
import { bus } from '../core/event-bus.js';
import { store } from '../core/store.js';

export class StationLayer {
    constructor(map) {
        this.map = map;
        this.markers = {}; // Map<id, L.CircleMarker>

        this.bindEvents();
    }

    bindEvents() {
        bus.on('STATION_ADDED', (station) => this.addMarker(station));
        bus.on('STATION_UPDATED', (station) => this.updateMarker(station));
        bus.on('STATION_DELETED', (station) => this.removeMarker(station));
        bus.on('RELATED_LINES_UPDATED', (lines) => {
            store.getStations().forEach(s => this.updateMarker(s));
        });

        bus.on('LINE_ADDED', () => store.getStations().forEach(s => this.updateMarker(s)));
        bus.on('LINE_UPDATED', () => store.getStations().forEach(s => this.updateMarker(s)));
        bus.on('ACTIVE_LINE_CHANGED', () => store.getStations().forEach(s => this.updateMarker(s)));
        bus.on('EXTENSION_DIRECTION_CHANGED', () => store.getStations().forEach(s => this.updateMarker(s)));
        bus.on('SELECTION_CHANGED', () => store.getStations().forEach(s => this.updateMarker(s)));

        // 載入專案時清除並重繪
        bus.on('STATE_LOADED', (state) => {
            this.clearAll();
            state.stations.forEach(s => this.addMarker(s));
        });
    }

    addMarker(station) {
        // Create Leaflet CircleMarker
        const style = this.getStationStyle(station);
        // 功能1: 點擊車站不應觸發底圖 click，因此設定 bubblingMouseEvents: false
        const marker = L.circleMarker([station.lat, station.lng], {
            ...style,
            bubblingMouseEvents: false
        });

        // Bind Tooltip (Label)
        marker.bindTooltip(station.name, {
            permanent: true,
            direction: 'bottom',
            className: 'station-label',
            offset: [0, 5]
        });

        const group = L.featureGroup([marker]);
        let dot = null;
        if (station.lines.length > 1) {
            dot = L.circleMarker([station.lat, station.lng], {
                radius: 2, fillColor: '#000000', color: 'transparent', weight: 0, fillOpacity: 1, interactive: false
            });
            group.addLayer(dot);
        }

        // Add to map
        group.addTo(this.map);
        this.markers[station.id] = { base: marker, dot: dot, group: group };

        // Interaction (Click)
        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            bus.emit('STATION_CLICK', { id: station.id, originalEvent: e });
        });

        // Hover Effect
        marker.on('mouseover', () => {
            marker.setStyle({ weight: style.weight + 2, fillOpacity: 0.9 });
        });

        marker.on('mouseout', () => {
            // Re-apply correct style (Transfer/Terminal/Normal)
            marker.setStyle(this.getStationStyle(station));
        });

        // Interaction (MouseDown)
        marker.on('mousedown', (e) => {
            if (e.originalEvent.button === 0) {
                L.DomEvent.stopPropagation(e);
                bus.emit('STATION_MOUSEDOWN', { id: station.id, originalEvent: e });
            }
        });
    }

    updateMarker(station) {
        const item = this.markers[station.id];
        if (item) {
            item.base.setLatLng([station.lat, station.lng]);
            item.base.setTooltipContent(station.name);

            const style = this.getStationStyle(station);
            item.base.setStyle(style);

            if (station.lines.length > 1) {
                if (!item.dot) {
                    item.dot = L.circleMarker([station.lat, station.lng], {
                        radius: 2, fillColor: '#000000', color: 'transparent', weight: 0, fillOpacity: 1, interactive: false
                    });
                    item.group.addLayer(item.dot);
                } else {
                    item.dot.setLatLng([station.lat, station.lng]);
                }
            } else {
                if (item.dot) {
                    item.group.removeLayer(item.dot);
                    item.dot = null;
                }
            }

            // Leaflet 的 setStyle 無法動態更新底層 SVG 的 class，所以我們需要手動操作 DOM
            const el = item.base.getElement();
            if (el) {
                if (this.isExtensionTarget(station)) {
                    L.DomUtil.addClass(el, 'station-extension-target');
                } else {
                    L.DomUtil.removeClass(el, 'station-extension-target');
                }
                
                if (store.getSelectedStations().includes(station.id)) {
                    L.DomUtil.addClass(el, 'station-selected');
                } else {
                    L.DomUtil.removeClass(el, 'station-selected');
                }
            }
        }
    }

    getStationStyle(station) {
        const lineIds = station.lines;
        let baseStyle = this.getDefaultStyle();

        // 1. Transfer Station (>1 lines)
        if (lineIds.length > 1) {
            baseStyle = {
                radius: 8,
                fillColor: '#ffffff',
                color: '#000000',
                weight: 3,
                opacity: 1,
                fillOpacity: 1,
                dashArray: null
            };
        }
        // 2. Single Line
        else if (lineIds.length === 1) {
            const line = store.getLines().find(l => l.id === lineIds[0]);
            if (line) {
                const isTerminal = this.isTerminal(station, line);
                baseStyle = {
                    radius: isTerminal ? 8 : 6,
                    fillColor: line.color,
                    color: '#ffffff',
                    weight: isTerminal ? 3 : 2,
                    opacity: 1,
                    fillOpacity: 1,
                    dashArray: null
                };
            }
        }

        // 4. Highlight if it is the current extension target
        if (this.isExtensionTarget(station)) {
            baseStyle.className = 'station-extension-target';
            baseStyle.radius = (baseStyle.radius || 6) + 3;
            baseStyle.weight = 3;
            baseStyle.color = '#ff8800'; // 醒目的橘色
            baseStyle.dashArray = '5, 5';
        } else {
            baseStyle.className = '';
        }

        return baseStyle;
    }

    isExtensionTarget(station) {
        const activeLine = store.getActiveLine();
        if (!activeLine || !activeLine.nodes || activeLine.nodes.length === 0) return false;

        const dir = store.getExtensionDirection();
        if (dir === 'start') {
            return activeLine.nodes[0].id === station.id;
        } else {
            return activeLine.nodes[activeLine.nodes.length - 1].id === station.id;
        }
    }

    isTerminal(station, line) {
        if (!line.nodes || line.nodes.length < 2) return false;
        const first = line.nodes[0];
        const last = line.nodes[line.nodes.length - 1];
        return (first.id === station.id) || (last.id === station.id);
    }

    getDefaultStyle() {
        return {
            radius: 6,
            fillColor: '#cccccc',
            color: '#666666',
            weight: 2,
            opacity: 1,
            fillOpacity: 1
        };
    }

    removeMarker(station) {
        const item = this.markers[station.id];
        if (item) {
            item.group.remove();
            delete this.markers[station.id];
        }
    }

    clearAll() {
        Object.values(this.markers).forEach(item => item.group.remove());
        this.markers = {};
    }
}
