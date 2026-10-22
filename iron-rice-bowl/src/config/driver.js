// 司機員關卡:鈦鐵路網(assets/data/tw-rail.json,沿用「路網連連看」預設路網)上的實際區段。
// train = 列車(rail-assets 列車目錄 id);scale = 站距縮放(實際距離太長時縮短,行駛時間約 4~8 分鐘);tol = 停車容許誤差(m)。
export const DRIVER_LEVELS = [
  {
    id: 'd1', title: '見習・七堵 → 汐止', line: '西部幹線', from: '七堵', to: '汐止', difficulty: 1, train: 'emu800',
    time: 'day', scale: 0.8, tol: 1, atp: true, assist: true,
    brief: '第一次握主控制器。基隆河谷的平面路段,站距短、彎道少。照著限速開,停在「停」字停車位置標,準確開關門。',
  },
  {
    id: 'd2', title: '臺北地下段・汐科 → 板橋', line: '西部幹線', from: '汐科', to: '板橋', difficulty: 2, train: 'emu3000',
    time: 'day', scale: 0.55, tol: 1, atp: true, assist: true,
    brief: '從汐止平面段下到南港,一路是鐵路地下化的雙線隧道:南港、松山、臺北、萬華、板橋都是地下站。隧道內視線差,注意入地坡道與限速。',
  },
  {
    id: 'd3', title: '臺中高架・豐原 → 新烏日', line: '西部幹線', from: '豐原', to: '新烏日', difficulty: 3, train: 'pp',
    time: 'dusk', scale: 0.5, tol: 1, atp: true, assist: true,
    brief: '臺中鐵路高架化區段,黃昏時段。高架站一站接一站(栗林、潭子、頭家厝、松竹、太原、精武、臺中、五權、大慶),站距短,停車要穩。',
  },
  {
    id: 'd4', title: '蘭陽平原・礁溪 → 羅東', line: '東部幹線', from: '礁溪', to: '羅東', difficulty: 2, train: 'chukuang',
    time: 'overcast', scale: 0.5, tol: 1, atp: true, assist: false,
    brief: '陰天的宜蘭線,沒有駕駛輔助(不顯示建議制動檔位),要靠自己判斷制動時機。',
  },
  {
    id: 'd5', title: '高雄地下化・新左營 → 鳳山', line: '西部幹線', from: '新左營', to: '鳳山', difficulty: 4, train: 'emu800',
    time: 'night', scale: 0.6, tol: 0.5, atp: true, assist: true,
    brief: '夜間的高雄市區地下段,共 10 站,停車容許誤差只有 ±0.5 m。',
  },
  {
    id: 'd6', title: '花東縱谷・花蓮 → 壽豐(ATP 切除)', line: '東部幹線', from: '花蓮', to: '壽豐', difficulty: 5, train: 'puyuma',
    time: 'day', scale: 0.5, tol: 1, atp: false, assist: false,
    brief: 'ATP 故障切除行車:超速不會自動制動,彎道過速會出軌!依限速標誌提早減速,沒有駕駛輔助。',
  },
  {
    id: 'd7', title: '高鐵見習・高鐵新竹 → 高鐵台中', line: '高鐵', from: '高鐵新竹', to: '高鐵台中', difficulty: 4, train: 'thsr-700t',
    time: 'day', scale: 0.35, tol: 1, atp: true, assist: true,
    brief: '支援高鐵:駕駛 700T 以 300 km/h 奔馳在高架橋上。速度快、煞車距離長,進站前好幾公里就要開始減速。',
  },
];
