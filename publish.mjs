// 從各專案資料夾複製/打包可執行的網站檔案到本 repo,供 GitHub Pages 發布。
// 用法(在 D:\開發專案\作品展示 底下):node publish.mjs            全部
//                                        node publish.mjs t101 …   只更新指定的輸出資料夾(其他工作階段的改動不受影響)
// 之後 git add -A && git commit && git push 即更新網站。
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projects = path.resolve(here, '..');

// 輸出資料夾 ← 來源專案;files 為要複製的檔案/資料夾(相對於來源);redirect 為輸出資料夾首頁要導向的子路徑;after 為複製後的額外處理
const sites = [
  { out: 'route-map', src: '路網連連看', files: ['v2', 'v3'], redirect: 'v3/', exclude: /[\\/]tests($|[\\/])|\.blend$/ },
  { out: 't101', src: 'T101', files: ['index.html', 'style.css', 'src', 'assets'], stamp: true },
  { out: 'iron-rice-bowl', src: '火車便當', files: ['index.html', 'style.css', 'drive.css', 'src', 'assets'] },
  // 鐵道模型展示台:模型庫直接用路網連連看已發布的 assets/rail(同一份 rail-assets,不重複放 48 MB)
  { out: 'rail-showcase', src: '鐵路模型資源', files: ['viewer', 'adapters/three'], redirect: 'viewer/',
    after: (out) => {
      const f = path.join(out, 'viewer', 'index.html');
      fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('<script type="module" src="viewer.js"></script>',
        '<script>window.RAIL_BASE = "../../route-map/v3/assets/rail";</script>\n<script type="module" src="viewer.js"></script>'));
    } },
  { out: '3d-box', src: '3D紙箱', files: ['index.html', 'app.js', 'styles.css'] },
  { out: 'zhu-ying-tai', src: '注英台', files: ['index.html', 'styles.css', 'app.js', 'data'] },
  { out: 'muse-ripple', src: '一詞春水', build: true },
  { out: 'bang-bang-porkball', src: '20260613爆爆丸', files: ['index.html', '3d.html', 'css', 'js', 'assets', 'models', 'vendor'], exclude: /[\\/]models[\\/](Duck\.glb|models\.js)$|[\\/]assets[\\/](preview\.html|[^\\/]+\.(png|jpg)|定稿_[^\\/]+|標題_[^\\/]+)$/ },
];

const only = process.argv.slice(2);
const unknown = only.filter((o) => !sites.some((s) => s.out === o));
if (unknown.length) throw new Error(`沒有這個輸出資料夾:${unknown.join(', ')}`);

for (const s of sites) {
  if (only.length && !only.includes(s.out)) continue;
  const src = path.join(projects, s.src);
  const out = path.join(here, s.out);
  if (!fs.existsSync(src)) throw new Error(`找不到專案資料夾:${src}`);
  fs.rmSync(out, { recursive: true, force: true });

  if (s.build) {
    // Vite 專案:打包到輸出資料夾(vite.config.js 已設 base: './')
    if (!fs.existsSync(path.join(src, 'node_modules'))) execSync('npm install', { cwd: src, stdio: 'inherit' });
    execSync(`npx vite build --outDir "${out}" --emptyOutDir`, { cwd: src, stdio: 'inherit' });
  } else {
    fs.mkdirSync(out, { recursive: true });
    const filter = s.exclude ? (from) => !s.exclude.test(from) : undefined;
    for (const f of s.files) fs.cpSync(path.join(src, f), path.join(out, f), { recursive: true, filter });
  }
  if (s.after) s.after(out);
  if (s.stamp) stampVersion(src, out);
  if (s.redirect) {
    fs.writeFileSync(path.join(out, 'index.html'),
      `<!doctype html><meta charset="utf-8"><title>轉址中…</title>` +
      `<meta http-equiv="refresh" content="0; url=${s.redirect}"><a href="${s.redirect}">${s.redirect}</a>\n`);
  }
  console.log(`✓ ${s.out}  ←  ${s.src}`);
}

/**
 * 快取破壞:在 JS 模組的相對 import、index.html 的進入點與樣式、程式裡讀取的資料/音檔網址後面
 * 加上 ?v=<原始專案 git 版本>,讓瀏覽器在每次更新後一定抓到新檔(GitHub Pages 會快取 10 分鐘)。
 */
function stampVersion(src, out) {
  let v;
  try { v = execSync('git rev-parse --short HEAD', { cwd: src }).toString().trim(); } catch { v = Date.now().toString(36); }
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
  let n = 0;
  for (const f of walk(out)) {
    if (!/\.(js|mjs|html)$/.test(f)) continue;
    let t = fs.readFileSync(f, 'utf8');
    const before = t;
    t = t.replace(/((?:from|import)\s*\(?\s*['"])(\.{1,2}\/[^'"?]+?\.js)(['"])/g, `$1$2?v=${v}$3`);
    t = t.replace(/(src=["'])(src\/main\.js)(["'])/g, `$1$2?v=${v}$3`);
    t = t.replace(/(href=["']style\.css)(\?v=[^"']*)?(["'])/g, `$1?v=${v}$3`);
    t = t.replace(/(['"`]assets\/[^'"`?]+?\.(?:json|mp3))(['"`])/g, `$1?v=${v}$2`);
    t = t.replace(/(\$\{[^}]+\}\.mp3)(`)/g, `$1?v=${v}$2`);
    if (t !== before) { fs.writeFileSync(f, t); n++; }
  }
  console.log(`  版本戳記 ?v=${v}(${n} 個檔案)`);
}
