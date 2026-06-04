import type { Room } from '../types/index.js';
export type VoiceChannel = 'room' | 'mafia' | 'yakuza';
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
/** Returns null if player may transmit in this channel right now, or an error string. */
export declare function canTransmitVoice(room: Room, playerId: string, channel: VoiceChannel): string | null;
/** Returns the voice channel that both sockets share (for offer-relay authorization). */
export declare function getSharedChannel(socketId1: string, socketId2: string): VoiceChannel | null;
/** Remove one socket from a specific channel. Returns remaining members, or null if socket wasn't in that channel. */
export declare function removeFromChannel(socketId: string, channel: VoiceChannel): {
    roomId: string;
    remaining: VoiceMember[];
} | null;
//# sourceMappingURL=voiceService.d.ts.map