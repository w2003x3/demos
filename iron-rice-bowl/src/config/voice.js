// 語音台詞清單(Azure TTS 產檔與遊戲播放共用)。
// 產檔:node tools/gen-voice.mjs(需設定 AZURE_SPEECH_KEY / AZURE_SPEECH_REGION)→ assets/audio/voice/<id>.mp3
// 遊戲播放時若找不到 mp3,改用瀏覽器內建 speechSynthesis 念出(Edge 內建微軟中文語音)。

import { STATIONS } from './stations.js';
import { ITEMS } from './items.js';
import { INCIDENTS } from './incidents.js';
import { MISSIONS } from './missions.js';

// 角色 → Azure Neural 語音與語調(SSML prosody)
export const VOICES = {
  attendant:   { voice: 'zh-TW-HsiaoChenNeural', lang: 'zh-TW', rate: '+5%' },
  passengerM:  { voice: 'zh-TW-YunJheNeural', lang: 'zh-TW' },
  passengerF:  { voice: 'zh-TW-HsiaoYuNeural', lang: 'zh-TW' },
  child:       { voice: 'zh-TW-HsiaoYuNeural', lang: 'zh-TW', pitch: '+25%', rate: '+10%' },
  grandma:     { voice: 'zh-TW-HsiaoChenNeural', lang: 'zh-TW', pitch: '-15%', rate: '-12%' },
  conductor:   { voice: 'zh-TW-YunJheNeural', lang: 'zh-TW', rate: '-5%' },
  conductorEn: { voice: 'en-US-GuyNeural', lang: 'en-US', rate: '-5%' },
  station:     { voice: 'zh-TW-HsiaoYuNeural', lang: 'zh-TW', rate: '-8%' },
  stationEn:   { voice: 'en-US-JennyNeural', lang: 'en-US', rate: '-5%' },
};

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

/** 產生所有台詞(含依車站、品項、狀況展開的動態台詞)。 */
export function buildVoiceLines() {
  const lines = [];
  const add = (id, role, text) => lines.push({ id, role, text });

  for (const [k, t] of Object.entries(ATTENDANT_LINES)) add(`att_${k}`, 'attendant', t);
  for (const [k, t] of Object.entries(CONDUCTOR_LINES)) add(`conductor_${k}`, 'conductor', t);
  for (const [k, t] of Object.entries(PASSENGER_LINES)) {
    add(`pax_${k}_m`, 'passengerM', t);
    add(`pax_${k}_f`, 'passengerF', t);
  }
  for (const it of Object.values(ITEMS)) {
    const t = `給我一${it.unit}${it.name}。`;
    add(`order_${it.id}_m`, 'passengerM', t);
    add(`order_${it.id}_f`, 'passengerF', t);
  }
  for (const inc of INCIDENTS) {
    const v = INCIDENT_VOICE[inc.id];
    if (v) add(`inc_${inc.id}`, v[0], v[1]);
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
