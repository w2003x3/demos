// 室內映射(Interior Mapping):在窗戶後方以光線追蹤算出一個「房間」,
// 有後牆、側牆、地板、天花板燈與家具剪影,隨視角產生真實的立體視差;
// 夜晚時房間燈光從窗戶透出(乘上材質的 emissive 顏色與強度,白天強度為 0)。
import * as THREE from 'three';

const GLSL = /* glsl */ `
varying vec3 vIWPos;
varying vec3 vIWN;
uniform vec2 uCells;
uniform vec4 uWin;
uniform float uDepth;
uniform float uLit;
uniform float uSeed;
uniform float uStore;
uniform float uMullion;
float ihash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 17.13) * 43758.5453); }
vec3 interiorLight(vec2 uv) {
  vec2 g = uv * uCells;
  vec2 cell = floor(g);
  vec2 f = fract(g);
  if (f.x < uWin.x || f.x > uWin.y || f.y < uWin.z || f.y > uWin.w) return vec3(0.0);
  if (uMullion > 0.0 && abs(f.x - 0.5) < uMullion) return vec3(0.0);
  vec2 wf = vec2((f.x - uWin.x) / (uWin.y - uWin.x), (f.y - uWin.z) / (uWin.w - uWin.z));
  // 房間(1~3 格寬)與樓層狀態
  float span = 1.0 + floor(ihash(vec2(cell.y, 3.1)) * 3.0);
  float roomId = floor(cell.x / span);
  float floorMode = ihash(vec2(cell.y, 7.7 + floor(cell.x / 24.0)));
  float litP = uStore > 0.5 ? 0.97 : floorMode < 0.08 ? 0.9 : floorMode < 0.35 ? 0.04 : uLit;
  float h1 = ihash(vec2(roomId, cell.y));
  float on = step(h1, litP);
  // 視線轉到牆面座標
  vec3 N = normalize(vIWN);
  vec3 up = abs(N.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 T = normalize(cross(up, N));
  vec3 B = normalize(cross(N, T));
  vec3 V = normalize(vIWPos - cameraPosition);
  vec3 rd = vec3(dot(V, T), dot(V, B), max(dot(V, -N), 0.04) / uDepth);
  vec3 ro = vec3(wf * 2.0 - 1.0, -1.0);
  vec3 id = 1.0 / rd;
  vec3 k = abs(id) - ro * id;
  float t = min(min(k.x, k.y), k.z);
  vec3 hp = ro + rd * t;
  vec3 col;
  bool ceil = false;
  if (t == k.z) col = vec3(0.80, 0.77, 0.71);
  else if (t == k.y) { if (rd.y > 0.0) { col = vec3(0.92); ceil = true; } else col = vec3(0.40, 0.34, 0.28); }
  else col = vec3(0.64, 0.60, 0.56);
  // 燈光:天花板附近較亮,往裡面與往下漸暗
  float light = (0.42 + 0.58 * (hp.y * 0.5 + 0.5)) * (1.0 - 0.3 * (hp.z * 0.5 + 0.5));
  if (ceil && abs(hp.x) < 0.5 && abs(hp.z) < 0.55) col = vec3(3.2);
  // 家具與人影
  float fh = ihash(vec2(roomId + 5.0, cell.y));
  if (t == k.z && hp.y < -0.4 && abs(hp.x - (fh * 1.2 - 0.6)) < 0.38) col *= 0.32;
  if (fh > 0.82 && t == k.z && abs(hp.x + 0.35) < 0.1 && hp.y < 0.15) col *= 0.18;
  if (fh > 0.82 && t == k.z && length(vec2((hp.x + 0.35) * 1.4, hp.y - 0.25)) < 0.1) col *= 0.18;
  float tt = ihash(vec2(cell.y * 1.3, roomId * 1.7));
  vec3 tint = uStore > 0.5 ? vec3(1.0, 0.92, 0.78) : tt < 0.55 ? vec3(1.0, 0.80, 0.58) : tt < 0.85 ? vec3(1.0, 0.93, 0.82) : vec3(0.80, 0.88, 1.0);
  vec3 lit = col * tint * light * (0.55 + 0.6 * ihash(vec2(roomId, cell.y + 9.0)));
  // 窗簾:部分房間拉下窗簾,只透出柔和的光
  float cu = ihash(vec2(roomId + 11.0, cell.y));
  if (uStore < 0.5 && cu < 0.13 && wf.y > 1.0 - cu * 6.0) lit = tint * 0.42;
  vec3 dark = col * vec3(0.012, 0.016, 0.026);
  return mix(dark, lit, on);
}
`;

/**
 * 讓材質的窗戶顯示室內房間與燈光。
 * cells:每 1 單位 uv 有幾格窗(橫, 直);win:窗在格內的範圍 [x0, x1, y0, y1];
 * depth:房間深度;lit:亮燈比例;store:商場(幾乎全亮);mullion:格中央直料寬度。
 */
export function applyInterior(mat, { cells = [8, 8], win = [0.12, 0.88, 0.1, 0.88], depth = 1, lit = 0.55, seed = 1, store = false, mullion = 0 } = {}) {
  mat.emissiveMap = null;
  const key = `interior-${cells}-${win}-${depth}-${lit}-${seed}-${store}-${mullion}`;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCells = { value: new THREE.Vector2(cells[0], cells[1]) };
    sh.uniforms.uWin = { value: new THREE.Vector4(...win) };
    sh.uniforms.uDepth = { value: depth };
    sh.uniforms.uLit = { value: lit };
    sh.uniforms.uSeed = { value: seed };
    sh.uniforms.uStore = { value: store ? 1 : 0 };
    sh.uniforms.uMullion = { value: mullion };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vIWPos;\nvarying vec3 vIWN;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n  vec4 iwp = modelMatrix * vec4(transformed, 1.0);\n  vIWPos = iwp.xyz;\n  vIWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL)
      .replace('#include <emissivemap_fragment>', '#ifdef USE_MAP\n  totalEmissiveRadiance *= interiorLight(vMapUv);\n#endif');
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
  return mat;
}
