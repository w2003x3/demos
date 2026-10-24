// ====================================================================
//  炸裂丸子 — 貢丸版炸彈超人
//  純前端 Canvas 遊戲。依賴 config.js 的常數與定義。
// ====================================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = W;
canvas.height = H;

// ---------- 2D 圖片資產(由 3D 寫實模型渲染,見 tools/sprites/)----------
// 貢丸 id(1~13)對應的圖檔名
const MB_SPRITE = Array.from({ length: 13 }, (_, i) => 'mb_' + (i + 1));
// 各主題的地圖物件圖:有多款時依格子座標固定挑一款(外圈用 wall,左右兩側用轉 90° 的 wallSide,內部柱子用 solid)
const TILE_SPRITES = {
  park:   { floor: ['floor1', 'floor2'], wall: ['wall'], solid: ['stone'], brick: ['crate', 'crate2'],
            trash: ['trashcan'], bush: ['bush', 'bush2'], bench: ['bench_n', 'bench_s', 'bench_e', 'bench_w'] },
  market: { floor: ['market_floor1', 'market_floor2'], wall: ['market_wall', 'market_wall2'],
            wallSide: ['market_wall_side', 'market_wall2_side'], solid: ['market_stall'],
            brick: ['market_crate', 'market_crate2', 'market_crate3'], trash: ['market_trash'], bush: ['market_pile'] },
  night:  { floor: ['night_floor1', 'night_floor2'], wall: ['night_wall', 'night_wall2'],
            wallSide: ['night_wall_side', 'night_wall2_side'], solid: ['night_stall'],
            brick: ['night_table', 'night_table2'], trash: ['night_trash'], bush: ['night_boxes'] },
};
// 地圖物件圖是 1 格寬、1.25 格高(65° 俯視);畫的時候把格子深度拉回正方形
const TILE_IMG_H = 1.25 / Math.sin(65 * Math.PI / 180);
const FX_VARIANTS = 4; // 爆炸波每種 4 張
const ASSET_LIST = {
  tiles: [...new Set(Object.values(TILE_SPRITES).flatMap((t) => Object.values(t).flat()))],
  meatballs: MB_SPRITE,
  fx: ['fire', 'poison', 'ink'].flatMap((k) => Array.from({ length: FX_VARIANTS }, (_, i) => k + (i + 1))),
  items: ['mushroom', 'taro', 'cilantro', 'chili', 'skewer', 'radish', 'pepper', 'enoki',
          'squid', 'blastsuit', 'mask', 'ratbait', 'roachbait', 'vacuum', 'garbage',
          'slippers', 'tongs', 'glove', 'slingshot', 'shoes',
          'luckybag', 'chicken', 'bloodcake', 'milktea', 'boba', 'tofu', 'blackpork'],
  pets: ['rat', 'roach'],
  characters: CHAR_IDS.flatMap((c) => [c + '_blue', c + '_red']),
};

// 目前地圖主題
let currentMapId = 'park';
const theme = () => MAPS[currentMapId];
const ASSETS = {}; // key 'dir/name' → Image

function loadAssets() {
  const jobs = [];
  for (const [dir, names] of Object.entries(ASSET_LIST)) {
    for (const n of names) {
      const key = dir + '/' + n;
      const img = new Image();
      ASSETS[key] = img;
      jobs.push(new Promise((res) => { img.onload = res; img.onerror = res; }));
      img.src = 'assets/' + key + '.webp';
    }
  }
  return Promise.all(jobs);
}

// 以中心點畫 sprite(保持像素硬邊);沒載到回 false
function sprite(key, cx, cy, size) {
  const img = ASSETS[key];
  if (!img || !img.complete || !img.naturalWidth) return false;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
  return true;
}
// 以左上角與寬高畫圖(地圖物件、地板)
function spriteRect(key, x, y, w, h) {
  const img = ASSETS[key];
  if (!img || !img.complete || !img.naturalWidth) return false;
  ctx.drawImage(img, Math.round(x), Math.round(y), Math.ceil(w), Math.ceil(h));
  return true;
}
const pickVar = (list, c, r) => list[(c * 7 + r * 13) % list.length];
const meatballSprite = (def) => 'meatballs/' + MB_SPRITE[def.id - 1];
const charSprite = (e) => 'characters/' + (e.char || 'aman') + (e.team === 'red' ? '_red' : '_blue');

// ---------- 工具函式 ----------
const rand = (n) => Math.floor(Math.random() * n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tileCenter = (c) => c * TS + TS / 2;
const toCol = (x) => Math.floor(x / TS);
const toRow = (y) => Math.floor(y / TS);

// ---------- 地圖 ----------
let grid = []; // grid[r][c] = TILE.*

// 兩隊出生點(col,row):藍隊在左、紅隊在右。第一個是人類玩家。
// 出生點:前 n 個藍隊(左側)、後 n 個紅隊(右側);n = 每隊人數(對戰設定)
// 每局隨機:整張左右 / 上下翻轉(藍隊可能在右邊),同隊的出生位置再打亂
let spawnLayout = null;
let spotT = 0;   // 開局「你在這裡」亮光剩餘秒數
function rollSpawns() {
  const base = baseSpawns();
  const fx = Math.random() < 0.5, fy = Math.random() < 0.5;
  const pos = base.map((s) => [fx ? COLS - 1 - s.col : s.col, fy ? ROWS - 1 - s.row : s.row]);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const n = base.filter((s) => s.team === 'blue').length;
  const bluePos = shuffle(pos.slice(0, n)), redPos = shuffle(pos.slice(n));
  spawnLayout = { size: n, list: base.map((s, i) => {
    const [col, row] = i < n ? bluePos[i] : redPos[i - n];
    return { ...s, col, row };
  }) };
}
function teamSpawns() {
  const n = (typeof MATCH !== 'undefined' && MATCH.size) || 3;
  return spawnLayout && spawnLayout.size === n ? spawnLayout.list : baseSpawns();
}
function baseSpawns() {
  const mid = Math.floor(ROWS / 2);
  const n = (typeof MATCH !== 'undefined' && MATCH.size) || 3;
  // 每隊 4 人時沿左右兩側平均分開(1、4、8、11 列);3 人以下維持角落 + 中間
  const rows = n === 4 ? [1, 4, ROWS - 5, ROWS - 2] : [1, ROWS - 2, mid];
  const blue = rows.map((r) => [1, r]).slice(0, n);
  const red = (n === 1 ? [[COLS - 2, ROWS - 2]] : rows.map((r) => [COLS - 2, r])).slice(0, n);
  return blue.map(([col, row], i) => ({ col, row, team: 'blue', human: i === 0 }))
    .concat(red.map(([col, row]) => ({ col, row, team: 'red' })));
}

function generateMap() {
  grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1) {
        row.push(TILE.SOLID);            // 外牆
      } else if (r % 2 === 0 && c % 2 === 0) {
        row.push(TILE.SOLID);            // 內部水泥柱
      } else {
        row.push(TILE.EMPTY);
      }
    }
    grid.push(row);
  }
  // 出生點及其周圍保持淨空(讓角色不會一開局就被磚塊困住)
  const clear = [];
  for (const s of teamSpawns()) {
    clear.push([s.row, s.col]);
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      clear.push([s.row + dr, s.col + dc]);
    }
  }
  const isSpawn = (r, c) => clear.some(([sr, sc]) => sr === r && sc === c);

  const th = theme();
  // 在空地隨機灑可破壞物(木箱/蔬菜箱/摺疊桌,依主題)
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (grid[r][c] === TILE.EMPTY && !isSpawn(r, c) && Math.random() < th.brickRate) {
        grid[r][c] = TILE.BRICK;
      }
    }
  }

  // 隨機放置垃圾桶(取代部分可破壞物),炸開掉食用道具
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < th.trashCount; tries++) {
    const r = 1 + rand(ROWS - 2);
    const c = 1 + rand(COLS - 2);
    if (grid[r][c] === TILE.BRICK && !isSpawn(r, c)) {
      grid[r][c] = TILE.TRASH;
      placed++;
    }
  }
  // 長椅(公園):放在左右或上下兩根柱子之間;椅背朝其中一側,另一側是可以走進去的正面
  benches = {};
  for (let tries = 0; tries < 300 && Object.keys(benches).length < (th.benchCount || 0); tries++) {
    const horiz = Math.random() < 0.5;
    const c = horiz ? 3 + 2 * rand((COLS - 5) / 2) : 2 + 2 * rand((COLS - 3) / 2);
    const r = horiz ? 2 + 2 * rand((ROWS - 3) / 2) : 3 + 2 * rand((ROWS - 5) / 2);
    if (r < 1 || c < 1 || r > ROWS - 2 || c > COLS - 2 || isSpawn(r, c)) continue;
    const back = horiz ? (Math.random() < 0.5 ? 'n' : 's') : (Math.random() < 0.5 ? 'w' : 'e');
    const [fc, fr] = { n: [c, r + 1], s: [c, r - 1], w: [c + 1, r], e: [c - 1, r] }[back];
    if (grid[fr][fc] === TILE.SOLID || isSpawn(fr, fc)) continue;
    if (Object.values(benches).some((b) => Math.abs(b.c - c) + Math.abs(b.r - r) <= 2)) continue;   // 不要擠在一起
    grid[r][c] = TILE.BENCH;
    benches[r * COLS + c] = { c, r, back, fc, fr };
  }

  // 在空地灑草叢/菜堆/紙箱堆(可通行,可能驚動野生老鼠/蟑螂)
  let bushes = 0;
  for (let tries = 0; tries < 400 && bushes < th.bushCount; tries++) {
    const r = 1 + rand(ROWS - 2);
    const c = 1 + rand(COLS - 2);
    if (grid[r][c] === TILE.EMPTY && !isSpawn(r, c)) {
      grid[r][c] = TILE.BUSH;
      bushes++;
    }
  }
}

// 可站立地面:空地或草叢(草叢可通行)
function isFloor(c, r) {
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false;
  const t = grid[r][c];
  return t === TILE.EMPTY || t === TILE.BUSH;
}
function isBlocked(c, r) {
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return true;
  return !isFloor(c, r);
}

// 天氣:時間到就隨機變天(地圖中央大字提示);颱風定時吹走貢丸、地震讓貢丸移位
function updateWeather(dt) {
  env.t += dt;
  env.left -= dt;
  if (env.left <= 0) {
    setWeather(pickWeather(env.weather, MATCH.wx === 'safe'));   // 對戰設定:不含災害
    announceWeather();
  }
  const w = weatherDef();
  if (w.alien) updateAlien(dt);
  if (!w.gust && !w.shake) return;
  env.fx -= dt;
  if (env.fx > 0) return;
  env.fx = w.gust || w.shake;
  const live = meatballs.filter((m) => !m.exploded && !m.eaten && !m.held);
  if (w.gust) {                        // 颱風:場上貢丸全部吹走(不會爆)
    for (const m of live) { m.eaten = true; spawnText(m.x, m.y - 10, '吹走了!', '#90caf9'); }
    if (live.length) sfx('whoosh');
  } else {                             // 地震:每顆貢丸隨機往旁邊空格移一格
    for (const m of live) {
      if (m.moving) continue;
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dc, dr]) =>
        canEnterTile(m, m.col + dc, m.row + dr) &&
        !fighters().some((f) => f.alive && f.col === m.col + dc && f.row === m.row + dr));
      if (!opts.length) continue;
      const [dc, dr] = opts[rand(opts.length)];
      m.x = tileCenter(m.col + dc); m.y = tileCenter(m.row + dr);
    }
    shakeStage();
    sfx('boom');
  }
}
// 外星人來襲:隨機鎖定一位還活著的玩家(含電腦),光束照射 ALIEN_BEAM 秒後抓走(直接死亡)
function updateAlien(dt) {
  if (env.abductDone) return;
  if (!env.abduct) {
    if (env.t < 0.8) return;
    const pool = fighters().filter((f) => f.alive);
    if (!pool.length) { env.abductDone = true; return; }
    const f = pool[rand(pool.length)];
    env.abduct = { f, t: 0 };
    sfx('whoosh', f.x, f.y);
    spawnText(f.x, f.y - TS * 0.7, '🛸光束鎖定!', '#b2ff59');
    return;
  }
  const a = env.abduct;
  a.t += dt;
  if (!a.f.alive) { env.abduct = null; env.abductDone = true; return; }
  if (a.t >= ALIEN_BEAM) {
    const f = a.f;
    spawnText(f.x, f.y - TS * 0.6, '被外星人抓走了!', '#b2ff59');
    f.shieldT = 0; f.hp = 0; f.abducted = true;
    f.die();
    env.abduct = null; env.abductDone = true;
    if (f === player) updateHud();
  }
}
// 畫面變黑的程度:被墨魚貢丸炸到、火山灰取較黑的
function blindAlpha() {
  if (!player) return 0;
  let a = 0;
  if (player.alive && player.blindT > 0) a = Math.max(0.25, 0.92 - player.inkEaten * 0.15) * clamp(player.blindT / 0.6, 0, 1);
  if (weatherDef().ash) {
    const k = clamp(env.t / 1.2, 0, 1) * clamp(env.left / 0.8, 0, 1);    // 噴發時漸暗、快結束時漸亮
    a = Math.max(a, Math.max(0.7, 0.92 - player.inkEaten * 0.06) * k);   // 幾乎全黑;吃墨魚只稍微減輕
  }
  return a;
}

