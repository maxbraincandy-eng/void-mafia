export type Phase = 'lobby' | 'role_reveal' | 'night' | 'morning' | 'day' | 'speech' | 'voting' | 'death_speech' | 'game_over';
export type RoleKey = 'mafia' | 'citizen' | 'sheriff' | 'doctor' | 'don' | 'maniac' | 'jester' | 'bodyguard' | 'spy' | 'escort' | 'vigilante' | 'cult_leader' | 'cultist' | 'veteran' | 'tracker' | 'arsonist' | 'mayor' | 'yakuza' | 'shogun';
export type Team = 'mafia' | 'town' | 'neutral' | 'cult' | 'yakuza';
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
export interface PlayerCosmetics {
    equippedNameColor: string | null;
    equippedFrame: string | null;
    unlockedItems: string[];
}
export interface XPGain {
    amount: number;
    newXP: number;
    newLevel: number;
    leveledUp: boolean;
    challengeCompleted: boolean;
    challengeBonus: number;
}
export interface Friend {
    profileId: string;
    username: string;
    avatar: string;
    avatarUrl?: string | null;
    publicId?: number | null;
    level: number;
    isOnline: boolean;
    status: 'accepted';
}
export interface FriendRequest {
    id: string;
    fromId: string;
    fromUsername: string;
    fromAvatar: string;
    fromAvatarUrl?: string | null;
    createdAt: number;
}
export interface DailyChallenge {
    id: string;
    description: string;
    xpReward: number;
    completedToday: boolean;
    progressCount: number;
    targetCount: number;
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
    avatarUrl: string | null;
    avatarUpdatedAt: number | null;
    publicId: number | null;
    stats: PlayerStats;
    isModerator: boolean;
    moderatorLevel: ModeratorLevel | null;
    moderatorBadgeVisible: boolean;
    moderatorPermissions: string[];
    ban: BanRecord | null;
    mute: MuteRecord | null;
    warnings: Warning[];
    joinedAt: number;
    lastSeenAt: number;
    email?: string;
    passwordHash?: string;
    passwordSalt?: string;
    xp: number;
    level: number;
    cosmetics: PlayerCosmetics;
    friendCode: string;
}
export interface PlayerProfilePublic {
    id: string;
    username: string;
    avatar: string;
    avatarUrl?: string | null;
    publicId?: number | null;
    stats: PlayerStats;
    isModerator: boolean;
    moderatorLevel: ModeratorLevel | null;
    moderatorBadgeVisible: boolean;
    moderatorPermissions: string[];
    joinedAt: number;
    lastSeenAt: number;
    xp: number;
    level: number;
    cosmetics: PlayerCosmetics;
    friendCode: string;
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
    expiresAt?: number;
}
export interface Player {
    id: string;
    name: string;
    avatar: string;
    avatarUrl: string | null;
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
    isSpectator: boolean;
    lastWill: string | null;
    isModerator: boolean;
    moderatorLevel: ModeratorLevel | null;
    deathType: 'night' | 'vote' | null;
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
    speechDuration: number;
    allowDoctorSelfHeal: boolean;
    tieVoteRule: TieRule;
    minPlayers: number;
    isPrivate: boolean;
    password: string;
    startWithNight: boolean;
    rotatingSpeech: boolean;
    roles: {
        mafia: number;
        don: number;
        sheriff: number;
        doctor: number;
        maniac: number;
        jester: number;
        bodyguard: number;
        spy: number;
        escort: number;
        vigilante: number;
        cult_leader: number;
        veteran: number;
        tracker: number;
        arsonist: number;
        mayor: number;
        yakuza: number;
        shogun: number;
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
        lastWill?: string | null;
    }>;
    savedLastNight: boolean;
    winner: Team | null;
    winnerNames?: string[];
    settings: GameSettings;
    speechOrder: string[];
    currentSpeakerIdx: number;
    daySkipVotes: string[];
    createdAt: number;
    isPaused: boolean;
    dousedPlayers: Set<string>;
    newlyConvertedCultists: string[];
    deadChat: ChatMessage[];
    spectateQueue: string[];
    startedAt: number;
    mafiaKillTarget: string | null;
    nominations: Map<string, string>;
    tribunalCandidates: string[];
    deathSpeakerId: string | null;
    speechStartSeat: number;
}
export interface PlayerPublic {
    id: string;
    socketId: string;
    name: string;
    avatar: string;
    avatarUrl: string | null;
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
    isSpectator: boolean;
    deathType: 'night' | 'vote' | null;
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
        lastWill?: string | null;
    }>;
    savedLastNight: boolean;
    winner: Team | null;
    settings: GameSettings;
    activeRoleCounts: Record<string, number>;
    currentSpeakerId: string | null;
    daySkipVoteCount: number;
    spectatorCount: number;
    isPaused: boolean;
    deadChat: ChatMessage[];
    /** Mafia-team-only: each alive Mafia member's current kill vote. null when viewer is not Mafia. */
    mafiaVotes: Record<string, {
        voterName: string;
        targetName: string;
    }> | null;
    /** nominatorId → nomineeId for current day's speech nominations */
    nominations: Record<string, string>;
    /** deduped list of nominated player IDs eligible for tribunal vote */
    tribunalCandidates: string[];
    deathSpeakerId: string | null;
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
        lastWill?: string | null;
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
export type VoiceChannel = 'room' | 'mafia' | 'yakuza';
export interface AchievementEarned {
    key: string;
    name: string;
    description: string;
    icon: string;
    rarity: string;
}
export interface VoteBreakdownEntry {
    voterId: string;
    voterName: string;
    targetId: string;
    targetName: string;
    weight: number;
}
export interface NightSummary {
    day: number;
    totalTargeted: number;
    saved: boolean;
    eliminated: Array<{
        name: string;
        role: RoleKey | null;
    }>;
}
export interface ClanPublic {
    id: string;
    name: string;
    tag: string;
    ownerId: string;
    description: string;
    wins: number;
    losses: number;
    createdAt: number;
    memberCount: number;
}
export interface ClanMember {
    playerId: string;
    username: string;
    avatar: string;
    avatarUrl?: string | null;
    publicId?: number | null;
    role: 'owner' | 'officer' | 'member';
    joinedAt: number;
}
export interface GameHistoryEntry {
    id: string;
    roomCode: string;
    startedAt: number;
    endedAt: number;
    winner: string | null;
    dayReached: number;
    playerCount: number;
    myRole: string | null;
    myTeam: string | null;
    won: boolean;
}
type Cb<T> = (res: Res<T>) => void;
export interface ServerToClientEvents {
    'room:update': (room: RoomPublic) => void;
    'room:timer': (remaining: number) => void;
    'room:closed': (data: {
        reason: string;
    }) => void;
    'chat:new': (msg: ChatMessage) => void;
    'game:role': (data: {
        role: Role;
    }) => void;
    'game:night_result': (result: NightResult) => void;
    'game:investigation': (result: InvestigationResult) => void;
    'game:track_result': (result: {
        trackedName: string;
        visitedName: string | null;
    }) => void;
    'game:over': (result: GameOverResult) => void;
    'game:night_summary': (summary: NightSummary) => void;
    'game:nomination': (data: {
        nominatorId: string;
        nominatorName: string;
        nomineeId: string | null;
        nomineeName: string | null;
    }) => void;
    'achievement:earned': (data: {
        achievements: AchievementEarned[];
    }) => void;
    'game:vote_breakdown': (entries: VoteBreakdownEntry[]) => void;
    'lobby:autostart': (data: {
        secondsLeft: number;
    }) => void;
    'error': (data: {
        message: string;
    }) => void;
    'kicked': (data: {
        reason: string;
    }) => void;
    'player:profile': (profile: PlayerProfilePublic) => void;
    'spy:night_report': (data: {
        mafiaTarget: string | null;
        mafiaTargetName: string | null;
    }) => void;
    'game:vote_result': (data: {
        name: string;
        role: string | null;
        lastWill: string | null;
        seat: number;
    }) => void;
    'game:roleblocked': () => void;
    'game:yakuza_ally': (data: {
        allyRole: string;
        allyId: string | null;
        allyName: string | null;
    }) => void;
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
    'voice:force-leave': (data: {
        channel: VoiceChannel;
        reason: string;
    }) => void;
    'voice:force-mute': (data: {
        reason: string;
    }) => void;
    'voice:force-unmute': () => void;
    'xp:gained': (data: XPGain) => void;
    'queue:position': (data: {
        position: number;
        roomCode: string;
    }) => void;
    'queue:promoted': (data: {
        roomCode: string;
    }) => void;
    'friend:request_received': (req: FriendRequest) => void;
    'game:notification': (data: {
        title: string;
        body: string;
    }) => void;
    'online:count': (data: {
        count: number;
    }) => void;
    'dm:new_message': (data: {
        conversationId: string;
        message: any;
    }) => void;
}
export interface ClientToServerEvents {
    'player:auth': (data: {
        uid: string;
        username: string;
    }, cb: Cb<PlayerProfilePublic>) => void;
    'player:register': (data: {
        email: string;
        password: string;
        username: string;
    }, cb: Cb<{
        uid: string;
        profile: PlayerProfilePublic;
    }>) => void;
    'player:login_email': (data: {
        email: string;
        password: string;
    }, cb: Cb<{
        uid: string;
        profile: PlayerProfilePublic;
    }>) => void;
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
    'room:transfer_host': (data: {
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
    'game:nominate': (data: {
        nomineeId: string | null;
    }, cb: Cb<null>) => void;
    'game:day_skip_vote': (cb: Cb<null>) => void;
    'game:restart': (cb: Cb<null>) => void;
    'game:set_will': (data: {
        text: string;
    }, cb: Cb<null>) => void;
    'game:pause': (cb: Cb<{
        isPaused: boolean;
    }>) => void;
    'game:terminate': (cb: Cb<null>) => void;
    'leaderboard:get': (cb: Cb<PlayerProfilePublic[]>) => void;
    'player:profile': (data: {
        profileId: string;
    }, cb: Cb<PlayerProfilePublic>) => void;
    'player:achievements': (data: {
        profileId: string;
    }, cb: Cb<AchievementEarned[]>) => void;
    'player:history': (data: {
        profileId: string;
    }, cb: Cb<GameHistoryEntry[]>) => void;
    'clan:list': (cb: Cb<ClanPublic[]>) => void;
    'clan:get': (data: {
        clanId: string;
    }, cb: Cb<{
        clan: ClanPublic;
        members: ClanMember[];
    }>) => void;
    'clan:create': (data: {
        name: string;
        tag: string;
        description: string;
    }, cb: Cb<ClanPublic>) => void;
    'clan:join': (data: {
        clanId: string;
    }, cb: Cb<null>) => void;
    'clan:leave': (cb: Cb<null>) => void;
    'clan:mine': (cb: Cb<ClanPublic | null>) => void;
    'chat:send': (data: {
        text: string;
        channel: ChatChannel;
    }, cb: Cb<null>) => void;
    'mod:kick_from_room': (data: {
        targetProfileId: string;
        roomId: string;
        reason: string;
    }, cb: Cb<null>) => void;
    'mod:kick_player': (data: {
        targetProfileId: string;
        reason: string;
    }, cb: Cb<null>) => void;
    'mod:get_active_rooms': (cb: Cb<RoomListItem[]>) => void;
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
    'mod:terminate_game': (data: {
        roomId: string;
        reason: string;
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
    'game:rematch': (cb: Cb<null>) => void;
    'friend:request': (data: {
        toProfileId?: string;
        friendCode?: string;
    }, cb: Cb<null>) => void;
    'friend:accept': (data: {
        fromProfileId: string;
    }, cb: Cb<null>) => void;
    'friend:decline': (data: {
        fromProfileId: string;
    }, cb: Cb<null>) => void;
    'friend:remove': (data: {
        profileId: string;
    }, cb: Cb<null>) => void;
    'friend:list': (cb: Cb<Friend[]>) => void;
    'friend:requests': (cb: Cb<FriendRequest[]>) => void;
    'player:find_by_code': (data: {
        friendCode: string;
    }, cb: Cb<PlayerProfilePublic>) => void;
    'mod:set_level_by_code': (data: {
        friendCode: string;
        level: string | null;
    }, cb: Cb<{
        username: string;
        newLevel: string | null;
    }>) => void;
    'challenge:today': (cb: Cb<DailyChallenge>) => void;
    'cosmetics:equip': (data: {
        type: 'name_color' | 'frame';
        itemId: string | null;
    }, cb: Cb<PlayerCosmetics>) => void;
    'cosmetics:get': (data: {
        profileId: string;
    }, cb: Cb<PlayerCosmetics>) => void;
    'player:public_profile': (data: {
        profileId: string;
    }, cb: Cb<any>) => void;
    'player:role_stats': (data: {
        profileId: string;
    }, cb: Cb<any>) => void;
    'clan:my_membership': (cb: Cb<any>) => void;
    'dm:start': (data: {
        profileId: string;
    }, cb: Cb<any>) => void;
    'dm:send': (data: {
        conversationId: string;
        text: string;
    }, cb: Cb<any>) => void;
    'dm:list': (data: Record<string, never>, cb: Cb<any[]>) => void;
    'dm:messages': (data: {
        conversationId: string;
    }, cb: Cb<any[]>) => void;
    'dm:mark_read': (data: {
        conversationId: string;
    }, cb: Cb<null>) => void;
    'dm:unread_count': (data: Record<string, never>, cb: Cb<number>) => void;
    'player:update_avatar': (data: {
        imageData: string;
    }, cb: (res: any) => void) => void;
    'player:remove_avatar': (cb: (res: any) => void) => void;
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