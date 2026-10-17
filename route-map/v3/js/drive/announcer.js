/**
 * announcer.js
 * 車內廣播:把一段廣播拆成依序播放的片段
 *   { clip: 'zh_next' }       固定用語 → Azure TTS 預先產生的 mp3(assets/audio);缺檔時改用瀏覽器語音念 PHRASES 文字
 *   { say: '台北車站', lang } 站名/路線名(玩家輸入)→ 瀏覽器/作業系統內建語音即時合成(Web Speech API)
 *   { chime: 'arrive' }       提示音(WebAudio 合成,無需音檔)
 */
import { PHRASES, LANG_TAG } from './phrases.js';

const AUDIO_BASE = 'assets/audio/';

export class Announcer {
    constructor() {
        this.manifest = null;
        this.queue = [];
        this.playing = false;
        this.volume = 0.9;
        this.muted = false;
        this.english = true;
        this.cache = new Map();
        this.ctx = null;
        this.token = 0;
        this.voices = { zh: null, en: null };
        this.onState = null;
        this._loadVoices();
        if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = () => this._loadVoices();
    }

    async init() {
        try {
            const r = await fetch(AUDIO_BASE + 'manifest.json', { cache: 'no-cache' });
            if (r.ok) this.manifest = await r.json();
        } catch { /* 沒有音檔時全部改用瀏覽器語音 */ }
        // 預先載入
        Object.entries(this.manifest?.files || {}).forEach(([k, f]) => {
            const a = new Audio(AUDIO_BASE + f.file);
            a.preload = 'auto';
            this.cache.set(k, a);
        });
        return this;
    }

    /** 固定用語的來源說明(顯示於設定畫面) */
    get sourceLabel() {
        const n = Object.keys(this.manifest?.files || {}).length;
        return n ? `Azure TTS 音檔 ${n}/${Object.keys(PHRASES).length} 則` : '尚未產生 Azure 音檔,改用瀏覽器語音';
    }

    _loadVoices() {
        if (typeof speechSynthesis === 'undefined') return;
        const all = speechSynthesis.getVoices();
        const pick = (tag, prefer) => {
            const cands = all.filter(v => v.lang && v.lang.replace('_', '-').toLowerCase().startsWith(tag.toLowerCase()));
            return cands.find(v => prefer.some(p => v.name.includes(p))) || cands[0] || null;
        };
        this.voices.zh = pick('zh-TW', ['HsiaoChen', 'Hsiao', 'Yating', 'Hanhan', 'Google', 'Natural']) || pick('zh', ['Natural', 'Google']);
        this.voices.en = pick('en-US', ['Jenny', 'Aria', 'Natural', 'Google', 'Zira']) || pick('en', []);
    }

