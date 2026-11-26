// src/audio.js — 《星塵貓大作戰》原生 Web Audio API 療癒 BGM 預排程器與音效合成引擎

import { STAGES } from './config.js';

// MIDI 音高轉頻率工具
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 吃星塵連擊五聲音階（C5 起跳跨兩個八度，柔美不刺耳）
const GEM_PENTATONIC_MIDI = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];

// 3 個關卡 + 茶會 Ending 專屬 32 步（4 小節八分音符）療癒循環樂譜
const BGM_PATTERNS = {
  // 第 1 關：星夜野餐草地 — 八音盒搖籃曲（80 BPM，C 大調溫柔跳躍）
  musicbox: {
    bpm: 80,
    stepsPerBeat: 2,
    totalSteps: 32,
    melody: [
      72, null, 76, null, 79, null, 84, 83,
      81, null, 79, null, 76, null, null, null,
      74, null, 77, null, 81, null, 79, 77,
      76, null, 74, null, 72, null, null, null,
    ],
    arp: [
      60, 64, 67, 64, 60, 64, 67, 64,
      57, 60, 64, 60, 57, 60, 64, 60,
      53, 57, 60, 57, 55, 59, 62, 59,
      60, 64, 67, 64, 60, 64, 67, 72,
    ],
    bass: [
      48, null, null, null, null, null, null, null,
      45, null, null, null, null, null, null, null,
      41, null, null, null, 43, null, null, null,
      48, null, null, null, null, null, null, null,
    ],
  },

  // 第 2 關：晚霞燈籠夜市 — 暖感 Lo-Fi 電鋼琴（86 BPM，Fmaj7 - Em7 - Dm7 - Cmaj7）
  lofi_epiano: {
    bpm: 86,
    stepsPerBeat: 2,
    totalSteps: 32,
    chords: {
      0: [53, 57, 60, 64],  // Fmaj7
      8: [52, 55, 59, 62],  // Em7
      16: [50, 53, 57, 60], // Dm7
      24: [48, 52, 55, 59], // Cmaj7
    },
    melody: [
      null, null, 72, null, 76, 74, 72, null,
      null, 71, 74, null, 71, null, 67, null,
      null, null, 69, null, 72, 74, 76, null,
      74, null, 72, null, 67, null, null, null,
    ],
    bass: [
      41, null, null, 41, null, null, 45, null,
      40, null, null, 40, null, null, 43, null,
      38, null, null, 38, null, null, 41, null,
      36, null, null, 36, null, null, 43, null,
    ],
  },

  // 第 3 關：月華竹林溫泉 — 和風古箏五聲音階（92 BPM，D Yo 五聲 D-E-G-A-B）
  koto_pentatonic: {
    bpm: 92,
    stepsPerBeat: 2,
    totalSteps: 32,
    melody: [
      74, null, 76, 79, 81, null, 79, null,
      76, null, 74, null, 71, null, 69, null,
      67, null, 69, 71, 74, null, 76, 79,
      81, null, 76, null, 74, null, null, null,
    ],
    arp: [
      62, null, 67, null, 69, null, 74, null,
      62, null, 69, null, 71, null, 69, null,
      59, null, 62, null, 67, null, 69, null,
      62, null, 67, null, 69, 74, null, null,
    ],
    flute: {
      0: 74,
      16: 79,
    },
  },
};

