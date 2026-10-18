// 寫實人物的姿勢與制服(rail-assets 的人物是靜態站姿網格,沒有骨架):
// - sitPose:腿在髖、膝各彎 90°(大腿水平、小腿垂直),前臂往前彎、手放在大腿上(座位乘客)
// - pushPose:雙臂往前抬、手肘微彎,握住推車把手(餐服員)
// - uniformTint:衣服染成制服色,皮膚保留原色
// 關節角度以 smoothstep 在關節上下漸變(類似骨架蒙皮),避免網格撕裂。
// 人物規格(rail-assets):身高 1.7 m、底面中心在原點、面向 -Z、Y 向上。
import * as THREE from 'three';

const HIP = 0.9, KNEE = 0.49, ELBOW = 1.06, SHOULDER = 1.4;   // 關節高度(1.7 m 人物)
const SEAT_HIP = 0.5;                                          // 坐下後髖關節高度(座墊約 0.45 m)
const deg = THREE.MathUtils.degToRad;

const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** 繞 X 軸(pivot y,z)旋轉 2D 點 [y,z];th > 0 時朝下的向量轉向前方(-Z) */
function rotX(p, py, pz, th) {
  const c = Math.cos(th), s = Math.sin(th), y = p[0] - py, z = p[1] - pz;
  p[0] = py + y * c - z * s;
  p[1] = pz + y * s + z * c;
}

/** 手臂與身體(或腿)的分界 |x|:取高度切片 [y0, y1] 中 |x| 分布最大的空隙 */
function armThreshold(geos, y0, y1, lo = 0.08, hi = 0.34, fallback = 0.19) {
  const xs = [];
  for (const g of geos) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > y0 && y < y1) xs.push(Math.abs(pos.getX(i)));
    }
  }
  xs.sort((a, b) => a - b);
  let best = 0, at = fallback;
  for (let i = 1; i < xs.length; i++) {
    if (xs[i - 1] < lo || xs[i] > hi) continue;
    const gap = xs[i] - xs[i - 1];
    if (gap > best) { best = gap; at = (xs[i] + xs[i - 1]) / 2; }
  }
  return at;
}

/**
 * 逐頂點變形:bend(x, y, z, p) 修改 p = [y, z] 並回傳繞 X 軸的總旋轉角(用來轉法線);
 * offset 為最後的整體位移 [dy, dz]。回傳新的 Group(新幾何、共用材質)。
 */
function deform(src, setup, bend, offset = [0, 0]) {
  src.updateMatrixWorld(true);
  const meshes = [];
  src.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const geos = meshes.map((m) => m.geometry.clone().applyMatrix4(m.matrixWorld));
  const ctx = setup(geos);
  const out = new THREE.Group();
  const p = [0, 0], n = [0, 0];
  geos.forEach((g, gi) => {
    const pos = g.attributes.position, nor = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      p[0] = pos.getY(i); p[1] = pos.getZ(i);
      const total = bend(x, p[0], p[1], p, ctx, gi, i);
      pos.setXYZ(i, x, p[0] + offset[0], p[1] + offset[1]);
      if (nor && total) {
        n[0] = nor.getY(i); n[1] = nor.getZ(i);
        rotX(n, 0, 0, total);
        nor.setXYZ(i, nor.getX(i), n[0], n[1]);
      }
    }
    pos.needsUpdate = true;
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, meshes[gi].material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.add(mesh);
  });
  return out;
}

/** 坐姿:原點在座位中心的地板上,臀部往後 0.19 m 靠椅背,面向 -Z。 */
export function sitPose(src) {
  const ELBOW_BEND = deg(68);
  return deform(src, (geos) => ({ armX: armThreshold(geos, 0.72, 0.86) }), (x, y, z, p, { armX }) => {
    if (Math.abs(x) > armX && y < ELBOW + 0.05 && y > 0.45) {
      // 前臂:繞手肘往前抬,手放到大腿上
      const th = ELBOW_BEND * smooth(ELBOW + 0.05, ELBOW - 0.05, y);
      rotX(p, ELBOW, 0, th);
      return th;
    }
    if (y < HIP + 0.07) {
      // 腿:先繞膝蓋把小腿往後折,再繞髖把整條腿往前抬
      const tk = -(Math.PI / 2) * smooth(KNEE + 0.05, KNEE - 0.05, y);
      const th = (Math.PI / 2) * smooth(HIP + 0.07, HIP - 0.07, y);
      rotX(p, KNEE, 0, tk);
      rotX(p, HIP, 0, th);
      return tk + th;
    }
    return 0;
  }, [-(HIP - SEAT_HIP), 0.19]);
}

/**
 * 手臂頂點(每個幾何一個 Uint8Array):從左右手肘最外側的頂點出發,沿三角形相連的頂點擴散,
 * 只走腋下以下(y < 1.2),所以不會跨到軀幹;手指即使貼近大腿也會被選到(兩者網格不相連)。
 * UV 接縫處同位置的重複頂點以座標合併。
 */
