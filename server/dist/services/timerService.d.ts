declare class TimerService {
    private timers;
    /** Start a countdown timer for a room. Calls onTick each second, onComplete at 0. */
    start(roomId: string, initialSeconds: number, onTick: (remaining: number) => void, onComplete: () => Promise<void> | void): void;
    stop(roomId: string): void;
    isRunning(roomId: string): boolean;
    stopAll(): void;
}
export declare const timerService: TimerService;
export {};
//# sourceMappingURL=timerService.d.ts.map