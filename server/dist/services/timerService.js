class TimerService {
    constructor() {
        this.timers = new Map();
    }
    /** Start a countdown timer for a room. Calls onTick each second, onComplete at 0. */
    start(roomId, initialSeconds, onTick, onComplete) {
        this.stop(roomId);
        let remaining = initialSeconds;
        const intervalId = setInterval(() => {
            remaining = Math.max(0, remaining - 1);
            try {
                onTick(remaining);
            }
            catch (e) {
                console.error('[timer onTick]', e);
            }
            if (remaining <= 0) {
                this.stop(roomId);
                Promise.resolve(onComplete()).catch(e => console.error('[timer onComplete]', e));
            }
        }, 1000);
        this.timers.set(roomId, { intervalId, onComplete });
    }
    stop(roomId) {
        const entry = this.timers.get(roomId);
        if (entry) {
            clearInterval(entry.intervalId);
            this.timers.delete(roomId);
        }
    }
    isRunning(roomId) {
        return this.timers.has(roomId);
    }
    stopAll() {
        for (const [roomId] of this.timers) {
            this.stop(roomId);
        }
    }
}
export const timerService = new TimerService();
//# sourceMappingURL=timerService.js.map