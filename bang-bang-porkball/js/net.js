// ====================================================================
//  多人連線(房主運算 host-authoritative)
//
//  伺服器:server/(Cloudflare Workers + Durable Objects),只負責房間名單與轉送。
//  房主的瀏覽器跑完整遊戲(含 AI),每秒 15 次把狀態快照廣播給其他玩家;
//  其他玩家(guest)不自己模擬,只送出按鍵/移動方向,並顯示房主送來的畫面。
//
//  訊息(JSON,t 一定放第一個欄位):
//   伺服器 → 玩家:welcome / lobby / error / host-left / peer-left
//   房主 → 玩家  :cfg(地圖、分隊)/ start / snap(狀態快照)/ open(回大廳)
//   玩家 → 房主  :in(按鍵 k / 移動 mv / 點地圖 go)
// ====================================================================

// 伺服器位址:預設連正式伺服器;網址加 ?server=local 改連本機的 wrangler dev(開發測試用)
const ONLINE_SERVER = (() => {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q === 'local' ? 'ws://127.0.0.1:8787' : q;
  return 'wss://bang-bang-porkball.bang-bang-porkball-server.workers.dev'; // Cloudflare Workers(server/)
})();

const SNAP_INTERVAL = 1 / 15;   // 房主送快照的間隔(秒)
const ACTION_KEYS = new Set([' ', 'e', 'j', 'q', 'f', 'g', 't', 'v', 'z', 'x', 'c', 'k', 'l', 'o', 'p',
  '1', '2', '3', '4', '5', '6', '7', '8', '9']);