// 變天提示:地圖中央大字(2D/3D 都看得到)
function announceWeather() {
  const stage = document.querySelector('.stage');
  if (!stage) return;
  let el = document.getElementById('wx-banner');
  if (!el) { el = document.createElement('div'); el.id = 'wx-banner'; stage.appendChild(el); }
  const w = weatherDef();
  el.innerHTML = `<span class="wxb-icon">${w.icon}</span><span class="wxb-name">${w.name}</span><span class="wxb-desc">${w.desc}</span>`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
// 地震:畫面晃一下
function shakeStage() {
  const stage = document.querySelector('.stage');
  if (!stage) return;
  stage.classList.remove('quake'); void stage.offsetWidth; stage.classList.add('quake');
}

// ---------- 遊戲狀態 ----------
let meatballs = [];   // 場上的貢丸
let explosions = [];  // 爆炸特效格
let items = [];       // 場上道具
let particles = [];   // 文字飄字
let player;
let bots = [];            // 所有 AI 角色(藍隊隊友 + 紅隊敵人)
let gameState = 'menu'; // menu | playing | win | lose | draw
let elapsed = 0;
let matchTime = MATCH_TIME;
let usedBush = new Set();  // 已驚動過野生生物的草叢(每叢只觸發一次)
let benches = {};          // 長椅:key = r*COLS+c → {c, r, back(椅背朝向 n/s/e/w), fc, fr(正面那一格)}
const benchAt = (c, r) => benches[r * COLS + c] || null;
// 頭上顯示的名稱:自己=你(連線時用暱稱)、連線玩家=暱稱、電腦=角色名
function displayName(f) {
  if (f === player) return NET.online && NET.name ? NET.name : '你';
  if (f.isHuman || f.remote || f.netId) return (f.label || '').replace('(電腦)', '') || '玩家';
  return charDef(f.char).name;
}
// 正躺在長椅上(站定在長椅格、沒在移動)
const onBench = (e) => !!(e && e.alive && !e.mvTarget && grid[e.row] && grid[e.row][e.col] === TILE.BENCH);
let wildCritters = [];     // 被草叢驚動的野生老鼠/蟑螂(攻擊一次後自生自滅)

// 危險地圖:danger[r][c] = 幾秒後會被爆炸波及(Infinity = 安全)
let danger = null;
function computeDanger() {
  const d = Array.from({ length: ROWS }, () => Array(COLS).fill(Infinity));
  for (const m of meatballs) {
    if (m.exploded || m.eaten || isDormant(m)) continue;
    for (const cl of meatballCells(m)) {
      if (cl.r >= 0 && cl.c >= 0 && cl.r < ROWS && cl.c < COLS) {
        d[cl.r][cl.c] = Math.min(d[cl.r][cl.c], Math.max(0, m.fuse));
      }
    }
  }
  for (const ex of explosions) {
    for (const cl of ex.cells) {
      if (cl.r >= 0 && cl.c >= 0 && cl.r < ROWS && cl.c < COLS) d[cl.r][cl.c] = 0;
    }
  }
  return d;
}

// 所有參戰角色(玩家 + AI)
function fighters() { return [player, ...bots]; }
function teamAlive(team) { return fighters().filter((f) => f.team === team && f.alive).length; }

// ---------- 玩家 ----------
class Player {
  constructor(col, row, isHuman = true, color = '#3498db') {
    this.x = tileCenter(col);
    this.y = tileCenter(row);
    this.r = TS * 0.34;          // 半徑
    this.speed = 150;            // 像素/秒
    this.dir = { x: 0, y: 1 };   // 面向方向
    this.mvTarget = null;        // 格子制移動的目標格中心(null=待在格中心)
    this.autoPath = null;        // 點擊地圖後的自動走路路徑
    this.isHuman = isHuman;
    this.color = color;
    this.team = 'red';          // 'blue'(玩家隊)或 'red'(敵隊),於 restart 指定
    this.maxHp = 3; this.hp = 3;
    this.maxMp = 100; this.mp = 100;
    this.power = 2;              // 爆炸範圍
    this.maxBombs = 3;          // 同時可放數量
    this.selected = 1;          // 目前選的貢丸 id
    this.invuln = 0;            // 無敵時間
    this.poisonT = 0;           // 黴毒剩餘秒數
    this.poisonTick = 0;        // 黴毒每秒結算用
    this.shieldT = 0;           // 防護盾剩餘秒數(期間擋一次爆炸)
    this.immunity = 1;          // 免疫力:越高,負面狀態時效越短(白蘿蔔提升)
    this.enokiEaten = 0;        // 吃過的金針菇數(死亡會噴出等量)
    this.fuseBonus = 0;         // 自己貢丸的額外時效(金針菇)
    this.inkEaten = 0;          // 吃過的墨魚數(減輕黑畫面)
    this.blindT = 0;            // 黑畫面剩餘秒數(被墨魚貢丸炸到)
    this.held = null;           // 用食物夾夾著的貢丸
    this.char = 'aman';         // 角色(CHARACTERS 的 id)
    this.skillCd = 0;           // 技能冷卻剩餘秒數
    this.dashT = 0;             // 衝刺剩餘秒數
    this.boostNext = false;     // 加料:下一顆貢丸威力 +2
    this.alive = true;
    this.aiTimer = 0;
    this.aiBombCd = 0;
    // 寵物與非食用道具(只有玩家有)
    // 玩家擁有老鼠與蟑螂,可各自「放出 / 收起」,順序不拘;放出的會啃貢丸
    this.pets = [];          // 目前放出在場上的寵物
    this.petState = {};      // 每種寵物狀態:stored(收起)/ out(放出)/ dead(昏倒)
    if (isHuman) {
      for (const id of ['rat', 'roach']) {
        this.petState[id] = { def: PETS[id], status: 'stored', pet: null };
      }
    }
    // 工具卡牌:一次性工具記張數;永久卡(鋼頭鞋、隔熱手套)> 0 代表擁有
    this.tools = isHuman ? { ...START_TOOLS } : {};
    this.spaceT = 0;            // 空白鍵連按判定(丟貢丸)
    this.pushT = 0;             // 往貢丸方向推的時間(踢貢丸)
  }

  get col() { return toCol(this.x); }
  get row() { return toRow(this.y); }

  bombsPlaced() {
    return meatballs.filter((m) => m.owner === this).length;
  }

  hurt(dmg = 1) {
    if (!this.alive) return;
    if (this.invuln > 0) return;
    // 防護盾作用中:擋下這次爆炸,盾立刻失效
    if (this.shieldT > 0) {
      this.shieldT = 0;
      this.invuln = INVULN_TIME;
      sfx('block', this.x, this.y);
      spawnText(this.x, this.y - TS * 0.4, '🛡️擋下爆炸', '#ffd54f');
      return;
    }
    this.hp -= dmg;
    this.invuln = INVULN_TIME;
    sfx('hurt', this.x, this.y);
    spawnText(this.x, this.y - TS * 0.4, '-' + dmg + ' HP', '#ff5252');
    if (this.hp <= 0) { this.hp = 0; this.die(); }
  }

  // 被墨魚貢丸炸到:短暫看不到畫面(免疫力與吃墨魚可減輕)
  blind() {
    const factor = Math.max(0.3, 1 - this.inkEaten * 0.18);
    this.blindT = Math.max(this.blindT, BLIND_TIME * factor / this.immunity);
  }

  // 死亡:噴出與食用數量相同的金針菇
  die() {
    if (!this.alive) return;
    this.alive = false;
    sfx('die', this.x, this.y);
    for (let i = 0; i < this.enokiEaten; i++) {
      for (let tries = 0; tries < 6; tries++) {
        const c = clamp(this.col + rand(5) - 2, 1, COLS - 2);
        const r = clamp(this.row + rand(5) - 2, 1, ROWS - 2);
        if (grid[r][c] === TILE.EMPTY &&
            !items.some((it) => it.col === c && it.row === r)) {
          spawnItem(c, r, 'enoki');
          break;
        }
      }
    }
    if (this.enokiEaten > 0) {
      spawnText(this.x, this.y - TS * 0.5, '噴出金針菇🍄x' + this.enokiEaten, '#ffe0b2');
    }
  }

  // 黴毒每秒扣血結算
  tickPoison(dt) {
    if (this.poisonT <= 0 || !this.alive) return;
    this.poisonT -= dt;
    this.poisonTick += dt;
    while (this.poisonTick >= 1) {
      this.poisonTick -= 1;
      this.hp -= POISON_DPS;
      spawnText(this.x, this.y - TS * 0.4, '-' + POISON_DPS + ' 毒', '#9ccc65');
      if (this.hp <= 0) { this.hp = 0; this.die(); }
    }
  }
}

// ---------- 貢丸(炸彈) ----------
class Meatball {
  constructor(col, row, def, owner) {
    this.x = tileCenter(col);
    this.y = tileCenter(row);
    this.def = def;
    this.owner = owner;
    this.power = owner.power;
    // 引信 = 放置當下天氣決定的「可食用時效」(金針菇可延長自己貢丸時效)
    const bonus = owner.fuseBonus || 0;
    this.fuse = computeFuse() + bonus;
    this.age = 0;
    this.moldy = false; // 貢丸不會發霉(發霉改在地上的道具)
    this.exploded = false;
    this.hp = MEATBALL_HP;      // 貢丸自己的 HP(只有寵物能咬)
    this.eaten = false;         // 被寵物吃光 → 直接移除,不爆炸
    // 滑行(被踢)用
    this.vx = 0; this.vy = 0; this.moving = false;
    this.held = false; // 是否被食物夾夾著
    this.bouncesLeft = def.bounces || 0;
    if (def.behavior === 'cluster') this.decay = computeMiniDecay(); // 未啟動的小貢丸會發霉分解
    if (def.behavior === 'homing') { this.hopT = 0.5; this.hop = null; this.jump = 0; }
  }
  get col() { return toCol(this.x); }
  get row() { return toRow(this.y); }
}

// ---------- 寵物 ----------
// 自動衝向最近的貢丸啃咬;咬到貢丸 HP 歸零就吃掉(不會爆炸)
class Pet {
  constructor(owner, def) {
    this.owner = owner;
    this.def = def;
    this.x = owner.x;
    this.y = owner.y;
    this.r = TS * 0.2;
    this.target = null;
    // 寵物也有 HP,會被爆炸/黴毒波及
    this.maxHp = def.hp; this.hp = def.hp;
    this.alive = true;
    this.invuln = 0;
    this.poisonT = 0; this.poisonTick = 0;
  }
  get col() { return toCol(this.x); }
  get row() { return toRow(this.y); }

  hurt(dmg = 1, poison = false) {
    if (!this.alive) return;
    if (poison) {
      this.poisonT = POISON_TIME; this.poisonTick = 0;
      spawnText(this.x, this.y - TS * 0.5, '寵物中毒🤢', '#7cb342');
    }
    if (this.invuln > 0) return;
    this.hp -= dmg;
    this.invuln = INVULN_TIME;
    if (this.hp <= 0) {
      this.hp = 0; this.alive = false;
      spawnText(this.x, this.y - TS * 0.4, this.def.emoji + '昏倒了', '#ff8a80');
    }
  }

  tickPoison(dt) {
    if (this.invuln > 0) this.invuln -= dt;
    if (this.poisonT <= 0 || !this.alive) return;
    this.poisonT -= dt; this.poisonTick += dt;
    while (this.poisonTick >= 1) {
      this.poisonTick -= 1;
      this.hp -= POISON_DPS;
      if (this.hp <= 0) {
        this.hp = 0; this.alive = false;
        spawnText(this.x, this.y - TS * 0.4, this.def.emoji + '毒倒了', '#9ccc65');
        return;
      }
    }
  }

  update(dt) {
    if (!this.alive) return;

    // 找最近且未在滑行的貢丸當目標
    if (!this.target || this.target.exploded || this.target.eaten ||
        this.target.moving || this.target.held) {
      this.target = null;
      let best = Infinity;
      for (const m of meatballs) {
        if (m.exploded || m.eaten || m.moving || m.held) continue;
        const d = (m.x - this.x) ** 2 + (m.y - this.y) ** 2;
        if (d < best) { best = d; this.target = m; }
      }
    }
    const goal = this.target || this.owner; // 沒貢丸就跟著主人
    // 沿通道移動(不能跨越牆/磚/垃圾桶);若目標被牆擋住就先跟著主人
    if (!petStep(this, goal.x, goal.y, dt) && this.target) {
      petStep(this, this.owner.x, this.owner.y, dt);
    }
    // 靠近目標貢丸就啃咬(老鼠咬擊較高、蟑螂較低)
    const dist = Math.hypot(goal.x - this.x, goal.y - this.y);
    if (this.target && dist < TS * 0.55) {
      this.target.hp -= this.def.bite * dt;
      if (Math.random() < dt * 6) spawnText(this.target.x, this.target.y - 12, '啃!', '#ffd479');
      if (this.target.hp <= 0) {
        this.target.eaten = true;
        sfx('chomp', this.x, this.y);
        spawnText(this.target.x, this.target.y - 14, this.def.emoji + '吃掉了!', '#aed581');
        this.target = null;
      }
    }
  }
}

// 寵物用:BFS 找從 (sc,sr) 到 (gc,gr) 的第一步方向(只能走空地);無路回 null
function bfsNextStep(sc, sr, gc, gr) {
  if (sc === gc && sr === gr) return null;
  const hasMeatball = (c, r) =>
    meatballs.some((m) => !m.exploded && !m.held && m.col === c && m.row === r);
  // 寵物只能走地面(空地/草叢),不能穿越牆/木箱/垃圾桶,也不能穿越貢丸
  const passable = (c, r) => isFloor(c, r) && !hasMeatball(c, r);
  const key = (c, r) => r * COLS + c;
  const prev = new Map();
  const seen = new Set([key(sc, sr)]);
  const q = [[sc, sr]];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (q.length) {
    const [c, r] = q.shift();
    for (const [dc, dr] of dirs) {
      const nc = c + dc, nr = r + dr;
      const k = key(nc, nr);
      if (seen.has(k)) continue;
      const isGoal = nc === gc && nr === gr;
      if (!isGoal && !passable(nc, nr)) continue; // 目標格一律可達
      seen.add(k);
      prev.set(k, [c, r]);
      if (isGoal) {
        let cur = [nc, nr];
        while (true) {
          const p = prev.get(key(cur[0], cur[1]));
          if (p[0] === sc && p[1] === sr) return [cur[0] - sc, cur[1] - sr];
          cur = p;
        }
      }
      q.push([nc, nr]);
    }
  }
  return null;
}

// 讓寵物朝目標移動一步(同格則直接靠近);有移動回 true,無路可走回 false
function petStep(pet, gx, gy, dt) {
  const sc = pet.col, sr = pet.row, gc = toCol(gx), gr = toRow(gy);
  let wx, wy;
  if (sc === gc && sr === gr) {
    wx = gx; wy = gy;
  } else {
    const step = bfsNextStep(sc, sr, gc, gr);
    if (!step) return false;            // 被牆擋住,過不去
    wx = tileCenter(sc + step[0]);
    wy = tileCenter(sr + step[1]);
  }
  const dx = wx - pet.x, dy = wy - pet.y, d = Math.hypot(dx, dy) || 1;
  const mv = pet.def.speed * dt;
  pet.x += (dx / d) * Math.min(mv, d);
  pet.y += (dy / d) * Math.min(mv, d);
  return true;
}

// ---------- 道具 ----------
class Item {
  constructor(col, row, key) {
    this.x = tileCenter(col);
    this.y = tileCenter(row);
    this.key = key;
    this.t = 0;
    this.age = 0;
    // 墨魚會在小範圍內自行游走
    this.wander = key === 'squid';
    if (this.wander) {
      this.hx = this.x; this.hy = this.y;
      const a = Math.random() * Math.PI * 2;
      this.vx = Math.cos(a); this.vy = Math.sin(a);
      this.wt = 0;
    }
  }
  get col() { return toCol(this.x); }
  get row() { return toRow(this.y); }

  update(dt) {
    if (!this.wander) return;
    this.wt -= dt;
    if (this.wt <= 0) {
      const a = Math.random() * Math.PI * 2;
      this.vx = Math.cos(a); this.vy = Math.sin(a);
      this.wt = 0.5 + Math.random();
    }
    const sp = 45 * dt;
    const nx = this.x + this.vx * sp, ny = this.y + this.vy * sp;
    // 限制在出生點附近,且不穿牆
    if (Math.hypot(nx - this.hx, ny - this.hy) > TS * 1.3 ||
        isBlocked(toCol(nx), toRow(ny))) {
      this.vx *= -1; this.vy *= -1;
    } else {
      this.x = nx; this.y = ny;
    }
  }
}

// ---------- 飄字 ----------
function spawnText(x, y, text, color) {
  particles.push({ x, y, text, color, life: 0.9, vy: -40 });
  if (NET.role === 'host') NET.fx.push([Math.round(x), Math.round(y), text, color]); // 連線:同步給其他玩家
}

// ====================================================================
//  放置 / 引爆貢丸
// ====================================================================
function placeMeatball(p) {
  if (!p.alive) return; // 倒下後不能再放貢丸
  if (p.bombsPlaced() >= p.maxBombs) return;
  const c = p.col, r = p.row;
  if (grid[r][c] === TILE.BENCH) { hint(p, '長椅上不能放貢丸'); return; }
  // 該格已有貢丸則不放
  if (meatballs.some((m) => m.col === c && m.row === r)) return;
  // 吃過黑豬肉:這一顆一定是黑豬肉貢丸,放完恢復原本的選擇
  const pork = !!p.porkNext;
  let def = pork ? meatballById(10) : meatballById(p.selected);
  if (def.night && !nightFoodAllowed()) def = meatballById(1); // 夜市限定只能在夜市用
  const m = new Meatball(c, r, def, p);
  if (pork) { p.porkNext = false; m.fuse += PORK_FUSE_BONUS; spawnText(p.x, p.y - TS * 0.6, '🥩黑豬肉貢丸出動!', '#ff8a80'); }
  if (p.boostNext) { p.boostNext = false; m.power += 2; spawnText(p.x, p.y - TS * 0.6, '🌶️加料貢丸!', '#ff7043'); }
  meatballs.push(m);
  sfx('place', p.x, p.y);
  if (def.night) checkWrap(m);
  if (p === player) updateHud();
}

// 某顆貢丸爆炸會波及的格子(依種類:十字 / 只垂直 / 只水平 / 3×3)
function meatballCells(m) {
  const c = m.col, r = m.row;
  if (m.def.behavior === 'square') { // 大腸包小腸:3×3 方格,無視柱子
    const cells = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const cc = c + dc, rr = r + dr;
      if (cc >= 0 && rr >= 0 && cc < COLS && rr < ROWS) cells.push({ c: cc, r: rr });
    }
    return cells;
  }
  return blastCells(c, r, m.power, m.def.behavior === 'pierce', m.def.axis);
}

// 夜市限定的香腸/米腸能不能用(夜市地圖,或教學示範時)
function nightFoodAllowed() {
  return currentMapId === 'night' || !!(window.tutorial && tutorial.active && tutorial.nightOK);
}

// 香腸放在米腸旁(或反過來):香腸被米腸包住 → 大腸包小腸,引信重新計時
function checkWrap(m) {
  const want = m.def.id === 11 ? 12 : 11;
  const other = meatballs.find((o) => o !== m && o.def.id === want && !o.exploded && !o.eaten &&
    !o.moving && !o.held && Math.abs(o.col - m.col) + Math.abs(o.row - m.row) === 1);
  if (!other) return;
  const rice = m.def.id === 12 ? m : other;
  const saus = rice === m ? other : m;
  // 香腸被吸進米腸 → 在米腸的位置換成一顆新的大腸包小腸(引信重新計時,算在完成合體的人身上)
  saus.eaten = true;
  rice.eaten = true;
  const wrap = new Meatball(rice.col, rice.row, meatballById(13), m.owner);
  meatballs.push(wrap);
  spawnText(rice.x, rice.y - TS * 0.6, '🌭大腸包小腸!', '#ffb74d');
  sfx('boing', rice.x, rice.y);
}

