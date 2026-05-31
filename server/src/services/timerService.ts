interface TimerEntry {
  intervalId: ReturnType<typeof setInterval> | null;
  onTick: (remaining: number) => void;
  onComplete: () => Promise<void> | void;
  remaining: number;
  paused: boolean;
}

class TimerService {
  private timers = new Map<string, TimerEntry>();

  start(roomId: string, initialSeconds: number, onTick: (remaining: number) => void, onComplete: () => Promise<void> | void): void {
    this.stop(roomId);
    const entry: TimerEntry = { intervalId: null, onTick, onComplete, remaining: initialSeconds, paused: false };
    this.timers.set(roomId, entry);
    this._startInterval(roomId, entry);
  }

  private _startInterval(roomId: string, entry: TimerEntry): void {
    entry.intervalId = setInterval(() => {
      entry.remaining = Math.max(0, entry.remaining - 1);
      try { entry.onTick(entry.remaining); } catch (e) { console.error('[timer onTick]', e); }
      if (entry.remaining <= 0) {
        this.stop(roomId);
        Promise.resolve(entry.onComplete()).catch(e => console.error('[timer onComplete]', e));
      }
    }, 1000);
  }

  pause(roomId: string): void {
    const entry = this.timers.get(roomId);
    if (!entry || entry.paused) return;
    if (entry.intervalId !== null) clearInterval(entry.intervalId);
    entry.intervalId = null;
    entry.paused = true;
  }

  resume(roomId: string): void {
    const entry = this.timers.get(roomId);
    if (!entry || !entry.paused) return;
    entry.paused = false;
    this._startInterval(roomId, entry);
  }

  stop(roomId: string): void {
    const entry = this.timers.get(roomId);
    if (entry) {
      if (entry.intervalId !== null) clearInterval(entry.intervalId);
      this.timers.delete(roomId);
    }
  }

  isRunning(roomId: string): boolean {
    return this.timers.has(roomId);
  }

  isPaused(roomId: string): boolean {
    return this.timers.get(roomId)?.paused ?? false;
  }

  stopAll(): void {
    for (const [roomId] of this.timers) { this.stop(roomId); }
  }
}

export const timerService = new TimerService();
