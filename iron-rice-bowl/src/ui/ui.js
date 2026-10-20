// DOM 介面:HUD、LED 跑馬燈(廣播)、漫畫對話框(人物台詞)、操作面板、各種畫面。
// 對話框是螢幕空間元素:每幀把說話者頭部的 3D 座標投影到螢幕,因此永遠正對畫面,不受視角旋轉影響。
import * as THREE from 'three';

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
/** 提示用:鍵盤按鍵與畫面按鈕的對照(與 HUD 觸控按鈕一致) */
const PROMPT_KEYS = {
  KeyE: { kb: 'E', btn: '服務' }, KeyF: { kb: 'F', btn: '送餐' }, KeyQ: { kb: 'Q', btn: '推銷' },
  KeyR: { kb: 'R', btn: '補貨' }, Space: { kb: 'Space', btn: '↻ 迴轉' },
};
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export class UI {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div id="hud" class="hidden">
        <div class="panel hud-left">
          <div class="train-no"><span id="h-train"></span> <small>往</small> <span id="h-dest"></span></div>
          <div class="row"><span class="lbl">下一站</span><span id="h-next" class="big"></span></div>
          <div class="row"><span class="lbl">到站</span><span id="h-eta-next"></span><span class="lbl">終點</span><span id="h-eta-final"></span></div>
          <div class="route"><div class="route-bar"><div id="h-route-fill"></div></div><div id="h-stops"></div></div>
          <div class="row small"><span id="h-speed"></span> km/h · 第 <span id="h-car"></span> 車</div>
        </div>
        <div class="panel hud-right">
          <div class="trips"><span class="lbl">趟數</span><span id="h-trips"></span><span id="h-dir" class="tag"></span></div>
          <div class="row"><span class="lbl">營業額</span><span id="h-rev" class="big">$0</span></div>
          <div class="row"><span class="lbl">滿意度</span><div class="meter"><div id="h-sat"></div></div></div>
          <div id="h-stock" class="stock"></div>
          <div id="h-tickets" class="tickets"></div>
        </div>
        <div id="marquee" class="led"><div class="led-inner"><span id="marquee-text"></span></div></div>
        <div id="minimap" class="panel"></div>
        <div id="prompt" class="prompt hidden"></div>
        <div id="dialog" class="dialog hidden"></div>
        <div id="touch" class="touch">
          <div class="t-pad">
            <button class="t-btn" data-hold="KeyW" title="前進(W)">▲<small>前進</small></button>
            <button class="t-btn fast" data-hold="KeyW ShiftLeft" title="快速前進(Shift+W)">⏩<small>快速</small></button>
            <button class="t-btn" data-hold="KeyS" title="後退(S)">▼<small>後退</small></button>
          </div>
          <div class="t-acts">
            <button class="t-btn primary" data-hold="KeyE" title="服務 / 處理狀況(E)">E<small>服務</small></button>
            <button class="t-btn" data-key="KeyQ" title="推銷(Q)">Q<small>推銷</small></button>
            <button class="t-btn" data-key="KeyF" title="送預訂便當(F)">F<small>送餐</small></button>
            <button class="t-btn" data-key="KeyR" title="補貨(R)">R<small>補貨</small></button>
            <button class="t-btn" data-key="Space" title="迴轉推車(Space)">↻<small>迴轉</small></button>
          </div>
          <div class="t-top">
            <button class="t-mini" data-key="KeyP" title="暫停/設定(P)">⚙</button>
          </div>
        </div>
        <div class="help">W/↑ 推車 · Shift+W 快速 · S/↓ 後退 · Space 迴轉 · E 互動 · F 送餐 · Q 推銷 · R 補貨 · 拖曳看四周 · V 視角 · M 靜音 · P 暫停/設定</div>
      </div>
      <div id="bubbles"></div>
      <div id="toasts"></div>
      <div id="screen" class="screen hidden"></div>
    `;
    this.bubbles = [];
    this.marquee = { idle: '', announcing: false, current: '', until: 0 };
    this._lastHud = 0;
    this._v = new THREE.Vector3();
  }

  /**
   * 畫面上的按鈕 → 虛擬按鍵(與鍵盤同一套邏輯):
   * data-key="Code" 點一下;data-hold="Code Code2" 按住(放開即放開)。
   */
  bindInput(input) {
    this.input = input;
    const holds = new Map();
    const release = (id) => { (holds.get(id) || []).forEach((c) => input.hold(c, false)); holds.delete(id); };
    this.root.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-hold]');
      if (!b) return;
      e.preventDefault();
      const codes = b.dataset.hold.split(' ');
      codes.forEach((c) => input.hold(c, true));
      holds.set(e.pointerId, codes);
      b.classList.add('on');
      const up = () => { release(e.pointerId); b.classList.remove('on'); b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', up); b.removeEventListener('pointerleave', up); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    });
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-key]');
      if (!b || b.disabled) return;
      input.press(b.dataset.key);
    });
    addEventListener('blur', () => [...holds.keys()].forEach(release));
  }

  // -------------------------------------------------------------- 畫面
  showScreen(html, cls = '') {
    const s = $('#screen', this.root);
    s.className = `screen ${cls}`;
    s.innerHTML = html;
    return s;
  }
  hideScreen() { $('#screen', this.root).className = 'screen hidden'; }
  showHud(v) { $('#hud', this.root).classList.toggle('hidden', !v); }

  loading(text, p = null) {
    this.showScreen(`<div class="card center"><h2>${esc(text)}</h2>
      ${p === null ? '' : `<div class="meter wide"><div style="width:${Math.round(p * 100)}%"></div></div>`}</div>`, 'dim');
  }

  /**
   * 整備畫面(任務載入中):顯示模型/語音載入進度,同時可瀏覽今天推車上的便當菜色與飲料;
   * 全部載入完成後「開始服勤」才能按。回傳 { progress(key, p), ready() → Promise(按下開始) }。
   */
  prepare(items, thumbs = {}, opt = {}) {
    const cards = items.map((it) => `
      <div class="food-card">
        ${thumbs[it.id] ? `<img src="${thumbs[it.id]}" alt="${esc(it.name)}">` : '<div class="food-ph">🍱</div>'}
        <div class="food-info">
          <b>${esc(it.name)}</b><span class="price">$${it.price}</span>
          <small>${esc(it.desc || '')}</small>
          ${it.dishes ? `<div class="dishes">${it.dishes.map((d) => `<i>${esc(d)}</i>`).join('')}</div>` : ''}
        </div>
      </div>`).join('');
    const s = this.showScreen(`
      <div class="card tall prep">
        <h2>${esc(opt.title || '列車整備中')}<small>${esc(opt.sub || '今天推車上的菜色')}</small></h2>
        <div class="prep-bars">
          <label>3D 模型 <div class="meter wide"><div data-k="model" style="width:0%"></div></div></label>
          <label>語音 <div class="meter wide"><div data-k="voice" style="width:0%"></div></div></label>
        </div>
        <div class="tall-body food-grid">${cards}</div>
        <div class="actions"><button id="b-go" disabled>載入中…</button></div>
      </div>`, 'dim');
    const btn = $('#b-go', s);
    return {
      progress: (k, p) => { const el = s.querySelector(`[data-k="${k}"]`); if (el) el.style.width = `${Math.round(p * 100)}%`; },
      ready: () => new Promise((res) => {
        btn.disabled = false;
        btn.textContent = `${opt.go || '開始服勤'}(Enter)`;
        const go = () => { removeEventListener('keydown', key); res(); };
        const key = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
        btn.addEventListener('click', go, { once: true });
        addEventListener('keydown', key);
        btn.focus();
      }),
    };
  }

  menu(missions, info, onPick, onToggleMute, onResetCareer) {
    const bars = (list, cls) => list.map((p) => `
      <div class="c-row"><span>${esc(p.label)}</span><div class="meter ${cls}"><div style="width:${(p.ratio * 100).toFixed(0)}%"></div></div>
      <em>${p.value} / ${p.limit}${esc(p.unit)}</em></div>`).join('');
    const c = info.career;
    const last = c.last
      ? `<span class="c-last ${c.last.kind}">最近人事:${esc(c.last.from)} ${esc(c.last.verb)} ${esc(c.last.to)}(${esc(c.last.reason)})</span>` : '';
    const status = `<div class="c-status">目前職位:<b>${esc(c.rank.title)}</b>${c.rank.playable ? '' : '(此職位玩法開發中)'} ${last}</div>`;
    // 還沒擔任過的職位一律顯示「未知」(到達後才揭露職稱與職務)
    const ladder = `<div class="ladder">${c.ranks.map((r, i) => (r.known ? `
      <div class="rung ${i === c.rankIndex ? 'now' : ''} ${i < 2 ? 'low' : ''}" title="${esc(r.duties)}">
        <b>${esc(r.title)}</b><small>${esc(r.duties)}</small>${r.playable || r.clear ? '' : '<i>開發中</i>'}
      </div>` : `
      <div class="rung unknown" title="尚未到達的職位"><b>？？？</b><small>未知職位・到達後揭曉</small></div>`)).join('<span class="arrow">⇄</span>')}</div>`;
    const promoTitle = c.promoteTo ? `升遷 → ${esc(c.promoteTo)}(全部達成)` : '升遷';
    const promoBody = c.promotion.length ? bars(c.promotion, 'good')
      : `<p class="muted-txt">${c.rank.clear ? '已達最高職位,恭喜通關!' : '此職位無法靠升遷離開'}</p>`;
    const demoTitle = c.demoteTo ? `${esc(c.demoteVerb)} → ${esc(c.demoteTo)}(任一達到)` : '降調';
    const demoBody = c.demotion.length ? bars(c.demotion, 'warn') : '<p class="muted-txt">無</p>';
    const s = this.showScreen(`
      <div class="title-block">
        <h1>鐵飯碗</h1>
        <p class="sub">IRON RICE BOWL · 新自強號 EMU3000</p>
      </div>
      <div class="career">
        ${status}
        ${ladder}
        <div class="c-cols">
          <div><h4>${demoTitle}</h4>${demoBody}</div>
          <div><h4>${promoTitle}</h4>${promoBody}</div>
        </div>
        <button id="reset-btn" class="ghost small">${c.rank.id === 'attendant' ? '重置職涯紀錄' : '重新從列車餐服員開始(重置職涯)'}</button>
      </div>
      <div class="missions">
        ${missions.map((m, i) => `
          <button class="mission ${m.locked ? 'locked' : ''}" data-i="${i}" ${m.locked ? 'disabled' : ''}>
            <div class="m-head"><span class="m-title">${esc(m.title)}</span><span class="stars">${'★'.repeat(m.difficulty)}${'☆'.repeat(Math.max(0, 4 - m.difficulty))}</span></div>
            <div class="m-sub">${esc(m.subtitle)}</div>
            <p>${esc(m.brief)}</p>
            ${m.locked ? '<div class="lock">🔒 開發中</div>' : ''}
          </button>`).join('')}
      </div>
      <div class="menu-foot">
        <button id="help-btn" class="ghost">📖 操作說明</button>
        ${`<div class="seg seg-sound" id="sound-seg"><span>🔊 聲音</span>${[['both', '預錄優先'], ['files', '只用預錄'], ['browser', '瀏覽器發音'], ['mute', '靜音']].map(([v, t]) => `<button data-c="${v}" class="${info.sound === v ? 'on' : ''}">${t}</button>`).join('')}</div>`}
        <button id="quality-btn" class="ghost">畫質:${esc(info.quality)}</button>
        ${`<div class="seg" id="curtain-seg"><span>🪟 窗簾</span><button data-v="0" class="${info.curtains ? '' : 'on'}">拉開</button><button data-v="1" class="${info.curtains ? 'on' : ''}">拉下</button></div>`}
        <span class="muted-txt">語音來源:${esc(info.voice)}</span>
      </div>`, 'menu');
    s.querySelectorAll('.mission:not(.locked)').forEach((b) => b.addEventListener('click', () => onPick(missions[+b.dataset.i])));
    this._bindChoice($('#sound-seg', s), info.onSound);
    $('#quality-btn', s).addEventListener('click', (e) => { e.target.textContent = `畫質:${info.onQuality()}`; });
    this._bindSeg($('#curtain-seg', s), () => info.curtains, info.onCurtains, (v) => { info.curtains = v; });
    $('#help-btn', s).addEventListener('click', () => info.onHelp());
    $('#reset-btn', s).addEventListener('click', () => { if (confirm('確定要重置職涯紀錄?')) onResetCareer(); });
  }

  brief(m, onStart, onBack) {
    const ph = m.phases[0];
    if (ph.type === 'kitchen') return this.kitchenBrief(m, onStart, onBack);
    const s = this.showScreen(`
      <div class="card brief tall">
        <h2>${esc(m.title)} <small>${esc(m.subtitle)}</small></h2>
        <p>${esc(m.brief)}</p>
        <table class="kv">
          <tr><th>車次</th><td>${esc(ph.trainNo)}(新自強號 EMU3000)</td></tr>
          <tr><th>服務車廂</th><td>第 ${ph.serviceCars.join('、')} 車</td></tr>
          <tr><th>任務目標</th><td>抵達終點前完成 <b>${ph.tripsRequired}</b> 趟(備餐區 → 區段終點 → 回備餐區 = 1 趟)。沒完成會被列車長趕下車!</td></tr>
          <tr><th>預訂便當</th><td>${ph.preorders || 0} 份,要送到指定車廂座位(送錯、沒送到:扣錢 + 客訴)</td></tr>
        </table>
        <p class="tip">頭上 🍱 = 想買東西(等太久會放棄)、走道 ❗ = 狀況。結帳要<b>心算總金額</b>,少算虧損、多算客訴。<br>
        操作方式見選單或暫停中的「📖 操作說明」。</p>
        <div class="actions"><button class="ghost" id="b-back">返回</button><button id="b-start">開始服勤(Enter)</button></div>
      </div>`, 'dim');
    $('#b-start', s).addEventListener('click', onStart);
    $('#b-back', s).addEventListener('click', onBack);
  }

  kitchenBrief(m, onStart, onBack) {
    const ph = m.phases[0];
    const s = this.showScreen(`
      <div class="card brief tall">
        <h2>${esc(m.title)} <small>${esc(m.subtitle)}</small></h2>
        <p>${esc(m.brief)}</p>
        <table class="kv">
          <tr><th>任務目標</th><td>出車前 <b>${Math.round(ph.timeLimit / 60)} 分鐘</b>內做好 <b>${ph.quota}</b> 個便當(製作單隨機:排骨/雞腿/素食,做完一個才來下一個)</td></tr>
          <tr><th>組裝順序</th><td>便當盒 → 飯 → 主菜與配菜 → 蓋子;做好的放在桌邊,按 <kbd>F</kbd> 一次拿起來,再到各款式的成品架放下。一次拿越多,每走一步越容易掉(掉了要賠)</td></tr>
          <tr><th>協助同事</th><td>裝好 5 個便當後,可以挑一位新同事幫忙裝便當(不負責料理)</td></tr>
          <tr><th>裝錯</th><td>內容不符或放錯架子:賠償售價、記點 1</td></tr>
          <tr><th>缺料</th><td>到對應的工作站自己做(炊飯機、滷鍋、炒鍋、油炸機、煎台、砧板),便當盒/蓋子去倉庫搬。有些要多道工序(例如先炸後滷、先切再炒)。烹煮時可去做別的事,完成後太久沒起鍋會燒焦</td></tr>
        </table>
        <p class="tip"><kbd>WASD</kbd>/方向鍵 移動(或點地板、右側工作站清單自動走過去)・<kbd>E</kbd> 操作・組裝時用數字鍵 <kbd>1</kbd>~<kbd>0</kbd>、<kbd>-</kbd>、<kbd>=</kbd> 放材料,<kbd>⌫</kbd> 倒掉重做</p>
        <div class="actions"><button class="ghost" id="b-back">返回</button><button id="b-start">開始上工(Enter)</button></div>
      </div>`, 'dim');
    $('#b-start', s).addEventListener('click', onStart);
    $('#b-back', s).addEventListener('click', onBack);
  }

  /** 暫停選單(含遊戲中設定:畫質、窗簾、聲音)。 */
  pause(onResume, onQuit, st = {}) {
    const s = this.showScreen(`<div class="card center pause-card"><h2>暫停</h2>
      <div class="settings">
        <button class="ghost" id="b-quality">畫質:${esc(st.quality || '')}</button>
        ${`<div class="seg" id="b-curtain"><span>🪟 窗簾</span><button data-v="0" class="${st.curtains ? '' : 'on'}">拉開</button><button data-v="1" class="${st.curtains ? 'on' : ''}">拉下</button></div>`}
        <div class="seg" id="b-view"><span>🎥 視角</span><button data-v="0" class="${st.firstPerson ? '' : 'on'}">第三人稱</button><button data-v="1" class="${st.firstPerson ? 'on' : ''}">第一人稱</button></div>
        ${`<div class="seg seg-sound" id="b-sound"><span>🔊 聲音</span>${[['both', '預錄優先'], ['files', '只用預錄'], ['browser', '瀏覽器發音'], ['mute', '靜音']].map(([v, t]) => `<button data-c="${v}" class="${st.sound === v ? 'on' : ''}">${t}</button>`).join('')}</div>`}
        <button class="ghost" id="b-help">📖 操作說明</button>
      </div>
      <p class="muted-txt">拉下窗簾:不繪製窗外景色、減少效能消耗;但乘客可能抱怨看不到風景並客訴。<br>畫質:陰影與解析度立即生效,車內燈光種類於下一趟任務生效。</p>
      <div class="actions"><button class="ghost" id="b-quit">放棄任務</button><button id="b-resume">繼續(P)</button></div></div>`, 'dim');
    $('#b-resume', s).addEventListener('click', onResume);
    $('#b-quit', s).addEventListener('click', onQuit);
    $('#b-quality', s).addEventListener('click', (e) => { e.target.textContent = `畫質:${st.onQuality()}`; });
    this._bindSeg($('#b-curtain', s), () => st.curtains, st.onCurtains, (v) => { st.curtains = v; });
    this._bindSeg($('#b-view', s), () => st.firstPerson, st.onView, (v) => { st.firstPerson = v; });
    this._bindChoice($('#b-sound', s), st.onSound);
    $('#b-help', s).addEventListener('click', () => st.onHelp());
  }

  /** 多選一(data-c):點選即套用並標示目前選項。 */
  _bindChoice(el, onPick) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-c]');
      if (!b) return;
      onPick(b.dataset.c);
      el.querySelectorAll('button[data-c]').forEach((x) => x.classList.toggle('on', x === b));
    });
  }

  /** 兩段式開關:點未選取的一邊才切換(onToggle 回傳切換後狀態)。 */
  _bindSeg(el, get, onToggle, set) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b || (b.dataset.v === '1') === !!get()) return;
      const v = onToggle();
      set(v);
      el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', (x.dataset.v === '1') === v));
    });
  }

  /**
   * 操作說明/新手教學:操作快捷鍵 → 畫面區塊 → 圖示 → 玩法重點。
   * first=true(首次遊戲):必須翻到最後一頁才能開始。
   */
  tutorial(onDone, { first = false } = {}) {
    const key = (k, t) => `<tr><th>${k}</th><td>${t}</td></tr>`;
    const pages = [
      {
        title: '操作',
        body: `<table class="kv keys tut-keys">
          <tr><th>鍵盤</th><th>畫面按鈕</th><td></td></tr>
          ${[
            ['W / S', '▲ / ▼', '推車前進 / 後退'], ['Shift + W', '⏩ 快速', '快速前進(來不及減速會撞人、撞車門)'],
            ['E', '服務', '服務乘客、處理狀況'], ['F', '送餐', '送預訂便當'], ['Q', '推銷', '向沒有需求的乘客推銷'],
            ['R', '補貨', '備餐區 / 停站時在玄關補貨'], ['Space', '↻ 迴轉', '迴轉推車(車廂兩端玄關)'],
            ['1~6、0~9、Enter', '點選項 / 收銀機', '點餐、選擇、輸入金額'], ['X', '告知售完', '點餐時告知賣完了'],
            ['P / Esc', '⚙', '暫停與設定(視角、窗簾、畫質、聲音)'],
          ].map(([k, b, t]) => `<tr><th>${k}</th><td><i class="tut-btn">${b}</i></td><td>${t}</td></tr>`).join('')}
        </table><p class="muted-txt">拖曳畫面可環顧四周。</p>`,
      },
      {
        title: '畫面與圖示',
        body: `<table class="kv tut-icons">
          <tr><th>左上</th><td>車次、下一站、到站與終點倒數</td></tr>
          <tr><th>右上</th><td>趟數、營業額、滿意度、庫存(刪除線 = 賣完)、預訂便當</td></tr>
          <tr><th>最上方</th><td>LED 跑馬燈:列車/車站廣播</td></tr>
          <tr><th>下方</th><td>小地圖、操作提示與點餐/結帳面板</td></tr>
          <tr><th>🍱</th><td>乘客想買東西,變紅閃爍 = 快放棄</td></tr>
          <tr><th>❗</th><td>走道上的乘客狀況,會擋住推車</td></tr>
          <tr><th><i class="ic ic-buyer"></i> <i class="ic ic-inc"></i> <i class="ic ic-ticket"></i> <i class="ic ic-me"></i></th><td>小地圖:想買的乘客、狀況、預訂座位、你</td></tr>
        </table>`,
      },
      {
        title: '玩法重點',
        body: `<ul class="tut-list">
          <li>備餐區 → 區段終點 → 回備餐區 = 1 趟,終點前沒完成會被趕下車。</li>
          <li>結帳要心算:少算會虧損,多算會被抱怨、客訴。</li>
          <li>點到賣完的東西按 <b>X</b>;停站時把推車停在玄關按 <b>R</b> 可補貨。</li>
          <li>停站時推車擋在走道、亂推銷、拉下窗簾,都可能被客訴。</li>
          <li>只聽得到同一節車廂的對話。</li>
        </ul>`,
      },
    ];
    let i = 0;
    const render = () => {
      const last = i === pages.length - 1;
      const pg = pages[i];
      const s = this.showScreen(`<div class="card tutorial tall">
        <div class="tut-head"><h2>${first ? '開始之前' : '操作說明'}・${esc(pg.title)}</h2><span class="muted-txt">${i + 1} / ${pages.length}</span></div>
        <div class="tall-body">${pg.body}</div>
        ${first && !last ? `<p class="muted-txt">首次遊戲請先看完說明(共 ${pages.length} 頁)。</p>` : ''}
        <div class="actions">
          ${first ? '' : '<button class="ghost" id="t-close">關閉</button>'}
          ${i > 0 ? '<button class="ghost" id="t-prev">上一頁</button>' : ''}
          <button id="t-next">${last ? (first ? '我知道了,開始遊戲' : '完成') : '下一頁'}</button>
        </div></div>`, 'dim tut-screen');
      $('#t-next', s).addEventListener('click', () => { if (last) onDone(); else { i++; render(); } });
      $('#t-prev', s)?.addEventListener('click', () => { i--; render(); });
      $('#t-close', s)?.addEventListener('click', () => onDone());
    };
    render();
  }

  result(m, r, career, onRetry, onMenu) {
    if (r.kind === 'kitchen') return this.kitchenResult(m, r, career, onRetry, onMenu);
    const stars = r.success ? 1 + (r.sat >= 70 && !r.complaints.length ? 1 : 0) + (r.sat >= 90 && r.missed <= 2 && !r.underCount ? 1 : 0) : 0;
    // career = 本次人事異動紀錄(null = 沒有異動)
    const notice = !career ? ''
      : career.clear ? `<div class="c-status good big">👑 榮升局長 — 通關!</div>`
        : `<div class="c-status ${career.kind === 'promote' ? 'good' : 'bad'} big">
            ${career.kind === 'promote' ? '🎉' : '📋'} 人事命令:${esc(career.from)} ${esc(career.verb)}「${esc(career.to)}」<br>
            <small>${esc(career.reason)}${career.to === '列車餐服員' ? '' : ' · 新職位玩法開發中'}</small></div>`;
    const s = this.showScreen(`
      <div class="card result ${r.success ? 'ok' : 'fail'}">
        <h2>${r.success ? '任務完成!' : '任務失敗'}</h2>
        ${r.reason ? `<p class="reason">${esc(r.reason)}</p>` : ''}
        ${notice}
        <div class="big-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
        <table class="kv">
          <tr><th>完成趟數</th><td>${r.trips.done} / ${r.trips.required}</td><th>乘客滿意度</th><td>${r.sat}%</td></tr>
          <tr><th>營業額</th><td>${r.revenue < 0 ? '-' : ''}$${Math.abs(r.revenue)}${r.deductions ? `(已扣 $${r.deductions})` : ''}</td><th>售出品項</th><td>${r.sold} 件 / ${r.served} 位</td></tr>
          <tr><th>少算</th><td>${r.underCount} 次,虧損 $${r.underLoss}</td><th>多算</th><td>${r.overCount} 次</td></tr>
          <tr><th>預訂便當</th><td>送達 ${r.delivered} / ${r.ticketsTotal}</td><th>錯失客人</th><td>${r.missed} 位</td></tr>
          <tr><th>拿錯餐</th><td>${r.wrongOrder} 次</td><th>處理狀況</th><td>${r.incidents} 件</td></tr>
        </table>
        <h3>客訴 ${r.complaints.length} 件</h3>
        ${r.complaints.length ? `<ul class="complaints">${r.complaints.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p class="muted-txt">本趟沒有客訴,做得好!</p>'}
        <div class="actions"><button class="ghost" id="b-menu">回任務選單</button>${career && career.to !== '列車餐服員' ? '' : '<button id="b-retry">再挑戰一次(Enter)</button>'}</div>
      </div>`, 'dim');
    $('#b-retry', s)?.addEventListener('click', onRetry);
    $('#b-menu', s).addEventListener('click', onMenu);
  }

  /** 便當廚房結算 */
  kitchenResult(m, r, career, onRetry, onMenu) {
    const stars = r.success ? 1 + (r.mistakes === 0 ? 1 : 0) + (r.mistakes === 0 && !r.burnt && r.timeLeft >= 60 ? 1 : 0) : 0;
    const notice = !career ? ''
      : `<div class="c-status ${career.kind === 'promote' ? 'good' : 'bad'} big">${career.kind === 'promote' ? '🎉' : '📋'} 人事命令:${esc(career.from)} ${esc(career.verb)}「${esc(career.to)}」<br><small>${esc(career.reason)}</small></div>`;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const s = this.showScreen(`
      <div class="card result ${r.success ? 'ok' : 'fail'}">
        <h2>${r.success ? '準時出車!' : '來不及出車'}</h2>
        ${r.reason ? `<p class="reason">${esc(r.reason)}</p>` : ''}
        ${notice}
        <div class="big-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
        <table class="kv">
          <tr><th>完成便當</th><td>${r.made} / ${r.quota}</td><th>剩餘時間</th><td>${fmt(r.timeLeft)}</td></tr>
          <tr><th>記點</th><td>${r.mistakes} 點</td><th>賠償</th><td>$${r.fines}</td></tr>
          <tr><th>內容裝錯</th><td>${r.wrongContent} 個</td><th>放錯架子</th><td>${r.wrongRack} 個</td></tr>
          <tr><th>燒焦</th><td>${r.burnt} 鍋</td><th>搬運掉落</th><td>${r.dropped || 0} 個,賠 $${r.dropValue || 0}</td></tr>
          <tr><th>協助同事</th><td>${r.helper ? `${esc(r.helper)},做了 ${r.helperMade} 個` : '無'}</td><th>被偷吃</th><td>${r.stolen?.length ? `${r.stolen.length} 份,扣 $${r.stolenValue}` : '無'}</td></tr>
          <tr><th>扣款合計</th><td colspan="3"><b>$${r.fines + (r.dropValue || 0) + (r.stolenValue || 0)}</b>(裝錯 $${r.fines} + 掉落 $${r.dropValue || 0} + 偷吃 $${r.stolenValue || 0})${r.leftOnTable ? `・桌邊還有 ${r.leftOnTable} 個沒上架` : ''}</td></tr>
        </table>
        <h3>裝錯紀錄 ${r.log.length} 筆</h3>
        ${r.log.length ? `<ul class="complaints">${r.log.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p class="muted-txt">全部正確,做得好!</p>'}
        <div class="actions"><button class="ghost" id="b-menu">回任務選單</button><button id="b-retry">再挑戰一次(Enter)</button></div>
      </div>`, 'dim');
    $('#b-retry', s).addEventListener('click', onRetry);
    $('#b-menu', s).addEventListener('click', onMenu);
  }

  // -------------------------------------------------------------- HUD
  updateHud(d) {
    const now = performance.now();
    if (now - this._lastHud < 100) return;
    this._lastHud = now;
    const set = (id, v) => { const e = $(id, this.root); if (e.innerHTML !== String(v)) e.innerHTML = v; };
    set('#h-train', esc(d.trainNo));
    set('#h-dest', esc(d.dest));
    set('#h-next', esc(d.next));
    set('#h-eta-next', d.etaNext);
    set('#h-eta-final', d.etaFinal);
    $('#h-eta-final', this.root).classList.toggle('urgent', d.urgent);
    set('#h-speed', d.speed);
    set('#h-car', d.car);
    $('#h-route-fill', this.root).style.width = `${(d.routeProgress * 100).toFixed(1)}%`;
    set('#h-stops', d.stops.map((s) => `<span class="stop ${s.passed ? 'passed' : ''}" style="left:${s.at * 100}%"><i></i><em>${esc(s.name)}</em></span>`).join(''));
    set('#h-trips', `<b>${d.trips.done}</b> / ${d.trips.required}`);
    set('#h-dir', d.trips.outbound ? '去程 →' : '← 回程');
    set('#h-rev', `${d.revenue < 0 ? '-' : ''}$${Math.abs(d.revenue)}`);
    const sat = $('#h-sat', this.root);
    sat.style.width = `${d.sat}%`;
    sat.style.background = d.sat > 60 ? '#4caf50' : d.sat > 30 ? '#f0a020' : '#e04040';
    set('#h-stock', d.stock.map((s) => `<span class="${s.n === 0 ? 'out' : s.n <= 1 ? 'low' : ''}">${esc(s.name)} <b>${s.n}</b></span>`).join(''));
    set('#h-tickets', d.tickets.length
      ? `<div class="lbl">預訂便當(F 送餐)</div>${d.tickets.map((t) => `<div class="ticket ${t.done ? 'done' : ''}">${t.done ? '✓' : '□'} ${t.car}車 ${t.num}號 · ${esc(t.item)}</div>`).join('')}`
      : '');
  }

  updateMinimap(d) {
    const el = $('#minimap', this.root);
    const [a, b] = d.span;
    const pct = (x) => `${((x - a) / (b - a) * 100).toFixed(2)}%`;
    const cars = d.cars.map((n, k) => {
      const x0 = k * d.pitch - d.half, x1 = k * d.pitch + d.half;
      return `<div class="mm-car" style="left:${pct(x0)};width:calc(${pct(x1)} - ${pct(x0)})"><span>${n}車</span></div>`;
    }).join('');
    const marks = [
      ...d.buyers.map((p) => `<i class="mm-buyer ${p.urgent ? 'urgent' : ''}" style="left:${pct(p.x)}"></i>`),
      ...d.incidents.map((x) => `<i class="mm-inc" style="left:${pct(x)}"></i>`),
      ...d.tickets.map((x) => `<i class="mm-ticket" style="left:${pct(x)}"></i>`),
    ].join('');
    const html = `<div class="mm-track">${cars}<div class="mm-home">備餐區</div>${marks}
      <i class="mm-player ${d.facing > 0 ? 'r' : 'l'}" style="left:${pct(d.player)}"></i></div>`;
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
  }

  /**
   * 操作提示:items = [{ key, text }],每項一行;
   * 同時顯示鍵盤按鍵與畫面上對應的按鈕(例:Space 鍵 = 畫面的 ↻ 迴轉)。
   */
  setPrompt(items) {
    const p = $('#prompt', this.root);
    if (!items?.length) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    const html = items.map((it) => {
      const k = PROMPT_KEYS[it.key] || { kb: it.key, btn: '' };
      return `<div class="p-line"><b>${esc(k.kb)}</b>${k.btn ? `<i>${esc(k.btn)}</i>` : ''}${esc(it.text)}</div>`;
    }).join('');
    if (p._html !== html) { p.innerHTML = html; p._html = html; }
  }

  renderDialog(v) {
    const el = $('#dialog', this.root);
    const hud = $('#hud', this.root);
    hud.classList.toggle('dialog-open', !!v); // 面板開著時收起移動/動作按鈕,避免重疊(面板內有自己的按鈕)
    if (!v) { el.classList.add('hidden'); el._key = null; hud.classList.remove('docked'); return; }
    el.classList.remove('hidden');
    // 結帳時面板停靠在上方、側邊面板收起,不遮住收銀機
    el.classList.toggle('dock-top', v.dock === 'top');
    hud.classList.toggle('docked', v.dock === 'top');
    // 停靠位置直接寫在元素上(不依賴樣式檔,避免瀏覽器快取舊樣式時面板被撐高蓋住收銀機)
    el.style.bottom = v.dock === 'top' ? 'auto' : '';
    el.style.top = v.dock === 'top' ? `${Math.round($('#marquee', this.root).getBoundingClientRect().bottom + 8)}px` : '';
    const parts = [`<div class="d-title">${esc(v.title)}</div>`, `<div class="d-text">${v.text}</div>`];
    if (v.menu) {
      parts.push(`<div class="d-menu">${v.menu.map((m) => `<button class="d-item ${m.stock <= 0 ? 'out' : ''}" data-key="Digit${m.key}"><kbd>${m.key}</kbd>${esc(m.label)}<small>$${m.price} · 剩 ${m.stock}</small></button>`).join('')}</div>`);
      parts.push(`<div class="d-tray">托盤:${v.tray.length ? v.tray.map(esc).join('、') : '<span class="muted-txt">(空)</span>'}</div>`);
    }
    if (v.options) parts.push(`<div class="d-options ${v.locked ? 'locked' : ''}">${v.options.map((o) => `<button class="d-opt" data-key="Digit${o.key}" ${v.locked ? 'disabled' : ''}><kbd>${o.key}</kbd>${esc(o.label)}</button>`).join('')}</div>`);
    if (v.hint) parts.push(`<div class="d-hint">${esc(v.hint)}</div>`);
    if (v.progress !== undefined) parts.push(`<div class="meter wide"><div style="width:${Math.min(100, v.progress * 100).toFixed(0)}%"></div></div>`);
    if (v.msg) parts.push(`<div class="d-msg ${v.msgType}">${esc(v.msg)}</div>`);
    if (v.actions?.length) {
      parts.push(`<div class="d-actions">${v.actions.map((a) => `<button class="d-act ${a.primary ? 'primary' : ''}" ${a.hold ? `data-hold="${a.key}"` : `data-key="${a.key}"`} ${v.locked ? 'disabled' : ''}>${esc(a.label)}</button>`).join('')}</div>`);
    }
    parts.push(`<div class="d-foot">${esc(v.footer || '')}</div>`);
    const html = parts.join('');
    if (el._key !== html) { el.innerHTML = html; el._key = html; }
  }

  toast(msg, type = 'info') {
    const t = h('div', `toast ${type}`, esc(msg));
    $('#toasts', this.root).appendChild(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3800);
  }

  // -------------------------------------------------------------- LED 跑馬燈(廣播)
  setMarqueeIdle(text) {
    this.marquee.idle = text;
    if (!this.marquee.announcing) this._setMarquee(text, false);
  }

  announce(label, text) {
    const m = this.marquee;
    m.announcing = true;
    clearTimeout(m.timer);
    this._setMarquee(`【${label}】${text}`, true);
    m.timer = setTimeout(() => { m.announcing = false; this._setMarquee(m.idle, false); }, 4000 + text.length * 260);
  }

  _setMarquee(text, hot) {
    const m = this.marquee;
    if (m.current === text) return;
    m.current = text;
    const box = $('#marquee', this.root);
    const span = $('#marquee-text', this.root);
    box.classList.toggle('hot', hot);
    span.textContent = text;
    span.style.animation = 'none';
    void span.offsetWidth;
    const dist = box.clientWidth + span.offsetWidth;
    span.style.setProperty('--from', `${box.clientWidth}px`);
    span.style.animation = `led-scroll ${Math.max(6, dist / 110)}s linear infinite`;
  }

  // -------------------------------------------------------------- 漫畫對話框(人物台詞)
  /** anchor:THREE.Object3D 或 THREE.Vector3(世界座標)。 */
  bubble({ text, label = '', anchor, duration }) {
    if (!anchor) { this.toast(text); return; }
    const old = this.bubbles.find((b) => b.anchor === anchor);
    if (old) this._removeBubble(old);
    const el = h('div', 'bubble', `${label ? `<b>${esc(label)}</b>` : ''}${esc(text)}`);
    $('#bubbles', this.root).appendChild(el);
    this.bubbles.push({ el, anchor, until: performance.now() + (duration ?? 1800 + text.length * 170) });
  }

  _removeBubble(b) {
    b.el.remove();
    this.bubbles.splice(this.bubbles.indexOf(b), 1);
  }

  clearBubbles() { [...this.bubbles].forEach((b) => this._removeBubble(b)); }

  updateBubbles(camera) {
    const now = performance.now();
    const W = innerWidth, H = innerHeight;
    for (const b of [...this.bubbles]) {
      if (now > b.until) { this._removeBubble(b); continue; }
      const v = this._v;
      if (b.anchor.isObject3D) b.anchor.getWorldPosition(v); else v.copy(b.anchor);
      const dist = v.distanceTo(camera.position);
      v.project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      b.el.style.display = visible ? '' : 'none';
      if (!visible) continue;
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      const s = THREE.MathUtils.clamp(3.2 / dist, 0.75, 1.1);
      b.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(3)})`;
      b.el.style.zIndex = String(1000 - Math.round(dist * 10));
    }
  }
}
