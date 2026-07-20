/**
 * VOID IQ — socket handlers. Test delivery, server-authoritative scoring,
 * leaderboard, personal status, and public profile snapshots.
 * Follows the game-module pattern: registerIQHandlers(io, socket).
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, ok, err,
} from './types/index.js';
import { assembleTest, totalQuestions } from './services/iqBank.js';
import { scoreTest, type IQAnswer } from './services/iqScoring.js';
import {
  cooldownRemaining, recordAttempt, getLeaderboard, getMyStatus, getPublicProfile,
  isModerator, IQ_COOLDOWN_MS, type IQScope,
} from './services/iqService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

function userId(socket: AppSocket): string { return socket.data.profileId ?? socket.id; }

const DISCLAIMER =
  'ეს ონლაინ შეფასება იძლევა კოგნიტური შესაძლებლობების სავარაუდო შეფასებას ლოგიკის, ' +
  'პატერნების ამოცნობის, რიცხვითი, სივრცითი და ვერბალური ამოცანების საფუძველზე. ' +
  'ეს არ არის კლინიკური ან პროფესიონალურად ჩატარებული IQ გამოცდა.';

const VALID_SCOPES: IQScope[] = ['all', 'global', 'weekly', 'monthly', 'friends', 'clan'];

export function registerIQHandlers(io: AppServer, socket: AppSocket): void {
  const uid = () => userId(socket);

  // Begin a test — gated by the retake cooldown (moderators exempt).
  socket.on('iq:start' as any, async (cb: (r: any) => void) => {
    try {
      const id = uid();
      const mod = await isModerator(id);
      const remaining = await cooldownRemaining(id, mod);
      if (remaining > 0) {
        return cb(ok({ available: false, retakeInMs: remaining, cooldownMs: IQ_COOLDOWN_MS, disclaimer: DISCLAIMER }));
      }
      const test = assembleTest();
      cb(ok({ available: true, test, total: test.length, disclaimer: DISCLAIMER }));
    } catch (e: any) { cb(err(e.message)); }
  });

  // Submit answers — scored on the server; the client-claimed score is ignored.
  socket.on('iq:submit' as any, async (data: any, cb: (r: any) => void) => {
    try {
      const id = uid();
      const mod = await isModerator(id);
      const remaining = await cooldownRemaining(id, mod);
      if (remaining > 0) return cb(err('cooldown'));

      const rawAnswers = Array.isArray(data?.answers) ? data.answers : [];
      const answers: IQAnswer[] = rawAnswers.slice(0, 200).map((a: any) => ({
        questionId: String(a?.questionId ?? ''),
        optionId: a?.optionId == null ? null : String(a.optionId),
        timeMs: Math.max(0, Math.min(3_600_000, Number(a?.timeMs ?? 0))),
      }));
      const meta = {
        totalMs: Math.max(0, Math.min(6 * 3_600_000, Number(data?.meta?.totalMs ?? 0))),
        tabBlurs: Math.max(0, Math.min(9999, Number(data?.meta?.tabBlurs ?? 0))),
        startedAt: Number(data?.meta?.startedAt ?? Date.now()),
      };

      const result = scoreTest(answers, meta);
      const { id: attemptId, isHighest, rank } = await recordAttempt(id, result);

      cb(ok({ attemptId, isHighest, rank, disclaimer: DISCLAIMER, ...result }));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('iq:leaderboard' as any, async (data: any, cb: (r: any) => void) => {
    try {
      const scopeRaw = String(data?.scope ?? 'all') as IQScope;
      const scope: IQScope = VALID_SCOPES.includes(scopeRaw) ? scopeRaw : 'all';
      const rows = await getLeaderboard(scope, uid());
      const me = rows.find(r => r.userId === uid()) ?? null;
      cb(ok({ scope, rows, myRow: me }));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('iq:me' as any, async (cb: (r: any) => void) => {
    try {
      const id = uid();
      const mod = await isModerator(id);
      const status = await getMyStatus(id, mod);
      cb(ok({ ...status, totalQuestions: totalQuestions() }));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('iq:profile' as any, async (data: any, cb: (r: any) => void) => {
    try {
      const targetId = String(data?.userId ?? '');
      if (!targetId) return cb(err('No user'));
      cb(ok(await getPublicProfile(targetId)));
    } catch (e: any) { cb(err(e.message)); }
  });
}
