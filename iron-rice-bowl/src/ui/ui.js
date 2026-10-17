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
        <div class="help">W/↑ 推車 · S/↓ 後退 · Space 迴轉(玄關) · E 互動 · F 送預訂便當 · 滑鼠拖曳 看四周 · V 視角 · M 靜音 · P 暫停</div>
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
    const ladder = `<div class="ladder">${c.ranks.map((r, i) => `
      <div class="rung ${i === c.rankIndex ? 'now' : ''} ${i < 2 ? 'low' : ''}" title="${esc(r.duties)}">
        <b>${esc(r.title)}</b><small>${esc(r.duties)}</small>${r.playable || r.clear ? '' : '<i>開發中</i>'}
      </div>`).join('<span class="arrow">⇄</span>')}</div>`;
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
        <button id="mute-btn" class="ghost">${info.muted ? '🔇 已靜音' : '🔊 聲音開'}</button>
        <button id="quality-btn" class="ghost">畫質:${esc(info.quality)}</button>
        <span class="muted-txt">語音來源:${esc(info.voice)}</span>
      </div>`, 'menu');
    s.querySelectorAll('.mission:not(.locked)').forEach((b) => b.addEventListener('click', () => onPick(missions[+b.dataset.i])));
    $('#mute-btn', s).addEventListener('click', (e) => { e.target.textContent = onToggleMute() ? '🔇 已靜音' : '🔊 聲音開'; });
    $('#quality-btn', s).addEventListener('click', (e) => { e.target.textContent = `畫質:${info.onQuality()}`; });
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
          <tr><th>W / ↑</th><td>推車前進</td><th>S / ↓</th><td>拉車後退(較慢)</td></tr>
          <tr><th>Space</th><td>迴轉推車(只能在車廂兩端玄關)</td><th>E</th><td>服務乘客 / 處理狀況</td></tr>
          <tr><th>1 ~ 6</th><td>點餐時拿取品項、選擇選項</td><th>Enter</th><td>交給乘客 / 確認金額</td></tr>
          <tr><th>F</th><td>送預訂便當(座號標在行李架)</td><th>0 ~ 9</th><td>在結帳機台輸入金額</td></tr>
          <tr><th>滑鼠拖曳</th><td>環顧四周(窗外風景)</td><th>V</th><td>切換第一/第三人稱</td></tr>
        </table>
        <p class="tip">頭上有 🍱 的乘客想買東西,等太久會放棄;走道上有 ❗ 的狀況會擋住推車。<br>
        結帳要<b>心算總金額</b>:少算會造成虧損(累積會被調職);多算乘客會當場抱怨,事後還可能客訴。</p>
        <div class="actions"><button class="ghost" id="b-back">返回</button><button id="b-start">開始服勤(Enter)</button></div>
      </div>`, 'dim');
    $('#b-start', s).addEventListener('click', onStart);
    $('#b-back', s).addEventListener('click', onBack);
  }

  pause(onResume, onQuit) {
    const s = this.showScreen(`<div class="card center"><h2>暫停</h2>
      <div class="actions"><button class="ghost" id="b-quit">放棄任務</button><button id="b-resume">繼續(P)</button></div></div>`, 'dim');
    $('#b-resume', s).addEventListener('click', onResume);
    $('#b-quit', s).addEventListener('click', onQuit);
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
    if (!v) { el.classList.add('hidden'); el._key = null; return; }
    el.classList.remove('hidden');
    const parts = [`<div class="d-title">${esc(v.title)}</div>`, `<div class="d-text">${v.text}</div>`];
    if (v.menu) {
      parts.push(`<div class="d-menu">${v.menu.map((m) => `<div class="d-item ${m.stock <= 0 ? 'out' : ''}"><kbd>${m.key}</kbd>${esc(m.label)}<small>$${m.price} · 剩 ${m.stock}</small></div>`).join('')}</div>`);
      parts.push(`<div class="d-tray">托盤:${v.tray.length ? v.tray.map(esc).join('、') : '<span class="muted-txt">(空)</span>'}</div>`);
    }
    if (v.options) parts.push(`<div class="d-options ${v.locked ? 'locked' : ''}">${v.options.map((o) => `<div class="d-opt"><kbd>${o.key}</kbd>${esc(o.label)}</div>`).join('')}</div>`);
    if (v.hint) parts.push(`<div class="d-hint">${esc(v.hint)}</div>`);
    if (v.progress !== undefined) parts.push(`<div class="meter wide"><div style="width:${Math.min(100, v.progress * 100).toFixed(0)}%"></div></div>`);
    if (v.msg) parts.push(`<div class="d-msg ${v.msgType}">${esc(v.msg)}</div>`);
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
