// 教學:頁面式(暫停遊戲、附示意圖)與互動式(逐步檢查玩家操作,攀爬用)。

export class Tutorial {
  constructor(game) {
    this.g = game;
    this.el = game.ui.$('tut');
    this.guide = null;
  }
  seen(key) { return !!this.g.store.get('tut', {})[key]; }
  markSeen(key) { const t = this.g.store.get('tut', {}); t[key] = 1; this.g.store.set('tut', t); }
  get open() { return !!this.el.innerHTML; }

  /** 頁面式教學。pages: [{ title, html, visual }];onDone 在關閉時呼叫。 */
  pages(key, pages, { onDone, finishLabel = '開始', extra } = {}) {
    const g = this.g;
    let i = 0;
    const render = () => {
      const p = pages[i];
      this.el.innerHTML = `
        <div class="modal-wrap">
          <div class="modal tut" role="dialog" aria-label="教學:${p.title}">
            <div class="tut-head"><span class="kicker" style="letter-spacing:3px;font-size:13px">教學 ${i + 1} / ${pages.length}</span>
              <div class="tut-dots">${pages.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div></div>
            <h2>${p.title}</h2>
            ${p.visual ? `<div class="tut-visual">${p.visual}</div>` : ''}
            <div class="tut-body">${p.html}</div>
            <div class="row" style="justify-content:space-between">
              <button class="btn" id="t-skip">${i === pages.length - 1 ? '關閉' : '跳過'}</button>
              <div class="row">
                ${i > 0 ? '<button class="btn" id="t-prev">上一步</button>' : ''}
                ${i === pages.length - 1 && extra ? `<button class="btn" id="t-extra">${extra.label}</button>` : ''}
                <button class="btn primary" id="t-next">${i === pages.length - 1 ? finishLabel : '下一步'}</button>
              </div>
            </div>
          </div>
        </div>`;
      const q = (s) => this.el.querySelector(s);
      q('#t-next').addEventListener('click', () => { if (i < pages.length - 1) { i++; render(); } else close(); });
      q('#t-prev')?.addEventListener('click', () => { i--; render(); });
      q('#t-skip').addEventListener('click', close);
      q('#t-extra')?.addEventListener('click', () => { close(); extra.fn(); });
      q('#t-next').focus();
    };
    const close = () => {
      this.el.innerHTML = '';
      this.markSeen(key);
      g.clock.getDelta();
      onDone && onDone();
    };
    this.closeFn = close;
    render();
  }

  /** 互動式教學:steps = [{ title, text, check() → bool, enter?() }],不暫停遊戲。 */
  guided(key, steps, onDone) {
    this.guide = { key, steps, i: -1, onDone, okT: 0 };
    this.next();
  }
  next() {
    const G = this.guide;
    G.i++;
    if (G.i >= G.steps.length) { this.endGuide(true); return; }
    const s = G.steps[G.i];
    s.enter && s.enter();
    this.g.ui.$('guide').innerHTML = `
      <div class="guide" role="status" aria-live="polite">
        <div class="tut-head"><span class="kicker" style="letter-spacing:3px;font-size:12px">攀爬練習 ${G.i + 1} / ${G.steps.length}</span>
          <div class="tut-dots">${G.steps.map((_, k) => `<i class="${k < G.i ? 'done' : k === G.i ? 'on' : ''}"></i>`).join('')}</div></div>
        <div class="guide-title">${s.title}</div>
        <div class="guide-text">${s.text}</div>
        <div class="row" style="justify-content:flex-end"><button class="btn" id="g-skip" style="min-height:36px;font-size:13px">跳過練習</button></div>
      </div>`;
    this.g.ui.$('guide').querySelector('#g-skip').addEventListener('click', () => this.endGuide(false));
  }
  endGuide(done) {
    const G = this.guide;
    if (!G) return;
    this.guide = null;
    this.g.ui.$('guide').innerHTML = '';
    this.markSeen(G.key);
    G.onDone && G.onDone(done);
  }
  update(dt) {
    const G = this.guide;
    if (!G || this.g.paused) return;
    const s = G.steps[G.i];
    if (G.okT > 0) {
      G.okT -= dt;
      if (G.okT <= 0) this.next();
      return;
    }
    if (s.check && s.check()) {
      G.okT = 0.9;
      this.g.audio.correct();
      const el = this.g.ui.$('guide').querySelector('.guide');
      if (el) el.classList.add('ok');
    }
  }
  closeAll() {
    if (this.open) this.el.innerHTML = '';
    if (this.guide) { this.guide = null; this.g.ui.$('guide').innerHTML = ''; }
  }
}

