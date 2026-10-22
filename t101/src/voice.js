// 語音台詞清單。音檔由 tools/gen-voice-edge.py 事先產生到 assets/audio/voice/<id>.mp3。
// 角色:announcer = 廣播(男聲 雲哲)、lift = 電梯廣播(女聲 曉臻)、barista = 星巴克店員(曉臻)、kaffa = 興波咖啡店員(曉雨)
export const VOICES = {
  announcer: { voice: 'zh-TW-YunJheNeural', rate: '+0%' },
  lift: { voice: 'zh-TW-HsiaoChenNeural', rate: '+0%' },
  barista: { voice: 'zh-TW-HsiaoChenNeural', rate: '+5%' },
  kaffa: { voice: 'zh-TW-HsiaoYuNeural', rate: '+0%' }
};

export const LINES = [
  { id: 'elev_up', role: 'lift', text: '歡迎搭乘台北101觀景台高速電梯,本電梯將在約三十七秒內抵達八十九樓。' },
  { id: 'elev_up_short', role: 'lift', text: '歡迎搭乘台北101高速電梯,電梯上樓中。' },
  { id: 'elev_down', role: 'lift', text: '電梯下樓中,請站穩扶好。' },
  { id: 'elev_ear', role: 'lift', text: '電梯以每分鐘一千零一十公尺的速度上升,如有耳鳴,請吞嚥口水。' },
  { id: 'arrive_5', role: 'lift', text: '五樓到了,這裡是觀景台售票入口。' },
  { id: 'arrive_35', role: 'lift', text: '三十五樓到了,星巴克咖啡在您的右前方。' },
  { id: 'arrive_88', role: 'lift', text: '八十八樓到了,風阻尼器與興波咖啡,歡迎參觀。' },
  { id: 'arrive_89', role: 'lift', text: '八十九樓,室內觀景台到了,祝您參觀愉快。' },
  { id: 'race_ready', role: 'announcer', text: '各就各位,預備。' },
  { id: 'race_go', role: 'announcer', text: '開跑!' },
  { id: 'race_water', role: 'announcer', text: '前方補水站,按 E 補充水分。' },
  { id: 'race_half', role: 'announcer', text: '已經跑完一半,繼續加油!' },
  { id: 'race_pace', role: 'announcer', text: '心跳太快了,放慢節奏調整呼吸。' },
  { id: 'race_finish', role: 'announcer', text: '抵達終點!恭喜完成台北101登高賽!' },
  { id: 'climb_start', role: 'announcer', text: '攀爬開始。安全繩已扣好,抓穩每一節竹節外牆。' },
  { id: 'climb_ledge', role: 'announcer', text: '抵達平台,可以在這裡休息,恢復握力。' },
  { id: 'climb_wind', role: 'announcer', text: '強風來襲!按住 Shift 貼緊牆面!' },
  { id: 'climb_fall', role: 'announcer', text: '手滑了!安全繩拉住了你,回到上一個平台。' },
  { id: 'climb_91', role: 'announcer', text: '抵達九十一樓室外觀景台!' },
  { id: 'climb_top', role: 'announcer', text: '登頂成功!你站在五百零八公尺的台北101塔尖!' },
  { id: 'sbux_order', role: 'barista', text: '歡迎光臨!您的那堤好了,請慢用。' },
  { id: 'kaffa_order', role: 'kaffa', text: '這是我們的招牌手沖咖啡,請慢慢享用八十八樓的景色。' },
  { id: 'damper_info', role: 'announcer', text: '這顆風阻尼器重六百六十公噸,由四十一層鋼板組成,能有效減少大樓在強風中的晃動。' },
  { id: 'typhoon', role: 'announcer', text: '颱風模擬開始,請注意阻尼器的擺動幅度。' },
  { id: 'stamp', role: 'lift', text: '紀念章蓋好了,歡迎再次光臨台北101觀景台。' },
  { id: 'ticket', role: 'lift', text: '購票完成,請往前方電梯搭乘。' },
  { id: 'fall', role: 'announcer', text: '墜落中!快算出答案,打開降落傘!' },
  { id: 'limbs_all', role: 'announcer', text: '四肢同時放開了!' },
  { id: 'chute_ok', role: 'announcer', text: '答對了!降落傘成功打開!' },
  { id: 'chute_fail', role: 'announcer', text: '降落傘打開失敗!' },
  { id: 'landed', role: 'announcer', text: '安全降落,歡迎回到地面。' },
  { id: 'crashed', role: 'announcer', text: '摔落地面,挑戰失敗。' },
  { id: 'fw_warn', role: 'announcer', text: '注意!附近即將施放煙火,快往旁邊移動!' },
  { id: 'fw_hit', role: 'announcer', text: '被煙火炸飛了!' },
  { id: 'nye_10', role: 'announcer', text: '跨年倒數,十、九、八、七、六、五、四、三、二、一!' },
  { id: 'nye_happy', role: 'announcer', text: '新年快樂!二零二七年到了!' }
];
