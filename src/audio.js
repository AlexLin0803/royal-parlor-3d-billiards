// Procedural Web Audio API synthesizer for authentic billiard acoustics
// (phenolic ball clacks, leather cue strike, rubber cushion thumps, leather pocket drops)

export class BilliardsAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.noiseBuffer = null;
    this.lastBallHitTime = 0;
    this.lastCushionHitTime = 0;
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this._createNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted) {
    this.muted = muted;
  }

  _createNoiseBuffer() {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * 0.25);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
  }

  // Leather cue tip striking phenolic cue ball
  playCueStrike(power) {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const vol = Math.min(1, 0.18 + power * 0.82);

    // Crisp percussive wood-tip click
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520 + power * 260, now);
    osc.frequency.exponentialRampToValueAtTime(115, now + 0.045);

    gain.gain.setValueAtTime(vol * 0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);

    // Short filtered transient burst (chalked leather impact)
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1600 + power * 900, now);
      filter.Q.setValueAtTime(1.8, now);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(vol * 0.45, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);

      src.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.ctx.destination);
      src.start(now);
      src.stop(now + 0.04);
    }
  }

  // Authentic sharp phenolic resin ball-to-ball clack
  playBallHit(speed) {
    if (this.muted || !this.ctx || speed < 0.04) return;
    const now = this.ctx.currentTime;
    // Slight throttle to keep massive breaks crisp without audio overload
    if (now - this.lastBallHitTime < 0.011) return;
    this.lastBallHitTime = now;

    const intensity = Math.min(1, Math.pow(speed / 3.8, 0.85));
    const vol = 0.04 + intensity * 0.52;

    // Dual resonant phenolic modes (~2.7kHz and ~4.3kHz)
    const pitchJitter = 0.94 + Math.random() * 0.12;
    const freqs = [2650 * pitchJitter, 4250 * pitchJitter];

    for (let i = 0; i < freqs.length; i++) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[i], now);
      osc.frequency.exponentialRampToValueAtTime(freqs[i] * 0.88, now + 0.028);

      g.gain.setValueAtTime(vol * (i === 0 ? 0.55 : 0.28), now);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.03);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.034);
    }

    // Crisp transient click
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(3200 * pitchJitter, now);
      bp.Q.setValueAtTime(2.5, now);

      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(vol * 0.65, now);
      ng.gain.exponentialRampToValueAtTime(0.0008, now + 0.014);

      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.ctx.destination);
      src.start(now);
      src.stop(now + 0.02);
    }
  }

  // Muted rubber-and-wood rail cushion thump
  playCushionHit(speed) {
    if (this.muted || !this.ctx || speed < 0.05) return;
    const now = this.ctx.currentTime;
    if (now - this.lastCushionHitTime < 0.018) return;
    this.lastCushionHitTime = now;

    const intensity = Math.min(1, speed / 3.5);
    const vol = 0.06 + intensity * 0.42;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(165 + intensity * 55, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.065);

    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.072);

    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  // Hollow leather-pocket drop clunk & subtle rattle
  playPocketDrop() {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;

    const taps = [
      { delay: 0.0,  freq: 210, vol: 0.34, dur: 0.08 },
      { delay: 0.09, freq: 145, vol: 0.28, dur: 0.11 },
      { delay: 0.19, freq: 118, vol: 0.18, dur: 0.10 }
    ];

    for (const t of taps) {
      const start = now + t.delay;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(t.freq, start);
      osc.frequency.exponentialRampToValueAtTime(t.freq * 0.48, start + t.dur);

      g.gain.setValueAtTime(t.vol, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + t.dur);

      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + t.dur + 0.01);
    }
  }
}
