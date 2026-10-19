// 便當廚房關卡設定:食材目錄(造型與製程)、各關卡(便當款式、食材、時限、數量)。
// 第 1 關:經典臺鐵便當(與推車上販售的排骨/雞腿/素食相同)。
// 第 2~7 關:臺鐵 EMU3000「騰雲座艙限定便當」各餐旅分處的款式(臺北、七堵、臺中、高雄、花蓮、臺東),
//   內容依臺鐵官網菜單整理(季節時蔬、精選配菜等合併成一項);售價官網未列,遊戲中為設定值。

export const STATIONS_K = {
  assembly: '組裝台', rice: '炊飯機', braise: '滷鍋', wok: '炒鍋', fryer: '油炸機', griddle: '煎台',
  board: '砧板', storage: '倉庫', trash: '廚餘桶',
};

/**
 * 食材目錄。make:製程鏈 [工作站, 動作, 人工作秒數, 烹煮秒數(無則免), 完成後幾秒燒焦(無則不會)];
 * with:同一鍋一起做好的其他食材(該關有用到才補);part:經典款用 food.js 的元件(與推車成品相同)。
 * 造型:shape/color/color2/count/size(見 world/foodGen.js)。
 */
export const FOODS = {
  // ---- 飯
  rice:       { name: '白飯', shape: 'rice', color: '#f6f2e8', part: 'rice', make: [['rice', '洗米、下鍋煮飯', 2.5, 16]] },
  brownrice:  { name: '糙米紅藜飯', shape: 'rice', color: '#d6c0a0', color2: '#9c2f3a', make: [['rice', '煮糙米紅藜飯', 2.5, 18]] },
  purplerice: { name: '紫米飯', shape: 'rice', color: '#5e3550', color2: '#3a1f33', make: [['rice', '煮紫米飯', 2.5, 18]] },
  redquinoa:  { name: '紅藜飯', shape: 'rice', color: '#f1e8dc', color2: '#a8323e', make: [['rice', '煮紅藜飯', 2.5, 17]] },
  // ---- 經典款
  pork:     { name: '滷排骨', main: true, shape: 'cutlet', color: '#6e3416', part: 'pork', make: [['braise', '滷排骨', 2, 18, 25]] },
  chicken:  { name: '炸雞腿', main: true, shape: 'shrimp', color: '#b8762e', count: 2, part: 'chicken', make: [['fryer', '炸雞腿', 1.5, 14, 12]] },
  vegpatty: { name: '煎素排', main: true, shape: 'patty', color: '#c18a43', part: 'vegpatty', make: [['griddle', '煎素排', 1.5, 10, 10]] },
  egg:      { name: '滷蛋', shape: 'egg_whole', color: '#7e4b1f', part: 'egg', make: [['braise', '滷蛋', 2, 14, 25]], with: ['tofu', 'beancurd'] },
  tofu:     { name: '滷豆干', shape: 'cube', color: '#6e4220', count: 2, size: 0.02, part: 'tofu', make: [['braise', '滷豆干', 2, 14, 25]] },
  cabbage:  { name: '高麗菜', shape: 'leaf', color: '#a9cf72', color2: '#c6dd92', count: 6, part: 'cabbage', raw: 'head', make: [['board', '切高麗菜', 3], ['wok', '炒高麗菜', 1, 8, 10]] },
  pickle:   { name: '酸菜', shape: 'leaf', color: '#6d6b25', color2: '#5c5a1e', count: 7, part: 'pickle', make: [['board', '切酸菜', 2.5], ['wok', '炒酸菜', 1, 7, 10]] },
  radish:   { name: '黃蘿蔔', shape: 'halfdisc', color: '#f2c42a', count: 3, part: 'radish', raw: 'stick', make: [['board', '切黃蘿蔔', 2.5]] },
  corn:     { name: '玉米粒', shape: 'bead', color: '#f2cd38', count: 26, part: 'corn', make: [['wok', '炒玉米粒', 1, 6, 10]] },
  // ---- 騰雲座艙
  friedpork:   { name: '炸滷排骨', main: true, shape: 'cutlet', color: '#5a2a12', make: [['fryer', '炸排骨', 1.5, 10, 12], ['braise', '滷炸排骨', 1.5, 10, 25]] },
  beancurd:    { name: '滷豆包', shape: 'skin', color: '#8a5a2b', count: 2, make: [['braise', '滷豆包', 2, 12, 25]] },
  kamaboko:    { name: '工字軌魚板燒', shape: 'disc', color: '#f7f3ea', color2: '#e2557a', count: 3, make: [['griddle', '烤魚板', 1, 6, 10]] },
  greens:      { name: '季節時蔬', shape: 'leaf', color: '#3f7f2e', color2: '#5e9a3a', count: 6, raw: 'head', make: [['board', '切時蔬', 2.5], ['wok', '炒時蔬', 1, 7, 10]] },
  kingoyster:  { name: '三杯杏鮑菇玉米筍', main: true, shape: 'mushroom', color: '#a8743d', color2: '#e9d7b0', count: 5, make: [['board', '切杏鮑菇、玉米筍', 2], ['wok', '三杯炒', 1, 8, 10]] },
  kaofu:       { name: '醬煮烤麩', main: true, shape: 'cube', color: '#7a4a22', count: 4, size: 0.016, make: [['braise', '醬煮烤麩', 2, 12, 25]] },
  potato:      { name: '炸馬鈴薯丁', shape: 'cube', color: '#e0b049', count: 6, size: 0.011, raw: 'tuber', make: [['board', '切馬鈴薯丁', 2.5], ['fryer', '炸馬鈴薯丁', 1, 8, 12]] },
  shrimp:      { name: '金黃蝦排', main: true, shape: 'shrimp', color: '#d9922e', count: 2, make: [['fryer', '炸蝦排', 1.5, 10, 12]] },
  monkeyhead:  { name: '麻油猴頭菇', main: true, shape: 'mushroom', color: '#c9a46a', color2: '#e8d3a8', count: 5, size: 0.013, make: [['wok', '麻油炒猴頭菇', 1, 8, 10]] },
  yamroll:     { name: '酥脆山藥捲', main: true, shape: 'roll', color: '#d6a34a', count: 3, make: [['board', '捲山藥捲', 2.5], ['fryer', '炸山藥捲', 1, 9, 12]] },
  mackerel:    { name: '烤鯖魚', main: true, shape: 'fish', color: '#9a8a73', color2: '#4a3a2a', make: [['griddle', '烤鯖魚', 1.5, 12, 10]] },
  edamame:     { name: '毛豆仁', shape: 'bead', color: '#6fa83a', color2: '#8fc45a', count: 22, size: 0.0045, make: [['wok', '炒毛豆仁', 1, 6, 10]] },
  loinchop:    { name: '帶骨里肌排', main: true, shape: 'cutlet', color: '#a2632c', make: [['fryer', '炸里肌排', 1.5, 12, 12]] },
  mahi:        { name: '洛神醬燴鬼頭刀', main: true, shape: 'fish', color: '#e8c9a0', color2: '#b0203a', count: 2, make: [['griddle', '煎鬼頭刀魚條', 1.5, 8, 10], ['wok', '洛神醬燴', 1, 5, 10]] },
  fishball:    { name: '虱目魚丸', shape: 'ball', color: '#f2efe6', count: 3, make: [['braise', '煮虱目魚丸', 1.5, 8, 25]] },
  broccoli:    { name: '青花菜', shape: 'floret', color: '#3f7d2e', count: 3, raw: 'head', make: [['board', '切青花菜', 2], ['wok', '燙青花菜', 1, 5, 10]] },
  radishpickle:{ name: '蘿蔔漬', shape: 'halfdisc', color: '#f0d9a0', count: 3, raw: 'stick', make: [['board', '切蘿蔔漬', 2.5]] },
  mushroomsteak:{ name: '松露蕈菇排', main: true, shape: 'patty', color: '#7a5a3a', make: [['griddle', '煎蕈菇排', 1.5, 10, 10]] },
  shiitake:    { name: '滷香菇', shape: 'mushroom', color: '#4a2e1a', color2: '#c8a77a', count: 3, size: 0.013, make: [['braise', '滷香菇', 2, 12, 25]] },
  smelt:       { name: '黃金柳葉魚', main: true, shape: 'smelt', color: '#d9a040', color2: '#3a2a1a', count: 3, make: [['fryer', '炸柳葉魚', 1.5, 9, 12]] },
  hakkapickle: { name: '客家炒酸菜', shape: 'leaf', color: '#6d6b25', color2: '#5c5a1e', count: 7, make: [['board', '切酸菜', 2.5], ['wok', '客家炒酸菜', 1, 7, 10]] },
  daylily:     { name: '金針', shape: 'strand', color: '#e8862a', count: 10, make: [['wok', '炒金針', 1, 6, 10]] },
  goldbeancurd:{ name: '黃金豆包', main: true, shape: 'skin', color: '#d9a548', count: 2, make: [['griddle', '煎黃金豆包', 1.5, 8, 10]] },
  blackbean:   { name: '蜜黑豆', shape: 'bead', color: '#1d1416', color2: '#3a2a2a', count: 18, size: 0.005, make: [['braise', '蜜煮黑豆', 2, 12, 25]] },
  sixline:     { name: '酥香六線魚排', main: true, shape: 'fish', color: '#c98c3a', color2: '#a86a2a', make: [['fryer', '炸六線魚排', 1.5, 10, 12]] },
  sausage:     { name: '切片香腸', shape: 'disc', color: '#d8706a', color2: '#8a1f18', count: 4, size: 0.01, make: [['griddle', '煎香腸', 1.5, 8, 10], ['board', '切香腸片', 2]] },
  tamagoyaki:  { name: '和風玉子燒', shape: 'block', color: '#f2c94c', color2: '#e5b53a', count: 2, make: [['griddle', '煎玉子燒', 2, 8, 10]] },
  roselle:     { name: '洛神蜜餞', shape: 'piece', color: '#8a1e2e', count: 4, make: [['storage', '從冷藏櫃取洛神蜜餞', 1.5]] },
  pumpkin:     { name: '烤南瓜', shape: 'wedge', color: '#e8892a', count: 3, raw: 'head', make: [['board', '切南瓜', 2.5], ['griddle', '烤南瓜', 1, 8, 10]] },
};

