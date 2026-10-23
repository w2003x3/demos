// 地標實際位置(由經緯度換算,101 = 原點;東 = +X、北 = -Z;單位公尺)。
// 101:25.0340N 121.5645E;每經度約 100,880 m、每緯度約 110,574 m。
const LAT0 = 25.034, LON0 = 121.5645, KX = 100880, KZ = 110574;
export const ll = (lat, lon) => ({ x: Math.round((lon - LON0) * KX), z: Math.round(-(lat - LAT0) * KZ) });

export const GEO = {
  sunYatSen: { name: '國父紀念館', ...ll(25.0400, 121.5602) },
  dome: { name: '台北大巨蛋', ...ll(25.0438, 121.5605) },
  nanshan: { name: '南山廣場', ...ll(25.0332, 121.5658) },
  shinkong: { name: '新光摩天大樓', ...ll(25.0458, 121.5149) },
  station: { name: '台北車站', ...ll(25.0478, 121.5170) },
  cks: { name: '中正紀念堂', ...ll(25.0346, 121.5218) },
  grandHotel: { name: '圓山大飯店', ...ll(25.0789, 121.5262) },
  airport: { name: '松山機場', ...ll(25.0694, 121.5525) },
  elephant: { name: '象山', ...ll(25.0273, 121.5765) },
  tiger: { name: '虎山', ...ll(25.0377, 121.5843) },
  leopard: { name: '豹山', ...ll(25.0318, 121.5818) },
  lion: { name: '獅山', ...ll(25.0290, 121.5800) },
  qixing: { name: '七星山', ...ll(25.1717, 121.5531) },
  maokong: { name: '貓空', ...ll(24.9680, 121.5880) },
  taozhu: { name: '陶朱隱園', ...ll(25.0386, 121.5701) }
};

/** 用 OpenStreetMap 下載到的地標座標覆蓋(名稱對得上才換)。 */
export function applyOsmLandmarks(list) {
  if (!list) return;
  const map = {
    // 只採用名稱不會和捷運站重複的地標
    dome: /大巨蛋/, nanshan: /南山廣場/, shinkong: /新光.*摩天/, station: /^臺北車站$/, grandHotel: /圓山大飯店/, airport: /松山機場/
  };
  for (const [k, re] of Object.entries(map)) {
    const hit = list.find((l) => re.test(l.name));
    if (hit) { GEO[k].x = Math.round(hit.xz[0]); GEO[k].z = Math.round(hit.xz[1]); }
  }
}

/** 用街景資料中的建築外框中心校正地標位置(比單點座標準確)。 */
export function applyOsmBuildings(buildings) {
  if (!buildings) return;
  const map = { sunYatSen: /^國父紀念館$/, dome: /^臺北大巨蛋$/, taozhu: /^陶朱隱園$/ };
  for (const [k, re] of Object.entries(map)) {
    const b = buildings.find((bb) => bb.n && re.test(bb.n));
    if (!b) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of b.p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    GEO[k].x = Math.round((x0 + x1) / 2); GEO[k].z = Math.round((z0 + z1) / 2);
  }
}

// 河流:淡水河(西,約 121.505E)、基隆河(北,約 25.075N)
export const RIVERS = { tamsuiX: ll(25.04, 121.5040).x, keelungZ: ll(25.0760, 121.56).z };