// 計算某位置爆炸會波及的格子(共用:實際爆炸 + AI 危險預測)
// axis:'v' 只往上下、'h' 只往左右(夜市香腸/米腸)
function blastCells(c, r, power, pierce, axis) {
  const cells = [{ c, r }];
  const dirs = axis === 'v' ? [[0, 1], [0, -1]] : axis === 'h' ? [[1, 0], [-1, 0]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dc, dr] of dirs) {
    for (let i = 1; i <= power; i++) {
      const nc = c + dc * i, nr = r + dr * i;
      if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) break;
      const t = grid[nr][nc];
      if (t === TILE.SOLID) break;               // 水泥柱永遠擋住
      if (t === TILE.BRICK || t === TILE.TRASH) {
        cells.push({ c: nc, r: nr });
        if (pierce) continue;                    // 爆漿貢丸:穿越障礙繼續
        break;                                   // 一般貢丸:在障礙處停下
      }
      cells.push({ c: nc, r: nr });
    }
  }
  return cells;
}

function explodeMeatball(m) {
  if (m.exploded) return;
  m.exploded = true;
  const c = m.col, r = m.row;
  const cells = meatballCells(m);
  sfx(m.def.behavior === 'ink' ? 'splat' : 'boom', m.x, m.y);

  // 第一階段:連鎖引爆 + 摧毀爆炸範圍內「既有」道具
  // (地形掉落與特殊噴出的新道具在下方才生成,不會被這裡誤刪)
  for (const cell of cells) {
    if (cell.r < 0 || cell.c < 0 || cell.r >= ROWS || cell.c >= COLS) continue;
    for (const other of meatballs) {
      if (!other.exploded && other.col === cell.c && other.row === cell.r) {
        other.fuse = Math.min(other.fuse, 0.05);
        other.armed = true; // 小貢丸被波及也會跟著爆
      }
    }
    for (const it of items) {
      if (it.col === cell.c && it.row === cell.r) it.dead = true; // 道具被炸消失
    }
  }

  // 第二階段:破壞地形並生成掉落
  for (const cell of cells) {
    if (cell.r < 0 || cell.c < 0 || cell.r >= ROWS || cell.c >= COLS) continue;
    const tt = grid[cell.r][cell.c];
    if (tt === TILE.BRICK) {
      grid[cell.r][cell.c] = TILE.EMPTY;
      // 可破壞物(木箱/蔬菜箱/摺疊桌):55% 工具、25% 食物、8% 台灣小吃、2% 福袋、10% 空
      const rr = Math.random();
      if (rr < 0.55) spawnItem(cell.c, cell.r, toolDrop());
      else if (rr < 0.80) spawnItem(cell.c, cell.r, pick(FOOD_DROP_KEYS));
      else if (rr < 0.88) spawnItem(cell.c, cell.r, snackDrop());
      else if (rr < 0.90) spawnItem(cell.c, cell.r, 'luckybag');
    } else if (tt === TILE.TRASH) {
      grid[cell.r][cell.c] = TILE.EMPTY;
      // 垃圾桶(廚餘寶庫):2% 福袋、8% 台灣小吃、80% 基本食用道具(含竹籤)、10% 空
      const rr = Math.random();
      if (rr < 0.02) spawnItem(cell.c, cell.r, 'luckybag');
      else if (rr < 0.10) spawnItem(cell.c, cell.r, snackDrop());
      else if (rr < 0.90) spawnItem(cell.c, cell.r, pick(FOOD_DROP_KEYS.concat('skewer')));
    } else if (tt === TILE.BUSH) {
      grid[cell.r][cell.c] = TILE.EMPTY; // 草叢被炸掉 → 變回草地
    }
  }

  // 特殊貢丸:爆炸噴出對應道具(香菇/芋頭/香菜/辣椒,以及墨魚貢丸的墨魚)
  if (m.def.drop) {
    const open = cells.filter(
      (cl) => grid[cl.r][cl.c] === TILE.EMPTY &&
        !items.some((it) => !it.dead && it.col === cl.c && it.row === cl.r)
    );
    const spot = open.length ? open[rand(open.length)] : { c, r };
    spawnItem(spot.c, spot.r, m.def.drop);
    spawnText(tileCenter(spot.c), tileCenter(spot.r) - 10,
      '噴出' + ITEMS[m.def.drop].name + '!', ITEMS[m.def.drop].color);
  }

  // 1 號一般貢丸:隨機噴出黑豬肉
  if (m.def.id === 1 && Math.random() < BLACKPORK_DROP) {
    const open = cells.filter(
      (cl) => grid[cl.r][cl.c] === TILE.EMPTY &&
        !items.some((it) => !it.dead && it.col === cl.c && it.row === cl.r)
    );
    const spot = open.length ? open[rand(open.length)] : { c, r };
    spawnItem(spot.c, spot.r, 'blackpork');
    spawnText(tileCenter(spot.c), tileCenter(spot.r) - 10, '噴出黑豬肉🥩!', '#ff8a80');
  }

  explosions.push({
    cells,
    t: EXPLOSION_TIME,
    color: m.def.glow,
    poison: false,
    ink: m.def.behavior === 'ink',      // 墨魚貢丸 → 黑畫面
  });
}

function spawnItem(c, r, key) {
  if (items.some((it) => !it.dead && it.col === c && it.row === r)) return;
  items.push(new Item(c, r, key));
}

// 取得道具定義(食物 / 工具)
function itemDef(key) { return ITEMS[key] || TOOLS[key]; }

const pick = (arr) => arr[rand(arr.length)];

// 開局撒食物(菜市場):在沒有木箱的空地(不含出生點)隨機放 n 個,種類盡量不重複
function spawnStartFood(n) {
  if (!n) return;
  const spawnCells = new Set(teamSpawns().map((s) => s.row * COLS + s.col));
  const open = [];
  for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) {
    if (grid[r][c] === TILE.EMPTY && !spawnCells.has(r * COLS + c)) open.push([c, r]);
  }
  const kinds = FOOD_DROP_KEYS.concat('skewer');
  let bag = [];
  for (let i = 0; i < n && open.length; i++) {
    if (!bag.length) bag = kinds.slice().sort(() => Math.random() - 0.5);   // 一輪種類用完才重複
    const [c, r] = open.splice(rand(open.length), 1)[0];
    spawnItem(c, r, bag.pop());
  }
}

// 木箱掉的工具(永久卡較稀有)
function toolDrop() {
  const pool = [];
  for (const [k, w] of Object.entries(TOOL_DROP)) for (let i = 0; i < w; i++) pool.push(k);
  return pick(pool);
}

// 依目前地圖的加權表抽一種台灣小吃(該地圖名產較常見)
function snackDrop() {
  const w = theme().snackWeights;
  const pool = [];
  for (const k of SNACKS) for (let i = 0; i < (w[k] || 1); i++) pool.push(k);
  return pick(pool);
}

// 黑豬肉貢丸:一格一格彈跳追蹤最近的敵人,前面有障礙就跳過去;碰到敵人立刻爆
function updateHoming(m, dt) {
  if (m.hop) {                         // 飛行中
    m.hop.t += dt;
    const k = Math.min(1, m.hop.t / PORK_HOP_TIME);
    m.x = m.hop.x0 + (m.hop.x1 - m.hop.x0) * k;
    m.y = m.hop.y0 + (m.hop.y1 - m.hop.y0) * k;
    m.jump = Math.sin(Math.PI * k) * (m.hop.far ? 1.4 : 0.8);
    if (k >= 1) {
      m.hop = null; m.jump = 0; m.hopT = PORK_HOP_GAP;
      if (fighters().some((f) => f.alive && f.team !== m.owner.team && f.col === m.col && f.row === m.row)) {
        m.fuse = Math.min(m.fuse, 0.02);
      }
    }
    return;
  }
  m.hopT -= dt;
  if (m.hopT > 0) return;
  let target = null, best = Infinity;
  for (const f of fighters()) {
    if (!f.alive || f.team === m.owner.team) continue;
    const d = Math.abs(f.col - m.col) + Math.abs(f.row - m.row);
    if (d < best) { best = d; target = f; }
  }
  if (!target) { m.hopT = 0.5; return; }
  if (best === 0) { m.fuse = Math.min(m.fuse, 0.02); return; }
  const dx = Math.sign(target.col - m.col), dy = Math.sign(target.row - m.row);
  // 先走距離較遠的方向;走不了再試另一個方向
  const tries = Math.abs(target.col - m.col) >= Math.abs(target.row - m.row)
    ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
  const free = (c, r) => isFloor(c, r) && !meatballs.some((o) => o !== m && !o.exploded && !o.eaten && o.col === c && o.row === r);
  for (const [sx, sy] of tries) {
    if (!sx && !sy) continue;
    for (const n of [1, 2]) {          // 前面擋住就跳過一格
      const nc = m.col + sx * n, nr = m.row + sy * n;
      if (free(nc, nr)) {
        m.hop = { t: 0, x0: m.x, y0: m.y, x1: tileCenter(nc), y1: tileCenter(nr), far: n === 2 };
        sfx('boing', m.x, m.y);
        return;
      }
    }
  }
  m.hopT = 0.3; // 四周都跳不過去,等一下再試
}

// 小貢丸:未滿三顆相連前不會自己爆(引信不倒數),被其他爆炸波及才會跟著爆
function isDormant(m) { return m.def.behavior === 'cluster' && !m.armed; }

// 小貢丸:檢查是否有 N 顆相連(上下左右),相連才一起引爆
function checkClusters() {
  const smalls = meatballs.filter(
    (m) => m.def.behavior === 'cluster' && !m.exploded && !m.moving
  );
  if (!smalls.length) return;
  const need = smalls[0].def.cluster || 3;
  const key = (m) => m.col + ',' + m.row;
  const set = new Map(smalls.map((m) => [key(m), m]));
  const seen = new Set();
  for (const m of smalls) {
    if (seen.has(key(m))) continue;
    // BFS 找相連群
    const group = [];
    const stack = [m];
    seen.add(key(m));
    while (stack.length) {
      const cur = stack.pop();
      group.push(cur);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (cur.col + dc) + ',' + (cur.row + dr);
        if (set.has(k) && !seen.has(k)) {
          seen.add(k);
          stack.push(set.get(k));
        }
      }
    }
    if (group.length >= need) {
      group.forEach((g) => { g.fuse = Math.min(g.fuse, 0.05); g.armed = true; });
    }
  }
}

// ====================================================================
//  踢 / 丟貢丸
//  踢:面向貢丸時繼續往貢丸方向推 → 一路滑到碰到障礙物(豪雨或鋼頭鞋才能踢)
//  丟:面向貢丸快速連按兩下空白鍵 → 越過障礙物丟到前方(下雪或隔熱手套才能丟)
//  香腸、米腸、大腸包小腸不能踢也不能丟
// ====================================================================
const canKick = (p) => !!weatherDef().freeKick || (p.tools && p.tools.shoes > 0);
const canThrow = (p) => !!weatherDef().freeThrow || (p.tools && p.tools.glove > 0);
const liveBall = (m) => !m.exploded && !m.eaten && !m.held && !m.fly;
const ballAt = (c, r) => meatballs.find((m) => liveBall(m) && m.col === c && m.row === r);
// 面向的那一格(相鄰)上的貢丸
function facingMeatball(p) {
  return ballAt(p.col + p.dir.x, p.row + p.dir.y) || null;
}
// 提示字不要每幀洗版:同一個人 1.2 秒內只講一次
function hint(p, text, color = '#bdbdbd') {
  if (p !== player || (p.hintT || 0) > elapsed) return;
  p.hintT = elapsed + 1.2;
  spawnText(p.x, p.y - TS * 0.5, text, color);
}

function kickMeatball(p) {
  const m = facingMeatball(p);
  if (!m || m.moving) return false;
  if (!canMoveBall(m)) { hint(p, '香腸類踢不動'); return false; }
  if (!canKick(p)) { hint(p, '豪雨或🥾鋼頭鞋才能踢', '#90caf9'); return false; }
  m.vx = p.dir.x; m.vy = p.dir.y;
  m.moving = true;
  m.rider = p;
  sfx('kick', p.x, p.y);
  return true;
}

function updateMovingMeatball(m, dt) {
  if (!m.moving) return;
  const speed = KICK_SPEED * dt;
  m.x += m.vx * speed;
  m.y += m.vy * speed;

  // 抵達格中心時判斷下一步
  const cx = tileCenter(m.col);
  const cy = tileCenter(m.row);
  const reached = Math.abs(m.x - cx) < 4 && Math.abs(m.y - cy) < 4;
  if (!reached) return;

  m.x = cx; m.y = cy;
  const nc = m.col + m.vx;
  const nr = m.row + m.vy;
  // 牆、其他貢丸、人(滑行中的貢丸不能穿過人體;放在腳下不受影響)都會擋住
  const blocked = isBlocked(nc, nr) ||
    meatballs.some((o) => o !== m && !o.exploded && !o.eaten && o.col === nc && o.row === nr) ||
    fighters().some((f) => f.alive && f.col === nc && f.row === nr);

  if (blocked) {
    if (m.def.behavior === 'bounce' && m.bouncesLeft > 0) {
      m.bouncesLeft--;
      m.vx = -m.vx; m.vy = -m.vy; // 撒尿牛丸:反彈
      spawnText(m.x, m.y - 10, '彈!', '#f7d51d');
      sfx('boing', m.x, m.y);
    } else {
      m.moving = false; m.vx = m.vy = 0;
    }
  }
}

// 拋物線飛行(丟貢丸、彈弓):飛行中不擋路、不滑行
function launchMeatball(m, c, r, dur, height) {
  m.moving = false; m.vx = m.vy = 0; m.held = false;
  m.fly = { t: 0, dur, x0: m.x, y0: m.y, x1: tileCenter(c), y1: tileCenter(r), h: height };
}
function updateFlying(m, dt) {
  const f = m.fly;
  f.t += dt;
  const k = Math.min(1, f.t / f.dur);
  m.x = f.x0 + (f.x1 - f.x0) * k;
  m.y = f.y0 + (f.y1 - f.y0) * k;
  m.jump = Math.sin(Math.PI * k) * f.h;
  if (k >= 1) { m.fly = null; m.jump = 0; sfx('place', m.x, m.y); }
}

// 找落點:面向方向 maxDist 內、由遠到近第一個可放置的空格(可越過障礙物)
function findLandingTile(p, maxDist) {
  for (let i = maxDist; i >= 1; i--) {
    const c = p.col + p.dir.x * i, r = p.row + p.dir.y * i;
    if (!isFloor(c, r)) continue;
    if (meatballs.some((m) => !m.exploded && !m.eaten && m.col === c && m.row === r)) continue;
    return { c, r };
  }
  return null;
}

// 丟貢丸(面向貢丸、連按兩下空白鍵)
function throwMeatball(p, m) {
  if (!canMoveBall(m)) { hint(p, '香腸類丟不動'); return; }
  const spot = findLandingTile(p, BASE_THROW);
  if (!spot || (spot.c === m.col && spot.r === m.row)) { hint(p, '前方無落點'); return; }
  launchMeatball(m, spot.c, spot.r, 0.42, 1.6);
  m.thrown = true;
  sfx('whoosh', p.x, p.y);
  spawnText(p.x, p.y - TS * 0.55, '🧤丟!', '#ffd54f');
}

// 空白鍵:手上夾著貢丸 → 放下;面向可丟的貢丸 → 等第二下(兩下 = 丟,一下 = 照常放貢丸)
function spacePress(p) {
  if (!p.alive) return;
  if (p.held) { dropHeld(p); return; }
  const m = facingMeatball(p);
  if (m && canThrow(p) && canMoveBall(m)) {
    if (p.spaceT > 0) { p.spaceT = 0; throwMeatball(p, m); return; }
    p.spaceT = DOUBLE_TAP;
    return;
  }
  placeMeatball(p);
}

// 掃描某方向上的貢丸,遇到障礙物(柱子、箱子、垃圾桶)就停
function scanLine(p, dx, dy, firstOnly) {
  const found = [];
  let c = p.col, r = p.row;
  for (let i = 0; i < Math.max(COLS, ROWS); i++) {
    c += dx; r += dy;
    if (isBlocked(c, r)) break;
    const m = ballAt(c, r);
    if (m) { found.push(m); if (firstOnly) break; }
  }
  return found;
}
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const vacuumTargets = (p) => DIRS4.flatMap(([dx, dy]) => scanLine(p, dx, dy, true));
const garbageTargets = (p) => scanLine(p, p.dir.x, p.dir.y, false);

