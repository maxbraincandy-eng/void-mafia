import { Report, ReportReason, ModLog, BanRecord, MuteRecord, Warning, PlayerProfile } from '../types/index.js';
export declare function canDo(player: PlayerProfile, action: string): boolean;
export declare function banPlayer(moderatorId: string, moderatorName: string, targetId: string, reason: string, durationSeconds: number): BanRecord;
export declare function unbanPlayer(moderatorId: string, moderatorName: string, targetId: string): void;
export declare function mutePlayer(moderatorId: string, moderatorName: string, targetId: string, reason: string, durationSeconds: number): MuteRecord;
export declare function unmutePlayer(moderatorId: string, moderatorName: string, targetId: string): void;
export declare function warnPlayer(moderatorId: string, moderatorName: string, targetId: string, reason: string): Warning;
export declare function createReport(reporterProfileId: string, reporterName: string, reportedProfileId: string, reportedName: string, roomId: string | null, reason: ReportReason, details: string): Report;
export declare function getReports(): Report[];
export declare function resolveReport(moderatorId: string, reportId: string, status: 'resolved' | 'rejected', notes: string): void;
export declare function getLogs(): ModLog[];
export declare function getModPlayers(): import("../types/index.js").PlayerProfilePublic[];
//# sourceMappingURL=moderationService.d.ts.map