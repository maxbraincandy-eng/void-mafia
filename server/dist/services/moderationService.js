import { generateId } from '../utils/helpers.js';
import { db } from '../db.js';
import { getPlayer, getAllPlayers, setBan, clearBan, setMute, clearMute, addWarning, toPublicProfile, } from './playerService.js';
const LEVEL_ORDER = ['moderator', 'senior_moderator', 'admin', 'owner'];
function levelRank(level) {
    return LEVEL_ORDER.indexOf(level);
}
export function canDo(player, action) {
    if (!player.isModerator || !player.moderatorLevel)
        return false;
    const rank = levelRank(player.moderatorLevel);
    switch (action) {
        case 'kick':
        case 'warn':
        case 'mute':
        case 'view_reports': return rank >= 0;
        case 'ban_short':
        case 'resolve_reports': return rank >= 1;
        case 'ban_long':
        case 'view_logs': return rank >= 2;
        case 'all': return rank >= 3;
        default: return rank >= 0;
    }
}
export function banPlayer(moderatorId, moderatorName, targetId, reason, durationSeconds) {
    const target = getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    const ban = {
        id: generateId(), reason,
        issuedBy: moderatorId, issuedByName: moderatorName,
        issuedAt: Date.now(),
        expiresAt: Date.now() + durationSeconds * 1000,
    };
    setBan(targetId, ban);
    addLog({ actionType: 'ban', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: durationSeconds });
    return ban;
}
export function unbanPlayer(moderatorId, moderatorName, targetId) {
    const target = getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    clearBan(targetId);
    addLog({ actionType: 'unban', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: 'Manual unban', duration: null });
}
export function mutePlayer(moderatorId, moderatorName, targetId, reason, durationSeconds) {
    const target = getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    const mute = {
        id: generateId(), reason,
        issuedBy: moderatorId, issuedByName: moderatorName,
        issuedAt: Date.now(),
        expiresAt: Date.now() + durationSeconds * 1000,
    };
    setMute(targetId, mute);
    addLog({ actionType: 'mute', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: durationSeconds });
    return mute;
}
export function unmutePlayer(moderatorId, moderatorName, targetId) {
    const target = getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    clearMute(targetId);
    addLog({ actionType: 'unmute', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason: 'Manual unmute', duration: null });
}
export function warnPlayer(moderatorId, moderatorName, targetId, reason) {
    const target = getPlayer(targetId);
    if (!target)
        throw new Error('Player not found.');
    const warning = {
        id: generateId(), playerId: targetId, reason,
        issuedBy: moderatorId, issuedByName: moderatorName,
        issuedAt: Date.now(),
    };
    addWarning(targetId, warning);
    addLog({ actionType: 'warn', moderatorId, moderatorName, targetPlayerId: targetId, targetName: target.username, roomId: null, reason, duration: null });
    return warning;
}
export function createReport(reporterProfileId, reporterName, reportedProfileId, reportedName, roomId, reason, details) {
    const report = {
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
  `).run(report.id, reporterProfileId, reporterName, reportedProfileId, reportedName, roomId, reason, report.details, report.createdAt);
    return report;
}
export function getReports() {
    const rows = db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 500').all();
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
export function resolveReport(moderatorId, reportId, status, notes) {
    db.prepare(`
    UPDATE reports SET status = ?, assigned_mod_id = ?, mod_notes = ? WHERE id = ?
  `).run(status, moderatorId, notes, reportId);
    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
    if (!row)
        throw new Error('Report not found.');
    const mod = getPlayer(moderatorId);
    const actionType = status === 'resolved' ? 'report_resolve' : 'report_reject';
    addLog({ actionType, moderatorId, moderatorName: mod?.username ?? 'Unknown', targetPlayerId: row.reported_id, targetName: row.reported_name, roomId: row.room_id ?? null, reason: notes, duration: null });
}
function addLog(entry) {
    const log = { id: generateId(), createdAt: Date.now(), ...entry };
    db.prepare(`
    INSERT INTO mod_logs (id, action_type, moderator_id, moderator_name, target_player_id,
      target_name, room_id, reason, duration, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(log.id, log.actionType, log.moderatorId, log.moderatorName, log.targetPlayerId, log.targetName, log.roomId ?? null, log.reason, log.duration ?? null, log.createdAt);
    return log;
}
export function getLogs() {
    const rows = db.prepare('SELECT * FROM mod_logs ORDER BY created_at DESC LIMIT 500').all();
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
export function logKick(modProfileId, modName, targetId, targetName, roomId, reason) {
    addLog({ actionType: 'kick', moderatorId: modProfileId, moderatorName: modName, targetPlayerId: targetId, targetName, roomId, reason, duration: null });
}
//# sourceMappingURL=moderationService.js.map