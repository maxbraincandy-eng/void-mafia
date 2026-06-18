import { randomUUID } from 'crypto';
import { sql } from '../db.js';

export type DebateSide = 'pro' | 'con' | 'spectator';
export type DebateStatus = 'open' | 'finished';

export interface Debate {
  id: string;
  topic: string;
  description: string;
  createdBy: string;
  status: DebateStatus;
  winnerSide: DebateSide | null;
  createdAt: number;
  endsAt: number | null;
}

export interface DebateParticipant {
  id: string;
  debateId: string;
  playerId: string;
  side: DebateSide;
  joinedAt: number;
  username?: string;
  avatarUrl?: string | null;
}

export interface DebateArgument {
  id: string;
  debateId: string;
  playerId: string;
  side: DebateSide;
  content: string;
  createdAt: number;
  username?: string;
  avatarUrl?: string | null;
}

export interface DebateVote {
  id: string;
  debateId: string;
  playerId: string;
  side: DebateSide;
  createdAt: number;
}

export interface DebateFull extends Debate {
  participants: DebateParticipant[];
  arguments: DebateArgument[];
  votesCounts: { pro: number; con: number };
  myParticipation: DebateParticipant | null;
  myVote: DebateVote | null;
}

function rowToDebate(r: any): Debate {
  return {
    id: r.id,
    topic: r.topic,
    description: r.description ?? '',
    createdBy: r.created_by,
    status: r.status as DebateStatus,
    winnerSide: r.winner_side ?? null,
    createdAt: Number(r.created_at),
    endsAt: r.ends_at ? Number(r.ends_at) : null,
  };
}

export async function listDebates(status: DebateStatus | 'all' = 'open', limit = 30): Promise<Debate[]> {
  let rows: any[];
  if (status === 'all') {
    rows = await sql`SELECT * FROM community_debates ORDER BY created_at DESC LIMIT ${limit}`;
  } else {
    rows = await sql`SELECT * FROM community_debates WHERE status = ${status} ORDER BY created_at DESC LIMIT ${limit}`;
  }
  return rows.map(rowToDebate);
}

export async function getDebateFull(debateId: string, viewerId: string): Promise<DebateFull | null> {
  const rows = await sql`SELECT * FROM community_debates WHERE id = ${debateId}`;
  if (!rows.length) return null;
  const debate = rowToDebate(rows[0]);

  const participantRows = await sql`
    SELECT dp.*, p.username, p.avatar_url
    FROM community_debate_participants dp
    JOIN players p ON p.id = dp.player_id
    WHERE dp.debate_id = ${debateId}
    ORDER BY dp.joined_at ASC
  `;
  const participants: DebateParticipant[] = participantRows.map((r: any) => ({
    id: r.id, debateId: r.debate_id, playerId: r.player_id,
    side: r.side as DebateSide, joinedAt: Number(r.joined_at),
    username: r.username, avatarUrl: r.avatar_url ?? null,
  }));

  const argRows = await sql`
    SELECT da.*, p.username, p.avatar_url
    FROM community_debate_arguments da
    JOIN players p ON p.id = da.player_id
    WHERE da.debate_id = ${debateId}
    ORDER BY da.created_at ASC
  `;
  const args: DebateArgument[] = argRows.map((r: any) => ({
    id: r.id, debateId: r.debate_id, playerId: r.player_id,
    side: r.side as DebateSide, content: r.content,
    createdAt: Number(r.created_at),
    username: r.username, avatarUrl: r.avatar_url ?? null,
  }));

  const voteRows = await sql`SELECT side, COUNT(*) as cnt FROM community_debate_votes WHERE debate_id = ${debateId} GROUP BY side`;
  const votesCounts = { pro: 0, con: 0 };
  for (const v of voteRows) {
    if (v.side === 'pro') votesCounts.pro = Number(v.cnt);
    if (v.side === 'con') votesCounts.con = Number(v.cnt);
  }

  const myPart = participants.find(p => p.playerId === viewerId) ?? null;
  const myVoteRow = await sql`SELECT * FROM community_debate_votes WHERE debate_id = ${debateId} AND player_id = ${viewerId}`;
  const myVote: DebateVote | null = myVoteRow.length ? {
    id: myVoteRow[0].id, debateId, playerId: viewerId,
    side: myVoteRow[0].side as DebateSide, createdAt: Number(myVoteRow[0].created_at),
  } : null;

  return { ...debate, participants, arguments: args, votesCounts, myParticipation: myPart, myVote };
}

export async function createDebate(createdBy: string, topic: string, description: string): Promise<Debate> {
  if (!topic.trim()) throw new Error('Topic is required.');
  if (topic.length > 200) throw new Error('Topic too long.');
  const id = randomUUID();
  const now = Date.now();
  await sql`
    INSERT INTO community_debates (id, topic, description, created_by, status, created_at)
    VALUES (${id}, ${topic.trim()}, ${description.trim().slice(0, 1000)}, ${createdBy}, 'open', ${now})
  `;
  return rowToDebate((await sql`SELECT * FROM community_debates WHERE id = ${id}`)[0]);
}

