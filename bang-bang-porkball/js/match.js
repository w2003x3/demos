// ====================================================================
//  對戰設定 + 多局制系列賽 + 結算後的接續流程(單機 / 連線共用)
//  - 開始對戰前:選角色、地圖、人數、幾局定勝負、每局時間、電腦難度、天氣
//  - 每局結束:顯示系列賽比分，5 秒後自動開下一局
//  - 整場結束:可直接換角色；單機「再來一輪 / 調整設定 / 回主選單」，
//    連線玩家按「準備」、攤主看到幾人準備好後開始下一輪
// ====================================================================
const MATCH_OPTS = {
  map:    { label: '地圖', opts: [['park', '公園'], ['market', '菜市場'], ['night', '夜市'], ['random', '隨機']] },
  size:   { label: '人數', opts: [[1, '1 對 1'], [2, '2 對 2'], [3, '3 對 3'], [4, '4 對 4']] },
  rounds: { label: '勝負', opts: [[1, '單局'], [3, '三戰兩勝'], [5, '五戰三勝']] },
  time:   { label: '每局', opts: [[60, '1 分鐘'], [120, '2 分鐘'], [180, '3 分鐘'], [300, '5 分鐘']] },
  ai:     { label: '電腦', opts: [['easy', '簡單'], ['normal', '普通'], ['hard', '困難']] },
  wx:     { label: '天氣', opts: [['all', '隨機變天'], ['safe', '不含災害'], ['calm', '固定涼爽']] },
  teams:  { label: '分隊', opts: [['split', '真人分兩隊'], ['coop', '真人同一隊']], online: true },
};
const MATCH = { map: 'park', size: 3, rounds: 3, time: 180, ai: 'normal', wx: 'all', teams: 'split' };
try {
  const saved = JSON.parse(localStorage.getItem('bbw.match') || 'null');
  if (saved) for (const k of Object.keys(MATCH)) if (MATCH_OPTS[k].opts.some(([v]) => v === saved[k])) MATCH[k] = saved[k];
} catch (e) { /* 無痕模式 */ }
const saveMatch = () => { try { localStorage.setItem('bbw.match', JSON.stringify(MATCH)); } catch (e) { /* 無痕模式 */ } };

// 電腦難度:血量加減、速度倍率、貢丸數加減、放貢丸間隔倍率
const AI_DIFF = {
  easy:   { hp: -1, sp: 0.55, bombs: -1, cd: 1.6 },
  normal: { hp: -1, sp: 0.65, bombs: -1, cd: 1 },
  hard:   { hp: 0,  sp: 0.85, bombs: 0,  cd: 0.7 },
};
const MAP_NAMES = { park: '公園', market: '菜市場', night: '夜市', random: '隨機' };

// 系列賽狀態(連線時由攤主算好送給大家)
const SERIES = { round: 0, wins: { blue: 0, red: 0 }, last: null, over: false, nextAt: 0 };
const needWins = () => Math.ceil(MATCH.rounds / 2);
const ROUND_GAP = 5;   // 局與局之間的倒數秒數

// ---------------------------------------------------------------- 開局
function startSeries() {
  SERIES.round = 0; SERIES.wins = { blue: 0, red: 0 }; SERIES.last = null; SERIES.over = false; SERIES.nextAt = 0;
  if (NET.online) { if (NET.role === 'host') { NET.ready = {}; NET.startRound(); } return; }
  startRound();
}
// 開下一局(單機；連線時由 NET.startRound 呼叫)
function beginRound() {
  SERIES.round += 1; SERIES.nextAt = 0;
  currentMapId = MATCH.map === 'random' ? ['park', 'market', 'night'][rand(3)] : MATCH.map;
  restart();
  sfx('start');
  announceWeather();
  setupUI.hide();
  showOverlay('menu-overlay', false);
  showOverlay('result-overlay', false);
  logPlay();
}
// 遊玩統計:每開一局送一筆匿名資料到連線伺服器(角色、地圖、人數、模式;不含暱稱或任何個人資料)
function logPlay() {
  try {
    const body = JSON.stringify({ char: myChar, map: currentMapId, size: MATCH.size, round: SERIES.round, rounds: MATCH.rounds,
      mode: NET.online ? NET.role : 'solo', view: window.VIEW ? VIEW.mode : '2d' });
    if (navigator.sendBeacon) navigator.sendBeacon(ONLINE_SERVER.replace(/^ws/, 'http') + '/stat', new Blob([body], { type: 'text/plain' }));
  } catch (e) { /* 統計失敗不影響遊戲 */ }
}
function startRound() {
  if (NET.online) { if (NET.role === 'host') NET.startRound(); return; }
  beginRound();
}

