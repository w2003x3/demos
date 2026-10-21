import { DRIVER_LEVELS } from './driver.js';
import { DISPATCH_LEVELS } from './dispatch.js';
import { COO_LEVELS } from './coo.js';
import { TICKET_LEVELS } from './ticket.js';
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
    title: '大站轉乘補貨',
    subtitle: '宜蘭 → 臺北(轉乘)→ 新竹',
    difficulty: 4,
    brief: '先在北上列車販售;到臺北站下車後,穿過 B1 穿堂到便當交接點領補貨,再限時趕到另一個月台,搭上往新竹的列車繼續販售。',
    phases: [
      {
        type: 'onboard', trainType: 'EMU3000', trainNo: '自強 223',
        route: ['yilan', 'ruifang', 'nangang', 'songshan', 'taipei'],
        legTimes: [95, 75, 45, 48], dwell: 12, serviceCars: [5, 6], tripsRequired: 1, preorders: 1,
        stock: { pork: 5, chicken: 4, veg: 2, tea: 5, coffee: 4, water: 4 },
        occupancy: 0.66, buyers: { interval: [2.6, 5], max: 4, patience: [42, 66] },
        incidents: { initial: 1, perStop: [0, 1] }, scenery: { theme: 'town', time: 'noon' },
      },
      {
        type: 'station', station: 'taipei',
        arriveTrack: '3A',
        pickup: { track: '1B', trainNo: '區間 1234', items: { pork: 10, chicken: 8 } },
        departTrack: '2A',
        timeLimit: 180,
      },
      {
        type: 'onboard', trainType: 'EMU3000', trainNo: '自強 151',
        route: ['taipei', 'hsinchu'],
        legTimes: [170], dwell: 12, serviceCars: [3, 4, 5], tripsRequired: 2, preorders: 2,
        stock: { pork: 10, chicken: 8, veg: 3, tea: 7, coffee: 5, water: 6 },
        occupancy: 0.74, buyers: { interval: [2.2, 4.4], max: 6, patience: [38, 60] },
        incidents: { initial: 2, perStop: [1, 1] }, scenery: { theme: 'town', time: 'sunset' },
      },
    ],
  },
];

// 升遷後的工作(預留):司機員駕駛列車
/** 司機員:各路段一關(src/config/driver.js) */
export const DRIVER_MISSIONS = DRIVER_LEVELS.map((L) => ({
  id: L.id, title: `司機員・${L.title}`, subtitle: `${L.line} · ${{ day: '白天', dusk: '黃昏', night: '夜間', overcast: '陰天' }[L.time]} · 停車 ±${L.tol} m${L.atp ? '' : ' · ATP 切除'}`,
  difficulty: L.difficulty, brief: L.brief, role: 'driver',
  phases: [{ type: 'driver', level: L.id }],
}));

// 被調職後的工作(預留):鈦鐵便當廚房
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
    brief: '鈦鐵、高鐵、捷運共構。1F 大廳四面各三個門、黑白棋盤格石材地板與挑高天井;B1 五條南北向通道、南北迴廊連接 K/Y/Z 區地下街與機場捷運,路線錯綜複雜。',
    features: ['棋盤格大廳', '挑高天井天窗', 'LED 時刻看板', '報時火車', 'B1 五條通道', '付費區閘門', '地下街店面'] },
  { id: 's-kaohsiung', station: 'kaohsiung', title: '高雄車站', difficulty: 3, subtitle: '綠之丘天棚 · 雲朵天花 · 帝冠式舊站',
    brief: '鐵路地下化後的新站。地面是 Mecanoo 設計的「綠之丘」天棚:造型各異的花柱撐起起伏的圓頂,下方雲朵鋁板與圓形天窗;中軸線保留 1941 年帝冠式舊站;下沉廣場通往圓拱天花、燈籠照明的地下大廳。',
    features: ['綠之丘天棚', '花柱', '雲朵鋁板天花', '圓形天窗', '帝冠式舊站', '下沉廣場', '圓拱地下大廳'] },
  { id: 's-taichung', station: 'taichung', title: '臺中車站', difficulty: 2, subtitle: '2F 大廳與平台 · 蝴蝶展翅屋頂 · 紅磚舊站',
    brief: '高架化新站:2F 大廳與穿堂,兩側半開放平台頭頂就是 37 m 高的蝴蝶展翅大屋頂與鋼構桁架,視野遼闊;3F 月台、1F 公車轉運。西南側是 1917 年的紅磚舊站。',
    features: ['2F 遼闊平台', '蝴蝶展翅屋頂', '鋼構樹狀柱', '太陽能板', '3F 月台與列車', '紅磚鐘塔舊站'] },
  { id: 's-tainan', station: 'tainan', title: '臺南車站', difficulty: 3, subtitle: '鐵路地下化新站 · 1936 古蹟站房 · 鳳凰木大頂棚',
    brief: '2026 年 10 月啟用的地下新站:地面保留 1936 年古蹟站房(修復中)與舊月台棚架、轉車台遺構;東西貫穿的下沉廣場通往 B1 大廳,2 號出入口是以鳳凰木為意象、挑高 14 m 的大頂棚;B2 為 2 島式 4 股道月台,指標中英日韓四語。',
    features: ['1936 古蹟站房', '下沉廣場', '鳳凰木大頂棚', 'B1 大廳與商店街', 'B2 島式月台', '轉車台遺構', '黃花崗石 3 號出口'] },
  { id: 's-keelung', station: 'keelung', title: '基隆車站', difficulty: 2, subtitle: '縱貫線起點 · 半地下頭端站 · 面向基隆港',
    brief: '2015 年啟用的第五代車站,背山面海:北站玻璃帷幕以「雞籠」斜交格子為意象,面向港西街與基隆港;月台在半地下,上方是城際轉運站;南站跨在軌道上。第一月台末端保留鐵鑄雕花棚架與縱貫線起點,山上有 KEELUNG 地標字。',
    features: ['北站雞籠格子帷幕', '天井公共藝術燦流', '頭端式月台', '縱貫線起點', '鐵鑄雕花棚架', '基隆港與郵輪', 'KEELUNG 地標'] },
  { id: 's-yilan', station: 'yilan', title: '宜蘭車站', difficulty: 1, subtitle: '幾米主題 · 屋頂上的長頸鹿 · 丟丟噹森林星空列車',
    brief: '站房外牆彩繪幾米繪本的森林星空,屋頂站著一隻閉眼微笑、伸長脖子的巨大長頸鹿;站前對面是 9 株鋼構巨樹的丟丟噹森林,樹間懸吊星空列車;站南的幾米廣場有《向左走向右走》與散落的行李箱。月台以地下道連通後站。',
    features: ['長頸鹿車站', '幾米彩繪外牆', '丟丟噹森林', '星空列車', '向左走向右走', '地下道', '舊宿舍群'] },
].map((s) => ({ ...s, phases: [{ type: 'stationExplore', station: s.station, title: s.title, desc: s.brief, features: s.features }] }));

