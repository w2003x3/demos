// 廚房音效(WebAudio 即時合成):油炸/熱炒/煎台的滋滋聲(持續)、滷鍋咕嘟聲、切菜聲、完成提示鈴、燒焦警報。
export class KitchenSfx {
  constructor(sfx) {
    this.sfx = sfx;
    this.loops = {};
  }
  get ctx() { return this.sfx.ctx; }
  get out() { return this.sfx.master; }

  _noise(seconds = 2) {
    const ctx = this.ctx, len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** 持續音:kind = fry(油炸)/stir(熱炒)/griddle(煎)/boil(滷鍋);level 0~1 */
  loop(key, kind, level) {
    if (!this.ctx) return;
    let L = this.loops[key];
    if (!L && level <= 0) return;
    if (!L) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this._noise(2);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = { fry: 3200, stir: 2200, griddle: 4200, boil: 380 }[kind];
      f.Q.value = kind === 'boil' ? 2.5 : 0.6;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.out);
      src.start();
      L = this.loops[key] = { src, g, kind, f };
    }
    const t = this.ctx.currentTime;
    const base = { fry: 0.16, stir: 0.2, griddle: 0.1, boil: 0.25 }[L.kind];
    // 油炸與熱炒的聲音有起伏
    const wobble = L.kind === 'stir' ? 0.6 + Math.random() * 0.6 : L.kind === 'boil' ? 0.4 + Math.random() * 0.8 : 0.85 + Math.random() * 0.3;
    L.g.gain.setTargetAtTime(base * level * wobble, t, 0.08);
  }

  stopAll() {
    for (const L of Object.values(this.loops)) { try { L.src.stop(); } catch { /* 已停止 */ } L.g.disconnect(); }
    this.loops = {};
  }

  /** 切菜:刀落在砧板上的短促聲 */
  chop() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noise(0.08);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.06);
    og.gain.setValueAtTime(0.35, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(og).connect(this.out); o.start(t); o.stop(t + 0.1);
  }

  /** 完成提示鈴(廚房計時器) */
  ding() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [f, d] of [[1568, 0], [1568, 0.25]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.6);
      o.connect(g).connect(this.out); o.start(t + d); o.stop(t + d + 0.7);
    }
  }

  /** 燒焦警報 */
  alarm() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.12, t + i * 0.22);
      g.gain.setValueAtTime(0, t + i * 0.22 + 0.12);
      o.connect(g).connect(this.out); o.start(t + i * 0.22); o.stop(t + i * 0.22 + 0.14);
    }
  }

  /** 放東西(便當放到架上、食材放進盒子) */
  place(pitch = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(520 * pitch, t); o.frequency.exponentialRampToValueAtTime(260 * pitch, t + 0.08);
    g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.14);
  }
}