// ---------------------------------------------------------------- 一局結束
// 單機與攤主:算比分；連線玩家:等攤主送 series 訊息
function onRoundEnd() {
  // 連線玩家:比分由攤主送來；在那之前先依畫面上的勝負顯示標題(避免閃過「平手」)
  if (NET.online && NET.role !== 'host') SERIES.last = gameState === 'win' ? 'blue' : gameState === 'lose' ? 'red' : null;
  if (!NET.online || NET.role === 'host') {
    const w = gameState === 'win' ? 'blue' : gameState === 'lose' ? 'red' : null;
    SERIES.last = w;
    if (w) SERIES.wins[w] += 1;
    const need = needWins();
    const lead = SERIES.wins.blue !== SERIES.wins.red;
    // 先拿到 need 勝結束；打滿局數還平手就延長，最多再打 2 局
    SERIES.over = SERIES.wins.blue >= need || SERIES.wins.red >= need ||
      (SERIES.round >= MATCH.rounds && lead) || SERIES.round >= MATCH.rounds + 2;
    if (SERIES.offline) SERIES.over = true;   // 連線中斷、電腦接手的那局:打完就不再繼續
    SERIES.nextAt = SERIES.over ? 0 : performance.now() + ROUND_GAP * 1000;
    if (NET.role === 'host') NET.sendSeries();
  }
  resultUI.render();
  showOverlay('result-overlay', true);
}
// 局間倒數:時間到自動開下一局(單機 / 攤主)
setInterval(() => {
  if (!SERIES.nextAt || gameState === 'playing') return;
  const left = Math.ceil((SERIES.nextAt - performance.now()) / 1000);
  const el = document.getElementById('rs-count');
  if (el) el.textContent = Math.max(0, left);
  if (left <= 0 && (!NET.online || NET.role === 'host')) { SERIES.nextAt = 0; startRound(); }
}, 200);

// 系列賽比分條:藍隊格(頭像、勝場圓點)| 星芒比分 | 紅隊格；單局制改顯示存活人數
function seriesBar(single) {
  const need = needWins();
  const mine = player ? player.team : 'blue';
  const pips = (team) => single ? '' : '<span class="rs-pips">' + Array.from({ length: need }, (_, i) =>
    `<i class="${i < SERIES.wins[team] ? 'on ' + team : ''}"></i>`).join('') + '</span>';
  const faces = (team) => '<span class="rs-faces">' + fighters().filter((f) => f.team === team).map((f) =>
    `<i class="${f === player ? 'me' : ''}${f.alive ? '' : ' out'}"><img src="assets/avatars/${f.char || 'aman'}.webp" alt=""></i>`).join('') + '</span>';
  const side = (team, name) => `<div class="rs-side ${team}${mine === team ? ' mine' : ''}">` +
    `<span class="rs-tn">${name}${mine === team ? '<em>你</em>' : ''}</span>${faces(team)}${pips(team)}</div>`;
  const score = single ? `${teamAlive('blue')}:${teamAlive('red')}` : `${SERIES.wins.blue}:${SERIES.wins.red}`;
  return `<div class="rs-score">${side('blue', '藍隊')}<div class="rs-burst"><b>${score}</b><small>${single ? '存活' : '勝場'}</small></div>${side('red', '紅隊')}</div>`;
}
// 換角色(結算畫面直接換，下一輪生效)
function miniCharPick() {
  return '<div class="rs-chars" role="group" aria-label="下一輪的角色">' + CHAR_IDS.map((id) =>
    `<button type="button" data-char="${id}" class="${id === myChar ? 'active' : ''}" title="${CHARACTERS[id].name}・${CHARACTERS[id].role}">` +
    `<img src="assets/avatars/${id}.webp" alt=""><span>${CHARACTERS[id].name}</span></button>`).join('') + '</div>';
}

