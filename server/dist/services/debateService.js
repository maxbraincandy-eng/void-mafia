import { randomUUID } from 'crypto';
import { sql } from '../db.js';
const PHASE_SEQUENCE = [
    'waiting', 'opening_pro', 'opening_con',
    'argument_pro', 'argument_con',
    'rebuttal_con', 'rebuttal_pro',
    'closing_pro', 'closing_con',
    'voting', 'finished',
];
export const PHASE_DURATION_SECONDS = {
    opening_pro: 120, opening_con: 120,
    argument_pro: 180, argument_con: 180,
    rebuttal_con: 120, rebuttal_pro: 120,
    closing_pro: 60, closing_con: 60,
    voting: 90,
};
export function getActiveSide(phase) {
    if (phase.endsWith('_pro'))
        return 'pro';
    if (phase.endsWith('_con'))
        return 'con';
    return null;
}
export function getNextPhase(current) {
    const idx = PHASE_SEQUENCE.indexOf(current);
    return PHASE_SEQUENCE[Math.min(idx + 1, PHASE_SEQUENCE.length - 1)];
}
function rowToDebate(r) {
    return {
        id: r.id,
        topic: r.topic,
        description: r.description ?? '',
        createdBy: r.created_by,
        status: r.status,
        phase: (r.phase ?? 'waiting'),
        phaseStartedAt: r.phase_started_at ? Number(r.phase_started_at) : null,
        phaseDuration: r.phase_duration ? Number(r.phase_duration) : 0,
        winnerSide: r.winner_side ?? null,
        createdAt: Number(r.created_at),
        endsAt: r.ends_at ? Number(r.ends_at) : null,
    };
}
export async function listDebates(status = 'open', limit = 30) {
    let rows;
    if (status === 'all') {
        rows = await sql `SELECT * FROM community_debates ORDER BY created_at DESC LIMIT ${limit}`;
    }
    else {
        rows = await sql `SELECT * FROM community_debates WHERE status = ${status} ORDER BY created_at DESC LIMIT ${limit}`;
    }
    return rows.map(rowToDebate);
}
export async function getDebateFull(debateId, viewerId) {
    const rows = await sql `SELECT * FROM community_debates WHERE id = ${debateId}`;
    if (!rows.length)
        return null;
    const debate = rowToDebate(rows[0]);
    const participantRows = await sql `
    SELECT dp.*, p.username, p.avatar_url
    FROM community_debate_participants dp
    JOIN players p ON p.id = dp.player_id
    WHERE dp.debate_id = ${debateId}
    ORDER BY dp.joined_at ASC
  `;
    const participants = participantRows.map((r) => ({
        id: r.id, debateId: r.debate_id, playerId: r.player_id,
        side: r.side, joinedAt: Number(r.joined_at),
        username: r.username, avatarUrl: r.avatar_url ?? null,
    }));
    const argRows = await sql `
    SELECT da.*, p.username, p.avatar_url
    FROM community_debate_arguments da
    JOIN players p ON p.id = da.player_id
    WHERE da.debate_id = ${debateId}
    ORDER BY da.created_at ASC
  `;
    const args = argRows.map((r) => ({
        id: r.id, debateId: r.debate_id, playerId: r.player_id,
        side: r.side, content: r.content,
        createdAt: Number(r.created_at),
        username: r.username, avatarUrl: r.avatar_url ?? null,
    }));
    const voteRows = await sql `SELECT side, COUNT(*) as cnt FROM community_debate_votes WHERE debate_id = ${debateId} GROUP BY side`;
    const votesCounts = { pro: 0, con: 0 };
    for (const v of voteRows) {
        if (v.side === 'pro')
            votesCounts.pro = Number(v.cnt);
        if (v.side === 'con')
            votesCounts.con = Number(v.cnt);
    }
    const myPart = participants.find(p => p.playerId === viewerId) ?? null;
    const myVoteRow = await sql `SELECT * FROM community_debate_votes WHERE debate_id = ${debateId} AND player_id = ${viewerId}`;
    const myVote = myVoteRow.length ? {
        id: myVoteRow[0].id, debateId, playerId: viewerId,
        side: myVoteRow[0].side, createdAt: Number(myVoteRow[0].created_at),
    } : null;
    const raisedHands = await getRaisedHands(debateId);
    return { ...debate, participants, arguments: args, votesCounts, myParticipation: myPart, myVote, raisedHands };
}
export async function createDebate(createdBy, topic, description) {
    if (!topic.trim())
        throw new Error('Topic is required.');
    if (topic.length > 200)
        throw new Error('Topic too long.');
    const id = randomUUID();
    const now = Date.now();
    await sql `
    INSERT INTO community_debates (id, topic, description, created_by, status, phase, phase_duration, created_at)
    VALUES (${id}, ${topic.trim()}, ${description.trim().slice(0, 1000)}, ${createdBy}, 'open', 'waiting', 0, ${now})
  `;
    return rowToDebate((await sql `SELECT * FROM community_debates WHERE id = ${id}`)[0]);
}
export async function joinDebate(debateId, playerId, side) {
    const debateRows = await sql `SELECT * FROM community_debates WHERE id = ${debateId}`;
    if (!debateRows.length)
        throw new Error('Debate not found.');
    if (debateRows[0].status !== 'open')
        throw new Error('Debate is no longer open.');
    const existing = await sql `SELECT * FROM community_debate_participants WHERE debate_id = ${debateId} AND player_id = ${playerId}`;
    if (existing.length) {
        if (existing[0].side === side)
            return { id: existing[0].id, debateId, playerId, side, joinedAt: Number(existing[0].joined_at) };
        await sql `UPDATE community_debate_participants SET side = ${side} WHERE debate_id = ${debateId} AND player_id = ${playerId}`;
        return { id: existing[0].id, debateId, playerId, side, joinedAt: Number(existing[0].joined_at) };
    }
    const id = randomUUID();
    const now = Date.now();
    await sql `
    INSERT INTO community_debate_participants (id, debate_id, player_id, side, joined_at)
    VALUES (${id}, ${debateId}, ${playerId}, ${side}, ${now})
  `;
    return { id, debateId, playerId, side, joinedAt: now };
}
export async function postArgument(debateId, playerId, content) {
    if (!content.trim())
        throw new Error('Argument content required.');
    if (content.length > 1000)
        throw new Error('Argument too long.');
    const debateRows = await sql `SELECT * FROM community_debates WHERE id = ${debateId}`;
    if (!debateRows.length)
        throw new Error('Debate not found.');
    if (debateRows[0].status !== 'open')
        throw new Error('Debate is closed.');
    const partRows = await sql `SELECT * FROM community_debate_participants WHERE debate_id = ${debateId} AND player_id = ${playerId}`;
    if (!partRows.length)
        throw new Error('You must join the debate first.');
    const part = partRows[0];
    if (part.side === 'spectator')
        throw new Error('Spectators cannot post arguments.');
    const id = randomUUID();
    const now = Date.now();
    await sql `
    INSERT INTO community_debate_arguments (id, debate_id, player_id, side, content, created_at)
    VALUES (${id}, ${debateId}, ${playerId}, ${part.side}, ${content.trim()}, ${now})
  `;
    const playerRow = await sql `SELECT username, avatar_url FROM players WHERE id = ${playerId}`;
    return {
        id, debateId, playerId, side: part.side,
        content: content.trim(), createdAt: now,
        username: playerRow[0]?.username, avatarUrl: playerRow[0]?.avatar_url ?? null,
    };
}
export async function voteDebate(debateId, playerId, side) {
    const debateRows = await sql `SELECT * FROM community_debates WHERE id = ${debateId}`;
    if (!debateRows.length)
        throw new Error('Debate not found.');
    const id = randomUUID();
    const now = Date.now();
    await sql `
    INSERT INTO community_debate_votes (id, debate_id, player_id, side, created_at)
    VALUES (${id}, ${debateId}, ${playerId}, ${side}, ${now})
    ON CONFLICT (debate_id, player_id) DO UPDATE SET side = EXCLUDED.side, created_at = EXCLUDED.created_at
  `;
    const voteRows = await sql `SELECT side, COUNT(*) as cnt FROM community_debate_votes WHERE debate_id = ${debateId} GROUP BY side`;
    const counts = { pro: 0, con: 0 };
    for (const v of voteRows) {
        if (v.side === 'pro')
            counts.pro = Number(v.cnt);
        if (v.side === 'con')
            counts.con = Number(v.cnt);
    }
    return counts;
}
export async function closeDebate(debateId, requesterId) {
    const debateRows = await sql `SELECT * FROM community_debates WHERE id = ${debateId}`;
    if (!debateRows.length)
        throw new Error('Debate not found.');
    const d = debateRows[0];
    if (d.created_by !== requesterId)
        throw new Error('Only the creator can close the debate.');
    if (d.status !== 'open')
        throw new Error('Already closed.');
    const voteRows = await sql `SELECT side, COUNT(*) as cnt FROM community_debate_votes WHERE debate_id = ${debateId} GROUP BY side`;
    let pro = 0, con = 0;
    for (const v of voteRows) {
        if (v.side === 'pro')
            pro = Number(v.cnt);
        if (v.side === 'con')
            con = Number(v.cnt);
    }
    const winnerSide = pro > con ? 'pro' : con > pro ? 'con' : null;
    await sql `UPDATE community_debates SET status = 'finished', winner_side = ${winnerSide}, phase = 'finished' WHERE id = ${debateId}`;
    return rowToDebate((await sql `SELECT * FROM community_debates WHERE id = ${debateId}`)[0]);
}
export async function startDebate(debateId, requesterId) {
    const rows = await sql `SELECT * FROM community_debates WHERE id = ${debateId}`;
    if (!rows.length)
        throw new Error('Debate not found.');
    const d = rows[0];
    if (d.status !== 'open')
        throw new Error('Debate is not open.');
    if ((d.phase ?? 'waiting') !== 'waiting')
        throw new Error('Debate already started.');
    if (d.created_by !== requesterId)
        throw new Error('Only the creator can start the debate.');
    const now = Date.now();
    const newPhase = 'opening_pro';
    const duration = PHASE_DURATION_SECONDS[newPhase] ?? 0;
    await sql `
    UPDATE community_debates
    SET phase = ${newPhase}, phase_started_at = ${now}, phase_duration = ${duration}
    WHERE id = ${debateId}
  `;
    return rowToDebate((await sql `SELECT * FROM community_debates WHERE id = ${debateId}`)[0]);
}
export async function advancePhase(debateId) {
    const rows = await sql `SELECT * FROM community_debates WHERE id = ${debateId}`;
    if (!rows.length)
        throw new Error('Debate not found.');
    const d = rows[0];
    const currentPhase = (d.phase ?? 'waiting');
    const nextPhase = getNextPhase(currentPhase);
    const now = Date.now();
    const duration = PHASE_DURATION_SECONDS[nextPhase] ?? 0;
    if (nextPhase === 'finished') {
        // Calculate winner from votes
        const voteRows = await sql `SELECT side, COUNT(*) as cnt FROM community_debate_votes WHERE debate_id = ${debateId} GROUP BY side`;
        let pro = 0, con = 0;
        for (const v of voteRows) {
            if (v.side === 'pro')
                pro = Number(v.cnt);
            if (v.side === 'con')
                con = Number(v.cnt);
        }
        const winnerSide = pro > con ? 'pro' : con > pro ? 'con' : null;
        await sql `
      UPDATE community_debates
      SET phase = ${nextPhase}, phase_started_at = ${now}, phase_duration = ${duration},
          status = 'finished', winner_side = ${winnerSide}
      WHERE id = ${debateId}
    `;
    }
    else {
        await sql `
      UPDATE community_debates
      SET phase = ${nextPhase}, phase_started_at = ${now}, phase_duration = ${duration}
      WHERE id = ${debateId}
    `;
    }
    return rowToDebate((await sql `SELECT * FROM community_debates WHERE id = ${debateId}`)[0]);
}
export async function skipPhase(debateId, requesterId) {
    const rows = await sql `SELECT * FROM community_debates WHERE id = ${debateId}`;
    if (!rows.length)
        throw new Error('Debate not found.');
    const d = rows[0];
    const currentPhase = (d.phase ?? 'waiting');
    const activeSide = getActiveSide(currentPhase);
    // Check: requesterId must be on the active side OR be creator
    if (d.created_by !== requesterId) {
        if (activeSide) {
            const partRows = await sql `SELECT * FROM community_debate_participants WHERE debate_id = ${debateId} AND player_id = ${requesterId}`;
            if (!partRows.length || partRows[0].side !== activeSide) {
                throw new Error('You are not on the active side.');
            }
        }
        else {
            throw new Error('Only the creator can skip this phase.');
        }
    }
    return advancePhase(debateId);
}
export async function raiseHand(debateId, playerId, side) {
    const id = randomUUID();
    const now = Date.now();
    await sql `
    INSERT INTO community_debate_raised_hands (id, debate_id, player_id, side, raised_at)
    VALUES (${id}, ${debateId}, ${playerId}, ${side}, ${now})
    ON CONFLICT (debate_id, player_id) DO UPDATE SET side = EXCLUDED.side, raised_at = EXCLUDED.raised_at
  `;
}
export async function lowerHand(debateId, playerId) {
    await sql `DELETE FROM community_debate_raised_hands WHERE debate_id = ${debateId} AND player_id = ${playerId}`;
}
export async function getRaisedHands(debateId) {
    const rows = await sql `
    SELECT rh.player_id, rh.side, rh.raised_at, p.username
    FROM community_debate_raised_hands rh
    JOIN players p ON p.id = rh.player_id
    WHERE rh.debate_id = ${debateId}
    ORDER BY rh.raised_at ASC
  `;
    return rows.map((r) => ({
        playerId: r.player_id,
        side: r.side,
        raisedAt: Number(r.raised_at),
        username: r.username,
    }));
}
export async function promoteSpeaker(debateId, targetPlayerId, promotedBy) {
    const rows = await sql `SELECT * FROM community_debates WHERE id = ${debateId}`;
    if (!rows.length)
        throw new Error('Debate not found.');
    if (rows[0].created_by !== promotedBy)
        throw new Error('Only the creator can promote speakers.');
    // Find their raised hand to get declared side
    const handRows = await sql `SELECT * FROM community_debate_raised_hands WHERE debate_id = ${debateId} AND player_id = ${targetPlayerId}`;
    const declaredSide = (handRows[0]?.side === 'pro' || handRows[0]?.side === 'con') ? handRows[0].side : 'pro';
    // Remove from raised hands
    await lowerHand(debateId, targetPlayerId);
    // Join as speaker
    return joinDebate(debateId, targetPlayerId, declaredSide);
}
//# sourceMappingURL=debateService.js.map