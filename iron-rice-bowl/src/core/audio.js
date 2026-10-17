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

  /** speedRatio 0~1,控制行駛噪音大小。 */
  setRumble(speedRatio) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rumbleGain.gain.setTargetAtTime(0.05 + speedRatio * 0.35, t, 0.3);
    this.rumbleFilter.frequency.setTargetAtTime(180 + speedRatio * 420, t, 0.3);
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

  chime() { [659, 523, 587, 392].forEach((f, i) => this._tone(f, 0.9, { delay: i * 0.38, gain: 0.12 })); }
  blip() { this._tone(880, 0.08, { type: 'triangle', gain: 0.1 }); }
  ok() { this._tone(660, 0.12, { gain: 0.14 }); this._tone(990, 0.18, { gain: 0.14, delay: 0.1 }); }
  bad() { this._tone(220, 0.3, { type: 'sawtooth', gain: 0.08, slide: -60 }); }
  cash() { this._tone(1320, 0.1, { gain: 0.1 }); this._tone(1760, 0.25, { gain: 0.1, delay: 0.08 }); }
  win() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.4, { delay: i * 0.15, gain: 0.14 })); }
  lose() { [392, 330, 262].forEach((f, i) => this._tone(f, 0.5, { delay: i * 0.25, gain: 0.12, type: 'triangle' })); }
}

const ROLE_LABEL = {
  attendant: '服勤員', passengerM: '乘客', passengerF: '乘客', child: '小朋友', grandma: '阿嬤',
  conductor: '列車廣播', conductorEn: '列車廣播', station: '車站廣播', stationEn: '車站廣播',
};

/**
 * 語音:兩個頻道 —— 'announce'(廣播,排隊播放)與 'talk'(對話,新的會打斷舊的)。
 */
export class Voice {
  constructor(base, onSubtitle) {
    this.base = base;
    this.onSubtitle = onSubtitle;
    this.lines = new Map(buildVoiceLines().map((l) => [l.id, l]));
    this.files = new Set();
    this.muted = false;
    this.announceQueue = [];
    this.announcing = null;
    this.talking = null;
    /**
     * 對話的可聽度:(anchor) => 0~1,由遊戲階段設定(例:不同車廂 = 0)。
     * 0 時只顯示字幕不出聲;廣播不受影響(全車都聽得到)。
     */
    this.hearing = null;
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

  get source() { return this.files.size ? `Azure TTS 音檔 ${this.files.size} 句` : '瀏覽器語音(尚未產生 Azure 音檔)'; }

  setMuted(m) {
    this.muted = m;
    if (m) this.stopAll();
  }

  stopAll() {
    this.announceQueue.length = 0;
    for (const h of [this.announcing, this.talking]) h?.stop();
    this.announcing = this.talking = null;
  }

  /**
   * 對話台詞(新的會打斷舊的);ids 可為陣列(依序念出)。
   * anchor:說話者的 THREE.Object3D,UI 用來把漫畫對話框貼在人物頭上。
   */
  talk(ids, anchor = null, onEnd = null) {
    // 整段都聽不到(別節車廂):只出字幕,不打斷附近正在說的話
    const list = [].concat(ids);
    if (this.hearing && list.every((it) => {
      const a = (typeof it === 'string' ? anchor : it.anchor ?? anchor);
      return a && this.hearing(a) <= 0.01;
    })) {
      this._playSeq(list, { channel: 'talk', anchor }, () => onEnd?.());
      return;
    }
    this.talking?.stop();
    let h = null; // 台詞不存在時 onEnd 可能同步觸發,故先宣告
    h = this._playSeq([].concat(ids), { channel: 'talk', anchor }, () => {
      if (this.talking === h) this.talking = null;
      onEnd?.();
    });
    this.talking = h;
  }

  /** 廣播(排隊播放),UI 以 LED 跑馬燈顯示。 */
  announce(ids) {
    this.announceQueue.push([].concat(ids));
    if (!this.announcing) this._nextAnnounce();
  }

  _nextAnnounce() {
    const ids = this.announceQueue.shift();
    if (!ids) { this.announcing = null; return; }
    this.announcing = this._playSeq(ids, { channel: 'announce' }, () => this._nextAnnounce());
  }

  _playSeq(ids, meta, onEnd) {
    let stopped = false;
    let cur = null;
    const run = (i) => {
      if (stopped) return;
      if (i >= ids.length) { onEnd(); return; }
      // 項目可為 'id' 或 { id, anchor }(同一段對話中換人說話)
      const it = ids[i];
      const m = typeof it === 'string' ? meta : { ...meta, anchor: it.anchor ?? meta.anchor };
      cur = this._play(typeof it === 'string' ? it : it.id, m, () => run(i + 1));
    };
    run(0);
    return { stop: () => { stopped = true; cur?.stop(); } };
  }

  _play(id, meta, done) {
    const line = this.lines.get(id);
    if (!line) { console.warn('[voice] 未定義台詞', id); done(); return null; }
    this.onSubtitle?.({ ...meta, role: line.role, label: ROLE_LABEL[line.role] || '', text: line.text });
    const gain = meta.channel === 'talk' && meta.anchor && this.hearing ? this.hearing(meta.anchor) : 1;
    if (this.muted || gain <= 0.01) {
      const t = setTimeout(done, 400 + line.text.length * 120);
      return { stop: () => clearTimeout(t) };
    }
    if (this.files.has(id)) {
      const a = new Audio(`${this.base}/${id}.mp3`);
      a.volume = Math.min(1, gain);
      a.onended = done;
      a.onerror = done;
      a.play().catch(done);
      return { stop: () => { a.onended = a.onerror = null; a.pause(); } };
    }
    return this._speak(line, done, gain);
  }

  _speak(line, done, gain = 1) {
    if (!('speechSynthesis' in window)) {
      const t = setTimeout(done, 400 + line.text.length * 120);
      return { stop: () => clearTimeout(t) };
    }
    const cfg = VOICES[line.role];
    const u = new SpeechSynthesisUtterance(line.text);
    u.lang = cfg.lang;
    const short = cfg.voice.split('-')[2]?.replace('Neural', '');
    u.voice = this.synthVoices.find((v) => short && v.name.includes(short))
      || this.synthVoices.find((v) => v.lang === cfg.lang)
      || this.synthVoices.find((v) => v.lang.startsWith(cfg.lang.slice(0, 2))) || null;
    const pct = (s) => (s ? parseFloat(s) / 100 : 0);
    u.pitch = 1 + pct(cfg.pitch);
    u.rate = 1 + pct(cfg.rate);
    u.volume = Math.min(1, gain);
    let finished = false;
    const fin = () => { if (!finished) { finished = true; done(); } };
    u.onend = fin;
    u.onerror = fin;
    speechSynthesis.speak(u);
    // 保險:部分瀏覽器不觸發 onend
    const guard = setTimeout(fin, 1500 + line.text.length * 260);
    return { stop: () => { clearTimeout(guard); finished = true; speechSynthesis.cancel(); } };
  }
}
