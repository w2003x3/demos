// ===== 全域設定 =====
// 地圖以格子(tile)為單位,每格 TS 像素
const TS = 48;            // 每格像素
const COLS = 15;          // 地圖寬(格)
const ROWS = 13;          // 地圖高(格)
const W = COLS * TS;      // 畫布寬
const H = ROWS * TS;      // 畫布高

// 地圖磚塊種類
const TILE = {
  EMPTY: 0, // 空地
  SOLID: 1, // 不可破壞牆(水泥柱)
  BRICK: 2, // 木箱(可破壞,掉裝備/防護)
  TRASH: 3, // 垃圾桶(可破壞,掉食用道具)
  BUSH: 4,  // 草叢(可通行,可能驚動野生老鼠/蟑螂;可炸掉變草地)
};

// ===== 道具定義 =====
// 每種道具的圖示與效果
const ITEMS = {
  mushroom: { name: '香菇', emoji: '🍄', desc: '移動速度 +', color: '#c97b5a' },
  taro:     { name: '芋頭', emoji: '🍠', desc: 'HP 上限 +', color: '#9b59b6' },
  cilantro: { name: '香菜', emoji: '🌿', desc: 'MP 上限 +', color: '#27ae60' },
  chili:    { name: '辣椒', emoji: '🌶️', desc: '炸彈威力 +', color: '#e74c3c' },
  // 竹籤:加長竹籤 → 場上可同時存在的貢丸數量上限 +(由垃圾桶噴出)
  skewer:   { name: '竹籤', emoji: '🍢', desc: '可放貢丸數 +', color: '#d2b48c' },
  // 白蘿蔔:提升免疫力 → 縮短負面狀態(中黴毒、黑畫面…)時效
  radish:   { name: '白蘿蔔', emoji: '🥬', desc: '免疫力 +(負面狀態變短)', color: '#cfd8dc' },
  // 胡椒粉:增加丟擲貢丸的距離
  pepper:   { name: '胡椒粉', emoji: '🧂', desc: '丟擲距離 +', color: '#bcaaa4' },
  // 金針菇:延長「自己產生的貢丸」食用時效;死亡時噴出等量金針菇
  enoki:    { name: '金針菇', emoji: '🍄‍🟫', desc: '自己貢丸時效 +', color: '#ffe0b2' },
  // 墨魚:會自行小範圍移動;食用後減輕被墨魚貢丸炸到的黑畫面
  squid:    { name: '墨魚', emoji: '🦑', desc: '減輕黑畫面', color: '#455a64' },
  // 黑豬肉:只會在 1 號一般貢丸爆炸時隨機噴出;吃下後下一顆一定是黑豬肉貢丸
  blackpork: { name: '黑豬肉', emoji: '🥩', desc: '下一顆變成追蹤敵人的黑豬肉貢丸', color: '#6d3a3a' },

  // ===== 台灣小吃神器(稀有,直接把數值拉滿)=====
  luckybag:  { name: '福袋',       emoji: '🧧', desc: '全能力直接達頂!', color: '#e53935' },
  chicken:   { name: '雞排',       emoji: '🍗', desc: 'HP 補滿',        color: '#e0a33c' },
  bloodcake: { name: '豬血糕',     emoji: '🍡', desc: 'MP 補滿',        color: '#6d3a2e' },
  milktea:   { name: '早餐店奶茶', emoji: '🧋', desc: '速度達頂',       color: '#c89b6a' },
  boba:      { name: '珍奶',       emoji: '🧋', desc: '貢丸數達頂',     color: '#8d6e63' },
  tofu:      { name: '臭豆腐',     emoji: '🥡', desc: '貢丸威力達頂',   color: '#e6b84a' },
};

// 能力上限(福袋/小吃「達頂」用)
const CAPS = { speed: 280, power: 8, bombs: 10, hp: 8, mp: 250, immunity: 4 };

