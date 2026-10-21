// 行控人員(調度員)關卡:鈦鐵西部幹線北段的行車調度。
//   stations:路段(依序);sidings:有待避線(可讓慢車停靠讓快車通過)與渡線(可做單線雙向運轉)的車站
//   trains:{ no 車次, type 'exp' 自強 / 'loc' 區間, dir +1 南下(往新竹)/ -1 北上, at 起點發車時刻(分) }
//   incidents:{ at 發生時刻(分), kind, ... } 事故:breakdown 列車故障(停在區間)/ signal 號誌故障(車站需人工放行)/
//             obstacle 路線異物(某區間某方向封鎖)/ crowd 月台人潮(停站時間延長)
//   goal:wDelay = 加權平均延誤上限(分;自強號權重 2),且不可發生險些相撞
export const DISPATCH_LINE = {
  stations: ['臺北', '萬華', '板橋', '浮洲', '樹林', '南樹林', '山佳', '鶯歌', '鳳鳴', '桃園', '內壢', '中壢', '平鎮', '埔心', '楊梅', '富岡', '新富', '北湖', '湖口', '新豐', '竹北', '北新竹', '新竹'],
  sidings: ['臺北', '板橋', '樹林', '鶯歌', '桃園', '中壢', '楊梅', '湖口', '竹北', '新竹'],
  express: ['臺北', '板橋', '樹林', '桃園', '中壢', '楊梅', '竹北', '新竹'],
};

const T = (no, type, dir, at) => ({ no, type, dir, at });

export const DISPATCH_LEVELS = [
  {
    id: 'o1', title: '早班見習', difficulty: 1, duration: 60, goal: { wDelay: 5 },
    brief: '清晨班次不多。區間車先開、自強號隨後追上:在有待避線的車站讓區間車「待避」,自強號才不會被擋住。',
    trains: [T('1101', 'loc', 1, 2), T('1102', 'loc', -1, 4), T('121', 'exp', 1, 10), T('1103', 'loc', 1, 20), T('122', 'exp', -1, 14), T('1104', 'loc', -1, 24)],
    incidents: [],
  },
  {
    id: 'o2', title: '尖峰通勤', difficulty: 2, duration: 75, goal: { wDelay: 8 },
    brief: '上班尖峰,區間車密集、自強號穿插。安排待避順序讓自強號準點,也別讓區間車延誤太久。月台人潮會拖長停站時間。',
    trains: [T('1111', 'loc', 1, 1), T('1112', 'loc', -1, 2), T('1113', 'loc', 1, 8), T('131', 'exp', 1, 12), T('1114', 'loc', -1, 9), T('132', 'exp', -1, 14),
      T('1115', 'loc', 1, 18), T('1116', 'loc', -1, 20), T('133', 'exp', 1, 26), T('134', 'exp', -1, 28), T('1117', 'loc', 1, 32), T('1118', 'loc', -1, 34)],
    incidents: [{ at: 15, kind: 'crowd', station: '板橋', mins: 10 }, { at: 30, kind: 'crowd', station: '桃園', mins: 10 }],
  },
  {
    id: 'o3', title: '列車故障', difficulty: 3, duration: 80, goal: { wDelay: 12 },
    brief: '一列南下區間車在鶯歌—桃園間故障停車,南下線被堵住。到鶯歌、桃園啟用「單線雙向運轉」,讓南下列車借用北上線通過——同一時間只能放行一個方向,放錯就會險些相撞!',
    trains: [T('1121', 'loc', 1, 1), T('1122', 'loc', -1, 3), T('141', 'exp', 1, 8), T('1123', 'loc', 1, 14), T('142', 'exp', -1, 10), T('1124', 'loc', -1, 16),
      T('143', 'exp', 1, 22), T('1125', 'loc', 1, 28), T('144', 'exp', -1, 26)],
    incidents: [{ at: 12, kind: 'breakdown', train: '1121', between: ['鶯歌', '桃園'], mins: 35 }],
  },
  {
    id: 'o4', title: '號誌故障與路線異物', difficulty: 4, duration: 80, goal: { wDelay: 12 },
    brief: '中壢站號誌故障,列車到站後必須由你確認前方淨空、人工放行;稍後楊梅—富岡間北上線發現異物,要暫時封鎖並改單線運轉。',
    trains: [T('1131', 'loc', 1, 1), T('1132', 'loc', -1, 2), T('151', 'exp', 1, 9), T('1133', 'loc', 1, 12), T('152', 'exp', -1, 8), T('1134', 'loc', -1, 14),
      T('153', 'exp', 1, 24), T('154', 'exp', -1, 22), T('1135', 'loc', 1, 30), T('1136', 'loc', -1, 32)],
    incidents: [{ at: 6, kind: 'signal', station: '中壢', mins: 50 }, { at: 25, kind: 'obstacle', between: ['楊梅', '湖口'], dir: -1, mins: 25 }],
  },
  {
    id: 'o5', title: '颱風夜', difficulty: 5, duration: 90, goal: { wDelay: 14 },
    brief: '颱風來襲,全線降速。列車故障、號誌故障、路線異物接連發生,班次又密——考驗你的調度判斷。',
    slow: 0.8,
    trains: [T('1141', 'loc', 1, 1), T('1142', 'loc', -1, 2), T('161', 'exp', 1, 7), T('162', 'exp', -1, 8), T('1143', 'loc', 1, 13), T('1144', 'loc', -1, 15),
      T('163', 'exp', 1, 21), T('164', 'exp', -1, 22), T('1145', 'loc', 1, 28), T('1146', 'loc', -1, 30), T('165', 'exp', 1, 36), T('166', 'exp', -1, 38)],
    incidents: [{ at: 10, kind: 'signal', station: '樹林', mins: 30 }, { at: 18, kind: 'breakdown', train: '1144', between: ['中壢', '桃園'], mins: 30 },
      { at: 34, kind: 'obstacle', between: ['湖口', '竹北'], dir: 1, mins: 20 }, { at: 40, kind: 'crowd', station: '新竹', mins: 15 }],
  },
];
