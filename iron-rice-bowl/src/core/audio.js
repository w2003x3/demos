// 音效(WebAudio 即時合成,不需音檔)與語音(Azure TTS 音檔,缺檔時用瀏覽器 speechSynthesis)。
import { buildVoiceLines, VOICES } from '../config/voice.js';

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  /** 瀏覽器規定需在使用者操作後才能啟動音訊。 */
  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    // 行駛底噪:棕噪音 → 低通
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = 300;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    src.connect(this.rumbleFilter).connect(this.rumbleGain).connect(this.master);
    src.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
  }

  /** speedRatio 0~1,控制行駛噪音大小;enclosed 0~1 為在隧道內的程度。 */
  setRumble(speedRatio, enclosed = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // enclosed:在隧道內的程度(0~1),回音讓行駛聲更大、更悶
    this.rumbleGain.gain.setTargetAtTime((0.05 + speedRatio * 0.35) * (1 + 0.9 * enclosed), t, 0.3);
    this.rumbleFilter.frequency.setTargetAtTime(180 + speedRatio * 420 + 160 * enclosed, t, 0.3);
  }

  _tone(freq, dur, { type = 'sine', gain = 0.2, delay = 0, slide = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** 軌道接縫聲(兩個轉向架各一下)。 */
  clack(intensity = 1) {
    if (!this.ctx) return;
    for (const dl of [0, 0.11]) {
      const t = this.ctx.currentTime + dl;
      const n = this.ctx.createBufferSource();
      const b = this.ctx.createBuffer(1, 2200, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 300);
      n.buffer = b;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      const g = this.ctx.createGain();
      g.gain.value = 0.25 * intensity;
      n.connect(f).connect(g).connect(this.master);
      n.start(t);
    }
  }

  /** 車外聲音的共用輸出:經低通濾波(在車廂內聽,隔著車體較悶) */
  _outside() {
    if (!this.outsideBus) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1800;
      f.connect(this.master);
      this.outsideBus = f;
    }
    return this.outsideBus;
  }

  /** 列車喇叭(自強號雙音氣笛);count = 鳴響次數(1 長鳴或 2 短鳴) */
  horn(count = 1) {
    if (!this.ctx) return;
    const out = this._outside();
    const t0 = this.ctx.currentTime + 0.05;
    const len = count > 1 ? 0.45 : 1.3;
    for (let k = 0; k < count; k++) {
      const st = t0 + k * (len + 0.22);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.16, st + 0.06);
      g.gain.setValueAtTime(0.16, st + len - 0.12);
      g.gain.linearRampToValueAtTime(0, st + len);
      g.connect(out);
      // 兩個音高(約小三度)的鋸齒波,微微失諧讓聲音較厚
      for (const f of [311, 313.5, 370, 372]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 0.985, st);
        o.frequency.linearRampToValueAtTime(f, st + 0.08);
        o.connect(g);
        o.start(st);
        o.stop(st + len + 0.05);
      }
    }
  }

  /** 平交道警鈴「噹、噹」:由遠而近再遠去(約 dur 秒),經過時音高略降(都卜勒) */
  crossing(dur = 5) {
    if (!this.ctx) return;
    const out = this._outside();
    const t0 = this.ctx.currentTime + 0.05;
    const step = 0.42;
    for (let i = 0, t = 0; t < dur; i++, t += step) {
      const u = t / dur;                          // 0 → 1:接近 → 經過 → 遠離
      const vol = Math.sin(Math.PI * u) ** 1.6 * 0.13;
      const doppler = u < 0.5 ? 1.04 : 0.95;
      const base = (i % 2 ? 680 : 760) * doppler; // 兩個鈴交替
      const st = t0 + t;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, st);
      g.gain.exponentialRampToValueAtTime(0.0005, st + 0.38);
      g.connect(out);
      // 鈴的非諧波泛音
      for (const [m, a] of [[1, 1], [2.32, 0.45], [3.9, 0.25]]) {
        const o = this.ctx.createOscillator();
        const og = this.ctx.createGain();
        o.frequency.value = base * m;
        og.gain.value = a;
        o.connect(og).connect(g);
        o.start(st);
        o.stop(st + 0.4);
      }
    }
  }

  /** 嬰兒哭聲(合成):一陣陣「哇——」,音高起伏、帶顫音;vol 依距離 */
  babyCry(dur = 4, vol = 0.1) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + 0.05;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 1.4;
    bp.connect(this.master);
    for (let t = 0; t < dur;) {
      const len = 0.7 + Math.random() * 0.6;
      const st = t0 + t;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      const f = 430 + Math.random() * 80;
      o.frequency.setValueAtTime(f * 0.9, st);
      o.frequency.linearRampToValueAtTime(f * 1.15, st + len * 0.3);
      o.frequency.linearRampToValueAtTime(f * 0.8, st + len);
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
      lfo.frequency.value = 7; lg.gain.value = 14;
      lfo.connect(lg).connect(o.frequency);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(vol, st + 0.08);
      g.gain.setValueAtTime(vol, st + len - 0.15);
      g.gain.linearRampToValueAtTime(0, st + len);
      o.connect(g).connect(bp);
      o.start(st); lfo.start(st);
      o.stop(st + len + 0.05); lfo.stop(st + len + 0.05);
      t += len + 0.25 + Math.random() * 0.35; // 換氣
    }
  }

  chime() { [659, 523, 587, 392].forEach((f, i) => this._tone(f, 0.9, { delay: i * 0.38, gain: 0.12 })); }
  blip() { this._tone(880, 0.08, { type: 'triangle', gain: 0.1 }); }
  ok() { this._tone(660, 0.12, { gain: 0.14 }); this._tone(990, 0.18, { gain: 0.14, delay: 0.1 }); }
  bad() { this._tone(220, 0.3, { type: 'sawtooth', gain: 0.08, slide: -60 }); }
  cash() { this._tone(1320, 0.1, { gain: 0.1 }); this._tone(1760, 0.25, { gain: 0.1, delay: 0.08 }); }
  win() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.4, { delay: i * 0.15, gain: 0.14 })); }
  lose() { [392, 330, 262].forEach((f, i) => this._tone(f, 0.5, { delay: i * 0.25, gain: 0.12, type: 'triangle' })); }
}

