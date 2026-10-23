// 101 燈光控制:夜間室內燈光 + 燈帶;跨年倒數時各節依序熄滅,零時閃光,煙火秀時隨節奏變色。
import * as THREE from 'three';

const GOLD = new THREE.Color(0xffc861);
const WARM = new THREE.Color(0xffe2b0);
const JADE = new THREE.Color(0x66ffd9);
const tmp = new THREE.Color();

export class TowerLights {
  constructor(tower) {
    this.secs = tower.userData.sections; // [基座, 第1~8節, 塔頂, 頂冠]
    this.segs = this.secs.filter((s) => s.seg);
    this.night = 0;
    this.nye = false;
  }

  setNight(n, nye) { this.night = n; this.nye = nye; }

  /** fw:煙火系統(取得倒數狀態與爆炸閃光)。 */
  update(t, fw) {
    const n = this.night;
    // 預設:室內燈光 + 玉綠色燈帶緩慢呼吸
    for (const s of this.secs) {
      s.glass.emissive.copy(WARM);
      s.glass.emissiveIntensity = n * 0.3;
    }
    this.segs.forEach((s, i) => {
      s.band.emissive.copy(this.nye ? GOLD : JADE);
      s.band.emissiveIntensity = n * (2.2 + Math.sin(t * 1.2 - i * 0.5) * 0.5);
    });
    if (!this.nye || !fw || !fw.active || n <= 0) return;

    const st = fw.status();
    if (st.phase === 'countdown') {
      if (st.remain > 10) {
        // 倒數前:彩虹色由下往上流動
        this.segs.forEach((s, i) => {
          tmp.setHSL((t * 0.15 - i * 0.08) % 1 < 0 ? ((t * 0.15 - i * 0.08) % 1) + 1 : (t * 0.15 - i * 0.08) % 1, 0.85, 0.6);
          s.band.emissive.copy(tmp);
          s.band.emissiveIntensity = 3;
          s.glass.emissive.copy(tmp).lerp(WARM, 0.6);
          s.glass.emissiveIntensity = 0.9;
        });
      } else {
        // 最後 10 秒:每秒熄一節(由上往下),剩下的亮成金色;換秒瞬間閃一下
        const lit = Math.ceil((st.remain * this.segs.length) / 10);
        const frac = st.remain - Math.floor(st.remain);
        const pulse = 1 + Math.max(0, frac - 0.75) * 4;
        this.segs.forEach((s, i) => {
          const on = i < lit;
          s.band.emissive.copy(GOLD);
          s.band.emissiveIntensity = on ? 4.5 * pulse : 0.05;
          s.glass.emissive.copy(on ? GOLD : WARM);
          s.glass.emissiveIntensity = on ? 1.3 * pulse : 0.06;
        });
        // 塔頂、頂冠與基座在倒數時轉暗,凸顯各節
        for (const s of this.secs) if (!s.seg) s.glass.emissiveIntensity = 0.15;
      }
    } else if (st.phase === 'show') {
      // 煙火施放時 101 本身不亮燈,只反射煙火的光
      for (const s of this.secs) s.glass.emissiveIntensity = 0;
      for (const s of this.segs) s.band.emissiveIntensity = 0;
    }
  }
}
