/**
 * Pure Web Audio API Synthetic Sound Engine (Zero External Audio Files)
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  // Continuous sound state
  private thrustGain: GainNode | null = null;
  private thrustOsc: OscillatorNode | null = null;
  private isThrustPlaying = false;

  private drillGain: GainNode | null = null;
  private drillOsc: OscillatorNode | null = null;
  private isDrillPlaying = false;

  private elevatorHumGain: GainNode | null = null;
  private elevatorHumOsc: OscillatorNode | null = null;
  private isElevatorHumPlaying = false;

  constructor() {
    // User interaction activates AudioContext
    const initAudio = () => {
      this.ensureContext();
      window.removeEventListener('keydown', initAudio);
      window.removeEventListener('click', initAudio);
    };
    window.addEventListener('keydown', initAudio);
    window.addEventListener('click', initAudio);
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopThrust();
      this.stopDrill();
      this.stopElevatorHum();
    }
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  // 1. Continuous Rocket Thruster Sound
  public startThrust() {
    if (this.muted || this.isThrustPlaying) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      this.thrustOsc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      this.thrustGain = ctx.createGain();

      this.thrustOsc.type = 'sawtooth';
      this.thrustOsc.frequency.setValueAtTime(65, ctx.currentTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(180, ctx.currentTime);

      this.thrustGain.gain.setValueAtTime(0.01, ctx.currentTime);
      this.thrustGain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.1);

      this.thrustOsc.connect(filter);
      filter.connect(this.thrustGain);
      this.thrustGain.connect(ctx.destination);

      this.thrustOsc.start();
      this.isThrustPlaying = true;
    } catch {
      // Ignore audio start errors if blocked
    }
  }

  public stopThrust() {
    if (!this.isThrustPlaying || !this.thrustGain || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      this.thrustGain.gain.setValueAtTime(this.thrustGain.gain.value, now);
      this.thrustGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      setTimeout(() => {
        if (this.thrustOsc) {
          try { this.thrustOsc.stop(); } catch {}
          this.thrustOsc.disconnect();
          this.thrustOsc = null;
        }
        this.isThrustPlaying = false;
      }, 90);
    } catch {
      this.isThrustPlaying = false;
    }
  }

  // 2. Continuous Mechanical Drill Grind
  public startDrill() {
    if (this.muted || this.isDrillPlaying) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      this.drillOsc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      this.drillGain = ctx.createGain();

      this.drillOsc.type = 'square';
      this.drillOsc.frequency.setValueAtTime(110, ctx.currentTime);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(320, ctx.currentTime);
      filter.Q.setValueAtTime(3.0, ctx.currentTime);

      this.drillGain.gain.setValueAtTime(0.01, ctx.currentTime);
      this.drillGain.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 0.05);

      this.drillOsc.connect(filter);
      filter.connect(this.drillGain);
      this.drillGain.connect(ctx.destination);

      this.drillOsc.start();
      this.isDrillPlaying = true;
    } catch {
      // Ignore
    }
  }

  public stopDrill() {
    if (!this.isDrillPlaying || !this.drillGain || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      this.drillGain.gain.setValueAtTime(this.drillGain.gain.value, now);
      this.drillGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      setTimeout(() => {
        if (this.drillOsc) {
          try { this.drillOsc.stop(); } catch {}
          this.drillOsc.disconnect();
          this.drillOsc = null;
        }
        this.isDrillPlaying = false;
      }, 70);
    } catch {
      this.isDrillPlaying = false;
    }
  }

  // 3. Crystal Gem Collection Chime
  public playGemCollect(sides: number) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const baseFreq = 440 + (sides - 3) * 110; // Higher sides = higher frequency chime
    const notes = [baseFreq, baseFreq * 1.25, baseFreq * 1.5];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.04);

      gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.04);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + idx * 0.04 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.04 + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.04);
      osc.stop(ctx.currentTime + idx * 0.04 + 0.3);
    });
  }

  // 4. Shop Cash Register / Sale Chime
  public playSellSound() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    [784, 1046, 1318].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.06);

      gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + idx * 0.06 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.06 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.06);
      osc.stop(ctx.currentTime + idx * 0.06 + 0.4);
    });
  }

  // 5. Heavy Hard Landing Thud / Hull Impact
  public playImpactSound(intensity: number) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.18);

    const vol = Math.min(0.4, 0.1 + intensity * 0.001);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  }

  // 6. Consumable Item Activate Chime
  public playItemUse() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(350, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.28);
  }

  // 7. Teleport Sound Effect
  public playTeleport() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.35);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.42);
  }

  // 8. Warning Alarm Beep
  public playAlarm() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  }

  // 9. Seismic Explosion / Dynamite Blast
  public playExplosion() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // A. Deep sub-bass punch
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sawtooth';
      subOsc.frequency.setValueAtTime(120, now);
      subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.35);

      subGain.gain.setValueAtTime(0.45, now);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.42);

      // B. Filtered noise burst for rubble/debris blast
      const bufferSize = Math.floor(ctx.sampleRate * 0.4);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, now);
      filter.frequency.exponentialRampToValueAtTime(60, now + 0.35);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.4, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.4);
    } catch {
      // Ignore
    }
  }

  // 10. Thermal Steam Sizzle / Gas Vent
  public playSteamSizzle() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const bufferSize = Math.floor(ctx.sampleRate * 0.25);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2200, now);
      filter.Q.setValueAtTime(4.0, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.25, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.26);
    } catch {
      // Ignore
    }
  }

  // 11. Metal Clank on Hard Rock
  public playClank() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(540, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  // 12. Majestic Victory Fanfare (Endgame Boss / Core Extracted)
  public playVictoryFanfare() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Arpeggiated celebratory chords: C4, E4, G4, C5, E5, G5, C6 triumph!
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx >= 4 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        const startTime = now + idx * 0.12;
        const duration = idx === notes.length - 1 ? 1.6 : 0.35;
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.22, startTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.05);
      });
    } catch {
      // Ignore
    }
  }

  // 13. Mechanical Elevator Rail Deployment Sound
  public playElevatorDeploy() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Dual mechanical clamp clicks: 680Hz and 920Hz
      [0, 0.06].forEach((delay, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(i === 0 ? 680 : 920, now + delay);
        osc.frequency.exponentialRampToValueAtTime(140, now + delay + 0.08);

        gain.gain.setValueAtTime(0.22, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.09);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.1);
      });
    } catch {
      // Ignore
    }
  }

  // 14. Ancient Archaeological Relic Discovery Fanfare
  public playRelicFound() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Mystical ancient chime / harp arpeggio: D4, F#4, A4, C#5, E5, A5
      const notes = [293.66, 369.99, 440.0, 554.37, 659.25, 880.0];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx >= 3 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);

        const startTime = now + idx * 0.09;
        const duration = idx === notes.length - 1 ? 1.2 : 0.45;
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.18, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.05);
      });
    } catch {
      // Ignore
    }
  }

  // 15. Continuous Smooth Magnetic Elevator Rail Hum
  public startElevatorHum() {
    if (this.muted || this.isElevatorHumPlaying) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      this.elevatorHumOsc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      this.elevatorHumGain = ctx.createGain();

      this.elevatorHumOsc.type = 'sine';
      this.elevatorHumOsc.frequency.setValueAtTime(135, ctx.currentTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, ctx.currentTime);

      this.elevatorHumGain.gain.setValueAtTime(0.005, ctx.currentTime);
      this.elevatorHumGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.12);

      this.elevatorHumOsc.connect(filter);
      filter.connect(this.elevatorHumGain);
      this.elevatorHumGain.connect(ctx.destination);

      this.elevatorHumOsc.start();
      this.isElevatorHumPlaying = true;
    } catch {
      // Ignore
    }
  }

  public stopElevatorHum() {
    if (!this.isElevatorHumPlaying || !this.elevatorHumGain || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      this.elevatorHumGain.gain.setValueAtTime(this.elevatorHumGain.gain.value, now);
      this.elevatorHumGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      setTimeout(() => {
        if (this.elevatorHumOsc) {
          try { this.elevatorHumOsc.stop(); } catch {}
          this.elevatorHumOsc.disconnect();
          this.elevatorHumOsc = null;
        }
        this.isElevatorHumPlaying = false;
      }, 90);
    } catch {
      this.isElevatorHumPlaying = false;
    }
  }

  // 16. Futuristic Two-Tone Elevator Activation & Arrival Chime
  public playElevatorChime(type: 'start' | 'stop') {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      if (type === 'start') {
        // Ascending alert chime: 523.25Hz (C5) -> 659.25Hz (E5)
        const notes = [
          { freq: 523.25, time: 0, dur: 0.10, vol: 0.14 },
          { freq: 659.25, time: 0.08, dur: 0.22, vol: 0.18 }
        ];
        notes.forEach(n => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(n.freq, now + n.time);

          gain.gain.setValueAtTime(0.001, now + n.time);
          gain.gain.linearRampToValueAtTime(n.vol, now + n.time + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + n.time + n.dur);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + n.time);
          osc.stop(now + n.time + n.dur + 0.02);
        });
      } else {
        // Descending arrival chime: 659.25Hz (E5) -> 523.25Hz (C5)
        const notes = [
          { freq: 659.25, time: 0, dur: 0.10, vol: 0.15 },
          { freq: 523.25, time: 0.08, dur: 0.25, vol: 0.14 }
        ];
        notes.forEach(n => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(n.freq, now + n.time);

          gain.gain.setValueAtTime(0.001, now + n.time);
          gain.gain.linearRampToValueAtTime(n.vol, now + n.time + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + n.time + n.dur);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + n.time);
          osc.stop(now + n.time + n.dur + 0.02);
        });
      }
    } catch {
      // Ignore
    }
  }
}

export const sounds = new SoundEngine();
