/**
 * toast.js
 * 底部提示,取代 alert/confirm。可附動作按鈕(預設「復原」)。
 */
import { history } from '../core/history.js';

const host = () => document.getElementById('toast-host');

/**
 * toast('已刪除', { undo: true })
 * toast('要合併嗎?', { action: { label: '合併', run: fn } })
 */
export function toast(message, opts = {}) {
    const el = document.createElement('div');
    el.className = 'toast' + (opts.warn ? ' warn' : '');
    const text = document.createElement('span');
    text.className = 'grow';
    text.textContent = message;
    el.appendChild(text);

    const actions = [];
    if (opts.undo) actions.push({ label: '復原', run: () => history.undo() });
    if (opts.action) actions.push(opts.action);
    actions.forEach(a => {
        const b = document.createElement('button');
        b.textContent = a.label;
        b.onclick = () => { a.run(); el.remove(); };
        el.appendChild(b);
    });

    host().appendChild(el);
    while (host().children.length > 3) host().firstChild.remove();
    setTimeout(() => el.remove(), opts.duration || (actions.length ? 6000 : 2800));
    return el;
}
