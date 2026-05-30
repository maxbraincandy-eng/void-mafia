import type { Room } from '../types/index.js';
export type VoiceChannel = 'room' | 'mafia';
export interface VoiceMember {
    socketId: string;
    playerId: string;
    name: string;
}
/** Returns null if allowed, or an error string if not. */
export declare function canJoin(room: Room, playerId: string, channel: VoiceChannel): string | null;
/** Add a member. Returns list of EXISTING members (for offer negotiation). */
export declare function join(roomId: string, channel: VoiceChannel, member: VoiceMember): VoiceMember[];
/** Remove socket from all voice channels. Returns what was removed. */
export declare function leave(socketId: string): Array<{
    roomId: string;
    channel: VoiceChannel;
    remaining: VoiceMember[];
}>;
export declare function getMembers(roomId: string, channel: VoiceChannel): VoiceMember[];
//# sourceMappingURL=voiceService.d.ts.map