// ---------------------------------------------------------------- 結算畫面
const resultUI = {
  render() {
    const box = document.getElementById('result-box');
    if (!box || !player) return;
    const w = SERIES.last;
    const mine = player.team;
    const single = MATCH.rounds === 1 || SERIES.offline;
    const sw = SERIES.wins.blue === SERIES.wins.red ? null : (SERIES.wins.blue > SERIES.wins.red ? 'blue' : 'red');
    // 底色與台詞:這局(或整場)贏 = 黃色放射、輸 = 深夜藍、平手 = 藍色
    const judge = SERIES.over && !single ? sw : w;
    const mood = !judge ? 'draw' : judge === mine ? 'win' : 'lose';
    const ov = document.getElementById('result-overlay');
    if (ov) for (const m of ['win', 'lose', 'draw']) ov.classList.toggle('rs-' + m, m === mood);
    const bubble = { win: SERIES.over ? '這攤我包了!' : '再一局就收工!', lose: SERIES.over ? '下一輪再來!' : '還沒結束!', draw: '不分上下!' }[mood];
    const heroId = CHARACTERS[player.char] ? player.char : myChar;
    const hero = `<div class="rs-hero" aria-hidden="true"><img src="assets/art/${heroId}.webp" alt=""><span class="rs-bubble">${bubble}</span></div>`;
    let head, body = '';
    if (!SERIES.over) {
      const roundTitle = !w ? '這局平手' : w === mine ? '拿下這局!' : '對手拿下這局';
      head = `<div class="rs-kicker">第 ${SERIES.round} 局結束</div><h2 class="rs-title">${roundTitle}</h2>`;
      body = seriesBar(false) +
        `<p class="rs-sub">這局存活 <i class="su-dot blue"></i>${teamAlive('blue')} : ${teamAlive('red')}<i class="su-dot red"></i>・先拿 ${needWins()} 勝獲勝</p>` +
        `<div class="rs-next"><span class="rs-count"><b id="rs-count">${ROUND_GAP}</b></span><span>秒後開始<b>第 ${SERIES.round + 1} 局</b></span></div>` +
        (!NET.online ? '<button type="button" class="start-btn" data-rs="next">立即開始下一局</button>' : '');   // 連線:大家一起倒數，不提供提前開始
    } else {
      const title = single ? (!w ? '平手!' : w === mine ? '你的隊伍獲勝!' : '你的隊伍輸了')
        : (!sw ? '系列賽平手' : sw === mine ? '你的隊伍贏得比賽!' : '你的隊伍輸了這場比賽');
      const sub = single ? '' : `<p class="rs-sub">${MATCH.rounds === 3 ? '三戰兩勝' : '五戰三勝'}・最後一局${!w ? '平手' : w === 'blue' ? '藍隊勝' : '紅隊勝'}</p>`;
      head = `<div class="rs-kicker">${single ? '比賽結束' : `比賽結束・共 ${SERIES.round} 局`}</div><h2 class="rs-title">${title}</h2>`;
      body = seriesBar(single) + sub +
        (SERIES.offline ? '' : `<div class="rs-label">下一輪的角色(點一下更換)</div>` + miniCharPick());
      if (SERIES.offline) {
        body += '<p class="rs-offline">連線已中斷，這局打完就結束了</p>' +
          '<button type="button" class="start-btn" data-rs="menu">回主選單</button>';
      } else if (!NET.online) {
        body += '<button type="button" class="start-btn" data-rs="again">再來一輪</button>' +
          '<div class="rs-row"><button type="button" class="home-btn" data-rs="setup">調整設定</button>' +
          '<button type="button" class="home-btn" data-rs="menu">回主選單</button></div>' +
          '<p class="result-hint">Enter 再來一輪・Esc 回主選單</p>';
      } else {
        body += readyList();
        if (NET.role === 'host') {
          const [n, total] = readyCount();
          body += `<button type="button" class="start-btn" data-rs="again">開始下一輪(${n}/${total} 已準備)</button>` +
            '<div class="rs-row rs-row3"><button type="button" class="home-btn" data-rs="lobby">調整設定</button>' +
            nudgeButton('rs') + '<button type="button" class="home-btn" data-rs="quit">收攤</button></div>';
        } else {
          const ready = !!NET.ready[NET.id];
          body += `<button type="button" class="start-btn${ready ? ' done' : ''}" data-rs="ready">${ready ? '✓ 已準備，等攤主開始' : '準備下一輪'}</button>` +
            '<div class="rs-row">' + nudgeButton('rs') + '<button type="button" class="home-btn" data-rs="quit">離開攤位</button></div>';
        }
      }
    }
    box.innerHTML = hero + `<div class="rs-main">${head}<div class="rs-sheet">${body}</div></div>`;
  },
  click(e) {
    const c = e.target.closest && e.target.closest('[data-char]');
    if (c && c.closest('.rs-chars')) { pickChar(c.dataset.char); if (NET.role === 'host') NET.sendPicks(); this.render(); return; }
    const b = e.target.closest && e.target.closest('[data-rs]');
    if (!b) return;
    const a = b.dataset.rs;
    if (a === 'next') { SERIES.nextAt = 0; startRound(); }
    else if (a === 'again') startSeries();
    else if (a === 'setup') { showOverlay('result-overlay', false); setupUI.open(); }
    else if (a === 'menu') backToMainMenu();
    else if (a === 'lobby') NET.backToLobby();
    else if (a === 'ready') { NET.setReady(!NET.ready[NET.id]); this.render(); }
    else if (a === 'nudge') NET.pressNudge();
    else if (a === 'quit') { NET.leave(); backToMenu(''); }
  },
};

