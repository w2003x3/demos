// DOM 介面:HUD 容器、提示、字幕、淡出、結算與心算降落傘視窗。
export class UI {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud" id="hud"></div>
      <div class="vignette" id="vig"></div>
      <div class="banner" id="banner" style="opacity:0"></div>
      <div class="prompt" id="prompt" style="display:none"></div>
      <div class="subtitle" id="sub" style="opacity:0"></div>
      <div class="center-big" id="big"></div>
      <div id="layer"></div>
      <div class="fade" id="fade"></div>`;
    this.$ = (id) => root.querySelector('#' + id);
    this.hudEl = this.$('hud');
    this.layer = this.$('layer');
    this._bannerT = 0;
    this._subT = 0;
  }
  hud(html) { this.hudEl.innerHTML = html; return this.hudEl; }
  q(sel) { return this.root.querySelector(sel); }
  set(id, text) { const e = this.root.querySelector('#' + id); if (e && e.textContent !== String(text)) e.textContent = text; }
  style(id, prop, v) { const e = this.root.querySelector('#' + id); if (e) e.style[prop] = v; }
  banner(text, warn = false, secs = 3) {
    const b = this.$('banner');
    b.textContent = text;
    b.className = 'banner' + (warn ? ' warn' : '');
    b.style.opacity = 1;
    this._bannerT = secs;
  }
  subtitle(text, secs = 4) {
    if (!text) return;
    const s = this.$('sub');
    s.textContent = text;
    s.style.opacity = 1;
    this._subT = secs;
  }
  prompt(text) {
    const p = this.$('prompt');
    if (!text) { p.style.display = 'none'; return; }
    p.style.display = '';
    if (p.dataset.t !== text) { p.dataset.t = text; p.innerHTML = text; }
  }
  big(text) { this.$('big').textContent = text || ''; }
  fade(v) { this.$('fade').style.opacity = v; }
  danger(v) { this.$('vig').style.boxShadow = `inset 0 0 ${120 + v * 120}px rgba(255,60,40,${v * 0.6})`; }
  modal(html) {
    this.layer.innerHTML = html ? `<div class="modal-wrap">${html}</div>` : '';
    return this.layer;
  }
  clear() { this.hud(''); this.modal(''); this.prompt(''); this.big(''); this.danger(0); }
  update(dt) {
    if (this._bannerT > 0 && (this._bannerT -= dt) <= 0) this.$('banner').style.opacity = 0;
    if (this._subT > 0 && (this._subT -= dt) <= 0) this.$('sub').style.opacity = 0;
  }
}

export const fmtTime = (s) => {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(2).padStart(5, '0')}`;
};

/** 心算題:回傳 { text, answer }。難度依高度略增。 */
export function makeQuestion(level = 0) {
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const t = Math.floor(Math.random() * (level > 0.5 ? 4 : 3));
  if (t === 0) { const a = R(12, 89), b = R(11, 79); return { text: `${a} + ${b}`, answer: a + b }; }
  if (t === 1) { const a = R(40, 99), b = R(11, a - 5); return { text: `${a} − ${b}`, answer: a - b }; }
  if (t === 2) { const a = R(3, 9), b = R(6, 19); return { text: `${a} × ${b}`, answer: a * b }; }
  const b = R(3, 9), q = R(4, 15); return { text: `${b * q} ÷ ${b}`, answer: q };
}

/**
 * 顯示心算降落傘題目。secs 秒內輸入答案按 Enter。
 * 回傳 Promise<boolean>(答對 true)。
 */
export function askQuiz(ui, audio, level, secs = 5) {
  return new Promise((resolve) => {
    const q = makeQuestion(level);
    const layer = ui.modal(`
      <div class="quiz" role="dialog" aria-label="心算降落傘">
        <div style="font-size:15px;color:#f5c76a;font-weight:700">墜落中!5 秒內答對才能打開降落傘</div>
        <div class="q">${q.text} = ?</div>
        <input id="qa" inputmode="numeric" autocomplete="off" aria-label="答案">
        <div class="timer"><i id="qt" style="width:100%"></i></div>
        <div class="pad">${[7, 8, 9, '⌫', 4, 5, 6, 0, 1, 2, 3, '確定'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}</div>
      </div>`);
    const input = layer.querySelector('#qa');
    const bar = layer.querySelector('#qt');
    setTimeout(() => input.focus(), 30);
    let done = false;
    const t0 = performance.now();
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearInterval(iv);
      ui.modal('');
      ok ? audio.correct() : audio.wrong();
      resolve(ok);
    };
    const submit = () => finish(input.value.trim() !== '' && Number(input.value) === q.answer);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); e.stopPropagation(); });
    layer.querySelectorAll('.pad button').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k;
      if (k === '⌫') input.value = input.value.slice(0, -1);
      else if (k === '確定') submit();
      else input.value += k;
      audio.click();
    }));
    let lastSec = secs;
    const iv = setInterval(() => {
      const el = (performance.now() - t0) / 1000;
      bar.style.width = `${Math.max(0, 1 - el / secs) * 100}%`;
      const s = Math.ceil(secs - el);
      if (s < lastSec && s > 0) { lastSec = s; audio.beep(); }
      if (el >= secs) finish(false);
    }, 50);
  });
}
