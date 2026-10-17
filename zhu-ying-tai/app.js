"use strict";

/* ---------- 全域狀態 ---------- */
const state = {
  phonetics: null,
  words: [],
  currentWord: null,
};

/* ---------- 學習進度（localStorage） ---------- */
const PROGRESS_KEY = "zyt-learned-words";

const progress = {
  learned: new Set(),

  load() {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) this.learned = new Set(JSON.parse(raw));
    } catch (e) {
      this.learned = new Set();
    }
  },

  save() {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify([...this.learned]));
    } catch (e) {
      /* 隱私模式等情況下無法儲存,不影響練習 */
    }
  },

  has(word) {
    return this.learned.has(word);
  },

  toggle(word) {
    if (this.learned.has(word)) this.learned.delete(word);
    else this.learned.add(word);
    this.save();
  },

  reset() {
    this.learned = new Set();
    this.save();
  },
};

function renderProgress() {
  const fill = document.getElementById("progress-fill");
  const text = document.getElementById("progress-text");
  if (!fill || !text || state.words.length === 0) return;

  // 只統計目前資料庫仍存在的單字(資料庫更新後,移除的字不計)
  const wordSet = new Set(state.words.map((w) => w.word));
  const learnedCount = [...progress.learned].filter((w) => wordSet.has(w)).length;
  const total = state.words.length;
  const pct = Math.round((learnedCount / total) * 100);

  const byLevel = [1, 2, 3].map((lv) => {
    const pool = state.words.filter((w) => w.difficulty === lv);
    const done = pool.filter((w) => progress.has(w.word)).length;
    return `${DIFFICULTY_LABEL[lv]} ${done}/${pool.length}`;
  });

  fill.style.width = `${pct}%`;
  text.textContent = `已學會 ${learnedCount}/${total}（${pct}%）｜ ${byLevel.join("、")}`;
}

