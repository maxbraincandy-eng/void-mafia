declare class TimerService {
    private timers;
    start(roomId: string, initialSeconds: number, onTick: (remaining: number) => void, onComplete: () => Promise<void> | void): void;
    private _startInterval;
    pause(roomId: string): void;
    resume(roomId: string): void;
    stop(roomId: string): void;
    isRunning(roomId: string): boolean;
    isPaused(roomId: string): boolean;
    stopAll(): void;
}
export declare const timerService: TimerService;
export {};
//# sourceMappingURL=timerService.d.ts.map