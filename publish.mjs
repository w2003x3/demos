// 從各專案資料夾複製/打包可執行的網站檔案到本 repo,供 GitHub Pages 發布。
// 用法(在 D:\開發專案\作品展示 底下):node publish.mjs
// 之後 git add -A && git commit && git push 即更新網站。
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projects = path.resolve(here, '..');

// 輸出資料夾 ← 來源專案;files 為要複製的檔案/資料夾(相對於來源);redirect 為輸出資料夾首頁要導向的子路徑
const sites = [
  { out: 'route-map', src: '路網連連看', files: ['v2', 'v3'], redirect: 'v3/', exclude: /[\\/]tests($|[\\/])|\.blend$/ },
  { out: 'iron-rice-bowl', src: '火車便當', files: ['index.html', 'style.css', 'src', 'assets'] },
  { out: '3d-box', src: '3D紙箱', files: ['index.html', 'app.js', 'styles.css'] },
  { out: 'zhu-ying-tai', src: '注英台', files: ['index.html', 'styles.css', 'app.js', 'data'] },
  { out: 'muse-ripple', src: '一詞春水', build: true },
  { out: 'bang-bang-porkball', src: '20260613爆爆丸', files: ['index.html', '3d.html', 'css', 'js', 'assets', 'models'], exclude: /[\\/]models[\\/](Duck\.glb|models\.js)$|[\\/]assets[\\/]preview\.html$/ },
];

for (const s of sites) {
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
  if (s.redirect) {
    fs.writeFileSync(path.join(out, 'index.html'),
      `<!doctype html><meta charset="utf-8"><title>轉址中…</title>` +
      `<meta http-equiv="refresh" content="0; url=${s.redirect}"><a href="${s.redirect}">${s.redirect}</a>\n`);
  }
  console.log(`✓ ${s.out}  ←  ${s.src}`);
}