// 卡牌現在能不能用(卡牌區顯示、按下時判斷共用)
function cardUsable(p, key) {
  if (key === 'rat' || key === 'roach') return !!p.petState[key] && p.petState[key].status === 'stored';
  if (!p.alive || !(p.tools[key] > 0) || !TOOLS[key] || TOOLS[key].type !== 'once') return false;
  if (key === 'vacuum') return vacuumTargets(p).length > 0;
  if (key === 'garbage') return garbageTargets(p).length > 0;
  if (key === 'tongs') return !p.held && !!facingMeatball(p);
  if (key === 'slingshot') return !!(p.held || facingMeatball(p));
  return false;
}

// 使用一次性工具卡(用完卡牌消失)
function useCard(p, key) {
  if (key === 'rat' || key === 'roach') { deployPet(p, key); return; }
  if (!cardUsable(p, key)) {
    if (p.tools[key] > 0) hint(p, key === 'vacuum' ? '四周沒有貢丸' : '前方沒有貢丸');
    return;
  }
  const def = TOOLS[key];
  if (key === 'vacuum' || key === 'garbage') {
    const list = key === 'vacuum' ? vacuumTargets(p) : garbageTargets(p);
    for (const m of list) { m.eaten = true; spawnText(m.x, m.y - 10, '清除', '#80d8ff'); }
  } else if (key === 'tongs') {
    const m = facingMeatball(p);
    m.held = true; m.moving = false; m.vx = m.vy = 0;
    p.held = m;
  } else if (key === 'slingshot') {
    fireSlingshot(p, p.held || facingMeatball(p));
  }
  p.tools[key]--;
  sfx('whoosh', p.x, p.y);
  spawnText(p.x, p.y - TS * 0.55, def.emoji + def.name + '!', '#80d8ff');
  if (p === player) updateHud();
}

// 食物夾放下:放到前方一格(前方不能放就放腳下)
function dropHeld(p) {
  const m = p.held;
  if (!m) return;
  const spot = findLandingTile(p, 1) || { c: p.col, r: p.row };
  m.held = false;
  m.x = tileCenter(spot.c); m.y = tileCenter(spot.r);
  p.held = null;
  spawnText(m.x, m.y - 12, '放下', '#80d8ff');
}

// 找面向方向第一個人物(敵人或自己以外的人),回傳 {ent, c, r}
function firstCharacterAhead(p) {
  let c = p.col, r = p.row;
  for (let i = 0; i < Math.max(COLS, ROWS); i++) {
    c += p.dir.x; r += p.dir.y;
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) break;
    if (grid[r][c] === TILE.SOLID) break;
    for (const e of fighters()) {
      if (e !== p && e.alive && e.col === c && e.row === r) return { ent: e, c, r };
    }
  }
  return null;
}

// 彈弓:把面向(或夾著)的貢丸射向前方第一人 → 落地立刻爆;沒人就射到最遠的空格
function fireSlingshot(p, m) {
  if (p.held === m) p.held = null;
  const hit = firstCharacterAhead(p);
  const spot = hit || findLandingTile(p, Math.max(COLS, ROWS)) || { c: m.col, r: m.row };
  const dist = Math.abs(spot.c - m.col) + Math.abs(spot.r - m.row);
  const dur = 0.12 + dist * 0.03;
  launchMeatball(m, spot.c, spot.r, dur, 0.5);
  if (hit) {
    m.fuse = dur + 0.02; m.armed = true; // 命中人物 → 落地立刻爆炸
    spawnText(tileCenter(spot.c), tileCenter(spot.r) - 12, '🏹命中!', '#ff8a80');
  }
}

// 維持手持貢丸跟著玩家
function updateHeldMeatball(p) {
  if (!p.held) return;
  if (p.held.exploded || p.held.eaten) { p.held = null; return; }
  p.held.x = p.x;
  p.held.y = p.y;
}

// 防護盾:花 MP 啟動,增加一次「抵免爆炸波」的護盾
function activateShield(p) {
  if (p.shieldT > 0) {
    spawnText(p.x, p.y - TS * 0.5, '防護盾作用中', '#ffd54f');
    return;
  }
  if (p.mp < SHIELD_MP_COST) {
    spawnText(p.x, p.y - TS * 0.5, 'MP 不足', '#42a5f5');
    return;
  }
  p.mp -= SHIELD_MP_COST;
  p.shieldT = SHIELD_TIME;
  sfx('shield', p.x, p.y);
  spawnText(p.x, p.y - TS * 0.55, '🛡️防護盾 +1', '#ffd54f');
  updateHud();
}

// ---------- 角色 ----------
// 套用角色的初始能力值;電腦玩家打折(血 −1、速度 ×0.65、貢丸數 −1),難度和以前差不多
function applyCharacter(p, id, bot) {
  const c = charDef(id);
  p.char = CHARACTERS[id] ? id : 'aman';
  const d = bot ? AI_DIFF[MATCH.ai] || AI_DIFF.normal : null;   // 電腦難度
  p.maxHp = p.hp = d ? Math.max(1, c.hp + d.hp) : c.hp;
  p.maxMp = p.mp = c.mp;
  p.speed = d ? Math.round(c.speed * d.sp) : c.speed;
  p.power = c.power;
  p.maxBombs = d ? Math.max(1, c.bombs + d.bombs) : c.bombs;
  p.skillCd = 0; p.dashT = 0; p.boostNext = false;
}
const randomChar = () => CHAR_IDS[rand(CHAR_IDS.length)];

// 瞬步落點:前方第 2 格,不行就第 1 格(要能站的地面、沒有貢丸)
function blinkTarget(p) {
  for (const d of [2, 1]) {
    const c = p.col + p.dir.x * d, r = p.row + p.dir.y * d;
    if (c > 0 && r > 0 && c < COLS - 1 && r < ROWS - 1 && canEnterTile(p, c, r)) return [c, r];
  }
  return null;
}

// T 鍵:使用角色技能(條件不符時不進入冷卻)
function useSkill(p) {
  if (!p.alive) return;
  const sk = skillOf(p), id = charDef(p.char).skill;
  const say = (t, color) => spawnText(p.x, p.y - TS * 0.6, t, color);
  if (p.skillCd > 0) { if (p === player) say(`技能冷卻 ${Math.ceil(p.skillCd)} 秒`, '#bdbdbd'); return; }
  if (id === 'boost') {
    if (p.boostNext) { if (p === player) say('已經加料了', '#bdbdbd'); return; }
    p.boostNext = true;
    say('🌶️加料!下一顆威力 +2', '#ff7043');
  } else if (id === 'dash') {
    p.dashT = sk.time;
    say('💨衝刺!', '#4fc3f7');
  } else if (id === 'heal') {
    if (p.hp >= p.maxHp) { if (p === player) say('HP 已滿', '#bdbdbd'); return; }
    p.hp += 1;
    p.invuln = Math.max(p.invuln, 1);
    say('💪鐵肚皮 HP +1', '#81c784');
  } else if (id === 'detonate') {
    const mine = meatballs.filter((m) => m.owner === p && !m.exploded && !m.eaten && !m.held && !isDormant(m));
    if (!mine.length) { if (p === player) say('場上沒有你的貢丸', '#bdbdbd'); return; }
    mine.forEach((m, i) => { m.fuse = Math.min(m.fuse, 0.05 + i * 0.08); });
    say('💥麻辣引爆!', '#ff5252');
  } else if (id === 'blink') {
    const t = blinkTarget(p);
    if (!t) { if (p === player) say('前方無法閃現', '#bdbdbd'); return; }
    p.x = tileCenter(t[0]); p.y = tileCenter(t[1]);
    p.mvTarget = null; p.autoPath = null; p.path = null;
    say('🥷瞬步', '#b39ddb');
  } else if (id === 'freeze') {
    let n = 0;
    for (const m of meatballs) {
      if (m.exploded || m.eaten) continue;
      if (Math.abs(m.col - p.col) + Math.abs(m.row - p.row) <= 3) { m.fuse += 3; n++; }
    }
    if (!n) { if (p === player) say('附近沒有貢丸', '#bdbdbd'); return; }
    say(`🧊剉冰!${n} 顆貢丸延後爆`, '#80deea');
  }
  p.skillCd = sk.cd;
  sfx('gear', p.x, p.y);
  if (p === player) updateHud();
}

// AI 用技能:危險時逃命類技能、受傷補血、敵人在自己貢丸火線上就引爆
function aiSkill(e) {
  if (e.skillCd > 0) return;
  const id = charDef(e.char).skill;
  const dHere = danger[e.row][e.col];
  if (id === 'heal') { if (e.hp < e.maxHp) useSkill(e); }
  else if (id === 'dash') { if (dHere < 2.5) useSkill(e); }        // 正在逃命就加速
  else if (id === 'freeze') { if (dHere < 1.6) useSkill(e); }
  else if (id === 'blink') {
    if (dHere < 1.6) {
      const t = blinkTarget(e);
      if (t && danger[t[1]][t[0]] === Infinity) useSkill(e);
    }
  } else if (id === 'detonate') {
    const mine = meatballs.filter((m) => m.owner === e && !m.exploded && !m.eaten && !m.held && !isDormant(m));
    if (!mine.length) return;
    const cells = mine.flatMap(meatballCells);
    const hit = (f) => cells.some((cl) => cl.c === f.col && cl.r === f.row);
    if (!hit(e) && fighters().some((f) => f.alive && f.team !== e.team && hit(f))) useSkill(e);
  }
}

// 寵物卡:按下就放出,放出後不能收回(卡牌消失)
function deployPet(p, id) {
  const s = p.petState[id];
  if (!s || s.status !== 'stored') return;
  const pet = new Pet(p, s.def);
  pet.x = p.x; pet.y = p.y;
  s.pet = pet; s.status = 'out';
  p.pets.push(pet);
  sfx('squeak', p.x, p.y);
  spawnText(p.x, p.y - TS * 0.55, '放出' + s.def.emoji + s.def.name, '#aed581');
  updateHud();
}

// 收起寵物(回到可再放出的狀態)
function recallPet(p, id) {
  const s = p.petState[id];
  if (!s || s.status !== 'out') return;
  p.pets = p.pets.filter((x) => x !== s.pet);
  s.pet = null; s.status = 'stored';
  spawnText(p.x, p.y - TS * 0.55, '收起' + s.def.emoji + s.def.name, '#80d8ff');
  updateHud();
}

// 草叢:角色踏入時有 40% 驚動野生老鼠/蟑螂,攻擊一次後野生生物自生自滅
// 每叢只會出現一次野生生物
function checkBushes() {
  for (const e of fighters()) {
    if (!e.alive) continue;
    const key = e.col + ',' + e.row;
    if (e.bushKey === key) continue;          // 還在同一格,不重複判定
    e.bushKey = key;
    if (grid[e.row][e.col] !== TILE.BUSH || usedBush.has(key)) continue;
    if (Math.random() < 0.4) {
      usedBush.add(key);                       // 此草叢用掉了
      const def = Math.random() < 0.5 ? PETS.rat : PETS.roach;
      e.hurt(1);                               // 被咬一次
      sfx('squeak', e.x, e.y);
      spawnText(e.x, e.y - TS * 0.6, '野生' + def.emoji + '突襲!', '#ffab40');
      wildCritters.push({
        def, x: e.x, y: e.y, r: TS * 0.18,
        vx: Math.random() * 2 - 1, vy: Math.random() * 2 - 1,
        life: 3 + Math.random() * 3, wt: 0,
      });
    }
  }
}

// 野生生物:亂竄一段時間後自行消失(自生自滅);被爆炸波及也會消失
function updateWildCritters(dt) {
  for (const w of wildCritters) {
    w.life -= dt; w.wt -= dt;
    if (w.wt <= 0) {
      const a = Math.random() * Math.PI * 2;
      w.vx = Math.cos(a); w.vy = Math.sin(a); w.wt = 0.4 + Math.random() * 0.6;
    }
    const sp = 70 * dt;
    const nx = w.x + w.vx * sp, ny = w.y + w.vy * sp;
    if (isBlocked(toCol(nx), toRow(ny))) { w.vx *= -1; w.vy *= -1; }
    else { w.x = nx; w.y = ny; }
    // 被爆炸波及 → 消失
    for (const ex of explosions) {
      if (ex.cells.some((cl) => cl.c === toCol(w.x) && cl.r === toRow(w.y))) w.life = 0;
    }
  }
  wildCritters = wildCritters.filter((w) => w.life > 0);
}

// 場上所有放出中的寵物(每位人類玩家各自的)
function allPets() {
  const out = [];
  for (const f of fighters()) if (f && f.pets && f.pets.length) out.push(...f.pets);
  return out;
}

// 更新放出中的寵物:啃咬、中毒結算;昏倒後標記為 dead(本場不能再放出)
function updatePets(dt) {
  for (const owner of fighters()) {
    if (!owner.pets || !owner.pets.length) continue;
    for (const pet of owner.pets) {
      pet.tickPoison(dt);
      if (pet.alive) pet.update(dt); // 主人倒下後,放出中的寵物仍繼續啃貢丸
    }
    for (const pet of owner.pets) {
      if (!pet.alive) {
        const st = owner.petState[pet.def.id];
        if (st) { st.status = 'dead'; st.pet = null; }
      }
    }
    owner.pets = owner.pets.filter((p) => p.alive);
  }
}

// 復活道具的接口(道具待規劃):把一隻昏倒的寵物救回(設為收起狀態)
function revivePet(p) {
  for (const id in p.petState) {
    if (p.petState[id].status === 'dead') {
      p.petState[id].status = 'stored';
      spawnText(p.x, p.y - TS * 0.6, p.petState[id].def.emoji + '復活!', '#aed581');
      updateHud();
      return true;
    }
  }
  return false;
}

// ====================================================================
//  格子制移動(玩家與 AI 共用)
// ====================================================================
// 朝 e.mvTarget(下一格中心)平滑移動,抵達即吸附對齊
function advanceStep(e, dt) {
  if (!e.mvTarget) return;
  const ddx = e.mvTarget.x - e.x, ddy = e.mvTarget.y - e.y;
  const d = Math.hypot(ddx, ddy);
  const base = weatherDef().snow ? Math.min(e.speed, SNOW_SPEED) : e.speed + (weatherDef().speedBonus || 0);
  const mv = (base + (e.dashT > 0 ? SKILLS.dash.bonus : 0)) * dt; // 豪雨 +10、下雪降到最低、衝刺 +80
  if (d <= mv) {
    e.x = e.mvTarget.x; e.y = e.mvTarget.y;
    e.mvTarget = null; // 抵達格中心,可再轉向
  } else {
    e.x += (ddx / d) * mv; e.y += (ddy / d) * mv;
  }
}

// ====================================================================
//  輸入
// ====================================================================
const keys = {};
// 移動鍵 → 方向向量
const MOVE_KEYS = {
  arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
  arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
};
let moveStack = []; // 目前按住的移動鍵,最後按下的排在最後(最優先)

window.addEventListener('keydown', (ev) => {
  const tag = ev.target && ev.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; // 在輸入框打字(如連線暱稱)不觸發遊戲
  const k = ev.key.toLowerCase();
  if (MOVE_KEYS[k] && !keys[k]) moveStack.push(k); // 記錄最近按下的方向
  keys[k] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
    ev.preventDefault();
  }
  const onResultScreen = gameState !== 'playing' && gameState !== 'menu';
  if (k === 'escape' && onResultScreen && !NET.online) { backToMainMenu(); return; } // 結算畫面 Esc 回主選單
  if (k === 'enter' && onResultScreen) {                // 結算畫面 Enter:下一局 / 再來一輪
    if (!NET.online || NET.role === 'host') { if (SERIES.over) startSeries(); else { SERIES.nextAt = 0; startRound(); } }
    return;
  }
  if (k === 'r') {
    // 重新開始:教學中=重來這一步;單機=整場重來;連線中不提供(避免誤觸)
    if (window.tutorial && tutorial.active) tutorial.retry();
    else if (!NET.online && gameState === 'playing') startSeries();
    return;
  }
  if (gameState !== 'playing') return;
  if (NET.role === 'guest') {           // 連線玩家:動作交給房主執行
    if (MOVE_KEYS[k]) readPlayerInput(0); // 方向一變就立刻送出,不等下一幀
    else NET.sendKey(k);
    return;
  }
  playerAction(player, k);
});

