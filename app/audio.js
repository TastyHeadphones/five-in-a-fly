export class Sound {
  constructor() {
    this.ctx = null;
    this.on = true;
    try {
      this.on = localStorage.getItem('fiaf-sound') !== '0';
    } catch {
      /* ignore */
    }
    const start = () => this.start();
    addEventListener('pointerdown', start, { capture: true });
    addEventListener('keydown', start, { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else if (this.on) this.ctx.resume();
    });
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && this.on && !document.hidden) this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.on ? 0.62 : 0;
    this.master.connect(ctx.destination);

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const g2 = ctx.createGain();
    const lg = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    this.buzzGain = ctx.createGain();
    this.buzzGain.gain.value = 0;
    o1.type = 'sawtooth';
    o2.type = 'square';
    o1.frequency.value = 205;
    o2.frequency.value = 410.8;
    lfo.frequency.value = 6.5;
    lg.gain.value = 5;
    g2.gain.value = 0.2;
    filt.type = 'lowpass';
    filt.frequency.value = 2200;
    filt.Q.value = 0.8;
    lfo.connect(lg);
    lg.connect(o1.frequency);
    lg.connect(o2.frequency);
    o1.connect(filt);
    o2.connect(g2);
    g2.connect(filt);
    filt.connect(this.buzzGain);
    this.buzzGain.connect(this.master);
    o1.start();
    o2.start();
    lfo.start();
    this.o1 = o1;
    this.o2 = o2;
  }

  setOn(on) {
    this.on = on;
    try {
      localStorage.setItem('fiaf-sound', on ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!this.ctx) {
      if (on) this.start();
      return;
    }
    this.master.gain.setTargetAtTime(on ? 0.62 : 0, this.ctx.currentTime, 0.03);
    if (on) this.ctx.resume();
  }

  buzz(level, pitch) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.buzzGain.gain.setTargetAtTime(0.14 * level, t, 0.05);
    this.o1.frequency.setTargetAtTime(205 + (pitch || 0), t, 0.08);
    this.o2.frequency.setTargetAtTime(410.8 + 2 * (pitch || 0), t, 0.08);
  }

  note(f, at, len, type, vol, glide) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol == null ? 0.22 : vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  click() {
    this.note(180, 0, 0.05, 'square', 0.08);
    this.note(90, 0.01, 0.08, 'triangle', 0.1);
  }

  sniff() {
    this.note(740, 0, 0.07, 'sine', 0.06);
    this.note(980, 0.05, 0.09, 'sine', 0.05);
  }

  thinkTick() {
    this.note(520 + Math.random() * 80, 0, 0.04, 'triangle', 0.04);
  }

  ok() {
    this.note(988, 0, 0.16, 'triangle', 0.28);
    this.note(1319, 0.11, 0.32, 'triangle', 0.28);
  }

  ng() {
    this.note(220, 0, 0.12, 'square', 0.1);
    this.note(165, 0.13, 0.28, 'square', 0.1);
  }

  drop() {
    this.note(660, 0, 0.12, 'sine', 0.16, 220);
  }
}
