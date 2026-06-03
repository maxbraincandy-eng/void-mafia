import {
  Report, ReportReason, ModLog, ModActionType,
  BanRecord, MuteRecord, Warning, PlayerProfile, ModeratorLevel,
} from '../types/index.js';
import { generateId } from '../utils/helpers.js';
import { sql } from '../db.js';
import { getPlayer, getAllPlayers, setBan, clearBan, setMute, clearMute, addWarning, toPublicProfile } from './playerService.js';

const LEVEL_ORDER: ModeratorLevel[] = ['moderator', 'senior_moderator', 'admin', 'owner'];
function levelRank(level: ModeratorLevel): number { return LEVEL_ORDER.indexOf(level); }

export function canDo(player: PlayerProfile, action: string): boolean {
  if (!player.isModerator || !player.moderatorLevel) return false;
  const rank = levelRank(player.moderatorLevel);
  switch (action) {
    case 'kick': case 'warn': case 'mute': case 'view_reports': return rank >= 0;
    case 'ban_short': case 'resolve_reports': return rank >= 1;
    case 'ban_long': case 'view_logs': return rank >= 2;
    case 'all': return rank >= 3;
    default: return rank >= 0;
  }
}

async function addLog(entry: Omit<ModLog, 'id' | 'createdAt'>): Promise<ModLog> {
  const log: ModLog = { id: generateId(), createdAt: Date.now(), ...entry };
  await sql`
    INSERT INTO mod_logs (id, action_type, moderator_id, moderator_name, target_player_id,
      target_name, room_id, reason, duration, created_at)
    VALUES (${log.id}, ${log.actionType}, ${log.moderatorId}, ${log.moderatorName},
            ${log.targetPlayerId}, ${log.targetName}, ${log.roomId ?? null},
            ${log.reason}, ${log.duration ?? null}, ${log.createdAt})
  `;
  return log;
}

export async function banPlayer(
  moderatorId: string, moderatorName: string, targetId: string, reason: string, durationSeconds: number,
): Promise<BanRecord> {
  const target = await getPlayer(targetId);
  if (!target) throw new Error('Player not found.');
  const ban: BanRecord = {
    id: generateId(), reason,
    issuedBy: moderatorId, issuedByName: moderatorName,
    issuedAt: Date.now(), expiresAt: Date.now() + durationSeconds * 1_000,
  };
  await setBan(targetId, ban);
  await addLog({ actionType: 'ban', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: durationSeconds });
  return ban;
}

export async function unbanPlayer(moderatorId: string, moderatorName: string, targetId: string): Promise<void> {
  const target = await getPlayer(targetId);
  if (!target) throw new Error('Player not found.');
  await clearBan(targetId);
  await addLog({ actionType: 'unban', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: 'Manual unban', duration: null });
}

export async function mutePlayer(
  moderatorId: string, moderatorName: string, targetId: string, reason: string, durationSeconds: number,
): Promise<MuteRecord> {
  const target = await getPlayer(targetId);
  if (!target) throw new Error('Player not found.');
  const mute: MuteRecord = {
    id: generateId(), reason,
    issuedBy: moderatorId, issuedByName: moderatorName,
    issuedAt: Date.now(), expiresAt: Date.now() + durationSeconds * 1_000,
  };
  await setMute(targetId, mute);
  await addLog({ actionType: 'mute', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: durationSeconds });
  return mute;
}

export async function unmutePlayer(moderatorId: string, moderatorName: string, targetId: string): Promise<void> {
  const target = await getPlayer(targetId);
  if (!target) throw new Error('Player not found.');
  await clearMute(targetId);
  await addLog({ actionType: 'unmute', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: 'Manual unmute', duration: null });
}

export async function warnPlayer(
  moderatorId: string, moderatorName: string, targetId: string, reason: string,
): Promise<Warning> {
  const target = await getPlayer(targetId);
  if (!target) throw new Error('Player not found.');
  const warning: Warning = {
    id: generateId(), playerId: targetId, reason,
    issuedBy: moderatorId, issuedByName: moderatorName, issuedAt: Date.now(),
  };
  await addWarning(targetId, warning);
  await addLog({ actionType: 'warn', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: null });
  return warning;
}

export async function createReport(
  reporterProfileId: string, reporterName: string, reportedProfileId: string, reportedName: string,
  roomId: string | null, reason: ReportReason, details: string,
): Promise<Report> {
  const report: Report = {
    id: generateId(), reporterPlayerId: reporterProfileId, reporterName,
    reportedPlayerId: reportedProfileId, reportedName, roomId, reason,
    details: details.slice(0, 500), createdAt: Date.now(), status: 'open',
    assignedModeratorId: null, moderatorNotes: '',
  };
  await sql`
    INSERT INTO reports (id, reporter_id, reporter_name, reported_id, reported_name,
      room_id, reason, details, created_at, status, assigned_mod_id, mod_notes)
    VALUES (${report.id}, ${reporterProfileId}, ${reporterName}, ${reportedProfileId}, ${reportedName},
            ${roomId}, ${reason}, ${report.details}, ${report.createdAt}, 'open', NULL, '')
  `;
  return report;
}

export async function getReports(): Promise<Report[]> {
  const rows = await sql`SELECT * FROM reports ORDER BY created_at DESC LIMIT 500` as any[];
  return rows.map((r: any) => ({
    id: r.id,
    reporterPlayerId: r.reporter_id, reporterName: r.reporter_name,
    reportedPlayerId: r.reported_id, reportedName: r.reported_name,
    roomId: r.room_id ?? null, reason: r.reason, details: r.details,
    createdAt: Number(r.created_at), status: r.status,
    assignedModeratorId: r.assigned_mod_id ?? null, moderatorNotes: r.mod_notes,
  }));
}

export async function resolveReport(
  moderatorId: string, reportId: string, status: 'resolved' | 'rejected', notes: string,
): Promise<void> {
  await sql`
    UPDATE reports SET status = ${status}, assigned_mod_id = ${moderatorId}, mod_notes = ${notes}
    WHERE id = ${reportId}
  `;
  const [row] = await sql`SELECT * FROM reports WHERE id = ${reportId}` as any[];
  if (!row) throw new Error('Report not found.');
  const mod = await getPlayer(moderatorId);
  const actionType: ModActionType = status === 'resolved' ? 'report_resolve' : 'report_reject';
  await addLog({ actionType, moderatorId, moderatorName: mod?.username ?? 'Unknown', targetPlayerId: row.reported_id, targetName: row.reported_name, roomId: row.room_id ?? null, reason: notes, duration: null });
}

export async function getLogs(): Promise<ModLog[]> {
  const rows = await sql`SELECT * FROM mod_logs ORDER BY created_at DESC LIMIT 500` as any[];
  return rows.map((r: any) => ({
    id: r.id, actionType: r.action_type,
    moderatorId: r.moderator_id, moderatorName: r.moderator_name,
    targetPlayerId: r.target_player_id, targetName: r.target_name,
    roomId: r.room_id ?? null, reason: r.reason,
    duration: r.duration ?? null, createdAt: Number(r.created_at),
  }));
}

export async function getModPlayers() {
  const players = await getAllPlayers();
  return players.map(toPublicProfile);
}

export async function logKick(
  modProfileId: string, modName: string, targetId: string, targetName: string,
  roomId: string | null, reason: string,
): Promise<void> {
  await addLog({ actionType: 'kick', moderatorId: modProfileId, moderatorName: modName, targetPlayerId: targetId, targetName, roomId, reason, duration: null });
}
