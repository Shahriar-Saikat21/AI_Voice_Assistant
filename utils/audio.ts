import { AudioContext } from "react-native-audio-api";

export class AudioQueue {
  private ctx: AudioContext;
  private gain: GainNode;
  private nextStartTime = 0;
  private pendingCount = 0;
  private stopped = false;
  private resolveComplete: (() => void) | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    this.ctx = new AudioContext();
    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);
  }

  async enqueue(mp3Data: ArrayBuffer): Promise<void> {
    if (this.stopped) return;

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    const audioBuffer = await this.ctx.decodeAudioData(mp3Data);
    if (this.stopped) return;

    const source = this.ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gain);

    // Schedule right after previous buffer ends (or now if nothing queued)
    const startTime = Math.max(
      this.ctx.currentTime + 0.02,
      this.nextStartTime
    );
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;

    this.pendingCount++;

    // Track completion via timeout
    const waitMs = (this.nextStartTime - this.ctx.currentTime) * 1000 + 100;
    const timer = setTimeout(() => {
      this.pendingCount--;
      if (this.pendingCount <= 0 && this.resolveComplete) {
        this.resolveComplete();
        this.resolveComplete = null;
      }
    }, waitMs);
    this.timers.push(timer);
  }

  waitForCompletion(): Promise<void> {
    if (this.pendingCount <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.resolveComplete = resolve;
    });
  }

  stop() {
    this.stopped = true;
    // Fade out quickly
    try {
      this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
    } catch {}
    // Clear timers
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.pendingCount = 0;
    if (this.resolveComplete) {
      this.resolveComplete();
      this.resolveComplete = null;
    }
  }

  dispose() {
    this.stop();
    try {
      this.ctx.close();
    } catch {}
  }
}

// Simple one-shot playback (kept for backward compat)
export async function playAudioFromArrayBuffer(
  data: ArrayBuffer
): Promise<void> {
  const queue = new AudioQueue();
  await queue.enqueue(data);
  await queue.waitForCompletion();
  queue.dispose();
}
