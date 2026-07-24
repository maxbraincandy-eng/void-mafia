export type WpProvider = 'youtube' | 'video' | 'vimeo' | 'twitch' | 'tiktok' | 'embed';
export interface WpSource {
    raw: string;
    provider: WpProvider;
    refId: string;
    title: string;
    synced: boolean;
}
export interface WpMember {
    userId: string;
    socketId: string;
    name: string;
    avatar: string;
    joinedAt: number;
}
export interface WpChatMsg {
    id: string;
    userId: string;
    name: string;
    text: string;
    at: number;
}
export interface WpMatch {
    id: string;
    code: string;
    hostId: string;
    hostSocketId: string;
    hostName: string;
    title: string;
    createdAt: number;
    members: WpMember[];
    source: WpSource | null;
    queue: WpSource[];
    playing: boolean;
    positionSec: number;
    updatedAt: number;
    rate: number;
    chat: WpChatMsg[];
}
export interface WpListItem {
    id: string;
    code: string;
    hostName: string;
    title: string;
    memberCount: number;
    nowPlaying: string | null;
    provider: WpProvider | null;
    createdAt: number;
}
export declare function parseSource(rawInput: string): WpSource | null;
export declare function createMatch(hostId: string, socketId: string, name: string, avatar: string, title: string): WpMatch;
export declare function getMatch(id: string): WpMatch | undefined;
export declare function getMatchByCode(code: string): WpMatch | undefined;
export declare function listMatches(): WpListItem[];
export declare function joinMatch(id: string, userId: string, socketId: string, name: string, avatar: string): WpMatch | null;
/** Remove a member. Reassigns host if the host left; dissolves an empty room. */
export declare function leaveMatch(id: string, userId: string): {
    dissolved: boolean;
};
export declare function dissolve(id: string): void;
export declare function transferHost(id: string, hostId: string, targetUserId: string): WpMatch | null;
/** Find a room by any member's socket (for disconnect handling). */
export declare function findBySocket(socketId: string): WpMatch | undefined;
/** Current playback position in seconds, extrapolated from the last update. */
export declare function effectivePosition(m: WpMatch): number;
export declare function setSource(id: string, hostId: string, rawUrl: string): WpMatch | null;
export declare function clearSource(id: string, hostId: string): WpMatch | null;
export declare function play(id: string, hostId: string, positionSec?: number): WpMatch | null;
export declare function pause(id: string, hostId: string, positionSec?: number): WpMatch | null;
export declare function seek(id: string, hostId: string, positionSec: number): WpMatch | null;
export declare function setRate(id: string, hostId: string, rate: number): WpMatch | null;
export declare function queueAdd(id: string, hostId: string, rawUrl: string): WpMatch | null;
export declare function queueRemove(id: string, hostId: string, index: number): WpMatch | null;
export declare function queueNext(id: string, hostId: string): WpMatch | null;
export declare function addChat(id: string, userId: string, text: string): {
    m: WpMatch;
    msg: WpChatMsg;
} | null;
export interface WpSafeState {
    id: string;
    code: string;
    title: string;
    hostId: string;
    hostName: string;
    you: {
        userId: string;
        isHost: boolean;
    };
    members: Array<{
        userId: string;
        name: string;
        avatar: string;
        isHost: boolean;
    }>;
    source: WpSource | null;
    queue: WpSource[];
    playing: boolean;
    positionSec: number;
    rate: number;
    serverTime: number;
    chat: WpChatMsg[];
}
export declare function getSafeState(m: WpMatch, viewerUserId: string): WpSafeState;
//# sourceMappingURL=watchPartyService.d.ts.map