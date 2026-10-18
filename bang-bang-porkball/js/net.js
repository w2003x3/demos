// ====================================================================
//  多人連線預留層(目前無伺服器環境,尚未實裝)
//
//  設計:伺服器權威(server-authoritative)+ 客戶端預測。
//  之後架好 WebSocket 伺服器時,實作 OnlineAdapter 並把 NET 換掉即可,
//  遊戲邏輯內的 NET.send(...) 呼叫點不需要改動。
//
//  預定協定(JSON 訊息):
//   client → server:
//     { t:'join',  room, name }                    // 加入房間
//     { t:'ready' }                                // 準備完成
//     { t:'input', frame, keys:{...} }             // 逐幀輸入(移動)
//     { t:'act',   frame, kind:'place'|'kick'|'tool'|..., data:{...} }
//     { t:'leave' }
//   server → client:
//     { t:'joined', id, room, players:[...] }
//     { t:'start',  seed, spawns:[...] }           // 同一亂數種子 → 同一張地圖
//     { t:'state',  frame, players, meatballs, items } // 權威狀態快照(定期)
//     { t:'event',  kind:'explode'|'pickup'|..., data:{...} }
//     { t:'end',    winner }
// ====================================================================

class NetAdapter {
  get isOnline() { return false; }
  connect() {}
  disconnect() {}
  send(_type, _payload) {}   // 單機模式:全部 no-op
  on(_type, _handler) {}
}

// 單機(目前使用)
class LocalAdapter extends NetAdapter {}

// 之後實裝範例:
// class OnlineAdapter extends NetAdapter {
//   constructor(url) { super(); this.ws = new WebSocket(url); ... }
//   get isOnline() { return true; }
//   send(t, payload) { this.ws.send(JSON.stringify({ t, ...payload })); }
// }

const NET = new LocalAdapter();