const NET = {
  online: false,     // 是否在連線房間裡
  role: null,        // 'host' | 'guest' | null(單機)
  id: null,
  name: '',
  code: '',
  players: [],       // 房間名單 [{id, name, host}]
  picks: {},         // 房主:連線玩家選的角色 {id: 角色}
  cfg: { map: 'park', teams: 'split' },
  fx: [],            // 房主:待送出的飄字
  sq: [],            // 房主:待送出的音效
  ws: null,
  snapT: 0,
  lastMove: '',
  resultShown: false,

  // ---------- 連線 / 離開 ----------
  connect(mode, code, name) {
    this.leave(true);
    this.name = name;
    this.code = code;
    const url = `${ONLINE_SERVER}/room/${code}?mode=${mode}&name=${encodeURIComponent(name)}`;
    let ws;
    try { ws = new WebSocket(url); } catch (e) { lobbyUI.status('連線網址錯誤:' + e.message, true); return; }
    this.ws = ws;
    lobbyUI.status('連線中…');
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      const wasOnline = this.online;
      this.ws = null;
      this.reset();
      if (wasOnline) backToMenu('與伺服器的連線中斷了');
      else lobbyUI.status(lobbyUI.lastError || '連不上連線伺服器,請確認網路後再試一次(若剛更新過遊戲,請重新整理頁面)', true);
    };
  },
  leave(silent) {
    const ws = this.ws;
    this.ws = null;
    if (ws) { try { ws.close(); } catch { /* 已關閉 */ } }
    this.reset();
    if (!silent) lobbyUI.render();
  },
  reset() {
    this.online = false; this.role = null; this.id = null; this.players = [];
    this.fx = []; this.sq = []; this.lastMove = ''; this.resultShown = false; this.picks = {};
    guest.clear();
    restoreResultButtons();
  },
  raw(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  },

  onMessage(msg) {
    switch (msg.t) {
      case 'error':
        lobbyUI.lastError = msg.msg;
        lobbyUI.status(msg.msg, true);
        return;
      case 'welcome':
        this.online = true;
        this.id = msg.id;
        this.role = msg.host ? 'host' : 'guest';
        this.players = msg.players;
        lobbyUI.lastError = '';
        lobbyUI.msg = ''; lobbyUI.msgErr = false;
        if (this.role === 'guest') this.raw({ t: 'pick', c: myChar }); // 告訴攤主我選的角色
        history.replaceState(null, '', '?room=' + this.code + (new URLSearchParams(location.search).get('server') ? '&server=' + new URLSearchParams(location.search).get('server') : ''));
        lobbyUI.render();
        return;
      case 'lobby':
        this.players = msg.players;
        if (this.role === 'host') this.raw({ t: 'cfg', map: this.cfg.map, teams: this.cfg.teams });
        lobbyUI.render();
        return;
      case 'host-left':
        this.ws = null;
        this.reset();
        backToMenu('攤主收攤了,攤位已關閉');
        return;
    }
    if (this.role === 'host') this.hostMessage(msg);
    else this.guestMessage(msg);
  },

  // ---------- 分隊:出生點序號 → 真人玩家 ----------
  // 出生點 0~2 藍隊、3~5 紅隊;房主固定在 0
  slotPlan() {
    const order = this.cfg.teams === 'coop' ? [0, 1, 2, 3, 4, 5] : [0, 3, 1, 4, 2, 5];
    const plan = {};
    this.roster().slice(0, 6).forEach((p, i) => { plan[order[i]] = p; });
    return plan;
  },
  // 房主排第一,其餘照伺服器給的加入順序
  roster() {
    return this.players.filter((p) => p.host).concat(this.players.filter((p) => !p.host));
  },
  teamOf(index) {
    const order = this.cfg.teams === 'coop' ? [0, 1, 2, 3, 4, 5] : [0, 3, 1, 4, 2, 5];
    return order[index] < 3 ? 'blue' : 'red';
  },

  // ====================== 房主 ======================
  startOnline() {
    if (this.role !== 'host') return;
    currentMapId = this.cfg.map;
    this.restartMatch();
  },
  restartMatch() {
    if (this.role !== 'host') return;
    this.resultShown = false;
    restart();
    sfx('start');
    announceWeather();
    showOverlay('menu-overlay', false);
    showOverlay('result-overlay', false);
    lobbyUI.hide();
    this.fx = [];
    this.raw({ t: 'start', map: currentMapId });
    this.snapT = SNAP_INTERVAL; // 立刻送第一份快照
    this.hostTick(0);
  },
  backToLobby() {
    if (this.role !== 'host') return;
    gameState = 'menu';
    this.raw({ t: 'open' });
    showOverlay('result-overlay', false);
    lobbyUI.show();
  },
  hostMessage(msg) {
    if (msg.t === 'peer-left') {
      // 對戰中有人離開:改由電腦接手
      const f = bots.find((b) => b.netId === msg.id);
      if (f) { f.remote = false; f.netWant = null; f.label += '(電腦)'; buildRoster(); }
      return;
    }
    if (msg.t === 'pick') { if (CHARACTERS[msg.c]) this.picks[msg.from] = msg.c; return; }
    if (msg.t !== 'in' || gameState !== 'playing') return;
    const f = bots.find((b) => b.remote && b.netId === msg.from);
    if (!f) return;
    if (typeof msg.k === 'string' && ACTION_KEYS.has(msg.k)) playerAction(f, msg.k);
    if ('mv' in msg) {
      const mv = msg.mv;
      const ok = Array.isArray(mv) && Math.abs(mv[0]) + Math.abs(mv[1]) === 1;
      f.netWant = ok ? [mv[0], mv[1]] : null;
      f.netKeep = ok && !!mv[2];
    }
    if (Array.isArray(msg.go)) setTapPath(f, msg.go[0] | 0, msg.go[1] | 0);
  },
  hostTick(dt) {
    this.snapT += dt;
    if (this.snapT < SNAP_INTERVAL && gameState === 'playing') return;
    this.snapT = 0;
    this.raw(buildSnapshot());
  },
  onResult() {
    if (this.role === 'host') this.hostTick(SNAP_INTERVAL); // 把結算狀態送出去
    lobbyUI.resultButtons();
  },

  // ====================== 一般玩家 ======================
  guestMessage(msg) {
    if (msg.t === 'cfg') { this.cfg.map = msg.map; this.cfg.teams = msg.teams; lobbyUI.render(); return; }
    if (msg.t === 'start') {
      currentMapId = msg.map;
      this.resultShown = false;
      guest.clear();
      AUDIO.play('start');
      setTimeout(announceWeather, 300);
      gameState = 'playing';
      showOverlay('menu-overlay', false);
      showOverlay('result-overlay', false);
      lobbyUI.hide();
      return;
    }
    if (msg.t === 'open') { gameState = 'menu'; showOverlay('result-overlay', false); lobbyUI.show(); return; }
    if (msg.t === 'snap') guest.apply(msg);
  },
  sendKey(k) {
    if (ACTION_KEYS.has(k)) this.raw({ t: 'in', k });
  },
  sendMove(want, keep) {
    const key = want ? want[0] + ',' + want[1] + (keep ? 'k' : '') : '';
    if (key === this.lastMove) return; // 只在方向改變時送出
    this.lastMove = key;
    this.raw({ t: 'in', mv: want ? [want[0], want[1], keep ? 1 : 0] : null });
  },
  sendTap(c, r) { this.raw({ t: 'in', go: [c, r] }); },
  guestUpdate(dt) { guest.update(dt); },

  // 舊介面相容(單機時不做事)
  send() {},
};

