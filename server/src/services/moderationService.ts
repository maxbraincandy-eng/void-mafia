import {
  Report, ReportReason, ModLog, ModActionType,
  BanRecord, MuteRecord, Warning, PlayerProfile, ModeratorLevel,
  ModNote, ModPlayerDetail,
} from '../types/index.js';
import { generateId } from '../utils/helpers.js';
import { sql } from '../db.js';
import { getPlayer, setBan, clearBan, setMute, clearMute, addWarning, getPlayersFast, toPublicProfile } from './playerService.js';

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
  return getPlayersFast();
}

export async function logKick(
  modProfileId: string, modName: string, targetId: string, targetName: string,
  roomId: string | null, reason: string,
): Promise<void> {
  await addLog({ actionType: 'kick', moderatorId: modProfileId, moderatorName: modName, targetPlayerId: targetId, targetName, roomId, reason, duration: null });
}

export async function addModLog(
  actionType: ModActionType, moderatorId: string, moderatorName: string,
  targetPlayerId: string, targetName: string, roomId: string | null, reason: string, duration: number | null = null,
): Promise<void> {
  await addLog({ actionType, moderatorId, moderatorName, targetPlayerId, targetName, roomId, reason, duration });
}

// ── Mod Notes ─────────────────────────────────────────────────────────
export async function addModNote(modId: string, modName: string, targetId: string, note: string): Promise<ModNote> {
  const target = await getPlayer(targetId);
  if (!target) throw new Error('Player not found.');
  const n: ModNote = { id: generateId(), playerId: targetId, modId, modName, note: note.slice(0, 1000), createdAt: Date.now() };
  await sql`
    INSERT INTO mod_notes (id, player_id, mod_id, mod_name, note, created_at)
    VALUES (${n.id}, ${n.playerId}, ${n.modId}, ${n.modName}, ${n.note}, ${n.createdAt})
  `;
  await addLog({ actionType: 'note_add', moderatorId: modId, moderatorName: modName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: n.note.slice(0, 100), duration: null });
  return n;
}

export async function getModNotes(targetId: string): Promise<ModNote[]> {
  const rows = await sql`SELECT * FROM mod_notes WHERE player_id = ${targetId} ORDER BY created_at DESC LIMIT 50` as any[];
  return rows.map((r: any) => ({
    id: r.id, playerId: r.player_id, modId: r.mod_id, modName: r.mod_name, note: r.note, createdAt: Number(r.created_at),
  }));
}

// ── Account Freeze ────────────────────────────────────────────────────
export async function freezeAccount(modId: string, modName: string, targetId: string, reason: string): Promise<void> {
  const target = await getPlayer(targetId);
  if (!target) throw new Error('Player not found.');
  await sql`UPDATE players SET account_frozen = 1 WHERE id = ${targetId}`;
  await addLog({ actionType: 'freeze', moderatorId: modId, moderatorName: modName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: null });
}

export async function unfreezeAccount(modId: string, modName: string, targetId: string): Promise<void> {
  const target = await getPlayer(targetId);
  if (!target) throw new Error('Player not found.');
  await sql`UPDATE players SET account_frozen = 0 WHERE id = ${targetId}`;
  await addLog({ actionType: 'unfreeze', moderatorId: modId, moderatorName: modName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: 'Account unfrozen', duration: null });
}

// ── Rename Player ─────────────────────────────────────────────────────
export async function renamePlayer(modId: string, modName: string, targetId: string, newName: string, reason: string): Promise<void> {
  const target = await getPlayer(targetId);
  if (!target) throw new Error('Player not found.');
  const trimmed = newName.trim().slice(0, 24);
  if (!trimmed) throw new Error('Name cannot be empty.');
  const existing = await sql`SELECT id FROM players WHERE username = ${trimmed} AND id != ${targetId}` as any[];
  if (existing.length > 0) throw new Error('Username already taken.');
  await sql`UPDATE players SET username = ${trimmed} WHERE id = ${targetId}`;
  await addLog({ actionType: 'rename', moderatorId: modId, moderatorName: modName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: `Renamed to "${trimmed}": ${reason}`, duration: null });
}

// ── Player Detail ─────────────────────────────────────────────────────
export async function getPlayerDetail(targetId: string): Promise<ModPlayerDetail> {
  const player = await getPlayer(targetId);
  if (!player) throw new Error('Player not found.');
  const [notes, reportCountRows, frozenRows] = await Promise.all([
    getModNotes(targetId),
    sql`SELECT COUNT(*) as cnt FROM reports WHERE reported_id = ${targetId}` as unknown as Promise<any[]>,
    sql`SELECT account_frozen FROM players WHERE id = ${targetId}` as unknown as Promise<any[]>,
  ]);
  return {
    profile: toPublicProfile(player),
    ban: player.ban,
    mute: player.mute,
    warnings: player.warnings,
    reportCount: Number(reportCountRows[0]?.cnt ?? 0),
    notes,
    accountFrozen: Boolean(frozenRows[0]?.account_frozen),
  };
}

// ── Assign Report ─────────────────────────────────────────────────────
export async function assignReport(reportId: string, modId: string): Promise<void> {
  await sql`UPDATE reports SET assigned_mod_id = ${modId}, status = 'reviewing' WHERE id = ${reportId}`;
}

// ── Dashboard Stats ───────────────────────────────────────────────────
export async function getDashboardDbStats(): Promise<{ openReports: number; recentBans: number }> {
  const since24h = Date.now() - 86_400_000;
  const [[openRow], [banRow]] = await Promise.all([
    sql`SELECT COUNT(*) as cnt FROM reports WHERE status = 'open'` as Promise<any[]>,
    sql`SELECT COUNT(*) as cnt FROM mod_logs WHERE action_type = 'ban' AND created_at > ${since24h}` as Promise<any[]>,
  ]);
  return { openReports: Number(openRow?.cnt ?? 0), recentBans: Number(banRow?.cnt ?? 0) };
}
