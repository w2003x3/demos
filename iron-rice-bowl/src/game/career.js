// 職涯:目前職位 + 在該職位期間的累積計數;每次任務結算後依 careerLadder.js 判定升遷 / 降調 / 開除。
// 存在瀏覽器 localStorage(單機存檔);存取失敗時(無痕模式等)仍可遊玩,只是不保存。
import { RANKS, START_RANK, rankById } from '../config/careerLadder.js';

const KEY = 'trainBento.career.v2';

/** 多算金額後,事後被客訴的機率。 */
export const OVERCHARGE_COMPLAINT_CHANCE = 0.5;

const fresh = () => ({
  rank: START_RANK,
  stats: {},     // 在目前職位期間的累積計數(換職位歸零)
  missions: 0,   // 生涯總任務數
  history: [],   // [{ from, to, kind: 'promote'|'demote', reason }]
  reached: [START_RANK], // 曾經擔任過的職位(選單只揭露這些職位,其餘顯示未知)
});

export class Career {
  constructor() {
    this.data = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...fresh(), ...JSON.parse(raw) };
    } catch { /* 無法讀取存檔 → 使用新紀錄 */ }
    // 舊存檔沒有 reached:由人事紀錄與目前職位補齊
    const titleToId = Object.fromEntries(RANKS.map((r) => [r.title, r.id]));
    const set = new Set(this.data.reached || []);
    set.add(this.data.rank);
    for (const h of this.data.history || []) { if (titleToId[h.from]) set.add(titleToId[h.from]); if (titleToId[h.to]) set.add(titleToId[h.to]); }
    this.data.reached = [...set];
  }

  /** 是否已到達(揭露)該職位。 */
  knows(id) { return this.data.reached.includes(id); }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* 忽略 */ }
  }

  reset() {
    this.data = fresh();
    this.save();
  }

  get rank() { return rankById(this.data.rank); }
  get rankIndex() { return RANKS.indexOf(this.rank); }
  get lastChange() { return this.data.history.at(-1) || null; }

  /** 規則進度(0~1)供 UI 顯示。 */
  progress(block) {
    if (!block) return [];
    return Object.entries(block.rules).map(([k, r]) => {
      const v = this.data.stats[k] || 0;
      return { key: k, label: r.label, unit: r.unit, value: v, limit: r.limit, ratio: Math.min(1, v / r.limit) };
    });
  }

  /**
   * 結算一次任務。delta = 本次任務在目前職位規則上的增量(由玩法階段回報)。
   * 先判降調(任一條件),再判升遷(全部條件)。回傳 { kind, from, to, reason } 或 null。
   */
  apply(delta) {
    const d = this.data;
    d.missions++;
    for (const [k, v] of Object.entries(delta || {})) d.stats[k] = (d.stats[k] || 0) + v;
    const rank = this.rank;
    let change = null;
    if (rank.demote) {
      const hit = Object.entries(rank.demote.rules).find(([k, r]) => (d.stats[k] || 0) >= r.limit);
      if (hit) {
        const [k, r] = hit;
        change = { kind: 'demote', reason: `${r.label}達 ${d.stats[k]}${r.unit}(門檻 ${r.limit})`, block: rank.demote };
      }
    }
    if (!change && rank.promote && Object.entries(rank.promote.rules).every(([k, r]) => (d.stats[k] || 0) >= r.limit)) {
      change = { kind: 'promote', reason: '升遷條件全部達成', block: rank.promote };
    }
    if (change) {
      const to = rankById(change.block.to);
      const rec = { from: rank.title, to: to.title, kind: change.kind, verb: change.block.verb, reason: change.reason, clear: !!to.clear };
      d.history.push(rec);
      d.rank = to.id;
      if (!d.reached.includes(to.id)) d.reached.push(to.id);
      d.stats = {};
      this.save();
      return rec;
    }
    this.save();
    return null;
  }
}
