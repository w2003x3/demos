// 飛行碰撞:城市大樓(格網加速)、地標、101 本體與地形。
import { halfWidthAt, CROWN_Y, SPIRE_TOP } from '../config.js';
import { terrainHeight } from './environment.js';
import { LANDMARK_SOLIDS } from './landmarks.js';

export function makeCollider(boxes) {
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
  for (const b of LANDMARK_SOLIDS) put(b);
  return {
    /** 回傳撞到的名稱,沒撞到回傳 null。 */
    hit(x, y, z, r = 0.6) {
      // 101 本體
      if (y < SPIRE_TOP) {
        const hw = y < CROWN_Y ? halfWidthAt(y) : 3.6;
        if (Math.abs(x) < hw + r && Math.abs(z) < hw + r) return '台北101';
      }
      const list = grid.get(key(Math.floor(x / C), Math.floor(z / C)));
      if (list) for (const b of list) if (y < b[4] + r && x > b[0] - r && x < b[2] + r && z > b[1] - r && z < b[3] + r) return b[5];
      return null;
    },
    ground(x, z) { return Math.max(0, terrainHeight(x, z)); }
  };
}
