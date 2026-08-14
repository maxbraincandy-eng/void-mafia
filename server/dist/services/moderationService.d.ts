import { Report, ReportReason, ModLog, ModActionType, BanRecord, MuteRecord, Warning, WarnCategory, PlayerProfile, ModNote, ModPlayerDetail, BannedPlayerEntry } from '../types/index.js';
export declare function canDo(player: PlayerProfile, action: string): boolean;
export declare function banPlayer(moderatorId: string, moderatorName: string, targetId: string, reason: string, durationSeconds: number): Promise<BanRecord>;
export declare function unbanPlayer(moderatorId: string, moderatorName: string, targetId: string): Promise<void>;
export declare function mutePlayer(moderatorId: string, moderatorName: string, targetId: string, reason: string, durationSeconds: number): Promise<MuteRecord>;
export declare function unmutePlayer(moderatorId: string, moderatorName: string, targetId: string): Promise<void>;
export declare function warnPlayer(moderatorId: string, moderatorName: string, targetId: string, reason: string, category?: WarnCategory): Promise<Warning>;
/** A frozen line of chat, stored with the report it evidences. */
export interface EvidenceLine {
    at: number;
    name: string;
    text: string;
    isTarget: boolean;
}
export declare function createReport(reporterProfileId: string, reporterName: string, reportedProfileId: string, reportedName: string, roomId: string | null, reason: ReportReason, details: string, evidence?: EvidenceLine[], autoFlag?: string | null): Promise<Report>;
export interface Appeal {
    id: string;
    playerId: string;
    playerName: string;
    kind: 'ban' | 'mute';
    body: string;
    createdAt: number;
    status: 'open' | 'granted' | 'denied';
    decidedBy: string | null;
    decidedName: string | null;
    decidedAt: number | null;
    decision: string;
}
/** File an appeal. The unique partial index keeps it to one open per player. */
export declare function createAppeal(playerId: string, playerName: string, kind: 'ban' | 'mute', body: string): Promise<Appeal>;
export declare function getAppeals(status?: 'open' | 'all'): Promise<Appeal[]>;
/** A granted ban appeal lifts the ban; a granted mute appeal lifts the mute. */
export declare function decideAppeal(modId: string, modName: string, appealId: string, grant: boolean, decision: string): Promise<Appeal>;
/**
 * Per-moderator accountability. `overturned` is the count of that moderator's
 * bans later lifted on appeal — the only honest signal for whether a moderator
 * is being too quick, and the reason appeals are worth having at all.
 */
export declare function getModeratorStats(): Promise<Array<{
    moderatorId: string;
    moderatorName: string;
    actions: number;
    bans: number;
    overturned: number;
}>>;
export declare function getReports(): Promise<Report[]>;
export declare function resolveReport(moderatorId: string, reportId: string, status: 'resolved' | 'rejected', notes: string): Promise<void>;
export declare function getLogs(): Promise<ModLog[]>;
export declare function getModPlayers(): Promise<import("../types/index.js").PlayerProfilePublic[]>;
export declare function getBannedPlayers(): Promise<BannedPlayerEntry[]>;
export declare function logKick(modProfileId: string, modName: string, targetId: string, targetName: string, roomId: string | null, reason: string): Promise<void>;
export declare function addModLog(actionType: ModActionType, moderatorId: string, moderatorName: string, targetPlayerId: string, targetName: string, roomId: string | null, reason: string, duration?: number | null): Promise<void>;
export declare function addModNote(modId: string, modName: string, targetId: string, note: string): Promise<ModNote>;
export declare function getModNotes(targetId: string): Promise<ModNote[]>;
export declare function freezeAccount(modId: string, modName: string, targetId: string, reason: string): Promise<void>;
export declare function unfreezeAccount(modId: string, modName: string, targetId: string): Promise<void>;
export declare function renamePlayer(modId: string, modName: string, targetId: string, newName: string, reason: string): Promise<void>;
export declare function getPlayerDetail(targetId: string): Promise<ModPlayerDetail>;
export declare function assignReport(reportId: string, modId: string): Promise<void>;
export declare function getDashboardDbStats(): Promise<{
    openReports: number;
    recentBans: number;
    newUsersToday: number;
    avgMatchSeconds: number;
}>;
//# sourceMappingURL=moderationService.d.ts.map