// 催促鈕(5 秒冷卻)
function nudgeButton(kind) {
  const cooling = performance.now() - (NET.nudgeAt || 0) < 5000;
  const cls = kind === 'su' ? 'su-nudge' : 'home-btn rs-nudge';
  return `<button type="button" class="${cls}" data-${kind}="nudge"${cooling ? ' disabled' : ''} title="催還沒準備好的人；大家都準備好了就催攤主">${cooling ? '📣 已催促' : '📣 催促'}</button>`;
}
// 遊戲畫面上方常駐的連線訊息(斷線後由電腦接手時顯示)
function showNetBanner(text) {
  const stage = document.querySelector('.stage');
  if (!stage) return;
  let el = document.getElementById('net-banner');
  if (!el) { el = document.createElement('div'); el.id = 'net-banner'; el.setAttribute('role', 'status'); stage.appendChild(el); }
  el.textContent = text || '';
  el.className = text ? 'show' : '';
}

// 畫面上方的提示訊息(被催促時用醒目樣式)
function showToast(text, loud) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = text;
  el.className = 'toast show' + (loud ? ' loud' : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, loud ? 3500 : 2500);
}

// 連線:準備狀態
function readyCount() {
  const humans = NET.roster();
  const n = humans.filter((p) => p.host || NET.ready[p.id]).length;
  return [n, humans.length];
}
function readyList() {
  return '<div class="rs-ready">' + NET.roster().map((p) => {
    const ok = p.host || NET.ready[p.id];
    const ch = CHARACTERS[NET.picks[p.id]] ? CHARACTERS[NET.picks[p.id]].name : '';
    return `<span class="${ok ? 'ok' : ''}">${ok ? '✓' : '…'} ${escHtml(p.name)}${ch ? '・' + ch : ''}${p.host ? '(攤主)' : ''}</span>`;
  }).join('') + '</div>';
}
const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 畫面模式(2D/3D)選擇:準備時各自選，大家可以不同；對戰中不能切換
function viewPick() {
  const m = window.VIEW ? VIEW.mode : '2d';
  return '<div class="view-toggle su-view" role="group" aria-label="畫面模式"><span>畫面</span>' +
    ['2d', '3d'].map((v) => `<button type="button" data-view="${v}" aria-pressed="${m === v}" class="${m === v ? 'active' : ''}">${v.toUpperCase()}</button>`).join('') + '</div>';
}

