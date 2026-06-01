import {
  Report, ReportReason, ModLog, ModActionType,
  BanRecord, MuteRecord, Warning, PlayerProfile, ModeratorLevel,
} from '../types/index.js';
import { generateId } from '../utils/helpers.js';
import { db } from '../db.js';
import {
  getPlayer, getAllPlayers, setBan, clearBan, setMute, clearMute,
  addWarning, toPublicProfile,
} from './playerService.js';

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
    case 'view_reports':    return rank >= 0;
    case 'ban_short':
    case 'resolve_reports': return rank >= 1;
    case 'ban_long':
    case 'view_logs':       return rank >= 2;
    case 'all':             return rank >= 3;
    default:                return rank >= 0;
  }
}

export function banPlayer(
  moderatorId: string, moderatorName: string,
  targetId: string, reason: string, durationSeconds: number,
): BanRecord {
  const target = getPlayer(targetId);
  if (!target) throw new Error('Player not found.');

  const ban: BanRecord = {
    id: generateId(), reason,
    issuedBy: moderatorId, issuedByName: moderatorName,
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

export function mutePlayer(
  moderatorId: string, moderatorName: string,
  targetId: string, reason: string, durationSeconds: number,
): MuteRecord {
  const target = getPlayer(targetId);
  if (!target) throw new Error('Player not found.');

  const mute: MuteRecord = {
    id: generateId(), reason,
    issuedBy: moderatorId, issuedByName: moderatorName,
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

export function warnPlayer(
  moderatorId: string, moderatorName: string,
  targetId: string, reason: string,
): Warning {
  const target = getPlayer(targetId);
  if (!target) throw new Error('Player not found.');

  const warning: Warning = {
    id: generateId(), playerId: targetId, reason,
    issuedBy: moderatorId, issuedByName: moderatorName,
    issuedAt: Date.now(),
  };
  addWarning(targetId, warning);
  addLog({ actionType: 'warn', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: null });
  return warning;
}

export function createReport(
  reporterProfileId: string, reporterName: string,
  reportedProfileId: string, reportedName: string,
  roomId: string | null, reason: ReportReason, details: string,
): Report {
  const report: Report = {
    id: generateId(),
    reporterPlayerId: reporterProfileId, reporterName,
    reportedPlayerId: reportedProfileId, reportedName,
    roomId, reason,
    details: details.slice(0, 500),
    createdAt: Date.now(),
    status: 'open',
    assignedModeratorId: null,
    moderatorNotes: '',
  };
  db.prepare(`
    INSERT INTO reports (id, reporter_id, reporter_name, reported_id, reported_name,
      room_id, reason, details, created_at, status, assigned_mod_id, mod_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, '')
  `).run(
    report.id, reporterProfileId, reporterName,
    reportedProfileId, reportedName,
    roomId, reason, report.details, report.createdAt,
  );
  return report;
}

export function getReports(): Report[] {
  const rows = db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 500').all() as any[];
  return rows.map(r => ({
    id: r.id,
    reporterPlayerId: r.reporter_id, reporterName: r.reporter_name,
    reportedPlayerId: r.reported_id, reportedName: r.reported_name,
    roomId: r.room_id ?? null, reason: r.reason, details: r.details,
    createdAt: r.created_at, status: r.status,
    assignedModeratorId: r.assigned_mod_id ?? null,
    moderatorNotes: r.mod_notes,
  }));
}

export function resolveReport(
  moderatorId: string, reportId: string,
  status: 'resolved' | 'rejected', notes: string,
): void {
  db.prepare(`
    UPDATE reports SET status = ?, assigned_mod_id = ?, mod_notes = ? WHERE id = ?
  `).run(status, moderatorId, notes, reportId);

  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId) as any;
  if (!row) throw new Error('Report not found.');
  const mod = getPlayer(moderatorId);
  const actionType: ModActionType = status === 'resolved' ? 'report_resolve' : 'report_reject';
  addLog({ actionType, moderatorId, moderatorName: mod?.username ?? 'Unknown', targetPlayerId: row.reported_id, targetName: row.reported_name, roomId: row.room_id ?? null, reason: notes, duration: null });
}

function addLog(entry: Omit<ModLog, 'id' | 'createdAt'>): ModLog {
  const log: ModLog = { id: generateId(), createdAt: Date.now(), ...entry };
  db.prepare(`
    INSERT INTO mod_logs (id, action_type, moderator_id, moderator_name, target_player_id,
      target_name, room_id, reason, duration, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    log.id, log.actionType, log.moderatorId, log.moderatorName,
    log.targetPlayerId, log.targetName, log.roomId ?? null,
    log.reason, log.duration ?? null, log.createdAt,
  );
  return log;
}

export function getLogs(): ModLog[] {
  const rows = db.prepare('SELECT * FROM mod_logs ORDER BY created_at DESC LIMIT 500').all() as any[];
  return rows.map(r => ({
    id: r.id, actionType: r.action_type,
    moderatorId: r.moderator_id, moderatorName: r.moderator_name,
    targetPlayerId: r.target_player_id, targetName: r.target_name,
    roomId: r.room_id ?? null, reason: r.reason,
    duration: r.duration ?? null, createdAt: r.created_at,
  }));
}

export function getModPlayers() {
  return getAllPlayers().map(toPublicProfile);
}

export function logKick(
  modProfileId: string, modName: string,
  targetId: string, targetName: string,
  roomId: string | null, reason: string,
): void {
  addLog({ actionType: 'kick', moderatorId: modProfileId, moderatorName: modName, targetPlayerId: targetId, targetName, roomId, reason, duration: null });
}