export async function joinDebate(debateId: string, playerId: string, side: DebateSide): Promise<DebateParticipant> {
  const debateRows = await sql`SELECT * FROM community_debates WHERE id = ${debateId}`;
  if (!debateRows.length) throw new Error('Debate not found.');
  if (debateRows[0].status !== 'open') throw new Error('Debate is no longer open.');

  const existing = await sql`SELECT * FROM community_debate_participants WHERE debate_id = ${debateId} AND player_id = ${playerId}`;
  if (existing.length) {
    if (existing[0].side === side) return { id: existing[0].id, debateId, playerId, side, joinedAt: Number(existing[0].joined_at) };
    await sql`UPDATE community_debate_participants SET side = ${side} WHERE debate_id = ${debateId} AND player_id = ${playerId}`;
    return { id: existing[0].id, debateId, playerId, side, joinedAt: Number(existing[0].joined_at) };
  }

  const id = randomUUID();
  const now = Date.now();
  await sql`
    INSERT INTO community_debate_participants (id, debate_id, player_id, side, joined_at)
    VALUES (${id}, ${debateId}, ${playerId}, ${side}, ${now})
  `;
  return { id, debateId, playerId, side, joinedAt: now };
}

export async function postArgument(debateId: string, playerId: string, content: string): Promise<DebateArgument> {
  if (!content.trim()) throw new Error('Argument content required.');
  if (content.length > 1000) throw new Error('Argument too long.');

  const debateRows = await sql`SELECT * FROM community_debates WHERE id = ${debateId}`;
  if (!debateRows.length) throw new Error('Debate not found.');
  if (debateRows[0].status !== 'open') throw new Error('Debate is closed.');

  const partRows = await sql`SELECT * FROM community_debate_participants WHERE debate_id = ${debateId} AND player_id = ${playerId}`;
  if (!partRows.length) throw new Error('You must join the debate first.');
  const part = partRows[0];
  if (part.side === 'spectator') throw new Error('Spectators cannot post arguments.');

  const id = randomUUID();
  const now = Date.now();
  await sql`
    INSERT INTO community_debate_arguments (id, debate_id, player_id, side, content, created_at)
    VALUES (${id}, ${debateId}, ${playerId}, ${part.side}, ${content.trim()}, ${now})
  `;
  const playerRow = await sql`SELECT username, avatar_url FROM players WHERE id = ${playerId}`;
  return {
    id, debateId, playerId, side: part.side as DebateSide,
    content: content.trim(), createdAt: now,
    username: playerRow[0]?.username, avatarUrl: playerRow[0]?.avatar_url ?? null,
  };
}

export async function voteDebate(debateId: string, playerId: string, side: 'pro' | 'con'): Promise<{ pro: number; con: number }> {
  const debateRows = await sql`SELECT * FROM community_debates WHERE id = ${debateId}`;
  if (!debateRows.length) throw new Error('Debate not found.');

  const id = randomUUID();
  const now = Date.now();
  await sql`
    INSERT INTO community_debate_votes (id, debate_id, player_id, side, created_at)
    VALUES (${id}, ${debateId}, ${playerId}, ${side}, ${now})
    ON CONFLICT (debate_id, player_id) DO UPDATE SET side = EXCLUDED.side, created_at = EXCLUDED.created_at
  `;

  const voteRows = await sql`SELECT side, COUNT(*) as cnt FROM community_debate_votes WHERE debate_id = ${debateId} GROUP BY side`;
  const counts = { pro: 0, con: 0 };
  for (const v of voteRows) {
    if (v.side === 'pro') counts.pro = Number(v.cnt);
    if (v.side === 'con') counts.con = Number(v.cnt);
  }
  return counts;
}

export async function closeDebate(debateId: string, requesterId: string): Promise<Debate> {
  const debateRows = await sql`SELECT * FROM community_debates WHERE id = ${debateId}`;
  if (!debateRows.length) throw new Error('Debate not found.');
  const d = debateRows[0];
  if (d.created_by !== requesterId) throw new Error('Only the creator can close the debate.');
  if (d.status !== 'open') throw new Error('Already closed.');

  const voteRows = await sql`SELECT side, COUNT(*) as cnt FROM community_debate_votes WHERE debate_id = ${debateId} GROUP BY side`;
  let pro = 0, con = 0;
  for (const v of voteRows) {
    if (v.side === 'pro') pro = Number(v.cnt);
    if (v.side === 'con') con = Number(v.cnt);
  }
  const winnerSide = pro > con ? 'pro' : con > pro ? 'con' : null;

  await sql`UPDATE community_debates SET status = 'finished', winner_side = ${winnerSide} WHERE id = ${debateId}`;
  return rowToDebate((await sql`SELECT * FROM community_debates WHERE id = ${debateId}`)[0]);
}
