// ====================================================================
//  音效與背景音樂(Web Audio 即時合成,不需音檔)
//  sfx(名稱, x, y):播放音效(依與自己的距離調整音量);房主連線時會一併送給其他玩家
//  背景音樂:選單一首、三張地圖各一首;剩 30 秒加快、最後 10 秒倒數嗶聲
//  聲音設定面板(右上角 🔊、主選單「聲音設定」):音效、音樂各自開關 + 音量(記在瀏覽器)
// ====================================================================
const AUDIO = (() => {
  let ac = null, master = null, sfxBus = null, musicBus = null;
  // 音效 / 音樂各自開關與音量(0~100);沿用舊版「全開 / 只有音效 / 靜音」的選擇
  const snd = { sfx: true, music: true, sfxVol: 90, musicVol: 70 };
  try {
    const saved = JSON.parse(localStorage.getItem('bbw.sound2') || 'null');
    if (saved) Object.assign(snd, saved);
    else {
      const old = localStorage.getItem('bbw.sound');
      if (old === 'sfx') snd.music = false;
      if (old === 'off') { snd.music = false; snd.sfx = false; }
    }
  } catch { /* 無痕模式 */ }
  const saveSnd = () => { try { localStorage.setItem('bbw.sound2', JSON.stringify(snd)); } catch { /* 無痕模式 */ } };

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.8; master.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.connect(master);
    applyMode();
  }
  function applyMode() {
    const btn = document.getElementById('btn-sound');
    if (btn) {
      btn.textContent = snd.sfx && snd.music ? '🔊' : snd.sfx ? '🔉' : snd.music ? '🎵' : '🔇';
      btn.title = `聲音設定(音效${snd.sfx ? '開' : '關'}・音樂${snd.music ? '開' : '關'})`;
    }
    syncPanel();
    if (!ac) return;
    sfxBus.gain.value = snd.sfx ? 1.0 * snd.sfxVol / 100 : 0;
    musicBus.gain.value = snd.music ? 0.46 * snd.musicVol / 100 : 0;
  }
  // ---------- 聲音設定面板 ----------
  const panel = document.getElementById('sound-panel');
  function syncPanel() {
    if (!panel) return;
    const $ = (id) => document.getElementById(id);
    if ($('snd-sfx')) $('snd-sfx').checked = snd.sfx;
    if ($('snd-music')) $('snd-music').checked = snd.music;
    if ($('snd-sfx-vol')) { $('snd-sfx-vol').value = snd.sfxVol; $('snd-sfx-vol').disabled = !snd.sfx; }
    if ($('snd-music-vol')) { $('snd-music-vol').value = snd.musicVol; $('snd-music-vol').disabled = !snd.music; }
    if ($('snd-sfx-num')) $('snd-sfx-num').textContent = snd.sfx ? snd.sfxVol : '關';
    if ($('snd-music-num')) $('snd-music-num').textContent = snd.music ? snd.musicVol : '關';
  }
  function openPanel(on) {
    if (!panel) return;
    panel.classList.toggle('hidden', !on);
    syncPanel();
  }
  if (panel) {
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.addEventListener('input', (e) => {
      const t = e.target;
      init();
      if (t.id === 'snd-sfx') snd.sfx = t.checked;
      if (t.id === 'snd-music') snd.music = t.checked;
      if (t.id === 'snd-sfx-vol') snd.sfxVol = +t.value;
      if (t.id === 'snd-music-vol') snd.musicVol = +t.value;
      saveSnd(); applyMode();
    });
    panel.addEventListener('change', (e) => { if (e.target.id === 'snd-sfx-vol' && snd.sfx) play('pickup'); });   // 放開滑桿試聽一下
    const close = document.getElementById('snd-close');
    if (close) close.addEventListener('click', () => openPanel(false));
    document.addEventListener('click', () => openPanel(false));            // 點其他地方收起
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') openPanel(false); });
  }
  // 瀏覽器規定要有使用者操作後才能出聲
  ['pointerdown', 'keydown', 'touchstart'].forEach((t) => window.addEventListener(t, init, { passive: true }));

  // ---------- 基本合成 ----------
  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ac.createBufferSource(); s.buffer = noiseBuf; return s;
  }
  // 單音:type 波形、f0→f1 頻率滑動、dur 秒、vol 音量
  function tone(bus, t, { type = 'square', f0 = 440, f1 = f0, dur = 0.12, vol = 0.2, attack = 0.005 }) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
  }
  // 噪音:filter 濾波頻率(f0→f1)
  function hiss(bus, t, { dur = 0.2, vol = 0.3, f0 = 3000, f1 = f0, q = 0.8, kind = 'lowpass' }) {
    const s = noise(), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = kind; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t); s.stop(t + dur + 0.02);
  }

  // ---------- 音效庫 ----------
  const N = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI 音高 → 頻率
  const SFX = {
    place(b, t, v) { tone(b, t, { type: 'sine', f0: 520, f1: 260, dur: 0.12, vol: 0.35 * v }); },
    boom(b, t, v) {
      hiss(b, t, { dur: 0.65, vol: 0.7 * v, f0: 2400, f1: 120 });
      tone(b, t, { type: 'sine', f0: 140, f1: 38, dur: 0.5, vol: 0.6 * v });
    },
    splat(b, t, v) {
      hiss(b, t, { dur: 0.4, vol: 0.5 * v, f0: 900, f1: 200, q: 3 });
      tone(b, t, { type: 'sine', f0: 220, f1: 70, dur: 0.35, vol: 0.4 * v });
    },
    pickup(b, t, v) {
      tone(b, t, { type: 'square', f0: N(76), dur: 0.08, vol: 0.12 * v });
      tone(b, t + 0.07, { type: 'square', f0: N(83), dur: 0.12, vol: 0.12 * v });
    },
    jackpot(b, t, v) {
      [72, 76, 79, 84, 88].forEach((n, i) => tone(b, t + i * 0.06, { type: 'square', f0: N(n), dur: 0.14, vol: 0.12 * v }));
    },
    gear(b, t, v) {
      tone(b, t, { type: 'triangle', f0: N(67), dur: 0.1, vol: 0.25 * v });
      tone(b, t + 0.08, { type: 'triangle', f0: N(74), dur: 0.16, vol: 0.25 * v });
    },
    yuck(b, t, v) { tone(b, t, { type: 'sawtooth', f0: 300, f1: 110, dur: 0.35, vol: 0.18 * v }); },
    hurt(b, t, v) {
      tone(b, t, { type: 'square', f0: 620, f1: 180, dur: 0.22, vol: 0.2 * v });
      hiss(b, t, { dur: 0.12, vol: 0.2 * v, f0: 4000 });
    },
    block(b, t, v) { tone(b, t, { type: 'triangle', f0: 1200, f1: 900, dur: 0.2, vol: 0.25 * v }); },
    die(b, t, v) {
      [67, 63, 60, 55].forEach((n, i) => tone(b, t + i * 0.11, { type: 'square', f0: N(n), dur: 0.13, vol: 0.16 * v }));
    },
    kick(b, t, v) {
      tone(b, t, { type: 'sine', f0: 180, f1: 60, dur: 0.12, vol: 0.5 * v });
      hiss(b, t, { dur: 0.06, vol: 0.25 * v, f0: 1500 });
    },
    boing(b, t, v) { tone(b, t, { type: 'sine', f0: 300, f1: 900, dur: 0.15, vol: 0.25 * v }); },
    whoosh(b, t, v) { hiss(b, t, { dur: 0.25, vol: 0.35 * v, f0: 600, f1: 3500, q: 2, kind: 'bandpass' }); },
    shield(b, t, v) {
      tone(b, t, { type: 'sine', f0: 400, f1: 1200, dur: 0.3, vol: 0.25 * v });
      tone(b, t + 0.05, { type: 'triangle', f0: 800, f1: 1600, dur: 0.25, vol: 0.12 * v });
    },
    squeak(b, t, v) {
      tone(b, t, { type: 'square', f0: 1800, f1: 2600, dur: 0.06, vol: 0.08 * v });
      tone(b, t + 0.07, { type: 'square', f0: 2000, f1: 2900, dur: 0.06, vol: 0.08 * v });
    },
    chomp(b, t, v) { hiss(b, t, { dur: 0.08, vol: 0.3 * v, f0: 1200, q: 4, kind: 'bandpass' }); },
    tick(b, t, v) { tone(b, t, { type: 'square', f0: 1000, dur: 0.05, vol: 0.12 * v }); },
    start(b, t, v) {
      [60, 64, 67, 72].forEach((n, i) => tone(b, t + i * 0.08, { type: 'square', f0: N(n), dur: 0.12, vol: 0.14 * v }));
    },
    win(b, t, v) {
      [72, 76, 79, 84, 79, 84].forEach((n, i) => tone(b, t + i * 0.12, { type: 'square', f0: N(n), dur: 0.18, vol: 0.15 * v }));
    },
    lose(b, t, v) {
      [67, 66, 65, 64].forEach((n, i) => tone(b, t + i * 0.22, { type: 'triangle', f0: N(n), dur: 0.3, vol: 0.25 * v }));
    },
    step(b, t, v) { tone(b, t, { type: 'sine', f0: N(88), dur: 0.08, vol: 0.12 * v }); },
  };

  function play(name, x, y) {
    if (!ac || !snd.sfx || !SFX[name]) return;
    // 距離越遠越小聲(自己附近最大聲)
    let v = 1;
    if (x !== undefined && typeof player !== 'undefined' && player) {
      const d = Math.hypot(x - player.x, y - player.y) / TS;
      v = Math.max(0.3, 1 - d / 14);
    }
    SFX[name](sfxBus, ac.currentTime + 0.005, v);
  }

  // ---------- 背景音樂(簡單的步進音序器) ----------
  // 每首:速度、調性根音、和弦進行(相對根音的半音)、旋律音階、鼓的節奏
  const SONGS = {
    menu:   { bpm: 100, root: 60, prog: [0, 5, 7, 5], scale: [0, 2, 4, 7, 9], lead: 'triangle', drums: 'soft', swing: 0 },
    park:   { bpm: 124, root: 60, prog: [0, 9, 5, 7], scale: [0, 2, 4, 7, 9, 12], lead: 'square', drums: 'pop', swing: 0 },
    market: { bpm: 136, root: 65, prog: [0, 0, 10, 5], scale: [0, 2, 4, 5, 7, 9, 10], lead: 'square', drums: 'bounce', swing: 0.12 },
    night:  { bpm: 96,  root: 57, prog: [0, 8, 3, 10], scale: [0, 3, 5, 7, 10, 12], lead: 'triangle', drums: 'lofi', swing: 0.2 },
  };
  // 固定亂數(同一首每次聽起來一樣)
  function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function compose(name) {
    const S = SONGS[name], rnd = seeded([...name].reduce((a, c) => a + c.charCodeAt(0), 7));
    const melody = []; // 8 小節 × 16 拍,null = 休止
    for (let bar = 0; bar < 8; bar++) {
      for (let i = 0; i < 16; i++) {
        const strong = i % 4 === 0;
        const play = strong ? rnd() < 0.85 : rnd() < (i % 2 === 0 ? 0.45 : 0.18);
        melody.push(play ? S.scale[Math.floor(rnd() * S.scale.length)] + (rnd() < 0.2 ? 12 : 0) : null);
      }
      if (bar % 4 === 3) for (let i = 12; i < 16; i++) melody[bar * 16 + i] = i === 12 ? 0 : null; // 樂句結尾回主音
    }
    return { S, melody };
  }
  let song = null, songName = '', step = 0, nextT = 0, timer = null, fast = false;
  function startSong(name) {
    if (songName === name) return;
    songName = name;
    song = name ? compose(name) : null;
    step = 0;
    if (ac) nextT = ac.currentTime + 0.1;
  }
  function schedule() {
    if (!ac || !song || !snd.music) { if (ac) nextT = ac.currentTime + 0.1; return; }
    const { S, melody } = song;
    const bpm = S.bpm * (fast ? 1.18 : 1);
    const dur16 = 60 / bpm / 4;
    while (nextT < ac.currentTime + 0.25) {
      const i = step % melody.length, bar = Math.floor(i / 16), pos = i % 16;
      const chord = S.root + S.prog[bar % S.prog.length];
      const t = nextT + (pos % 2 === 1 ? S.swing * dur16 : 0);
      // 低音:每拍
      if (pos % 4 === 0) tone(musicBus, t, { type: 'triangle', f0: N(chord - 24 + (pos === 8 ? 7 : 0)), dur: dur16 * 3.5, vol: 0.5 });
      // 琶音:和弦三音輪流
      if (pos % 2 === 0) {
        const arp = [0, 4, 7, 12][(pos / 2) % 4] - (S.prog[bar % S.prog.length] % 2 && pos % 8 === 2 ? 1 : 0);
        tone(musicBus, t, { type: 'square', f0: N(chord + arp), dur: dur16 * 1.2, vol: 0.06 });
      }
      // 旋律
      const m = melody[i];
      if (m !== null) tone(musicBus, t, { type: S.lead, f0: N(S.root + 12 + m), dur: dur16 * 1.8, vol: S.lead === 'square' ? 0.08 : 0.18 });
      // 鼓
      const d = S.drums;
      if (pos % 8 === 0 || (d === 'bounce' && pos === 10)) tone(musicBus, t, { type: 'sine', f0: 150, f1: 45, dur: 0.18, vol: d === 'soft' ? 0.3 : 0.6 });
      if (pos % 8 === 4 && d !== 'soft') hiss(musicBus, t, { dur: 0.12, vol: d === 'lofi' ? 0.15 : 0.25, f0: 2500, kind: 'bandpass', q: 0.7 });
      if (pos % 2 === 0 && d !== 'soft') hiss(musicBus, t, { dur: 0.04, vol: 0.08, f0: 8000, kind: 'highpass' });
      nextT += dur16;
      step++;
    }
  }

  // 依遊戲狀態自動換曲(每 0.1 秒檢查)
  let lastSec = -1;
  timer = setInterval(() => {
    if (typeof gameState === 'undefined') return;
    const playing = gameState === 'playing';
    startSong(playing ? (typeof currentMapId !== 'undefined' ? currentMapId : 'park') : 'menu');
    const tut = window.tutorial && tutorial.active;
    fast = playing && !tut && typeof matchTime !== 'undefined' && matchTime <= 30;
    // 最後 10 秒倒數嗶聲
    if (playing && !tut && matchTime <= 10 && matchTime > 0) {
      const s = Math.ceil(matchTime);
      if (s !== lastSec) { lastSec = s; play('tick'); }
    } else lastSec = -1;
    schedule();
  }, 100);

  // 🔊 按鈕 / 主選單「聲音設定」:打開設定面板
  for (const id of ['btn-sound', 'btn-settings']) {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', (e) => {
      e.stopPropagation();
      init();
      openPanel(panel && panel.classList.contains('hidden'));
      b.blur();
    });
  }
  applyMode();

  return { play, init, openPanel };
})();

// 遊戲內呼叫:播放音效;房主連線時記下來,隨快照送給其他玩家
function sfx(name, x, y) {
  AUDIO.play(name, x, y);
  if (typeof NET !== 'undefined' && NET.role === 'host') NET.sq.push([name, Math.round(x || 0), Math.round(y || 0)]);
}