// ---------------------------------------------------------------- 對戰設定畫面
const setupUI = {
  open() {
    const el = document.getElementById('setup-overlay');
    if (!el) return;
    showOverlay('menu-overlay', false);
    el.classList.remove('hidden');
    this.render();
  },
  hide() { const el = document.getElementById('setup-overlay'); if (el) el.classList.add('hidden'); },
  visible() { const el = document.getElementById('setup-overlay'); return !!el && !el.classList.contains('hidden'); },
  // 連線時:真人數量決定人數下限
  minSize() {
    if (!NET.online) return 1;
    const h = Math.min(8, NET.roster().length);
    return MATCH.teams === 'coop' ? Math.max(1, h) : Math.max(1, Math.ceil(h / 2));
  },
  render() {
    const box = document.getElementById('setup-box');
    if (!box) return;
    const online = NET.online, host = !online || NET.role === 'host';
    const c = CHARACTERS[myChar], sk = SKILLS[c.skill];
    const row = (key) => {
      const o = MATCH_OPTS[key];
      if (o.online && !online) return '';
      const btns = o.opts.map(([v, label]) => {
        const off = !host || (key === 'size' && v < this.minSize());
        return `<button type="button" data-set="${key}" data-val="${v}" class="${MATCH[key] === v ? 'active' : ''}"${off ? ' disabled' : ''}>${label}</button>`;
      }).join('');
      return `<div class="su-row"><span>${o.label}</span><div class="su-opts">${btns}</div></div>`;
    };
    const chars = CHAR_IDS.map((id) =>
      `<button type="button" data-char="${id}" class="${id === myChar ? 'active' : ''}"><img src="assets/art/${id}.webp" alt=""><b>${CHARACTERS[id].name}</b><small>${CHARACTERS[id].title}</small><em>${CHARACTERS[id].role}</em></button>`).join('');
    const n = MATCH.size;
    const summary = `<i class="su-dot blue"></i>你${n > 1 ? ` + ${n - 1} 名隊友` : ''}<b class="su-vs">VS</b><i class="su-dot red"></i>${n} 名對手` +
      `<small>${MATCH.rounds === 1 ? '單局' : (MATCH.rounds === 3 ? '三戰兩勝' : '五戰三勝')}・每局 ${MATCH.time / 60} 分鐘・空位由電腦補上</small>`;
    let side = '';
    if (online) {
      const plan = NET.slotPlan();
      const rows = Object.keys(plan).map(Number).sort((a, b) => a - b).map((slot) => {
        const p = plan[slot];
        const team = slot < n ? 'blue' : 'red';
        const ch = CHARACTERS[NET.picks[p.id]] ? CHARACTERS[NET.picks[p.id]].name : '選角中';
        const ok = p.host || NET.ready[p.id];
        const link = p.host ? '' : NET.links[p.id] === 'p2p' ? '<em class="p2p" title="和攤主直接連線(延遲較低)">直連</em>'
          : '<em class="relay" title="經過伺服器轉送">轉送</em>';
        const face = CHARACTERS[NET.picks[p.id]] ? NET.picks[p.id] : 'aman';
        return `<li class="team-${team}${p.id === NET.id ? ' me' : ''}"><img class="su-face" src="assets/avatars/${face}.webp" alt=""><b>${escHtml(p.name)}</b><span>${ch}</span>${p.host ? '<em>攤主</em>' : `<em class="${ok ? 'ok' : ''}">${ok ? '已準備' : '未準備'}</em>`}${link}${p.id === NET.id ? '<em>你</em>' : ''}</li>`;
      }).join('');
      const extra = NET.roster().length - Object.keys(plan).length;
      const link = location.origin + location.pathname + '?room=' + NET.code;
      side = `<div class="su-room"><div class="su-title">攤位</div><div class="su-room-head"><small>代碼</small><b>${escHtml(NET.code)}</b>` +
        `<button type="button" class="su-copy" data-link="${escHtml(link)}">複製邀請連結</button></div>` +
        `<ul class="su-players">${rows}</ul>` +
        (extra > 0 ? `<p class="su-note">人數超過 ${2 * n} 人，${extra} 位要等下一場</p>` : `<p class="su-note">空位由電腦補上</p>`) + '</div>';
    }
    let foot;
    const nudgeBtn = online ? nudgeButton('su') : '';
    if (!online) foot = '<button type="button" class="su-back" data-su="back">返回</button><button type="button" class="start-btn" data-su="start">開始對戰</button>';
    else if (host) {
      const [r, total] = readyCount();
      foot = '<button type="button" class="su-back" data-su="leave">收攤</button>' + nudgeBtn +
        `<button type="button" class="start-btn" data-su="start">開始對戰(${r}/${total} 已準備)</button>`;
    } else {
      const ready = !!NET.ready[NET.id];
      foot = '<button type="button" class="su-back" data-su="leave">離開攤位</button>' + nudgeBtn +
        `<button type="button" class="start-btn${ready ? ' done' : ''}" data-su="ready">${ready ? '✓ 已準備' : '準備好了'}</button>`;
    }
    box.innerHTML =
      `<div class="su-head"><h2>對戰設定</h2><span>${online ? (host ? '你是攤主，可以調整規則' : '規則由攤主設定') : '單機對戰'}</span>` +
      viewPick() + '</div>' +
      `<div class="su-body"><section class="su-chars"><div class="su-title">選角色</div><div class="su-char-grid">${chars}</div>` +
      `<div class="su-char-info"><b class="sci-name">${c.name}・${c.title}</b>` +
      [['HP', c.hp], ['MP', c.mp], ['速度', c.speed], ['威力', c.power], ['貢丸', c.bombs]].map(([k, v]) => `<span class="sci-chip">${k}<b>${v}</b></span>`).join('') +
      `<p class="sci-skill"><b>技能・${sk.name}</b>${sk.desc}</p></div></section>` +
      `<section class="su-rules"><div class="su-title">規則</div>${['map', 'size', 'rounds', 'time', 'ai', 'wx', 'teams'].map(row).join('')}` +
      `<p class="su-summary">${summary}</p></section>${side}</div>` +
      `<p class="su-status" id="su-status"></p><div class="su-foot">${foot}</div>`;
  },
  click(e) {
    const t = e.target.closest && e.target.closest('button');
    if (!t || t.disabled) return;
    if (t.dataset.char) { pickChar(t.dataset.char); if (NET.role === 'host') NET.sendPicks(); this.render(); return; }
    if (t.dataset.set) {
      const k = t.dataset.set, o = MATCH_OPTS[k];
      const v = o.opts.find(([x]) => String(x) === t.dataset.val)[0];
      MATCH[k] = v;
      if (k === 'teams' && MATCH.size < this.minSize()) MATCH.size = this.minSize();
      saveMatch();
      if (NET.role === 'host') NET.sendCfg();
      this.render();
      updateMenuInfo();
      return;
    }
    if (t.classList.contains('su-copy')) {
      const link = t.dataset.link;
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
        .then(() => { const s = document.getElementById('su-status'); if (s) s.textContent = '已複製邀請連結'; })
        .catch(() => { const s = document.getElementById('su-status'); if (s) s.textContent = link; });
      return;
    }
    const a = t.dataset.su;
    if (a === 'start') {
      if (MATCH.size < this.minSize()) MATCH.size = this.minSize();
      startSeries();
    } else if (a === 'back') { this.hide(); showOverlay('menu-overlay', true); }
    else if (a === 'ready') { NET.setReady(!NET.ready[NET.id]); this.render(); }
    else if (a === 'nudge') NET.pressNudge();
    else if (a === 'leave') { NET.leave(); this.hide(); backToMenu(''); }
  },
};

