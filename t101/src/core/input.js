// 鍵盤、滑鼠拖曳(轉視角)、滾輪(縮放)與觸控虛擬按鍵。
export class Input {
  constructor(el) {
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.drag = { dx: 0, dy: 0 };
    this.wheel = 0;
    this.clicks = [];
    this.enabled = true;
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.code;
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    addEventListener('blur', () => { for (const k of this.down) this.released.add(k); this.down.clear(); });
    let last = null, start = null;
    el.addEventListener('pointerdown', (e) => {
      last = [e.clientX, e.clientY];
      start = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, button: e.button };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!last) return;
      this.drag.dx += e.clientX - last[0];
      this.drag.dy += e.clientY - last[1];
      if (start) start.moved += Math.abs(e.clientX - last[0]) + Math.abs(e.clientY - last[1]);
      last = [e.clientX, e.clientY];
    });
    const end = () => { last = null; start = null; };
    // 點擊(沒有拖曳)→ 記錄為 NDC 座標,給點擊移動用
    el.addEventListener('pointerup', (e) => {
      if (start && start.moved < 8 && performance.now() - start.t < 500 && start.button === 0) {
        const r = el.getBoundingClientRect();
        this.clicks.push({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1, dbl: performance.now() - (this._lastClick || 0) < 350 });
        this._lastClick = performance.now();
      }
      end();
    });
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }
  /** 虛擬按鍵(觸控按鈕)用。 */
  virtual(code, isDown) {
    if (isDown) { if (!this.down.has(code)) this.pressed.add(code); this.down.add(code); }
    else { this.down.delete(code); this.released.add(code); }
  }
  is(...codes) { return codes.some((c) => this.down.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }
  up(...codes) { return codes.some((c) => this.released.has(c)); }
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.drag.dx = this.drag.dy = 0;
    this.wheel = 0;
    this.clicks.length = 0;
  }
}
