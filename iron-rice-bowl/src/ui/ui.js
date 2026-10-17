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
            <button class="t-btn primary" data-hold="KeyE" title="互動(E)">E<small>互動</small></button>
            <button class="t-btn" data-key="KeyF" title="送預訂便當(F)">F<small>送餐</small></button>
            <button class="t-btn" data-key="KeyQ" title="推銷(Q)">Q<small>推銷</small></button>
            <button class="t-btn" data-key="KeyR" title="補貨(R)">R<small>補貨</small></button>
            <button class="t-btn" data-key="Space" title="迴轉推車(Space)">↻<small>迴轉</small></button>
          </div>
          <div class="t-top">
            <button class="t-mini" data-key="KeyV" title="切換視角(V)">🎥</button>
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
        <button id="mute-btn" class="ghost">${info.muted ? '🔇 已靜音' : '🔊 聲音開'}</button>
        <button id="quality-btn" class="ghost">畫質:${esc(info.quality)}</button>
        <button id="curtain-btn" class="ghost">${info.curtains ? '🪟 窗簾:拉下' : '🪟 窗簾:拉開'}</button>
        <span class="muted-txt">語音來源:${esc(info.voice)}</span>
      </div>`, 'menu');
    s.querySelectorAll('.mission:not(.locked)').forEach((b) => b.addEventListener('click', () => onPick(missions[+b.dataset.i])));
    $('#mute-btn', s).addEventListener('click', (e) => { e.target.textContent = onToggleMute() ? '🔇 已靜音' : '🔊 聲音開'; });
    $('#quality-btn', s).addEventListener('click', (e) => { e.target.textContent = `畫質:${info.onQuality()}`; });
    $('#curtain-btn', s).addEventListener('click', (e) => { e.target.textContent = info.onCurtains() ? '🪟 窗簾:拉下' : '🪟 窗簾:拉開'; });
    $('#help-btn', s).addEventListener('click', () => info.onHelp());
    $('#reset-btn', s).addEventListener('click', () => { if (confirm('確定要重置職涯紀錄?')) onResetCareer(); });
  }

  brief(m, onStart, onBack) {
    const ph = m.phases[0];
    const s = this.showScreen(`
      <div class="card brief">
        <h2>${esc(m.title)} <small>${esc(m.subtitle)}</small></h2>
        <p>${esc(m.brief)}</p>
        <table class="kv">
          <tr><th>車次</th><td>${esc(ph.trainNo)}(新自強號 EMU3000)</td></tr>
          <tr><th>服務車廂</th><td>第 ${ph.serviceCars.join('、')} 車</td></tr>
          <tr><th>任務目標</th><td>抵達終點前完成 <b>${ph.tripsRequired}</b> 趟(備餐區 → 區段終點 → 回備餐區 = 1 趟)。沒完成會被列車長趕下車!</td></tr>
          <tr><th>預訂便當</th><td>${ph.preorders || 0} 份,要送到指定車廂座位(送錯、沒送到:扣錢 + 客訴)</td></tr>
        </table>
        <h3>操作方式</h3>
        <table class="kv keys">
          <tr><th>W / ↑</th><td>推車前進(Shift 快速,小心撞人撞門)</td><th>S / ↓</th><td>拉車後退(較慢)</td></tr>
          <tr><th>Space</th><td>迴轉推車(只能在車廂兩端玄關)</td><th>E</th><td>服務乘客 / 處理狀況</td></tr>
          <tr><th>F</th><td>送預訂便當</td><th>Q</th><td>向沒有需求的乘客推銷</td></tr>
          <tr><th>R</th><td>補貨(備餐區 / 停站時在玄關)</td><th>X</th><td>點餐時告知售完</td></tr>
        </table>
        <p class="muted-txt">也可以點畫面上的按鈕、對話選項與收銀機按鍵操作(支援手機觸控)。完整說明:選單「📖 操作說明」。</p>
        <p class="tip">頭上有 🍱 的乘客想買東西,等太久會放棄;走道上有 ❗ 的狀況會擋住推車。<br>
        結帳要<b>心算總金額</b>:少算會造成虧損(累積會被調職);多算乘客會當場抱怨,事後還可能客訴。</p>
        <div class="actions"><button class="ghost" id="b-back">返回</button><button id="b-start">開始服勤(Enter)</button></div>
      </div>`, 'dim');
    $('#b-start', s).addEventListener('click', onStart);
    $('#b-back', s).addEventListener('click', onBack);
  }

  /** 暫停選單(含遊戲中設定:畫質、窗簾、聲音)。 */
  pause(onResume, onQuit, st = {}) {
    const s = this.showScreen(`<div class="card center pause-card"><h2>暫停</h2>
      <div class="settings">
        <button class="ghost" id="b-quality">畫質:${esc(st.quality || '')}</button>
        <button class="ghost" id="b-curtain">${st.curtains ? '🪟 窗簾:拉下' : '🪟 窗簾:拉開'}</button>
        <button class="ghost" id="b-mute">${st.muted ? '🔇 已靜音' : '🔊 聲音開'}</button>
        <button class="ghost" id="b-help">📖 操作說明</button>
      </div>
      <p class="muted-txt">拉下窗簾:不繪製窗外景色、減少效能消耗;但乘客可能抱怨看不到風景並客訴。<br>畫質:陰影與解析度立即生效,車內燈光種類於下一趟任務生效。</p>
      <div class="actions"><button class="ghost" id="b-quit">放棄任務</button><button id="b-resume">繼續(P)</button></div></div>`, 'dim');
    $('#b-resume', s).addEventListener('click', onResume);
    $('#b-quit', s).addEventListener('click', onQuit);
    $('#b-quality', s).addEventListener('click', (e) => { e.target.textContent = `畫質:${st.onQuality()}`; });
    $('#b-curtain', s).addEventListener('click', (e) => { e.target.textContent = st.onCurtains() ? '🪟 窗簾:拉下' : '🪟 窗簾:拉開'; });
    $('#b-mute', s).addEventListener('click', (e) => { e.target.textContent = st.onMute() ? '🔇 已靜音' : '🔊 聲音開'; });
    $('#b-help', s).addEventListener('click', () => st.onHelp());
  }

  /**
   * 操作說明/新手教學:操作快捷鍵 → 畫面區塊 → 圖示 → 玩法重點。
   * first=true(首次遊戲):必須翻到最後一頁才能開始。
   */
  tutorial(onDone, { first = false } = {}) {
    const key = (k, t) => `<tr><th>${k}</th><td>${t}</td></tr>`;
    const pages = [
      {
        title: '① 操作方式',
        body: `<div class="tut-cols">
          <table class="kv keys"><tr><th colspan="2" class="tut-sub">鍵盤</th></tr>
            ${key('W / ↑', '推車前進')}${key('Shift + W', '快速前進(來不及減速會撞人、撞車門)')}${key('S / ↓', '拉車後退(較慢)')}
            ${key('Space', '迴轉推車(只能在車廂兩端玄關)')}${key('E', '服務乘客 / 處理狀況(按住型狀況要按住)')}
            ${key('F', '送預訂便當')}${key('Q', '向沒有需求的乘客推銷')}${key('R', '補貨(備餐區 / 停站時在玄關)')}
            ${key('1 ~ 6', '點餐時拿取品項、選擇選項')}${key('0 ~ 9 / Enter', '結帳機台輸入金額 / 確認')}
            ${key('X', '告知乘客點的東西賣完了')}${key('V / M / P', '切換視角 / 靜音 / 暫停與設定')}
          </table>
          <table class="kv keys"><tr><th colspan="2" class="tut-sub">滑鼠 / 觸控</th></tr>
            ${key('▲ ⏩ ▼', '按住前進、快速前進、後退')}${key('E F Q R ↻', '互動、送餐、推銷、補貨、迴轉')}
            ${key('🎥 ⚙', '切換視角、暫停與設定')}${key('對話選項', '直接點選')}
            ${key('收銀機', '直接點 3D 收銀機上的按鍵輸入金額')}${key('拖曳畫面', '環顧四周')}
          </table></div>`,
      },
      {
        title: '② 畫面區塊',
        body: `<div class="tut-map">
          <div class="tm tm-l"><b>行程資訊</b>車次、下一站、到站與終點倒數、停靠站、目前車廂</div>
          <div class="tm tm-led"><b>LED 跑馬燈</b>列車/車站廣播(綠字 = 廣播中)</div>
          <div class="tm tm-r"><b>業績</b>趟數、營業額、滿意度、推車庫存、預訂便當清單</div>
          <div class="tm tm-mid"><b>提示 / 操作面板</b>可做的動作;點餐、結帳、狀況處理的選項</div>
          <div class="tm tm-mm"><b>小地圖</b>服務車廂、乘客、狀況、預訂座位、你的位置</div>
          <div class="tm tm-pad"><b>移動按鈕</b>▲ ⏩ ▼</div>
          <div class="tm tm-act"><b>動作按鈕</b>E F Q R ↻</div>
        </div>`,
      },
      {
        title: '③ 圖示說明',
        body: `<table class="kv tut-icons">
          <tr><th>🍱</th><td>乘客頭上:想買東西。圖示<b>變紅、閃爍</b> = 快等不及要放棄了</td></tr>
          <tr><th>❗</th><td>走道上:乘客狀況(行李、打翻飲料、小朋友、糾紛…),會擋住推車</td></tr>
          <tr><th><i class="ic ic-buyer"></i></th><td>小地圖黃點:想買東西的乘客(紅點 = 快放棄)</td></tr>
          <tr><th><i class="ic ic-inc"></i></th><td>小地圖紅三角:乘客狀況</td></tr>
          <tr><th><i class="ic ic-ticket"></i></th><td>小地圖藍方塊:預訂便當的座位(座號標在行李架上)</td></tr>
          <tr><th><i class="ic ic-me"></i></th><td>小地圖藍色:你與推車(箭頭 = 前進方向)</td></tr>
          <tr><th><span class="ic-stock">排骨 <b>2</b></span> <span class="ic-stock out">雞腿 <b>0</b></span></th><td>庫存:黃色 = 快沒了,刪除線 = 賣完</td></tr>
          <tr><th><span class="ic-bubble">漫畫對話框</span></th><td>人物說的話(只聽得到<b>同一節車廂</b>的聲音,別節車廂只有字幕)</td></tr>
        </table>`,
      },
      {
        title: '④ 玩法重點',
        body: `<ul class="tut-list">
          <li><b>趟數</b>:備餐區(第一節後端)→ 區段終點 → 回備餐區 = 1 趟;終點前沒完成會被列車長趕下車。</li>
          <li><b>心算結帳</b>:少算會虧損(累積會被調職);多算乘客當場抱怨,事後可能客訴。</li>
          <li><b>賣完了</b>:乘客可能點到推車上賣完的品項,按 <b>X</b> 告知售完,他可能改買別的或不買了。</li>
          <li><b>補貨</b>:回備餐區按 <b>R</b> 補滿;停靠中途站時把推車停在<b>車廂兩端玄關</b>按 <b>R</b>,月台業者會補一半。</li>
          <li><b>停站擋道</b>:停靠站時推車卡在走道上,可能被下車乘客抱怨、客訴。</li>
          <li><b>快速前進</b>:省時間,但遇到乘客、障礙物或來不及開的車門會撞上(商品摔壞、客訴)。</li>
          <li><b>推銷</b>:對沒有需求的乘客按 <b>Q</b>,可能成交,也可能被嫌打擾安寧而客訴。</li>
          <li><b>窗簾</b>:暫停 → 設定可拉下窗簾減少效能,但乘客可能抱怨看不到風景。</li>
        </ul>`,
      },
    ];
    let i = 0;
    const render = () => {
      const last = i === pages.length - 1;
      const pg = pages[i];
      const s = this.showScreen(`<div class="card tutorial">
        <div class="tut-head"><h2>${first ? '開始之前' : '操作說明'}・${esc(pg.title)}</h2><span class="muted-txt">${i + 1} / ${pages.length}</span></div>
        ${pg.body}
        ${first && !last ? '<p class="muted-txt">首次遊戲請先看完說明(共 4 頁)。</p>' : ''}
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

  setPrompt(html) {
    const p = $('#prompt', this.root);
    if (!html) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    if (p._html !== html) { p.innerHTML = html; p._html = html; }
  }

  renderDialog(v) {
    const el = $('#dialog', this.root);
    const hud = $('#hud', this.root);
    if (!v) { el.classList.add('hidden'); el._key = null; hud.classList.remove('docked'); return; }
    el.classList.remove('hidden');
    // 結帳時面板停靠在上方、側邊面板收起,不遮住收銀機
    el.classList.toggle('dock-top', v.dock === 'top');
    hud.classList.toggle('docked', v.dock === 'top');
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