// 主選單底部的規則摘要
function updateMenuInfo() {
  const el = document.getElementById('mb-info');
  if (!el) return;
  const n = MATCH.size;
  el.textContent = `🔵 你${n > 1 ? ` + ${n - 1} 名隊友` : ''} vs 🔴 ${n} 名對手・${MATCH.rounds === 1 ? '單局' : (MATCH.rounds === 3 ? '三戰兩勝' : '五戰三勝')}・每局 ${MATCH.time / 60} 分鐘・${MAP_NAMES[MATCH.map]}`;
}

(function initMatchUi() {
  const s = document.getElementById('setup-box');
  if (s) s.addEventListener('click', (e) => setupUI.click(e));
  const r = document.getElementById('result-box');
  if (r) r.addEventListener('click', (e) => resultUI.click(e));
  updateMenuInfo();
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && setupUI.visible() && !NET.online) { e.preventDefault(); startSeries(); }
    // 首頁:左右方向鍵切換角色
    const menu = document.getElementById('menu-overlay'), help = document.getElementById('help-modal');
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && menu && !menu.classList.contains('hidden') &&
        !setupUI.visible() && !(help && !help.classList.contains('hidden'))) {
      e.preventDefault();
      cycleChar(e.key === 'ArrowLeft' ? -1 : 1);
    }
  });
})();
