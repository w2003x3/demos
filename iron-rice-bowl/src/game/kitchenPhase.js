// 「台鐵便當廚房」(預留,尚未開放)— 被調職後的玩法:製作便當(盛飯、擺排骨/滷蛋/配菜、封盒)。
//
// 規劃中的資源:
//   - 場景模型:blender/build_assets.py 新增廚房、不鏽鋼工作台、飯鍋、配菜盤(待建)
//   - 玩法設定:可在 src/config/ 新增 kitchen.js(訂單節奏、配方、時限)
//   - 任務:missions.js 新增 type: 'kitchen' 的 phase,並在 src/main.js 的 PHASES 註冊
// 介面同 OnboardPhase:init() / update(dt) / dispose() / dialog。

export class KitchenPhase {
  constructor(game, cfg) {
    this.g = game;
    this.cfg = cfg;
  }

  async init() {
    throw new Error('台鐵便當廚房尚在開發中');
  }

  update() { return { success: false, reason: '台鐵便當廚房尚在開發中' }; }

  dispose() {}
}