/** 微軟語音的中文名稱(Edge 內建語音以中文命名;含簡體寫法) */
const VOICE_ALIASES = { HsiaoChen: ['曉臻', '晓臻'], YunJhe: ['雲哲', '云哲'], HsiaoYu: ['曉雨', '晓雨'] };

const ROLE_LABEL = {
  attendant: '服勤員', passengerM: '乘客', passengerF: '乘客', passengerF2: '乘客', child: '小朋友', grandma: '阿嬤', grandma2: '阿嬤',
  conductor: '列車廣播', conductorEn: '列車廣播', station: '車站廣播', stationEn: '車站廣播', kitchenBoss: '廚房主任', helperAunt: '林阿姨', helperStudent: '阿哲', helperYoung: '小婷', helperBurly: '大熊',
};

/**
 * 語音:兩個頻道 —— 'announce'(廣播,排隊播放)與 'talk'(對話,新的會打斷舊的)。
 */
const DECODE_CACHE = 48;   // 解碼後的 PCM 較大(約 0.2~0.5 MB/句),只保留最近用過的

export class Voice {
  constructor(base, onSubtitle) {
    this.base = base;
    this.onSubtitle = onSubtitle;
    this.lines = new Map(buildVoiceLines().map((l) => [l.id, l]));
    this.files = new Set();
    this.muted = false;
    this.announceQueue = [];
    this.announcing = null;
    this.talks = new Set();   // 進行中的對話(可多段同時)
    this.speaking = 0;        // 正在發聲的對話音檔數(廣播依此降低音量)
    this.announceAudio = null;
    /**
     * 對話的可聽度:(anchor) => 0~1,由遊戲階段設定(例:不同車廂 = 0)。
     * 0 時只顯示字幕不出聲;廣播不受影響(全車都聽得到)。
     */
    this.hearing = null;
    /** 播放來源:both 預錄音檔優先(缺檔用瀏覽器發音)/ files 只用預錄 / browser 只用瀏覽器發音 */
    this.mode = 'both';
    /**
     * 預錄音檔:任務開始前全部下載到記憶體(raw = 壓縮的 mp3),播放時用 WebAudio 解碼混音。
     * 不在播放當下才下載,避免網路延遲或瀏覽器同時媒體數量上限造成台詞卡住、之後一次全部播出。
     * getCtx 由 Game 提供(Sfx 的 AudioContext,使用者操作後才建立)。
     */
    this.getCtx = null;
    this.raw = new Map();
    this.decoded = new Map();   // id → Promise<AudioBuffer>(最近用過的,上限 DECODE_CACHE)
    this.announceGain = null;
  }

