import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';

export interface Tournament {
  id: string;
  name: string;
  status: 'open' | 'in_progress' | 'finished';
  maxPlayers: number;
  prizeCoins: number;
  createdBy: string;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  winnerId: string | null;
  participants: TournamentParticipant[];
}

export interface TournamentParticipant {
  playerId: string;
  username: string;
  avatar: string;
  avatarUrl: string | null;
  seed: number;
  eliminated: boolean;
}

export async function createTournament(createdBy: string, name: string, maxPlayers: number, prizeCoins: number): Promise<Tournament> {
  const id = generateId();
  const now = Date.now();
  await sql`INSERT INTO tournaments (id, name, status, max_players, prize_coins, created_by, created_at)
    VALUES (${id}, ${name.slice(0, 50)}, 'open', ${maxPlayers}, ${prizeCoins}, ${createdBy}, ${now})`;
  await sql`INSERT INTO tournament_participants (tournament_id, player_id, seed, joined_at)
    VALUES (${id}, ${createdBy}, 1, ${now})`;
  return getTournament(id) as Promise<Tournament>;
}

export async function joinTournament(tournamentId: string, playerId: string): Promise<void> {
  const [t] = await sql`SELECT status, max_players FROM tournaments WHERE id = ${tournamentId}` as any[];
  if (!t) throw new Error('Tournament not found.');
  if (t.status !== 'open') throw new Error('Tournament is not open for registration.');
  const [{ cnt }] = await sql`SELECT COUNT(*) as cnt FROM tournament_participants WHERE tournament_id = ${tournamentId}` as any[];
  if (Number(cnt) >= t.max_players) throw new Error('Tournament is full.');
  const [existing] = await sql`SELECT 1 FROM tournament_participants WHERE tournament_id = ${tournamentId} AND player_id = ${playerId}` as any[];
  if (existing) throw new Error('Already joined.');
  await sql`INSERT INTO tournament_participants (tournament_id, player_id, seed, joined_at)
    VALUES (${tournamentId}, ${playerId}, ${Number(cnt) + 1}, ${Date.now()})`;
}

export async function leaveTournament(tournamentId: string, playerId: string): Promise<void> {
  const [t] = await sql`SELECT status FROM tournaments WHERE id = ${tournamentId}` as any[];
  if (!t || t.status !== 'open') throw new Error('Cannot leave after tournament started.');
  await sql`DELETE FROM tournament_participants WHERE tournament_id = ${tournamentId} AND player_id = ${playerId}`;
}

export async function startTournament(tournamentId: string, requesterId: string): Promise<void> {
  const [t] = await sql`SELECT created_by, status FROM tournaments WHERE id = ${tournamentId}` as any[];
  if (!t) throw new Error('Tournament not found.');
  if (t.created_by !== requesterId) throw new Error('Only the creator can start.');
  if (t.status !== 'open') throw new Error('Already started.');
  const [{ cnt }] = await sql`SELECT COUNT(*) as cnt FROM tournament_participants WHERE tournament_id = ${tournamentId}` as any[];
  if (Number(cnt) < 2) throw new Error('Need at least 2 players.');
  await sql`UPDATE tournaments SET status = 'in_progress', started_at = ${Date.now()} WHERE id = ${tournamentId}`;
}

export async function eliminatePlayer(tournamentId: string, playerId: string): Promise<void> {
  await sql`UPDATE tournament_participants SET eliminated = true WHERE tournament_id = ${tournamentId} AND player_id = ${playerId}`;
}

export async function finishTournament(tournamentId: string, winnerId: string): Promise<void> {
  await sql`UPDATE tournaments SET status = 'finished', ended_at = ${Date.now()}, winner_id = ${winnerId} WHERE id = ${tournamentId}`;
}

export async function getTournament(id: string): Promise<Tournament | null> {
  const [t] = await sql`SELECT * FROM tournaments WHERE id = ${id}` as any[];
  if (!t) return null;
  const parts = await sql`
    SELECT tp.player_id, tp.seed, tp.eliminated, p.username, p.avatar, p.avatar_url
    FROM tournament_participants tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.tournament_id = ${id}
    ORDER BY tp.seed
  ` as any[];
  return {
    id: t.id,
    name: t.name,
    status: t.status,
    maxPlayers: t.max_players,
    prizeCoins: t.prize_coins,
    createdBy: t.created_by,
    createdAt: Number(t.created_at),
    startedAt: t.started_at ? Number(t.started_at) : null,
    endedAt: t.ended_at ? Number(t.ended_at) : null,
    winnerId: t.winner_id,
    participants: parts.map((p: any) => ({
      playerId: p.player_id,
      username: p.username,
      avatar: p.avatar,
      avatarUrl: p.avatar_url ?? null,
      seed: Number(p.seed),
      eliminated: !!p.eliminated,
    })),
  };
}

export async function listOpenTournaments(): Promise<Tournament[]> {
  const rows = await sql`SELECT id FROM tournaments WHERE status IN ('open', 'in_progress') ORDER BY created_at DESC LIMIT 20` as any[];
  const results: Tournament[] = [];
  for (const r of rows) {
    const t = await getTournament(r.id);
    if (t) results.push(t);
  }
  return results;
}
