import { Report, ReportReason, ModLog, ModActionType, BanRecord, MuteRecord, Warning, WarnCategory, PlayerProfile, ModNote, ModPlayerDetail } from '../types/index.js';
export declare function canDo(player: PlayerProfile, action: string): boolean;
export declare function banPlayer(moderatorId: string, moderatorName: string, targetId: string, reason: string, durationSeconds: number): Promise<BanRecord>;
export declare function unbanPlayer(moderatorId: string, moderatorName: string, targetId: string): Promise<void>;
export declare function mutePlayer(moderatorId: string, moderatorName: string, targetId: string, reason: string, durationSeconds: number): Promise<MuteRecord>;
export declare function unmutePlayer(moderatorId: string, moderatorName: string, targetId: string): Promise<void>;
export declare function warnPlayer(moderatorId: string, moderatorName: string, targetId: string, reason: string, category?: WarnCategory): Promise<Warning>;
export declare function createReport(reporterProfileId: string, reporterName: string, reportedProfileId: string, reportedName: string, roomId: string | null, reason: ReportReason, details: string): Promise<Report>;
export declare function getReports(): Promise<Report[]>;
export declare function resolveReport(moderatorId: string, reportId: string, status: 'resolved' | 'rejected', notes: string): Promise<void>;
export declare function getLogs(): Promise<ModLog[]>;
export declare function getModPlayers(): Promise<import("../types/index.js").PlayerProfilePublic[]>;
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
}>;
//# sourceMappingURL=moderationService.d.ts.map