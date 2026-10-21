// 營運長經營模型(純運算):每季依路網、班次、票價、便當菜單計算運量、營收、成本與旅客滿意度。
// 金額單位:元(介面顯示為「億」);時間:季(90 天)。
import { MAJOR_STATIONS, COO_BENTOS } from '../config/coo.js';

const DAYS = 90, HOURS = 18, CAP = 900;
const FARE_PER_TRIP = 38;            // 平均每趟票收(票價倍率 1.0)
const TRAIN_KM_COST = 95;            // 每列車公里營運成本
const STATION_COST = 2.5e6;          // 每站每季人事與維護
const FIXED_COST = 6.5e8;            // 總部與其他固定成本 / 季
export const CAPEX = { station: 2e8, lineKm: 5e7, lineStation: 1.2e8 };
const SEASON = [1.06, 0.96, 1.04, 1.0];   // Q1 春節、Q2 淡季、Q3 暑假、Q4

const dist = (a, b) => {   // 公里
  const R = 6371, t = Math.PI / 180;
  const dLat = (b.lat - a.lat) * t, dLng = (b.lng - a.lng) * t;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
export { dist };

export class CooSim {
  /** net:loadNetwork() 的路網(會複製);level:COO_LEVELS 的一項 */
  constructor(net, level) {
    this.L = level;
    this.q = 0;                       // 已結算的季數
    this.stations = net.stations.map((s) => ({ ...s, isNew: false }));
    this.byId = Object.fromEntries(this.stations.map((s) => [s.id, s]));
    this.lines = net.lines.filter((l) => l.type === 'rail').map((l) => ({ ...l, nodes: l.nodes.filter((n) => n.type === 'station' && !this.byId[n.id]?.name.includes('-')), isNew: false }));
    this.freq = Object.fromEntries(this.lines.map((l) => [l.id, l.nodes.length >= 20 ? 3 : 2]));
    this.fare = 1.0;
    this.menu = [{ id: 'pork', price: 80 }, { id: 'chicken', price: 100 }, { id: 'veg', price: 80 }];
    this.projects = [];               // { kind, name, cost, quarter, open, ... }
    this.capexUsed = 0;
    this.installments = [];           // 每季要攤提的建設費
    this.history = [];
    this.sat = 72;
    this.seq = 1;
  }

  // ---------------------------------------------------------------- 決策
  lineLength(l) { let km = 0; for (let i = 1; i < l.nodes.length; i++) km += dist(this.byId[l.nodes[i - 1].id], this.byId[l.nodes[i].id]); return km; }
  budgetLeft() { return this.L.budget * 1e8 - this.capexUsed; }

  /** 在既有路線上加站:找離點擊處最近的站間區段(3 公里內) */
  planStation(lat, lng, name) {
    let best = null;
    for (const l of this.lines) for (let i = 1; i < l.nodes.length; i++) {
      const a = this.byId[l.nodes[i - 1].id], b = this.byId[l.nodes[i].id];
      const p = projectOn(a, b, { lat, lng });
      const d = dist(p, { lat, lng });
      if (!best || d < best.d) best = { l, i, d, p };
    }
    if (!best || best.d > 3) return { error: '離鈦鐵路線太遠(需在 3 公里內)' };
    if (CAPEX.station > this.budgetLeft()) return { error: '建設預算不足' };
    const s = { id: `n${this.seq++}`, lat: best.p.lat, lng: best.p.lng, name: name || `新站${this.seq}`, sub: '', isNew: true, opensAt: this.q + 1, line: best.l.id };
    this.stations.push(s); this.byId[s.id] = s;
    best.l.nodes.splice(best.i, 0, { type: 'station', id: s.id });
    this._spend(CAPEX.station, s.id);
    this.projects.push({ kind: 'station', name: s.name, cost: CAPEX.station, quarter: this.q + 1, id: s.id, line: best.l.name });
    return { station: s, line: best.l };
  }

  /** 新路線:pts = [{lat,lng,stationId?, name?}](沿用既有車站或新設站) */
  planLine(pts, name, color = '#e8730c') {
    if (pts.length < 2) return { error: '新路線至少要兩個站' };
    const nodes = [];
    let newSt = 0;
    const draft = [];
    for (const p of pts) {
      if (p.stationId) { nodes.push({ type: 'station', id: p.stationId }); continue; }
      const s = { id: `n${this.seq++}`, lat: p.lat, lng: p.lng, name: p.name || `新站${this.seq}`, sub: '', isNew: true, opensAt: this.q + 1 };
      draft.push(s); nodes.push({ type: 'station', id: s.id }); newSt++;
    }
    let km = 0;
    const get = (id) => this.byId[id] || draft.find((s) => s.id === id);
    for (let i = 1; i < nodes.length; i++) km += dist(get(nodes[i - 1].id), get(nodes[i].id));
    const cost = km * CAPEX.lineKm + newSt * CAPEX.lineStation;
    if (cost > this.budgetLeft()) return { error: `建設預算不足(需 ${(cost / 1e8).toFixed(1)} 億)` };
    draft.forEach((s) => { this.stations.push(s); this.byId[s.id] = s; });
    const line = { id: `nl${this.seq++}`, name: name || '鈦鐵新線', color, type: 'rail', nodes, isNew: true, opensAt: this.q + 1 };
    this.lines.push(line);
    this.freq[line.id] = 2;
    this._spend(cost, line.id);
    this.projects.push({ kind: 'line', name: line.name, cost, quarter: this.q + 1, id: line.id, km, stations: newSt });
    return { line, km, cost };
  }

  /** 取消本季剛規劃(還沒開工)的建設,退回預算 */
  cancel(projectId) {
    const p = this.projects.find((x) => x.id === projectId && x.quarter === this.q + 1);
    if (!p) return false;
    this.projects = this.projects.filter((x) => x !== p);
    this.capexUsed -= p.cost;
    this.installments = this.installments.filter((x) => x.id !== p.id);
    if (p.kind === 'station') {
      this.lines.forEach((l) => { l.nodes = l.nodes.filter((n) => n.id !== p.id); });
      this.stations = this.stations.filter((s) => s.id !== p.id); delete this.byId[p.id];
    } else {
      const l = this.lines.find((x) => x.id === p.id);
      this.lines = this.lines.filter((x) => x !== l);
      for (const n of l.nodes) if (this.byId[n.id]?.isNew && this.byId[n.id].opensAt === this.q + 1 && !this.lines.some((o) => o.nodes.some((m) => m.id === n.id))) { this.stations = this.stations.filter((s) => s.id !== n.id); delete this.byId[n.id]; }
    }
    return true;
  }

  /** 建設費分 4 季攤提(從本季開始) */
  _spend(cost, id) {
    this.capexUsed += cost;
    for (let k = 0; k < 4; k++) this.installments.push({ q: this.q + 1 + k, amount: cost / 4, id });
  }

  // ---------------------------------------------------------------- 結算一季
  open(s) { return !s.isNew || s.opensAt <= this.q + 1; }

  simulate(peek = false) {
    const q = this.q, L = this.L;
    const season = SEASON[q % 4];
    const lineOf = new Map();
    for (const l of this.lines) for (const n of l.nodes) if (!lineOf.has(n.id)) lineOf.set(n.id, l);
    const transfers = new Map();
    for (const l of this.lines) for (const n of l.nodes) transfers.set(n.id, (transfers.get(n.id) || 0) + 1);
    const g = (f) => (1 - Math.exp(-f / 2.5)) / (1 - Math.exp(-3 / 2.5));
    const fareF = Math.pow(this.fare, -0.6);
    const satF = 0.85 + 0.3 * (this.sat / 100 - 0.7);
    // 熱點:由附近已啟用車站分攤(距離越近分越多)
    const hotStation = new Map();
    let hotTotal = 0, hotCaught = 0;
    for (const h of L.hotspots || []) {
      hotTotal += h.demand;
      const near = this.stations.filter((s) => this.open(s) && lineOf.has(s.id)).map((s) => ({ s, d: dist(s, h) })).filter((x) => x.d < h.r);
      const w = near.map((x) => 1 - x.d / h.r), sw = w.reduce((a, b) => a + b, 0);
      if (!sw) continue;
      const share = Math.min(1, sw) * h.demand;
      hotCaught += share;
      near.forEach((x, i) => hotStation.set(x.s.id, (hotStation.get(x.s.id) || 0) + share * w[i] / sw));
    }
    // 各線運量
    const perLine = new Map();
    let riders = 0;
    for (const s of this.stations) {
      if (!this.open(s) || !lineOf.has(s.id)) continue;
      const l = lineOf.get(s.id);
      if (l.isNew && l.opensAt > q + 1) continue;
      let D = MAJOR_STATIONS.includes(s.name) ? 9000 : s.isNew ? 1500 : 1800;
      if ((transfers.get(s.id) || 0) >= 2) D *= 1.3;
      D += hotStation.get(s.id) || 0;
      const tour = (L.tourism || []).some((t) => l.name.endsWith(t)) ? (q % 4 === 2 ? 1.35 : 1.15) : 1;
      const r = D * g(this.freq[l.id] || 2) * fareF * satF * season * tour;
      riders += r;
      perLine.set(l.id, (perLine.get(l.id) || 0) + r);
    }
    const ridersQ = riders * DAYS;
    // 便當:吸引力 × 價格因素;品項越多、越有特色,購買率越高
    const tourShare = [...perLine.entries()].filter(([id]) => (L.tourism || []).some((t) => this.lines.find((l) => l.id === id)?.name.endsWith(t))).reduce((a, [, v]) => a + v, 0) / Math.max(1, riders);
    const items = this.menu.map((m) => {
      const b = COO_BENTOS.find((x) => x.id === m.id);
      const pf = Math.exp(-1.6 * (m.price / b.ref - 1));
      const ap = b.appeal * (b.east ? 1 + 0.6 * tourShare : 1);
      return { b, m, pull: ap * pf };
    });
    const pull = items.reduce((a, x) => a + x.pull, 0);
    const attach = items.length ? Math.min(0.16, 0.035 + 0.03 * Math.sqrt(items.length) * (pull / items.length)) : 0;
    const bentoSold = ridersQ * attach;
    const margin = items.length ? items.reduce((a, x) => a + x.pull * (x.m.price - x.b.cost), 0) / pull : 0;
    const bentoRev = bentoSold * (items.length ? items.reduce((a, x) => a + x.pull * x.m.price, 0) / pull : 0);
    const bentoProfit = bentoSold * margin;
    // 成本
    let trainKm = 0;
    for (const l of this.lines) { if (l.isNew && l.opensAt > q + 1) continue; trainKm += this.lineLength(l) * (this.freq[l.id] || 2) * 2 * HOURS * DAYS; }
    const nSt = this.stations.filter((s) => this.open(s) && lineOf.has(s.id)).length;
    const capex = this.installments.filter((x) => x.q === q + 1).reduce((a, x) => a + x.amount, 0);
    const fareRev = ridersQ * FARE_PER_TRIP * this.fare;
    const opCost = trainKm * TRAIN_KM_COST + nSt * STATION_COST + FIXED_COST;
    const profit = fareRev + bentoProfit - opCost - capex;
    // 滿意度
    let crowdW = 0, crowdS = 0, freqS = 0;
    for (const l of this.lines) {
      const r = perLine.get(l.id) || 0; if (!r) continue;
      const f = this.freq[l.id] || 2;
      const ratio = r / (f * HOURS * 2 * CAP * 2.2);
      crowdS += r * Math.max(0, Math.min(100, 100 - Math.max(0, ratio - 0.8) * 80));
      freqS += r * Math.min(100, 40 + 12 * f);
      crowdW += r;
    }
    const freqScore = crowdW ? freqS / crowdW : 60, crowdScore = crowdW ? crowdS / crowdW : 60;
    const fareScore = Math.max(0, Math.min(100, 75 - (this.fare - 1) * 90));
    const avgAppeal = items.length ? items.reduce((a, x) => a + x.b.appeal, 0) / items.length : 0;
    const priceRatio = items.length ? items.reduce((a, x) => a + x.m.price / x.b.ref, 0) / items.length : 1;
    const bentoScore = items.length ? Math.max(0, Math.min(100, 50 + 12 * Math.min(4, items.length) + 40 * (avgAppeal - 1) - 60 * Math.max(0, priceRatio - 1) + 20 * Math.max(0, 1 - priceRatio))) : 20;
    const coverage = hotTotal ? 60 + 40 * hotCaught / hotTotal : 75;
    const sat = Math.max(0, Math.min(100, 0.3 * freqScore + 0.25 * crowdScore + 0.2 * fareScore + 0.15 * bentoScore + 0.1 * coverage));
    const out = {
      q: q + 1, riders: ridersQ, fareRev, bentoRev, bentoProfit, bentoSold, opCost, capex, profit, sat,
      scores: { freq: freqScore, crowd: crowdScore, fare: fareScore, bento: bentoScore, coverage },
      hotCaught, hotTotal, season,
    };
    if (peek) return out;
    this.sat = sat;
    this.history.push(out);
    this.q++;
    return out;
  }

  summary() {
    const h = this.history;
    const newLines = this.projects.filter((p) => p.quarter <= this.q).length;
    return {
      quarters: h, newLines,
      profitable: h.filter((x) => x.profit > 0).length, loss: h.filter((x) => x.profit <= 0).length,
      happy: h.filter((x) => x.sat >= 85).length, unhappy: h.filter((x) => x.sat < 60).length,
      totalProfit: h.reduce((a, x) => a + x.profit, 0),
    };
  }
}

/** 點 p 在線段 ab 上的投影(經緯度近似平面) */
function projectOn(a, b, p) {
  const kx = Math.cos(a.lat * Math.PI / 180);
  const ax = a.lng * kx, ay = a.lat, bx = b.lng * kx, by = b.lat, px = p.lng * kx, py = p.lat;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0.05, Math.min(0.95, ((px - ax) * dx + (py - ay) * dy) / L2));
  return { lat: ay + dy * t, lng: (ax + dx * t) / kx };
}