// 台灣小吃清單(福袋另計,更稀有)
const SNACKS = ['chicken', 'bloodcake', 'milktea', 'boba', 'tofu'];

// 會從可破壞磚隨機掉落的「食用」道具(竹籤不在此列,只從垃圾桶噴出)
const FOOD_DROP_KEYS = ['mushroom', 'taro', 'cilantro', 'chili',
  'radish', 'pepper', 'enoki', 'squid'];

// 套用道具效果到玩家身上
function applyItem(p, key) {
  switch (key) {
    case 'mushroom': // 香菇:增加移動速度
      p.speed = Math.min(p.speed + 22, 280);
      break;
    case 'taro':     // 芋頭:增加 HP 上限並回血
      p.maxHp += 1;
      p.hp = Math.min(p.hp + 1, p.maxHp);
      break;
    case 'cilantro': // 香菜:增加 MP 上限並回復
      p.maxMp += 25;
      p.mp = Math.min(p.mp + 25, p.maxMp);
      break;
    case 'chili':    // 辣椒:增加炸彈威力(爆炸範圍)
      p.power = Math.min(p.power + 1, 8);
      break;
    case 'skewer':   // 竹籤:加長竹籤 → 可同時放置的貢丸數量上限 +
      p.maxBombs = Math.min(p.maxBombs + 1, 10);
      break;
    case 'radish':   // 白蘿蔔:提升免疫力(負面狀態時效變短)
      p.immunity = Math.min((p.immunity || 1) + 0.4, 4);
      break;
    case 'pepper':   // 胡椒粉:丟擲距離 +
      p.throwBonus = (p.throwBonus || 0) + 1;
      break;
    case 'enoki':    // 金針菇:自己貢丸時效 +,並記錄數量(死亡會噴出)
      p.enokiEaten = (p.enokiEaten || 0) + 1;
      p.fuseBonus = (p.fuseBonus || 0) + ENOKI_FUSE_BONUS;
      break;
    case 'squid':    // 墨魚:減輕被墨魚貢丸炸到的黑畫面
      p.inkEaten = (p.inkEaten || 0) + 1;
      break;
    case 'blackpork': // 黑豬肉:下一顆貢丸變成黑豬肉貢丸(只有一顆)
      p.porkNext = true;
      break;

    // ===== 台灣小吃神器 =====
    case 'luckybag':  // 福袋:全能力/數值直接達頂
      p.maxHp = CAPS.hp;      p.hp = CAPS.hp;
      p.maxMp = CAPS.mp;      p.mp = CAPS.mp;
      p.speed = CAPS.speed;
      p.power = CAPS.power;
      p.maxBombs = CAPS.bombs;
      p.immunity = CAPS.immunity;
      break;
    case 'chicken':   // 雞排:補滿 HP
      p.hp = p.maxHp;
      break;
    case 'bloodcake': // 豬血糕:補滿 MP
      p.mp = p.maxMp;
      break;
    case 'milktea':   // 早餐店奶茶:速度達頂
      p.speed = CAPS.speed;
      break;
    case 'boba':      // 珍奶:可放貢丸數達頂
      p.maxBombs = CAPS.bombs;
      break;
    case 'tofu':      // 臭豆腐:貢丸威力達頂
      p.power = CAPS.power;
      break;
  }
}