// ====================================================================
//  房主:把整個遊戲狀態打包成快照
// ====================================================================
let netSeq = 0;
const nid = (o) => o._nid || (o._nid = ++netSeq);
const r1 = (v) => Math.round(v * 10) / 10;

function buildSnapshot() {
  const all = fighters();
  return {
    t: 'snap',
    gs: gameState,
    tm: r1(matchTime),
    env: [env.weather, r1(env.left), r1(env.t)],
    ab: env.abduct ? [nid(env.abduct.f), r1(env.abduct.t)] : 0,   // 外星人光束鎖定的人
    g: grid.map((row) => row.join('')).join(''),
    f: all.map((f) => ({
      i: nid(f), n: f.netId || (f === player ? NET.id : null),
      lb: f === player ? (f.netName || f.label) : f.label, tm: f.team, hu: f.isHuman ? 1 : 0,
      x: Math.round(f.x), y: Math.round(f.y), d: [f.dir.x, f.dir.y], mv: f.mvTarget ? 1 : 0,
      hp: f.hp, mh: f.maxHp, mp: Math.round(f.mp), mm: f.maxMp, pw: f.power, sp: f.speed, mb: f.maxBombs,
      al: f.alive ? 1 : 0, iv: r1(f.invuln), bt: r1(f.blindT), pt: r1(f.poisonT),
      sh: r1(f.shieldT || 0), im: r1(f.immunity), se: f.selected, ie: f.inkEaten, pk: f.porkNext ? 1 : 0,
      ch: f.char, sc: r1(f.skillCd || 0), da: r1(f.dashT || 0), bo: f.boostNext ? 1 : 0,
      to: f.isHuman ? f.tools : undefined,
      ps: f.isHuman ? { rat: f.petState.rat.status, roach: f.petState.roach.status } : undefined,
      hd: f.held ? nid(f.held) : 0, dt: f.deathT !== undefined ? r1(f.deathT) : undefined,
    })),
    m: meatballs.filter((m) => !m.exploded && !m.eaten).map((m) => ({
      i: nid(m), x: Math.round(m.x), y: Math.round(m.y), d: m.def.id, o: nid(m.owner), pw: m.power,
      fu: r1(m.fuse), mo: m.moldy ? 1 : 0, hp: Math.round(m.hp), mv: m.moving ? 1 : 0, h: m.held ? 1 : 0, ar: m.armed ? 1 : 0, jp: m.jump ? r1(m.jump) : 0,
    })),
    it: items.filter((it) => !it.dead).map((it) => ({ i: nid(it), x: Math.round(it.x), y: Math.round(it.y), k: it.key })),
    ex: explosions.map((ex) => ({ i: nid(ex), c: ex.cells.map((cl) => cl.c * 100 + cl.r), t: r1(ex.t), co: ex.color, p: ex.poison ? 1 : 0, k: ex.ink ? 1 : 0 })),
    pe: allPets().map((p) => ({ i: nid(p), o: nid(p.owner), d: p.def.id, x: Math.round(p.x), y: Math.round(p.y), hp: r1(p.hp), iv: r1(p.invuln), pt: r1(p.poisonT), tg: p.target ? 1 : 0 })),
    w: wildCritters.map((w) => ({ i: nid(w), d: w.def.id, x: Math.round(w.x), y: Math.round(w.y), l: r1(w.life) })),
    wq: weatherDef().shake && env.fx > weatherDef().shake - 0.1 ? 1 : 0, // 剛地震:讓其他玩家畫面也晃
    tx: NET.fx.splice(0),
    sq: NET.sq.splice(0),
  };
}

