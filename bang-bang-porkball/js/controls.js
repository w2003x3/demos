// ====================================================================
//  介面按鈕 → 轉成鍵盤事件，重用 game.js 既有的操作邏輯
// ====================================================================
(function () {
  function fire(type, key) {
    window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
  }

  // 動作按鈕:單擊觸發
  document.querySelectorAll('.actions button, .side-right > .act, .m-bar button[data-key]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      fire('keydown', btn.dataset.key);
      btn.blur(); // 避免焦點殘留導致空白/Enter 誤觸
    });
  });

  // 說明彈窗
  const modal = document.getElementById('help-modal');
  const open = document.getElementById('btn-help');
  const close = document.getElementById('btn-help-close');
  if (modal && open) {
    open.addEventListener('click', () => modal.classList.remove('hidden'));
    const guideBtn = document.getElementById('btn-guide'); // 開始畫面的「玩法說明」
    if (guideBtn) guideBtn.addEventListener('click', () => { modal.classList.remove('hidden'); modal.querySelector('.modal-panel').scrollTop = 0; });
    if (close) close.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden'); // 點背景關閉
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') modal.classList.add('hidden');
    });
  }
})();
