/**
 * network-layer.js
 * 把整個路網以單一 SVG 疊在 Leaflet 上(自訂 pane)。
 * 座標使用 layer point(不含取整),縮放時依 Leaflet 的 zoomanim 做 CSS 動畫,
 * 縮放結束後以新比例重新計算模型(平行偏移、線寬等維持固定像素)。
 */
import { bus } from '../core/event-bus.js';
import { store } from '../core/store.js';
import { buildModel } from '../core/network-model.js';
import { renderNetwork } from '../render/svg-renderer.js';

const NS = 'http://www.w3.org/2000/svg';
const PAD = 400;

export class NetworkLayer {
    constructor(map) {
        this.map = map;
        this.model = null;
        this.handlesEnabled = true; // 只有選取工具時顯示彎折控制點
        this.readOnly = false;      // 模擬模式:不輸出熱區與選取效果
        this.showExtension = false;
        this.extraRender = null; // 模擬模式等外掛圖層可注入額外 SVG

        const pane = map.createPane('networkPane');
        pane.style.zIndex = 450;
        this.svg = document.createElementNS(NS, 'svg');
        this.svg.setAttribute('class', 'network-svg leaflet-zoom-animated');
        this.main = document.createElementNS(NS, 'g');
        this.extra = document.createElementNS(NS, 'g');
        this.overlay = document.createElementNS(NS, 'g');
        this.overlay.setAttribute('class', 'net-overlay');
        this.svg.append(this.main, this.extra, this.overlay);
        pane.appendChild(this.svg);

        map.on('zoomanim', this._animateZoom, this);
        map.on('zoomend viewreset resize', () => this.render());
        ['STATE_CHANGED', 'STATE_LOADED', 'SELECTION_CHANGED', 'ACTIVE_LINE_CHANGED', 'SETTINGS_CHANGED']
            .forEach(ev => bus.on(ev, () => this.schedule()));
        this.render();
    }

    /** layer point(不取整) */
    toLayer(latlng) {
        const p = this.map.project(latlng, this.map.getZoom());
        const o = this.map.getPixelOrigin();
        return { x: p.x - o.x, y: p.y - o.y };
    }

    toLatLng(p) {
        const o = this.map.getPixelOrigin();
        return this.map.unproject(L.point(p.x + o.x, p.y + o.y), this.map.getZoom());
    }

    schedule() {
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => {
            this._raf = null;
            this.render();
        });
    }

    render() {
        const state = store.state;
        const sel = state.selection;
        const selectedLineId = this.handlesEnabled && !this.readOnly && sel.type === 'line' ? sel.ids[0] : null;
        this.model = buildModel(state, (lat, lng) => this.toLayer([lat, lng]), { scale: 1, selectedLineId });

        const ext = store.getExtensionNode();
        const html = renderNetwork(this.model, {
            interactive: !this.readOnly,
            selection: this.readOnly ? { type: null, ids: [] } : sel,
            selectedLineId,
            extensionStationId: !this.readOnly && this.showExtension && ext && ext.type === 'station' ? ext.id : null
        });

        const size = this.map.getSize();
        const tl = this.map.containerPointToLayerPoint([0, 0]);
        let b = this.model.bbox || { minX: tl.x, minY: tl.y, maxX: tl.x + size.x, maxY: tl.y + size.y };
        // 至少涵蓋目前視窗,讓預覽線/模擬列車不被裁切
        const minX = Math.min(b.minX, tl.x) - PAD, minY = Math.min(b.minY, tl.y) - PAD;
        const maxX = Math.max(b.maxX, tl.x + size.x) + PAD, maxY = Math.max(b.maxY, tl.y + size.y) + PAD;
        const w = Math.ceil(maxX - minX), h = Math.ceil(maxY - minY);

        this.svg.setAttribute('width', w);
        this.svg.setAttribute('height', h);
        this.svg.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`);
        L.DomUtil.setPosition(this.svg, L.point(minX, minY));
        this._originLatLng = this.toLatLng({ x: minX, y: minY });
        this.main.innerHTML = html;
        if (this.extraRender) this.extra.innerHTML = this.extraRender(this) || '';
        bus.emit('NETWORK_RENDERED', this.model);
    }

    setOverlay(html) {
        this.overlay.innerHTML = html || '';
    }

    setExtra(html) {
        this.extra.innerHTML = html || '';
    }

    _animateZoom(e) {
        if (!this._originLatLng) return;
        const scale = this.map.getZoomScale(e.zoom);
        const offset = this.map._latLngToNewLayerPoint(this._originLatLng, e.zoom, e.center);
        L.DomUtil.setTransform(this.svg, offset, scale);
    }
}
