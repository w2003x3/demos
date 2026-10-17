/**
 * history.js
 * 快照式 Undo/Redo 與 localStorage 自動儲存。
 * 監聽 store 的資料變更事件,防抖後以 exportJSON 拍快照;
 * undo/redo 直接 importJSON 還原(各圖層已監聽 STATE_LOADED 重繪)。
 */
import { store } from './store.js';
import { bus } from './event-bus.js';

const AUTOSAVE_KEY = 'metro-v2-autosave';
const MAX_HISTORY = 50;

const MUTATION_EVENTS = [
    'STATE_CHANGED', 'STATE_LOADED',
    'STATION_ADDED', 'STATION_UPDATED', 'STATION_DELETED',
    'LINE_ADDED', 'LINE_UPDATED', 'LINE_DELETED',
    'CORRIDOR_ADDED', 'CORRIDOR_DELETED'
];

class History {
    constructor() {
        this.stack = [];
        this.pointer = -1;
        this.suppress = false; // undo/redo 還原中,不記快照
        this.timer = null;

        MUTATION_EVENTS.forEach(ev => bus.on(ev, () => this.scheduleSnapshot()));
    }

    /** 應用啟動時呼叫:還原自動儲存並建立初始快照 */
    init() {
        const saved = localStorage.getItem(AUTOSAVE_KEY);
        if (saved) {
            try {
                this.suppress = true;
                store.importJSON(saved);
            } catch (e) {
                console.warn('自動儲存還原失敗,已忽略', e);
            } finally {
                this.suppress = false;
            }
        }
        this.pushSnapshot();
    }

    scheduleSnapshot() {
        if (this.suppress) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.pushSnapshot(), 300);
    }

    pushSnapshot() {
        const json = store.exportJSON();
        if (this.stack[this.pointer] === json) return;

        // 丟棄 redo 分支
        this.stack = this.stack.slice(0, this.pointer + 1);
        this.stack.push(json);
        if (this.stack.length > MAX_HISTORY) this.stack.shift();
        this.pointer = this.stack.length - 1;

        this._autosave(json);
        this._notify();
    }

    canUndo() { return this.pointer > 0; }
    canRedo() { return this.pointer < this.stack.length - 1; }

    undo() {
        if (!this.canUndo()) return;
        this.pointer--;
        this._apply(this.stack[this.pointer]);
    }

    redo() {
        if (!this.canRedo()) return;
        this.pointer++;
        this._apply(this.stack[this.pointer]);
    }

    _apply(json) {
        clearTimeout(this.timer);
        this.suppress = true;
        try {
            store.importJSON(json);
        } finally {
            this.suppress = false;
        }
        this._autosave(json);
        this._notify();
    }

    _autosave(json) {
        try {
            localStorage.setItem(AUTOSAVE_KEY, json);
        } catch (e) {
            // localStorage 滿(或隱私模式)時放棄自動儲存,不影響操作
        }
    }

    _notify() {
        bus.emit('HISTORY_CHANGED', { canUndo: this.canUndo(), canRedo: this.canRedo() });
    }
}

export const history = new History();
