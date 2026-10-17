/**
 * constants.js
 * 全域列舉:車站形式、營運狀態、路線類型、走線方式、底圖清單、預設配色。
 * 純資料,地圖顯示與匯出共用。
 */

export const STATION_KINDS = {
    auto: '自動判定',
    normal: '一般站',
    terminal: '端點站',
    interchange: '轉乘站',
    'out-transfer': '站外轉乘站'
};

export const STATUSES = {
    open: '營運中',
    construction: '興建中',
    planned: '規劃中',
    closed: '停用/廢止'
};

export const LINE_TYPES = {
    metro: '捷運/地鐵',
    lrt: '輕軌',
    rail: '一般鐵路(台鐵)',
    hsr: '高速鐵路'
};

/** 各路線類型相對於全域線寬的倍率 */
export const LINE_TYPE_WIDTH = { metro: 1, lrt: 0.65, rail: 0.9, hsr: 1.15 };

export const WIDTH_SCALE = { thin: 0.7, normal: 1, thick: 1.4 };

export const ROUTE_MODES = {
    'diag-first': '先斜後直',
    'orth-first': '先直後斜',
    hv: '直角(先橫)',
    vh: '直角(先直)',
    straight: '直線',
    curve: '圓弧'
};

export const CORRIDOR_TYPES = {
    'in-station': '站內連通(單虛線)',
    'out-station': '站外轉乘(雙線)'
};

/** 標籤 8 方位 + 自動 */
export const LABEL_POSITIONS = ['NW', 'N', 'NE', 'W', 'auto', 'E', 'SW', 'S', 'SE'];

/**
 * 開源/政府開放底圖(免金鑰)。url 使用 Leaflet 樣板語法。
 * 皆已確認回應 Access-Control-Allow-Origin: *,可畫入 canvas 匯出。
 * (CARTO 自 2026 起需 API 金鑰,不再內建)
 * 想要「淡色路網底圖」:搭配 灰階 + 透明度 設定即可。
 */
export const BASEMAPS = {
    none: { name: '無底圖(純色背景)' },
    'nlsc-emap': {
        name: '國土測繪中心 通用版電子地圖',
        url: 'https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}',
        maxZoom: 20,
        attribution: '© 內政部國土測繪中心'
    },
    'nlsc-emap8': {
        name: '國土測繪中心 英文版電子地圖',
        url: 'https://wmts.nlsc.gov.tw/wmts/EMAP8/default/GoogleMapsCompatible/{z}/{y}/{x}',
        maxZoom: 20,
        attribution: '© 內政部國土測繪中心'
    },
    osm: {
        name: 'OpenStreetMap 標準',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    },
    'osm-hot': {
        name: 'OpenStreetMap 人道(HOT)',
        url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
        subdomains: 'abc', maxZoom: 19,
        attribution: '© OpenStreetMap contributors, HOT, OSM France'
    },
    opentopo: {
        name: 'OpenTopoMap 地形',
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        subdomains: 'abc', maxZoom: 17,
        attribution: '© OpenStreetMap contributors, SRTM © OpenTopoMap (CC-BY-SA)'
    }
};

/** 新增路線時的快速配色(近似台灣各系統常見色,非官方色票) */
export const COLOR_PRESETS = [
    { color: '#C48C31', hint: '棕(如文湖線)' },
    { color: '#E3002C', hint: '紅(如淡水信義線)' },
    { color: '#008659', hint: '綠(如松山新店線)' },
    { color: '#F8B61C', hint: '橘(如中和新蘆線)' },
    { color: '#0070BD', hint: '藍(如板南線)' },
    { color: '#FFDB00', hint: '黃(如環狀線)' },
    { color: '#8246AF', hint: '紫(如機場捷運)' },
    { color: '#E4007F', hint: '桃紅' },
    { color: '#8EC31F', hint: '黃綠' },
    { color: '#00A0E9', hint: '天藍' },
    { color: '#F26F21', hint: '橙(如高鐵)' },
    { color: '#333333', hint: '黑(如台鐵)' }
];

// =====================================================
// 指標設計(站名牌、方向指標、柱面站名、系統標誌)
// =====================================================

export const BADGE_SHAPES = {
    rounded: '圓角方',
    circle: '圓形',
    square: '方形',
    hexagon: '六角',
    diamond: '菱形'
};

export const SIGN_STRIPES = {
    bottom: '下緣色帶',
    top: '上緣色帶',
    left: '左側色帶',
    full: '路線色滿版',
    none: '無色帶'
};

export const SIGN_FONTS = {
    sans: { name: '黑體', css: "'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC', sans-serif" },
    serif: { name: '明體', css: "'Noto Serif TC', 'PMingLiU', 'Songti TC', serif" },
    round: { name: '圓體', css: "'Microsoft JhengHei UI', 'Yuanti TC', 'Noto Sans TC', sans-serif" }
};

/** 快速套用的整組配色(只改顏色/色帶/徽章,不動顯示開關) */
export const SIGN_PRESETS = {
    light: { name: '白底色帶', boardBg: '#FFFFFF', boardText: '#1B1C1F', subText: '#5F6168', stripe: 'bottom', badgeShape: 'rounded', dirBg: '#1B1C1F', dirText: '#FFFFFF' },
    dark: { name: '深色底', boardBg: '#1F2328', boardText: '#FFFFFF', subText: '#C9CDD2', stripe: 'left', badgeShape: 'circle', dirBg: '#1F2328', dirText: '#FFFFFF' },
    color: { name: '路線色滿版', boardBg: '#FFFFFF', boardText: '#FFFFFF', subText: '#F2F2F2', stripe: 'full', badgeShape: 'square', dirBg: '#24476B', dirText: '#FFFFFF' },
    minimal: { name: '簡約', boardBg: '#F5F2EA', boardText: '#1B1C1F', subText: '#6B6D73', stripe: 'top', badgeShape: 'hexagon', dirBg: '#F2B01E', dirText: '#1B1C1F' }
};

export const DEFAULT_SIGN_STYLE = {
    preset: 'light',
    ...SIGN_PRESETS.light,
    font: 'sans',
    showNumber: true,
    showSub: true,
    showLogo: true,
    showIcon: true,
    showNeighbors: true
};

export function defaultSigns() {
    return {
        systemName: '',
        systemNameEn: '',
        logo: null,              // { shapes: [...] }(100×100 座標)
        style: { ...DEFAULT_SIGN_STYLE },
        stationIcons: {}         // { [stationId]: { shapes: [...] } }
    };
}

export const DEFAULT_SETTINGS = {
    basemap: 'osm',
    bgColor: '#EDEAE2',
    basemapOpacity: 0.55,
    basemapGray: true,
    stationStyle: 'ring', // ring:白底色框 / dot:色點白框
    lineWidth: 6,
    labelSize: 13,
    showCodes: true,
    showLabels: true,
    showNumbers: true,
    title: '',
    subtitle: '',
    projectName: '未命名路網'
};