// 車站追逐:站長(抓)/ 不良乘客(躲 + 塗鴉),每座車站各一關;另一方由 AI 扮演
export const CHASE_MISSIONS = STATION_MISSIONS.flatMap((s) => ['stationmaster', 'troublemaker'].map((role) => {
  const sm = role === 'stationmaster', time = sm ? 180 : 150, tags = 4 + s.difficulty;
  return {
    id: `c-${role}-${s.station}`, station: s.station, role, difficulty: s.difficulty,
    title: `${sm ? '站長' : '不良乘客'}・${s.title}`,
    subtitle: sm ? `${time / 60} 分鐘內逮捕不良乘客` : `塗鴉 ${tags} 處 + 撐過 ${Math.floor(time / 60)} 分半`,
    brief: sm
      ? `有不良乘客在${s.title}搗亂!他會丟香蕉皮、煙霧彈、用橡皮筋射人,還會跳過閘門逃跑。用電擊棒、BB 槍、閃光彈讓他停下來,再用刺股把他叉住逮捕。`
      : `在${s.title}到處塗鴉 ${tags} 處,而且不能被站長抓到!站長有刺股、電擊棒、BB 槍和閃光彈。跳過閘門與障礙物,用香蕉皮、煙霧彈甩掉他。`,
    phases: [{ type: role, role, station: s.station, title: s.title, time, tags }],
  };
}));

/** 各職位的任務清單(選單依目前職位開放) */
/** 行控人員:行車控制中心的調度班次(src/config/dispatch.js) */
export const DISPATCH_MISSIONS = DISPATCH_LEVELS.map((L) => ({
  id: L.id, title: `行控中心・${L.title}`, subtitle: `西部幹線 臺北—新竹 · ${L.trains.length} 車次 · ${L.incidents.length ? `${L.incidents.length} 起事故` : '無事故'}`,
  difficulty: L.difficulty, brief: L.brief, role: 'dispatcher',
  phases: [{ type: 'dispatch', level: L.id }],
}));

/** 營運長:年度經營計畫(src/config/coo.js) */
export const COO_MISSIONS = COO_LEVELS.map((L) => ({
  id: L.id, title: `營運長・${L.title}`, subtitle: `建設預算 ${L.budget} 億 · ${(L.hotspots || []).length} 個需求熱點`,
  difficulty: L.difficulty, brief: L.brief, role: 'coo',
  phases: [{ type: 'operations', level: L.id }],
}));

/** 站務員:售票窗口(src/config/ticket.js) */
export const TICKET_MISSIONS = TICKET_LEVELS.map((L) => ({
  id: L.id, title: `站務員・${L.title}`, subtitle: `臺北車站售票窗口 · ${L.customers} 位旅客 · ${Math.round(L.time / 60)} 分鐘`,
  difficulty: L.difficulty, brief: L.brief, role: 'ticket',
  phases: [{ type: 'ticketing', level: L.id }],
}));

export const ROLE_MISSIONS = { driver: DRIVER_MISSIONS, ticket: TICKET_MISSIONS, dispatcher: DISPATCH_MISSIONS, coo: COO_MISSIONS };