function armMasks(geos, upper) {
  return geos.map((g) => {
    const pos = g.attributes.position, n = pos.count;
    const mask = new Uint8Array(n);
    if (!g.index) return mask;
    const key = new Map(), id = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const k = `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
      if (!key.has(k)) key.set(k, key.size);
      id[i] = key.get(k);
    }
    const m = key.size, adj = Array.from({ length: m }, () => []), members = Array.from({ length: m }, () => []);
    for (let i = 0; i < n; i++) members[id[i]].push(i);
    const idx = g.index.array;
    for (let t = 0; t < idx.length; t += 3) {
      const a = id[idx[t]], b = id[idx[t + 1]], c = id[idx[t + 2]];
      adj[a].push(b, c); adj[b].push(a, c); adj[c].push(a, b);
    }
    // 起點:左右兩側在手肘高度最外側的頂點(一定在手臂上;姿勢不對稱時單一 |x| 門檻可能漏掉一隻手)
    const seen = new Uint8Array(m), stack = [];
    let li = -1, ri = -1;
    for (let i = 0; i < n; i++) {
      const y = pos.getY(i), x = pos.getX(i);
      if (y < 1.0 || y > 1.18) continue;
      if (x > 0 && (ri < 0 || x > pos.getX(ri))) ri = i;
      if (x < 0 && (li < 0 || x < pos.getX(li))) li = i;
    }
    for (const i of [li, ri]) if (i >= 0 && Math.abs(pos.getX(i)) > upper * 0.8 && !seen[id[i]]) { seen[id[i]] = 1; stack.push(id[i]); }
    while (stack.length) {
      const v = stack.pop();
      for (const i of members[v]) mask[i] = 1;
      for (const w of adj[v]) {
        if (seen[w]) continue;
        const i = members[w][0];
        if (pos.getY(i) > 1.2) continue;
        seen[w] = 1;
        stack.push(w);
      }
    }
    return mask;
  });
}

/** 推車姿勢:上臂往前抬 30°、手肘再彎 30°,手約在 0.95 m 高、身前 0.45 m(推車把手)。此模型無法分出手臂時回傳 null。 */
export function pushPose(src) {
  const ARM = deg(30), FORE = deg(30);
  let leaked = false;
  const setup = (geos) => {
    const upper = armThreshold(geos, 1.08, 1.26, 0.1, 0.3, 0.2);
    const masks = armMasks(geos, upper);
    // 手貼著臀部的模型,手臂與身體網格相連,擴散會漏到腿(指尖約 0.62 m,低於 0.55 m 即判定失敗)
    // 另外左右手都要選到手掌(低於 0.8 m),否則也判定失敗
    let left = false, right = false;
    geos.forEach((g, gi) => masks[gi].forEach((v, i) => {
      if (!v) return;
      const pos = g.attributes.position, y = pos.getY(i);
      if (y < 0.55) leaked = true;
      if (y < 0.8) { if (pos.getX(i) > 0) right = true; else left = true; }
    }));
    if (!left || !right) leaked = true;
    return { upper, masks };
  };
  const out = deform(src, setup, (x, y, z, p, { upper, masks }, gi, i) => {
    // 肩膀以下用連通的手臂頂點;肩部(漸變區)用 |x| 分界
    const arm = y < 1.2 ? masks[gi][i] : Math.abs(x) > upper;
    if (!arm || y > SHOULDER + 0.08) return 0;
    const te = FORE * smooth(ELBOW + 0.05, ELBOW - 0.05, y);
    const ts = ARM * smooth(SHOULDER + 0.08, SHOULDER - 0.1, y);
    rotX(p, ELBOW, 0, te);
    rotX(p, SHOULDER, 0, ts);
    return te + ts;
  });
  return leaked ? null : out;
}

/**
 * 制服:把材質貼圖中「不是皮膚」的顏色換成制服色(保留明暗紋理),皮膚(低彩度的橘紅色相)保留原色。
 * 回傳新材質;只用在身體材質(頭部、頭髮材質不要套)。
 */
export function uniformTint(material, color) {
  const m = material.clone();
  const c = new THREE.Color(color);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uniformColor = { value: c };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uniformColor;\nvoid main() {')
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 s = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));   // 回到 sRGB 判斷色相
        float mx = max(s.r, max(s.g, s.b)), mn = min(s.r, min(s.g, s.b));
        float sat = mx > 0.0 ? (mx - mn) / mx : 0.0;
        float hue = 0.0;
        if (mx > mn) {
          if (mx == s.r) hue = mod((s.g - s.b) / (mx - mn), 6.0) / 6.0;
          else if (mx == s.g) hue = ((s.b - s.r) / (mx - mn) + 2.0) / 6.0;
          else hue = ((s.r - s.g) / (mx - mn) + 4.0) / 6.0;
        }
        float skin = step(0.005, hue) * step(hue, 0.11) * smoothstep(0.12, 0.2, sat) * step(sat, 0.68) * step(0.25, mx) * step(s.b, s.g);
        float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 cloth = uniformColor * (0.45 + 2.2 * lum);
        diffuseColor.rgb = mix(cloth, diffuseColor.rgb, skin);
      }`);
  };
  m.customProgramCacheKey = () => `uniform-${c.getHexString()}`;
  return m;
}