  /** 下載全部預錄音檔(只做一次);onProgress(0~1)。 */
  preload(onProgress) {
    const ids = [...this.files];
    if (!this._preload) {
      let done = 0, next = 0;
      this._progress = new Set();
      const worker = async () => {
        while (next < ids.length) {
          const id = ids[next++];
          try {
            const r = await fetch(`${this.base}/${id}.mp3`);
            if (r.ok) this.raw.set(id, await r.arrayBuffer());
          } catch { /* 單檔失敗 → 該句改走備援 */ }
          done++;
          this._progress.forEach((f) => f(done / ids.length));
        }
      };
      this._preload = Promise.all(Array.from({ length: 8 }, worker)).then(() => { this._progress.clear(); });
    }
    if (onProgress) {
      if (this.raw.size >= ids.length) onProgress(1);
      else this._progress?.add(onProgress);
    }
    return this._preload;
  }

  _decode(ctx, id) {
    let p = this.decoded.get(id);
    if (p) { this.decoded.delete(id); this.decoded.set(id, p); return p; }   // 移到最新
    p = ctx.decodeAudioData(this.raw.get(id).slice(0));
    this.decoded.set(id, p);
    if (this.decoded.size > DECODE_CACHE) this.decoded.delete(this.decoded.keys().next().value);
    return p;
  }

  async init() {
    try {
      const r = await fetch(`${this.base}/manifest.json`, { cache: 'no-cache' });
      if (r.ok) (await r.json()).forEach((id) => this.files.add(id));
    } catch { /* 尚未產生音檔 → 全部使用瀏覽器語音 */ }
    this.synthVoices = [];
    if ('speechSynthesis' in window) {
      const load = () => (this.synthVoices = speechSynthesis.getVoices());
      load();
      speechSynthesis.onvoiceschanged = load;
    }
  }

  get source() {
    if (this.files.size) return `預先錄製的微軟語音 ${this.files.size} 句(雲哲・曉臻・曉雨)`;
    const ms = ['HsiaoChen', 'YunJhe', 'HsiaoYu'].filter((n) => this.synthVoices?.some((v) => [n, ...VOICE_ALIASES[n]].some((x) => v.name.includes(x))));
    return ms.length ? `瀏覽器內建微軟 AI 語音(${ms.map((n) => VOICE_ALIASES[n][0]).join('・')})`
      : '瀏覽器語音(未偵測到微軟曉臻/雲哲/曉雨,建議用 Edge 瀏覽器開啟)';
  }

  setMuted(m) {
    this.muted = m;
    if (m) this.stopAll();
  }

  stopAll() {
    this.announceQueue.length = 0;
    this.announcing?.stop();
    this.announcing = null;
    for (const h of [...this.talks]) h.stop();
    this.talks.clear();
  }

  /**
   * 對話台詞:每段各自播放,可與其他對話、廣播同時進行(不互相打斷);ids 為陣列時同一段內依序念出。
   * anchor:說話者的 THREE.Object3D,UI 用來把漫畫對話框貼在人物頭上。
   */
  talk(ids, anchor = null, onEnd = null) {
    let h = null; // 台詞不存在時 onEnd 可能同步觸發,故先宣告
    h = this._playSeq([].concat(ids), { channel: 'talk', anchor }, () => {
      this.talks.delete(h);
      onEnd?.();
    });
    if (h.running) this.talks.add(h);
  }

  /** 廣播(彼此排隊播放,但不受對話影響),UI 以 LED 跑馬燈顯示。 */
  announce(ids) {
    this.announceQueue.push([].concat(ids));
    if (!this.announcing) this._nextAnnounce();
  }

  _nextAnnounce() {
    const ids = this.announceQueue.shift();
    if (!ids) { this.announcing = null; return; }
    this.announcing = this._playSeq(ids, { channel: 'announce' }, () => this._nextAnnounce());
  }

  /** 有對話正在發聲時廣播降為 75%,否則 100%(對話恆為 100%)。 */
  _duck() {
    const v = this.speaking > 0 ? 0.75 : 1;
    if (this.announceAudio) this.announceAudio.volume = v;
    if (this.announceGain) this.announceGain.gain.setTargetAtTime(v, this.announceGain.context.currentTime, 0.06);
  }