// ====================================================================
//  一般玩家:套用快照、平滑插值
// ====================================================================
const guest = {
  fighters: new Map(), meatballs: new Map(), items: new Map(), pets: new Map(), wild: new Map(),
  ready: false,
  clear() {
    for (const k of ['fighters', 'meatballs', 'items', 'pets', 'wild']) this[k] = new Map();
    this.ready = false;
  },
  // 依 id 取出既有物件(保持同一個物件,3D 畫面才不會每次重建),沒有就新建
  sync(map, list, make, fill) {
    const next = new Map();
    const out = [];
    for (const d of list) {
      let o = map.get(d.i);
      const fresh = !o;
      if (fresh) o = make(d);
      fill(o, d, fresh);
      next.set(d.i, o);
      out.push(o);
    }
    return { map: next, list: out };
  },
  target(o, d, fresh) {
    o.tx = d.x; o.ty = d.y;
    if (fresh || Math.hypot(o.x - d.x, o.y - d.y) > TS * 2) { o.x = d.x; o.y = d.y; } // 新物件或瞬移:直接到位
  },

  apply(s) {
    if (gameState === 'menu') return; // 已回大廳,忽略晚到的快照
    // 地圖:第一次換新陣列(3D 會整張重建),之後逐格更新
    const flat = s.g;
    if (!this.ready || grid.length !== ROWS) {
      grid = [];
      for (let r = 0; r < ROWS; r++) grid.push(Array.from({ length: COLS }, (_, c) => +flat[r * COLS + c]));
    } else {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const v = +flat[r * COLS + c];
        if (grid[r][c] !== v) grid[r][c] = v;
      }
    }
    const prevWx = env.weather;
    env.weather = s.env[0]; env.left = s.env[1]; env.t = s.env[2] || 0;
    if (this.ready && prevWx !== env.weather) announceWeather();
    if (s.wq) shakeStage();
    matchTime = s.tm;

    // 角色
    const fs = this.sync(this.fighters, s.f, (d) => {
      const f = new Player(toCol(d.x), toRow(d.y), !!d.hu, TEAM_COLOR[d.tm]);
      return f;
    }, (f, d, fresh) => {
      this.target(f, d, fresh);
      f.team = d.tm; f.label = d.n === NET.id ? '你' : d.lb; f.netId = d.n;
      f.dir = { x: d.d[0], y: d.d[1] };
      f.mvTarget = d.mv ? { x: f.tx, y: f.ty } : null;
      f.hp = d.hp; f.maxHp = d.mh; f.mp = d.mp; f.maxMp = d.mm; f.power = d.pw; f.speed = d.sp; f.maxBombs = d.mb;
      f.alive = !!d.al; f.invuln = d.iv; f.blindT = d.bt; f.poisonT = d.pt;
      f.shieldT = d.sh || 0; f.immunity = d.im; f.selected = d.se; f.inkEaten = d.ie; f.porkNext = !!d.pk;
      f.char = d.ch || 'aman'; f.skillCd = d.sc || 0; f.dashT = d.da || 0; f.boostNext = !!d.bo;
      if (d.to) f.tools = d.to;
      if (d.ps && f.petState.rat) { f.petState.rat.status = d.ps.rat; f.petState.roach.status = d.ps.roach; }
      f.heldId = d.hd;
      f.deathT = d.dt;
    });
    this.fighters = fs.map;
    env.abduct = s.ab ? { f: fs.map.get(s.ab[0]), t: s.ab[1] } : null;
    if (env.abduct && !env.abduct.f) env.abduct = null;
    const me = fs.list.find((f) => f.netId === NET.id);
    const firstFrame = !this.ready;
    // 找不到自己(名單還沒同步)就先用第一個角色當鏡頭,不讓畫面壞掉
    player = me || fs.list[0];
    bots = fs.list.filter((f) => f !== player);

    // 貢丸
    const ms = this.sync(this.meatballs, s.m, (d) => {
      const owner = this.fighters.get(d.o) || player;
      return new Meatball(toCol(d.x), toRow(d.y), meatballById(d.d), owner);
    }, (m, d, fresh) => {
      this.target(m, d, fresh);
      m.owner = this.fighters.get(d.o) || m.owner;
      m.power = d.pw; m.fuse = d.fu; m.moldy = !!d.mo; m.hp = d.hp; m.moving = !!d.mv; m.held = !!d.h; m.armed = !!d.ar; m.jump = d.jp || 0;
      if (m.def.id !== d.d) m.def = meatballById(d.d); // 香腸+米腸合體會換種類
      m._nid = d.i;
    });
    this.meatballs = ms.map;
    meatballs = ms.list;
    for (const f of fs.list) f.held = f.heldId ? (this.meatballs.get(f.heldId) || null) : null;

    // 道具
    const is = this.sync(this.items, s.it, (d) => new Item(toCol(d.x), toRow(d.y), d.k),
      (it, d, fresh) => {
        this.target(it, d, fresh); it.key = d.k;

      });
    this.items = is.map;
    items = is.list;

    // 爆炸(短暫,直接換成最新的)
    explosions = s.ex.map((e) => ({ cells: e.c.map((v) => ({ c: Math.floor(v / 100), r: v % 100 })), t: e.t, color: e.co, poison: !!e.p, ink: !!e.k }));

    // 寵物
    for (const f of fs.list) f.pets = [];
    const ps = this.sync(this.pets, s.pe, (d) => new Pet(this.fighters.get(d.o) || player, PETS[d.d]),
      (p, d, fresh) => {
        this.target(p, d, fresh);
        p.owner = this.fighters.get(d.o) || p.owner;
        p.hp = d.hp; p.invuln = d.iv; p.poisonT = d.pt; p.target = d.tg ? true : null; p.alive = true;
        p.owner.pets.push(p);
        if (p.owner.petState[p.def.id]) p.owner.petState[p.def.id].pet = p;
      });
    this.pets = ps.map;

    // 野生老鼠/蟑螂
    const ws = this.sync(this.wild, s.w, (d) => ({ def: PETS[d.d], x: d.x, y: d.y, r: TS * 0.18 }),
      (w, d, fresh) => { this.target(w, d, fresh); w.life = d.l; });
    this.wild = ws.map;
    wildCritters = ws.list;

    // 飄字
    for (const [x, y, text, color] of s.tx || []) particles.push({ x, y, text, color, life: 0.9, vy: -40 });
    for (const [name, x, y] of s.sq || []) AUDIO.play(name, x || undefined, y || undefined);

    this.ready = true;
    if (firstFrame) { buildRoster(); updateHud(); }

    // 對戰結束
    if (s.gs !== 'playing' && gameState === 'playing') {
      gameState = s.gs;
      showResult();
    }
  },

  update(dt) {
    if (gameState !== 'playing' || !this.ready) return;
    elapsed += dt;
    readPlayerInput(dt); // 只負責把方向送給房主
    const k = 1 - Math.exp(-dt * 18);
    const ease = (o) => {
      if (o.tx === undefined) return;
      o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k;
    };
    fighters().forEach(ease);
    meatballs.forEach(ease);
    items.forEach((it) => { ease(it); it.t += dt; it.age += dt; });
    allPets().forEach(ease);
    wildCritters.forEach(ease);
    for (const ex of explosions) ex.t -= dt;
    explosions = explosions.filter((ex) => ex.t > 0);
    for (const m of meatballs) if (!m.moving && !isDormant(m)) m.fuse -= dt; // 快爆時閃白
    particles = particles.filter((p) => { p.life -= dt; p.y += p.vy * dt; return p.life > 0; });
    danger = computeDanger();
    updateHud();
  },
};