// 動作鍵 → 對某位玩家執行(本機按鍵、房主代為執行連線玩家的按鍵共用)
function playerAction(p, k) {
  // 倒下後只能放出/收起還活著的寵物
  if (!p.alive) {
    if (k === 'k') deployPet(p, 'rat');
    if (k === 'l') deployPet(p, 'roach');
    return;
  }
  // 選擇貢丸 1~9;夜市限定 O 香腸、P 米腸
  if (k >= '1' && k <= '9') {
    p.selected = parseInt(k, 10);
    if (p === player) updateHud();
  }
  if ((k === 'o' || k === 'p') && nightFoodAllowed()) {
    p.selected = k === 'o' ? 11 : 12;
    if (p === player) updateHud();
  }
  if (k === ' ') spacePress(p);                // 放貢丸 / 連按兩下丟貢丸 / 放下夾著的貢丸
  if (k === 'q') useCard(p, 'vacuum');         // 卡牌:吸塵器
  if (k === 'f') useCard(p, 'garbage');        // 卡牌:垃圾車
  if (k === 'g') activateShield(p);            // 防護盾(花 MP)
  if (k === 't') useSkill(p);                  // 角色技能
  if (k === 'z') useCard(p, 'tongs');          // 卡牌:食物夾
  if (k === 'c') useCard(p, 'slingshot');      // 卡牌:彈弓
  if (k === 'k') deployPet(p, 'rat');          // 卡牌:放出老鼠
  if (k === 'l') deployPet(p, 'roach');        // 卡牌:放出蟑螂
}
window.addEventListener('keyup', (ev) => {
  const k = ev.key.toLowerCase();
  keys[k] = false;
  moveStack = moveStack.filter((x) => x !== k);
  if (NET.role === 'guest' && MOVE_KEYS[k] && gameState === 'playing' && player) readPlayerInput(0);
});

// 玩家為「格子制」移動:一次走一整格,永遠對齊格線,方便轉彎不卡住
function readPlayerInput(dt) {
  if (!player.alive) return; // 倒下後不能移動
  // 想走的方向 = 最近按住的移動鍵
  let want = null;
  for (let i = moveStack.length - 1; i >= 0; i--) {
    if (keys[moveStack[i]]) { want = MOVE_KEYS[moveStack[i]]; break; }
  }
  // 3D 跟隨/第一人稱模式:方向鍵改以鏡頭(人物前方)為基準
  // (由 render3d.js 提供轉換;2D 版無此函式,維持絕對方向)
  // 轉換結果若帶 keepFacing,表示「移動但不轉身」(如第一人稱倒退)
  let keepFacing = false;
  if (want && typeof window !== 'undefined' && window.moveTransform && (!window.VIEW || VIEW.mode === '3d')) {
    want = window.moveTransform(want);
    keepFacing = !!(want && want.keepFacing);
  }
  if (NET.role === 'guest') { NET.sendMove(want, keepFacing); return; } // 連線玩家:方向交給房主
  humanMove(player, want, keepFacing, dt);
}

// 人類玩家的格子移動(本機玩家、房主代為移動的連線玩家共用)
function humanMove(p, want, keepFacing, dt) {
  if (!p.alive) return;
  // 鍵盤移動優先,會取消點擊地圖的自動走路
  if (want) p.autoPath = null;
  if (!want) p.pushT = 0;
  // 在格中心且沒有進行中的移動時,接受新方向、決定下一格目標
  if (!p.mvTarget && want) {
    if (!keepFacing) p.dir = { x: want[0], y: want[1] }; // 倒退時不轉身
    const nc = p.col + want[0], nr = p.row + want[1];
    if (canEnterTile(p, nc, nr)) {
      p.mvTarget = { x: tileCenter(nc), y: tileCenter(nr) };
      p.pushT = 0;
    } else if (p.dir.x === want[0] && p.dir.y === want[1] && ballAt(nc, nr)) {
      // 面向貢丸還繼續往它推 → 踢出去
      p.pushT += dt;
      if (p.pushT >= PUSH_KICK) { p.pushT = 0; kickMeatball(p); }
    } else p.pushT = 0;
  }
  // 點擊地圖的自動走路:沿路徑一格一格走
  if (!want && !p.mvTarget && p.autoPath && p.autoPath.length) {
    const [nc, nr] = p.autoPath[0];
    if (Math.abs(nc - p.col) + Math.abs(nr - p.row) === 1 &&
        canEnterTile(p, nc, nr)) {
      p.autoPath.shift();
      p.dir = { x: nc - p.col, y: nr - p.row };
      p.mvTarget = { x: tileCenter(nc), y: tileCenter(nr) };
    } else {
      p.autoPath = null; // 路被擋住(新貢丸/箱子)就停下
    }
  }
  advanceStep(p, dt);
}

// 點地圖:點一下走過去、快速點兩下放貢丸(2D/3D 共用;連線玩家改送給房主)
function tapCell(c, r, double) {
  if (double) {
    if (NET.role === 'guest') NET.sendKey(' '); else placeMeatball(player);
    return;
  }
  if (!isFloor(c, r)) return;
  if (NET.role === 'guest') { NET.sendTap(c, r); return; }
  setTapPath(player, c, r);
}
function setTapPath(p, c, r) {
  const b = grid[r] && grid[r][c] === TILE.BENCH ? benchAt(c, r) : null;
  if (b) {
    const path = p.col === b.fc && p.row === b.fr ? [] : aiPath(p, (cc, rr) => cc === b.fc && rr === b.fr, 64, 0);
    if (path) { p.autoPath = path.concat([[c, r]]); return; }
    if (p === player) spawnText(tileCenter(c), tileCenter(r), '走不到', '#bbb');
    return;
  }
  if (!isFloor(c, r)) return;
  const dx = c - p.col, dy = r - p.row;
  if (Math.abs(dx) + Math.abs(dy) === 1 && ballAt(c, r)) {   // 點旁邊的貢丸
    if (p.dir.x === dx && p.dir.y === dy) kickMeatball(p);
    else p.dir = { x: dx, y: dy };
    p.autoPath = null;
    return;
  }
  p.autoPath = aiPath(p, (cc, rr) => cc === c && rr === r, 64, 0);
  if (!p.autoPath && p === player) spawnText(tileCenter(c), tileCenter(r), '走不到', '#bbb');
}

// ---------- 點擊地圖操作(滑鼠與觸控通用) ----------
// 點一下:自動走到該格;快速點兩下同一格:放貢丸
let lastTap = { t: 0, c: -1, r: -1 };
canvas.addEventListener('pointerdown', (ev) => {
  if (gameState !== 'playing' || !player || !player.alive) return;
  const rect = canvas.getBoundingClientRect();
  const gx = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const gy = (ev.clientY - rect.top) * (canvas.height / rect.height);
  const c = toCol(gx), r = toRow(gy);
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return;
  const now = performance.now();
  if (now - lastTap.t < 350 && lastTap.c === c && lastTap.r === r) {
    tapCell(c, r, true);                       // 點兩下:放貢丸
    lastTap = { t: 0, c: -1, r: -1 };
  } else {
    lastTap = { t: now, c, r };
    tapCell(c, r, false);                      // 點一下:尋路走過去
  }
  ev.preventDefault();
});

// 目標格是否可進入(牆/磚/垃圾桶或有貢丸都不行;貢丸在腳下不算,因為目標一定是相鄰格)
function canEnterTile(e, c, r) {
  const here = e instanceof Player && grid[e.row] && grid[e.row][e.col] === TILE.BENCH ? benchAt(e.col, e.row) : null;
  if (here) return c === here.fc && r === here.fr;            // 躺在長椅上:只能往正面離開
  if (grid[r] && grid[r][c] === TILE.BENCH) {                  // 走進長椅:只能從正面進去(椅背、扶手側都擋住)
    const b = benchAt(c, r);
    return e instanceof Player && !!b && e.col === b.fc && e.row === b.fr;
  }
  if (isBlocked(c, r)) return false;
  for (const m of meatballs) {
    if (m.exploded || m.held) continue;
    if (m.col === c && m.row === r) return false;
  }
  return true;
}

// ====================================================================
//  AI 玩家(藍隊隊友 & 紅隊敵人)
//  優先順序:逃離爆炸 > 炸得到敵人就放彈 > 撿道具 > 炸箱開路 > 逼近敵人
//  全程持續運作;放彈前會先確認自己有退路
// ====================================================================
const AI_BOMB_TYPES = [1, 1, 2, 3, 5, 6, 7, 8, 9]; // 普通貢丸權重較高

// BFS 尋路:回傳到第一個滿足 goalFn 的格子的路徑([ [c,r], ... ] 不含起點)
function aiPath(e, goalFn, maxDepth = 18, avoidDanger = 0) {
  if (goalFn(e.col, e.row)) return [];
  const blockMB = (c, r) =>
    meatballs.some((m) => !m.exploded && !m.eaten && !m.held && m.col === c && m.row === r);
  const key = (c, r) => r * COLS + c;
  const seen = new Set([key(e.col, e.row)]);
  const prev = new Map();
  const q = [[e.col, e.row, 0]];
  while (q.length) {
    const [c, r, dep] = q.shift();
    if (dep >= maxDepth) continue;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, k = key(nc, nr);
      if (seen.has(k) || !isFloor(nc, nr) || blockMB(nc, nr)) continue;
      const isGoal = goalFn(nc, nr);
      // 避開即將爆炸的格子(目標格例外,例如逃生目標本身就是安全格)
      if (!isGoal && avoidDanger > 0 && danger[nr][nc] < avoidDanger) continue;
      seen.add(k); prev.set(k, [c, r]);
      if (isGoal) {
        const path = []; let cur = [nc, nr];
        while (cur && !(cur[0] === e.col && cur[1] === e.row)) {
          path.unshift(cur);
          cur = prev.get(key(cur[0], cur[1]));
        }
        return path;
      }
      q.push([nc, nr, dep + 1]);
    }
  }
  return null;
}

const adjacentToBreakable = (c, r) =>
  [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => {
    const t = (grid[r + dr] || [])[c + dc];
    return t === TILE.BRICK || t === TILE.TRASH;
  });

// 敵隊有人站在自己目前位置的爆炸線上?
function aiEnemyInBlast(e) {
  const cells = blastCells(e.col, e.row, e.power, false);
  return fighters().some((f) =>
    f !== e && f.alive && f.team !== e.team &&
    cells.some((cl) => cl.c === f.col && cl.r === f.row));
}

// 在目前位置放彈後,是否還有退路可逃?
function aiHasEscape(e) {
  const mine = blastCells(e.col, e.row, e.power, false);
  const inMine = (c, r) => mine.some((cl) => cl.c === c && cl.r === r);
  return aiPath(e, (c, r) => !inMine(c, r) && danger[r][c] === Infinity, 8) !== null;
}

function aiPlaceBomb(e) {
  if (charDef(e.char).skill === 'boost' && e.skillCd <= 0) useSkill(e); // 加料後再放
  e.selected = AI_BOMB_TYPES[rand(AI_BOMB_TYPES.length)];
  placeMeatball(e);
  e.aiBombCd = (1.2 + Math.random() * 1.6) * (AI_DIFF[MATCH.ai] || AI_DIFF.normal).cd;
  danger = computeDanger();                     // 立即更新危險圖
  e.path = aiPath(e, (c, r) => danger[r][c] === Infinity, 14); // 放完就跑
}

// AI 決策:設定 e.path(要走的路徑)或直接放彈
function aiDecide(e) {
  e.bombOnArrive = false;
  // 1) 自己在爆炸範圍內 → 逃到最近的安全格
  if (danger[e.row][e.col] < 9) {
    e.path = aiPath(e, (c, r) => danger[r][c] === Infinity, 14) ||
             aiPath(e, (c, r) => danger[r][c] > danger[e.row][e.col] + 0.8, 8);
    return;
  }
  const canBomb = e.aiBombCd <= 0 && e.bombsPlaced() < e.maxBombs;
  // 2) 敵人在爆炸線上且有退路 → 放彈攻擊
  if (canBomb && aiEnemyInBlast(e) && aiHasEscape(e)) { aiPlaceBomb(e); return; }
  // 3) 附近有道具 → 去撿
  let p = aiPath(e, (c, r) =>
    items.some((it) => !it.dead && it.col === c && it.row === r), 12, 1.0);
  if (p && p.length) { e.path = p; return; }
  // 4) 站在可炸箱子旁就放彈;否則走去箱子旁準備炸
  if (canBomb) {
    if (adjacentToBreakable(e.col, e.row) && aiHasEscape(e)) { aiPlaceBomb(e); return; }
    p = aiPath(e, (c, r) => adjacentToBreakable(c, r), 12, 1.0);
    if (p && p.length) { e.path = p; e.bombOnArrive = true; return; }
  }
  // 5) 朝最近的敵人逼近(走到其相鄰格)
  p = aiPath(e, (c, r) => fighters().some((f) =>
    f !== e && f.alive && f.team !== e.team &&
    Math.abs(f.col - c) + Math.abs(f.row - r) <= 1), 24, 1.0);
  if (p && p.length) { e.path = p.slice(0, 8); return; }
  // 6) 沒事做 → 隨機走一格(避開危險)
  const opts = [];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nc = e.col + dc, nr = e.row + dr;
    if (canEnterTile(e, nc, nr) && danger[nr][nc] === Infinity) opts.push([nc, nr]);
  }
  e.path = opts.length ? [opts[rand(opts.length)]] : null;
}

function updateEnemy(e, dt) {
  if (e.remote) { humanMove(e, e.netWant, e.netKeep, dt); updateHeldMeatball(e); return; } // 連線玩家
  if (!e.alive) return;
  aiSkill(e);
  e.aiTimer -= dt;
  e.aiBombCd -= dt;
  if (!e.mvTarget) { // 在格中心時思考
    const inDanger = danger[e.row][e.col] < 2.5;
    if (inDanger || e.aiTimer <= 0 || !e.path || !e.path.length) {
      e.aiTimer = 0.15 + Math.random() * 0.2;
      aiDecide(e);
    }
    if (e.path && e.path.length) {
      const [nc, nr] = e.path[0];
      if (Math.abs(nc - e.col) + Math.abs(nr - e.row) === 1 && canEnterTile(e, nc, nr)) {
        e.path.shift();
        e.dir = { x: nc - e.col, y: nr - e.row };
        e.mvTarget = { x: tileCenter(nc), y: tileCenter(nr) };
      } else {
        e.path = null; // 路被擋住,下次重新決策
      }
    } else if (e.bombOnArrive) {
      e.bombOnArrive = false;
      if (e.aiBombCd <= 0 && e.bombsPlaced() < e.maxBombs && aiHasEscape(e)) aiPlaceBomb(e);
    }
  }
  advanceStep(e, dt);
}

