class TimerService {
    constructor() {
        this.timers = new Map();
    }
    start(roomId, initialSeconds, onTick, onComplete) {
        this.stop(roomId);
        const entry = { intervalId: null, onTick, onComplete, remaining: initialSeconds, paused: false };
        this.timers.set(roomId, entry);
        this._startInterval(roomId, entry);
    }
    _startInterval(roomId, entry) {
        entry.intervalId = setInterval(() => {
            entry.remaining = Math.max(0, entry.remaining - 1);
            try {
                entry.onTick(entry.remaining);
            }
            catch (e) {
                console.error('[timer onTick]', e);
            }
            if (entry.remaining <= 0) {
                this.stop(roomId);
                Promise.resolve(entry.onComplete()).catch(e => console.error('[timer onComplete]', e));
            }
        }, 1000);
    }
    pause(roomId) {
        const entry = this.timers.get(roomId);
        if (!entry || entry.paused)
            return;
        if (entry.intervalId !== null)
            clearInterval(entry.intervalId);
        entry.intervalId = null;
        entry.paused = true;
    }
    resume(roomId) {
        const entry = this.timers.get(roomId);
        if (!entry || !entry.paused)
            return;
        entry.paused = false;
        this._startInterval(roomId, entry);
    }
    stop(roomId) {
        const entry = this.timers.get(roomId);
        if (entry) {
            if (entry.intervalId !== null)
                clearInterval(entry.intervalId);
            this.timers.delete(roomId);
        }
    }
    isRunning(roomId) {
        return this.timers.has(roomId);
    }
    isPaused(roomId) {
        return this.timers.get(roomId)?.paused ?? false;
    }
    stopAll() {
        for (const [roomId] of this.timers) {
            this.stop(roomId);
        }
    }
}
export const timerService = new TimerService();
//# sourceMappingURL=timerService.js.map