/** 關卡:foods 為該關會用到的食材(依保溫檯順序,飯類放保溫飯鍋;最多 10 種);bentos 為兩~三款便當 */
export const KITCHEN_LEVELS = [
  {
    id: 'k1', title: '經典臺鐵便當', branch: '臺鐵便當本舖', difficulty: 2, quota: 10, timeLimit: 420,
    brief: '先從推車上賣的三款做起:排骨、雞腿、素食。',
    foods: ['rice', 'pork', 'chicken', 'vegpatty', 'egg', 'tofu', 'cabbage', 'pickle', 'radish', 'corn'],
    bentos: {
      pork: { classic: 'pork', name: '排骨便當', mix: 0.45 },
      chicken: { classic: 'chicken', name: '雞腿便當', mix: 0.35 },
      veg: { classic: 'veg', name: '素食便當', mix: 0.2 },
    },
  },
  {
    id: 'k2', title: '騰雲座艙・臺北', branch: '臺北餐旅分處', difficulty: 3, quota: 10, timeLimit: 450,
    brief: '騰雲饗宴便當的排骨要「先炸後滷」;騰雲彩蔬便當是全素,紫米飯不能裝錯成糙米飯。',
    foods: ['brownrice', 'purplerice', 'friedpork', 'egg', 'beancurd', 'kamaboko', 'greens', 'kingoyster', 'kaofu', 'potato'],
    bentos: {
      feast: { name: '騰雲饗宴便當', label: '騰雲饗宴', price: 150, color: '#7a2e4a', mix: 0.6,
        parts: ['brownrice', 'friedpork', 'egg', 'beancurd', 'kamaboko', 'greens'] },
      veggie: { name: '騰雲彩蔬便當', label: '騰雲彩蔬', price: 150, color: '#3f7d3a', vegan: true, mix: 0.4,
        parts: ['purplerice', 'kingoyster', 'kaofu', 'potato', 'greens'] },
    },
  },
  {
    id: 'k3', title: '騰雲座艙・七堵', branch: '七堵餐旅分處', difficulty: 3, quota: 10, timeLimit: 450,
    brief: '海陸便當有滷排骨也有金黃蝦排;素食便當的山藥捲要先捲好再下鍋炸。',
    foods: ['rice', 'pork', 'shrimp', 'egg', 'beancurd', 'greens', 'monkeyhead', 'yamroll'],
    bentos: {
      surfturf: { name: '騰雲海陸便當', label: '騰雲海陸', price: 150, color: '#1f5c8a', mix: 0.6,
        parts: ['rice', 'pork', 'shrimp', 'egg', 'beancurd', 'greens'] },
      veggie: { name: '騰雲素食便當', label: '騰雲素食', price: 150, color: '#3f7d3a', vegan: true, mix: 0.4,
        parts: ['rice', 'monkeyhead', 'yamroll', 'beancurd', 'greens'] },
    },
  },
  {
    id: 'k4', title: '騰雲座艙・臺中', branch: '臺中餐旅分處', difficulty: 3, quota: 12, timeLimit: 450,
    brief: '海陸雙饗便當:滷排骨配烤鯖魚;蔬食知味便當以滷豆包為主菜。',
    foods: ['rice', 'pork', 'mackerel', 'egg', 'beancurd', 'edamame', 'greens'],
    bentos: {
      surfturf: { name: '海陸雙饗便當', label: '海陸雙饗', price: 150, color: '#1f5c8a', mix: 0.6,
        parts: ['rice', 'pork', 'mackerel', 'egg', 'greens'] },
      veggie: { name: '蔬食知味便當', label: '蔬食知味', price: 130, color: '#3f7d3a', vegan: true, mix: 0.4,
        parts: ['rice', 'beancurd', 'edamame', 'greens'] },
    },
  },
  {
    id: 'k5', title: '騰雲座艙・高雄', branch: '高雄餐旅分處', difficulty: 4, quota: 10, timeLimit: 480,
    brief: '乘寄藜饗便當料最多:里肌排、洛神醬燴鬼頭刀、虱目魚丸……一樣都不能少。',
    foods: ['redquinoa', 'loinchop', 'mahi', 'fishball', 'egg', 'cabbage', 'broccoli', 'radishpickle', 'mushroomsteak', 'shiitake'],
    bentos: {
      feast: { name: '乘寄藜饗便當', label: '乘寄藜饗', price: 160, color: '#9a3a1a', mix: 0.6,
        parts: ['redquinoa', 'loinchop', 'mahi', 'fishball', 'egg', 'cabbage', 'broccoli', 'radishpickle'] },
      veggie: { name: '乘寄藜饗素便當', label: '藜饗素', price: 150, color: '#3f7d3a', vegan: true, mix: 0.4,
        parts: ['redquinoa', 'mushroomsteak', 'shiitake', 'cabbage', 'broccoli', 'radishpickle'] },
    },
  },
  {
    id: 'k6', title: '騰雲座艙・花蓮', branch: '花蓮餐旅分處', difficulty: 4, quota: 12, timeLimit: 480,
    brief: '海陸雙拼配白飯,洄瀾素食配紅藜飯——兩種飯不要盛錯。',
    foods: ['rice', 'redquinoa', 'pork', 'smelt', 'egg', 'hakkapickle', 'daylily', 'goldbeancurd', 'corn', 'blackbean'],
    bentos: {
      surfturf: { name: '海陸雙拼便當', label: '海陸雙拼', price: 150, color: '#1f5c8a', mix: 0.55,
        parts: ['rice', 'pork', 'smelt', 'egg', 'hakkapickle', 'daylily'] },
      veggie: { name: '洄瀾素食便當', label: '洄瀾素食', price: 140, color: '#3f7d3a', vegan: true, mix: 0.45,
        parts: ['redquinoa', 'goldbeancurd', 'daylily', 'corn', 'blackbean'] },
    },
  },
  {
    id: 'k7', title: '騰雲座艙・臺東', branch: '臺東餐旅分處', difficulty: 4, quota: 12, timeLimit: 500,
    brief: '「慢。覓台東」餐盒菜色最豐富:六線魚排、香腸要先煎再切片、玉子燒;「原生。舒食」配紅藜飯與烤南瓜。',
    foods: ['rice', 'redquinoa', 'pork', 'sixline', 'sausage', 'tamagoyaki', 'cabbage', 'roselle', 'beancurd', 'pumpkin'],
    bentos: {
      slow: { name: '慢。覓台東餐盒', label: '慢覓台東', price: 160, color: '#2a6a7a', mix: 0.55,
        parts: ['rice', 'pork', 'sixline', 'sausage', 'tamagoyaki', 'cabbage', 'roselle'] },
      veggie: { name: '原生。舒食便當', label: '原生舒食', price: 150, color: '#3f7d3a', vegan: true, mix: 0.45,
        parts: ['redquinoa', 'beancurd', 'pumpkin', 'cabbage', 'roselle'] },
    },
  },
];