// ====================================================================
//  主更新
// ====================================================================
function update(dt) {
  if (NET.role === 'guest') { NET.guestUpdate(dt); return; } // 連線玩家:不自己模擬
  if (gameState !== 'playing') return;
  if (window.VIEW && VIEW.busy && !NET.online) return;        // 單機:載入 3D 素材時暫停
  elapsed += dt;

  updateWeather(dt);
  if (spotT > 0) spotT -= dt;
  danger = computeDanger(); // 供 AI 決策與畫面預警

  readPlayerInput(dt);
  if (player.invuln > 0) player.invuln -= dt;
  if (player.blindT > 0) player.blindT -= dt;
  player.tickPoison(dt);
  updateHeldMeatball(player);

  // MP 自然回復、防護盾倒數(所有角色)
  for (const f of fighters()) {
    if (f.shieldT > 0) f.shieldT = Math.max(0, f.shieldT - dt);
    if (f.skillCd > 0) f.skillCd = Math.max(0, f.skillCd - dt);
    if (f.dashT > 0) f.dashT = Math.max(0, f.dashT - dt);
    if (f.spaceT > 0) { f.spaceT -= dt; if (f.spaceT <= 0) { f.spaceT = 0; placeMeatball(f); } } // 只按一下:放貢丸
    if (onBench(f)) {                                          // 躺在長椅上:每秒回 1 HP
      f.restT = (f.restT || 0) + dt;
      if (f.restT >= 1) {
        f.restT -= 1;
        if (f.hp < f.maxHp) { f.hp = Math.min(f.maxHp, f.hp + BENCH_HEAL); spawnText(f.x, f.y - TS * 0.6, '💤 +1 HP', '#81c784'); if (f === player) updateHud(); }
      }
    } else f.restT = 0;
    if (f.alive) f.mp = Math.min(f.mp + MP_REGEN * dt, f.maxMp);
  }

  bots.forEach((e) => updateEnemy(e, dt));
  bots.forEach((e) => { if (e.invuln > 0) e.invuln -= dt; });
  bots.forEach((e) => { if (e.blindT > 0) e.blindT -= dt; });
  bots.forEach((e) => e.tickPoison(dt));

  // 小貢丸群組判定
  checkClusters();

  // 草叢:驚動野生老鼠/蟑螂;野生生物自生自滅
  checkBushes();
  updateWildCritters(dt);

  // 寵物:衝向貢丸啃咬(可多隻同時啃一顆)、處理中毒與重生
  updatePets(dt);

  // 更新貢丸:老化、發霉、引信、滑行
  for (const m of meatballs) {
    if (m.eaten) continue;             // 已被寵物吃掉,等待移除
    if (m.fly) updateFlying(m, dt);    // 丟出 / 彈弓射出的飛行中
    else if (!m.held) updateMovingMeatball(m, dt); // 手持中不滑行(但仍會變質、引信倒數)
    m.age += dt;
    if (!m.moving && !isDormant(m)) m.fuse -= dt; // 未滿三顆的小貢丸不倒數
    if (m.def.behavior === 'homing' && !m.held) updateHoming(m, dt);
    if (isDormant(m)) {                // 小貢丸放太久:發霉 → 分解消失(不會爆)
      if (!m.moldy && m.age >= m.decay - 2.5) { m.moldy = true; spawnText(m.x, m.y - TS * 0.5, '發霉了🦠', '#7cb342'); }
      if (m.age >= m.decay) { m.eaten = true; spawnText(m.x, m.y - TS * 0.5, '分解消失', '#9ccc65'); continue; }
    }
    if (m.fuse <= 0) explodeMeatball(m);
  }

  // 更新爆炸:傷害判定
  for (const ex of explosions) {
    ex.t -= dt;
    const hitCells = ex.cells;
    const damage = (ent) => {
      if (!ent.alive) return;
      if (hitCells.some((cl) => cl.c === ent.col && cl.r === ent.row)) {
        ent.hurt(1, ex.poison);
        if (ex.ink && ent.blind) ent.blind(); // 墨魚貢丸:短暫看不到畫面
      }
    };
    if (ex.t > EXPLOSION_TIME - 0.12) { // 只在爆炸初期判傷一次區間
      damage(player);
      bots.forEach(damage);
      allPets().forEach(damage); // 寵物也會被炸到(含中黴毒)
    }
  }

  // 移除結束的爆炸與已爆貢丸
  explosions = explosions.filter((ex) => ex.t > 0);
  meatballs = meatballs.filter((m) => !m.exploded && !m.eaten);

  // 道具拾取
  items = items.filter((it) => {
    if (it.dead) return false;
    it.t += dt;
    it.age += dt;
    it.update(dt);                             // 墨魚會自行游走
    // 所有角色(玩家與 AI)都能撿道具
    for (const f of fighters()) {
      if (!f.alive || it.col !== f.col || it.row !== f.row) continue;
      if (TOOLS[it.key]) {
        sfx('gear', f.x, f.y);
        const def = TOOLS[it.key];
        if (def.type === 'perm') {                              // 永久卡:擁有就一直有效
          spawnText(f.x, f.y - TS * 0.5, f.tools[it.key] > 0 ? def.name + '已擁有' : '永久卡 ' + def.emoji + def.name, '#a5d6a7');
          f.tools[it.key] = 1;
        } else {
          (f.cardNew || (f.cardNew = {}))[it.key] = elapsed;    // 手牌上閃一下 NEW
          f.tools[it.key] = (f.tools[it.key] || 0) + 1;         // 一次性卡 +1 張
          spawnText(f.x, f.y - TS * 0.5, '+' + def.emoji + def.name + '卡', '#80d8ff');
        }
      } else {
        sfx(SNACKS.includes(it.key) || it.key === 'luckybag' ? 'jackpot' : 'pickup', f.x, f.y);
        applyItem(f, it.key);                                   // 食用道具
        spawnText(f.x, f.y - TS * 0.5, '+' + ITEMS[it.key].name, ITEMS[it.key].color);
      }
      if (f === player) updateHud();
      return false;
    }
    return true;
  });

  // 飄字
  particles = particles.filter((p) => {
    p.life -= dt; p.y += p.vy * dt; return p.life > 0;
  });

  // 碰到敵隊人物不扣血(只有被爆炸波及才會受傷)

  // 死亡動畫處理 + 移除
  bots.forEach((e) => { if (!e.alive && e.deathT === undefined) e.deathT = 0.4; });
  bots.forEach((e) => { if (e.deathT !== undefined) e.deathT -= dt; });
  bots = bots.filter((e) => e.alive || e.deathT > 0 || e.remote); // 連線玩家倒下仍保留(還能放寵物)

  // 新手教學:由 tutorial.js 接手關卡進度,不計時、不判勝負
  if (window.tutorial && tutorial.active) { tutorial.update(dt); updateHud(); return; }

  // 限時隊伍勝負判定
  matchTime -= dt;
  const blue = teamAlive('blue'), red = teamAlive('red');
  if (red === 0) gameState = 'win';
  else if (blue === 0) gameState = 'lose';
  else if (matchTime <= 0) {
    matchTime = 0;
    gameState = blue > red ? 'win' : (blue < red ? 'lose' : 'draw');
  }
  if (NET.role === 'host') NET.hostTick(dt);  // 連線:定期把狀態送給其他玩家
  if (gameState !== 'playing') showResult(); // 顯示結算面板

  updateHud();
}