// ===== 貢丸(炸彈)定義 =====
// id 對應鍵盤 1~8;每種貢丸有不同個性
const MEATBALLS = [
  {
    id: 1, key: '貢', name: '貢丸', color: '#d9a066', glow: '#b9783c',
    behavior: 'normal',
    desc: '單純爆炸',
  },
  {
    id: 2, key: '尿', name: '撒尿牛丸', color: '#f7d51d', glow: '#c9a800',
    behavior: 'bounce',  // 被踢出後會反彈很多次
    bounces: 4,
    desc: '踢出後可反彈多次',
  },
  {
    id: 3, key: '爆', name: '爆漿貢丸', color: '#c0392b', glow: '#7d1f15',
    behavior: 'pierce',  // 爆炸可穿越阻礙物
    desc: '爆炸可跨越障礙物',
  },
  {
    id: 4, key: '小', name: '小貢丸', color: '#e67e22', glow: '#a85710',
    behavior: 'cluster', // 三顆相連才會爆;未滿三顆不會自爆,被其他爆炸波及才跟著爆
    cluster: 3,
    desc: '三顆相連才爆,被波及也會爆',
  },
  {
    id: 5, key: '菇', name: '香菇貢丸', color: '#8e6e53', glow: '#5c4632',
    behavior: 'drop', drop: 'mushroom',
    desc: '爆炸噴出香菇',
  },
  {
    id: 6, key: '芋', name: '芋頭貢丸', color: '#9b59b6', glow: '#6c3483',
    behavior: 'drop', drop: 'taro',
    desc: '爆炸噴出芋頭',
  },
  {
    id: 7, key: '菜', name: '香菜貢丸', color: '#27ae60', glow: '#176f3a',
    behavior: 'drop', drop: 'cilantro',
    desc: '爆炸噴出香菜',
  },
  {
    id: 8, key: '辣', name: '麻辣貢丸', color: '#e74c3c', glow: '#922b21',
    behavior: 'drop', drop: 'chili',
    desc: '爆炸噴出辣椒',
  },
  {
    id: 9, key: '墨', name: '墨魚貢丸', color: '#37474f', glow: '#10171c',
    behavior: 'ink', drop: 'squid', // 噴出墨魚,並讓被炸者短暫看不到畫面
    desc: '炸到會短暫黑畫面、噴墨魚',
  },
  // ===== 特殊貢丸(不在 1~9 選單裡)=====
  {
    id: 10, key: '黑', name: '黑豬肉貢丸', color: '#3b2b2b', glow: '#4a1414',
    behavior: 'homing', special: true, // 吃黑豬肉後的下一顆:彈跳追蹤敵人
    desc: '自動彈跳追蹤敵人,碰到就爆',
  },
  // ===== 夜市限定(按 O / P 選)=====
  {
    id: 11, key: '腸', name: '香腸', color: '#c2412a', glow: '#7a2414',
    behavior: 'normal', axis: 'v', night: true, hotkey: 'o',
    desc: '爆炸只往上下;放在米腸旁會被包成大腸包小腸',
  },
  {
    id: 12, key: '米', name: '米腸', color: '#eadcc0', glow: '#a58b5a',
    behavior: 'normal', axis: 'h', night: true, hotkey: 'p',
    desc: '爆炸只往左右;旁邊放香腸會包成大腸包小腸',
  },
  {
    id: 13, key: '包', name: '大腸包小腸', color: '#d9b48a', glow: '#8a4a24',
    behavior: 'square', special: true, // 香腸 + 米腸合體
    desc: '3×3 方格爆炸,無視柱子',
  },
];

// 黑豬肉:1 號貢丸爆炸時噴出的機率;黑豬肉貢丸多給的引信秒數、每次彈跳間隔
const BLACKPORK_DROP = 0.18;
const PORK_FUSE_BONUS = 2.0;
const PORK_HOP_TIME = 0.28;   // 一次彈跳的飛行時間
const PORK_HOP_GAP = 0.18;    // 落地後停頓


function meatballById(id) {
  return MEATBALLS.find((m) => m.id === id);
}

// 每顆貢丸的 HP(只有寵物能攻擊貢丸,人物不能)
const MEATBALL_HP = 30;

// ===== 寵物定義 =====
// 寵物會自動衝向最近的貢丸啃咬(扣貢丸 HP),咬到 HP 歸零就吃掉它(不會爆炸)
const PETS = {
  rat:   { id: 'rat',   name: '老鼠', emoji: '🐭', speed: 175, bite: 16, hp: 4 },
  roach: { id: 'roach', name: '蟑螂', emoji: '🪳', speed: 220, bite: 9,  hp: 3 },
};