/* ---------- 發音工具 ---------- */
// 以瀏覽器語音合成播放英文（離線可用、永遠有 fallback）
function speak(text) {
  if (!("speechSynthesis" in window)) {
    console.warn("此瀏覽器不支援語音合成");
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

// 播放音檔 URL，失敗時退回語音合成
function playAudioUrl(url, fallbackText) {
  if (!url) return speak(fallbackText);
  const audio = new Audio(url);
  audio.play().catch(() => speak(fallbackText));
}

/* ---------- 資料載入 ---------- */
async function loadData() {
  const [phon, words] = await Promise.all([
    fetch("data/kk-phonetics.json").then((r) => r.json()),
    fetch("data/words.json").then((r) => r.json()),
  ]);
  state.phonetics = phon;
  state.words = words.words;
}

/* ---------- KK 音標學習區 ---------- */
const CATEGORY_LABELS = {
  monophthongs: "單母音",
  diphthongs: "雙母音 / r 化母音",
  stops: "塞音",
  fricatives: "摩擦音",
  affricates: "塞擦音",
  nasals: "鼻音",
  liquidsAndGlides: "流音與滑音",
};

function phonCard(item) {
  const ipa = item.ipa ? `<span class="phon-ipa">${item.ipa}</span>` : "";
  const examples = item.examples
    .map((w) => `<span class="example-chip" data-speak="${w}">${w}</span>`)
    .join("");
  // 以第一個範例單字作為發音示範
  const demo = item.examples[0];
  return `
    <div class="phon-card">
      <div class="phon-head">
        <div>
          <span class="phon-symbol">${item.kk}</span> ${ipa}
        </div>
        <div style="display:flex;align-items:center;gap:.4rem">
          <span class="phon-zhuyin">${item.zhuyin}</span>
          <button class="play-btn" data-speak="${demo}" title="播放範例發音">🔊</button>
        </div>
      </div>
      <p class="phon-desc">${item.description}</p>
      <div class="phon-examples">${examples}</div>
    </div>`;
}

function renderPhonetics() {
  const root = document.getElementById("phonetics-content");
  const { vowels, consonants } = state.phonetics;
  let html = "";

  html += `<h2 class="section-title">母音</h2>`;
  for (const key of ["monophthongs", "diphthongs"]) {
    if (!vowels[key]) continue;
    html += `<h3 class="category-title">${CATEGORY_LABELS[key]}</h3>`;
    html += `<div class="phon-grid">${vowels[key].map(phonCard).join("")}</div>`;
  }

  html += `<h2 class="section-title">子音</h2>`;
  for (const key of ["stops", "fricatives", "affricates", "nasals", "liquidsAndGlides"]) {
    if (!consonants[key]) continue;
    html += `<h3 class="category-title">${CATEGORY_LABELS[key]}</h3>`;
    html += `<div class="phon-grid">${consonants[key].map(phonCard).join("")}</div>`;
  }

  root.innerHTML = html;

  // 易混淆音標
  const confused = document.getElementById("confused-content");
  confused.innerHTML = state.phonetics.confusedPairs
    .map(
      (p) => `
      <div class="confused-card">
        <div class="confused-pair">${p.pair.join(" vs ")}</div>
        <p class="confused-diff">${p.difference}</p>
        <div class="phon-examples">
          ${p.examples
            .map((w) => `<span class="example-chip" data-speak="${w}">${w}</span>`)
            .join("")}
        </div>
      </div>`
    )
    .join("");
}

/* ---------- 隨機單字練習 ---------- */
function pickWord() {
  const level = parseInt(document.getElementById("difficulty-filter").value, 10);
  let pool = level ? state.words.filter((w) => w.difficulty === level) : state.words;
  if (document.getElementById("only-unlearned").checked) {
    pool = pool.filter((w) => !progress.has(w.word));
  }
  if (pool.length === 0) return null;
  let next;
  do {
    next = pool[Math.floor(Math.random() * pool.length)];
  } while (pool.length > 1 && next === state.currentWord);
  return next;
}

const DIFFICULTY_LABEL = { 1: "初級", 2: "中級", 3: "進階" };

function renderPracticeCard() {
  const word = pickWord();
  state.currentWord = word;
  const card = document.getElementById("practice-card");
  if (!word) {
    const onlyUnlearned = document.getElementById("only-unlearned").checked;
    card.innerHTML = onlyUnlearned
      ? `<p class="status-msg">🎉 此範圍的單字都學會了！可切換難度或重設進度。</p>`
      : `<p class="status-msg">此難度尚無單字。</p>`;
    return;
  }

  const syllables = word.syllables
    .map(
      (syl, i) => `
      <div class="syllable">
        <div class="syl-text">${syl}</div>
        <div class="syl-kk">${word.kk[i] || ""}</div>
        <div class="syl-zhuyin">${word.zhuyin[i] || ""}</div>
      </div>`
    )
    .join("");

  const learned = progress.has(word.word);
  card.innerHTML = `
    <div class="practice-word">
      ${word.word}
      <button class="play-btn" data-speak="${word.word}" title="播放發音">🔊</button>
    </div>
    <div class="syllable-row">${syllables}</div>
    <div class="difficulty-badge">難度：${DIFFICULTY_LABEL[word.difficulty] || "—"}</div>
    <button id="mark-learned" class="btn-learned ${learned ? "is-learned" : ""}">
      ${learned ? "✅ 已學會（點擊取消）" : "☑️ 標記為已學會"}
    </button>`;

  document.getElementById("mark-learned").addEventListener("click", () => {
    progress.toggle(word.word);
    const btn = document.getElementById("mark-learned");
    const nowLearned = progress.has(word.word);
    btn.classList.toggle("is-learned", nowLearned);
    btn.textContent = nowLearned ? "✅ 已學會（點擊取消）" : "☑️ 標記為已學會";
    renderProgress();
  });

  applyZhuyinVisibility();
}

function applyZhuyinVisibility() {
  const show = document.getElementById("toggle-zhuyin").checked;
  document.getElementById("practice-card").classList.toggle("hide-zhuyin", !show);
}

/* ---------- 單字查詢 ---------- */
async function lookupWord(query) {
  const result = document.getElementById("lookup-result");
  const word = query.trim().toLowerCase();
  if (!word) return;

  result.innerHTML = `<p class="status-msg">查詢中…</p>`;

  // 1. 先查本地資料庫（有完整注音標注）
  const local = state.words.find((w) => w.word === word);

  // 2. 再向 Free Dictionary API 取得音標與音檔
  let api = null;
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
    );
    if (res.ok) {
      const data = await res.json();
      api = Array.isArray(data) ? data[0] : null;
    }
  } catch (e) {
    /* 網路錯誤時忽略，改用本地資料 / 語音合成 */
  }

  if (!local && !api) {
    result.innerHTML = `<p class="status-msg error">找不到「${word}」的發音資料。請確認拼字是否正確。</p>`;
    return;
  }

  // 擷取 API 的音標與音檔
  let phoneticText = "";
  let audioUrl = "";
  let meaning = "";
  if (api) {
    phoneticText = api.phonetic || (api.phonetics.find((p) => p.text) || {}).text || "";
    audioUrl = (api.phonetics.find((p) => p.audio) || {}).audio || "";
    const firstMeaning = api.meanings && api.meanings[0];
    if (firstMeaning) {
      meaning = `(${firstMeaning.partOfSpeech}) ${firstMeaning.definitions[0].definition}`;
    }
  }

  const kkText = local ? local.kk.join(" · ") : "";
  const zhuyinText = local ? local.zhuyin.join(" · ") : "";

  result.innerHTML = `
    <div class="result-card">
      <div class="result-word">
        ${word}
        <button class="play-btn" data-audio="${audioUrl}" data-speak="${word}" title="播放發音">🔊</button>
      </div>
      ${phoneticText ? `<div class="result-phonetic">IPA ${phoneticText}</div>` : ""}
      ${kkText ? `<div class="result-phonetic">KK ${kkText}</div>` : ""}
      ${zhuyinText ? `<div class="result-zhuyin">注音 ${zhuyinText}</div>` : ""}
      ${!local ? `<p class="result-meaning">提示：本地資料庫尚無此字的注音標注，發音以語音合成 / API 音檔為準。</p>` : ""}
      ${meaning ? `<p class="result-meaning">${meaning}</p>` : ""}
    </div>`;
}

