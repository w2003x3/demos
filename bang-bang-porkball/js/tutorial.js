// ====================================================================
//  新手教學關卡(2D / 3D 共用)
//  固定的小練習場,一步一步完成任務才進下一步;不計時、被炸到會原地重來
//  內容:基本操作 → 貢丸 → 食物/小吃 → 6 種工具 → 2 隻寵物 → 實戰
//  game.js 的 update() 在教學中改呼叫 tutorial.update(),restart() 會結束教學
// ====================================================================
(function () {
  const START = { col: 3, row: 5 };
  const LONG = 1e9; // 教學擺放的貢丸:不會自己爆

  // 擺一顆不會自己爆的貢丸(給工具 / 寵物練習用)
  function longBall(c, r) {
    const m = new Meatball(c, r, meatballById(1), player);
    m.fuse = LONG;
    meatballs.push(m);
    return m;
  }
  const clearLong = () => { meatballs = meatballs.filter((m) => m.fuse < LONG / 2); };
  // 清掉某格的掉落物(可改放指定道具),讓箱子/垃圾桶的掉落固定,好教學
  function replaceDrop(c, r, key) {
    items = items.filter((it) => !(it.col === c && it.row === r));
    if (key) { spawnItem(c, r, key); return items[items.length - 1]; }
    return null;
  }
  // 在指定格子放道具,回傳道具物件
  function put(c, r, key) {
    items = items.filter((it) => !(it.col === c && it.row === r));
    const it = new Item(c, r, key);
    items.push(it);
    return it;
  }
  const has = (ref) => ref && items.includes(ref);
  const gone = (list) => list.every((it) => !has(it));
  // 稻草人敵人:不會動也不會反擊
  function dummy(c, r) {
    const d = new Player(c, r, false, TEAM_COLOR.red);
    d.team = 'red'; d.label = '稻草人';
    d.maxHp = 1; d.hp = 1; d.speed = 0; d.maxBombs = 0; d.aiBombCd = Infinity;
    bots = [d];
    buildRoster();
    return d;
  }
  const tool = (k, n = 1) => { player.tools[k] = Math.max(player.tools[k] || 0, n); };
  // 自己剛放、還沒處理過的某種貢丸
  function watchBalls(s, ids) {
    s.seen = s.seen || new Set();
    for (const m of meatballs) if (m.owner === player && ids.includes(m.def.id)) s.seen.add(m);
    return [...s.seen];
  }
  const statSum = () => player.speed + player.maxHp * 100 + player.maxMp + player.power * 1000;

  // 每一步:title 標題、text 說明、setup 佈置場地、update 每幀處理、done 完成條件
  const STEPS = [
    // ---------- 基本操作 ----------
    {
      title: '移動',
      text: '用 <kbd>方向鍵</kbd>/<kbd>WASD</kbd> 移動(手機:點地圖一下就會走過去)。<br>走到 🍄 香菇那裡,把它撿起來。',
      setup(s) { s.item = put(7, 5, 'mushroom'); },
      done(s) { return !has(s.item); },
    },
    {
      title: '放貢丸、躲起來',
      text: '走到 📦 木箱旁邊,按 <kbd>空白鍵</kbd>(手機:點自己兩下)放貢丸,<br>然後<b>馬上躲到柱子後面</b>。火焰是十字形,轉角最安全。',
      setup() { grid[5][9] = TILE.BRICK; },
      done() { return grid[5][9] !== TILE.BRICK; },
    },
    {
      title: '撿工具',
      text: '📦 木箱炸開常掉<b>工具</b>和食物。去撿 🥢 <b>食物夾</b>:<br>工具會收進左側面板,用完就沒了(後面會教每種工具怎麼用)。',
      setup(s) { s.item = replaceDrop(9, 5, 'tongs'); },
      done(s) { return !has(s.item); },
    },
    {
      title: '吃東西變強',
      text: '🗑️ 垃圾桶裡多半是<b>食物</b>。炸開下面的垃圾桶,撿起 🌶️ <b>辣椒</b>,<br>你的「威力」(火焰長度)會 +1。',
      setup(s) { grid[7][9] = TILE.TRASH; s.power = player.power; },
      update(s) {
        if (!s.dropped && grid[7][9] !== TILE.TRASH) { s.dropped = true; replaceDrop(9, 7, 'chili'); }
      },
      done(s) { return player.power > s.power; },
    },
    {
      title: '換貢丸',
      text: '共有 9 種貢丸,個性都不一樣。按 <kbd>2</kbd>(或點右側的 2 號)<br>換成「撒尿牛丸」:踢出去會在牆和人之間反彈。',
      done() { return player.selected === 2; },
    },
    {
      title: '踢貢丸(用 MP)',
      text: '放下一顆貢丸,退開一格後<b>轉身面向它</b>,按 <kbd>E</kbd> 把它踢出去。<br>踢貢丸會消耗 💧 MP(每滑一格 ' + RIDE_MP_PER_TILE + '),MP 每秒會自己回 ' + MP_REGEN + '。貢丸碰到人會停下(撒尿牛丸會彈回)。',
      setup() { player.mp = player.maxMp; },
      done() { return meatballs.some((m) => m.owner === player && m.moving); },
    },
    {
      title: '防護盾',
      text: '按 <kbd>G</kbd> 花 ' + SHIELD_MP_COST + ' MP 開防護盾:維持 ' + SHIELD_TIME + ' 秒,期間擋下一次爆炸(擋完就消失)。<br>看到火焰快到了再開,時機最重要!',
      setup(s) {},
      // 上一步踢出的貢丸滑行會一直扣 MP,這裡保證至少夠開一次盾
      update() { if (player.mp < SHIELD_MP_COST) player.mp = SHIELD_MP_COST; },
      done() { return player.shieldT > 0; },
    },

    // ---------- 9 種貢丸 ----------
    {
      title: '3 號 爆漿貢丸',
      text: '上面有兩個木箱排成一排。按 <kbd>3</kbd> 選爆漿貢丸,站在木箱左邊放下:<br><b>火焰會穿過箱子</b>,一次炸開兩個(但穿不過水泥柱)。',
      setup(s) {
        grid[3][9] = TILE.BRICK; grid[3][11] = TILE.BRICK;
        player.power = Math.max(player.power, 3);
      },
      update(s) {
        // 這一步不需要掉落物,炸開就清掉
        if (grid[3][9] !== TILE.BRICK) replaceDrop(9, 3);
        if (grid[3][11] !== TILE.BRICK) replaceDrop(11, 3);
      },
      done() { return grid[3][9] !== TILE.BRICK && grid[3][11] !== TILE.BRICK; },
    },
    {
      title: '4 號 小貢丸',
      text: '按 <kbd>4</kbd> 選小貢丸:<b>未滿三顆不會自己爆</b>,適合先埋好當陷阱。<br>把 <b>3 顆排在一起</b>(上下左右相連)就會立刻一起爆;被其他貢丸炸到也會跟著爆。放完記得躲開!',
      update(s) { watchBalls(s, [4]); },
      done(s) { return [...(s.seen || [])].some((m) => m.exploded); },
    },
    {
      title: '5~8 號 噴食物貢丸',
      text: '這四種爆炸後會噴出食物:<br>5 香菇貢丸→🍄加速 · 6 芋頭貢丸→🍠HP 上限+1 · 7 香菜貢丸→🌿MP 上限+25 · 8 麻辣貢丸→🌶️火焰+1<br>選其中一種放下,炸完把噴出的食物撿起來。',
      setup(s) { s.base = null; },
      update(s) {
        const balls = watchBalls(s, [5, 6, 7, 8]);
        if (s.base === null && balls.some((m) => m.exploded)) s.base = statSum();
      },
      done(s) { return s.base !== null && statSum() > s.base; },
    },
    {
      title: '9 號 墨魚貢丸',
      text: '按 <kbd>9</kbd> 選墨魚貢丸:被炸到的人<b>畫面會變黑幾秒</b>。<br>爆炸後噴出 🦑 墨魚(會自己游走),撿起來以後被噴黑時會比較淡。',
      setup(s) { s.ink = player.inkEaten; },
      done(s) { return player.inkEaten > s.ink; },
    },

    {
      title: '🥩 黑豬肉貢丸',
      text: '1 號一般貢丸爆炸時偶爾會噴出 🥩 <b>黑豬肉</b>。先吃掉它,再放一顆貢丸:<br>這顆會變成<b>黑豬肉貢丸</b>,自己彈跳追蹤敵人(擋住就跳過去),碰到就爆。放完會恢復原本選的貢丸。',
      setup(s) { s.item = put(7, 9, 'blackpork'); s.dummy = dummy(11, 11); },
      done(s) { return !s.dummy.alive; },
    },
    {
      title: '🏮 夜市限定:大腸包小腸',
      text: '夜市地圖才有:<kbd>O</kbd> 香腸(只往上下炸)、<kbd>P</kbd> 米腸(只往左右炸)。<br>先按 <kbd>P</kbd> 放米腸,走開一格再按 <kbd>O</kbd> 在旁邊放香腸:香腸會被包成<b>大腸包小腸</b>,3×3 範圍、無視柱子!',
      setup(s) { T.nightOK = true; bots = []; buildRoster(); },
      update(s) { watchBalls(s, [13]); },
      done(s) { return [...(s.seen || [])].some((m) => m.exploded); },
    },

    // ---------- 食物、小吃、防護 ----------
    {
      title: '其他食物',
      text: '下面擺了 4 種食物,全部撿起來:<br>🍢 竹籤:可同時放的貢丸 +1 · 🥬 白蘿蔔:免疫力+(中毒、黑畫面變短)<br>🧂 胡椒粉:手套丟更遠 · 🍄‍🟫 金針菇:自己的貢丸晚一點爆(倒下時會噴出來)',
      setup(s) { s.list = [put(5, 9, 'skewer'), put(7, 9, 'radish'), put(9, 9, 'pepper'), put(11, 9, 'enoki')]; },
      done(s) { return gone(s.list); },
    },
    {
      title: '台灣小吃神器',
      text: '稀有的小吃會把能力直接拉滿,最上面一排全部吃掉:<br>🍗 雞排:HP 補滿 · 🍡 豬血糕:MP 補滿 · 🧋 早餐店奶茶:速度拉滿 · 🧋 珍奶:貢丸數拉滿<br>🥡 臭豆腐:火焰拉滿 · 🧧 <b>福袋:全部能力一次拉滿</b>(超稀有)',
      setup(s) {
        s.list = ['chicken', 'bloodcake', 'milktea', 'boba', 'tofu', 'luckybag'].map((k, i) => put(3 + i * 2, 1, k));
      },
      done(s) { return gone(s.list); },
    },

    // ---------- 工具 ----------
    {
      title: '🧹 吸塵器',
      text: '右邊擺了一顆貢丸。站到同一排、<b>面向它</b>,按 <kbd>Q</kbd> 用吸塵器吸掉。<br>被逼到角落時,工具能救命。',
      setup(s) { clearLong(); s.ball = longBall(11, 5); tool('vacuum'); },
      done(s) { return s.ball.eaten; },
    },
    {
      title: '🚛 垃圾車',
      text: '右邊一排有兩顆貢丸。站到同一排、面向它們,按 <kbd>F</kbd>:<br>垃圾車會把<b>前方整排</b>貢丸一次清光。',
      setup(s) { clearLong(); s.balls = [longBall(9, 7), longBall(11, 7)]; tool('garbage'); },
      done(s) { return s.balls.every((m) => m.eaten); },
    },
    {
      title: '🥢 食物夾',
      text: '走到上面那顆貢丸旁、面向它,按 <kbd>Z</kbd> 夾起來帶著走,<br>走到別的地方再按一次 <kbd>Z</kbd> 放下。',
      setup(s) { clearLong(); s.ball = longBall(7, 3); tool('tongs'); },
      update(s) { if (s.ball.held) s.picked = true; },
      done(s) { return s.picked && !s.ball.held; },
    },
    {
      title: '🧤 隔熱手套',
      text: '面向上面那顆貢丸(或站在貢丸上),按 <kbd>X</kbd> 把它<b>往前丟</b>出去,<br>可以丟過箱子和牆。🧂 胡椒粉能讓你丟更遠。',
      setup(s) { clearLong(); s.ball = longBall(5, 3); tool('glove'); s.n = player.tools.glove; },
      done(s) { return player.tools.glove < s.n; },
    },
    {
      title: '🏹 彈弓',
      text: '右下角出現一個 🔴 稻草人。站到跟它同一排或同一列、面向它,<br>按 <kbd>C</kbd>:彈弓會把貢丸射向前方第一個人,<b>命中立刻爆炸</b>。',
      setup(s) { clearLong(); s.dummy = dummy(11, 11); tool('slingshot'); },
      done(s) { return !s.dummy.alive; },
    },

    // ---------- 寵物 ----------
    {
      title: '🐭 放出老鼠',
      text: '右邊有一顆貢丸。按 <kbd>K</kbd> 放出老鼠,牠會自己跑去把貢丸<b>啃掉,不會爆炸</b>。<br>老鼠啃得快但跑得慢;牠也會啃你自己的貢丸。',
      setup(s) {
        bots = []; buildRoster();
        clearLong();
        s.ball = longBall(11, 9);
        if (player.petState.rat.status === 'dead') revivePet(player);
      },
      done(s) { return s.ball.eaten; },
    },
    {
      title: '🪳 放出蟑螂',
      text: '左下角又有一顆貢丸。按 <kbd>L</kbd> 放出蟑螂:<b>跑得快但啃得慢</b>。<br>兩隻寵物可以同時放出,一起幫你拆彈。🩴 藍白拖 <kbd>V</kbd> 可以踩附近的寵物。',
      setup(s) {
        clearLong();
        s.ball = longBall(3, 9);
        if (player.petState.roach.status === 'dead') revivePet(player);
      },
      done(s) { return s.ball.eaten && player.petState.roach.status === 'out'; },
    },

    // ---------- 實戰 ----------
    {
      title: '實戰:炸倒敵人',
      text: '下面出現了一個 🔴 <b>稻草人敵人</b>(不會動也不會反擊)。<br>用貢丸把它炸倒!小心別炸到自己。',
      setup(s) {
        // 寵物會啃掉炸稻草人的貢丸:先收回
        for (const id of ['rat', 'roach']) if (player.petState[id].status === 'out') recallPet(player, id);
                clearLong();
        s.dummy = dummy(7, 9);
      },
      done(s) { return !s.dummy.alive; },
    },
  ];

  // ---------- 畫面上方的任務提示 ----------
  let banner = null;
  function ensureBanner() {
    if (banner) return banner;
    const stage = document.querySelector('.stage');
    if (!stage) return null;
    banner = document.createElement('div');
    banner.id = 'tutorial-banner';
    banner.className = 'tutorial-banner hidden';
    banner.addEventListener('click', (e) => {
      const act = e.target.closest && e.target.closest('[data-tut]');
      if (!act) return;
      e.preventDefault();
      act.blur();
      const a = act.dataset.tut;
      if (a === 'skip' || a === 'menu') T.quitToMenu();
      else if (a === 'play') startMatch();
      else if (a === 'retry') T.retry();
      else if (a === 'next') { meatballs = []; explosions = []; enterStep(T.step + 1, '⏭ 已跳過'); }
    });
    stage.appendChild(banner);
    return banner;
  }
  function render(flash) {
    const b = ensureBanner();
    if (!b) return;
    b.classList.remove('hidden');
    if (T.step >= STEPS.length) {
      b.innerHTML =
        '<div class="tut-head">🎉 教學完成!</div>' +
        '<div class="tut-text">你已經認識所有貢丸、道具和寵物了。忘記的話,隨時可以按「❓ 說明」查看。</div>' +
        '<div class="tut-btns"><button type="button" class="big primary" data-tut="play">🎮 開始正式對戰</button>' +
        '<button type="button" class="big" data-tut="menu">回主選單</button></div>';
      return;
    }
    const st = STEPS[T.step];
    b.innerHTML =
      `<div class="tut-head"><span class="tut-num">${T.step + 1}/${STEPS.length}</span>${st.title}` +
      (flash ? `<span class="tut-flash">${flash}</span>` : '') + '</div>' +
      `<div class="tut-text">${st.text}</div>` +
      '<div class="tut-btns small"><button type="button" class="icon-btn" data-tut="retry">↺ 重來這步</button>' +
      '<button type="button" class="icon-btn" data-tut="next">⏭ 跳過這步</button>' +
      '<button type="button" class="icon-btn" data-tut="skip">✕ 離開教學</button></div>';
  }

  function enterStep(i, flash) {
    T.step = i;
    T.s = {};
    T.wait = 0;
    if (i < STEPS.length && STEPS[i].setup) STEPS[i].setup(T.s);
    render(flash);
  }

  // 固定的練習場:外牆 + 柱子,沒有隨機箱子/草叢
  function buildArena() {
    grid = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const wall = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1 || (r % 2 === 0 && c % 2 === 0);
        row.push(wall ? TILE.SOLID : TILE.EMPTY);
      }
      grid.push(row);
    }
  }

  function respawn() {
    player.alive = true;
    player.hp = player.maxHp;
    player.poisonT = 0; player.blindT = 0;
    player.x = tileCenter(START.col); player.y = tileCenter(START.row);
    player.mvTarget = null; player.autoPath = null; player.held = null;
    player.invuln = 1.5;
  }

  const T = {
    active: false,
    step: 0,
    s: {},
    wait: 0,
    start() {
      startMatch();              // 借用一般開局流程(隱藏選單、建立玩家)
      buildArena();
      bots = [];
      meatballs = []; items = []; explosions = [];
      setWeather('cool'); env.left = 1e9; // 教學固定涼爽:貢丸約 3.6 秒才爆、不變天
      announceWeather();
      respawn();
      buildRoster();
      updateHud();
      T.active = true;
      enterStep(0);
    },
    stop() {
      T.active = false;
      T.nightOK = false;
      if (banner) banner.classList.add('hidden');
    },
    quitToMenu() {
      T.stop();
      restart();
      gameState = 'menu';
      showOverlay('menu-overlay', true);
    },
    // 重來這步:回到起點、清掉場上的貢丸,重新佈置
    retry() {
      if (!T.active) return;
      meatballs = []; explosions = [];
      for (const id of ['rat', 'roach']) if (player.petState[id].status === 'out') recallPet(player, id);
      respawn();
      if (T.step < STEPS.length) enterStep(T.step);
    },
    update(dt) {
      env.weather = 'cool'; env.left = 1e9;
      if (!player.alive) {       // 被炸到 → 原地重來這一步
        meatballs = meatballs.filter((m) => m.fuse >= LONG / 2);
        respawn();
        render('💥 被炸到了!再試一次');
        return;
      }
      if (T.step >= STEPS.length) return;
      const st = STEPS[T.step];
      if (st.update) st.update(T.s);
      if (T.wait > 0) {          // 完成後停一下,讓玩家看到成果
        T.wait -= dt;
        if (T.wait <= 0) enterStep(T.step + 1, '✔ 完成!');
        return;
      }
      if (st.done(T.s)) {
        T.wait = 0.8;
        sfx('step');
        spawnText(player.x, player.y - TS * 0.7, '✔ ' + st.title, '#aed581');
      }
    },
  };
  window.tutorial = T;

  const btn = document.getElementById('btn-tutorial');
  if (btn) btn.addEventListener('click', () => T.start());
})();
