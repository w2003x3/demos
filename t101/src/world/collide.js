// 飛行碰撞:城市大樓(格網加速)、地標、101 本體與地形。
import { halfWidthAt, CROWN_Y, SPIRE_TOP } from '../config.js?v=f1aef92';
import { terrainHeight } from './environment.js?v=f1aef92';
import { landmarkSolids } from './landmarks.js?v=f1aef92';
import { inPoly } from './xinyi.js?v=f1aef92';

export function makeCollider(boxes, polys = []) {
  const C = 120, grid = new Map();
  const key = (i, j) => i * 100003 + j;
  const put = (b) => {
    for (let i = Math.floor(b[0] / C); i <= Math.floor(b[2] / C); i++) {
      for (let j = Math.floor(b[1] / C); j <= Math.floor(b[3] / C); j++) {
        const k = key(i, j);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(b);
      }
    }
  };
  for (const b of boxes) put([b[0], b[1], b[2], b[3], b[4], '大樓']);
  for (const b of landmarkSolids()) put(b);
  for (const b of polys) put(b);
  const inside = (b, x, z, r) => x > b[0] - r && x < b[2] + r && z > b[1] - r && z < b[3] + r && (!b[6] || inPoly(x, z, b[6]) || r > 0.5 && (inPoly(x + r, z, b[6]) || inPoly(x - r, z, b[6]) || inPoly(x, z + r, b[6]) || inPoly(x, z - r, b[6])));
  const towerHw = (y) => (y < CROWN_Y ? halfWidthAt(y) : 3.6);
  return {
    /**
     * 撞到什麼:回傳 { name, box:[x0,z0,x1,z1,h] } 或 { name:'台北101', tower:true },沒撞到回傳 null。
     */
    hit(x, y, z, r = 0.6) {
      if (y < SPIRE_TOP) {
        const hw = towerHw(y);
        if (Math.abs(x) < hw + r && Math.abs(z) < hw + r) return { name: '台北101', tower: true, h: y < CROWN_Y ? CROWN_Y : SPIRE_TOP };
      }
      const list = grid.get(key(Math.floor(x / C), Math.floor(z / C)));
      if (list) for (const b of list) if (y < b[4] + r && inside(b, x, z, r)) return { name: b[5], box: b, h: b[4] };
      return null;
    },
    /** (x,z) 正下方最高的屋頂(不含 101),沒有則回傳 null。 */
    roofAt(x, z, r = 0) {
      const list = grid.get(key(Math.floor(x / C), Math.floor(z / C)));
      let best = null;
      if (list) for (const b of list) if ((!best || b[4] > best[4]) && inside(b, x, z, r)) best = b;
      return best;
    },
    ground(x, z) { return Math.max(0, terrainHeight(x, z)); }
  };
}