// ── 示意圖 ──
const key = (x, y, k, label, color = '#7fe0d0') => `
  <g transform="translate(${x} ${y})"><rect x="-22" y="-22" width="44" height="44" rx="8" fill="#0b1626" stroke="${color}" stroke-width="2"/>
  <text y="7" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="700" font-size="22" fill="${color}">${k}</text>
  <text y="40" text-anchor="middle" font-size="12" fill="#a9bccb">${label}</text></g>`;

export const VIS = {
  climber: `<svg viewBox="0 0 420 230" width="100%" role="img" aria-label="四肢按鍵位置:左手 Q、右手 E、左腳 Z、右腳 C">
    <rect x="130" y="6" width="160" height="218" rx="6" fill="#1f5a60" opacity=".55"/>
    <g stroke="#9fb4c4" stroke-opacity=".35"><line x1="170" y1="6" x2="170" y2="224"/><line x1="250" y1="6" x2="250" y2="224"/><line x1="130" y1="80" x2="290" y2="80"/><line x1="130" y1="160" x2="290" y2="160"/></g>
    <circle cx="210" cy="72" r="13" fill="#f2c12e"/>
    <rect x="194" y="86" width="32" height="56" rx="10" fill="#e2553b"/>
    <path d="M196 96 L170 46" stroke="#e2553b" stroke-width="10" stroke-linecap="round"/>
    <path d="M224 96 L248 70" stroke="#e2553b" stroke-width="10" stroke-linecap="round"/>
    <path d="M200 140 L186 190" stroke="#2b3a4e" stroke-width="11" stroke-linecap="round"/>
    <path d="M220 140 L240 176" stroke="#2b3a4e" stroke-width="11" stroke-linecap="round"/>
    <circle cx="170" cy="44" r="7" fill="#f5c76a"/><circle cx="248" cy="68" r="7" fill="#7fe0d0"/>
    <circle cx="186" cy="192" r="7" fill="#7fe0d0"/><circle cx="240" cy="178" r="7" fill="#f5c76a"/>
    ${key(80, 44, 'Q', '左手', '#f5c76a')}${key(340, 68, 'E', '右手')}${key(80, 180, 'Z', '左腳')}${key(340, 170, 'C', '右腳', '#f5c76a')}
    <path d="M104 44 H160 M316 68 H258 M104 182 H176 M316 172 H250" stroke="#3b5672" stroke-dasharray="4 4"/>
  </svg>
  <div class="legend"><span><i style="background:#7fe0d0"></i>綠色 = 抓住牆面</span><span><i style="background:#f5c76a"></i>黃色 = 已放開、正在往上伸</span></div>`,
  rhythm: `<svg viewBox="0 0 420 120" width="100%" role="img" aria-label="攀爬節奏:同時按住 Q 和 C,放開;再同時按住 E 和 Z,放開">
    ${key(50, 40, 'Q', '左手', '#f5c76a')}<text x="88" y="47" fill="#eef4f7" font-size="20">+</text>${key(126, 40, 'C', '右腳', '#f5c76a')}
    <text x="186" y="47" fill="#7fe0d0" font-size="20">→ 放開 →</text>
    ${key(294, 40, 'E', '右手', '#f5c76a')}<text x="332" y="47" fill="#eef4f7" font-size="20">+</text>${key(370, 40, 'Z', '左腳', '#f5c76a')}
    <text x="210" y="112" text-anchor="middle" fill="#a9bccb" font-size="13">按住約半秒讓手腳伸到高處,放開抓住;兩組輪流,身體就會往上</text>
  </svg>`,
  grip: `<div class="grip-table">
    <div><b>4 肢抓住</b><span class="up">握力恢復 ▲▲</span></div>
    <div><b>3 肢抓住</b><span class="up">微幅恢復 ▲</span></div>
    <div><b>2 肢抓住</b><span class="down">慢慢下降 ▼</span></div>
    <div><b>1 肢抓住</b><span class="down">快速下降 ▼▼▼</span></div>
    <div><b>0 肢</b><span class="down">立刻墜落!</span></div></div>`,
  race: `<svg viewBox="0 0 420 130" width="100%" role="img" aria-label="左右腳交替:J、K、J、K">
    ${key(60, 44, 'J', '左腳')}${key(150, 44, 'K', '右腳')}${key(240, 44, 'J', '左腳')}${key(330, 44, 'K', '右腳')}
    <path d="M84 44 H124 M174 44 H214 M264 44 H304" stroke="#7fe0d0" stroke-width="2" marker-end="url(#ar)"/>
    <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#7fe0d0"/></marker></defs>
    <text x="210" y="120" text-anchor="middle" fill="#ff8a65" font-size="13">同一隻腳連按兩次 = 踉蹌(暫停 0.5 秒)</text>
  </svg>`,
  hr: `<div class="zone" style="height:16px"><span class="z1"></span><span class="z2"></span><span class="z3"></span></div>
    <div class="kv small" style="margin-top:6px"><span>有氧區 · 效率 100%</span><span>乳酸閾值 · 開始疲勞</span><span>極限 · 效率大減</span></div>`,
  click: `<svg viewBox="0 0 420 120" width="100%" role="img" aria-label="點地面走過去,點物件自動互動">
    <ellipse cx="110" cy="92" rx="42" ry="12" fill="none" stroke="#7fe0d0" stroke-width="3"/>
    <path d="M100 30 l0 34 l9 -8 l7 15 l6 -3 l-7 -14 l12 -1 z" fill="#eef4f7"/>
    <text x="110" y="20" text-anchor="middle" fill="#7fe0d0" font-size="14">點地面 → 走過去</text>
    <rect x="270" y="56" width="90" height="36" rx="4" fill="#3e2a1d"/><rect x="266" y="52" width="98" height="8" fill="#d8d2c6"/>
    <ellipse cx="315" cy="104" rx="42" ry="10" fill="none" stroke="#f5c76a" stroke-width="3"/>
    <path d="M330 18 l0 34 l9 -8 l7 15 l6 -3 l-7 -14 l12 -1 z" fill="#eef4f7"/>
    <text x="315" y="12" text-anchor="middle" fill="#f5c76a" font-size="14">點櫃台 → 自動點咖啡</text>
  </svg>`,
  heli: `<div class="keys-grid">
    <div><kbd>W</kbd><kbd>S</kbd><span>升高 / 降低</span></div>
    <div><kbd>A</kbd><kbd>D</kbd><span>靠近 / 遠離 101</span></div>
    <div><kbd>Q</kbd><kbd>E</kbd><span>減速 / 加速</span></div>
    <div><kbd>Space</kbd><span>懸停 / 繼續環繞</span></div></div>`,
  glide: `<svg viewBox="0 0 420 140" width="100%" role="img" aria-label="滑翔操作:W 壓機頭加速,S 拉起機頭減速,A D 轉彎">
    <path d="M150 70 L270 70 M210 50 L210 90" stroke="#f5c76a" stroke-width="6" stroke-linecap="round"/>
    <path d="M120 66 L300 66 L290 74 L130 74 Z" fill="#c62828"/>
    ${key(210, 22, 'W', '')}${key(210, 122, 'S', '')}${key(80, 70, 'A', '')}${key(340, 70, 'D', '')}
    <text x="250" y="27" fill="#a9bccb" font-size="12">壓機頭:加速、下降</text>
    <text x="250" y="127" fill="#a9bccb" font-size="12">拉機頭:減速、滑更遠(太慢會失速)</text>
    <text x="54" y="104" fill="#a9bccb" font-size="12">左轉</text><text x="326" y="104" fill="#a9bccb" font-size="12">右轉</text>
  </svg>`
};