// 回主選單並恢復單機(斷線、房主離開時)
function backToMenu(reason) {
  lobbyUI.hide();
  showOverlay('result-overlay', false);
  restart();
  gameState = 'menu';
  showOverlay('menu-overlay', true);
  lobbyUI.show();
  lobbyUI.status(reason, true);
}

// ====================================================================
//  連線大廳介面
// ====================================================================
const MAP_LABEL = { park: '🌳 公園', market: '🥬 菜市場', night: '🏮 夜市' };
const lobbyUI = {
  el: null,
  lastError: '',
  msg: '',
  msgErr: false,
  ensure() {
    if (this.el) return this.el;
    const stage = document.querySelector('.stage');
    if (!stage) return null;
    const el = document.createElement('div');
    el.id = 'online-overlay';
    el.className = 'overlay hidden';
    el.innerHTML = '<div class="opanel online-panel"></div>';
    stage.appendChild(el);
    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('change', (e) => this.onChange(e));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id === 'ol-code') { e.preventDefault(); this.join(); }
    });
    this.el = el;
    return el;
  },
  show() {
    const el = this.ensure();
    if (!el) return;
    showOverlay('menu-overlay', false);
    el.classList.remove('hidden');
    this.render();
  },
  hide() { if (this.el) this.el.classList.add('hidden'); },
  status(text, err) {
    this.msg = text || ''; this.msgErr = !!err;
    const s = this.el && this.el.querySelector('.ol-status');
    if (s) { s.textContent = this.msg; s.classList.toggle('err', this.msgErr); }
  },
  savedName() {
    try { return localStorage.getItem('bbw.name') || ''; } catch { return ''; }
  },
  render() {
    const el = this.ensure();
    if (!el) return;
    const panel = el.querySelector('.online-panel');
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    if (!NET.online) {
      const code = new URLSearchParams(location.search).get('room') || '';
      panel.innerHTML =
        '<div class="logo">🌐 多人連線</div>' +
        '<p class="sub">和朋友一起玩,最多 6 人;不足的位置由電腦補上</p>' +
        `<label class="ol-field">暱稱 <input id="ol-name" maxlength="12" placeholder="你的名字" value="${esc(this.savedName())}"></label>` +
        `<p class="mini">你的角色:<b>${charDef(myChar).name}</b>(在主選單更換)</p>` +
        '<button type="button" class="big primary" data-ol="create">🏮 開攤(建立攤位)</button>' +
        '<div class="ol-join">' +
        `<input id="ol-code" maxlength="6" placeholder="攤位代碼" value="${esc(code)}" autocomplete="off">` +
        '<button type="button" class="big" data-ol="join">加入</button></div>' +
        `<p class="ol-status${this.msgErr ? ' err' : ''}">${esc(this.msg)}</p>` +
        '<button type="button" class="icon-btn" data-ol="back">← 返回</button>';
      return;
    }
    const host = NET.role === 'host';
    const plan = [];
    NET.roster().slice(0, 6).forEach((p, i) => plan.push({ ...p, team: NET.teamOf(i) }));
    const rows = plan.map((p) =>
      `<li class="team-${p.team}"><span>${p.team === 'blue' ? '🔵' : '🔴'}</span>` +
      `<b>${esc(p.name)}</b>${p.host ? '<em>攤主</em>' : ''}${p.id === NET.id ? '<em>你</em>' : ''}</li>`).join('');
    const ai = Math.max(0, 6 - plan.length);
    const link = location.origin + location.pathname + '?room=' + NET.code;
    panel.innerHTML =
      '<div class="logo">🏮 攤位 <span class="ol-code">' + esc(NET.code) + '</span></div>' +
      '<p class="sub">把代碼或邀請連結傳給朋友</p>' +
      `<button type="button" class="icon-btn" data-ol="copy" data-link="${esc(link)}">🔗 複製邀請連結</button>` +
      `<ul class="ol-players">${rows}</ul>` +
      `<p class="mini">你的角色:<b>${charDef(myChar).name}</b>(電腦玩家隨機選角)</p>` +
      (ai ? `<p class="mini">其餘 ${ai} 個位置由電腦補上</p>` : '') +
      '<div class="ol-cfg">' +
      `<label>地圖 <select id="ol-map" ${host ? '' : 'disabled'}>` +
      Object.keys(MAP_LABEL).map((k) => `<option value="${k}"${NET.cfg.map === k ? ' selected' : ''}>${MAP_LABEL[k]}</option>`).join('') +
      '</select></label>' +
      `<label>分隊 <select id="ol-teams" ${host ? '' : 'disabled'}>` +
      `<option value="split"${NET.cfg.teams === 'split' ? ' selected' : ''}>真人分兩隊對打</option>` +
      `<option value="coop"${NET.cfg.teams === 'coop' ? ' selected' : ''}>真人同隊打電腦</option>` +
      '</select></label></div>' +
      (host
        ? '<button type="button" class="big primary" data-ol="start">🎮 開始對戰</button>'
        : '<p class="mini">等待攤主開始…</p>') +
      `<p class="ol-status${this.msgErr ? ' err' : ''}">${esc(this.msg)}</p>` +
      '<button type="button" class="icon-btn" data-ol="leave">✕ 離開攤位</button>';
  },
  readName() {
    const inp = this.el.querySelector('#ol-name');
    const name = (inp && inp.value.trim()) || '';
    if (!name) { this.status('請先輸入暱稱', true); if (inp) inp.focus(); return null; }
    try { localStorage.setItem('bbw.name', name); } catch { /* 無痕模式 */ }
    return name;
  },
  join() {
    const name = this.readName();
    if (!name) return;
    const code = (this.el.querySelector('#ol-code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) { this.status('請輸入 4 碼攤位代碼', true); return; }
    NET.connect('join', code, name);
  },
  onClick(e) {
    const b = e.target.closest && e.target.closest('[data-ol]');
    if (!b) return;
    const a = b.dataset.ol;
    if (a === 'create') {
      const name = this.readName();
      if (!name) return;
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = Array.from(crypto.getRandomValues(new Uint8Array(4)), (v) => chars[v % 32]).join('');
      NET.connect('create', code, name);
    } else if (a === 'join') this.join();
    else if (a === 'start') NET.startOnline();
    else if (a === 'leave') { NET.leave(); this.status(''); this.render(); }
    else if (a === 'back') { this.hide(); showOverlay('menu-overlay', true); }
    else if (a === 'copy') {
      const link = b.dataset.link;
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
        .then(() => this.status('已複製邀請連結'))
        .catch(() => this.status(link));
    } else if (a === 'again') NET.restartMatch();
    else if (a === 'lobby') NET.backToLobby();
    else if (a === 'quit') { NET.leave(); backToMenu(''); }
  },
  onChange(e) {
    if (NET.role !== 'host') return;
    if (e.target.id === 'ol-map') NET.cfg.map = e.target.value;
    if (e.target.id === 'ol-teams') NET.cfg.teams = e.target.value;
    NET.raw({ t: 'cfg', map: NET.cfg.map, teams: NET.cfg.teams });
    this.render();
  },
  // 結算畫面:連線時換成房主的「再來一場/回大廳」或玩家的等待提示
  resultButtons() {
    const panel = document.querySelector('#result-overlay .result-box');
    if (!panel) return;
    let box = panel.querySelector('.ol-result');
    if (!box) {
      box = document.createElement('div');
      box.className = 'ol-result';
      box.addEventListener('click', (e) => this.onClick(e));
      panel.appendChild(box);
    }
    const again = document.getElementById('btn-again');
    if (again) again.style.display = 'none';
    const menu = document.getElementById('btn-menu');
    if (menu) menu.style.display = 'none';
    box.innerHTML = NET.role === 'host'
      ? '<button type="button" class="big primary" data-ol="again">🔄 再來一場</button>' +
        '<button type="button" class="big" data-ol="lobby">🏮 回攤位</button>'
      : '<p class="mini">等待攤主開始下一場…</p><button type="button" class="icon-btn" data-ol="quit">✕ 離開攤位</button>';
  },
};

// 單機時還原結算按鈕
function restoreResultButtons() {
  const again = document.getElementById('btn-again');
  if (again) again.style.display = '';
  const menu = document.getElementById('btn-menu');
  if (menu) menu.style.display = '';
  const box = document.querySelector('#result-overlay .ol-result');
  if (box) box.remove();
}

// 開始畫面的「多人連線」按鈕;網址帶 ?room= 時直接打開大廳
(function initOnlineButton() {
  const btn = document.getElementById('btn-online');
  if (btn) btn.addEventListener('click', () => lobbyUI.show());
})();
