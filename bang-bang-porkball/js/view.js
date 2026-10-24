// ====================================================================
//  2D / 3D 畫面切換(同一頁、同一場遊戲)
//  遊戲模擬只有一份(game.js);切換只是換「誰來畫」:
//    2D = canvas#game(game.js 的 draw)  3D = three.js(js/render3d.js,畫在 #game3d)
//  3D 程式與模型(約 22MB)第一次切到 3D 才下載,並顯示進度;之後切換是即時的。
//  網址 ?view=3d 可直接以 3D 開啟;選擇會記在瀏覽器。
// ====================================================================
const VIEW = (() => {
  const V = '20261025h';
  // 3D 需要的腳本(依序執行);size 是大約大小,用來估算進度
  const SCRIPTS_3D = [
    ['assets/atlas.js', 350e3],
    ['models/map_models.js', 13.9e6],
    ['models/char_models.js?v=' + V, 5.3e6],
    ['models/extra_models.js?v=' + V, 0.78e6],
    ['vendor/three.min.js', 0.6e6],
    ['vendor/OrbitControls.js', 30e3],
    ['vendor/GLTFLoader.js', 100e3],
    ['vendor/SkeletonUtils.js', 10e3],
    ['js/render3d.js?v=' + V, 90e3],
  ];
  const total = SCRIPTS_3D.reduce((s, x) => s + x[1], 0);
  let loaded3d = false, loading = null;

  const V3 = {
    mode: '2d',
    set(mode) {
      if (mode === this.mode && (mode === '2d' || loaded3d)) return;
      if (mode === '3d' && !loaded3d) { load3d(); return; }
      apply(mode);
    },
    toggle() { this.set(this.mode === '3d' ? '2d' : '3d'); },
  };

  function apply(mode) {
    V3.mode = mode;
    document.body.classList.toggle('mode-3d', mode === '3d');
    document.querySelectorAll('[data-view]').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === mode);
      b.setAttribute('aria-pressed', b.dataset.view === mode ? 'true' : 'false');
    });
    try { localStorage.setItem('bbw.view', mode); } catch { /* 無痕模式 */ }
    window.dispatchEvent(new Event('resize')); // 讓 3D 畫面依新尺寸重設
  }

  // 依序下載並執行 3D 腳本,顯示進度
  function load3d() {
    if (loading) return loading;
    const box = document.getElementById('load3d');
    const bar = box && box.querySelector('.load3d-fill');
    const txt = box && box.querySelector('.load3d-text');
    if (box) box.classList.remove('hidden');
    V3.busy = true; // 單機時載入期間暫停遊戲(game.js 會看這個旗標)
    let done = 0;
    const show = (part) => {
      const p = Math.min(1, (done + part) / total);
      if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
      if (txt) txt.textContent = `載入 3D 素材… ${Math.round(p * 100)}%`;
    };
    loading = (async () => {
      try {
        for (const [url, size] of SCRIPTS_3D) {
          if (url.startsWith('js/render3d')) apply('3d'); // 3D 畫面要先顯示,渲染器才量得到尺寸
          const res = await fetch(url);
          if (!res.ok) throw new Error(url + ' ' + res.status);
          let text;
          if (res.body && res.body.getReader) {
            const reader = res.body.getReader(), chunks = [];
            let got = 0;
            for (;;) {
              const { done: end, value } = await reader.read();
              if (end) break;
              chunks.push(value); got += value.length;
              show(Math.min(got, size));
            }
            text = new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
          } else {
            text = await res.text();
          }
          const s = document.createElement('script');
          s.textContent = text + '\n//# sourceURL=' + url;
          document.body.appendChild(s);
          done += size; show(0);
          await new Promise((r) => setTimeout(r, 0)); // 讓畫面有機會更新進度
        }
        loaded3d = true;
        apply('3d');
      } catch (e) {
        console.error(e);
        if (txt) txt.textContent = '3D 素材載入失敗,請重新整理再試';
        apply('2d');
        loading = null;
        V3.busy = false;
        setTimeout(() => box && box.classList.add('hidden'), 2500);
        return;
      }
      V3.busy = false;
      if (box) box.classList.add('hidden');
    })();
    return loading;
  }

  // 切換按鈕(頂部列、主選單)
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-view]');
    if (!b) return;
    e.preventDefault();
    V3.set(b.dataset.view);
    b.blur();
  });
  // V 鍵以外沒有對應按鍵(V 是藍白拖);用 Tab 旁的 ` 鍵快速切換
  window.addEventListener('keydown', (e) => {
    if (e.key === '`' && !(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) V3.toggle();
  });

  // 初始模式:網址 ?view= > 上次的選擇 > 2D
  let want = new URLSearchParams(location.search).get('view');
  if (!want) { try { want = localStorage.getItem('bbw.view'); } catch { /* 無痕模式 */ } }
  apply('2d');
  if (want === '3d') V3.set('3d');
  return V3;
})();
// 其他檔案用 window.VIEW 判斷目前是 2D 還是 3D(const 不會自動掛到 window 上)
window.VIEW = VIEW;
