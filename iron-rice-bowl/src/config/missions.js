import { KITCHEN_LEVELS } from './kitchen.js';
// 任務 = 依序執行的階段(phases)。目前實作 'onboard'(車上販售);
// 'station'(大站下車 → 換月台 → 等指定列車領便當 → 上另一班車)已預留介面,見 src/game/stationPhase.js。

export const MISSIONS = [
  {
    id: 'm1',
    title: '北迴初體驗',
    subtitle: '臺北 → 宜蘭',
    difficulty: 1,
    brief: '第一天上工!負責第 5、6 車的便當推車服務。列車抵達宜蘭前,要完成 2 趟巡迴販售。',
    phases: [{
      type: 'onboard',
      trainType: 'EMU3000',
      trainNo: '自強 272',
      route: ['taipei', 'songshan', 'nangang', 'ruifang', 'yilan'],
      legTimes: [48, 45, 75, 95],  // 各區間行駛秒數(遊戲時間)
      dwell: 12,                    // 中途站停靠秒數
      serviceCars: [5, 6],
      tripsRequired: 2,
      preorders: 2,                 // 預訂便當張數(要送到指定車廂座位)
      stock: { pork: 6, chicken: 5, veg: 3, tea: 6, coffee: 5, water: 5 },
      occupancy: 0.62,
      buyers: { interval: [3, 6], max: 4, patience: [45, 70] },
      incidents: { initial: 2, perStop: [1, 1] },
      scenery: { theme: 'town', time: 'morning' },
    }],
  },
  {
    id: 'm2',
    title: '蘭陽到洄瀾',
    subtitle: '宜蘭 → 花蓮',
    difficulty: 2,
    brief: '沿著太平洋海岸南下。負責第 3~5 車,乘客較多、狀況也多,抵達花蓮前完成 2 趟。',
    phases: [{
      type: 'onboard',
      trainType: 'EMU3000',
      trainNo: '自強 408',
      route: ['yilan', 'luodong', 'suaoxin', 'hualien'],
      legTimes: [55, 70, 170],
      dwell: 12,
      serviceCars: [3, 4, 5],
      tripsRequired: 2,
      preorders: 3,
      stock: { pork: 7, chicken: 6, veg: 4, tea: 7, coffee: 6, water: 6 },
      occupancy: 0.72,
      buyers: { interval: [2.5, 5], max: 5, patience: [40, 65] },
      incidents: { initial: 3, perStop: [1, 2] },
      scenery: { theme: 'coast', time: 'noon' },
    }],
  },
  {
    id: 'm3',
    title: '花東縱谷夕陽線',
    subtitle: '花蓮 → 臺東',
    difficulty: 3,
    brief: '夕陽下的縱谷,池上便當的故鄉。負責第 7~9 車,抵達臺東前必須完成 3 趟!',
    phases: [{
      type: 'onboard',
      trainType: 'EMU3000',
      trainNo: '自強 422',
      route: ['hualien', 'yuli', 'chishang', 'guanshan', 'taitung'],
      legTimes: [150, 55, 45, 85],
      dwell: 12,
      serviceCars: [7, 8, 9],
      tripsRequired: 3,
      preorders: 4,
      stock: { pork: 8, chicken: 7, veg: 4, tea: 8, coffee: 6, water: 7 },
      occupancy: 0.7,
      buyers: { interval: [2.2, 4.5], max: 6, patience: [38, 60] },
      incidents: { initial: 3, perStop: [1, 2] },
      scenery: { theme: 'valley', time: 'sunset' },
    }],
  },
  {
    id: 'x1',
    locked: true,
    title: '大站轉乘補貨',
    subtitle: '開發中',
    difficulty: 4,
    brief: '在臺北站下車,穿過穿堂到指定月台,等候指定列車送來便當,再登上另一班列車繼續販售。',
    phases: [
      { type: 'onboard', trainType: 'EMU3000', route: ['yilan', 'taipei'] /* … */ },
      {
        type: 'station', station: 'taipei',
        arriveTrack: '3A',
        pickup: { track: '1B', trainNo: '區間 1234', items: { pork: 10, chicken: 8 } },
        departTrack: '2A',
        timeLimit: 180,
      },
      { type: 'onboard', trainType: 'EMU3000', route: ['taipei', 'hsinchu'] /* … */ },
    ],
  },
];

