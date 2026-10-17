/**
 * turning-layer.js
 * Renders turning points as draggable square markers.
 */
import { bus } from '../core/event-bus.js';
import { store } from '../core/store.js';

export class TurningLayer {
    constructor(map) {
        this.map = map;
        this.markers = {}; // Map<lineId_nodeIndex, L.Marker>

        this.bindEvents();
    }

    bindEvents() {
        bus.on('LINE_ADDED', (line) => this.updateLineTurnings(line));
        bus.on('LINE_UPDATED', (line) => this.updateLineTurnings(line));
        bus.on('LINE_DELETED', (line) => this.removeLineTurnings(line.id));

        bus.on('STATE_LOADED', (state) => {
            this.clearAll();
            state.lines.forEach(l => this.updateLineTurnings(l));
        });
    }

    updateLineTurnings(line) {
        if (this.isDragging) return; // Prevent recreation during drag

        // First remove existing turn markers for this line
        this.removeLineTurnings(line.id);

        line.nodes.forEach((node, index) => {
            if (node.type === 'turning') {
                this.addMarker(line, node, index);
            }
        });
    }

    addMarker(line, node, index) {
        const markerId = `${line.id}_${index}`;

        // Use a simple div icon for turning points
        const icon = L.divIcon({
            className: 'turning-marker',
            html: '<div></div>',
            iconSize: [10, 10],
            iconAnchor: [5, 5]
        });

        const marker = L.marker([node.lat, node.lng], {
            icon: icon,
            draggable: true
        });

        marker.addTo(this.map);
        this.markers[markerId] = marker;

        // Visual distinction based on line color
        marker.on('add', () => {
            const el = marker.getElement();
            if (el) {
                el.style.backgroundColor = 'white';
                el.style.border = `2px solid ${line.color}`;
                el.style.borderRadius = '2px';
            }
        });

        // Stop all propagation to avoid triggering line or map clicks
        marker.on('mousedown mouseup click dblclick contextmenu', (e) => {
            L.DomEvent.stopPropagation(e);
        });

        // Interaction (Drag)
        marker.on('dragstart', () => {
            this.isDragging = true;
        });

        marker.on('drag', (e) => {
            const { lat, lng } = e.target.getLatLng();
            // Optional: update the line visibly while dragging? Yes, for smooth UX.
            // Update node coordinate locally and emit event
            node.lat = lat;
            node.lng = lng;
            // Update the line layer visually without triggering full recreation of markers
            bus.emit('LINE_UPDATED', line);
        });

        marker.on('dragend', (e) => {
            this.isDragging = false;
            this.wasDragged = true; // Set flag to prevent click event
            const { lat, lng } = e.target.getLatLng();
            // Finalize change in store
            // We just update the object reference, Store won't know unless we tell it.
            // Since we updated `node` by ref, we can just trigger a line update.
            store.updateLine(line.id, {}); // Trigger save/update

            // Reset the flag after a short delay so the click event is caught
            // Leaflet/Browser click event could be delayed after mouseup/dragend
            setTimeout(() => { this.wasDragged = false; }, 200);
        });

        // Context Menu for Turning Point
        marker.on('contextmenu', (e) => {
            L.DomEvent.stopPropagation(e);
            // Delete turning point
            if (confirm('確定刪除此轉折點？')) {
                // We have to remove it from the line's nodes
                line.nodes.splice(index, 1);
                store.updateLine(line.id, {});
            }
        });

        // Left click menu? Or left click to delete?
        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            const ev = e.originalEvent;
            if (ev && ev.stopPropagation) {
                ev.stopPropagation();
            }

            if (this.wasDragged) return; // Prevent menu if just dragged

            const items = [
                {
                    label: '🗑️ 刪除轉折點',
                    action: () => {
                        line.nodes.splice(index, 1);
                        store.updateLine(line.id, {});
                    }
                }
            ];

            import('../ui/context-menu.js').then(module => {
                const contextMenu = new module.ContextMenu();
                setTimeout(() => {
                    contextMenu.show(ev.clientX, ev.clientY, items);
                }, 10);
            });
        });
    }

    removeLineTurnings(lineId) {
        Object.keys(this.markers).forEach(key => {
            if (key.startsWith(`${lineId}_`)) {
                this.markers[key].remove();
                delete this.markers[key];
            }
        });
    }

    clearAll() {
        Object.values(this.markers).forEach(m => m.remove());
        this.markers = {};
    }
}
