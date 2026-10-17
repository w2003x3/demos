/**
 * map-core.js
 * Wrapper for Leaflet instance
 */
import { bus } from '../core/event-bus.js';

export class MapCore {
    constructor(containerId) {
        this.map = L.map(containerId, {
            center: [25.0478, 121.5170], // Default Taipei
            zoom: 13,
            zoomControl: false,
            dragging: false, // Disable default Left-click pan
            tap: false // iOS interaction tweaks if needed
        });

        this.setupRightClickPan();


        // Add Base Layer
        this.baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap',
            maxZoom: 19
        }).addTo(this.map);

        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        this.bindEvents();
    }

    setupRightClickPan() {
        const container = this.map.getContainer();
        let isDragging = false;
        let startPoint = null;

        container.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                isDragging = true;
                startPoint = { x: e.clientX, y: e.clientY };
                container.style.cursor = 'grabbing';
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();

            const dx = e.clientX - startPoint.x;
            const dy = e.clientY - startPoint.y;
            if (dx === 0 && dy === 0) return;

            this.map.panBy([-dx, -dy], { animate: false });
            startPoint = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mouseup', (e) => {
            if (isDragging && e.button === 2) {
                isDragging = false;
                container.style.cursor = '';
            }
        });

        // 所有操作都用左鍵，右鍵僅用於平移地圖，因此永遠抑制瀏覽器右鍵選單
        container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    }

    bindEvents() {
        this.map.on('click', (e) => {
            bus.emit('MAP_CLICK', e);
        });


        this.map.on('mousemove', (e) => {
            bus.emit('MAP_MOUSEMOVE', e);
        });

        this.map.on('mouseup', (e) => {
            bus.emit('MAP_MOUSEUP', e);
        });
    }

    getMap() {
        return this.map;
    }

    toggleBaseLayer() {
        if (this.map.hasLayer(this.baseLayer)) {
            this.map.removeLayer(this.baseLayer);
            return false;
        } else {
            this.map.addLayer(this.baseLayer);
            return true;
        }
    }
}