const PRICE = { pork: 80, chicken: 100, veg: 80 };
const KEYS = ['Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus'];
const KEY_LABEL = { Digit0: '0', Minus: '-' };
const CLASSIC_PARTS = { pork: ['rice', 'pork', 'egg', 'tofu', 'cabbage', 'pickle', 'radish'], chicken: ['rice', 'chicken', 'egg', 'cabbage', 'pickle', 'radish'], veg: ['rice', 'vegpatty', 'tofu', 'corn', 'cabbage', 'radish'] };

/**
 * 依關卡產生執行用資料:
 *   foods(含組裝按鍵、上限、起始庫存)、ingredients(組裝面板順序:盒 → 食材 → 蓋)、
 *   bentos(含貼紙)、recipes(各工作站可做的事)、carries(拿在手上的東西與送達後的補料)、hints(缺料時怎麼補)
 */
export function buildLevel(id) {
  const L = KITCHEN_LEVELS.find((x) => x.id === id) || KITCHEN_LEVELS[0];
  const foods = {}, recipes = {}, carries = {}, hints = {};
  const ingredients = { box: { name: '便當盒', short: '盒', key: 'Digit1', label: '1', cap: 20, start: 8 } };
  L.foods.forEach((k, i) => {
    const f = FOODS[k], rice = f.shape === 'rice';
    const cap = rice ? 16 : f.main ? 8 : 12;
    foods[k] = { ...f, key: k, cap, start: rice ? 6 : f.main ? 3 : 5 };
    ingredients[k] = { name: f.name, short: f.name.length > 4 ? f.name.slice(-3) : f.name, key: KEYS[i], label: KEY_LABEL[KEYS[i]] || KEYS[i].slice(5), cap, start: foods[k].start, food: true };
  });
  ingredients.lid = { name: '蓋子', short: '蓋', key: 'Equal', label: '=', cap: 20, start: 8 };
  // 製程 → 工作站選項與手上的東西
  const covered = new Set();
  for (const k of L.foods) {
    if (covered.has(k)) continue;
    const f = FOODS[k];
    const extra = (f.with || []).filter((x) => L.foods.includes(x) && !covered.has(x));
    extra.forEach((x) => covered.add(x));
    const names = [f.name, ...extra.map((x) => FOODS[x].name)].join('與');
    f.make.forEach(([station, label, work, cook, burn], i) => {
      const last = i === f.make.length - 1;
      const rid = `${k}_${i}`;
      const gives = last ? k : `${k}_${i}`;
      recipes[rid] = { station, label: last && extra.length ? `${label}與${extra.map((x) => FOODS[x].name).join('、')}` : label, work, cook: cook || 0, burn: burn ?? null, needs: i ? `${k}_${i - 1}` : null, gives, food: k };
      if (last) {
        const batch = f.shape === 'rice' ? 16 : f.main ? 8 : 12;
        carries[k] = { name: f.shape === 'rice' ? `一鍋${f.name}` : `一盤${names}`, yields: Object.fromEntries([k, ...extra].map((x) => [x, batch])), food: k };
      } else {
        const [ns, nl] = f.make[i + 1];
        carries[gives] = { name: `${label}好的${f.name}(拿去${STATIONS_K[ns]}${nl})`, food: k, stage: i };
      }
    });
    const first = f.make[0];
    const steps = f.make.map(([s, l]) => `${STATIONS_K[s]}${l}`).join(',再到');
    for (const x of [k, ...extra]) hints[x] = `去${steps}`;
  }
  recipes.fetchBox = { station: 'storage', label: '搬一箱便當盒', work: 2.5, cook: 0, gives: 'crate_box' };
  recipes.fetchLid = { station: 'storage', label: '搬一箱蓋子', work: 2.5, cook: 0, gives: 'crate_lid' };
  carries.crate_box = { name: '一箱便當盒', yields: { box: 20 } };
  carries.crate_lid = { name: '一箱蓋子', yields: { lid: 20 } };
  carries.burnt = { name: '燒焦的一鍋(倒進廚餘桶)' };
  hints.box = '去倉庫搬便當盒';
  hints.lid = '去倉庫搬蓋子';
  const bentos = {};
  for (const [bid, b] of Object.entries(L.bentos)) {
    const price = b.price || PRICE[bid];
    const parts = b.parts || CLASSIC_PARTS[b.classic];
    bentos[bid] = { ...b, id: bid, price, parts, sticker: b.classic || { id: bid, name: b.name, label: b.label, price, color: b.color } };
  }
  return { ...L, foods, ingredients, recipes, carries, hints, bentos };
}

/** 缺料時主任的台詞(所有關卡的食材) */
export function outLines() {
  const out = { box: '便當盒沒了,快去倉庫搬!', lid: '蓋子沒了,快去倉庫搬!' };
  for (const [k, f] of Object.entries(FOODS)) {
    const [s, l] = f.make[0];
    out[k] = `${f.name}沒了,快去${STATIONS_K[s]}${l}!`;
  }
  return out;
}
