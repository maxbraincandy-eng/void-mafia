interface TimerEntry {
  intervalId: ReturnType<typeof setInterval>;
  onComplete: () => Promise<void> | void;
}

class TimerService {
  private timers = new Map<string, TimerEntry>();

  /** Start a countdown timer for a room. Calls onTick each second, onComplete at 0. */
  start(
    roomId: string,
    initialSeconds: number,
    onTick: (remaining: number) => void,
    onComplete: () => Promise<void> | void,
  ): void {
    this.stop(roomId);

    let remaining = initialSeconds;

    const intervalId = setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      try { onTick(remaining); } catch (e) { console.error('[timer onTick]', e); }

      if (remaining <= 0) {
        this.stop(roomId);
        Promise.resolve(onComplete()).catch(e => console.error('[timer onComplete]', e));
      }
    }, 1000);

    this.timers.set(roomId, { intervalId, onComplete });
  }

  stop(roomId: string): void {
    const entry = this.timers.get(roomId);
    if (entry) {
      clearInterval(entry.intervalId);
      this.timers.delete(roomId);
    }
  }

  isRunning(roomId: string): boolean {
    return this.timers.has(roomId);
  }

  stopAll(): void {
    for (const [roomId] of this.timers) {
      this.stop(roomId);
    }
  }
}

export const timerService = new TimerService();
