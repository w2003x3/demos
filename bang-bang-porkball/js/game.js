// ====================================================================
//  爆爆丸 — 貢丸版炸彈超人
//  純前端 Canvas 遊戲。依賴 config.js 的常數與定義。
// ====================================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = W;
canvas.height = H;

// ---------- SVG 像素資產 ----------
// 貢丸 id(1~9)對應的 sprite 檔名
const MB_SPRITE = ['gongwan', 'pee', 'lava', 'mini', 'mushroom', 'taro', 'cilantro', 'spicy', 'squid'];
const ASSET_LIST = {
  tiles: ['floor1', 'floor2', 'stone', 'crate', 'trashcan', 'bush',
          'market_floor1', 'market_floor2', 'market_stall', 'market_crate', 'market_pile', 'market_trash',
          'night_floor1', 'night_floor2', 'night_stall', 'night_table', 'night_boxes', 'night_trash'],
  meatballs: MB_SPRITE,
  items: ['mushroom', 'taro', 'cilantro', 'chili', 'skewer', 'radish', 'pepper', 'enoki',
          'squid', 'blastsuit', 'mask', 'ratbait', 'roachbait', 'vacuum', 'garbage',
          'slippers', 'tongs', 'glove', 'slingshot',
          'luckybag', 'chicken', 'bloodcake', 'milktea', 'boba', 'tofu'],
  pets: ['rat', 'roach'],
  characters: ['player', 'ally', 'enemy'],
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
      img.src = 'assets/' + key + '.svg';
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
const meatballSprite = (def) => 'meatballs/' + MB_SPRITE[def.id - 1];
const charSprite = (e) => 'characters/' + (e === player ? 'player' : e.team === 'red' ? 'enemy' : 'ally');

// ---------- 工具函式 ----------
const rand = (n) => Math.floor(Math.random() * n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tileCenter = (c) => c * TS + TS / 2;
const toCol = (x) => Math.floor(x / TS);
const toRow = (y) => Math.floor(y / TS);

// ---------- 地圖 ----------
let grid = []; // grid[r][c] = TILE.*

// 兩隊出生點(col,row):藍隊在左、紅隊在右。第一個是人類玩家。
function teamSpawns() {
  const mid = Math.floor(ROWS / 2);
  return [
    { col: 1, row: 1, team: 'blue', human: true },
    { col: 1, row: ROWS - 2, team: 'blue' },
    { col: 1, row: mid, team: 'blue' },
    { col: COLS - 2, row: 1, team: 'red' },
    { col: COLS - 2, row: ROWS - 2, team: 'red' },
    { col: COLS - 2, row: mid, team: 'red' },
  ];
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

// 天氣在遊戲中緩慢飄移,讓貢丸時效持續變化
let weatherT = 0;
function driftWeather(dt) {
  weatherT += dt;
  env.temp = clamp(env.temp + Math.sin(weatherT * 0.13) * dt * 1.6, 8, 40);
  env.humidity = clamp(env.humidity + Math.cos(weatherT * 0.09) * dt * 2.2, 28, 96);
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
let wildCritters = [];     // 被草叢驚動的野生老鼠/蟑螂(攻擊一次後自生自滅)

// 危險地圖:danger[r][c] = 幾秒後會被爆炸波及(Infinity = 安全)
let danger = null;
function computeDanger() {
  const d = Array.from({ length: ROWS }, () => Array(COLS).fill(Infinity));
  for (const m of meatballs) {
    if (m.exploded || m.eaten) continue;
    for (const cl of blastCells(m.col, m.row, m.power, m.def.behavior === 'pierce')) {
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
    this.blastGuard = 0;        // 防護盾/防爆衣:可抵免幾次爆炸波
    this.moldGuard = 0;         // N95 口罩:可抵免幾次中黴毒
    this.immunity = 1;          // 免疫力:越高,負面狀態時效越短(白蘿蔔提升)
    this.throwBonus = 0;        // 丟擲距離加成(胡椒粉)
    this.enokiEaten = 0;        // 吃過的金針菇數(死亡會噴出等量)
    this.fuseBonus = 0;         // 自己貢丸的額外時效(金針菇)
    this.inkEaten = 0;          // 吃過的墨魚數(減輕黑畫面)
    this.blindT = 0;            // 黑畫面剩餘秒數(被墨魚貢丸炸到)
    this.held = null;           // 用食物夾夾著的貢丸
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
    this.tools = isHuman
      ? { vacuum: 1, garbage: 1, slippers: 1, tongs: 2, glove: 2, slingshot: 1 }
      : { vacuum: 0, garbage: 0, slippers: 0, tongs: 0, glove: 0, slingshot: 0 };
  }

  get col() { return toCol(this.x); }
  get row() { return toRow(this.y); }

  bombsPlaced() {
    return meatballs.filter((m) => m.owner === this).length;
  }

  // 黴毒(吃到發霉的道具):N95 口罩可抵免一次,否則中毒
  moldPoison() {
    if (!this.alive) return;
    if (this.moldGuard > 0) {
      this.moldGuard--;
      spawnText(this.x, this.y - TS * 0.6, '😷口罩擋下黴毒', '#90caf9');
    } else {
      // 中毒時效隨免疫力縮短
      this.poisonT = POISON_TIME / this.immunity;
      this.poisonTick = 0;
      spawnText(this.x, this.y - TS * 0.6, '中黴毒!🤢', '#7cb342');
    }
  }

  hurt(dmg = 1, poison = false) {
    if (!this.alive) return;
    if (poison) this.moldPoison();
    if (this.invuln > 0) return;
    // 爆炸傷害:防護盾/防爆衣可抵免一次爆炸波
    if (this.blastGuard > 0) {
      this.blastGuard--;
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

    // 最高優先:場上若有「對應自己的毒餌」,優先去咬(咬到會死)
    const bait = nearestBait(this);
    if (bait) {
      petStep(this, bait.x, bait.y, dt); // 沿通道繞過障礙
      const bd = Math.hypot(bait.x - this.x, bait.y - this.y);
      if (bd < TS * 0.5) {
        bait.dead = true;                 // 毒餌被吃掉
        this.alive = false;               // 寵物中毒身亡
        spawnText(this.x, this.y - 14, this.def.emoji + '吃了' + BAITS[bait.key].name + '☠️', '#ff8a80');
      }
      this.target = null;
      return;
    }

    // 否則:找最近且未在滑行的貢丸當目標
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

// 找出吸引此寵物的最近毒餌(老鼠藥→老鼠、蟑螂藥→蟑螂)
function nearestBait(pet) {
  let best = Infinity, found = null;
  for (const it of items) {
    if (it.dead || !BAITS[it.key]) continue;
    if (BAITS[it.key].target !== pet.def.id) continue;
    const d = (it.x - pet.x) ** 2 + (it.y - pet.y) ** 2;
    if (d < best) { best = d; found = it; }
  }
  return found;
}

// ---------- 道具 ----------
class Item {
  constructor(col, row, key) {
    this.x = tileCenter(col);
    this.y = tileCenter(row);
    this.key = key;
    this.t = 0;
    // 會壞掉:新鮮期過後發霉,再過一段時間消失(毒餌本身就是毒,不會壞)
    this.age = 0;
    this.fresh = BAITS[key] ? Infinity : itemFreshTime(key);
    this.moldy = false;
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
  // 該格已有貢丸則不放
  if (meatballs.some((m) => m.col === c && m.row === r)) return;
  const def = meatballById(p.selected);
  meatballs.push(new Meatball(c, r, def, p));
  sfx('place', p.x, p.y);
}

// 計算某位置爆炸會波及的格子(共用:實際爆炸 + AI 危險預測)
function blastCells(c, r, power, pierce) {
  const cells = [{ c, r }];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
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
  const cells = blastCells(c, r, m.power, m.def.behavior === 'pierce');
  sfx(m.def.behavior === 'ink' ? 'splat' : 'boom', m.x, m.y);

  // 第一階段:連鎖引爆 + 摧毀爆炸範圍內「既有」道具
  // (地形掉落與特殊噴出的新道具在下方才生成,不會被這裡誤刪)
  for (const cell of cells) {
    if (cell.r < 0 || cell.c < 0 || cell.r >= ROWS || cell.c >= COLS) continue;
    for (const other of meatballs) {
      if (!other.exploded && other.col === cell.c && other.row === cell.r) {
        other.fuse = Math.min(other.fuse, 0.05);
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
      // 可破壞物(木箱/蔬菜箱/摺疊桌):
      // 60% 裝備/防護、24% 工具、8% 毒餌、6% 台灣小吃、1% 福袋、1% 空
      const rr = Math.random();
      if (rr < 0.60) spawnItem(cell.c, cell.r, pick(Object.keys(GEAR)));
      else if (rr < 0.84) spawnItem(cell.c, cell.r, pick(Object.keys(TOOLS)));
      else if (rr < 0.92) spawnItem(cell.c, cell.r, pick(Object.keys(BAITS)));
      else if (rr < 0.98) spawnItem(cell.c, cell.r, snackDrop());
      else if (rr < 0.99) spawnItem(cell.c, cell.r, 'luckybag');
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

  explosions.push({
    cells,
    t: EXPLOSION_TIME,
    color: m.moldy ? '#558b2f' : m.def.glow,
    poison: m.moldy,                    // 發霉貢丸 → 黴毒爆炸
    ink: m.def.behavior === 'ink',      // 墨魚貢丸 → 黑畫面
  });
}

function spawnItem(c, r, key) {
  if (items.some((it) => !it.dead && it.col === c && it.row === r)) return;
  items.push(new Item(c, r, key));
}

// 取得道具定義(食物 / 工具 / 毒餌 / 防護裝備)
function itemDef(key) { return ITEMS[key] || TOOLS[key] || BAITS[key] || GEAR[key]; }

const pick = (arr) => arr[rand(arr.length)];

// 依目前地圖的加權表抽一種台灣小吃(該地圖名產較常見)
function snackDrop() {
  const w = theme().snackWeights;
  const pool = [];
  for (const k of SNACKS) for (let i = 0; i < (w[k] || 1); i++) pool.push(k);
  return pick(pool);
}

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
      group.forEach((g) => (g.fuse = Math.min(g.fuse, 0.05)));
    }
  }
}

// ====================================================================
//  踢動 / 騎乘貢丸(消耗 MP)
// ====================================================================
function kickMeatball(p) {
  // 找面向方向最近且相鄰的貢丸
  const tc = p.col + p.dir.x;
  const tr = p.row + p.dir.y;
  const m = meatballs.find(
    (mb) => mb.col === tc && mb.row === tr && !mb.moving && !mb.exploded
  );
  if (!m) return;
  if (p.mp < RIDE_MP_PER_TILE) {
    spawnText(p.x, p.y - TS * 0.4, 'MP 不足', '#42a5f5');
    return;
  }
  m.vx = p.dir.x; m.vy = p.dir.y;
  m.moving = true;
  sfx('kick', p.x, p.y);
  m.rider = p;
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
  // 扣騎乘者 MP
  if (m.rider && m.rider.alive) {
    if (m.rider.mp >= RIDE_MP_PER_TILE) {
      m.rider.mp -= RIDE_MP_PER_TILE;
    } else {
      m.moving = false; m.vx = m.vy = 0; return; // MP 用盡停下
    }
  }
  const nc = m.col + m.vx;
  const nr = m.row + m.vy;
  // 牆、其他貢丸、人(滑行中的貢丸不能穿過人體;放在腳下不受影響)都會擋住
  const blocked = isBlocked(nc, nr) ||
    meatballs.some((o) => o !== m && o.col === nc && o.row === nr) ||
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

// 掃描玩家面向方向上的貢丸(到牆為止),依距離排序
function scanAhead(p) {
  const found = [];
  let c = p.col, r = p.row;
  for (let i = 0; i < Math.max(COLS, ROWS); i++) {
    c += p.dir.x; r += p.dir.y;
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) break;
    if (grid[r][c] === TILE.SOLID) break; // 被水泥柱擋住
    for (const m of meatballs) {
      if (!m.exploded && !m.eaten && m.col === c && m.row === r) found.push(m);
    }
  }
  return found;
}

// 使用非食用道具:清除前方貢丸
function useTool(p, type) {
  if (!p.tools[type]) {
    spawnText(p.x, p.y - TS * 0.5, '沒有' + TOOLS[type].name, '#bbb');
    return;
  }
  const ahead = scanAhead(p);
  if (!ahead.length) {
    spawnText(p.x, p.y - TS * 0.5, '前方無貢丸', '#bbb');
    return;
  }
  if (type === 'vacuum') {
    ahead[0].eaten = true; // 只清第一顆
  } else if (type === 'garbage') {
    ahead.forEach((m) => (m.eaten = true)); // 清整排
  }
  p.tools[type]--;
  sfx('whoosh', p.x, p.y);
  spawnText(p.x, p.y - TS * 0.55, TOOLS[type].emoji + TOOLS[type].name + '!', '#80d8ff');
  updateHud();
}

// 取得玩家面向方向第一顆貢丸(含腳下),供食物夾/隔熱手套使用
function frontOrHereMeatball(p) {
  const here = meatballs.find(
    (m) => !m.exploded && !m.eaten && !m.held && m.col === p.col && m.row === p.row);
  if (here) return here;
  const ahead = scanAhead(p);
  return ahead.length ? ahead[0] : null;
}

// 找落點:面向方向 maxDist 內、由遠到近第一個可放置的空格
function findLandingTile(p, maxDist) {
  for (let i = maxDist; i >= 1; i--) {
    const c = p.col + p.dir.x * i, r = p.row + p.dir.y * i;
    if (!isFloor(c, r)) continue;
    if (meatballs.some((m) => !m.exploded && m.col === c && m.row === r)) continue;
    return { c, r };
  }
  return null;
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

// 食物夾:夾起貢丸帶著走;再按一次放到前方
function useTongs(p) {
  if (p.held) {
    const spot = findLandingTile(p, 1) || { c: p.col, r: p.row };
    p.held.held = false;
    p.held.x = tileCenter(spot.c); p.held.y = tileCenter(spot.r);
    spawnText(p.held.x, p.held.y - 12, '放下', '#80d8ff');
    p.held = null;
    return;
  }
  if (!p.tools.tongs) { spawnText(p.x, p.y - TS * 0.5, '沒有食物夾', '#bbb'); return; }
  const m = frontOrHereMeatball(p);
  if (!m) { spawnText(p.x, p.y - TS * 0.5, '前方無貢丸', '#bbb'); return; }
  m.held = true; m.moving = false; m.vx = m.vy = 0;
  p.held = m;
  p.tools.tongs--;
  sfx('whoosh', p.x, p.y);
  spawnText(p.x, p.y - TS * 0.55, '🥢夾起貢丸', '#80d8ff');
  updateHud();
}

// 隔熱手套:撿起前方(或手上)的貢丸往前丟擲
function useGlove(p) {
  if (!p.tools.glove) { spawnText(p.x, p.y - TS * 0.5, '沒有隔熱手套', '#bbb'); return; }
  const m = p.held || frontOrHereMeatball(p);
  if (!m) { spawnText(p.x, p.y - TS * 0.5, '前方無貢丸', '#bbb'); return; }
  const dist = BASE_THROW + p.throwBonus;
  const spot = findLandingTile(p, dist);
  if (!spot) { spawnText(p.x, p.y - TS * 0.5, '前方無落點', '#bbb'); return; }
  if (p.held === m) p.held = null;
  m.held = false; m.moving = false; m.vx = m.vy = 0;
  m.x = tileCenter(spot.c); m.y = tileCenter(spot.r);
  p.tools.glove--;
  sfx('whoosh', p.x, p.y);
  spawnText(m.x, m.y - 12, '🧤丟!', '#ffd54f');
  updateHud();
}

// 彈弓:把貢丸射向前方第一人 → 立即爆炸;無人則射到最遠空格(正常引信)
// 優先射出「手上夾著/腳下/前方」既有的貢丸(原貢丸會被用掉);沒有才生成新的
function useSlingshot(p) {
  if (!p.tools.slingshot) { spawnText(p.x, p.y - TS * 0.5, '沒有彈弓', '#bbb'); return; }
  const hit = firstCharacterAhead(p);
  const spot = hit || findLandingTile(p, Math.max(COLS, ROWS));
  if (!spot) { spawnText(p.x, p.y - TS * 0.5, '前方無落點', '#bbb'); return; }

  const existing = p.held || frontOrHereMeatball(p);
  let m;
  if (existing) {
    // 用既有貢丸:搬到落點(原地那顆就是它,不會多出來)
    if (p.held === existing) p.held = null;
    existing.held = false; existing.moving = false; existing.vx = existing.vy = 0;
    existing.x = tileCenter(spot.c); existing.y = tileCenter(spot.r);
    m = existing;
  } else {
    // 沒有現成貢丸:生成一顆選定種類的
    m = new Meatball(spot.c, spot.r, meatballById(p.selected), p);
    meatballs.push(m);
  }
  if (hit) {
    m.fuse = 0.02; // 命中人物 → 立刻爆炸
    spawnText(tileCenter(spot.c), tileCenter(spot.r) - 12, '🏹命中!', '#ff8a80');
  } else {
    spawnText(tileCenter(spot.c), tileCenter(spot.r) - 12, '🏹射出', '#ffd54f');
  }
  p.tools.slingshot--;
  sfx('whoosh', p.x, p.y);
  updateHud();
}

// 藍白拖:踩附近(任一)寵物,每踩扣其 HP
function useSlippers(p) {
  if (!p.tools.slippers) { spawnText(p.x, p.y - TS * 0.5, '沒有藍白拖', '#bbb'); return; }
  let best = Infinity, target = null;
  for (const pet of allPets()) {
    if (!pet.alive) continue;
    const d = Math.hypot(pet.x - p.x, pet.y - p.y);
    if (d < best && d < TS * 1.6) { best = d; target = pet; }
  }
  if (!target) { spawnText(p.x, p.y - TS * 0.5, '附近無寵物', '#bbb'); return; }
  target.hp -= SLIPPER_DMG;
  spawnText(target.x, target.y - 12, '🩴踩!-' + SLIPPER_DMG, '#ff8a80');
  if (target.hp <= 0) { target.hp = 0; target.alive = false; }
  p.tools.slippers--;
  sfx('squeak', target.x, target.y);
  updateHud();
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
  if (p.mp < SHIELD_MP_COST) {
    spawnText(p.x, p.y - TS * 0.5, 'MP 不足', '#42a5f5');
    return;
  }
  p.mp -= SHIELD_MP_COST;
  p.blastGuard++;
  sfx('shield', p.x, p.y);
  spawnText(p.x, p.y - TS * 0.55, '🛡️防護盾 +1', '#ffd54f');
  updateHud();
}

// 放出寵物(若已放出則改為收起);可分別放出老鼠/蟑螂,順序不拘
function deployPet(p, id) {
  const s = p.petState[id];
  if (!s) return;
  if (s.status === 'dead') {
    spawnText(p.x, p.y - TS * 0.5, s.def.emoji + '已昏倒,本場無法再放出', '#ff8a80');
    return;
  }
  if (s.status === 'out') { recallPet(p, id); return; } // 再按一次=收起
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
  const mv = e.speed * dt;
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
  if (k === 'r' || (k === 'enter' && gameState !== 'playing')) {
    // 重新開始:教學中=重來這一步;連線中只有房主能重開
    if (k === 'r' && window.tutorial && tutorial.active) tutorial.retry();
    else if (NET.online) { if (NET.role === 'host') NET.restartMatch(); }
    else startMatch();
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
  // 選擇貢丸 1~9
  if (k >= '1' && k <= '9') {
    p.selected = parseInt(k, 10);
    if (p === player) updateHud();
  }
  if (k === ' ') placeMeatball(p);
  if (k === 'e' || k === 'j') kickMeatball(p); // 踢/騎乘
  if (k === 'q') useTool(p, 'vacuum');         // 吸塵器
  if (k === 'f') useTool(p, 'garbage');        // 垃圾車
  if (k === 'g') activateShield(p);            // 防護盾(花 MP)
  if (k === 'v') useSlippers(p);               // 藍白拖(踩寵物)
  if (k === 'z') useTongs(p);                  // 食物夾(夾起/放下)
  if (k === 'x') useGlove(p);                  // 隔熱手套(丟擲)
  if (k === 'c') useSlingshot(p);              // 彈弓(射向前方人)
  if (k === 'k') deployPet(p, 'rat');          // 放出/收起 老鼠
  if (k === 'l') deployPet(p, 'roach');        // 放出/收起 蟑螂
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
  if (want && typeof window !== 'undefined' && window.moveTransform) {
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
  // 在格中心且沒有進行中的移動時,接受新方向、決定下一格目標
  if (!p.mvTarget && want) {
    if (!keepFacing) p.dir = { x: want[0], y: want[1] }; // 倒退時不轉身
    const nc = p.col + want[0], nr = p.row + want[1];
    if (canEnterTile(p, nc, nr)) {
      p.mvTarget = { x: tileCenter(nc), y: tileCenter(nr) };
    }
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
  if (!isFloor(c, r)) return;
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
  e.selected = AI_BOMB_TYPES[rand(AI_BOMB_TYPES.length)];
  placeMeatball(e);
  e.aiBombCd = 1.2 + Math.random() * 1.6;
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
  // 3) 附近有道具 → 去撿(毒餌不撿)
  let p = aiPath(e, (c, r) =>
    items.some((it) => !it.dead && !it.moldy && !BAITS[it.key] && it.col === c && it.row === r), 12, 1.0);
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
  elapsed += dt;

  driftWeather(dt);
  danger = computeDanger(); // 供 AI 決策與畫面預警

  readPlayerInput(dt);
  if (player.invuln > 0) player.invuln -= dt;
  if (player.blindT > 0) player.blindT -= dt;
  player.tickPoison(dt);
  updateHeldMeatball(player);

  // MP 自然回復(所有角色)
  for (const f of fighters()) {
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
    if (!m.held) updateMovingMeatball(m, dt); // 手持中不滑行(但仍會變質、引信倒數)
    m.age += dt;
    if (!m.moving) m.fuse -= dt;
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
    if (it.dead) return false;                 // 已被寵物吃掉的毒餌
    it.t += dt;
    it.age += dt;
    if (!it.moldy && it.age >= it.fresh) {     // 放太久 → 發霉(變綠)
      it.moldy = true;
      spawnText(it.x, it.y - TS * 0.5, '發霉了🦠', '#7cb342');
    }
    if (it.moldy && it.age >= it.fresh + MOLD_STAGE) return false; // 爛掉消失
    it.update(dt);                             // 墨魚會自行游走
    if (BAITS[it.key]) return true;            // 毒餌不會被人物撿走,只吸引寵物
    // 所有角色(玩家與 AI)都能撿道具
    for (const f of fighters()) {
      if (!f.alive || it.col !== f.col || it.row !== f.row) continue;
      if (it.moldy) {                                           // 發霉的道具:沒效果還中黴毒
        sfx('yuck', f.x, f.y);
        spawnText(f.x, f.y - TS * 0.5, '吃到發霉的' + itemDef(it.key).name + '!', '#7cb342');
        f.moldPoison();
      } else if (TOOLS[it.key]) {
        sfx('gear', f.x, f.y);
        f.tools[it.key] = (f.tools[it.key] || 0) + 1;           // 工具入庫
        spawnText(f.x, f.y - TS * 0.5, '+' + TOOLS[it.key].name, '#80d8ff');
      } else if (GEAR[it.key]) {                                // 防護裝備
        sfx('gear', f.x, f.y);
        if (GEAR[it.key].guard === 'blast') f.blastGuard++;
        else f.moldGuard++;
        spawnText(f.x, f.y - TS * 0.5, '+' + GEAR[it.key].name, GEAR[it.key].color);
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
  ctx.fillStyle = '#1f6e2e';
  ctx.fillRect(0, 0, W, H);

  // 地板 / 牆 / 可破壞物 / 垃圾桶(依地圖主題選 SVG 像素磚)
  const th = theme().tiles;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      const cx = c * TS + TS / 2, cy = r * TS + TS / 2;
      const floor = 'tiles/' + ((c + r) % 2 === 0 ? th.floor1 : th.floor2);
      if (t === TILE.SOLID) sprite('tiles/' + th.solid, cx, cy, TS);
      else if (t === TILE.BRICK) sprite('tiles/' + th.brick, cx, cy, TS);
      else if (t === TILE.TRASH) sprite('tiles/' + th.trash, cx, cy, TS);
      else if (t === TILE.BUSH) sprite('tiles/' + th.bush, cx, cy, TS);
      else sprite(floor, cx, cy, TS);
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

  // 道具
  items.forEach(drawItem);
  // 爆炸
  explosions.forEach(drawExplosion);
  // 貢丸
  meatballs.forEach(drawMeatball);
  // 寵物
  allPets().forEach(drawPet);
  // 野生生物(自生自滅)
  wildCritters.forEach((w) => {
    ctx.globalAlpha = clamp(w.life, 0, 1); // 快消失時漸淡
    sprite('pets/' + w.def.id, w.x, w.y, TS * 0.6);
    ctx.globalAlpha = 1;
  });
  // AI 角色(紅隊敵人 / 藍隊隊友)與玩家
  bots.forEach((e) => { if (e.alive || e.deathT > 0) drawCharacter(e); });
  if (player.alive || player.invuln > 0) drawCharacter(player);

  // 飄字
  particles.forEach((p) => {
    ctx.globalAlpha = clamp(p.life, 0, 1);
    ctx.fillStyle = p.color;
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
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

  // 被墨魚貢丸炸到 → 黑畫面
  if (player.blindT > 0 && player.alive) drawBlind();
  // 選單/結算改用 HTML 疊層(見 index.html)
}

function drawBlind() {
  // 吃過墨魚會降低不透明度;接近結束時漸退
  const base = Math.max(0.25, 0.92 - player.inkEaten * 0.15);
  const fade = clamp(player.blindT / 0.6, 0, 1);
  ctx.fillStyle = `rgba(4,6,16,${base * fade})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = fade;
  ctx.fillStyle = '#cfd8dc';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🦑 被墨魚噴黑了!', W / 2, H / 2);
  ctx.globalAlpha = 1;
}

function drawItem(it) {
  const bob = Math.sin(it.t * 4) * 1.5;
  const pulse = 1 + Math.sin(it.t * 5) * 0.06;
  // 柔和陰影
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(it.x, it.y + TS * 0.34, TS * 0.24, TS * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  // 發霉:縮小、快消失時閃爍,並蓋上綠色黴斑
  const rot = it.moldy ? clamp((it.age - it.fresh) / MOLD_STAGE, 0, 1) : 0;
  if (it.moldy && rot > 0.7 && Math.floor(it.t * 8) % 2 === 0) return;
  // 道具(SVG)
  sprite('items/' + it.key, it.x, it.y + bob, TS * 0.78 * pulse * (1 - rot * 0.35));
  if (it.moldy) {
    ctx.fillStyle = 'rgba(110,170,40,0.55)';
    ctx.beginPath(); ctx.arc(it.x, it.y + bob, TS * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('🦠', it.x + TS * 0.22, it.y - TS * 0.2 + bob);
  }
}

function drawMeatball(m) {
  const wob = Math.sin(elapsed * 8) * 2;
  const x = m.x, y = m.y - (m.held ? TS * 0.5 : 0) + wob; // 手持時抬高 + 上下浮動
  const r = TS * 0.36;
  // 陰影
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(m.x, m.y + r * 0.8, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // 丸身(SVG)
  sprite(meatballSprite(m.def), x, y, TS);

  // 快爆炸時閃白
  if (m.fuse < 0.6 && Math.floor(m.fuse * 12) % 2 === 0) {
    ctx.globalAlpha = 0.45; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 發霉斑點
  if (m.moldy) {
    ctx.fillStyle = 'rgba(124,179,66,0.85)';
    for (const [sx, sy] of [[-0.4, -0.3], [0.35, -0.15], [-0.15, 0.4], [0.3, 0.35]]) {
      ctx.beginPath();
      ctx.arc(x + sx * r, y + sy * r, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
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

function drawExplosion(ex) {
  const a = clamp(ex.t / EXPLOSION_TIME, 0, 1);
  for (const cl of ex.cells) {
    const x = cl.c * TS, y = cl.r * TS;
    ctx.globalAlpha = a * 0.9;
    const g = ctx.createRadialGradient(x + TS / 2, y + TS / 2, 2, x + TS / 2, y + TS / 2, TS * 0.6);
    g.addColorStop(0, '#fff7c2');
    g.addColorStop(0.5, '#ffb300');
    g.addColorStop(1, ex.color || '#d84315');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x + TS / 2, y + TS / 2, TS * 0.48, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawCharacter(e) {
  const blink = e.invuln > 0 && Math.floor(e.invuln * 12) % 2 === 0;
  if (blink) return;
  // 陰影
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + e.r * 0.95, e.r * 0.8, e.r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  // 學生全身像(SVG)
  ctx.globalAlpha = e.alive ? 1 : 0.4;
  sprite(charSprite(e), e.x, e.y - TS * 0.06, TS * 1.2);
  ctx.globalAlpha = 1;
  // 隊伍/玩家標記(頭上小箭頭:你=金色,隊友=藍,敵人=紅)
  ctx.fillStyle = e === player ? '#ffd54f' : TEAM_COLOR[e.team];
  ctx.beginPath();
  ctx.moveTo(e.x, e.y - TS * 0.72 + Math.sin(elapsed * 5) * 1.5);
  ctx.lineTo(e.x - 5, e.y - TS * 0.86);
  ctx.lineTo(e.x + 5, e.y - TS * 0.86);
  ctx.fill();
  // 防護盾光環(抵免爆炸)
  if (e.blastGuard > 0) {
    ctx.strokeStyle = 'rgba(255,213,79,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * 1.35 + Math.sin(elapsed * 6) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 口罩光環(抵免黴毒)
  if (e.moldGuard > 0) {
    ctx.strokeStyle = 'rgba(144,202,249,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * 1.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
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
  // 寵物(SVG)
  sprite('pets/' + pet.def.id, pet.x, pet.y, TS * 0.72);
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
  const title = $el('result-title'), sub = $el('result-sub');
  const winner = gameState === 'win' ? 'blue' : gameState === 'lose' ? 'red' : null;
  if (title) title.textContent = !winner ? '🤝 平手!' :
    winner === player.team ? '🎉 你的隊伍獲勝!' : '💀 你的隊伍輸了';
  if (sub) sub.textContent = (winner ? TEAM_NAME[winner] + '勝利 · ' : '') +
    `存活 🔵 ${teamAlive('blue')} vs 🔴 ${teamAlive('red')}`;
  showOverlay('result-overlay', true);
  sfx(winner && winner === player.team ? 'win' : 'lose');
  if (NET.online) NET.onResult();
}
function startMatch() {
  restart();
  sfx('start');
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
    const portrait = f === player ? 'player' : (f.team === 'red' ? 'enemy' : 'ally');
    const row = document.createElement('div');
    row.className = 'roster-row team-' + f.team + (f === player ? ' me' : '');
    row.innerHTML =
      `<img class="roster-face" src="assets/characters/${portrait}.svg" alt="">` +
      `<span class="roster-name">${f.label || ''}</span>` +
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
function updateHud() {
  const bar = (cur, max, color) =>
    `<div class="bar"><div class="fill" style="width:${(cur / max) * 100}%;background:${color}"></div></div>`;
  document.getElementById('stat-hp').innerHTML =
    `❤️ HP ${player.hp}/${player.maxHp}` + bar(player.hp, player.maxHp, '#ff5252');
  document.getElementById('stat-mp').innerHTML =
    `💧 MP ${Math.floor(player.mp)}/${player.maxMp}` + bar(player.mp, player.maxMp, '#42a5f5');
  document.getElementById('stat-power').textContent = '💥 威力 ' + player.power;
  document.getElementById('stat-speed').textContent = '👟 速度 ' + Math.round(player.speed);
  document.getElementById('stat-bombs').textContent =
    `🍢 竹籤 ${player.bombsPlaced()}/${player.maxBombs}`;
  document.getElementById('stat-weather').textContent =
    `${theme().icon}${theme().name} 🌡️${Math.round(env.temp)}°C 💧${Math.round(env.humidity)}%`;
  const petEl = document.getElementById('stat-pet');
  const mark = { out: '放出', stored: '收起', dead: '昏倒' };
  petEl.textContent = '寵物 ' + Object.values(player.petState)
    .map((s) => `${s.def.emoji}${mark[s.status]}`).join(' ');
  const t = player.tools;
  document.getElementById('stat-tools').textContent =
    `🧹${t.vacuum || 0} 🚛${t.garbage || 0} 🩴${t.slippers || 0} ` +
    `🥢${t.tongs || 0} 🧤${t.glove || 0} 🏹${t.slingshot || 0}`;
  document.getElementById('stat-guard').textContent =
    `🛡️${player.blastGuard} 😷${player.moldGuard} 🦠免疫${player.immunity.toFixed(1)}`;
  const poisonEl = document.getElementById('stat-poison');
  const st = [];
  if (player.poisonT > 0) st.push('🤢黴毒' + player.poisonT.toFixed(1) + 's');
  if (player.blindT > 0) st.push('🦑黑畫面' + player.blindT.toFixed(1) + 's');
  if (st.length) {
    poisonEl.textContent = st.join(' ');
    poisonEl.style.background = '#3a4d1a';
  } else {
    poisonEl.textContent = '🟢 健康';
    poisonEl.style.background = '#223040';
  }
  const mm = Math.floor(Math.max(0, matchTime) / 60);
  const ss = Math.floor(Math.max(0, matchTime) % 60);
  document.getElementById('stat-enemies').textContent =
    `⏱️ ${mm}:${ss.toString().padStart(2, '0')}  ` +
    `🔵${teamAlive('blue')} vs 🔴${teamAlive('red')}`;

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
    const list = document.querySelectorAll('.actions button');
    actionBtns = list && list.length ? Array.from(list) : [];
  }
  if (!actionBtns.length) return;
  const inMatch = gameState === 'playing' && !!player;
  const playing = inMatch && player.alive;
  const t = playing ? player.tools : {};
  // 共用的情境判定(都很便宜,每幀跑沒問題)
  const aheadMb = playing && scanAhead(player).length > 0;          // 面向方向有貢丸
  const frontMb = playing && !!frontOrHereMeatball(player);         // 前方或腳下有貢丸
  const kickMb = playing && meatballs.some((m) =>
    !m.exploded && !m.eaten && !m.moving && !m.held &&
    m.col === player.col + player.dir.x && m.row === player.row + player.dir.y);
  const petNear = playing && allPets().some((p) =>
    p.alive && Math.hypot(p.x - player.x, p.y - player.y) < TS * 1.6);
  const avail = {
    ' ': playing && player.bombsPlaced() < player.maxBombs &&       // 放貢丸:有額度且腳下沒丸
         !meatballs.some((m) => !m.exploded && m.col === player.col && m.row === player.row),
    'e': kickMb && player.mp >= RIDE_MP_PER_TILE,                   // 踢/騎:前方相鄰有丸且 MP 夠
    'g': playing && player.mp >= SHIELD_MP_COST,                    // 防護盾:MP 夠
    'z': playing && (player.held ? true : (t.tongs > 0 && frontMb)),// 食物夾:夾著可放下;否則需有夾子+目標
    'x': playing && t.glove > 0 && (!!player.held || frontMb),      // 手套:有手套+有丸可丟
    'c': playing && t.slingshot > 0,                                // 彈弓:有彈弓
    'q': playing && t.vacuum > 0 && aheadMb,                        // 吸塵器:有工具+前方有丸
    'f': playing && t.garbage > 0 && aheadMb,                       // 垃圾車:有工具+前方有丸
    'v': playing && t.slippers > 0 && petNear,                      // 藍白拖:有拖鞋+附近有寵物
    // 寵物:倒下後仍可放出/收起還活著的寵物
    'k': inMatch && player.petState.rat && player.petState.rat.status !== 'dead',
    'l': inMatch && player.petState.roach && player.petState.roach.status !== 'dead',
    'r': true,                                                      // 重來:永遠可用
  };
  for (const b of actionBtns) {
    const key = b.dataset ? b.dataset.key : null;
    const ok = key in avail ? avail[key] : true;
    if (b.classList) b.classList.toggle('disabled', !ok);
  }
}

// 建立貢丸選單(只執行一次;用事件委派,避免每幀重建 DOM 吃掉點擊)
let selectorLast = -1;
function buildSelector() {
  const sel = document.getElementById('selector');
  if (!sel || !sel.querySelectorAll) return;
  sel.innerHTML = MEATBALLS.map((m) => `
    <button type="button" class="mbtn" data-id="${m.id}" title="${m.name}:${m.desc}">
      <img src="assets/meatballs/${MB_SPRITE[m.id - 1]}.svg" alt="${m.name}">
      <b>${m.id}</b>
    </button>`).join('');
  sel.addEventListener('click', (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest('.mbtn') : null;
    if (!btn) return;
    if (NET.role === 'guest') NET.sendKey(btn.dataset.id);
    player.selected = +btn.dataset.id;
    selectorLast = -1; // 強制刷新
    refreshSelector();
  });
}

// 依 player.selected 更新按鈕高亮與說明(選擇沒變就不動 DOM)
function refreshSelector() {
  if (!player || selectorLast === player.selected) return;
  selectorLast = player.selected;
  const sel = document.getElementById('selector');
  if (sel && sel.querySelectorAll) {
    sel.querySelectorAll('.mbtn').forEach((b) => {
      if (b.classList) b.classList.toggle('active', +b.dataset.id === player.selected);
    });
  }
  const descEl = document.getElementById('mb-desc');
  if (descEl) {
    const cur = meatballById(player.selected);
    descEl.textContent = `${cur.name} — ${cur.desc}`;
  }
}

// ====================================================================
//  初始化 / 重新開始
// ====================================================================
function restart() {
  if (window.tutorial) tutorial.stop(); // 任何重新開局都會結束教學
  generateMap();
  randomizeWeather();
  weatherT = 0;
  meatballs = []; explosions = []; items = []; particles = [];
  matchTime = MATCH_TIME;
  usedBush = new Set(); wildCritters = [];

  const spawns = teamSpawns();
  // 連線房主:slotPlan()[出生點序號] = 該位置的真人玩家;沒有的就由 AI 補位
  const humans = NET.role === 'host' ? NET.slotPlan() : {};
  // 第一個出生點 = 本機玩家(連線時是房主)
  player = new Player(spawns[0].col, spawns[0].row, true, '#3aa6ff');
  player.team = spawns[0].team;
  player.label = '你';
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
      b.remote = true; b.netId = h.id; b.label = h.name; // 連線玩家:數值同真人
    } else {
      b.maxHp = 2; b.hp = 2; b.power = 2; b.speed = 95; b.maxBombs = 2;
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
  draw();
  requestAnimationFrame(loop);
}

// 載入畫面
ctx.fillStyle = '#1f6e2e'; ctx.fillRect(0, 0, W, H);
ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
ctx.fillText('載入像素圖…', W / 2, H / 2);

// 先載入 SVG 資產 → 顯示主選單(場景在背後待命)
loadAssets().then(() => {
  restart();
  buildSelector(); // 貢丸選單只建一次(事件委派)
  refreshSelector();
  gameState = 'menu';
  showOverlay('menu-overlay', true);
  if (new URLSearchParams(location.search).get('room')) lobbyUI.show(); // 邀請連結:直接打開連線大廳
  const bs = $el('btn-start'), ba = $el('btn-again');
  if (bs) bs.addEventListener('click', startMatch);
  if (ba) ba.addEventListener('click', startMatch);
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
