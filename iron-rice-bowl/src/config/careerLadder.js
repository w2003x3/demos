// 職涯升降階梯(資料驅動)。由低到高排列;完整說明見 docs/職涯升降制度.md。
//
// 每個職位:
//   phase    該職位的玩法階段(src/main.js 的 PHASES 註冊);playable = 目前可玩
//   promote  晉升:rules「全部」達成 → 換到 to
//   demote   降調/開除:rules「任一」達到 → 換到 to
// rules 的 key 是「在該職位期間」累積的計數(換職位時歸零),由各玩法階段結算時回報(result.careerDelta)。

export const RANKS = [
  {
    id: 'troublemaker', title: '不良乘客', phase: 'troublemaker',
    duties: '最底層:在車站搞破壞(逃票、霸佔座位、亂丟垃圾…),不能被站長抓到',
    promote: null, // 沒有「升遷」:被抓太多次就會被強迫入職廚房
    demote: {
      to: 'kitchen', verb: '被站長強迫入職',
      rules: { caught: { limit: 3, label: '被站長抓到', unit: '次' } },
    },
  },
  {
    id: 'kitchen', title: '便當廚房', phase: 'kitchen',
    duties: '在出車前的時限內製作指定數量的便當(盛飯、擺菜、封盒)',
    promote: {
      to: 'attendant', verb: '升回',
      rules: {
        bentosMade: { limit: 300, label: '累計製作便當', unit: '個' },
        successes: { limit: 5, label: '達成產量目標的班次', unit: '次' },
      },
    },
    demote: {
      to: 'troublemaker', verb: '被開除,淪為',
      rules: {
        failures: { limit: 3, label: '時限內未達產量', unit: '次' },
        mistakes: { limit: 20, label: '便當做錯', unit: '個' },
      },
    },
  },
  {
    id: 'attendant', title: '列車餐服員', phase: 'onboard', playable: true,
    duties: '推車販售便當與飲料、心算結帳、送預訂便當、處理車上乘客狀況',
    promote: {
      to: 'driver', verb: '升任',
      rules: {
        successes: { limit: 8, label: '任務成功', unit: '次' },
        revenue: { limit: 20000, label: '累計營業額', unit: '元' },
        perfect: { limit: 3, label: '零客訴且滿意度 ≥ 90 的任務', unit: '次' },
      },
    },
    demote: {
      to: 'kitchen', verb: '被調職到',
      rules: {
        lossAmount: { limit: 500, label: '少算虧損金額', unit: '元' },
        lossCount: { limit: 6, label: '少算次數', unit: '次' },
        complaints: { limit: 5, label: '客訴', unit: '件' },
        failures: { limit: 3, label: '任務失敗(被趕下車)', unit: '次' },
      },
    },
  },
  {
    id: 'driver', title: '司機員', phase: 'driver',
    duties: '駕駛列車:看前方路線與號誌控制速度,準點並準確停靠月台',
    promote: {
      to: 'ticket', verb: '升任',
      rules: {
        successes: { limit: 10, label: '準點完成的班次', unit: '次' },
        perfectStops: { limit: 40, label: '停車誤差 ≤ 0.5 m', unit: '次' },
      },
    },
    demote: {
      to: 'attendant', verb: '被降為',
      rules: {
        badStops: { limit: 8, label: '停車不準(誤差 > 2 m)', unit: '次' },
        overspeed: { limit: 5, label: '超速觸發 ATP 緊急煞車', unit: '次' },
        late: { limit: 5, label: '誤點 > 3 分鐘', unit: '次' },
      },
    },
  },
  {
    id: 'ticket', title: '站務員', phase: 'ticketing',
    duties: '售票窗口:應付搶票人潮、安排座位、處理各種結帳難題',
    promote: {
      to: 'stationmaster', verb: '升任',
      rules: {
        ticketsSold: { limit: 500, label: '售出車票', unit: '張' },
        successes: { limit: 10, label: '完成的班次', unit: '次' },
        balanced: { limit: 5, label: '帳款零差額的班次', unit: '次' },
      },
    },
    demote: {
      to: 'driver', verb: '被調回',
      rules: {
        seatErrors: { limit: 8, label: '劃錯 / 重複劃位', unit: '次' },
        cashShort: { limit: 1000, label: '帳款短少', unit: '元' },
        complaints: { limit: 5, label: '客訴', unit: '件' },
      },
    },
  },
  {
    id: 'stationmaster', title: '站長', phase: 'stationmaster',
    duties: '查緝逃票、追捕逃票乘客,處置行為異常的乘客並解除運送契約',
    promote: {
      to: 'dispatcher', verb: '升任',
      rules: {
        caughtEvaders: { limit: 50, label: '抓到逃票 / 不良乘客', unit: '人' },
        properTerminations: { limit: 10, label: '依規定正確解除運送契約', unit: '次' },
        successes: { limit: 10, label: '完成的班次', unit: '次' },
      },
    },
    demote: {
      to: 'ticket', verb: '被降為',
      rules: {
        missedEvaders: { limit: 15, label: '讓逃票乘客跑掉', unit: '人' },
        wrongTerminations: { limit: 3, label: '錯誤解約(處置不當)', unit: '次' },
        complaints: { limit: 5, label: '客訴', unit: '件' },
      },
    },
  },
  {
    id: 'dispatcher', title: '行控人員', phase: 'dispatch',
    duties: '排定時刻表、事故與誤點時的列車調度,並與司機員通訊協調',
    promote: {
      to: 'coo', verb: '升任',
      rules: {
        onTimeShifts: { limit: 10, label: '全線準點率 ≥ 95% 的班次', unit: '次' },
        resolvedIncidents: { limit: 20, label: '成功排除的事故 / 誤點', unit: '件' },
      },
    },
    demote: {
      to: 'stationmaster', verb: '被降為',
      rules: {
        majorDelays: { limit: 5, label: '造成誤點 > 10 分鐘', unit: '次' },
        conflicts: { limit: 1, label: '路線衝突(險些相撞)', unit: '次' },
      },
    },
  },
  {
    id: 'coo', title: '營運長', phase: 'operations',
    duties: '公司整體營運,以及新車站與路線規劃',
    promote: {
      to: 'director', verb: '榮升',
      rules: {
        profitableQuarters: { limit: 4, label: '連續獲利的季度', unit: '季' },
        newLines: { limit: 3, label: '新路線 / 新車站開通', unit: '條' },
        happyQuarters: { limit: 4, label: '旅客滿意度 ≥ 85 的季度', unit: '季' },
      },
    },
    demote: {
      to: 'dispatcher', verb: '被撤換為',
      rules: {
        lossQuarters: { limit: 3, label: '虧損的季度', unit: '季' },
        unhappyQuarters: { limit: 2, label: '旅客滿意度 < 60 的季度', unit: '季' },
      },
    },
  },
  {
    id: 'director', title: '局長', phase: null, clear: true,
    duties: '登上鐵路局最高職位 — 通關!',
    promote: null,
    demote: null,
  },
];

export const START_RANK = 'attendant';
export const rankById = (id) => RANKS.find((r) => r.id === id) || RANKS.find((r) => r.id === START_RANK);
