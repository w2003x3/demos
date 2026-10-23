// 台北101 尺寸與遊戲常數(單位:公尺)。外型依實際比例簡化:
// 1~26F 為內收的基座、27~90F 為 8 節「竹節」(每節 8 層,上寬下窄)、91~101F 塔頂、再上去是塔尖到 508m。

export const FH = 4.3; // 樓層高
export const floorY = (n) => (n - 1) * FH; // n 樓地板高度

export const BASE_TOP = floorY(27); // 111.8
export const SEG_H = 8 * FH; // 34.4
export const SEG_COUNT = 8;
export const TOP_Y = floorY(91); // 387
export const ROOF_Y = floorY(101) + FH; // 434.3
export const CROWN_Y = 448;
export const SPIRE_TOP = 508;

// 各段半寬(正方形斷面中心到面的距離)
export const BASE_HW0 = 31; // 地面
export const BASE_HW1 = 24; // 26F 頂
export const SEG_HW0 = 22.5; // 每節底
export const SEG_HW1 = 27; // 每節頂(外擴)
export const TOP_HW0 = 15; // 91F
export const TOP_HW1 = 13.6; // 101F 頂(91F 以上幾乎直立)
export const CROWN_HW = 8.6;

/** 外牆分段;攀爬模式用同一份資料計算牆面位置。 */
export function towerSections() {
  const s = [{ name: '基座', y0: 0, y1: BASE_TOP, hw0: BASE_HW0, hw1: BASE_HW1, floors: [1, 26] }];
  for (let k = 0; k < SEG_COUNT; k++) {
    const y0 = BASE_TOP + k * SEG_H;
    s.push({ name: `第 ${k + 1} 節`, seg: k + 1, y0, y1: y0 + SEG_H, hw0: SEG_HW0, hw1: SEG_HW1, floors: [27 + k * 8, 34 + k * 8] });
  }
  s.push({ name: '塔頂', y0: TOP_Y, y1: ROOF_Y, hw0: TOP_HW0, hw1: TOP_HW1, floors: [91, 101] });
  s.push({ name: '頂冠', y0: ROOF_Y, y1: CROWN_Y, hw0: 10.6, hw1: CROWN_HW, floors: [101, 101] });
  return s;
}

/** 高度 y 處外牆的半寬(段落交界取上一段)。 */
export function halfWidthAt(y) {
  for (const s of towerSections()) {
    if (y <= s.y1) return s.hw0 + (s.hw1 - s.hw0) * Math.max(0, (y - s.y0) / (s.y1 - s.y0));
  }
  return 2.2;
}

export const floorAtY = (y) => Math.max(1, Math.min(101, Math.floor(y / FH + 1e-6) + 1));

// 可參觀樓層
export const DESTS = [
  { floor: 5, name: '5F 售票入口', short: '售票入口' },
  { floor: 35, name: '35F 四八八克咖啡', short: '四八八克' },
  { floor: 88, name: '88F 心缽咖啡 · 阻尼器', short: '心缽咖啡' },
  { floor: 89, name: '89F 室內觀景台', short: '觀景台' }
];

// 電梯:5F → 89F 約 37 秒,最高分速 1010 m
export const ELEV_VMAX = 1010 / 60;
export const ELEV_ACC = 1.08;

// 樓梯賽
export const STEPS_PER_FLOOR = 22; // 兩跑各 11 階
export const RACE_STEPS_TOTAL = 2046; // 1F → 91F 官方階數(顯示用)
export const RACES = [
  { id: 'full', name: '登高全程', from: 1, to: 91, desc: '1F → 91F · 2046 階' },
  { id: 'sprint', name: '四八八克衝刺', from: 1, to: 35, desc: '1F → 35F · 短程' }
];
export const WATER_FLOORS = [20, 35, 50, 65, 80];
