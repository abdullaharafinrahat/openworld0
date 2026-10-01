type Sound = 'shard' | 'jump' | 'dash' | 'hurt' | 'portal' | 'over' | 'click' | 'guardian';

class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 0.3;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') void this.context.resume();
    } catch {
      // Audio is optional when the browser blocks Web Audio.
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.3, this.context.currentTime, 0.04);
    }
  }

  private note(frequency: number, end: number, duration: number, delay = 0, volume = 0.25, type: OscillatorType = 'sine') {
    if (!this.context || !this.master || this.muted) return;
    const ctx = this.context;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    const time = ctx.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), time + duration);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(volume, time + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.03);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }

  play(sound: Sound, combo = 1) {
    switch (sound) {
      case 'shard': {
        const pitch = 620 * Math.pow(1.12, combo - 1);
        this.note(pitch, pitch * 1.05, 0.16, 0, 0.2, 'triangle');
        this.note(pitch * 1.5, pitch * 1.52, 0.3, 0.07, 0.16);
        break;
      }
      case 'jump': this.note(200, 550, 0.2, 0, 0.14, 'triangle'); break;
      case 'dash':
        this.note(330, 65, 0.25, 0, 0.13, 'sawtooth');
        this.note(850, 180, 0.2, 0, 0.08);
        break;
      case 'hurt':
        this.note(155, 45, 0.32, 0, 0.25, 'triangle');
        this.note(110, 30, 0.2, 0, 0.15, 'sawtooth');
        break;
      case 'portal':
        [261.63, 329.63, 392, 523.25, 783.99].forEach((pitch, i) => this.note(pitch, pitch, 0.65, i * 0.09, 0.18, 'triangle'));
        break;
      case 'guardian':
        this.note(130, 40, 0.3, 0, 0.2, 'sawtooth');
        [440, 660, 880].forEach((pitch, i) => this.note(pitch, pitch, 0.2, i * 0.05, 0.15));
        break;
      case 'over': [392, 329.63, 261.63].forEach((pitch, i) => this.note(pitch, pitch, 0.65, i * 0.16, 0.16, 'triangle')); break;
      case 'click': this.note(540, 720, 0.09, 0, 0.12); break;
    }
  }
}

export const audio = new GameAudio();