// ===== 非食用道具(工具)=====
// 用按鍵使用,清除前方的貢丸
const TOOLS = {
  vacuum:    { id: 'vacuum',    name: '吸塵器',   emoji: '🧹', useKey: 'q',
               desc: '清除前方第一顆貢丸' },
  garbage:   { id: 'garbage',   name: '垃圾車',   emoji: '🚛', useKey: 'f',
               desc: '清除前方整排貢丸' },
  slippers:  { id: 'slippers',  name: '藍白拖',   emoji: '🩴', useKey: 'v',
               desc: '踩附近寵物,每踩扣其 HP' },
  tongs:     { id: 'tongs',     name: '食物夾',   emoji: '🥢', useKey: 'z',
               desc: '夾起/放下貢丸帶著走' },
  glove:     { id: 'glove',     name: '隔熱手套', emoji: '🧤', useKey: 'x',
               desc: '撿起貢丸往前丟擲' },
  slingshot: { id: 'slingshot', name: '彈弓',     emoji: '🏹', useKey: 'c',
               desc: '把貢丸射向前方第一人(立即爆)' },
};

// 丟擲 / 致盲 / 金針菇 相關
const BASE_THROW = 3;          // 丟擲基礎距離(格)
const ENOKI_FUSE_BONUS = 0.7;  // 每顆金針菇增加自己貢丸的時效(秒)
const BLIND_TIME = 3.5;        // 被墨魚貢丸炸到的黑畫面基礎秒數
const SLIPPER_DMG = 2;         // 藍白拖每踩對寵物造成的傷害

// 毒餌(老鼠藥/蟑螂藥)、防護裝備(防爆衣/N95 口罩)已移除;保留空表讓舊程式路徑不出錯
const BAITS = {};
const GEAR = {};

// 防護盾:花 MP 啟動,維持幾秒;期間擋下一次爆炸(被炸到就立刻失效),不能累積
const SHIELD_MP_COST = 30;
const SHIELD_TIME = 3;

// MP 自然回復(每秒):讓防護盾、踢/騎乘貢丸等 MP 技能更常派上用場
const MP_REGEN = 4;

// ===== 地圖主題 =====
// 每張地圖用不同圖材與生成參數;snackWeights = 該地圖較容易掉的台灣小吃
const MAPS = {
  park: {
    name: '公園', icon: '🌳',
    tiles: { floor1: 'floor1', floor2: 'floor2', solid: 'stone',
             brick: 'crate', trash: 'trashcan', bush: 'bush' },
    brickRate: 0.72, trashCount: 7, bushCount: 9,
    // 公園野餐:早餐店奶茶常見
    snackWeights: { chicken: 1, bloodcake: 1, milktea: 3, boba: 1, tofu: 1 },
  },
  market: {
    name: '菜市場', icon: '🥬',
    tiles: { floor1: 'market_floor1', floor2: 'market_floor2', solid: 'market_stall',
             brick: 'market_crate', trash: 'market_trash', bush: 'market_pile' },
    brickRate: 0.75, trashCount: 10, bushCount: 7,
    // 市場現宰現做:雞排、豬血糕常見
    snackWeights: { chicken: 3, bloodcake: 3, milktea: 1, boba: 1, tofu: 1 },
  },
  night: {
    name: '夜市', icon: '🏮',
    tiles: { floor1: 'night_floor1', floor2: 'night_floor2', solid: 'night_stall',
             brick: 'night_table', trash: 'night_trash', bush: 'night_boxes' },
    brickRate: 0.70, trashCount: 9, bushCount: 6,
    // 夜市名產:臭豆腐、珍奶常見
    snackWeights: { chicken: 2, bloodcake: 1, milktea: 1, boba: 3, tofu: 3 },
  },
};

