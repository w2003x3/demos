// 營運長關卡:一個「年度」= 4 季,每季做經營決策(新車站 / 新路線、班次、票價、便當菜色)後結算。
// hotspots:未被車站服務的需求熱點(新車站離熱點越近,吸引的旅客越多);goals:年度目標。
export const COO_LEVELS = [
  {
    id: 'c1', title: '便當營收改革', difficulty: 1, budget: 6,
    brief: '今年的重點是車上便當:調整菜單與售價,讓便當營收與旅客滿意度一起提升。路網暫時不動也沒關係。',
    hotspots: [],
    goals: { profitable: 3, happy: 2 },
  },
  {
    id: 'c2', title: '北部通勤擴張', difficulty: 2, budget: 30,
    brief: '雙北與桃園的通勤需求暴增:在需求熱點附近增設車站,必要時開闢新路線,並調整班次紓解擁擠。',
    hotspots: [
      { name: '林口新市鎮', lat: 25.075, lng: 121.37, demand: 26000, r: 4 },
      { name: '南港軟體園區', lat: 25.058, lng: 121.617, demand: 14000, r: 2.5 },
      { name: '新莊副都心', lat: 25.061, lng: 121.447, demand: 18000, r: 3 },
      { name: '桃園航空城', lat: 25.035, lng: 121.24, demand: 20000, r: 4 },
    ],
    goals: { profitable: 2, newLines: 2, happy: 1 },
  },
  {
    id: 'c3', title: '東部觀光年', difficulty: 3, budget: 24,
    brief: '交通部推動東部觀光:加開宜蘭、花東的班次,在觀光熱點設站,菜單換上在地特色便當吸引遊客。',
    hotspots: [
      { name: '冬山河親水公園', lat: 24.672, lng: 121.79, demand: 9000, r: 3 },
      { name: '太魯閣國家公園', lat: 24.158, lng: 121.62, demand: 12000, r: 5 },
      { name: '七星潭', lat: 24.027, lng: 121.631, demand: 8000, r: 3 },
      { name: '鹿野高台', lat: 22.92, lng: 121.13, demand: 7000, r: 4 },
    ],
    tourism: ['東部幹線', '南迴線'],
    goals: { profitable: 2, newLines: 1, happy: 2 },
  },
  {
    id: 'c4', title: '全國路網再造', difficulty: 4, budget: 60,
    brief: '最後一年的總體檢:全國的熱點都要照顧到,營收、滿意度、新建設三項全部達標,才能登上局長之位。',
    hotspots: [
      { name: '林口新市鎮', lat: 25.075, lng: 121.37, demand: 26000, r: 4 },
      { name: '竹北高鐵特區', lat: 24.808, lng: 121.04, demand: 16000, r: 3 },
      { name: '臺中水湳智慧城', lat: 24.184, lng: 120.655, demand: 18000, r: 3 },
      { name: '臺南沙崙科學城', lat: 22.925, lng: 120.287, demand: 12000, r: 3 },
      { name: '高雄亞洲新灣區', lat: 22.608, lng: 120.3, demand: 20000, r: 3 },
      { name: '太魯閣國家公園', lat: 24.158, lng: 121.62, demand: 12000, r: 5 },
    ],
    goals: { profitable: 4, newLines: 3, happy: 3 },
  },
];

/** 可上架的便當(經典款 + 騰雲座艙各分處):appeal 吸引力、cost 成本、ref 參考售價 */
export const COO_BENTOS = [
  { id: 'pork', name: '排骨便當', appeal: 1.0, cost: 38, ref: 80, tag: '經典' },
  { id: 'chicken', name: '雞腿便當', appeal: 1.05, cost: 48, ref: 100, tag: '經典' },
  { id: 'veg', name: '素食便當', appeal: 0.8, cost: 34, ref: 80, tag: '經典' },
  { id: 'k2feast', name: '騰雲饗宴便當(臺北)', appeal: 1.25, cost: 72, ref: 150, tag: '騰雲' },
  { id: 'k3surf', name: '騰雲海陸便當(七堵)', appeal: 1.2, cost: 70, ref: 150, tag: '騰雲' },
  { id: 'k4surf', name: '海陸雙饗便當(臺中)', appeal: 1.15, cost: 68, ref: 150, tag: '騰雲' },
  { id: 'k5feast', name: '乘寄藜饗便當(高雄)', appeal: 1.2, cost: 76, ref: 160, tag: '騰雲' },
  { id: 'k6surf', name: '海陸雙拼便當(花蓮)', appeal: 1.18, cost: 69, ref: 150, tag: '騰雲', east: true },
  { id: 'k7slow', name: '慢。覓台東餐盒(臺東)', appeal: 1.22, cost: 75, ref: 160, tag: '騰雲', east: true },
  { id: 'k4veg', name: '蔬食知味便當(臺中)', appeal: 0.95, cost: 55, ref: 130, tag: '騰雲' },
];

/** 大站(需求較高) */
export const MAJOR_STATIONS = ['基隆', '臺北', '板橋', '桃園', '中壢', '新竹', '苗栗', '豐原', '臺中', '彰化', '員林', '斗六', '嘉義', '新營', '臺南', '岡山', '新左營', '高雄', '屏東', '宜蘭', '羅東', '花蓮', '玉里', '臺東', '七堵', '松山', '南港', '樹林'];
