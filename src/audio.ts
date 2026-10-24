// Synthesised sound effects (WebAudio, no files). Starts after the first user gesture.
export class Sfx {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // continuous wind bed, gain follows speed
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.7;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  wind(speed: number): void {
    if (!this.ctx || !this.windGain || !this.windFilter) return;
    const k = Math.min(1, Math.max(0, (speed - 4) / 16));
    this.windGain.gain.setTargetAtTime(k * 0.35, this.ctx.currentTime, 0.1);
    this.windFilter.frequency.setTargetAtTime(350 + k * 1100, this.ctx.currentTime, 0.1);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, freq: number, vol: number, type: BiquadFilterType = 'highpass', delay = 0): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  fire(): void {
    this.burst(0.18, 2500, 0.35);
    this.tone(900, 0.16, 'square', 0.08, 2400);
  }
  attach(): void {
    this.tone(1320, 0.5, 'triangle', 0.18);
    this.tone(1980, 0.35, 'sine', 0.1);
    this.burst(0.06, 4000, 0.3);
  }
  short(): void {
    this.tone(500, 0.35, 'sawtooth', 0.09, 160);
    this.burst(0.25, 900, 0.2, 'bandpass', 0.05);
  }
  creak(): void {
    this.tone(140, 0.5, 'sawtooth', 0.12, 70);
    this.burst(0.4, 300, 0.25, 'lowpass');
  }
  boing(): void {
    this.tone(180, 0.45, 'sine', 0.35, 520);
    this.tone(90, 0.3, 'triangle', 0.2, 60);
  }
  land(hard: boolean): void {
    this.burst(hard ? 0.25 : 0.12, hard ? 300 : 700, hard ? 0.45 : 0.25, 'lowpass');
    if (hard) this.tone(80, 0.2, 'sine', 0.3, 40);
  }
  jump(): void {
    this.burst(0.08, 1500, 0.12);
  }
  release(): void {
    this.burst(0.3, 1200, 0.25, 'bandpass');
    this.tone(600, 0.25, 'sine', 0.08, 1200);
  }
  flap(): void {
    for (let i = 0; i < 5; i++) this.burst(0.05, 1800, 0.12, 'bandpass', i * 0.06);
  }
  click(): void {
    this.tone(1200, 0.05, 'square', 0.05);
  }
  focusOn(): void {
    this.tone(400, 0.4, 'sine', 0.1, 200);
  }
  medal(kind: string): void {
    const notes = kind === 'gold' ? [523, 659, 784, 1047] : kind === 'silver' ? [523, 659, 784] : [523, 659];
    notes.forEach((n, i) => this.tone(n, 0.4, 'triangle', 0.18, undefined, i * 0.12));
  }
}
