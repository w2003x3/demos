// 語音台詞清單(Azure TTS 產檔與遊戲播放共用)。
// 產檔:node tools/gen-voice.mjs(需設定 AZURE_SPEECH_KEY / AZURE_SPEECH_REGION)→ assets/audio/voice/<id>.mp3
// 遊戲播放時若找不到 mp3,改用瀏覽器內建 speechSynthesis 念出(Edge 內建微軟中文語音)。

import { STATIONS } from './stations.js';
import { ITEMS } from './items.js';
import { INCIDENTS } from './incidents.js';
import { MISSIONS } from './missions.js';
import { outLines } from './kitchen.js';
import { HELPERS, HELPER_LINES } from './helpers.js';

// 角色 → Azure Neural 語音與語調(SSML prosody)
// 聲音分配:廣播一律男聲(雲哲 / 英文男聲);販售員 = 曉臻;乘客 = 雲哲・曉雨・曉臻 三聲混用
export const VOICES = {
  attendant:   { voice: 'zh-TW-HsiaoChenNeural', lang: 'zh-TW', rate: '+5%' },
  passengerM:  { voice: 'zh-TW-YunJheNeural', lang: 'zh-TW' },
  passengerF:  { voice: 'zh-TW-HsiaoYuNeural', lang: 'zh-TW' },
  passengerF2: { voice: 'zh-TW-HsiaoChenNeural', lang: 'zh-TW', pitch: '+4%' },
  child:       { voice: 'zh-TW-HsiaoYuNeural', lang: 'zh-TW', pitch: '+25%', rate: '+10%' },
  grandma:     { voice: 'zh-TW-HsiaoChenNeural', lang: 'zh-TW', pitch: '-15%', rate: '-12%' },
  grandma2:    { voice: 'zh-TW-HsiaoYuNeural', lang: 'zh-TW', pitch: '-18%', rate: '-10%' },
  conductor:   { voice: 'zh-TW-YunJheNeural', lang: 'zh-TW', rate: '-5%' },
  conductorEn: { voice: 'en-US-GuyNeural', lang: 'en-US', rate: '-5%' },
  station:     { voice: 'zh-TW-YunJheNeural', lang: 'zh-TW', rate: '-8%' },
  stationEn:   { voice: 'en-US-ChristopherNeural', lang: 'en-US', rate: '-5%' },
  kitchenBoss: { voice: 'zh-TW-YunJheNeural', lang: 'zh-TW', pitch: '-6%', rate: '+4%' },
  helperAunt:  { voice: 'zh-TW-HsiaoYuNeural', lang: 'zh-TW', pitch: '-9%', rate: '+6%' },
  helperStudent: { voice: 'zh-TW-YunJheNeural', lang: 'zh-TW', pitch: '+7%', rate: '+8%' },
  helperYoung: { voice: 'zh-TW-HsiaoChenNeural', lang: 'zh-TW', pitch: '+3%', rate: '+12%' },
  helperBurly: { voice: 'zh-TW-YunJheNeural', lang: 'zh-TW', pitch: '-15%', rate: '-10%' },
};

// 便當廚房:廚房主任
export const KITCHEN_LINES = {
  start: '動作快!出車前要把便當全部做完。裝錯的要扣錢記點喔!',
  wrong: '這個便當裝錯了啦!扣錢,記點!',
  wrong_rack: '排骨、雞腿、素食要分開放,你放錯架子了!',
  burnt: '燒焦了啦!這鍋不能用了,倒掉!',
  hurry: '剩一分鐘了,快一點!',
  done: '辛苦了,便當全部到齊,準時出車!',
  fail: '時間到了還沒做完,列車要開了啦!',
  drop: '小心一點啦!掉了要扣錢!',
  helper_pick: '做得不錯!有新來的同事,挑一個來幫你裝便當吧。',
  good: '很好,繼續保持!',
};
// 缺料提醒:依各關卡食材產生(kboss_out_<食材>)
for (const [k, t] of Object.entries(outLines())) KITCHEN_LINES[`out_${k}`] = t;

