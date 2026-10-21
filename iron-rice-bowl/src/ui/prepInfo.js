// 各職務、各關卡的載入(整備)畫面內容:與該職務 / 關卡相關的圖解、資料表與輪播小知識,降低等待感。
// buildPrepInfo(phase, cfg, mission) → { icon, role, color, sections:[{ title, html, wide }], tips:[[標題, 內容]], stages:{model, voice} }
import { STATIONS } from '../config/stations.js';
import { ITEMS } from '../config/items.js';
import { DRIVER_LEVELS } from '../config/driver.js';
import { DISPATCH_LINE, DISPATCH_LEVELS } from '../config/dispatch.js';
import { COO_LEVELS, COO_BENTOS } from '../config/coo.js';
import { TICKET_LEVELS, TICKET_DESTS, EAST, FARE_RATE, TYPE_NAME } from '../config/ticket.js';
import { CHASE_WEAPONS } from '../config/chase.js';
import { CHASE_LINES } from '../config/voice.js';
import { STATION_MISSIONS } from '../config/missions.js';
import { loadNetwork, findLine, lineStations, haversine } from '../core/network.js';
import { RANKS } from '../config/careerLadder.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TIME_NAME = { morning: '早晨', noon: '中午', sunset: '黃昏', night: '夜間', day: '白天', dusk: '黃昏', overcast: '陰天' };
const LEVEL_ICON = { underground: '⬇ 地下', elevated: '⬆ 高架', ground: '▬ 平面' };

/** 站序條(SVG):stations=[{name, level?, mark?}];地下站畫在線下、高架站畫在線上 */
function routeStrip(stations, { color = '#1f4e9a', note = null } = {}) {
  const n = stations.length, W = Math.max(520, n * 62), H = 104, y = 52;
  const x = (i) => 30 + (W - 60) * (n === 1 ? 0.5 : i / (n - 1));
  const lv = (s) => (s.level === 'underground' ? 18 : s.level === 'elevated' ? -18 : 0);
  let path = '';
  stations.forEach((s, i) => { path += `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y + lv(s)}`; });
  const dots = stations.map((s, i) => `
    <g transform="translate(${x(i).toFixed(1)},${y + lv(s)})">
      ${s.level === 'elevated' ? `<line y1="4" y2="${18 - lv(s) + 8}" stroke="#7f8ea3" stroke-width="2" stroke-dasharray="3 2"/>` : ''}
      <circle r="${s.major ? 8 : 6}" fill="#fff" stroke="${s.mark || color}" stroke-width="3"/>
      <text y="${s.level === 'underground' ? 26 : -14}" text-anchor="middle" class="pv-sn">${esc(s.name)}</text>
    </g>`).join('');
  return `<div class="pv-strip"><svg viewBox="0 0 ${W} ${H}" style="${n > 14 ? `min-width:${W}px` : ''}">
      <rect x="0" y="${y + 9}" width="${W}" height="4" fill="rgba(160,130,90,.35)"/>
      ${stations.some((s) => s.level === 'underground') ? `<text x="4" y="${H - 4}" class="pv-gl">地面以下</text>` : ''}
      <path d="${path}" fill="none" stroke="${color}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>${dots}
    </svg></div>${note ? `<p class="pv-note">${note}</p>` : ''}`;
}

const kv = (rows) => `<table class="pv-kv">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table>`;
const chips = (list) => `<div class="pv-chips">${list.map((t) => `<span>${esc(t)}</span>`).join('')}</div>`;

