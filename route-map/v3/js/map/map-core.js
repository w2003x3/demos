/**
 * map-core.js
 * Leaflet 地圖與底圖管理。
 * - 左鍵拖曳空白處平移(拖車站/控制點時由 editor 阻止),右鍵拖曳也可平移
 * - 雙擊不縮放(雙擊留給編輯用)
 * - 底圖依 settings 切換,並套用透明度/灰階/背景色
 */
import { bus } from '../core/event-bus.js';
import { store } from '../core/store.js';
import { BASEMAPS } from '../core/constants.js';

export class MapCore {
    constructor(containerId) {
        this.map = L.map(containerId, {
            center: [25.0478, 121.5170],
            zoom: 12,
            zoomControl: false,
            doubleClickZoom: false,
            boxZoom: false,
            zoomSnap: 0.25,
            zoomDelta: 0.5,
            wheelPxPerZoomLevel: 90
        });
        this.baseLayer = null;
        this.baseKey = null;

        L.control.zoom({ position: 'bottomright' }).addTo(this.map);
        L.control.scale({ position: 'bottomleft', imperial: false }).addTo(this.map);
        this.setupRightClickPan();

        bus.on('SETTINGS_CHANGED', () => this.applySettings());
        this.applySettings();
    }

    setupRightClickPan() {
        const container = this.map.getContainer();
        let dragging = false, last = null;
        container.addEventListener('mousedown', (e) => {
            if (e.button === 2 || e.button === 1) {
                dragging = true;
                last = { x: e.clientX, y: e.clientY };
                container.classList.add('panning');
                e.preventDefault();
            }
        });
        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            this.map.panBy([last.x - e.clientX, last.y - e.clientY], { animate: false });
            last = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener('mouseup', () => {
            if (dragging) { dragging = false; container.classList.remove('panning'); }
        });
        container.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    applySettings() {
        const s = store.state.settings;
        const key = BASEMAPS[s.basemap] ? s.basemap : 'none';
        if (key !== this.baseKey) {
            if (this.baseLayer) this.map.removeLayer(this.baseLayer);
            this.baseLayer = null;
            const bm = BASEMAPS[key];
            if (bm.url) {
                this.baseLayer = L.tileLayer(bm.url, {
                    subdomains: bm.subdomains || 'abc',
                    maxZoom: 20,
                    maxNativeZoom: bm.maxZoom,
                    attribution: bm.attribution,
                    detectRetina: false,
                    r: bm.retina && L.Browser.retina ? '@2x' : '',
                    crossOrigin: 'anonymous'
                }).addTo(this.map);
            }
            this.baseKey = key;
        }
        const container = this.map.getContainer();
        container.style.backgroundColor = s.bgColor;
        const tilePane = this.map.getPane('tilePane');
        tilePane.style.opacity = s.basemapOpacity;
        tilePane.style.filter = s.basemapGray ? 'grayscale(1)' : '';
    }

    /** 縮放到整個路網 */
    fitNetwork() {
        const pts = [];
        store.state.stations.forEach(s => pts.push([s.lat, s.lng]));
        store.state.lines.forEach(l => l.nodes.forEach(n => { if (n.type === 'turning') pts.push([n.lat, n.lng]); }));
        if (!pts.length) return false;
        this.map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 16 });
        return true;
    }

    getMap() { return this.map; }
}