// ====================================================================
//  繪圖
// ====================================================================
function draw() {
  // 背景
  ctx.fillStyle = '#1f2a1a';
  ctx.fillRect(0, 0, W, H);
  const ts = TILE_SPRITES[currentMapId] || TILE_SPRITES.park;

  // 地板(棋盤格兩款)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      spriteRect('tiles/' + ts.floor[(c + r) % 2], c * TS, r * TS, TS, TS);
    }
  }

  // 危險預警:即將被炸到的格子閃紅(爆爆王式提示)
  if (danger) {
    const a = 0.16 + 0.12 * Math.sin(elapsed * 12);
    ctx.fillStyle = `rgba(255,60,40,${a})`;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (danger[r][c] < 1.0 && isFloor(c, r)) {
          ctx.fillRect(c * TS, r * TS, TS, TS);
        }
      }
    }
  }

  if (env.weather === 'rain') drawRainSplashes();
  if (weatherDef().snow) drawSnowGround();

  // 場上的東西依所在列分組,和地圖物件一起由上往下畫(前排會擋住後排)
  const rows = Array.from({ length: ROWS }, () => []);
  const add = (y, fn) => rows[clamp(toRow(y), 0, ROWS - 1)].push([y, fn]);
  items.forEach((it) => add(it.y, () => drawItem(it)));
  meatballs.forEach((m) => add(m.y, () => drawMeatball(m)));
  allPets().forEach((p) => add(p.y, () => drawPet(p)));
  wildCritters.forEach((w) => add(w.y, () => {
    ctx.globalAlpha = clamp(w.life, 0, 1); // 快消失時漸淡
    sprite('pets/' + w.def.id, w.x, w.y, TS * 0.7);
    ctx.globalAlpha = 1;
  }));
  bots.forEach((e) => { if (e.alive || e.deathT > 0) add(e.y, () => drawCharacter(e)); });
  if (player.alive || player.invuln > 0) add(player.y, () => drawCharacter(player));

  const tallH = TS * TILE_IMG_H;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (t === TILE.EMPTY) continue;
      const edge = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1;
      const side = (c === 0 || c === COLS - 1) && r !== 0 && r !== ROWS - 1; // 左右兩側(不含四角)
      if (t === TILE.BENCH) {
        const b = benchAt(c, r);
        spriteRect('tiles/bench_' + (b ? b.back : 'n'), c * TS, (r + 1) * TS - tallH, TS, tallH);
        continue;
      }
      const list = t === TILE.SOLID ? (side && ts.wallSide ? ts.wallSide : edge ? ts.wall : ts.solid)
        : t === TILE.BRICK ? ts.brick : t === TILE.TRASH ? ts.trash : ts.bush;
      spriteRect('tiles/' + pickVar(list, c, r), c * TS, (r + 1) * TS - tallH, TS, tallH);
    }
    rows[r].sort((p, q) => p[0] - q[0]).forEach(([, fn]) => fn());
  }

  // 爆炸(在最上層)
  explosions.forEach(drawExplosion);
  if (env.weather === 'rain') drawRainStreaks();
  if (weatherDef().snow) drawFlakes(90, 'rgba(255,255,255,0.9)', 2.2, 38);
  if (weatherDef().ash) drawFlakes(140, 'rgba(70,60,55,0.95)', 2.2, 55);
  if (env.abduct) drawAlien();

  // 飄字
  particles.forEach((p) => {
    ctx.globalAlpha = clamp(p.life, 0, 1);
    ctx.fillStyle = p.color;
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 3;
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillText(p.text, p.x, p.y);
    ctx.globalAlpha = 1;
  });

  // 低血量警示:HP 只剩 1 時畫面邊緣泛紅
  if (player.alive && player.hp === 1) {
    const a = 0.18 + 0.1 * Math.sin(elapsed * 4);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.75);
    g.addColorStop(0, 'rgba(200,0,0,0)');
    g.addColorStop(1, `rgba(200,0,0,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // 被墨魚貢丸炸到 / 火山灰 → 黑畫面
  const ba = blindAlpha();
  if (ba > 0.01) drawBlind(ba);
  // 選單/結算改用 HTML 疊層(見 index.html)
}

// ---------- 豪雨:地面水花 + 雨絲 ----------
const splashes = [];
let rainLast = 0;
function drawRainSplashes() {
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, now - (rainLast || now)); rainLast = now;
  for (let i = 0; i < 4; i++) {           // 每幀冒幾個水花(只在可走的地面)
    const c = 1 + rand(COLS - 2), r = 1 + rand(ROWS - 2);
    if (isFloor(c, r)) splashes.push({ x: c * TS + Math.random() * TS, y: r * TS + Math.random() * TS, t: 0, life: 0.45 + Math.random() * 0.25 });
  }
  ctx.save();
  ctx.fillStyle = 'rgba(70, 110, 150, 0.12)'; // 濕地面
  ctx.fillRect(0, 0, W, H);
  for (let i = splashes.length - 1; i >= 0; i--) {
    const s = splashes[i];
    s.t += dt;
    if (s.t >= s.life) { splashes.splice(i, 1); continue; }
    const k = s.t / s.life;
    ctx.globalAlpha = (1 - k) * 0.85;
    ctx.strokeStyle = '#e6f3ff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 3 + k * 11, 1.5 + k * 5, 0, 0, Math.PI * 2); ctx.stroke();
    if (k < 0.35) {                        // 剛落地的小水珠
      ctx.fillStyle = '#ffffff';
      for (const a of [-1, 1]) { ctx.beginPath(); ctx.arc(s.x + a * (2 + k * 14), s.y - 4 - k * 10, 1.4, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  ctx.restore();
}
function drawRainStreaks() {
  ctx.save();
  ctx.strokeStyle = 'rgba(220, 235, 255, 0.45)'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * (W + 60) - 30, y = Math.random() * H;
    ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 16);
  }
  ctx.stroke();
  ctx.restore();
}

function drawBlind(a) {
  // 吃過墨魚會降低不透明度;接近結束時漸退(透明度由 blindAlpha 算)
  ctx.fillStyle = `rgba(4,6,16,${a})`;
  ctx.fillRect(0, 0, W, H);
  if (player.alive && player.blindT > 0) {
    ctx.globalAlpha = clamp(player.blindT / 0.6, 0, 1);
    ctx.fillStyle = '#cfd8dc';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🦑 被墨魚噴黑了!', W / 2, H / 2);
    ctx.globalAlpha = 1;
  }
}

// ---------- 下雪:地面白色雪跡(越下越白)+ 雪花;火山灰也用同一套飄落 ----------
let snowLayer = null;
function drawSnowGround() {
  if (!snowLayer) {                       // 預先畫好一層柔邊白斑(位置固定,不會閃)
    snowLayer = document.createElement('canvas');
    snowLayer.width = W; snowLayer.height = H;
    const g = snowLayer.getContext('2d');
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < COLS * ROWS * 7; i++) {
      const x = rnd() * W, y = rnd() * H, r = 5 + rnd() * 16;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(250,252,255,0.95)'); gr.addColorStop(0.6, 'rgba(244,248,255,0.7)'); gr.addColorStop(1, 'rgba(240,246,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(x, y, r * (1 + rnd() * 0.8), r * 0.7, rnd() * Math.PI, 0, Math.PI * 2); g.fill();
    }
  }
  const cover = clamp(0.25 + env.t / 6, 0.25, 0.95);   // 下越久雪跡越白
  ctx.save();
  ctx.fillStyle = 'rgba(235,242,252,0.16)';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = cover;
  ctx.drawImage(snowLayer, 0, 0);
  ctx.restore();
}
function drawFlakes(n, color, size, fall) {
  const t = performance.now() / 1000;
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const sp = fall * (0.7 + (i % 5) * 0.12);
    const y = (i * 53.7 + t * sp) % (H + 20) - 10;
    const x = (i * 97.3 + Math.sin(t * 0.8 + i) * 14 + t * 8) % (W + 20) - 10;
    ctx.beginPath(); ctx.arc(x, y, size * (0.6 + (i % 3) * 0.3), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------- 外星人來襲:飛碟 + 光束罩住被鎖定的人 ----------
function drawAlien() {
  const a = env.abduct, f = a.f;
  if (!f) return;
  const k = clamp(a.t / ALIEN_BEAM, 0, 1);
  const ux = f.x, uy = f.y - TS * 2.4 + Math.sin(elapsed * 3) * 3;
  ctx.save();
  // 光束(越照越亮)
  const g = ctx.createLinearGradient(0, uy, 0, f.y + TS * 0.4);
  g.addColorStop(0, `rgba(190,255,140,${0.55 + k * 0.3})`);
  g.addColorStop(1, `rgba(190,255,140,${0.12 + k * 0.25})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(ux - TS * 0.3, uy + 6); ctx.lineTo(ux + TS * 0.3, uy + 6);
  ctx.lineTo(f.x + TS * 0.62, f.y + TS * 0.42); ctx.lineTo(f.x - TS * 0.62, f.y + TS * 0.42);
  ctx.closePath(); ctx.fill();
  // 飛碟:圓盤 + 玻璃罩 + 閃燈
  ctx.fillStyle = '#9aa4ad'; ctx.strokeStyle = '#262626'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(ux, uy, TS * 0.75, TS * 0.22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(140,230,255,0.85)';
  ctx.beginPath(); ctx.ellipse(ux, uy - TS * 0.12, TS * 0.32, TS * 0.26, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = (Math.floor(elapsed * 8) + i) % 2 ? '#ffeb3b' : '#ff5252';
    ctx.beginPath(); ctx.arc(ux + (i - 2) * TS * 0.28, uy + 2, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawItem(it) {
  const bob = Math.sin(it.t * 4) * 1.5;
  const pulse = 1 + Math.sin(it.t * 5) * 0.04;
  // 道具(寫實圖,影子已含在圖裡)
  sprite('items/' + it.key, it.x, it.y + bob, TS * 0.95 * pulse);
  if (it.moldy) {
    ctx.fillStyle = 'rgba(110,170,40,0.5)';
    ctx.beginPath(); ctx.arc(it.x, it.y + bob, TS * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('🦠', it.x + TS * 0.22, it.y - TS * 0.2 + bob);
  }
}

function drawMeatball(m) {
  const wob = Math.sin(elapsed * 8) * 1.5;
  const x = m.x, y = m.y - (m.held ? TS * 0.5 : 0) - (m.jump || 0) * TS * 0.6 + wob; // 手持/跳起時抬高 + 上下浮動
  const r = TS * 0.36;
  // 丸身(寫實圖,影子已含在圖裡)
  sprite(meatballSprite(m.def), x, y, TS * 1.15);

  // 快爆炸時閃白
  if (m.fuse < 0.6 && Math.floor(m.fuse * 12) % 2 === 0) {
    ctx.globalAlpha = 0.45; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 發霉:罩一層綠
  if (m.moldy) {
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#7cb342';
    ctx.beginPath(); ctx.arc(x, y, r * 0.95, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 被寵物啃時的貢丸 HP 條
  if (m.hp < MEATBALL_HP) {
    const bw = TS * 0.7, bh = 4;
    const bx = x - bw / 2, by = y - r - 9;
    ctx.fillStyle = '#000a';
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = '#7cb342';
    ctx.fillRect(bx, by, bw * clamp(m.hp / MEATBALL_HP, 0, 1), bh);
  }
}

// 爆炸波:每格一團火球(黴毒綠 / 墨魚黑),隨機旋轉,邊擴散邊淡出
function drawExplosion(ex) {
  const a = clamp(ex.t / EXPLOSION_TIME, 0, 1);
  const kind = ex.poison ? 'poison' : ex.ink ? 'ink' : 'fire';
  for (const cl of ex.cells) {
    const cx = cl.c * TS + TS / 2, cy = cl.r * TS + TS / 2;
    const v = ((cl.c * 7 + cl.r * 13) % FX_VARIANTS) + 1;
    const img = ASSETS['fx/' + kind + v];
    if (img && img.complete && img.naturalWidth) {
      const size = TS * (1.2 + 0.45 * (1 - a));
      ctx.save();
      ctx.globalAlpha = Math.min(1, a * 1.4);
      ctx.translate(cx, cy);
      ctx.rotate((cl.c * 1.7 + cl.r * 2.3) + (1 - a) * 0.6);
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else { // 圖還沒載入:簡單的漸層圓
      ctx.globalAlpha = a * 0.9;
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, TS * 0.6);
      g.addColorStop(0, '#fff7c2'); g.addColorStop(0.5, '#ffb300'); g.addColorStop(1, ex.color || '#d84315');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, TS * 0.48, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawCharacter(e) {
  const blink = e.invuln > 0 && Math.floor(e.invuln * 12) % 2 === 0;
  if (blink) return;
  // 全身像(寫實圖,腳底對齊格子下方;往左走時左右翻轉)
  const size = TS * 1.55, footY = e.y + TS * 0.42;
  const img = ASSETS[charSprite(e)];
  const spot = e === player && e.alive && spotT > 0 ? Math.min(1, spotT / 0.6) : 0;
  if (spot) {                                   // 開局:光柱 + 地面光圈,標出自己的位置
    const pulse = 0.75 + 0.25 * Math.sin(elapsed * 10);
    ctx.save();
    ctx.globalAlpha = spot;
    const beam = ctx.createLinearGradient(0, e.y - TS * 4, 0, footY);
    beam.addColorStop(0, 'rgba(255,230,120,0)'); beam.addColorStop(1, `rgba(255,220,90,${0.55 * pulse})`);
    ctx.fillStyle = beam;
    ctx.fillRect(e.x - TS * 0.55, e.y - TS * 4, TS * 1.1, footY - (e.y - TS * 4));
    const glow = ctx.createRadialGradient(e.x, footY - 4, 2, e.x, footY - 4, TS * 1.1);
    glow.addColorStop(0, `rgba(255,236,140,${0.85 * pulse})`); glow.addColorStop(1, 'rgba(255,220,90,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.ellipse(e.x, footY - 4, TS * 1.1, TS * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,213,79,${pulse})`; ctx.lineWidth = 3;
    const rr = TS * (0.5 + ((elapsed * 1.2) % 1) * 0.6);
    ctx.beginPath(); ctx.ellipse(e.x, footY - 4, rr, rr * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = e.alive ? 1 : 0.4;
  const lying = onBench(e) ? benchAt(e.col, e.row) : null;
  if (img && img.complete && img.naturalWidth) {
    ctx.save();
    if (lying) {                                  // 躺在長椅上:身體轉成橫的(順著長椅方向)
      const horiz = lying.back === 'n' || lying.back === 's';
      ctx.translate(e.x, e.y - TS * 0.32);
      if (horiz) ctx.rotate(-Math.PI / 2); else ctx.scale(1, 0.62);
      ctx.drawImage(img, -size * 0.42, -size * 0.42, size * 0.84, size * 0.84);
    } else {
      ctx.translate(e.x, footY - size / 2);
      if (e.dir && e.dir.x < 0) ctx.scale(-1, 1);
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    }
    ctx.restore();
    if (lying && e.alive) {
      ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(elapsed * 3);
      ctx.fillText('💤', e.x + TS * 0.3, e.y - TS * 0.75 - (elapsed * 8 % 6));
      ctx.globalAlpha = 1;
    }
  }
  ctx.globalAlpha = 1;
  const headY = footY - size * 0.93;
  // 隊伍/玩家標記(頭上小箭頭:你=金色,隊友=藍,敵人=紅)
  ctx.fillStyle = e === player ? '#ffd54f' : TEAM_COLOR[e.team];
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  const bob = Math.sin(elapsed * 5) * 1.5;
  ctx.moveTo(e.x, headY + bob);
  ctx.lineTo(e.x - 6, headY - 10 + bob);
  ctx.lineTo(e.x + 6, headY - 10 + bob);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  if (spot) {
    ctx.save();
    ctx.globalAlpha = spot;
    ctx.font = 'bold 15px "Noto Sans TC", sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.fillStyle = '#ffd54f';
    const ty = headY - 44 + Math.sin(elapsed * 6) * 2;
    ctx.strokeText('▼ 你在這裡!', e.x, ty); ctx.fillText('▼ 你在這裡!', e.x, ty);
    ctx.restore();
  }
  // 頭上名稱(隊伍色底):自己=你(連線時是暱稱)、連線玩家=暱稱、電腦=角色名
  if (e.alive) {
    const name = displayName(e);
    ctx.font = 'bold 11px "Noto Sans TC", sans-serif';
    const w = ctx.measureText(name).width + 10, ny = headY - 24 + bob;
    ctx.fillStyle = e === player ? 'rgba(199,154,0,0.92)' : e.team === 'red' ? 'rgba(170,40,30,0.88)' : 'rgba(25,95,170,0.88)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(e.x - w / 2, ny - 7, w, 15, 4); else ctx.rect(e.x - w / 2, ny - 7, w, 15);
    ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, e.x, ny + 0.5);
    ctx.textBaseline = 'alphabetic';
  }
  const midY = footY - size * 0.42;
  // 防護盾光環(作用中;快結束時閃爍)
  if (e.shieldT > 0 && !(e.shieldT < 0.8 && Math.floor(e.shieldT * 10) % 2 === 0)) {
    ctx.strokeStyle = 'rgba(255,213,79,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(e.x, midY, e.r * 1.35 + Math.sin(elapsed * 6) * 2, size * 0.48, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawPet(pet) {
  if (!pet.alive) return;
  const blink = pet.invuln > 0 && Math.floor(pet.invuln * 12) % 2 === 0;
  ctx.globalAlpha = blink ? 0.4 : 1;
  // 中毒時泛綠光
  if (pet.poisonT > 0) {
    ctx.fillStyle = 'rgba(124,179,66,0.4)';
    ctx.beginPath();
    ctx.arc(pet.x, pet.y, pet.r * 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  // 寵物(寫實圖)
  sprite('pets/' + pet.def.id, pet.x, pet.y, TS * 0.85);
  // 寵物 HP 條
  if (pet.hp < pet.maxHp) {
    const bw = pet.r * 2.2, bh = 3;
    ctx.fillStyle = '#000a';
    ctx.fillRect(pet.x - bw / 2 - 1, pet.y - pet.r - 7, bw + 2, bh + 2);
    ctx.fillStyle = '#ff8a80';
    ctx.fillRect(pet.x - bw / 2, pet.y - pet.r - 6, bw * clamp(pet.hp / pet.maxHp, 0, 1), bh);
  }
  ctx.globalAlpha = 1;
}

// ====================================================================
//  選單 / 結算 疊層(HTML)
// ====================================================================
const $el = (id) => document.getElementById(id);
function showOverlay(id, show) {
  const el = $el(id);
  if (el && el.classList) el.classList[show ? 'remove' : 'add']('hidden');
}
function showResult() {
  const winner = gameState === 'win' ? 'blue' : gameState === 'lose' ? 'red' : null;
  sfx(winner && winner === player.team ? 'win' : 'lose');
  if (NET.online) NET.onResult();
  onRoundEnd();
}
// 結算後回主選單(單機);連線中改用房間內的按鈕
function backToMainMenu() {
  if (NET.online) return;
  if (window.tutorial && tutorial.active) tutorial.stop();
  showOverlay('result-overlay', false);
  setupUI.hide();
  SERIES.nextAt = 0; SERIES.over = false;
  restart();
  gameState = 'menu';
  showOverlay('menu-overlay', true);
}
// 頂部「主選單」按鈕:對戰中先確認;連線中=離開攤位
function goHome() {
  if (NET.online) {
    if (!confirm('離開攤位並回到主選單?')) return;
    NET.leave(true);
    lobbyUI.hide();
    backToMainMenu();
    return;
  }
  if (gameState === 'playing' && !(window.tutorial && tutorial.active) && !confirm('放棄這一局,回到主選單?')) return;
  backToMainMenu();
}
function startMatch() {
  restart();
  sfx('start');
  announceWeather();
  showOverlay('menu-overlay', false);
  showOverlay('result-overlay', false);
}

// ====================================================================
//  戰隊名單側欄(左側頭像清單,像爆爆王的玩家列表)
// ====================================================================
let rosterEls = [];
function buildRoster() {
  const el = document.getElementById('roster');
  if (!el) return;
  el.innerHTML = '';
  rosterEls = [];
  for (const f of fighters()) {
    const row = document.createElement('div');
    row.className = 'roster-row team-' + f.team + (f === player ? ' me' : '');
    row.innerHTML =
      `<img class="roster-face" src="assets/${charSprite(f)}.webp" alt="">` +
      `<span class="roster-name">${f.label || ''}<small>${charDef(f.char).name}</small></span>` +
      `<span class="roster-hp"></span>`;
    el.appendChild(row);
    rosterEls.push({ f, row, hp: row.querySelector('.roster-hp') });
  }
}
function updateRoster() {
  for (const { f, row, hp } of rosterEls) {
    row.classList.toggle('down', !f.alive);
    hp.textContent = '❤'.repeat(Math.max(0, f.hp)) + '·'.repeat(Math.max(0, f.maxHp - f.hp));
  }
}

// ====================================================================
//  HUD
// ====================================================================
// 小圖示(寫實道具圖)與「內容有變才更新」的 innerHTML(每幀呼叫也不會一直重建 DOM)
const hudIcon = (path) => `<img class="hud-ico" src="assets/${path}.webp" alt="">`;
const hudCache = {};
function setHtml(id, html) {
  if (hudCache[id] === html) return;
  hudCache[id] = html;
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}
// 數值條(五項共用):深色 = 現在、淺色 = 自己目前的上限、整條 = 遊戲上限
function statBar(label, tag, value, cap, cur, own, color, soft) {
  const pct = (v) => Math.round(clamp(v / cap, 0, 1) * 100);
  return `<div class="stat-row"><span>${label}</span>${tag ? `<em class="stat-tag">${tag}</em>` : ''}<b>${value}</b><small>/ ${cap}</small></div>` +
    `<div class="bar3"><i style="width:${pct(own)}%;background:${soft}"></i><i style="width:${pct(cur)}%;background:${color}"></i></div>`;
}
const CHIP_CLS = { good: 'chip-good', limit: 'chip-limit', bad: 'chip-bad', fuse: 'chip-fuse' };
const weatherChips = (withFuse) =>
  (WEATHER_CHIPS[env.weather] || []).map(([k, t]) => `<span class="chip ${CHIP_CLS[k]}">${t}</span>`).join('') +
  (withFuse ? `<span class="chip chip-fuse">引信 ${computeFuse().toFixed(1)} 秒</span>` : '');
const isPhone = () => !!(window.matchMedia && window.matchMedia('(max-width: 560px)').matches);
const DIR_ARROW = { '1,0': '→', '-1,0': '←', '0,1': '↓', '0,-1': '↑' };
let hudSel = -1;

function updateHud() {
  const p = player, w = weatherDef();
  const cd = charDef(p.char), sk = skillOf(p);
  setHtml('stat-char', `<span class="ch-face"><img src="assets/portraits/${p.char || 'aman'}.webp" alt=""></span><b>${cd.name}</b><span>${cd.role}型</span>`);

  // ---- 五項數值
  const rain = w.speedBonus || 0;
  const spNow = w.snow ? Math.min(p.speed, SNOW_SPEED) : p.speed + rain + (p.dashT > 0 ? SKILLS.dash.bonus : 0);
  const spTag = w.snow ? '下雪限速' : p.dashT > 0 ? '衝刺中' : rain ? '豪雨 +' + rain : '';
  const left = Math.max(0, p.maxBombs - p.bombsPlaced());
  const bars = [
    ['HP', '', `${p.hp} / ${p.maxHp}`, CAPS.hp, p.hp, p.maxHp, '#d9483b', '#f2b8b1', `${p.hp}/${p.maxHp}`],
    ['MP', '', `${Math.floor(p.mp)} / ${p.maxMp}`, CAPS.mp, p.mp, p.maxMp, '#3a8ee6', '#b9d6f6', Math.floor(p.mp)],
    ['威力', '', p.power, CAPS.power, p.power, p.power, '#f08a24', '#f08a24', p.power],
    ['速度', spTag, Math.round(spNow), CAPS.speed, spNow, p.speed, '#2fa36b', '#b5dfc8', Math.round(spNow)],
    ['貢丸數', '', `剩 ${left} / ${p.maxBombs}`, CAPS.bombs, left, p.maxBombs, '#b07a45', '#e3cbb2', `${left}/${p.maxBombs}`],
  ];
  ['stat-hp', 'stat-mp', 'stat-power', 'stat-speed', 'stat-bombs'].forEach((id, i) => setHtml(id, statBar(...bars[i].slice(0, 8))));

  const wxFixed = env.left > 1e5;   // 固定涼爽 / 教學:不會變天
  // ---- 天氣卡:效果標籤化
  setHtml('stat-weather',
    `<div class="wx-head"><span>${isDisaster(w) ? '災害' : '現在天氣'}・${theme().name}</span><span>${wxFixed ? '固定天氣' : Math.max(0, Math.ceil(env.left)) + ' 秒後變天'}</span></div>` +
    `<div class="wx-now"><span class="wx-icon">${w.icon}</span><b>${w.name}</b></div>` +
    `<div class="wx-chips">${weatherChips(true)}</div>` +
    `<div class="bar thin"><div class="fill" style="width:${Math.round(clamp(env.left / WEATHER_MAX, 0, 1) * 100)}%;background:#8a8f95"></div></div>`);

  // ---- 動作區:放貢丸 / 技能(冷卻圓環)/ 防護盾 / 現在能做什麼
  setHtml('place-sub', p.held ? '空白鍵・放下夾著的貢丸' : `空白鍵・剩 ${left} 顆`);
  if (hudSel !== p.selected) {
    hudSel = p.selected;
    const src = `assets/meatballs/${MB_SPRITE[p.selected - 1] || 'mb_1'}.webp`;
    ['place-img', 'm-place-img'].forEach((id) => { const im = $el(id); if (im) im.src = src; });
    document.querySelectorAll('.m-ball-grid button').forEach((b) => b.classList.toggle('sel', b.dataset.key === String(p.selected)));
    const def = meatballById(p.selected);
    setHtml('m-ball-name', def ? `${p.selected <= 9 ? p.selected + ' ' : ''}${def.name}<span>・${def.desc}</span>` : '');
  }
  const cdPct = p.skillCd > 0 ? Math.round(p.skillCd / sk.cd * 20) * 5 : 0;
  const cdNum = p.skillCd > 0 ? Math.ceil(p.skillCd) : '';
  setHtml('skill-btn', `<span class="ring" style="--p:${cdPct}%"><span>${cdNum || 'T'}</span></span>` +
    `<span class="act-main"><b>${sk.name}</b><small>${p.skillCd > 0 ? '冷卻 ' + cdNum + ' 秒' : p.boostNext ? '已加料' : 'T・可使用'}</small></span>`);
  const skb = $el('skill-btn');
  if (skb && skb.parentNode) skb.parentNode.title = `${sk.name}:${sk.desc}(冷卻 ${sk.cd} 秒)`;
  setHtml('shield-sub', p.shieldT > 0 ? `作用中 ${Math.ceil(p.shieldT)} 秒` : `G・MP ${SHIELD_MP_COST}`);
  const kickWhy = p.tools.shoes > 0 ? '有鋼頭鞋' : w.freeKick ? '豪雨中' : '';
  const throwWhy = p.tools.glove > 0 ? '有隔熱手套' : w.freeThrow ? '下雪中' : '';
  const line = (ok, text) => `<div class="cd-line${ok ? ' ok' : ''}"><i></i>${text}</div>`;
  setHtml('can-do', '<div class="cd-title">現在能做什麼</div>' +
    line(!!kickWhy, '踢貢丸:' + (kickWhy || '需豪雨或鋼頭鞋')) +
    line(!!throwWhy, '丟貢丸:' + (throwWhy || '需下雪或隔熱手套')) +
    (p.tools.tongs > 0 || p.tools.slingshot > 0 ? line(false, '食物夾、彈弓:要先面向貢丸') : ''));

  // ---- 情境提示:面向貢丸時告訴玩家能做什麼
  const facing = p.alive && gameState === 'playing' ? facingMeatball(p) : null;
  let tip = '';
  if (p.alive && p.held) tip = '<kbd>空白</kbd>放下貢丸';
  else if (facing && canMoveBall(facing)) {
    const phone = isPhone(), parts = [];
    if (canKick(p)) parts.push(phone ? '點貢丸 = 踢' : `<kbd>${DIR_ARROW[p.dir.x + ',' + p.dir.y] || '→'}</kbd>再推 = 踢`);
    if (canThrow(p)) parts.push(phone ? '放貢丸 ×2 = 丟' : '<kbd>空白 ×2</kbd>丟');
    tip = parts.join('<i></i>');
  }
  // 3D 的低血量警示(2D 畫在畫布上):HP 只剩 1 時畫面邊緣泛紅閃爍
  const low = $el('lowhp-overlay');
  if (low && low.classList) low.classList.toggle('on', p.alive && p.hp === 1 && gameState === 'playing');
  setHtml('ctx-hint', tip);
  const ch = $el('ctx-hint');
  if (ch && ch.classList) ch.classList.toggle('hidden', !tip);

  // ---- 手機:天氣 + 五項迷你條、底部操作列
  if (isPhone()) {
    setHtml('m-status',
      `<div class="ms-wx"><span class="wx-icon">${w.icon}</span><b>${w.name}</b>${weatherChips(false)}<span class="ms-left">${wxFixed ? '固定' : Math.max(0, Math.ceil(env.left)) + 's 後變天'}</span></div>` +
      '<div class="ms-stats">' + bars.map((b) => {
        const pct = (v) => Math.round(clamp(v / b[3], 0, 1) * 100);
        return `<div class="ms"><div class="ms-row"><span>${b[0] === '貢丸數' ? '貢丸' : b[0]}</span><b>${b[8]}</b></div>` +
          `<div class="bar3 mini"><i style="width:${pct(b[5])}%;background:${b[7]}"></i><i style="width:${pct(b[4])}%;background:${b[6]}"></i></div></div>`;
      }).join('') + '</div>');
    setHtml('m-place-sub', p.held ? '放下' : `剩 ${left}${canThrow(p) ? '・連點丟' : ''}`);
    setHtml('m-skill-cd', cdNum ? String(cdNum) : '');
    const ring = $el('m-skill-ring');
    if (ring && ring.style) ring.style.setProperty('--p', cdPct + '%');
  }

  const mm = Math.floor(Math.max(0, matchTime) / 60);
  const ss = Math.floor(Math.max(0, matchTime) % 60);
  setHtml('stat-enemies',
    `<span class="sc-blue">藍 ${teamAlive('blue')}</span>` +
    `<span class="sc-time">${mm}:${ss.toString().padStart(2, '0')}</span>` +
    `<span class="sc-red">紅 ${teamAlive('red')}</span>`);

  renderCards();
  // 戰隊名單:更新每個人的存活/HP 顯示
  updateRoster();
  // 貢丸選擇列:只更新選取狀態(按鈕由 buildSelector 建立一次,不重建)
  refreshSelector();
  // 動作按鈕:當下無法執行的變半透明失效
  refreshActionButtons();
}

// ---------- 動作按鈕可用性 ----------
let actionBtns = null;
function refreshActionButtons() {
  if (!actionBtns) {
    if (!document.querySelectorAll) return;
    const list = document.querySelectorAll('.actions button, .side-right > .act, .m-bar button[data-key]');
    actionBtns = list && list.length ? Array.from(list) : [];
  }
  if (!actionBtns.length) return;
  const inMatch = gameState === 'playing' && !!player;
  const playing = inMatch && player.alive;
  const facing = playing ? facingMeatball(player) : null;
  const avail = {
    // 放貢丸:有額度且腳下沒丸;夾著貢丸時 = 放下;面向可丟的貢丸時 = 連按兩下丟
    ' ': playing && (!!player.held || (!!facing && canThrow(player)) || (player.bombsPlaced() < player.maxBombs &&
         !meatballs.some((m) => !m.exploded && m.col === player.col && m.row === player.row))),
    'g': playing && player.mp >= SHIELD_MP_COST && !(player.shieldT > 0), // 防護盾:MP 夠且沒在作用中
    't': playing && !(player.skillCd > 0),                          // 角色技能:冷卻完畢
    'r': true,                                                      // 重來:永遠可用
  };
  for (const b of actionBtns) {
    const key = b.dataset ? b.dataset.key : null;
    const ok = key in avail ? avail[key] : true;
    if (b.classList) b.classList.toggle('disabled', !ok);
  }
}

// ---------- 卡牌區(畫面下方):一次性工具、寵物、永久卡 ----------
const CARD_TAG = { once: '一次性', perm: '永久', pet: '寵物' };
const PET_DESC = '按下就放出,自動啃掉貢丸(無法收回)';
function cardNote(p, key) {
  if (PETS[key]) return '點一下放出';
  const playing = gameState === 'playing' && p.alive;
  if (!playing) return '';
  if (key === 'vacuum') { const n = vacuumTargets(p).length; return n ? `可吸 ${n} 顆` : '四周沒有貢丸'; }
  if (key === 'garbage') { const n = garbageTargets(p).length; return n ? `前方 ${n} 顆` : '前方沒有貢丸'; }
  if (key === 'tongs') return p.held ? '夾著中' : facingMeatball(p) ? '可夾起' : '要面向貢丸';
  if (key === 'slingshot') return (p.held || facingMeatball(p)) ? (firstCharacterAhead(p) ? '可射向前方的人' : '射到最遠處') : '要面向貢丸';
  return '';
}
function renderCards() {
  const p = player;
  const inMatch = gameState === 'playing' && !!p;
  const cards = [];
  if (p) {
    for (const key of CARD_ORDER) {
      if (PETS[key]) {
        const s = p.petState[key];
        if (s && s.status === 'stored') cards.push({ key, n: 1, kind: 'pet', def: PETS[key], img: 'pets/' + key, hot: key === 'rat' ? 'K' : 'L' });
      } else if (p.tools[key] > 0 && TOOLS[key].type === 'once') {
        const def = TOOLS[key];
        cards.push({ key, n: p.tools[key], kind: 'once', def, img: 'items/' + key, hot: (def.useKey || '').toUpperCase() });
      }
    }
  }
  const html = cards.map((c) => {
    const ok = inMatch && cardUsable(p, c.key);
    const fresh = p.cardNew && elapsed - (p.cardNew[c.key] || -9) < 1.5;
    const desc = c.kind === 'pet' ? PET_DESC : c.def.desc;
    return `<button type="button" class="tcard ${c.kind}${ok ? '' : ' off'}${fresh ? ' new' : ''}" data-card="${c.key}" title="${c.def.name}:${desc}">` +
      `<span class="tc-tag">${CARD_TAG[c.kind]}</span>${c.hot ? `<kbd>${c.hot}</kbd>` : ''}` +
      (c.n > 1 ? `<span class="tc-n">×${c.n}</span>` : '') +
      `<img src="assets/${c.img}.webp" alt=""><span class="tc-txt"><b>${c.def.name}</b><small>${fresh ? 'NEW' : cardNote(p, c.key)}</small></span></button>`;
  }).join('') || '<p class="cards-empty">木箱炸開撿到的工具會變成卡牌</p>';
  setHtml('card-bar', html);
  // 永久能力:固定兩格(沒取得也留虛線框,知道還缺什麼)
  setHtml('perm-slots', p ? ['shoes', 'glove'].map((k) => {
    const own = p.tools[k] > 0, d = TOOLS[k];
    return `<div class="perm${own ? ' own' : ''}" title="${d.name}:${d.desc}"><img src="assets/items/${k}.webp" alt="">` +
      `<span><b>${d.name}</b><small>${own ? (k === 'shoes' ? '隨時可踢' : '隨時可丟') : '尚未取得'}</small></span></div>`;
  }).join('') : '');
}
// 按下卡牌:立刻使用(連線玩家改送按鍵給攤主)
function onCardClick(ev) {
  const b = ev.target.closest && ev.target.closest('.tcard');
  if (!b) return;
  b.blur();
  if (gameState !== 'playing' || !player) return;
  const key = b.dataset.card;
  if (TOOLS[key] && TOOLS[key].type === 'perm') { hint(player, TOOLS[key].name + ':' + TOOLS[key].desc + '(自動)', '#a5d6a7'); return; }
  const hot = PETS[key] ? (key === 'rat' ? 'k' : 'l') : TOOLS[key].useKey;
  if (NET.role === 'guest') NET.sendKey(hot); else playerAction(player, hot);
}

// 建立貢丸選單(只執行一次;用事件委派,避免每幀重建 DOM 吃掉點擊)
let selectorLast = -1;
function buildSelector() {
  const sel = document.getElementById('selector');
  if (!sel || !sel.querySelectorAll) return;
  sel.innerHTML = MEATBALLS.filter((m) => !m.special).map((m) => `
    <button type="button" class="mbtn${m.night ? ' night-only' : ''}" data-id="${m.id}" title="${m.name}:${m.desc}${m.night ? '(夜市限定)' : ''}">
      <img src="assets/meatballs/${MB_SPRITE[m.id - 1]}.webp" alt="${m.name}">
      <b>${m.hotkey ? m.hotkey.toUpperCase() : m.id}</b>
    </button>`).join('');
  sel.addEventListener('click', (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest('.mbtn') : null;
    if (!btn) return;
    const def = meatballById(+btn.dataset.id);
    const key = def.hotkey || String(def.id);
    if (NET.role === 'guest') NET.sendKey(key);
    else playerAction(player, key);
    selectorLast = -1; // 強制刷新
    refreshSelector();
  });
  selectorLast = -1; // 按鈕剛建立:強制刷新一次(夜市限定依地圖顯示/隱藏)
  refreshSelector();
}

// 依 player.selected 更新按鈕高亮與說明(狀態沒變就不動 DOM)
function refreshSelector() {
  if (!player) return;
  const night = nightFoodAllowed();
  const stateKey = player.selected + (player.porkNext ? 'p' : '') + (night ? 'n' : '');
  if (selectorLast === stateKey) return;
  selectorLast = stateKey;
  const sel = document.getElementById('selector');
  if (sel && sel.querySelectorAll) {
    sel.querySelectorAll('.mbtn').forEach((b) => {
      if (b.classList) {
        b.classList.toggle('active', +b.dataset.id === player.selected);
        if (b.classList.contains('night-only')) b.style.display = night ? '' : 'none';
      }
    });
  }
  const descEl = document.getElementById('mb-desc');
  if (descEl) {
    const cur = meatballById(player.selected);
    descEl.textContent = player.porkNext
      ? '🥩 下一顆:黑豬肉貢丸(會追蹤敵人)'
      : `${cur.name} — ${cur.desc}`;
  }
}

// ====================================================================
//  主選單:選角色
// ====================================================================
const CHAR_MAX = { hp: 5, mp: 150, speed: 185, power: 3, bombs: 3 };
function buildCharPick() {
  const box = $el('char-pick');
  if (!box) { pickChar(myChar); return; }   // 選角移到對戰設定畫面;這裡只更新主選單的立繪
  box.innerHTML = CHAR_IDS.map((id) =>
    `<button type="button" class="charbtn" data-char="${id}" aria-label="${CHARACTERS[id].name}">` +
    `<img src="assets/portraits/${id}.webp" alt=""><span>${CHARACTERS[id].name}</span></button>`).join('');
  box.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('.charbtn');
    if (!b) return;
    pickChar(b.dataset.char);
  });
  pickChar(myChar);
}
function pickChar(id) {
  if (!CHARACTERS[id]) return;
  myChar = id;
  try { localStorage.setItem('bbw_char', id); } catch (e) { /* 無痕模式 */ }
  document.querySelectorAll('.charbtn').forEach((b) => b.classList.toggle('active', b.dataset.char === id));
  const c = CHARACTERS[id], sk = SKILLS[c.skill];
  const info = $el('char-info');
  if (info) info.innerHTML = `<b>${c.name}</b>・${c.role}・技能 <b>${sk.icon}${sk.name}</b> ${sk.desc}`;
  const img = $el('hero-char');
  if (img) img.src = `assets/portraits/${id}.webp`;
  const bar = (label, v, max, color) =>
    `<div class="hc-row"><span>${label}</span><div class="bar"><div class="fill" style="width:${Math.round(v / max * 100)}%;background:${color}"></div></div><b>${v}</b></div>`;
  const card = $el('hero-card');
  if (card) card.innerHTML =
    `<div class="hc-name"><b>${c.name}</b><span>${c.title}・${c.role}</span></div>` +
    bar('HP', c.hp, CHAR_MAX.hp, '#d9483b') + bar('MP', c.mp, CHAR_MAX.mp, '#3a8ee6') +
    bar('速度', c.speed, CHAR_MAX.speed, '#2fa36b') + bar('威力', c.power, CHAR_MAX.power, '#f08a24') +
    bar('貢丸數', c.bombs, CHAR_MAX.bombs, '#b07a45') +
    `<div class="hc-skill"><kbd>T</kbd><b>${sk.icon}${sk.name}</b><span>${sk.desc}</span></div>` +
    `<div class="hc-cd">冷卻 ${sk.cd} 秒</div>`;
  if (typeof NET !== 'undefined' && NET.role === 'guest') NET.raw({ t: 'pick', c: id });
}

// ====================================================================
//  初始化 / 重新開始
// ====================================================================
function restart() {
  if (window.tutorial) tutorial.stop(); // 任何重新開局都會結束教學
  rollSpawns();                         // 每局出生位置都不同
  spotT = 3.5;                          // 開局亮光標出自己的位置
  generateMap();
  randomizeWeather();
  if (MATCH.wx === 'calm') { setWeather('cool'); env.left = 1e9; }   // 對戰設定:固定涼爽
  meatballs = []; explosions = []; items = []; particles = [];
  spawnStartFood(theme().startFood || 0);
  matchTime = MATCH.time || MATCH_TIME;
  usedBush = new Set(); wildCritters = [];

  const spawns = teamSpawns();
  // 連線房主:slotPlan()[出生點序號] = 該位置的真人玩家;沒有的就由 AI 補位
  const humans = NET.role === 'host' ? NET.slotPlan() : {};
  // 第一個出生點 = 本機玩家(連線時是房主)
  player = new Player(spawns[0].col, spawns[0].row, true, '#3aa6ff');
  player.team = spawns[0].team;
  player.label = '你';
  applyCharacter(player, myChar, false);
  if (humans[0]) player.netName = humans[0].name;
  // 其餘為 AI(藍隊隊友 / 紅隊敵人)或連線玩家
  bots = [];
  let blueN = 0, redN = 0;
  for (let i = 1; i < spawns.length; i++) {
    const s = spawns[i];
    const h = humans[i];
    const b = new Player(s.col, s.row, !!h, TEAM_COLOR[s.team]);
    b.team = s.team;
    if (h) {
      b.remote = true; b.netId = h.id; b.label = h.name; // 連線玩家:用自己選的角色
      applyCharacter(b, NET.picks[h.id] || randomChar(), false);
    } else {
      applyCharacter(b, randomChar(), true);          // 電腦:隨機角色
      b.label = s.team === 'blue' ? `隊友${++blueN}` : `敵人${++redN}`;
    }
    bots.push(b);
  }
  gameState = 'playing';
  elapsed = 0;
  // 寵物預設收著,用 K / L 放出
  buildRoster();
  updateHud();
}

// ====================================================================
//  遊戲迴圈
// ====================================================================
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  if (!window.VIEW || VIEW.mode === '2d') draw(); // 3D 模式由 render3d.js 畫,2D 畫布不用畫
  requestAnimationFrame(loop);
}

// 載入畫面
ctx.fillStyle = '#1f6e2e'; ctx.fillRect(0, 0, W, H);
ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
ctx.fillText('載入圖片…', W / 2, H / 2);

// 先載入 SVG 資產 → 顯示主選單(場景在背後待命)
loadAssets().then(() => {
  restart();
  buildSelector(); // 貢丸選單只建一次(事件委派)
  refreshSelector();
  gameState = 'menu';
  showOverlay('menu-overlay', true);
  if (new URLSearchParams(location.search).get('room')) lobbyUI.show(); // 邀請連結:直接打開連線大廳
  const bs = $el('btn-start');
  if (bs) bs.addEventListener('click', () => setupUI.open());   // 先到對戰設定畫面
  const bm = $el('btn-menu');
  if (bm) bm.addEventListener('click', backToMainMenu);
  buildCharPick();
  const cb = $el('card-bar');
  if (cb) cb.addEventListener('click', onCardClick);
  const bh = $el('btn-home');
  if (bh) bh.addEventListener('click', () => { bh.blur(); goHome(); });
  // 地圖選擇:點選即切換主題並即時預覽(選單背後的場景跟著換)
  document.querySelectorAll('.mapbtn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentMapId = btn.dataset.map;
      document.querySelectorAll('.mapbtn').forEach((b) =>
        b.classList.toggle('active', b === btn));
      restart();
      gameState = 'menu'; // 維持在選單,只更新背景預覽
    });
  });
  last = performance.now();
  requestAnimationFrame(loop);
});
