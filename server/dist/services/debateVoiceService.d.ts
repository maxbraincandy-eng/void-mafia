import type { DebateSide } from './debateService.js';
interface VoicePeer {
    socketId: string;
    playerId: string;
    username: string;
    side: DebateSide;
}
export declare function voiceJoin(debateId: string, playerId: string, socketId: string, side: DebateSide, username: string): VoicePeer[];
export declare function voiceLeave(debateId: string, playerId: string): void;
export declare function getVoicePeers(debateId: string, excludePlayerId: string): VoicePeer[];
export declare function getVoicePeer(debateId: string, playerId: string): VoicePeer | null;
export declare function getSocketPeer(debateId: string, socketId: string): VoicePeer | null;
export {};
//# sourceMappingURL=debateVoiceService.d.ts.map