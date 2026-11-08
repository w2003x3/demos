// ====================================================================
//  Google AdSense 橫幅廣告
//  電腦版:遊戲畫面中間欄、手牌下方(728×90,窄一點用 468×60)
//  手機版:螢幕最下方,操作列下面(320×50),和操作列隔開一段避免誤觸
//  只在 yryg.com.tw(含子網域)顯示;其他網址(demos 等)不載入廣告、不保留空位
//  網址加 ?adtest=1 可預覽版面:有廣告單元就跑 AdSense 測試廣告,沒有就畫出灰色預留框
//  一個廣告單元同時用在兩個位置,尺寸由 CSS 決定(AdSense「依螢幕寬度指定確切大小」的做法)
//  橫幅一頁只請求一次、不自動重新載入(AdSense 政策不允許程式自動刷新廣告)
//  局間插頁:單機開下一局前呼叫 Ad Placement API 的 adBreak({type:'next'}),
//  要不要放、多久放一次由 Google 決定(frequency hint 120 秒);帳號需加入 AdSense 的 H5 遊戲廣告才會真的出廣告,
//  未開通/被擋/沒廣告時 adBreakDone 會馬上回呼,直接開局
// ====================================================================
const ADS = (() => {
  const CLIENT = 'ca-pub-1853487110114225';
  const SLOT = '4773780020';   // AdSense 多媒體廣告單元「炸裂丸子-橫幅」(回應式,電腦/手機共用)
  let test = false;
  try { test = new URLSearchParams(location.search).get('adtest') === '1'; } catch (e) { /* 舊瀏覽器 */ }
  const onSite = /(^|\.)yryg\.com\.tw$/.test(location.hostname);
  const live = !!SLOT && (onSite || test);
  const enabled = live || test;
  const filled = new Set();

  function loadScript() {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + CLIENT;
    s.crossOrigin = 'anonymous';
    s.setAttribute('data-ad-frequency-hint', '120s');
    if (test) s.setAttribute('data-adbreak-test', 'on');
    document.head.appendChild(s);
    window.adBreak = window.adConfig = function (o) { (window.adsbygoogle = window.adsbygoogle || []).push(o); };
    adConfig({ preloadAdBreaks: 'on', sound: 'on' });
  }

  // 局間插頁廣告:每次開下一局前呼叫,done 一定會被呼叫且只呼叫一次
  // (第一場不放;廣告程式被擋或 3 秒內沒開始播就直接開局,避免卡在結算畫面)
  let breaks = 0, pending = false;
  function roundBreak(done) {
    if (pending) return;
    if (!live || breaks++ === 0 || typeof window.adBreak !== 'function') { done(); return; }
    pending = true;
    let finished = false, showing = false;
    const finish = () => { if (finished) return; finished = true; pending = false; if (typeof AUDIO !== 'undefined') AUDIO.resume(); done(); };
    try {
      adBreak({
        type: 'next', name: 'round-break',
        beforeAd() { showing = true; if (typeof AUDIO !== 'undefined') AUDIO.pause(); },
        afterAd() { if (typeof AUDIO !== 'undefined') AUDIO.resume(); },
        adBreakDone: finish,
      });
    } catch (e) { finish(); return; }
    setTimeout(() => { if (!showing) finish(); }, 3000);
  }

  // 主選單/設定/結算等畫面蓋著時,請求廣告會白白用掉(AdSense 一個位置只請求一次,沒拿到就整場空白),
  // 也可能被判成隱藏廣告。開局後(gameState 是 game.js 的全域)、且廣告位正中央最上層是它自己才請求
  function visible(box) {
    if (typeof gameState === 'undefined' || gameState !== 'playing' || !box.offsetWidth) return false;
    const r = box.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
    const top = document.elementFromPoint(x, y);
    return !!top && box.contains(top);
  }

  // 容器顯示出來(有寬度)才放廣告;AdSense 在寬度 0 的位置會報錯、不出廣告
  function fill() {
    for (const box of document.querySelectorAll('.ad-slot')) {
      if (filled.has(box) || !visible(box)) continue;
      filled.add(box);
      if (!live) { box.classList.add('ad-preview'); continue; }
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.setAttribute('data-ad-client', CLIENT);
      ins.setAttribute('data-ad-slot', SLOT);
      if (test) ins.setAttribute('data-adtest', 'on');
      box.appendChild(ins);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* 廣告被擋 */ }
    }
  }

  function init() {
    if (!enabled) return;
    document.body.classList.add('has-ads');
    if (live) loadScript();
    // 開局(主選單關掉)、手機/電腦版面切換後,位置第一次看得到時再放;兩個位置都放過就停
    const boxes = document.querySelectorAll('.ad-slot').length;
    const timer = setInterval(() => { fill(); if (filled.size >= boxes) clearInterval(timer); }, 800);
    fill();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  return { enabled, fill, roundBreak };
})();
