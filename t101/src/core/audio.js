// 音效:WebAudio 即時合成(風、電梯、腳步、鈴聲、心跳、煙火…);語音:事先產生的 mp3。
import { LINES } from '../voice.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.9;
    this.voiceVolume = 1;
    this.voiceOk = new Set();
    this.voiceCache = {};
    this.current = null;
    fetch('assets/audio/voice/manifest.json').then((r) => r.json()).then((ids) => ids.forEach((i) => this.voiceOk.add(i))).catch(() => {});
  }

  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);
    // 噪音緩衝
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const loop = (freq, type = 'lowpass', q = 0.7) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { f, g };
    };
    this.wind = loop(500, 'bandpass', 0.6);
    this.hum = loop(160, 'lowpass', 1.2);
    this.murmur = loop(900, 'bandpass', 0.4);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
    if (this.current) this.current.muted = m;
  }
  setVolume(v) { this.volume = v; if (this.master && !this.muted) this.master.gain.value = v; }
  setVoiceVolume(v) { this.voiceVolume = v; if (this.current) this.current.volume = v; }

  _set(node, v, tc = 0.25) { if (this.ctx) node.gain.setTargetAtTime(v, this.ctx.currentTime, tc); }
  /** 風聲:strength 0~1。 */
  setWind(strength) {
    if (!this.ctx) return;
    this._set(this.wind.g, strength * 0.35);
    this.wind.f.frequency.setTargetAtTime(300 + strength * 700, this.ctx.currentTime, 0.4);
  }
  /** 電梯運轉:speed 0~1。 */
  setHum(speed) {
    if (!this.ctx) return;
    this._set(this.hum.g, speed > 0 ? 0.08 + speed * 0.18 : 0);
    this.hum.f.frequency.setTargetAtTime(90 + speed * 220, this.ctx.currentTime, 0.3);
  }
  setMurmur(v) { if (this.ctx) this._set(this.murmur.g, v * 0.05, 0.8); }

  tone(freq, dur, { type = 'sine', gain = 0.2, delay = 0, slide = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  noise(dur, { freq = 1000, type = 'bandpass', gain = 0.3, delay = 0, q = 1, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  ding() { this.tone(1318, 0.9, { gain: 0.18 }); this.tone(1046, 1.2, { gain: 0.16, delay: 0.35 }); }
  click() { this.tone(900, 0.05, { type: 'square', gain: 0.05 }); }
  step(hard = false) { this.noise(0.08, { freq: hard ? 300 : 180, gain: hard ? 0.25 : 0.14, type: 'lowpass' }); }
  grab() { this.noise(0.06, { freq: 2200, gain: 0.08 }); this.tone(220, 0.05, { type: 'triangle', gain: 0.05 }); }
  slip() { this.noise(0.4, { freq: 3000, gain: 0.15, type: 'highpass' }); }
  heartbeat(level) {
    this.tone(60, 0.12, { gain: 0.12 + level * 0.15, slide: -20 });
    this.tone(55, 0.12, { gain: 0.08 + level * 0.12, slide: -20, delay: 0.17 });
  }
  steam() { this.noise(1.8, { freq: 4000, type: 'highpass', gain: 0.08, attack: 0.2 }); }
  cheer() { this.noise(2.5, { freq: 1200, q: 0.3, gain: 0.25, attack: 0.3 }); for (let i = 0; i < 6; i++) this.noise(0.15, { freq: 2000 + i * 300, gain: 0.08, delay: i * 0.18 }); }
  beep(hi = false) { this.tone(hi ? 1320 : 880, hi ? 0.6 : 0.2, { type: 'square', gain: 0.08 }); }
  correct() { this.tone(880, 0.15, { gain: 0.15 }); this.tone(1320, 0.3, { gain: 0.15, delay: 0.12 }); }
  wrong() { this.tone(220, 0.5, { type: 'sawtooth', gain: 0.12, slide: -80 }); }
  whoosh() { this.noise(1.2, { freq: 800, q: 0.5, gain: 0.3, attack: 0.3 }); }
  chute() { this.noise(0.5, { freq: 400, q: 0.4, gain: 0.4, attack: 0.02, type: 'lowpass' }); }
  thud() { this.tone(60, 0.6, { gain: 0.5, slide: -30 }); this.noise(0.4, { freq: 200, type: 'lowpass', gain: 0.5 }); }
  /** 煙火:發射(咻)與爆炸(碰),distance 影響音量與延遲。 */
  fireworkLaunch(dist) { const k = Math.max(0.05, 1 - dist / 900); this.noise(0.9, { freq: 1800, q: 4, gain: 0.12 * k, attack: 0.1 }); }
  fireworkBoom(dist) {
    const k = Math.max(0.05, 1 - dist / 1200);
    const delay = Math.min(2, dist / 343);
    this.tone(70, 0.9, { gain: 0.5 * k, slide: -40, delay });
    this.noise(1.4, { freq: 600, type: 'lowpass', gain: 0.45 * k, delay });
    for (let i = 0; i < 5; i++) this.noise(0.05, { freq: 5000, type: 'highpass', gain: 0.05 * k, delay: delay + 0.3 + Math.random() * 0.8 });
  }

  /** 播放語音(事先產生的音檔)。 */
  say(id, { onEnd } = {}) {
    if (!this.voiceOk.has(id)) { onEnd && onEnd(); return null; }
    if (this.current) { this.current.pause(); this.current = null; }
    let a = this.voiceCache[id];
    if (!a) { a = new window.Audio(`assets/audio/voice/${id}.mp3`); this.voiceCache[id] = a; }
    a.currentTime = 0;
    a.muted = this.muted;
    a.volume = this.voiceVolume;
    a.onended = () => { if (this.current === a) this.current = null; onEnd && onEnd(); };
    a.play().catch(() => onEnd && onEnd());
    this.current = a;
    return LINES.find((l) => l.id === id)?.text;
  }
}