    _audioCtx() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    }

    /** 使用者第一次互動時呼叫,解除瀏覽器的自動播放限制 */
    unlock() {
        this._audioCtx();
        if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices();
    }

    // ------------------------------------------------------------------

    /** 播放一段廣播(會中斷目前廣播) */
    announce(parts, label = '') {
        this.stop();
        // 關閉英文廣播時,略過英文用語與英文段落內的站名(en: true)
        this.queue = parts.filter(p => p && (this.english || !(p.en || (p.lang || PHRASES[p.clip]?.lang) === 'en')));
        this.label = label;
        this._next(++this.token);
    }

    stop() {
        this.token++;
        this.queue = [];
        this.playing = false;
        if (this.current) { try { this.current.pause(); } catch { /* */ } this.current = null; }
        if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
        if (this.onState) this.onState(false, '');
    }

    _next(tok) {
        if (tok !== this.token) return;
        const p = this.queue.shift();
        if (!p) { this.playing = false; if (this.onState) this.onState(false, ''); return; }
        this.playing = true;
        if (this.onState) this.onState(true, this.label);
        const done = () => setTimeout(() => this._next(tok), p.gap ?? 120);
        if (this.muted) { done(); return; }
        if (p.chime) this._chime(p.chime).then(done);
        else if (p.clip) this._clip(p.clip).then(done);
        else if (p.say) this._say(p.say, p.lang || 'zh').then(done);
        else done();
    }

    _clip(key) {
        const a = this.cache.get(key);
        if (!a) {
            const ph = PHRASES[key];
            return ph ? this._say(ph.text, ph.lang) : Promise.resolve();
        }
        return new Promise(res => {
            a.currentTime = 0;
            a.volume = this.volume;
            this.current = a;
            const end = () => { a.onended = a.onerror = null; res(); };
            a.onended = end;
            a.onerror = end;
            a.play().catch(() => { const ph = PHRASES[key]; (ph ? this._say(ph.text, ph.lang) : Promise.resolve()).then(res); });
        });
    }

    _say(text, lang) {
        if (typeof speechSynthesis === 'undefined' || !text) return Promise.resolve();
        return new Promise(res => {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = LANG_TAG[lang] || lang;
            const v = this.voices[lang];
            if (v) u.voice = v;
            u.rate = 0.95;
            u.volume = this.volume;
            let finished = false;
            const end = () => { if (!finished) { finished = true; clearTimeout(guard); res(); } };
            u.onend = end;
            u.onerror = end;
            // 部分瀏覽器偶爾不觸發 onend:依字數估計上限時間
            const guard = setTimeout(end, 1500 + text.length * (lang === 'zh' ? 420 : 110));
            speechSynthesis.speak(u);
        });
    }

    /** 提示音:arrive(三音下行)、depart(兩音上行)、door(關門警示嗶聲) */
    _chime(kind) {
        const ctx = this._audioCtx();
        if (!ctx) return Promise.resolve();
        const notes = {
            arrive: [[784, 0], [659, 0.32], [523, 0.64]],
            depart: [[523, 0], [784, 0.3]],
            door: [[1320, 0], [1320, 0.28], [1320, 0.56], [1320, 0.84], [1320, 1.12]]
        }[kind] || [[660, 0]];
        const t0 = ctx.currentTime + 0.03;
        const dur = kind === 'door' ? 0.16 : 0.9;
        notes.forEach(([f, dt]) => {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = kind === 'door' ? 'square' : 'sine';
            o.frequency.value = f;
            const v = (kind === 'door' ? 0.06 : 0.22) * this.volume;
            g.gain.setValueAtTime(0, t0 + dt);
            g.gain.linearRampToValueAtTime(v, t0 + dt + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0008, t0 + dt + dur);
            o.connect(g).connect(ctx.destination);
            o.start(t0 + dt);
            o.stop(t0 + dt + dur + 0.05);
        });
        const total = notes[notes.length - 1][1] + dur;
        return new Promise(res => setTimeout(res, total * 1000));
    }

    /** 汽笛(不進廣播佇列) */
    horn(on) {
        const ctx = this._audioCtx();
        if (!ctx) return;
        if (on && !this._horn) {
            const g = ctx.createGain();
            g.gain.value = 0;
            g.gain.linearRampToValueAtTime(0.12 * this.volume, ctx.currentTime + 0.05);
            const oscs = [370, 466].map(f => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(g); o.start(); return o; });
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 1800;
            g.connect(lp).connect(ctx.destination);
            this._horn = { g, oscs };
        } else if (!on && this._horn) {
            const { g, oscs } = this._horn;
            g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);
            oscs.forEach(o => o.stop(ctx.currentTime + 0.15));
            this._horn = null;
        }
    }

    /**
     * 關門蜂鳴(仿北捷月台/車門的「嗡嗡」聲,不進廣播佇列):
     * 兩個略為失諧的方波疊成粗糙的低頻蜂鳴,以每秒約 4 次斷續發聲。
     */
    buzzer(sec = 3) {
        const ctx = this._audioCtx();
        if (!ctx || this.muted) return;
        this.stopBuzzer();
        const t0 = ctx.currentTime + 0.02, on = 0.17, period = 0.25;
        const env = ctx.createGain();
        env.gain.value = 0;
        const v = 0.08 * this.volume;
        for (let t = 0; t + on <= sec; t += period) {
            env.gain.setValueAtTime(0, t0 + t);
            env.gain.linearRampToValueAtTime(v, t0 + t + 0.01);
            env.gain.setValueAtTime(v, t0 + t + on - 0.015);
            env.gain.linearRampToValueAtTime(0, t0 + t + on);
        }
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 2200;
        env.connect(lp).connect(ctx.destination);
        const oscs = [392, 398].map(f => {
            const o = ctx.createOscillator();
            o.type = 'square'; o.frequency.value = f;
            o.connect(env); o.start(t0); o.stop(t0 + sec + 0.05);
            return o;
        });
        this._buzz = { env, oscs };
        oscs[0].onended = () => { if (this._buzz?.oscs === oscs) this._buzz = null; };
    }

    stopBuzzer() {
        if (!this._buzz || !this.ctx) return;
        const { env, oscs } = this._buzz;
        env.gain.cancelScheduledValues(this.ctx.currentTime);
        env.gain.setValueAtTime(0, this.ctx.currentTime);
        oscs.forEach(o => { try { o.stop(); } catch { /* */ } });
        this._buzz = null;
    }

    /** 行駛噪音:隨速度改變音高/音量的低頻嗡鳴 */
    motor(speedRatio, power) {
        const ctx = this.ctx;
        if (!ctx || this.muted) { if (this._motor) this._motor.g.gain.value = 0; return; }
        if (!this._motor) {
            const g = ctx.createGain();
            g.gain.value = 0;
            const o = ctx.createOscillator();
            o.type = 'triangle';
            const o2 = ctx.createOscillator();
            o2.type = 'sine';
            o.connect(g); o2.connect(g);
            g.connect(ctx.destination);
            o.start(); o2.start();
            this._motor = { g, o, o2 };
        }
        const m = this._motor;
        const t = ctx.currentTime;
        m.o.frequency.setTargetAtTime(90 + speedRatio * 520, t, 0.1);
        m.o2.frequency.setTargetAtTime(45 + speedRatio * 160, t, 0.1);
        const vol = speedRatio < 0.005 ? 0 : (0.012 + speedRatio * 0.02 + (power ? 0.018 : 0)) * this.volume;
        m.g.gain.setTargetAtTime(vol, t, 0.15);
    }

    dispose() {
        this.stop();
        this.horn(false);
        this.stopBuzzer();
        if (this._motor) { try { this._motor.o.stop(); this._motor.o2.stop(); } catch { /* */ } this._motor = null; }
        if (this.ctx) { this.ctx.close(); this.ctx = null; }
        if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = null;
    }
}

