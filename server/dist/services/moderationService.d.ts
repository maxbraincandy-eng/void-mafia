import { Report, ReportReason, ModLog, BanRecord, MuteRecord, Warning, PlayerProfile } from '../types/index.js';
export declare function canDo(player: PlayerProfile, action: string): boolean;
export declare function banPlayer(moderatorId: string, moderatorName: string, targetId: string, reason: string, durationSeconds: number): Promise<BanRecord>;
export declare function unbanPlayer(moderatorId: string, moderatorName: string, targetId: string): Promise<void>;
export declare function mutePlayer(moderatorId: string, moderatorName: string, targetId: string, reason: string, durationSeconds: number): Promise<MuteRecord>;
export declare function unmutePlayer(moderatorId: string, moderatorName: string, targetId: string): Promise<void>;
export declare function warnPlayer(moderatorId: string, moderatorName: string, targetId: string, reason: string): Promise<Warning>;
export declare function createReport(reporterProfileId: string, reporterName: string, reportedProfileId: string, reportedName: string, roomId: string | null, reason: ReportReason, details: string): Promise<Report>;
export declare function getReports(): Promise<Report[]>;
export declare function resolveReport(moderatorId: string, reportId: string, status: 'resolved' | 'rejected', notes: string): Promise<void>;
export declare function getLogs(): Promise<ModLog[]>;
export declare function getModPlayers(): Promise<import("../types/index.js").PlayerProfilePublic[]>;
export declare function logKick(modProfileId: string, modName: string, targetId: string, targetName: string, roomId: string | null, reason: string): Promise<void>;
//# sourceMappingURL=moderationService.d.ts.map