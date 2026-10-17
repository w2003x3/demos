// 「司機員駕駛」階段(預留,升遷後開放)— 從駕駛室看前方路線,控制牽引/煞車,準點且準確停在月台停車位置。
//
// 可直接沿用的現有系統:
//   - src/world/scenery.js:景物以「平鋪圖層」沿軌道 X 方向捲動,前方視角(相機朝 +X)即可看到
//     軌道、電車線、樹木房屋與進站月台;setStationSign() 可顯示站名。
//   - 行駛曲線:OnboardPhase 的 run 狀態(s / v / legDist / S)可改為玩家控制加減速。
//   - 語音:conductor_* / station_* 廣播台詞。
//
// 待補:
//   - Blender:EMU3000 駕駛室(前窗、儀表板、主控制器把手)模型 → blender/build_assets.py 新增 build_emu3000_cab()
//   - 玩法:號誌、速限標誌、停車位置標、ATP 超速煞車、準點評分
// 介面同 OnboardPhase:init() / update(dt) / dispose() / dialog。

export class DriverPhase {
  constructor(game, cfg) {
    this.g = game;
    this.cfg = cfg;
  }

  async init() {
    throw new Error('司機員駕駛模式尚在開發中');
  }

  update() { return { success: false, reason: '司機員駕駛模式尚在開發中' }; }

  dispose() {}
}