// 升遷後的工作(預留):司機員駕駛列車
export const DRIVER_MISSION = {
  id: 'd1',
  locked: true,
  title: '司機員見習',
  subtitle: '升遷後 · 開發中',
  difficulty: 3,
  brief: '升任司機員!坐進 EMU3000 駕駛室,看著前方路線控制速度,準點並準確停靠每一站。',
  phases: [{ type: 'driver', trainType: 'EMU3000' }],
};

// 被調職後的工作(預留):台鐵便當廚房
/** 便當廚房:每個關卡一個任務(經典款 + 騰雲座艙各餐旅分處) */
export const KITCHEN_MISSIONS = KITCHEN_LEVELS.map((L) => ({
  id: L.id,
  title: `便當廚房・${L.title}`,
  subtitle: `${L.branch} · ${Object.values(L.bentos).map((b) => b.name).join('/')}`,
  difficulty: L.difficulty,
  brief: `${L.brief}依製作單組裝(盒 → 飯 → 主菜與配菜 → 蓋子),成品要和樣品一模一樣,再放到對應的成品架。缺料自己補,裝錯要賠錢記點。`,
  phases: [{ type: 'kitchen', level: L.id, timeLimit: L.timeLimit, quota: L.quota }],
}));
export const KITCHEN_MISSION = KITCHEN_MISSIONS[0];

/** 車站場景(站長、不良乘客共用):巡覽模式 */
export const STATION_MISSIONS = [
  { id: 's-taipei', station: 'taipei', title: '臺北車站', difficulty: 3, subtitle: '1F 黑白棋盤格大廳 · B1 迷宮般的地下街',
    brief: '台鐵、高鐵、捷運共構。1F 大廳四面各三個門、黑白棋盤格石材地板與挑高天井;B1 五條南北向通道、南北迴廊連接 K/Y/Z 區地下街與機場捷運,路線錯綜複雜。',
    features: ['棋盤格大廳', '挑高天井天窗', 'LED 時刻看板', '報時火車', 'B1 五條通道', '付費區閘門', '地下街店面'] },
  { id: 's-kaohsiung', station: 'kaohsiung', title: '高雄車站', difficulty: 3, subtitle: '綠之丘天棚 · 雲朵天花 · 帝冠式舊站',
    brief: '鐵路地下化後的新站。地面是 Mecanoo 設計的「綠之丘」天棚:造型各異的花柱撐起起伏的圓頂,下方雲朵鋁板與圓形天窗;中軸線保留 1941 年帝冠式舊站;下沉廣場通往圓拱天花、燈籠照明的地下大廳。',
    features: ['綠之丘天棚', '花柱', '雲朵鋁板天花', '圓形天窗', '帝冠式舊站', '下沉廣場', '圓拱地下大廳'] },
  { id: 's-taichung', station: 'taichung', title: '臺中車站', difficulty: 2, subtitle: '2F 大廳與平台 · 蝴蝶展翅屋頂 · 紅磚舊站',
    brief: '高架化新站:2F 大廳與穿堂,兩側半開放平台頭頂就是 37 m 高的蝴蝶展翅大屋頂與鋼構桁架,視野遼闊;3F 月台、1F 公車轉運。西南側是 1917 年的紅磚舊站。',
    features: ['2F 遼闊平台', '蝴蝶展翅屋頂', '鋼構樹狀柱', '太陽能板', '3F 月台與列車', '紅磚鐘塔舊站'] },
].map((s) => ({ ...s, phases: [{ type: 'stationExplore', station: s.station, title: s.title, desc: s.brief, features: s.features }] }));
