/**
 * context-menu.js
 * Simple custom context menu.
 */
export class ContextMenu {
    constructor() {
        this.element = null;
        this.activeEvent = null;

        // Close on click anywhere else
        document.addEventListener('click', () => this.hide());
        document.addEventListener('contextmenu', (e) => {
            if (this.element) this.hide();
        });
    }

    show(x, y, items) {
        this.hide();

        this.element = document.createElement('div');
        this.element.className = 'context-menu';
        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'menu-item';
            div.textContent = item.label;
            div.onclick = (e) => {
                e.stopPropagation(); // Prevent document click hiding immediately
                this.hide();
                item.action();
            };
            this.element.appendChild(div);
        });

        document.body.appendChild(this.element);
    }

    hide() {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }
}