  /** 以 WebAudio 播放預先下載的音檔(可任意多段同時) */
  _playBuffer(ctx, id, talk, done) {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    let live = true, stopped = false, src = null;
    const end = () => {
      if (!live) return;
      live = false;
      if (talk) { this.speaking--; this._duck(); } else if (this.announceGain === gain) this.announceGain = null;
      setTimeout(() => gain.disconnect(), 200);
    };
    if (talk) { this.speaking++; this._duck(); } else { this.announceGain = gain; this._duck(); }
    this._decode(ctx, id).then((buf) => {
      if (stopped) return;
      src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gain);
      src.onended = () => { end(); if (!stopped) done(); };
      src.start();
    }).catch(() => { end(); if (!stopped) done(); });
    return { stop: () => { stopped = true; end(); try { src?.stop(); } catch { /* 尚未開始 */ } } };
  }

  _playSeq(ids, meta, onEnd) {
    let stopped = false;
    let cur = null;
    const h = { running: true, stop: () => { stopped = true; h.running = false; cur?.stop(); } };
    const run = (i) => {
      if (stopped) return;
      if (i >= ids.length) { h.running = false; onEnd(); return; }
      // 項目可為 'id' 或 { id, anchor }(同一段對話中換人說話)
      const it = ids[i];
      const m = typeof it === 'string' ? meta : { ...meta, anchor: it.anchor ?? meta.anchor };
      cur = this._play(typeof it === 'string' ? it : it.id, m, () => run(i + 1));
    };
    run(0);
    return h;
  }

  _play(id, meta, done) {
    const line = this.lines.get(id);
    if (!line) { console.warn('[voice] 未定義台詞', id); done(); return null; }
    this.onSubtitle?.({ ...meta, role: line.role, label: ROLE_LABEL[line.role] || '', text: line.text });
    // 別節車廂的對話聽不到(只有字幕)
    const audible = !(meta.channel === 'talk' && meta.anchor && this.hearing && this.hearing(meta.anchor) <= 0.01);
    if (this.muted || !audible) {
      const t = setTimeout(done, 400 + line.text.length * 120);
      return { stop: () => clearTimeout(t) };
    }
    const useFile = this.mode !== 'browser' && this.files.has(id);
    if (!useFile && this.mode === 'files') { // 只用預錄但缺檔:只顯示字幕
      const t = setTimeout(done, 400 + line.text.length * 120);
      return { stop: () => clearTimeout(t) };
    }
    const ctx = this.getCtx?.();
    // AudioContext 暫停中(例如尚未有使用者操作)就不排進 WebAudio,否則恢復時會一次全部播出
    if (useFile && ctx?.state === 'running' && this.raw.has(id)) return this._playBuffer(ctx, id, meta.channel === 'talk', done);
    if (useFile) {
      // 備援(尚未下載完成或沒有 AudioContext):直接用 <audio> 播放
      const a = new Audio(`${this.base}/${id}.mp3`);
      const talk = meta.channel === 'talk';
      let live = true;
      const end = () => {
        if (!live) return;
        live = false;
        a.onended = a.onerror = null;
        if (talk) { this.speaking--; this._duck(); } else if (this.announceAudio === a) this.announceAudio = null;
      };
      if (talk) { this.speaking++; this._duck(); } else { this.announceAudio = a; this._duck(); }
      a.onended = () => { end(); done(); };
      a.onerror = () => { end(); done(); };
      a.play().catch(() => { end(); done(); });
      return { stop: () => { end(); a.pause(); } };
    }
    return this._speak(line, done);
  }

  /** 備援:瀏覽器語音(無法同時發聲,會依序念出);正式版本請產生 Azure 音檔。 */
  _speak(line, done) {
    if (!('speechSynthesis' in window)) {
      const t = setTimeout(done, 400 + line.text.length * 120);
      return { stop: () => clearTimeout(t) };
    }
    const cfg = VOICES[line.role];
    const u = new SpeechSynthesisUtterance(line.text);
    u.lang = cfg.lang;
    // Edge 內建的微軟 AI 語音名稱為中文(例:「Microsoft 曉臻 Online (Natural)」),其他平台可能是英文名;
    // 找不到指定聲音時,優先挑同語言的 Online (Natural) AI 語音,最後才用舊式語音
    const short = cfg.voice.split('-')[2]?.replace('Neural', '');
    const names = [short, ...(VOICE_ALIASES[short] || [])].filter(Boolean);
    const sameLang = (v) => v.lang === cfg.lang || v.lang.replace('_', '-') === cfg.lang;
    u.voice = this.synthVoices.find((v) => names.some((n) => v.name.includes(n)))
      || this.synthVoices.find((v) => sameLang(v) && /Natural|Online/.test(v.name))
      || this.synthVoices.find(sameLang)
      || this.synthVoices.find((v) => v.lang.startsWith(cfg.lang.slice(0, 2))) || null;
    const pct = (s) => (s ? parseFloat(s) / 100 : 0);
    u.pitch = 1 + pct(cfg.pitch);
    u.rate = 1 + pct(cfg.rate);
    let finished = false;
    const fin = () => { if (!finished) { finished = true; done(); } };
    u.onend = fin;
    u.onerror = fin;
    speechSynthesis.speak(u);
    // 保險:部分瀏覽器不觸發 onend
    const guard = setTimeout(fin, 1500 + line.text.length * 260);
    return { stop: () => { clearTimeout(guard); finished = true; } };
  }
}
