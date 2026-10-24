# 作品展示

網址:<https://w2003x3.github.io/demos/>

| 作品 | 網址 |
|---|---|
| 🚇 路網連連看 v3 | <https://w2003x3.github.io/demos/route-map/v3/> |
| 🚇 路網連連看 v2(前一版) | <https://w2003x3.github.io/demos/route-map/v2/> |
| 🏙️ 台北101 攀登挑戰 | <https://w2003x3.github.io/demos/t101/> |
| 🍱 鐵飯碗 · 火車便當 | <https://w2003x3.github.io/demos/iron-rice-bowl/> |
| 📦 3D 紙箱生成器 | <https://w2003x3.github.io/demos/3d-box/> |
| 🔤 注英台 | <https://w2003x3.github.io/demos/zhu-ying-tai/> |
| 🌊 一詞春水 | <https://w2003x3.github.io/demos/muse-ripple/> |
| 💣 炸裂丸子 3D | <https://w2003x3.github.io/demos/bang-bang-porkball/3d.html> |
| 💣 炸裂丸子 2D | <https://w2003x3.github.io/demos/bang-bang-porkball/> |

這個 repo 只放**可以執行的網站檔案**,由 `publish.mjs` 從各專案的資料夾複製或打包產生,不要直接修改子資料夾內的檔案。

## 更新網站

各專案和本資料夾放在同一層(`D:\開發專案\`)。改完原始專案後:

```powershell
cd D:\開發專案\作品展示
node publish.mjs
git add -A
git commit -m "更新展示網站"
git push
```

推送後約 1 分鐘 GitHub Pages 會自動更新。

## 新增作品

在 `publish.mjs` 的 `sites` 加一筆(`out` 輸出資料夾、`src` 來源專案、`files` 要複製的檔案;Vite 專案改用 `build: true`,並把 `vite.config.js` 的 `base` 設為 `'./'`),再到 `index.html` 加一張卡片。