const PASSENGER_LINES = {
  wrong_item: '不對喔,這不是我點的。',
  short_change: '欸,你少找錢了啦!',
  over_change: '咦?你好像多找我了……',
  thanks: '謝謝!',
  sold_out: '什麼?都賣完了喔……',
  gave_up: '算了,不買了。',
  overcharge: '欸,你算錯了吧?怎麼這麼貴!再算一次啦!',
  preorder_thanks: '謝謝,我等好久了!',
  not_mine: '咦?我沒有訂這個喔。',
  curtain: '你顯卡爛為什麼要關我窗簾啦!我要看風景!',
  blocking: '推車擋到路了啦,我要下車耶!',
  pitch_buy: '嗯……好啊,那我看看。',
  pitch_no: '不用了,謝謝。',
  pitch_annoyed: '我在休息,不要吵好不好!',
  soldout_ok: '那其他的照拿就好。',
  soldout_leave: '賣完了喔?那算了。',
  not_soldout: '咦?明明還有啊,騙我喔?',
  crash: '唉唷!推車撞到我了啦!',
  door_noise: '吵死了,推車撞門很大聲耶!',
  nextstop_wrong: '咦?真的嗎?旁邊的人說不是耶……',
};

const ATTENDANT_LINES = {
  callout1: '便當、飲料喔~有需要的旅客請招手。',
  callout2: '熱騰騰的臺鐵便當喔~',
  excuse: '不好意思,借過一下。',
  serve: '您好,請問需要什麼?',
  total: '好的,幫您結帳。',
  change: '這是找您的零錢,謝謝您!',
  exact: '剛好,謝謝您!',
  sorry: '不好意思,我馬上幫您換。',
  restock: '補貨完成,再出發!',
  deliver: '您好,您預訂的便當送到了。',
  checkout: '我算一下喔……',
  pitch: '您好,要不要來個熱騰騰的便當或飲料?',
  soldout: '不好意思,這個已經賣完了。',
  sorry_crash: '對不起對不起!',
  station_restock: '月台補貨,麻煩了,謝謝!',
  vendor: '來,便當跟飲料幫你補上了!',
};

const CONDUCTOR_LINES = {
  kickoff: '服務趟數沒有完成,請你在這一站下車!',
};

// 狀況發生時當事人說的話(無語音者:行李/打翻飲料由服勤員說「借過」)
const INCIDENT_VOICE = {
  kid: ['child', '嘻嘻,你抓不到我~'],
  seat: ['passengerM', '這明明是我的位子!'],
  nextstop: ['passengerF', '不好意思,請問下一站是哪一站?'],
  sick: ['passengerF', '不好意思,我朋友很不舒服,可以幫忙嗎?'],
  cold: ['grandma', '少年仔,冷氣太冷了啦!'],
  phone: ['passengerM', '喂?對啦,我在火車上啦!'],
};

// 車廂環境聲(行駛中隨機出現在玩家所在的車廂):小孩吵鬧;兩位阿婆聊天(依序對話)
export const AMBIENT_KIDS = [
  '媽媽,我們到了沒有啦?',
  '哥哥搶我的玩具!還給我啦!',
  '我要吃餅乾!我要吃餅乾!',
  '哇!外面有火車耶!好快喔!',
  '我要坐靠窗的位子啦!',
];
export const AMBIENT_GRANDMA_CHATS = [
  [['grandma', '欸,你有沒有看新聞?台積電又大漲了耶!'],
   ['grandma2', '真的喔?我孫子叫我要趕快去買!'],
   ['grandma', '對啊,現在不買,等一下又漲上去了啦!'],
   ['grandma2', '那我下車就去證券行問看看。']],
  [['grandma2', '我上禮拜買一張台積電,已經賺一台機車了啦!'],
   ['grandma', '哇,你好厲害!那我也要買兩張!'],
   ['grandma2', '要快喔,大家都在搶啦!']],
  [['grandma', '我女兒說台積電明天還會再漲。'],
   ['grandma2', '那我們退休金都拿去買好了!'],
   ['grandma', '哈哈,買了就不要賣,傳給孫子!']],
];

