import {
  Report, ReportReason, ModLog, ModActionType,
  BanRecord, MuteRecord, Warning, PlayerProfile, ModeratorLevel,
} from '../types/index.js';
import { generateId } from '../utils/helpers.js';
import {
  getPlayer, getAllPlayers, setBan, clearBan, setMute, clearMute,
  addWarning, toPublicProfile,
} from './playerService.js';

// ── In-memory stores ──────────────────────────────────────────────────
const reports = new Map<string, Report>();
const modLogs: ModLog[] = [];

// ── Permission helpers ────────────────────────────────────────────────
const LEVEL_ORDER: ModeratorLevel[] = ['moderator', 'senior_moderator', 'admin', 'owner'];

function levelRank(level: ModeratorLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

export function canDo(player: PlayerProfile, action: string): boolean {
  if (!player.isModerator || !player.moderatorLevel) return false;
  const rank = levelRank(player.moderatorLevel);
  switch (action) {
    case 'kick':
    case 'warn':
    case 'mute':
    case 'view_reports':    return rank >= 0; // moderator+
    case 'ban_short':
    case 'resolve_reports': return rank >= 1; // senior_moderator+
    case 'ban_long':
    case 'view_logs':       return rank >= 2; // admin+
    case 'all':             return rank >= 3; // owner
    default:                return rank >= 0;
  }
}

// ── Ban ───────────────────────────────────────────────────────────────
export function banPlayer(
  moderatorId: string, moderatorName: string,
  targetId: string, reason: string, durationSeconds: number,
): BanRecord {
  const target = getPlayer(targetId);
  if (!target) throw new Error('Player not found.');

  const ban: BanRecord = {
    id: generateId(),
    reason,
    issuedBy: moderatorId,
    issuedByName: moderatorName,
    issuedAt: Date.now(),
    expiresAt: Date.now() + durationSeconds * 1_000,
  };
  setBan(targetId, ban);
  addLog({ actionType: 'ban', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: durationSeconds });
  return ban;
}

export function unbanPlayer(moderatorId: string, moderatorName: string, targetId: string): void {
  const target = getPlayer(targetId);
  if (!target) throw new Error('Player not found.');
  clearBan(targetId);
  addLog({ actionType: 'unban', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: 'Manual unban', duration: null });
}

// ── Mute ──────────────────────────────────────────────────────────────
export function mutePlayer(
  moderatorId: string, moderatorName: string,
  targetId: string, reason: string, durationSeconds: number,
): MuteRecord {
  const target = getPlayer(targetId);
  if (!target) throw new Error('Player not found.');

  const mute: MuteRecord = {
    id: generateId(),
    reason,
    issuedBy: moderatorId,
    issuedByName: moderatorName,
    issuedAt: Date.now(),
    expiresAt: Date.now() + durationSeconds * 1_000,
  };
  setMute(targetId, mute);
  addLog({ actionType: 'mute', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: durationSeconds });
  return mute;
}

export function unmutePlayer(moderatorId: string, moderatorName: string, targetId: string): void {
  const target = getPlayer(targetId);
  if (!target) throw new Error('Player not found.');
  clearMute(targetId);
  addLog({ actionType: 'unmute', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: 'Manual unmute', duration: null });
}

// ── Warn ──────────────────────────────────────────────────────────────
export function warnPlayer(
  moderatorId: string, moderatorName: string,
  targetId: string, reason: string,
): Warning {
  const target = getPlayer(targetId);
  if (!target) throw new Error('Player not found.');

  const warning: Warning = {
    id: generateId(),
    playerId: targetId,
    reason,
    issuedBy: moderatorId,
    issuedByName: moderatorName,
    issuedAt: Date.now(),
  };
  addWarning(targetId, warning);
  addLog({ actionType: 'warn', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: null });
  return warning;
}

// ── Reports ───────────────────────────────────────────────────────────
export function createReport(
  reporterProfileId: string, reporterName: string,
  reportedProfileId: string, reportedName: string,
  roomId: string | null, reason: ReportReason, details: string,
): Report {
  const report: Report = {
    id: generateId(),
    reporterPlayerId: reporterProfileId,
    reporterName,
    reportedPlayerId: reportedProfileId,
    reportedName,
    roomId,
    reason,
    details: details.slice(0, 500),
    createdAt: Date.now(),
    status: 'open',
    assignedModeratorId: null,
    moderatorNotes: '',
  };
  reports.set(report.id, report);
  return report;
}

export function getReports(): Report[] {
  return [...reports.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function resolveReport(
  moderatorId: string, reportId: string,
  status: 'resolved' | 'rejected', notes: string,
): void {
  const report = reports.get(reportId);
  if (!report) throw new Error('Report not found.');
  report.status = status;
  report.moderatorNotes = notes;
  report.assignedModeratorId = moderatorId;

  const mod = getPlayer(moderatorId);
  const actionType: ModActionType = status === 'resolved' ? 'report_resolve' : 'report_reject';
  addLog({
    actionType, moderatorId,
    moderatorName: mod?.username ?? 'Unknown',
    targetPlayerId: report.reportedPlayerId,
    targetName: report.reportedName,
    roomId: report.roomId,
    reason: notes,
    duration: null,
  });
}

// ── Logs ──────────────────────────────────────────────────────────────
function addLog(entry: Omit<ModLog, 'id' | 'createdAt'>): ModLog {
  const log: ModLog = { id: generateId(), createdAt: Date.now(), ...entry };
  modLogs.push(log);
  if (modLogs.length > 1000) modLogs.shift(); // cap
  return log;
}

export function getLogs(): ModLog[] {
  return [...modLogs].reverse();
}

export function getModPlayers() {
  return getAllPlayers().map(toPublicProfile);
}