// ---------------------------------------------------------------------------
// 主音訊合成與預排程引擎
// ---------------------------------------------------------------------------

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.compressor = null;
    this.noiseBuffer = null;

    this.unlocked = false;
    this.muted = false;

    // Lookahead Scheduler 狀態
    this.isPlayingBgm = false;
    this.currentTheme = 'musicbox';
    this.currentBpm = 80;
    this.currentStep = 0;
    this.nextNoteTime = 0;
    this.schedulerTimerId = null;
    this.lookaheadMs = 25;
    this.scheduleAheadSec = 0.14;

    // 吃星塵五聲音階連擊追蹤
    this.gemCombo = 0;
    this.lastGemAt = 0;

    // 防止同幀武器音效過密疊加
    this._lastWeaponSfxAt = 0;

    this._boundVisibility = this._onVisibilityChange.bind(this);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._boundVisibility);
    }
  }

  _ensureContext() {
    if (this.ctx) {
      return this.ctx;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      return null;
    }

    this.ctx = new AudioCtx();

    // 柔和動態壓縮器，避免多音效同時觸發時在 iPhone 喇叭破音
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-16, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(18, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.88, this.ctx.currentTime);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.setValueAtTime(0.42, this.ctx.currentTime);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(0.62, this.ctx.currentTime);

    this.bgmGain.connect(this.compressor);
    this.sfxGain.connect(this.compressor);
    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.noiseBuffer = this._createSoftNoiseBuffer(this.ctx);
    return this.ctx;
  }

  _createSoftNoiseBuffer(ctx) {
    const length = Math.floor(ctx.sampleRate * 0.2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }
    return buffer;
  }

  /**
   * 綁定於首次使用者點擊／觸碰呼叫，確保 iPhone Safari 順利解鎖 Web Audio
   */
  unlockAudio() {
    const ctx = this._ensureContext();
    if (!ctx) {
      return false;
    }

    try {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      if (!this.unlocked) {
        // 播放極短無聲緩衝解鎖 iOS Safari 音訊硬體管線
        const silentBuf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = silentBuf;
        src.connect(ctx.destination);
        src.start(0);
        this.unlocked = true;
      }

      // 若在解鎖前已呼叫 startBgm，解鎖當下自動補排時間軸
      if (this.isPlayingBgm && this.schedulerTimerId === null) {
        this.nextNoteTime = ctx.currentTime + 0.06;
        this._startSchedulerLoop();
      }
      return true;
    } catch (_err) {
      return false;
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.88, now, 0.025);
    }
    return this.muted;
  }

  _onVisibilityChange() {
    if (!this.ctx) {
      return;
    }
    if (document.hidden) {
      if (this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    } else if (!this.muted && this.unlocked) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          if (this.isPlayingBgm && this.ctx) {
            this.nextNoteTime = Math.max(this.nextNoteTime, this.ctx.currentTime + 0.06);
          }
        }).catch(() => {});
      }
    }
  }

  // -------------------------------------------------------------------------
  // Lookahead Scheduler 循環 BGM 控制
  // -------------------------------------------------------------------------

  startStageBgm(stageIdOrObj) {
    const stage =
      stageIdOrObj && typeof stageIdOrObj === 'object'
        ? stageIdOrObj
        : STAGES.find((s) => s.id === stageIdOrObj) || STAGES[0];
    this.startBgm(stage.bgmTheme, stage.bpm);
  }

  startBgm(themeName = 'musicbox', bpmOverride = null) {
    const pattern = BGM_PATTERNS[themeName] || BGM_PATTERNS.musicbox;
    const nextTheme = BGM_PATTERNS[themeName] ? themeName : 'musicbox';
    const nextBpm = bpmOverride || pattern.bpm;

    if (this.isPlayingBgm && this.currentTheme === nextTheme && this.currentBpm === nextBpm) {
      return;
    }

    this.currentTheme = nextTheme;
    this.currentBpm = nextBpm;
    this.currentStep = 0;
    this.isPlayingBgm = true;

    const ctx = this._ensureContext();
    if (!ctx) {
      return;
    }

    if (ctx.state === 'suspended' && this.unlocked) {
      ctx.resume().catch(() => {});
    }

    this.nextNoteTime = ctx.currentTime + 0.08;
    this._startSchedulerLoop();
  }

  stopBgm() {
    this.isPlayingBgm = false;
    if (this.schedulerTimerId !== null) {
      window.clearInterval(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
  }

  _startSchedulerLoop() {
    if (this.schedulerTimerId !== null) {
      window.clearInterval(this.schedulerTimerId);
    }
    this.schedulerTimerId = window.setInterval(() => {
      this._schedulerTick();
    }, this.lookaheadMs);
  }

  _schedulerTick() {
    if (!this.isPlayingBgm || !this.ctx || this.ctx.state !== 'running') {
      return;
    }

    const pattern = BGM_PATTERNS[this.currentTheme] || BGM_PATTERNS.musicbox;
    const stepDuration = 60 / this.currentBpm / pattern.stepsPerBeat;

    // 防止切換分頁回來時間軸落後造成一口氣連播
    if (this.nextNoteTime < this.ctx.currentTime - 0.25) {
      this.nextNoteTime = this.ctx.currentTime + 0.05;
    }

    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadSec) {
      this._schedulePatternStep(this.currentTheme, pattern, this.currentStep, this.nextNoteTime, stepDuration);
      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % pattern.totalSteps;
    }
  }

  _schedulePatternStep(theme, pattern, step, time, stepDur) {
    if (theme === 'musicbox') {
      const m = pattern.melody[step];
      if (m !== null && m !== undefined) {
        this._playMusicBoxNote(midiToFreq(m), time, 0.22, 1.05);
      }
      const a = pattern.arp[step];
      if (a !== null && a !== undefined) {
        this._playMusicBoxNote(midiToFreq(a), time, 0.085, 0.55);
      }
      const b = pattern.bass[step];
      if (b !== null && b !== undefined) {
        this._playWarmPadNote(midiToFreq(b), time, stepDur * 7.2, 0.14);
      }
      return;
    }

    if (theme === 'lofi_epiano') {
      const chord = pattern.chords[step];
      if (chord) {
        for (let i = 0; i < chord.length; i++) {
          // 輕微人味琶音延遲，模擬電鋼琴溫柔滾奏
          this._playEpianoNote(midiToFreq(chord[i]), time + i * 0.018, stepDur * 7.6, 0.09);
        }
      }
      const m = pattern.melody[step];
      if (m !== null && m !== undefined) {
        this._playEpianoNote(midiToFreq(m), time, stepDur * 2.2, 0.14);
      }
      const b = pattern.bass[step];
      if (b !== null && b !== undefined) {
        this._playWarmPadNote(midiToFreq(b), time, stepDur * 2.6, 0.15);
      }
      // 極輕柔 Lo-Fi 爵士鼓刷節拍（拍點 2 與 4）
      if (step % 4 === 2) {
        this._playSoftBrush(time, 0.045);
      }
      return;
    }

    // koto_pentatonic：和風古箏撥弦 + 溫泉竹笛長音
    const m = pattern.melody[step];
    if (m !== null && m !== undefined) {
      this._playKotoPluck(midiToFreq(m), time, 0.22, 0.95);
    }
    const a = pattern.arp[step];
    if (a !== null && a !== undefined) {
      this._playKotoPluck(midiToFreq(a), time, 0.11, 0.72);
    }
    const fluteMidi = pattern.flute && pattern.flute[step];
    if (fluteMidi !== undefined) {
      this._playWarmPadNote(midiToFreq(fluteMidi), time, stepDur * 14, 0.075);
    }
  }

  // -------------------------------------------------------------------------
  // 3 種治癒音色合成器（八音盒、Lo-Fi 電鋼琴、和風古箏）
  // -------------------------------------------------------------------------

  _playMusicBoxNote(freq, time, volume, decaySec) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const gain = ctx.createGain();
    const overtoneGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(freq * 2, time);

    overtoneGain.gain.setValueAtTime(0.18, time);
    overtoneGain.gain.exponentialRampToValueAtTime(0.001, time + decaySec * 0.35);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + decaySec);

    osc.connect(gain);
    overtone.connect(overtoneGain);
    overtoneGain.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(time);
    overtone.start(time);
    osc.stop(time + decaySec + 0.03);
    overtone.stop(time + decaySec + 0.03);
  }

  _playEpianoNote(freq, time, duration, volume) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const bell = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const bellGain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    // 微量 Lo-Fi 暖感音高漂移
    osc.detune.setValueAtTime((Math.random() - 0.5) * 6, time);

    bell.type = 'sine';
    bell.frequency.setValueAtTime(freq * 3, time);

    bellGain.gain.setValueAtTime(0.07, time);
    bellGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1450, time);
    filter.frequency.exponentialRampToValueAtTime(680, time + duration);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + duration);

    osc.connect(filter);
    bell.connect(bellGain);
    bellGain.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(time);
    bell.start(time);
    osc.stop(time + duration + 0.04);
    bell.stop(time + duration + 0.04);
  }

  _playKotoPluck(freq, time, volume, decaySec) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    // 古箏撥弦瞬間極短微上推音高，呈現彈撥張力
    osc.frequency.setValueAtTime(freq * 1.008, time);
    osc.frequency.exponentialRampToValueAtTime(freq, time + 0.035);

    filter.type = 'lowpass';
    filter.Q.setValueAtTime(2.2, time);
    filter.frequency.setValueAtTime(Math.min(3400, freq * 5.2), time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(380, freq * 1.3), time + decaySec * 0.75);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + decaySec);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(time);
    osc.stop(time + decaySec + 0.03);
  }

  _playWarmPadNote(freq, time, duration, volume) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    const attack = Math.min(0.28, duration * 0.25);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + duration);

    osc.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(time);
    osc.stop(time + duration + 0.04);
  }

  _playSoftBrush(time, volume) {
    if (!this.noiseBuffer) {
      return;
    }
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    src.buffer = this.noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, time);
    filter.Q.setValueAtTime(1.2, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + 0.075);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);

    src.start(time);
    src.stop(time + 0.09);
  }

  // -------------------------------------------------------------------------
  // 互動與戰鬥療癒音效
  // -------------------------------------------------------------------------

  _canPlaySfx() {
    if (this.muted) {
      return false;
    }
    const ctx = this._ensureContext();
    return Boolean(ctx && ctx.state === 'running');
  }

  /**
   * 吃星塵音效：隨連擊順暢遞升五聲音階
   */
  playGemCollect() {
    if (!this._canPlaySfx()) {
      return;
    }
    const now = this.ctx.currentTime;
    if (now - this.lastGemAt < 0.58) {
      this.gemCombo = Math.min(GEM_PENTATONIC_MIDI.length - 1, this.gemCombo + 1);
    } else {
      this.gemCombo = 0;
    }
    this.lastGemAt = now;

    const midi = GEM_PENTATONIC_MIDI[this.gemCombo];
    const freq = midiToFreq(midi);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.02, now + 0.09);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * 升級星光大九和弦琶音
   */
  playLevelUp() {
    if (!this._canPlaySfx()) {
      return;
    }
    const now = this.ctx.currentTime;
    const notes = [60, 64, 67, 71, 74, 79]; // Cmaj9 閃耀上升
    for (let i = 0; i < notes.length; i++) {
      const t = now + i * 0.062;
      const freq = midiToFreq(notes[i]);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.55);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.58);
    }
  }

  /**
   * 受傷柔音（溫暖鈍音下降，給予清楚回饋但不驚嚇）
   */
  playHurt() {
    if (!this._canPlaySfx()) {
      return;
    }
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(118, now + 0.22);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(620, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.24);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  /**
   * Boss 擊敗慶祝音效（歡快星光凱旋樂句 + 高音星塵點綴）
   */
  playBossDefeat() {
    if (!this._canPlaySfx()) {
      return;
    }
    const now = this.ctx.currentTime;
    const fanfare = [
      { midi: 60, delay: 0.0, dur: 0.22, vol: 0.24 },
      { midi: 64, delay: 0.09, dur: 0.22, vol: 0.24 },
      { midi: 67, delay: 0.18, dur: 0.22, vol: 0.26 },
      { midi: 72, delay: 0.28, dur: 0.48, vol: 0.3 },
      { midi: 76, delay: 0.36, dur: 0.62, vol: 0.24 },
      { midi: 79, delay: 0.45, dur: 0.78, vol: 0.24 },
      { midi: 84, delay: 0.56, dur: 0.95, vol: 0.26 },
    ];

    for (let i = 0; i < fanfare.length; i++) {
      const n = fanfare[i];
      const t = now + n.delay;
      const osc = this.ctx.createOscillator();
      const harm = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(midiToFreq(n.midi), t);

      harm.type = 'sine';
      harm.frequency.setValueAtTime(midiToFreq(n.midi + 12), t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(n.vol, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + n.dur);

      osc.connect(gain);
      harm.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      harm.start(t);
      osc.stop(t + n.dur + 0.04);
      harm.stop(t + n.dur + 0.04);
    }
  }

  /**
   * 輕量武器發射／命中回饋音（內建節流，避免大量彈幕吵雜）
   */
  playWeapon(weaponId) {
    if (!this._canPlaySfx()) {
      return;
    }
    const now = this.ctx.currentTime;
    if (now - this._lastWeaponSfxAt < 0.075) {
      return;
    }
    this._lastWeaponSfxAt = now;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (weaponId === 'yarn_lightning') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(980, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.11);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.12);
    } else if (weaponId === 'box_airdrop') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(72, now + 0.16);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.18);
    } else if (weaponId === 'bubble_shield') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(460, now);
      osc.frequency.exponentialRampToValueAtTime(740, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.1);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(weaponId === 'fish_boomerang' ? 540 : 680, now);
      osc.frequency.exponentialRampToValueAtTime(860, now + 0.07);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.085);
    }

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * 拾取驚喜道具（大磁鐵、魚湯、祈願鈴鐺）清脆提示音
   */
  playPickup(type = 'magnet') {
    if (!this._canPlaySfx()) {
      return;
    }
    const now = this.ctx.currentTime;
    const seq =
      type === 'fish_soup'
        ? [67, 72, 76]
        : type === 'wish_bell'
          ? [79, 84, 88]
          : [64, 71, 76];

    for (let i = 0; i < seq.length; i++) {
      const t = now + i * 0.055;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(midiToFreq(seq[i]), t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.26);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.28);
    }
  }

  /**
   * Boss 0.8 秒預警柔和提示音
   */
  playBossWarning() {
    if (!this._canPlaySfx()) {
      return;
    }
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(587.33, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.24);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  /**
   * 星空茶會互動像素煙火綻放音效
   */
  playFirework() {
    if (!this._canPlaySfx()) {
      return;
    }
    const now = this.ctx.currentTime;

    // 輕柔綻放氣流聲
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      src.buffer = this.noiseBuffer;
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1600, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.2);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      src.start(now);
      src.stop(now + 0.22);
    }

    // 三顆隨機高音星塵閃爍叮噹
    const sparklePool = [79, 81, 84, 86, 88, 91];
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.045;
      const midi = sparklePool[Math.floor(Math.random() * sparklePool.length)];
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(midiToFreq(midi), t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.34);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.36);
    }
  }

  /**
   * UI 按鈕輕點柔音
   */
  playButton() {
    if (!this._canPlaySfx()) {
      return;
    }
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.055);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.09);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }
}

export const audio = new SoundManager();
