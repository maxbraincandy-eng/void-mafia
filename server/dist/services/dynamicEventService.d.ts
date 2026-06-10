import { Room, ActiveEvent, Phase } from '../types/index.js';
interface EventDef {
    key: string;
    label: string;
    description: string;
    icon: string;
    phase: Phase;
    allowedKey: keyof Room['settings']['dynamicEvents']['allowed'];
}
export declare const EVENT_CATALOG: readonly EventDef[];
export declare function tryTriggerEvent(room: Room, phase: Phase): ActiveEvent | null;
export declare function setRoomEvent(room: Room, event: ActiveEvent | null): void;
export declare function clearRoomEvent(room: Room): void;
export declare function getEventDef(key: string): EventDef | undefined;
export {};
//# sourceMappingURL=dynamicEventService.d.ts.map