/**
 * context-menu.js
 * 單例情境選單。items: { label, action, danger } | { head } | { sep: true }
 */
let current = null;

function hide() {
    if (current) { current.remove(); current = null; }
}

document.addEventListener('mousedown', (e) => {
    if (current && !current.contains(e.target)) hide();
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
window.addEventListener('blur', hide);

export function showContextMenu(x, y, items) {
    hide();
    const el = document.createElement('div');
    el.className = 'context-menu';
    items.forEach(item => {
        if (item.sep) {
            el.appendChild(Object.assign(document.createElement('div'), { className: 'menu-sep' }));
        } else if (item.head) {
            el.appendChild(Object.assign(document.createElement('div'), { className: 'menu-head', textContent: item.head }));
        } else {
            const d = document.createElement('div');
            d.className = 'menu-item' + (item.danger ? ' danger' : '');
            d.textContent = item.label;
            d.onclick = (e) => { e.stopPropagation(); hide(); item.action(); };
            el.appendChild(d);
        }
    });
    document.body.appendChild(el);
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
    el.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
    current = el;
}

export { hide as hideContextMenu };
