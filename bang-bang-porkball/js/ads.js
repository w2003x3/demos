// ====================================================================
//  Google AdSense 橫幅廣告
//  電腦版:遊戲畫面中間欄、手牌下方(728×90,窄一點用 468×60)
//  手機版:螢幕最下方,操作列下面(320×50),和操作列隔開一段避免誤觸
//  只在 yryg.com.tw(含子網域)顯示;其他網址(demos 等)不載入廣告、不保留空位
//  網址加 ?adtest=1 可預覽版面:有廣告單元就跑 AdSense 測試廣告,沒有就畫出灰色預留框
//  一個廣告單元同時用在兩個位置,尺寸由 CSS 決定(AdSense「依螢幕寬度指定確切大小」的做法)
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
    document.head.appendChild(s);
  }

  // 容器顯示出來(有寬度)才放廣告;AdSense 在寬度 0 的位置會報錯、不出廣告
  function fill() {
    for (const box of document.querySelectorAll('.ad-slot')) {
      if (filled.has(box) || !box.offsetWidth) continue;
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
    fill();
    // 手機/電腦版面切換(轉向、調整視窗)後,另一個位置第一次出現時再放
    let t = 0;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(fill, 300); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  return { enabled, fill };
})();
