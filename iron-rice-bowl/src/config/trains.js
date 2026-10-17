// 車種定義(資料驅動):新增車種 = 在 Blender 腳本產出該車種模型 + 在此新增一筆設定。
// 座標單位公尺;X = 行進方向,Z = 側向,Y = 上(車廂地板面 y = 0,軌面 y = -1.1)。

export const TRAIN_TYPES = {
  EMU3000: {
    id: 'EMU3000',
    name: '新自強號 EMU3000',
    carsInSet: 12,
    carLength: 20.0,        // 車體長
    gangway: 0.5,           // 兩車間貫通道 → 車廂間距 20.5 m
    models: {
      car: 'emu3000_car.glb',
      seat: 'emu3000_seat_pair.glb',
    },
    interior: {
      partitionX: 8.6,      // 客室/玄關隔間(自動門)距車廂中心
      seatRows: 16,
      seatPitch: 1.0,
      firstRowX: -7.6,
      seatPairZ: 0.82,      // 兩人座中心距走道中心
      seatOffset: 0.25,     // 單一座位距兩人座中心
      displayY: 2.1,        // 車內資訊顯示器高度
    },
    maxSpeed: 33,           // m/s(畫面速度,約 120 km/h)
    accel: 1.1,             // m/s²
  },
  // 預留範例(尚無模型):
  // TEMU2000: { id: 'TEMU2000', name: '普悠瑪號', models: { car: 'temu2000_car.glb', seat: '...' }, ... },
  // E1000:    { id: 'E1000', name: '推拉式自強號', ... },
};
