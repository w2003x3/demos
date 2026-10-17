// 車站資料。`layout` 為「大型多月台車站」場景預留(StationPhase 使用),
// 目前內容為示意,實作轉乘任務時請依實際車站配置校正。

export const STATIONS = {
  taipei: {
    zh: '臺北', en: 'Taipei', major: true,
    layout: {
      // 每座島式月台由 platform_island.glb 模組(20 m)平鋪而成;tracks 為兩側股道
      platforms: [
        { id: '1', type: 'island', tracks: ['1A', '1B'], lengthM: 300 },
        { id: '2', type: 'island', tracks: ['2A', '2B'], lengthM: 300 },
        { id: '3', type: 'island', tracks: ['3A', '3B'], lengthM: 300 },
        { id: '4', type: 'island', tracks: ['4A', '4B'], lengthM: 300 },
      ],
      platformSpacingM: 12,     // 月台中心間距(含兩股道)
      concourse: 'underground', // 月台間經由地下穿堂層移動
    },
  },
  hsinchu: { zh: '新竹', en: 'Hsinchu', major: true },
  songshan: { zh: '松山', en: 'Songshan' },
  nangang: { zh: '南港', en: 'Nangang' },
  ruifang: { zh: '瑞芳', en: 'Ruifang' },
  yilan: { zh: '宜蘭', en: 'Yilan' },
  luodong: { zh: '羅東', en: 'Luodong' },
  suaoxin: { zh: '蘇澳新', en: 'Su’aoxin' },
  hualien: { zh: '花蓮', en: 'Hualien', major: true },
  yuli: { zh: '玉里', en: 'Yuli' },
  chishang: { zh: '池上', en: 'Chishang' },
  guanshan: { zh: '關山', en: 'Guanshan' },
  taitung: { zh: '臺東', en: 'Taitung', major: true },
};