// =====================================================
// 廣播稿
// =====================================================

const hasCJK = s => /[⺀-鿿]/.test(s || '');

/** 英文廣播念站名:有英文副站名用副站名,否則以中文語音念原名 */
function enName(st) {
    return st.sub && !hasCJK(st.sub) ? { say: st.sub, lang: 'en', en: true } : { say: st.name, lang: 'zh', en: true };
}

function transferParts(tr, lang) {
    if (!tr || (!tr.inside.length && !tr.outside.length)) return [];
    const out = [];
    const names = (lines) => lines.map(l => lang === 'zh' ? l.name : (l.code ? `${l.code} line` : l.name)).join(lang === 'zh' ? '、' : ', ');
    const en = lang === 'en';
    if (tr.inside.length) out.push({ clip: `${lang}_transfer` }, { say: names(tr.inside), lang: en && tr.inside.some(l => !l.code) ? 'zh' : lang, en });
    if (tr.outside.length) out.push({ clip: `${lang}_out_transfer` }, { say: names(tr.outside), lang: en && tr.outside.some(l => !l.code) ? 'zh' : lang, en });
    return out;
}

/** 起站發車:歡迎搭乘本列車開往 X,下一站 Y */
export function scriptDeparture({ next, terminal, nextTransfer, first }) {
    const parts = [{ chime: 'depart' }];
    if (first) parts.push({ clip: 'zh_welcome' }, { say: terminal.name, lang: 'zh', gap: 400 });
    parts.push({ clip: 'zh_next' }, { say: next.name, lang: 'zh' }, ...transferParts(nextTransfer, 'zh'));
    if (first) parts.push({ clip: 'zh_handrail', gap: 500 });
    else parts.push({ gap: 350 });
    if (first) parts.push({ clip: 'en_welcome' }, enName(terminal));
    parts.push({ clip: 'en_next' }, enName(next), ...transferParts(nextTransfer, 'en'));
    if (first) parts.push({ clip: 'en_handrail' });
    return parts;
}

/** 進站:X 到了(終點站:終點站 X 到了,請全部旅客下車)、轉乘、開門側、月台間隙 */
export function scriptArrival({ station, transfer, terminal, side }) {
    const parts = [{ chime: 'arrive' }];
    if (terminal) parts.push({ clip: 'zh_terminal' }, { say: station.name, lang: 'zh' }, { clip: 'zh_terminal_end' });
    else parts.push({ say: station.name, lang: 'zh' }, { clip: 'zh_arriving' });
    parts.push(...transferParts(transfer, 'zh'));
    parts.push({ clip: side === 'left' ? 'zh_doors_left' : 'zh_doors_right' }, { clip: 'zh_gap', gap: 450 });
    parts.push({ clip: 'en_arriving' }, enName(station));
    if (terminal) parts.push({ clip: 'en_terminal' });
    parts.push(...transferParts(transfer, 'en'));
    parts.push({ clip: side === 'left' ? 'en_doors_left' : 'en_doors_right' }, { clip: 'en_gap' });
    return parts;
}

export function scriptDoorsClosing() {
    return [{ clip: 'zh_doors_closing' }, { clip: 'en_doors_closing' }, { chime: 'door' }];
}
