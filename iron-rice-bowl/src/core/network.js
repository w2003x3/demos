// 鈦鐵路網資料(assets/data/tw-rail.json,沿用「路網連連看」預設路網):司機員、行控、營運長共用。
// 載入時把路線名的「台鐵」改為「鈦鐵」。
let cache = null;

export async function loadNetwork() {
  if (!cache) {
    const r = await fetch('assets/data/tw-rail.json');
    if (!r.ok) throw new Error('無法載入路網資料');
    const d = await r.json();
    d.lines.forEach((l) => { l.name = l.name.replace(/台鐵|臺鐵/g, '鈦鐵'); });
    d.byId = Object.fromEntries(d.stations.map((s) => [s.id, s]));
    cache = d;
  }
  return cache;
}

/** 名稱結尾符合的路線(例:'西部幹線' → 鈦鐵西部幹線) */
export function findLine(net, name) {
  return net.lines.find((l) => l.name.endsWith(name)) || net.lines.find((l) => l.name.includes(name));
}

/** 路線上的車站(依序,略過特殊節點名稱含 '-' 的站) */
export function lineStations(net, line) {
  return line.nodes.filter((n) => n.type === 'station').map((n) => net.byId[n.id]).filter((s) => s && !s.name.includes('-'));
}

/** 起訖站之間的路徑(依站序,直線連接各站) → { pathLL, stops:[{id, idx}], stations } */
export function planLeg(net, line, fromName, toName) {
  const st = lineStations(net, line);
  const i = st.findIndex((s) => s.name === fromName), j = st.findIndex((s) => s.name === toName);
  if (i < 0 || j < 0 || i === j) return null;
  const seq = i < j ? st.slice(i, j + 1) : st.slice(j, i + 1).reverse();
  return {
    pathLL: seq.map((s) => ({ lat: s.lat, lng: s.lng })),
    stops: seq.map((s, k) => ({ id: s.id, idx: k })),
    stations: seq,
    forward: i < j,
  };
}

/** 兩點間的大圓距離(公尺) */
export function haversine(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
