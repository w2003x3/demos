// 「大站轉乘」階段(預留,尚未開放)。
//
// 玩法構想:在大型車站下車 → 經穿堂走到指定月台 → 等指定列車到站領取便當 → 搭上另一班列車繼續 onboard 階段。
//
// 實作時會用到的現成資源:
//   - 場景:assets/models/platform_island.glb(20 m 島式月台模組,依 STATIONS[id].layout 平鋪排列)
//   - 車站資料:src/config/stations.js 的 layout(月台、股道、間距、穿堂型式)
//   - 任務設定:src/config/missions.js 中 type: 'station' 的 phase(arriveTrack / pickup / departTrack / timeLimit)
//   - 車種:src/config/trains.js(到站列車可為不同車種)
//   - 廣播:src/config/voice.js 的 station_* 台詞(可再加「X 月台列車進站」等)
//
// Phase 介面(與 OnboardPhase 相同,Game 依序呼叫):
//   async init()      建立場景,加入 game.scene
//   update(dt)        每幀更新;回傳 null 表示進行中,回傳 { success, reason, ... } 表示結束
//   dispose()         移除場景與資源
//   dialog            非 null 時 Esc 交給本階段處理(不暫停)

export class StationPhase {
  constructor(game, cfg) {
    this.g = game;
    this.cfg = cfg;
  }

  async init() {
    throw new Error('大站轉乘階段尚在開發中');
  }

  update() { return { success: false, reason: '大站轉乘階段尚在開發中' }; }

  dispose() {}
}
