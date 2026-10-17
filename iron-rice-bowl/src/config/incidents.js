// 乘客狀況(擋住走道、耽誤前進)。
// type: 'hold' = 按住 E 一段時間;'choice' = 選擇正確處理方式(選錯會被耽擱並降低滿意度)。
// prop: 走道上的障礙物外觀 — suitcase / spill / kid / adult。

export const INCIDENTS = [
  {
    id: 'luggage', prop: 'suitcase', type: 'hold', duration: 2.2,
    title: '行李擋住走道',
    text: '一個大行李箱橫在走道上,主人正在打瞌睡。',
    hint: '按住 E 把行李箱抬上行李架',
    done: '行李放好了,走道淨空!',
  },
  {
    id: 'spill', prop: 'spill', type: 'hold', duration: 3.0,
    title: '飲料打翻了',
    text: '有乘客打翻了飲料,走道又濕又滑,推車直接過去很危險。',
    hint: '按住 E 用抹布清理地板',
    done: '地板清乾淨了。',
  },
  {
    id: 'kid', prop: 'kid', type: 'choice',
    title: '小朋友在走道玩耍',
    text: '一位小朋友在走道上跑來跑去,擋住了推車。',
    options: [
      { label: '蹲下來微笑,請小朋友回座位,並提醒家長注意', ok: true, reply: '小朋友乖乖回到座位了。' },
      { label: '大聲喝斥要他讓開', ok: false, reply: '小朋友哭了起來,家長很不高興……' },
      { label: '推車慢慢擠過去', ok: false, reply: '太危險了!差點撞到小朋友。' },
    ],
  },
  {
    id: 'seat', prop: 'adult', type: 'choice',
    title: '座位糾紛',
    text: '兩位乘客為了同一個座位爭執不下,站在走道上僵持。',
    options: [
      { label: '請雙方出示車票,核對車廂與座位號碼', ok: true, reply: '原來其中一位坐錯車廂了,誤會解開。' },
      { label: '請比較晚到的乘客去找別的空位', ok: false, reply: '乘客很不服氣:「我明明有買票!」' },
      { label: '請他們自己協調,繼續推車', ok: false, reply: '爭吵更激烈了,其他乘客開始抱怨……' },
    ],
  },
  {
    id: 'nextstop', prop: 'adult', type: 'choice', dynamic: 'nextStop',
    title: '乘客詢問',
    text: '乘客問:「不好意思,請問下一站是哪一站?」',
  },
  {
    id: 'sick', prop: 'adult', type: 'choice',
    title: '乘客身體不適',
    text: '一位乘客臉色蒼白、說頭很暈,同行友人站在走道上向你求助。',
    options: [
      { label: '先協助他休息,並立即通報列車長', ok: true, reply: '列車長趕來協助,乘客狀況穩定下來了。' },
      { label: '推薦他吃個便當補充體力', ok: false, reply: '友人瞪了你一眼:「他現在很不舒服!」' },
      { label: '請他們下一站自己下車就醫', ok: false, reply: '友人非常不滿,說要客訴。' },
    ],
  },
  {
    id: 'cold', prop: 'adult', type: 'choice',
    title: '冷氣太冷',
    text: '一位阿嬤站起來攔住你:「少年仔,冷氣太冷了啦!」',
    options: [
      { label: '向阿嬤致歉,並轉告列車長調整空調', ok: true, reply: '阿嬤滿意地點點頭坐回去了。' },
      { label: '建議阿嬤換到別節車廂', ok: false, reply: '阿嬤:「我的位子就在這裡啊!」' },
      { label: '直接賣她一罐熱咖啡', ok: false, reply: '阿嬤:「我不喝咖啡啦!」' },
    ],
  },
  {
    id: 'phone', prop: 'adult', type: 'choice',
    title: '講電話太大聲',
    text: '有乘客站在走道上大聲講電話,附近乘客紛紛皺眉。',
    options: [
      { label: '輕聲提醒他到車廂連接處通話', ok: true, reply: '乘客不好意思地走到連接處去了。' },
      { label: '當作沒看到', ok: false, reply: '旁邊的乘客開始向你抱怨……' },
      { label: '直接請他掛電話', ok: false, reply: '乘客很不高興:「我在談公事!」' },
    ],
  },
];
