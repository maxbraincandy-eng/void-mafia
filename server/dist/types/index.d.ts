export type Phase = 'lobby' | 'role_reveal' | 'night' | 'day' | 'voting' | 'game_over';
export type RoleKey = 'mafia' | 'citizen' | 'sheriff' | 'doctor' | 'don' | 'maniac' | 'jester' | 'bodyguard';
export type Team = 'mafia' | 'town' | 'neutral';
export type TieRule = 'no_elimination' | 'random';
export type ChatChannel = 'room' | 'mafia' | 'dead';
export type ModeratorLevel = 'moderator' | 'senior_moderator' | 'admin' | 'owner';
export type ReportReason = 'harassment' | 'hate_speech' | 'cheating' | 'spamming' | 'inappropriate_nickname' | 'inappropriate_chat' | 'toxic_behavior' | 'other';
export type ModActionType = 'kick' | 'ban' | 'unban' | 'mute' | 'unmute' | 'warn' | 'report_resolve' | 'report_reject';
export interface Role {
    key: RoleKey;
    name: string;
    team: Team;
    description: string;
    ability: string;
    wakeAtNight: boolean;
    color: string;
    glowColor: string;
}
export interface PlayerStats {
    gamesPlayed: number;
    wins: number;
    losses: number;
    winRate: number;
}
export interface BanRecord {
    id: string;
    reason: string;
    issuedBy: string;
    issuedByName: string;
    issuedAt: number;
    expiresAt: number;
}
export interface MuteRecord {
    id: string;
    reason: string;
    issuedBy: string;
    issuedByName: string;
    issuedAt: number;
    expiresAt: number;
}
export interface Warning {
    id: string;
    playerId: string;
    reason: string;
    issuedBy: string;
    issuedByName: string;
    issuedAt: number;
}
export interface PlayerProfile {
    id: string;
    username: string;
    avatar: string;
    stats: PlayerStats;
    isModerator: boolean;
    moderatorLevel: ModeratorLevel | null;
    moderatorBadgeVisible: boolean;
    ban: BanRecord | null;
    mute: MuteRecord | null;
    warnings: Warning[];
    joinedAt: number;
    lastSeenAt: number;
}
export interface PlayerProfilePublic {
    id: string;
    username: string;
    avatar: string;
    stats: PlayerStats;
    isModerator: boolean;
    moderatorLevel: ModeratorLevel | null;
    moderatorBadgeVisible: boolean;
    joinedAt: number;
}
export interface Report {
    id: string;
    reporterPlayerId: string;
    reporterName: string;
    reportedPlayerId: string;
    reportedName: string;
    roomId: string | null;
    reason: ReportReason;
    details: string;
    createdAt: number;
    status: 'open' | 'reviewing' | 'resolved' | 'rejected';
    assignedModeratorId: string | null;
    moderatorNotes: string;
}
export interface ModLog {
    id: string;
    actionType: ModActionType;
    moderatorId: string;
    moderatorName: string;
    targetPlayerId: string;
    targetName: string;
    roomId: string | null;
    reason: string;
    duration: number | null;
    createdAt: number;
}
export interface Player {
    id: string;
    name: string;
    avatar: string;
    socketId: string;
    isHost: boolean;
    isAlive: boolean;
    isConnected: boolean;
    isReady: boolean;
    role: RoleKey | null;
    team: Team | null;
    voteTarget: string | null;
    hasActedThisPhase: boolean;
    seat: number;
    joinedAt: number;
    profileId: string | null;
}
export interface NightAction {
    actorId: string;
    targetId: string;
    role: RoleKey;
    submittedAt: number;
}
export interface ChatMessage {
    id: string;
    senderId: string | 'system';
    senderName: string;
    text: string;
    timestamp: number;
    channel: ChatChannel;
    isSystem: boolean;
    seat?: number;
    isMod?: boolean;
}
export interface GameSettings {
    nightDuration: number;
    dayDuration: number;
    voteDuration: number;
    roleRevealDuration: number;
    allowDoctorSelfHeal: boolean;
    tieVoteRule: TieRule;
    minPlayers: number;
    isPrivate: boolean;
    roles: {
        mafia: number;
        don: number;
        sheriff: number;
        doctor: number;
        maniac: number;
        jester: number;
        bodyguard: number;
    };
}
export interface Room {
    id: string;
    code: string;
    hostId: string;
    phase: Phase;
    players: Map<string, Player>;
    day: number;
    timer: number;
    maxTimer: number;
    chat: ChatMessage[];
    mafiaChat: ChatMessage[];
    nightActions: Map<string, NightAction>;
    votes: Map<string, string | null>;
    killedLastNight: Array<{
        id: string;
        name: string;
    }>;
    savedLastNight: boolean;
    winner: Team | null;
    winnerNames?: string[];
    settings: GameSettings;
    createdAt: number;
}
export interface PlayerPublic {
    id: string;
    name: string;
    avatar: string;
    isHost: boolean;
    isAlive: boolean;
    isConnected: boolean;
    isReady: boolean;
    role: RoleKey | null;
    team: Team | null;
    voteTarget: string | null;
    hasActed: boolean;
    seat: number;
    profileId: string | null;
    isModerator: boolean;
    moderatorLevel: ModeratorLevel | null;
}
export interface RoomPublic {
    id: string;
    code: string;
    phase: Phase;
    day: number;
    timer: number;
    maxTimer: number;
    players: PlayerPublic[];
    chat: ChatMessage[];
    mafiaChat: ChatMessage[];
    killedLastNight: Array<{
        id: string;
        name: string;
    }>;
    savedLastNight: boolean;
    winner: Team | null;
    settings: GameSettings;
}
export interface RoomListItem {
    id: string;
    code: string;
    playerCount: number;
    phase: Phase;
    createdAt: number;
    hostName: string;
    isPrivate: boolean;
}
export interface NightResult {
    killed: Array<{
        id: string;
        name: string;
    }>;
    saved: boolean;
}
export interface InvestigationResult {
    targetId: string;
    targetName: string;
    result: 'suspicious' | 'not_suspicious';
}
export interface GameOverResult {
    winner: Team;
    allRoles: Record<string, {
        name: string;
        role: RoleKey;
        team: Team;
    }>;
}
export type VoiceChannel = 'room' | 'mafia';
type Cb<T> = (res: Res<T>) => void;
export interface ServerToClientEvents {
    'room:update': (room: RoomPublic) => void;
    'chat:new': (msg: ChatMessage) => void;
    'game:role': (data: {
        role: Role;
    }) => void;
    'game:night_result': (result: NightResult) => void;
    'game:investigation': (result: InvestigationResult) => void;
    'game:over': (result: GameOverResult) => void;
    'error': (data: {
        message: string;
    }) => void;
    'kicked': (data: {
        reason: string;
    }) => void;
    'player:profile': (profile: PlayerProfilePublic) => void;
    'mod:notification': (data: {
        type: string;
        message: string;
        targetName?: string;
    }) => void;
    'warning:received': (data: {
        reason: string;
        moderatorName: string;
    }) => void;
    'ban:received': (data: {
        reason: string;
        expiresAt: number;
    }) => void;
    'mute:received': (data: {
        reason: string;
        expiresAt: number;
    }) => void;
    'voice:peer-joined': (data: {
        socketId: string;
        name: string;
        channel: VoiceChannel;
    }) => void;
    'voice:peer-left': (data: {
        socketId: string;
        channel: VoiceChannel;
    }) => void;
    'voice:offer': (data: {
        from: string;
        sdp: object;
    }) => void;
    'voice:answer': (data: {
        from: string;
        sdp: object;
    }) => void;
    'voice:ice-candidate': (data: {
        from: string;
        candidate: object;
    }) => void;
    'voice:error': (data: {
        message: string;
    }) => void;
}
export interface ClientToServerEvents {
    'player:auth': (data: {
        uid: string;
        username: string;
    }, cb: Cb<PlayerProfilePublic>) => void;
    'player:stats': (data: {
        profileId: string;
    }, cb: Cb<PlayerProfilePublic>) => void;
    'player:report': (data: {
        targetProfileId: string;
        roomId: string | null;
        reason: ReportReason;
        details: string;
    }, cb: Cb<null>) => void;
    'room:create': (data: {
        name: string;
        settings?: Record<string, unknown>;
    }, cb: Cb<RoomPublic>) => void;
    'room:join': (data: {
        code: string;
        name: string;
    }, cb: Cb<RoomPublic>) => void;
    'room:leave': (cb: Cb<null>) => void;
    'room:ready': (cb: Cb<null>) => void;
    'room:kick': (data: {
        playerId: string;
    }, cb: Cb<null>) => void;
    'room:settings': (data: {
        settings: Partial<GameSettings>;
    }, cb: Cb<null>) => void;
    'game:start': (cb: Cb<null>) => void;
    'game:action': (data: {
        targetId: string;
    }, cb: Cb<null>) => void;
    'game:vote': (data: {
        targetId: string | null;
    }, cb: Cb<null>) => void;
    'game:skip': (cb: Cb<null>) => void;
    'game:restart': (cb: Cb<null>) => void;
    'chat:send': (data: {
        text: string;
        channel: ChatChannel;
    }, cb: Cb<null>) => void;
    'mod:kick_from_room': (data: {
        targetProfileId: string;
        roomId: string;
        reason: string;
    }, cb: Cb<null>) => void;
    'mod:ban': (data: {
        targetProfileId: string;
        reason: string;
        duration: number;
    }, cb: Cb<null>) => void;
    'mod:mute': (data: {
        targetProfileId: string;
        reason: string;
        duration: number;
    }, cb: Cb<null>) => void;
    'mod:warn': (data: {
        targetProfileId: string;
        reason: string;
    }, cb: Cb<null>) => void;
    'mod:unban': (data: {
        targetProfileId: string;
    }, cb: Cb<null>) => void;
    'mod:unmute': (data: {
        targetProfileId: string;
    }, cb: Cb<null>) => void;
    'mod:get_reports': (cb: Cb<Report[]>) => void;
    'mod:get_rooms': (cb: Cb<RoomListItem[]>) => void;
    'mod:get_players': (cb: Cb<PlayerProfilePublic[]>) => void;
    'mod:get_logs': (cb: Cb<ModLog[]>) => void;
    'mod:resolve_report': (data: {
        reportId: string;
        status: 'resolved' | 'rejected';
        notes: string;
    }, cb: Cb<null>) => void;
    'voice:join': (data: {
        channel: VoiceChannel;
    }, cb: Cb<{
        peers: Array<{
            socketId: string;
            name: string;
        }>;
    }>) => void;
    'voice:leave': () => void;
    'voice:offer': (data: {
        to: string;
        sdp: object;
    }, cb: Cb<null>) => void;
    'voice:answer': (data: {
        to: string;
        sdp: object;
    }, cb: Cb<null>) => void;
    'voice:ice-candidate': (data: {
        to: string;
        candidate: object;
    }) => void;
}
export interface InterServerEvents {
}
export interface SocketData {
    playerId: string | null;
    roomId: string | null;
    profileId: string | null;
}
export type Res<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    error: string;
};
export declare function ok<T>(data: T): Res<T>;
export declare function err(message: string): Res<never>;
export {};
//# sourceMappingURL=index.d.ts.map