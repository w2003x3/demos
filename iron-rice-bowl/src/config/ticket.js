// 站務員(售票窗口)關卡:臺北車站鈦鐵售票窗口。旅客說出需求 → 在售票終端選目的地、車次、票種、座位 → 收錢找零。
//   customers:本班要服務的旅客數;time:班次長度(秒);patience:旅客排隊耐心(秒);maxComplaints:客訴上限
//   rush:同時排隊人數(搶票人潮);pref:旅客提出座位偏好 / 車種 / 時間條件的機率
export const TICKET_DESTS = ['板橋', '桃園', '中壢', '新竹', '苗栗', '臺中', '彰化', '嘉義', '臺南', '高雄', '宜蘭', '花蓮'];
export const EAST = ['宜蘭', '花蓮'];
export const FARE_RATE = { exp: 2.27, cht: 1.75, loc: 1.46 };   // 元 / 公里(自強 / 莒光 / 區間)
export const TYPE_NAME = { exp: '自強', cht: '莒光', loc: '區間' };

export const TICKET_LEVELS = [
  { id: 't1', title: '平日早班', difficulty: 1, customers: 8, time: 420, patience: 120, rush: 4, pref: 0.3, maxComplaints: 3, startClock: '07:30',
    brief: '平日早上,旅客不多。照著旅客的需求出票:目的地、車次、張數與票種,最後別找錯錢。' },
  { id: 't2', title: '週五返鄉潮', difficulty: 2, customers: 12, time: 480, patience: 95, rush: 7, pref: 0.55, maxComplaints: 3, startClock: '17:30',
    brief: '週五傍晚返鄉人潮,很多人指定靠窗、要坐在一起或要搭自強號。座位要看清楚,不要劃到已售出的位子。' },
  { id: 't3', title: '春節搶票', difficulty: 4, customers: 16, time: 540, patience: 75, rush: 12, pref: 0.7, maxComplaints: 3, startClock: '06:00',
    brief: '春節疏運開賣,窗口外大排長龍、車位所剩無幾,而且其他窗口也在同時劃位——座位隨時會被搶走!' },
  { id: 't4', title: '東部觀光季', difficulty: 3, customers: 12, time: 480, patience: 90, rush: 8, pref: 0.6, maxComplaints: 3, startClock: '08:30', east: 0.6,
    brief: '暑假往宜蘭、花蓮的觀光客多,常是一家大小(全票、半票、敬老票混著買),要算清楚票價。' },
];