/* ---------- 事件綁定 ---------- */
function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      document.getElementById(tab.dataset.tab).classList.add("active");
    });
  });
}

// 事件委派：任何帶 data-speak / data-audio 的元素都可播放
function setupPlayback() {
  document.body.addEventListener("click", (e) => {
    const el = e.target.closest("[data-speak], [data-audio]");
    if (!el) return;
    const audio = el.dataset.audio;
    const text = el.dataset.speak;
    if (audio) playAudioUrl(audio, text);
    else if (text) speak(text);
  });
}

function setupPractice() {
  document.getElementById("next-word").addEventListener("click", renderPracticeCard);
  document.getElementById("toggle-zhuyin").addEventListener("change", applyZhuyinVisibility);
  document.getElementById("difficulty-filter").addEventListener("change", renderPracticeCard);
  document.getElementById("only-unlearned").addEventListener("change", renderPracticeCard);
  document.getElementById("reset-progress").addEventListener("click", () => {
    if (confirm("確定要清除所有「已學會」標記嗎？")) {
      progress.reset();
      renderProgress();
      renderPracticeCard();
    }
  });
}

function setupLookup() {
  document.getElementById("lookup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    lookupWord(document.getElementById("lookup-input").value);
  });
}

/* ---------- 啟動 ---------- */
async function init() {
  setupTabs();
  setupPlayback();
  setupPractice();
  setupLookup();
  progress.load();
  try {
    await loadData();
    renderPhonetics();
    renderProgress();
    renderPracticeCard();
  } catch (e) {
    console.error(e);
    document.getElementById("phonetics-content").innerHTML =
      `<p class="status-msg error">資料載入失敗，請以本機伺服器（如 npx http-server）開啟此頁面。</p>`;
  }
}

document.addEventListener("DOMContentLoaded", init);
