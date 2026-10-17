// 升遷後各職位的玩法階段(預留)。介面同 OnboardPhase:init() / update(dt) / dispose() / dialog。
// 實作某個職位時,把對應類別移到獨立檔案並替換 src/main.js 的 PHASES 註冊即可。
//
// 不良乘客 troublemaker:最底層。在車站做出不良行為(逃票、霸佔座位…)並躲避站長巡查,被抓 3 次會被強迫入職廚房
//                       → 與「站長」玩法共用車站場景,角色互換(一方抓、一方躲)
// 站務員 ticketing  :售票窗口介面、排隊人潮(搶票)、座位圖選位、找零/退票等結帳難題
//                       → 可沿用 cartCrew 的結帳機台 Canvas 介面與心算機制;車站場景用 platform_island.glb 延伸
// 站長 stationmaster :月台/閘門巡查、追逐逃票乘客(第三人稱移動)、對異常乘客依規定解除運送契約
//                       → 需要 StationPhase 的大型多月台車站場景(stations.js 的 layout)
// 行控人員 dispatch   :路線圖與時刻表(運行圖)編排、事故誤點時調整列車順序、以無線電與司機員溝通
//                       → 2D 運行圖介面為主,可用 DriverPhase 的行駛模型模擬列車
// 營運長 operations   :經營指標(營收、準點率、滿意度)、新增車站與路線規劃
//                       → 地圖式管理介面

function reserved(title) {
  return class {
    constructor(game, cfg) {
      this.g = game;
      this.cfg = cfg;
    }

    async init() { throw new Error(`${title}玩法尚在開發中`); }

    update() { return { success: false, reason: `${title}玩法尚在開發中` }; }

    dispose() {}
  };
}

export const TroublemakerPhase = reserved('不良乘客');
export const TicketingPhase = reserved('站務員');
export const StationmasterPhase = reserved('站長');
export const DispatchPhase = reserved('行控人員');
export const OperationsPhase = reserved('營運長');