// ---------------------------------------------------------------- 各職務
const BUILDERS = {
  // 列車餐服員
  async onboard(cfg, mission, thumbs) {
    const st = (cfg.route || []).map((id, i) => ({ name: STATIONS[id]?.zh || id, major: STATIONS[id]?.major, level: 'ground', mark: i === 0 || i === cfg.route.length - 1 ? '#e8730c' : null }));
    const total = (cfg.legTimes || []).reduce((a, b) => a + b, 0) + (cfg.dwell || 0) * Math.max(0, st.length - 2);
    const foods = Object.values(ITEMS).map((it) => `<div class="pv-food">${thumbs?.[it.id] ? `<img src="${thumbs[it.id]}" alt="">` : '<i>🍱</i>'}<b>${esc(it.name)}</b><em>$${it.price}</em><small>${esc(it.desc || '')}</small></div>`).join('');
    return {
      stage: '載入車廂、乘客與窗外景色', icon: '🍱', role: '列車餐服員', color: '#e8730c',
      sections: [
        { title: `${cfg.trainNo || '新自強號'} 行駛路線`, html: routeStrip(st, { color: '#e8730c', note: `全程約 ${Math.round(total / 60)} 分鐘(遊戲時間)・服務第 ${(cfg.serviceCars || []).join('、')} 車・${TIME_NAME[cfg.scenery?.time] || ''}` }), wide: true },
        { title: '本趟任務', html: kv([['完成趟數', `${cfg.tripsRequired} 趟(備餐區 → 區段終點 → 回備餐區)`], ['預訂便當', `${cfg.preorders || 0} 份,送到指定座位`], ['車廂滿座率', `約 ${Math.round((cfg.occupancy || 0.6) * 100)}%`], ['推車庫存', Object.entries(cfg.stock || {}).map(([k, v]) => `${ITEMS[k]?.short || k}×${v}`).join('、')]]) },
        { title: '今天推車上的商品', html: `<div class="pv-foods">${foods}</div>`, wide: true },
      ],
      tips: [
        ['心算結帳', '總金額要自己算:少算會虧損(記點),多算會被客訴。便當 80 / 100、飲料 20~35 元,記住常見組合最快。'],
        ['售完怎麼辦', '乘客看不到推車上什麼賣完了,點到售完品項時按 X 告知;沒賣完卻說賣完會被識破。'],
        ['快速前進的代價', '按住 Shift 可兩倍速,但撞到走道上的乘客、來不及開的車門,商品可能摔壞,撞到人還會客訴。'],
        ['預訂便當', '預訂單上有車廂與座位號碼,座號就標在行李架邊緣。送錯人要扣錢。'],
        ['車廂狀況', '走道上的 ❗ 是乘客狀況:小朋友亂跑、坐錯位子、身體不舒服……處理好才能繼續推車。'],
        ['小知識', '新自強號 EMU3000 是 12 節編組的城際電聯車,最高營運速度 130 km/h,車頭是流線的「斜面」造型。'],
      ],
    };
  },

  // 便當廚房
  async kitchen(cfg, mission, thumbs, phase) {
    const L = phase.L, B = Object.values(phase.B);
    const cards = B.map((b) => `<div class="pv-food big">${thumbs?.[b.id] ? `<img src="${thumbs[b.id]}" alt="">` : '<i>🍱</i>'}<b>${esc(b.name)}</b><em>$${b.price}</em>${chips(b.parts.map((k) => phase.F[k].name))}</div>`).join('');
    const cook = Object.values(phase.F).filter((f) => f.make?.length).slice(0, 8).map((f) => `<li><b>${esc(f.name)}</b>:${f.make.map(([s, l]) => esc(l)).join(' → ')}</li>`).join('');
    return {
      stage: '布置廚房、準備食材', icon: '🔪', role: '便當廚房', color: '#b23a2a',
      sections: [
        { title: `${L.branch} 今天的便當`, html: `<div class="pv-foods">${cards}</div>`, wide: true },
        { title: '本班目標', html: kv([['數量', `${cfg.quota} 個`], ['時限', `${Math.floor(cfg.timeLimit / 60)} 分 ${cfg.timeLimit % 60 ? cfg.timeLimit % 60 + ' 秒' : ''}`], ['裝錯', '扣錢 + 記點'], ['成品', '依主菜放到對應的成品架']]) },
        { title: '備料製程', html: `<ul class="pv-list">${cook}</ul>` },
      ],
      tips: [
        ['組裝順序', '便當盒 → 白飯 → 主菜 → 配菜 → 蓋上蓋子。和製作單上的樣品一模一樣才算對。'],
        ['缺料要自己補', '飯沒了去煮飯、菜沒了去切菜炒菜、主菜沒了去炸 / 滷 / 煎;便當盒和蓋子在倉庫。'],
        ['小心燒焦', '鍋子裡的東西煮好要趕快起鍋,放太久會燒焦整鍋倒掉。'],
        ['搬上推車', '做好的便當堆在桌邊,按 F 一次搬走;拿越多越容易掉,掉了要扣錢。'],
        ['同事幫忙', '做滿 5 個會有新同事來幫忙:阿姨快但會偷吃、大學生愛聊天、年輕女生快但會出錯、肉壯廚助慢但穩。'],
        ['小知識', '騰雲座艙便當由各餐旅分處設計,臺北、七堵、臺中、高雄、花蓮、臺東各有在地特色。'],
      ],
    };
  },

  // 司機員
  async driver(cfg) {
    const L = DRIVER_LEVELS.find((l) => l.id === cfg.level) || DRIVER_LEVELS[0];
    let strip = '';
    try {
      const net = await loadNetwork();
      const line = findLine(net, L.line), st = lineStations(net, line);
      const i = st.findIndex((s) => s.name === L.from), j = st.findIndex((s) => s.name === L.to);
      const seq = i < j ? st.slice(i, j + 1) : st.slice(j, i + 1).reverse();
      let km = 0; for (let k = 1; k < seq.length; k++) km += haversine(seq[k - 1], seq[k]) / 1000;
      strip = routeStrip(seq.map((s) => ({ name: s.name, level: s.level || 'ground' })), { note: `${seq.length} 站・約 ${km.toFixed(1)} km(遊戲中站距縮為 ${Math.round(L.scale * 100)}%)・圖中線下 = 地下站、線上 = 高架站` });
    } catch { strip = '<p class="pv-note">路線資料載入中…</p>'; }
    return {
      stage: '載入駕駛艙、沿線月台與街景', icon: '🚆', role: '司機員', color: '#1f4e9a',
      sections: [
        { title: `${L.line}:${L.from} → ${L.to}`, html: strip, wide: true },
        { title: '行車條件', html: kv([['時段', TIME_NAME[L.time]], ['停車容許誤差', `±${L.tol} m`], ['ATP 列車自動防護', L.atp ? '投入(超速自動制動)' : '<b class="bad">切除:彎道過速會出軌</b>'], ['駕駛輔助', L.assist ? '建議制動檔位、限速預告' : '<b class="bad">無</b>']]) },
        { title: '新自強號 EMU3000', html: `<div class="pv-train"><i></i><i></i><i></i><i></i><i></i><i></i></div>${kv([['最高速度', '130 km/h'], ['主控制器', 'P1~P5 牽引・N 惰行・B1~B8 制動・EB 緊急'], ['常用最大減速度', '0.95 m/s²(約 3.4 km/h/s)']])}` },
      ],
      tips: [
        ['提早下制動', '制動力要約 0.45 秒才完全建立。進站時先用 B3~B4 大幅減速,剩 50 m 再慢慢放鬆。'],
        ['停車位置標', '月台末端的「停」字牌就是停車位置。進入 500 m 會出現停車導引尺,黃色箭頭對準紅線即可。'],
        ['限速標誌', '彎道前會有圓形限速標誌,TIMS 螢幕也會預告「前方 xxx m 限速 xx」。'],
        ['車門', '停妥、在容許誤差內、而且施加制動,才能按 D 開門;停站時間到再按 D 關門出發。'],
        ['視角', '按 V 可以切換到「司機員視角」,看看坐在駕駛座上的自己;拖曳滑鼠可環顧左右。'],
        ['準點', '每一站都有參考行駛時間,總誤點超過 3 分鐘會影響考核。'],
        ['考核', '停車誤差 ≤ 0.5 m 是「精準停車」,累積 40 次就有升遷資格;誤差 > 2 m、ATP 超速制動都會記點。'],
      ],
    };
  },

  // 站務員
  async ticketing(cfg) {
    const L = TICKET_LEVELS.find((l) => l.id === cfg.level) || TICKET_LEVELS[0];
    let fares = '';
    try {
      const net = await loadNetwork();
      const west = findLine(net, '西部幹線'), east = findLine(net, '東部幹線');
      const along = (line, a, b) => { const st = lineStations(net, line), i = st.findIndex((s) => s.name === a), j = st.findIndex((s) => s.name === b); let km = 0; for (let k = Math.min(i, j); k < Math.max(i, j); k++) km += haversine(st[k], st[k + 1]) / 1000; return km * 1.12; };
      fares = `<table class="pv-kv fares"><tr><th>到</th><th>里程</th><th>自強</th><th>莒光</th><th>區間</th></tr>${TICKET_DESTS.map((d) => {
        const km = EAST.includes(d) ? along(west, '臺北', '八堵') + along(east, '八堵', d) : along(west, '臺北', d);
        return `<tr><td>${d}</td><td>${Math.round(km)} km</td>${['exp', 'cht', 'loc'].map((t) => `<td>${Math.round(km * FARE_RATE[t])}</td>`).join('')}</tr>`;
      }).join('')}</table>`;
    } catch { fares = ''; }
    const seats = `<div class="pv-seats">${Array.from({ length: 4 }, (_, r) => `<div>${['A', 'B', 'C', 'D'].map((c, i) => `${i === 2 ? '<span></span>' : ''}<b class="${i === 0 || i === 3 ? 'w' : 'a'}">${c}</b>`).join('')}</div>`).join('')}<p>A、D 靠窗・B、C 靠走道・同排 A-B / C-D 算「坐在一起」</p></div>`;
    return {
      stage: '布置售票窗口與排隊旅客', icon: '🎫', role: '站務員', color: '#2a7d4f',
      sections: [
        { title: '臺北車站售票窗口・本班', html: kv([['開窗時間', L.startClock], ['旅客', `${L.customers} 位(同時排隊最多 ${L.rush} 人)`], ['客訴上限', `${L.maxComplaints} 件`], ['過關', `服務 ${Math.ceil(L.customers * 0.75)} 位以上`]]) },
        { title: '座位配置', html: seats },
        { title: '全票票價表(由終端機計算)', html: fares + '<p class="pv-note">半票(孩童)、敬老 / 愛心票為全票的一半。</p>', wide: true },
      ],
      tips: [
        ['先聽清楚', '左上角會一直顯示旅客的需求:目的地、張數票種、車種、時間、座位偏好。照順序填就不會漏。'],
        ['車種限制', '區間車只到新竹(西部)或宜蘭(東部);旅客說「要搭自強號」就不能給莒光。'],
        ['座位會被搶', '其他窗口同時在劃位,選好的座位可能突然被賣掉,要重新選位。'],
        ['找零', '按「收款」後旅客會付整數鈔票,自己算找零再輸入。多找 = 帳款短少,少找 = 客訴。'],
        ['別讓人等', '旅客頭上的耐心條見底就會生氣離開,算一件客訴。'],
        ['小知識', '1F 大廳的黑白棋盤格地板是臺北車站最有名的景色,窗口外看得到排隊的人龍。'],
      ],
    };
  },

  // 行控人員
  async dispatch(cfg) {
    const L = DISPATCH_LEVELS.find((l) => l.id === cfg.level) || DISPATCH_LEVELS[0];
    const st = DISPATCH_LINE.stations.map((n) => ({ name: n, major: DISPATCH_LINE.express.includes(n), mark: DISPATCH_LINE.sidings.includes(n) ? '#e8730c' : null }));
    const hm = (m) => { const t = 6 * 60 + m; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
    const tt = [...L.trains].sort((a, b) => a.at - b.at).map((t) => `<tr><td class="${t.type}">${t.no}</td><td>${t.type === 'exp' ? '自強' : '區間'}</td><td>${t.dir > 0 ? '臺北 → 新竹' : '新竹 → 臺北'}</td><td>${hm(t.at)}</td></tr>`).join('');
    const inc = { breakdown: '列車故障', signal: '號誌故障', obstacle: '路線異物', crowd: '月台人潮' };
    return {
      stage: '建置行控中心與車次資訊牆', icon: '🖥', role: '行控人員', color: '#3a7bd5',
      sections: [
        { title: '轄區:西部幹線 臺北—新竹', html: routeStrip(st, { color: '#3a7bd5', note: '橘色圈 = 有待避線與渡線的車站(可待避、可做單線雙向運轉);大圈 = 自強號停靠站' }), wide: true },
        { title: '今日班表', html: `<table class="pv-kv tt"><tr><th>車次</th><th>種類</th><th>方向</th><th>發車</th></tr>${tt}</table>` },
        { title: '交班注意事項', html: kv([['目標', `加權平均延誤 ≤ ${L.goal.wDelay} 分(自強號權重 2)`], ['安全', '不可險些相撞'], ['預報', L.incidents.length ? chips([...new Set(L.incidents.map((i) => inc[i.kind]))]) : '今天沒有異常預報'], ['天候', L.slow ? '颱風:全線降速 20%' : '正常']]) },
      ],
      tips: [
        ['待避', '區間車開在自強號前面時,指示它在前方有待避線的車站「待避」,自強號就能超越,整體延誤會少很多。'],
        ['單線雙向運轉', '故障列車或異物堵住一條軌道時,在兩個有渡線的車站之間共用另一條軌道。每列車進入前都要你放行。'],
        ['險些相撞', '單線區間內同時只能有一個方向的列車。放行前看清楚資訊牆:對向列車還在黃色區段內就不能放。'],
        ['號誌故障', '號誌故障的車站,列車到站後要由行控「人工放行」才能出發,記得隨時查看清單上的「!」。'],
        ['操作', '點左下清單或直接點資訊牆上的列車即可選取;Space 暫停,1 / 2 / 3 切換模擬速度。'],
        ['小知識', '行控中心的巨大資訊牆是由多面 LCD 拼接而成,調度員靠它掌握全線每一列車的即時位置。'],
      ],
    };
  },

  // 營運長
  async operations(cfg) {
    const L = COO_LEVELS.find((l) => l.id === cfg.level) || COO_LEVELS[0];
    const G = L.goals;
    const hs = (L.hotspots || []).map((h) => `<tr><td>🔥 ${esc(h.name)}</td><td>${h.demand.toLocaleString()} 人/日</td><td>${h.r} km</td></tr>`).join('');
    return {
      stage: '載入鈦鐵路網與離線地圖', icon: '📊', role: '營運長', color: '#8e44ad',
      sections: [
        { title: '年度目標', html: kv([['獲利季度', `${G.profitable || 0} / 4 季`], ['滿意度 ≥ 85 的季度', `${G.happy || 0} / 4 季`], ['新車站 / 新路線', `${G.newLines || 0} 項`], ['建設預算', `${L.budget} 億`]]) },
        { title: '需求熱點', html: hs ? `<table class="pv-kv"><tr><th>地點</th><th>需求</th><th>半徑</th></tr>${hs}</table><p class="pv-note">熱點半徑內有車站,才吸引得到這些旅客。</p>` : '<p class="pv-note">今年沒有指定熱點,專心在便當與票價。</p>' },
        { title: '可上架的便當', html: `<table class="pv-kv"><tr><th>便當</th><th>參考價</th><th>成本</th></tr>${COO_BENTOS.map((b) => `<tr><td>${esc(b.name)}${b.east ? ' 🌊' : ''}</td><td>${b.ref}</td><td>${b.cost}</td></tr>`).join('')}</table>`, wide: true },
      ],
      tips: [
        ['建設費攤提', '新車站 2 億、新路線每公里 0.5 億 + 每個新站 1.2 億,費用分四季攤提,下一季就啟用。'],
        ['班次', '班次越多越不擁擠、滿意度越高,但每列車公里都是營運成本。主幹線加班次最划算。'],
        ['票價', '票價調高,票收增加但旅客變少、滿意度下降;調低反之。'],
        ['便當', '品項多、有特色的便當能提高購買率與滿意度;售價高於參考價太多會賣不動。🌊 東部特色便當在觀光路線更受歡迎。'],
        ['試算', '右下角會即時試算本季損益與滿意度,先調整再結算。'],
        ['季節', '第一季有春節、第三季是暑假,運量較高;第二季是淡季,最容易虧損。'],
      ],
    };
  },

  // 站長 / 不良乘客
  async stationmaster(cfg) { return chase(cfg); },
  async troublemaker(cfg) { return chase(cfg); },

  // 車站巡覽
  async stationExplore(cfg) {
    const m = STATION_MISSIONS.find((x) => x.station === cfg.station);
    return {
      stage: '搭建車站場景', icon: '🏛', role: '車站巡覽', color: '#5a6a86',
      sections: [
        { title: m?.title || '車站', html: `<p class="pv-p">${esc(m?.brief || '')}</p>${chips(m?.features || [])}`, wide: true },
        { title: '操作', html: kv([['移動', 'WASD(相對鏡頭方向)、Shift 跑'], ['視角', '拖曳轉視角、V 第一 / 第三人稱'], ['關卡變化', 'M 切換一般 / 迷宮化 / 障礙物'], ['瞬間移動', '右側清單點景點或出口']]) },
      ],
      tips: STATION_TIPS[cfg.station] || [],
    };
  },

  // 大站轉乘
  async station(cfg) {
    return {
      stage: '搭建臺北車站 B1 穿堂', icon: '🔁', role: '列車餐服員・轉乘補貨', color: '#e8730c',
      sections: [
        { title: '轉乘計畫', html: kv([['下車月台', cfg.arriveTrack], ['領取補貨', `${cfg.pickup?.track} 月台交接點(${esc(cfg.pickup?.trainNo || '')})`], ['補貨內容', Object.entries(cfg.pickup?.items || {}).map(([k, v]) => `${ITEMS[k]?.name || k} ${v} 個`).join('、')], ['上車月台', cfg.departTrack], ['時限', `${cfg.timeLimit} 秒`]]), wide: true },
      ],
      tips: [['B1 穿堂', '臺北車站 B1 有五條南北向通道與迴廊,看右上角的箭頭找方向,Shift 可以跑。'], ...STATION_TIPS.taipei],
    };
  },
};

function chase(cfg) {
  const sm = cfg.role === 'stationmaster';
  const m = STATION_MISSIONS.find((x) => x.station === cfg.station);
  const ws = CHASE_WEAPONS[cfg.role].map((w, i) => `<div class="pv-weapon"><span>${w.icon}</span><b>${i + 1} ${esc(w.name)}</b><small>${esc(w.desc)}</small></div>`).join('');
  const foe = CHASE_WEAPONS[sm ? 'troublemaker' : 'stationmaster'].map((w) => `${w.icon} ${w.name}`).join('、');
  return {
    stage: '搭建車站場景、布置人潮與障礙物', icon: sm ? '🔱' : '😜', role: sm ? '站長' : '不良乘客', color: sm ? '#16233f' : '#c0392b',
    sections: [
      { title: '你的裝備', html: `<div class="pv-weapons">${ws}</div>`, wide: true },
      { title: '本關', html: kv([['車站', esc(m?.title || '')], ['時限', `${Math.floor(cfg.time / 60)} 分${cfg.time % 60 ? ' 30 秒' : ''}`], ['目標', sm ? '用刺股逮捕不良乘客' : `塗鴉 ${cfg.tags} 處,而且不被抓`], ['對手的道具', foe]]) },
      { title: sm ? '你的口頭禪' : '你的口頭禪', html: `<ul class="pv-list quote">${CHASE_LINES[cfg.role].map((t) => `<li>「${esc(t)}」</li>`).join('')}</ul>` },
    ],
    tips: [
      ...(sm ? [
        ['先控制再逮捕', '刺股只有在對方滑倒、暈眩或靜止時才能直接逮捕。先用電擊棒、閃光彈或 BB 槍讓他停下來。'],
        ['閃光彈', '範圍 8 m 內的人靜止 5 秒(連自己也會被閃到,丟遠一點)。'],
        ['小心香蕉皮', '不良乘客會在身後丟香蕉皮,跳過去(Space)就不會滑倒。'],
      ] : [
        ['塗鴉計分', '對著牆或地面按 1 噴漆就是一處塗鴉;同一個地方 3 m 內只算一次。'],
        ['甩掉站長', '香蕉皮丟在身後、煙霧彈丟在路上,再跳過閘門與長椅,站長就追不上。'],
        ['被叉住', '被刺股叉住會壓制 1.2 秒;如果這時又被電擊,就會被逮捕。'],
      ]),
      ['跑與跳', 'Shift 奔跑會消耗體力(畫面下方綠條),Space 跳得過閘門、長椅、行李與推車。'],
      ...(STATION_TIPS[cfg.station] || []).slice(0, 2),
    ],
  };
}

const STATION_TIPS = {
  taipei: [['臺北車站', '鈦鐵、高鐵、捷運三鐵共構;1F 大廳是黑白棋盤格地板,四面各有三個門。'], ['B1 穿堂', 'B1 有五條南北通道,中央通道是付費區閘門,周圍是 K / Y / Z 區地下街。']],
  kaohsiung: [['綠之丘', '鐵路地下化後的新站,地面是起伏的「綠之丘」天棚,由造型各異的花柱撐起。'], ['帝冠式舊站', '中軸線上保留 1941 年的帝冠式舊站,深灰瓦的四坡屋頂是它的特色。']],
  taichung: [['蝴蝶展翅', '高架新站的屋頂像展翅的蝴蝶,最高 37 m;2F 平台開闊、通風採光都靠自然。'], ['紅磚舊站', '西南側的紅磚舊站建於 1917 年,有白色飾帶與中央鐘塔。']],
  tainan: [['地下化新站', '2026 年 10 月啟用的地下新站,地面保留 1936 年的古蹟站房。'], ['鳳凰木', '2 號出入口挑高 14 m 的大頂棚,以臺南市樹鳳凰木為設計意象。']],
  keelung: [['縱貫線起點', '第一月台末端保留「縱貫線起點」標誌與鐵鑄雕花棚架。'], ['雞籠', '北站的斜交格子玻璃帷幕取自「雞籠」的意象,出站就是基隆港。']],
  yilan: [['長頸鹿車站', '站房屋頂上站著一隻閉著眼微笑、伸長脖子的大長頸鹿,出自幾米繪本。'], ['丟丟噹森林', '站前 9 株 14 m 高的鋼構巨樹之間,懸吊著幾米的星空列車。']],
};

/** 依任務階段組出整備畫面資料 */
export async function buildPrepInfo(phase, cfg, mission, thumbs) {
  const f = BUILDERS[cfg.type];
  if (!f) return null;
  try {
    const info = await f(cfg, mission, thumbs, phase);
    info.tips.push(...COMMON_TIPS);
    info.career = careerCard(RANK_OF[cfg.type === 'stationmaster' || cfg.type === 'troublemaker' ? cfg.role : cfg.type]);
    return info;
  } catch (e) {
    console.warn('整備畫面資料失敗', e);
    return null;
  }
}

const RANK_OF = { onboard: 'attendant', station: 'attendant', kitchen: 'kitchen', driver: 'driver', ticketing: 'ticket', dispatch: 'dispatcher', operations: 'coo', stationmaster: 'stationmaster', troublemaker: 'troublemaker' };

/** 這個職位的升遷 / 降調條件(職涯小卡) */
function careerCard(id) {
  const r = RANKS.find((x) => x.id === id);
  if (!r) return '';
  const rows = (blk) => Object.values(blk?.rules || {}).map((x) => `<li>${esc(x.label)} ${x.limit}${esc(x.unit)}</li>`).join('');
  const name = (to) => RANKS.find((x) => x.id === to)?.title || '';
  return `<div class="pv-career"><span>📋 ${esc(r.title)}的考核</span><p>${esc(r.duties)}</p>
    ${r.promote ? `<h5 class="up">升遷 → ${esc(name(r.promote.to))}(全部達成)</h5><ul>${rows(r.promote)}</ul>` : ''}
    ${r.demote ? `<h5 class="down">${esc(r.demote.verb)} → ${esc(name(r.demote.to))}(任一達到)</h5><ul>${rows(r.demote)}</ul>` : ''}</div>`;
}

const COMMON_TIPS = [
  ['鐵飯碗', '職涯從列車餐服員開始:表現好一路升到司機員、站務員、站長、行控、營運長,最後當上局長;太差會被調去廚房,甚至淪為不良乘客。'],
  ['鈦鐵', '遊戲中的「鈦鐵」是虛構的「鈦直鐵路有限公司」,所有語音都是事先錄好的。'],
];
