/**
 * line-layer.js
 * Renders lines using native Leaflet Polylines for zero-drift.
 */
import { bus } from '../core/event-bus.js';
import { store } from '../core/store.js';
// Note: We need a distance function. Since we don't have L.GeometryUtil plugin,
// we will implement a simple one helper in this file.

export class LineLayer {
    constructor(map) {
        this.map = map;
        this.polylines = {}; // Map<id, L.Polyline>

        // Default Style
        this.defaultStyle = {
            weight: 5,
            opacity: 0.8,
            lineJoin: 'round'
        };

        this.bindEvents();
    }

    bindEvents() {
        bus.on('LINE_ADDED', (line) => this.addLine(line));
        bus.on('LINE_UPDATED', (line) => this.updateLine(line));
        bus.on('LINE_DELETED', (line) => this.removeLine(line));

        bus.on('RELATED_LINES_UPDATED', (lineIds) => {
            lineIds.forEach(lineId => {
                const line = store.getLines().find(l => l.id === lineId);
                if (line) {
                    this.updateLine(line);
                }
            });
        });

        // 載入專案時清除並重繪
        bus.on('STATE_LOADED', (state) => {
            this.clearAll();
            state.lines.forEach(l => this.addLine(l));
        });
    }

    addLine(line) {
        const latlngs = this.getLatLngsForLine(line);
        const routedLatLngs = this.applyRouting(latlngs);

        const polyline = L.polyline(routedLatLngs, {
            ...this.defaultStyle,
            color: line.color
        });

        polyline.addTo(this.map);
        this.polylines[line.id] = polyline;

        // Move to back so stations stay on top
        polyline.bringToBack();

        // Bind generic click
        polyline.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            const segmentIndex = this.findClosestSegment(line, e.latlng);
            bus.emit('LINE_CLICK', { id: line.id, latlng: e.latlng, segmentIndex, originalEvent: e });
        });

        // Hover Effect
        polyline.on('mouseover', () => {
            polyline.setStyle({
                weight: this.defaultStyle.weight + 3,
                opacity: 1
            });
        });

        polyline.on('mouseout', () => {
            polyline.setStyle({
                weight: this.defaultStyle.weight,
                opacity: this.defaultStyle.opacity
            });
        });
    }

    /**
     * Helper to find segment index.
     * Uses pixel distance for accuracy.
     */
    findClosestSegment(line, clickLatLng) {
        let minDist = Infinity;
        let bestIndex = -1;
        const P = this.map.latLngToLayerPoint(clickLatLng);

        const nodes = line.nodes;
        for (let i = 0; i < nodes.length - 1; i++) {
            const ll1 = this.getNodeLatLng(nodes[i]);
            const ll2 = this.getNodeLatLng(nodes[i + 1]);

            if (ll1 && ll2) {
                const A = this.map.latLngToLayerPoint(ll1);
                const B = this.map.latLngToLayerPoint(ll2);
                const dist = L.LineUtil.pointToSegmentDistance(P, A, B);

                if (dist < minDist) {
                    minDist = dist;
                    bestIndex = i;
                }
            }
        }
        return bestIndex;
    }

    getNodeLatLng(node) {
        if (node.type === 'station') {
            const s = store.getStations().find(st => st.id === node.id);
            return s ? L.latLng(s.lat, s.lng) : null;
        } else if (node.type === 'turning') {
            return L.latLng(node.lat, node.lng);
        }
        return null;
    }

    updateLine(line) {
        const polyline = this.polylines[line.id];
        if (polyline) {
            const latlngs = this.getLatLngsForLine(line);
            const routedLatLngs = this.applyRouting(latlngs);
            polyline.setLatLngs(routedLatLngs);
            polyline.setStyle({ color: line.color });
        }
    }

    getLatLngsForLine(line) {
        // Line nodes can be { type: 'station', id: '...' } or { type: 'turning', lat: ..., lng: ... }
        return line.nodes.map(node => {
            if (node.type === 'station') {
                const station = store.getStations().find(s => s.id === node.id);
                if (station) {
                    return L.latLng(station.lat, station.lng);
                }
            } else if (node.type === 'turning') {
                return L.latLng(node.lat, node.lng);
            }
            return null;
        }).filter(pt => pt !== null);
    }

    /**
     * Applies 45-degree routing between points.
     */
    applyRouting(latlngs) {
        if (latlngs.length < 2) return latlngs;

        const routed = [];
        // Always add first point
        routed.push(latlngs[0]);

        for (let i = 0; i < latlngs.length - 1; i++) {
            const p1 = this.map.latLngToLayerPoint(latlngs[i]);
            const p2 = this.map.latLngToLayerPoint(latlngs[i + 1]);

            // Calculate intermediate points in pixel space
            const pathPoints = Geometry.getOctilinearPath(p1, p2);

            // Convert back to LatLng (excluding start point as it's already added)
            for (let j = 1; j < pathPoints.length; j++) {
                // Use layerPointToLatLng to get coords back
                routed.push(this.map.layerPointToLatLng(pathPoints[j]));
            }
        }
        return routed;
    }

    removeLine(line) {
        const polyline = this.polylines[line.id];
        if (polyline) {
            polyline.remove();
            delete this.polylines[line.id];
        }
    }

    clearAll() {
        Object.values(this.polylines).forEach(p => p.remove());
        this.polylines = {};
    }
}

// Simple Geometry Helper embedded or imported
const Geometry = {
    getOctilinearPath(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (absDx < 2 || absDy < 2 || Math.abs(absDx - absDy) < 2) {
            return [p1, p2];
        }

        const signX = dx > 0 ? 1 : -1;
        const signY = dy > 0 ? 1 : -1;
        const minDiff = Math.min(absDx, absDy);

        const pMid = L.point(p1.x + minDiff * signX, p1.y + minDiff * signY);

        return [p1, pMid, p2];
    }
};