/** 產生所有台詞(含依車站、品項、狀況展開的動態台詞)。 */
export function buildVoiceLines() {
  const lines = [];
  const add = (id, role, text) => lines.push({ id, role, text });

  for (const [k, t] of Object.entries(ATTENDANT_LINES)) add(`att_${k}`, 'attendant', t);
  AMBIENT_KIDS.forEach((t, i) => add(`amb_kid_${i}`, 'child', t));
  AMBIENT_GRANDMA_CHATS.forEach((chat, c) => chat.forEach(([role, t], i) => add(`amb_gma_${c}_${i}`, role, t)));
  for (const [k, t] of Object.entries(CONDUCTOR_LINES)) add(`conductor_${k}`, 'conductor', t);
  for (const [k, t] of Object.entries(KITCHEN_LINES)) add(`kboss_${k}`, 'kitchenBoss', t);
  for (const [h, lines] of Object.entries(HELPER_LINES)) for (const [k, t] of Object.entries(lines)) add(`helper_${h}_${k}`, HELPERS[h].voice, t);
  for (const [k, t] of Object.entries(PASSENGER_LINES)) {
    add(`pax_${k}_m`, 'passengerM', t);
    add(`pax_${k}_f`, 'passengerF', t);
    add(`pax_${k}_f2`, 'passengerF2', t);
  }
  for (const it of Object.values(ITEMS)) {
    const t = `給我一${it.unit}${it.name}。`;
    add(`order_${it.id}_m`, 'passengerM', t);
    add(`order_${it.id}_f`, 'passengerF', t);
    add(`order_${it.id}_f2`, 'passengerF2', t);
  }
  for (const inc of INCIDENTS) {
    const v = INCIDENT_VOICE[inc.id];
    if (v) add(`inc_${inc.id}`, v[0], v[1]);
    // 選項的回應(由當事人說);按住型完成後的道謝
    (inc.options || []).forEach((o, i) => { if (o.say) add(`inc_${inc.id}_r${i}`, v ? v[0] : 'passengerM', o.say); });
    if (inc.say) add(`inc_${inc.id}_done`, inc.say[0], inc.say[1]);
  }

  // 列車廣播:每個任務的起站歡迎詞;每站的「即將抵達」(中/英)
  const termini = new Set();
  for (const m of MISSIONS.filter((x) => !x.locked)) for (const ph of m.phases) {
    if (ph.type !== 'onboard' || !ph.route) continue;
    termini.add(ph.route[ph.route.length - 1]);
  }
  for (const id of termini) {
    const s = STATIONS[id];
    add(`conductor_welcome_${id}`, 'conductor', `各位旅客您好,歡迎搭乘臺鐵新自強號,本列車開往${s.zh}。車上有便當及飲料販售服務,祝您旅途愉快。`);
    add(`conductor_welcome_${id}_en`, 'conductorEn', `Welcome aboard. This train is bound for ${s.en}. Bento and beverages are available on board.`);
    add(`station_depart_${id}`, 'station', `開往${s.zh}的自強號列車即將出發,請旅客儘速上車。`);
  }
  for (const [id, s] of Object.entries(STATIONS)) {
    add(`conductor_arrive_${id}`, 'conductor', `列車即將抵達${s.zh},要下車的旅客,請準備您的行李,並注意月臺間隙。`);
    add(`conductor_arrive_${id}_en`, 'conductorEn', `We will soon be arriving at ${s.en}.`);
    add(`station_arrived_${id}`, 'station', `${s.zh}到了,${s.zh}到了。`);
    add(`station_arrived_${id}_en`, 'stationEn', `This is ${s.en}.`);
  }
  return lines;
}
