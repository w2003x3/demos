const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Tab']);

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.queue = []; // 本幀依序按下的鍵(同一幀按多個數字鍵時不遺漏、不亂序)
    addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      this.queue.push(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }

  isDown(...codes) { return codes.some((c) => this.down.has(c)); }
  wasPressed(...codes) { return codes.some((c) => this.pressed.has(c)); }

  /** 本幀按下的數字鍵(1~9),沒有則 0。 */
  digit() {
    for (let i = 1; i <= 9; i++) if (this.pressed.has(`Digit${i}`) || this.pressed.has(`Numpad${i}`)) return i;
    return 0;
  }

  /** 本幀依序輸入的編輯鍵:'0'~'9' 與 'Backspace'(結帳機台輸入金額用)。 */
  typed() {
    const out = [];
    for (const code of this.queue) {
      const m = code.match(/^(?:Digit|Numpad)(\d)$/);
      if (m) out.push(m[1]);
      else if (code === 'Backspace') out.push('Backspace');
    }
    return out;
  }

  endFrame() {
    this.pressed.clear();
    this.queue.length = 0;
  }
}
