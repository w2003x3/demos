// ====================================================================
//  新手教學關卡(2D / 3D 共用)
//  固定的小練習場,一步一步完成任務才進下一步;不計時、被炸到會原地重來
//  game.js 的 update() 在教學中改呼叫 tutorial.update(),restart() 會結束教學
// ====================================================================
(function () {
  const START = { col: 3, row: 5 };
  const LONG = 1e9; // 教學擺放的貢丸:不會自己爆、也不會發霉

  // 擺一顆不會自己爆的貢丸(給吸塵器 / 寵物練習用)
  function longBall(c, r) {
    const m = new Meatball(c, r, meatballById(1), player);
    m.fuse = LONG; m.moldTime = LONG;
    meatballs.push(m);
    return m;
  }
  // 清掉某格的掉落物,改放指定道具(讓箱子/垃圾桶的掉落固定,好教學)
  function replaceDrop(c, r, key) {
    items = items.filter((it) => !(it.col === c && it.row === r));
    spawnItem(c, r, key);
  }
  const has = (ref) => ref && items.includes(ref);

  // 每一步:title 標題、text 說明、setup 佈置場地、done 完成條件
  const STEPS = [
    {
      title: '移動',
      text: '用 <kbd>方向鍵</kbd>/<kbd>WASD</kbd> 移動(手機:點地圖一下就會走過去)。<br>走到 🍄 香菇那裡,把它撿起來。',
      setup(s) { spawnItem(7, 5, 'mushroom'); s.item = items[items.length - 1]; },
      done(s) { return !has(s.item); },
    },
    {
      title: '放貢丸、躲起來',
      text: '走到 📦 木箱旁邊,按 <kbd>空白鍵</kbd>(手機:點自己兩下)放貢丸,<br>然後<b>馬上躲到柱子後面</b>。火焰是十字形,轉角最安全。',
      setup() { grid[5][9] = TILE.BRICK; },
      done() { return grid[5][9] !== TILE.BRICK; },
    },
    {
      title: '撿裝備',
      text: '木箱炸開掉出了 🦺 <b>防爆衣</b>,去撿起來。<br>撿到後可以擋下一次爆炸,左側面板的 🛡️ 數字會 +1。',
      setup(s) { replaceDrop(9, 5, 'blastsuit'); s.item = items[items.length - 1]; },
      done(s) { return !has(s.item); },
    },
    {
      title: '吃東西變強',
      text: '🗑️ 垃圾桶裡多半是食物。把下面的垃圾桶炸開,撿起裡面的 🌶️ <b>辣椒</b>,<br>你的「威力」(火焰長度)會 +1。',
      setup(s) {
        grid[7][9] = TILE.TRASH;
        s.power = player.power;
      },
      update(s) {
        // 垃圾桶剛被炸開 → 固定掉出辣椒
        if (!s.dropped && grid[7][9] !== TILE.TRASH) { s.dropped = true; replaceDrop(9, 7, 'chili'); }
      },
      done(s) { return player.power > s.power; },
    },
    {
      title: '換貢丸',
      text: '共有 9 種貢丸,個性都不一樣。按 <kbd>2</kbd>(或點右側的 2 號)<br>換成「撒尿牛丸」:踢出去會在牆間反彈。',
      done() { return player.selected === 2; },
    },
    {
      title: '踢貢丸(用 MP)',
      text: '放下一顆貢丸,退開一格後<b>轉身面向它</b>,按 <kbd>E</kbd> 把它踢出去。<br>踢貢丸會消耗 💧 MP(每滑一格 ' + RIDE_MP_PER_TILE + '),MP 每秒會自己回 ' + MP_REGEN + '。',
      setup() { player.mp = player.maxMp; },
      done() { return meatballs.some((m) => m.owner === player && m.moving); },
    },
    {
      title: '防護盾',
      text: '按 <kbd>G</kbd> 花 ' + SHIELD_MP_COST + ' MP 開防護盾,效果跟防爆衣一樣能擋一次爆炸。<br>危急時記得留一點 MP 保命!',
      setup(s) { s.guard = player.blastGuard; },
      // 上一步踢出的貢丸滑行會一直扣 MP,這裡保證至少夠開一次盾
      update() { if (player.mp < SHIELD_MP_COST) player.mp = SHIELD_MP_COST; },
      done(s) { return player.blastGuard > s.guard; },
    },
    {
      title: '吸塵器拆彈',
      text: '右邊擺了一顆貢丸。站到同一排、<b>面向它</b>,按 <kbd>Q</kbd> 用 🧹 吸塵器吸掉。<br>被逼到角落時,工具能救命(🚛垃圾車 <kbd>F</kbd> 可清一整排)。',
      setup(s) {
        meatballs = meatballs.filter((m) => m.fuse < LONG / 2);
        s.ball = longBall(11, 5);
        player.tools.vacuum = Math.max(player.tools.vacuum || 0, 1);
      },
      done(s) { return s.ball.eaten; },
    },
    {
      title: '放出寵物',
      text: '右下角又有一顆貢丸。按 <kbd>K</kbd> 放出 🐭 老鼠,<br>牠會自己跑去把貢丸<b>啃掉,不會爆炸</b>(但牠也會啃你自己的貢丸)。',
      setup(s) {
        meatballs = meatballs.filter((m) => m.fuse < LONG / 2);
        s.ball = longBall(11, 9);
        if (player.petState.rat.status === 'dead') revivePet(player);
      },
      done(s) { return s.ball.eaten; },
    },
    {
      title: '收回寵物',
      text: '做得好!再按一次 <kbd>K</kbd> 把老鼠收回來。<br>⚠️ 看到 🧀老鼠藥/🧴蟑螂藥 要先收回,寵物吃到會死掉。',
      done() { return player.petState.rat.status !== 'out'; },
    },
    {
      title: '實戰:炸倒敵人',
      text: '下面出現了一個 🔴 <b>稻草人敵人</b>(不會動也不會反擊)。<br>用學到的方法把它炸倒!小心別炸到自己。',
      setup(s) {
        const d = new Player(7, 9, false, TEAM_COLOR.red);
        d.team = 'red'; d.label = '稻草人';
        d.maxHp = 1; d.hp = 1; d.speed = 0; d.maxBombs = 0; d.aiBombCd = Infinity;
        bots = [d];
        s.dummy = d;
        buildRoster();
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
        '<div class="tut-text">你已經學會所有基本操作。其他貢丸、道具、天氣與發霉,隨時可以按「❓ 說明」查看。</div>' +
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
      env.temp = 18; env.humidity = 45; // 溫和天氣:貢丸約 3 秒才爆,不會發霉
      respawn();
      buildRoster();
      updateHud();
      T.active = true;
      enterStep(0);
    },
    stop() {
      T.active = false;
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
      respawn();
      if (T.step < STEPS.length) enterStep(T.step);
    },
    update(dt) {
      env.temp = 18; env.humidity = 45;
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
        spawnText(player.x, player.y - TS * 0.7, '✔ ' + st.title, '#aed581');
      }
    },
  };
  window.tutorial = T;

  const btn = document.getElementById('btn-tutorial');
  if (btn) btn.addEventListener('click', () => T.start());
})();
