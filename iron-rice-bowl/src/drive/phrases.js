/**
 * phrases.js
 * 到站廣播的固定用語(純資料)。
 *   - tools/build-tts.mjs 以 Microsoft Azure TTS 把這些用語預先產生成 v3/assets/audio/*.mp3
 *   - 站名、路線名由玩家輸入,執行時改用瀏覽器/作業系統內建語音(Web Speech API)即時合成
 * 修改文字後重新執行 build-tts.mjs,只會重新產生有變動的音檔。
 */

/** Azure 神經語音(可用環境變數 AZURE_TTS_VOICE_ZH / AZURE_TTS_VOICE_EN 覆寫) */
export const VOICES = {
    zh: 'zh-TW-HsiaoChenNeural',
    en: 'en-US-JennyNeural'
};

export const LANG_TAG = { zh: 'zh-TW', en: 'en-US' };

export const PHRASES = {
    zh_welcome: { lang: 'zh', text: '歡迎搭乘鈦鐵列車,本列車開往' },
    en_welcome: { lang: 'en', text: 'Welcome aboard Taizhi Railway. This train is bound for' },
    zh_next: { lang: 'zh', text: '下一站' },
    en_next: { lang: 'en', text: 'The next station is' },
    zh_arriving: { lang: 'zh', text: '到了' },
    en_arriving: { lang: 'en', text: 'We are now arriving at' },
    zh_terminal: { lang: 'zh', text: '終點站' },
    zh_terminal_end: { lang: 'zh', text: '到了,請全部旅客下車,謝謝您的搭乘。' },
    en_terminal: { lang: 'en', text: 'This is the terminal station. All passengers please get off. Thank you for riding with us.' },
    zh_transfer: { lang: 'zh', text: '可轉乘' },
    en_transfer: { lang: 'en', text: 'Transfer to' },
    zh_out_transfer: { lang: 'zh', text: '可出站轉乘' },
    en_out_transfer: { lang: 'en', text: 'Out-of-station transfer to' },
    zh_doors_left: { lang: 'zh', text: '左側車門將開啟。' },
    zh_doors_right: { lang: 'zh', text: '右側車門將開啟。' },
    en_doors_left: { lang: 'en', text: 'Doors on the left side will open.' },
    en_doors_right: { lang: 'en', text: 'Doors on the right side will open.' },
    zh_gap: { lang: 'zh', text: '下車時,請注意月台間隙。' },
    en_gap: { lang: 'en', text: 'Please mind the gap when getting off.' },
    zh_doors_closing: { lang: 'zh', text: '車門即將關閉,請勿再上下車。' },
    en_doors_closing: { lang: 'en', text: 'The doors are closing. Please stand clear.' },
    zh_handrail: { lang: 'zh', text: '為了您的安全,請緊握扶手。' },
    en_handrail: { lang: 'en', text: 'For your safety, please hold the handrail.' }
};

/**
 * 站名/路線名等「名稱」音檔的鍵(瀏覽器與 tools/build-tts.mjs 共用,同一段文字一定得到同一個鍵)。
 * build-tts 會為預設路網的所有站名、路線名事先產生音檔;玩家自訂的名稱沒有音檔時改用瀏覽器語音。
 */
export function nameClipKey(lang, text) {
    let h = 0x811c9dc5;
    for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return `name_${lang}_${h.toString(16).padStart(8, '0')}`;
}