// ===== 隊伍對戰 =====
// 兩隊:blue(玩家隊)vs red(敵隊)。限時內炸光敵隊全員獲勝。
const MATCH_TIME = 180;        // 每場時間(秒)
const TEAM_COLOR = { blue: '#3aa6ff', red: '#e74c3c' };
const TEAM_NAME = { blue: '🔵 藍隊', red: '🔴 紅隊' };

// 騎乘/踢動貢丸:每移動一格消耗的 MP
const RIDE_MP_PER_TILE = 6;
// 炸彈被踢後滑行速度(像素/秒)
const KICK_SPEED = 280;
// 爆炸持續時間(秒)
const EXPLOSION_TIME = 0.5;
// 受傷後無敵時間(秒)
const INVULN_TIME = 1.0;

// ===== 天氣型態 =====
// 一場會隨機變天(每 30~45 秒);天氣決定貢丸引信長短,部分天氣有特殊效果
//   fuse:貢丸引信秒數  decay:未啟動小貢丸幾秒後分解  weight:被抽中的權重(災害較少見)
const WEATHERS = {
  rain:    { name: '豪雨', icon: '⛈️', fuse: 3.0, decay: 8,  weight: 3, speedBonus: 10, freeKick: true,
             desc: '速度 +10、可以踢貢丸' },
  cold:    { name: '寒流', icon: '❄️', fuse: 4.6, decay: 16, weight: 3, desc: '貢丸很慢才爆' },
  cool:    { name: '涼爽', icon: '🍃', fuse: 3.6, decay: 14, weight: 3, desc: '貢丸較慢爆' },
  muggy:   { name: '悶熱', icon: '♨️', fuse: 2.3, decay: 10, weight: 3, desc: '貢丸較快爆' },
  hot:     { name: '炎熱', icon: '☀️', fuse: 1.5, decay: 9,  weight: 3, desc: '貢丸很快就爆' },
  typhoon: { name: '颱風', icon: '🌀', fuse: 3.0, decay: 12, weight: 1, gust: 4,
             desc: '每 4 秒吹走所有貢丸' },
  quake:   { name: '地震', icon: '🏚️', fuse: 3.0, decay: 12, weight: 1, shake: 1.3,
             desc: '貢丸隨機移位' },
};
const WEATHER_MIN = 5, WEATHER_MAX = 20;    // 每種天氣維持的秒數範圍(隨機)
const env = {
  weather: 'cool',   // 目前天氣
  left: 40,          // 距離下次變天(秒)
  t: 0,              // 這個天氣已經持續幾秒
  fx: 0,             // 颱風/地震的下一次發作倒數
};
const weatherDef = () => WEATHERS[env.weather] || WEATHERS.cool;

// 線性插值
function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }

// 引信時間:依天氣
function computeFuse() { return weatherDef().fuse; }

// 小貢丸發霉的閃爍時間(秒)
const MOLD_STAGE = 6;

// 小貢丸(未滿三顆、還沒啟動時)放太久會發霉分解:依天氣 8~16 秒
function computeMiniDecay() { return weatherDef().decay; }

// 抽一個天氣(依權重;可指定排除目前的、開場不出災害)
function pickWeather(exclude, noDisaster) {
  const pool = [];
  for (const [k, w] of Object.entries(WEATHERS)) {
    if (k === exclude || (noDisaster && !w.fuse) || (noDisaster && (w.gust || w.shake))) continue;
    for (let i = 0; i < w.weight; i++) pool.push(k);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
function setWeather(id) {
  env.weather = id;
  env.t = 0;
  env.left = WEATHER_MIN + Math.random() * (WEATHER_MAX - WEATHER_MIN);
  env.fx = 1;
}
// 開場天氣(一般天氣之一)
function randomizeWeather() { setWeather(pickWeather(null, true)); }

// ===== 黴毒(中毒)=====
// 被「發霉貢丸」炸到 → 中黴毒,持續數秒、每秒扣 HP
const POISON_TIME = 4;        // 中毒持續秒數
const POISON_DPS = 1;         // 每秒扣 HP
