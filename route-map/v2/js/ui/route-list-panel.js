import { store } from '../core/store.js';
import { bus } from '../core/event-bus.js';

export class RouteListPanel {
    constructor() {
        this.visible = false;
        this.createDOM();
        this.bindEvents();
        // 預設先畫一次空的
        this.render();
    }

    createDOM() {
        // Create the container
        this.panel = document.createElement('div');
        this.panel.className = 'route-panel';
        
        // Create header (draggable area)
        this.header = document.createElement('div');
        this.header.className = 'route-panel-header';
        this.header.innerHTML = `<span>📃 路線行駛區間</span><button class="close-btn" title="關閉">&times;</button>`;
        
        // Create content area
        this.content = document.createElement('div');
        this.content.className = 'route-panel-content';

        // Create legend area
        this.legend = document.createElement('div');
        this.legend.className = 'route-panel-legend';
        this.legend.innerHTML = `
            <div class="legend-grid">
                <div class="legend-item"><span class="legend-icon normal-station"></span>一般車站</div>
                <div class="legend-item"><span class="legend-icon transfer-station"></span>轉乘車站</div>
                <div class="legend-item"><span class="legend-icon in-station"></span>站內連通</div>
                <div class="legend-item"><span class="legend-icon out-station"></span>站外轉乘</div>
            </div>
        `;
        
        this.panel.appendChild(this.header);
        this.panel.appendChild(this.content);
        this.panel.appendChild(this.legend);
        
        // Initially hidden
        this.panel.style.display = 'none';
        
        // Default position
        this.panel.style.top = '80px';
        this.panel.style.right = '20px';

        // Append to the specific layer that has pointer-events: none but we allow pointer-events: auto on our panel
        document.getElementById('ui-layer').appendChild(this.panel);

        // Bind drag logic
        this.initDrag();

        // Bind close button
        this.header.querySelector('.close-btn').addEventListener('click', () => {
            this.hide();
        });
    }

    initDrag() {
        let isDragging = false;
        let startX, startY, initialX, initialY;

        this.header.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('close-btn')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = this.panel.getBoundingClientRect();
            // Get position relative to the parent #ui-layer which covers the screen
            initialX = this.panel.offsetLeft;
            initialY = this.panel.offsetTop;
            
            document.body.style.userSelect = 'none';
        });

        // Use global listeners to allow dragging outside the header bounds
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            this.panel.style.left = `${initialX + dx}px`;
            this.panel.style.top = `${initialY + dy}px`;
            
            // Discard right/bottom anchors so left/top takes over completely
            this.panel.style.right = 'auto';
            this.panel.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.userSelect = '';
            }
        });
        
        // Stop all pointer events from reaching down into the Leaflet map
        this.panel.addEventListener('mousedown', e => e.stopPropagation());
        this.panel.addEventListener('dblclick', e => e.stopPropagation());
        this.panel.addEventListener('wheel', e => e.stopPropagation(), {passive:false});
    }

    bindEvents() {
        const triggerRender = () => {
            if (this.visible) this.render();
        };

        bus.on('LINE_ADDED', triggerRender);
        bus.on('LINE_UPDATED', triggerRender);
        bus.on('LINE_DELETED', triggerRender);
        bus.on('STATION_UPDATED', triggerRender);
        bus.on('STATION_DELETED', triggerRender);
        bus.on('STATE_LOADED', triggerRender);
    }

    toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    show() {
        this.visible = true;
        this.panel.style.display = 'flex';
        this.render();
        bus.emit('ROUTE_PANEL_TOGGLED', true);
    }

    hide() {
        this.visible = false;
        this.panel.style.display = 'none';
        bus.emit('ROUTE_PANEL_TOGGLED', false);
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

    render() {
        const lines = store.getLines();
        if (lines.length === 0) {
            this.content.innerHTML = '<div class="route-panel-empty">目前沒有路線，請先建立</div>';
            return;
        }

        let html = '';
        lines.forEach(line => {
            const stationNodes = line.nodes.filter(n => n.type === 'station');
            
            let terminalsStr = '<span style="color:#aaa">空路線 (無車站)</span>';
            if (stationNodes.length === 1) {
                const station = store.getStations().find(s => s.id === stationNodes[0].id);
                terminalsStr = station ? `${station.name} (單站)` : '未知車站';
            } else if (stationNodes.length > 1) {
                const first = store.getStations().find(s => s.id === stationNodes[0].id);
                const last = store.getStations().find(s => s.id === stationNodes[stationNodes.length - 1].id);
                if (first && last) {
                    if (first.id === last.id) {
                         terminalsStr = `${first.name} (環狀線)`;
                    } else {
                         terminalsStr = `${first.name} <span style="margin: 0 4px; color:#aaa">↔</span> ${last.name}`;
                    }
                }
            }

            const textColor = this.getContrastColor(line.color);
            const codeStr = line.code 
                ? `<span class="route-item-code" style="background-color: ${line.color}; color: ${textColor};">${line.code}</span>` 
                : `<span class="route-item-code" style="background-color: #ddd; color: #666;">無</span>`;
            
            html += `
                <div class="route-panel-item">
                    <div class="route-item-color" style="background-color: ${line.color};"></div>
                    <div class="route-item-info">
                        <div class="route-item-name">${codeStr} ${line.name}</div>
                        <div class="route-item-terminals">${terminalsStr}</div>
                    </div>
                </div>
            `;
        });

        this.content.innerHTML = html;
    }
}
