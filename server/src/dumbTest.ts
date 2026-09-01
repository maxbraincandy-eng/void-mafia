/**
 * დებილების ტესტი — socket handlers.
 *
 * Three events: draw a test, submit it, read the board. Follows the same shape
 * as the other game modules — `registerDumbHandlers(io, socket)` — so it hangs
 * off the connection with everything else.
 *
 * The questions go out WITHOUT their answers and the score is computed here.
 * That is the only thing in this file that matters for the leaderboard to mean
 * anything: a client that could see the answers, or report its own score, would
 * turn the board into a list of who looked.
 */

import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, ok, err,
} from './types/index.js';
import { drawTest, publicOf, QUESTIONS_PER_TEST, CATEGORIES, asCategory } from './services/dumbBank.js';
import {
  submitAttempt, getLeaderboard, getStatus, getCategoryBests, type DumbAnswer,
} from './services/dumbService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function registerDumbHandlers(_io: AppServer, socket: AppSocket): void {
  const uid = () => String(socket.data.profileId ?? socket.id);

  /**
   * The picker's contents.
   *
   * Sent rather than hardcoded in the client so the counts are the real pool
   * sizes — a screen promising "26 კითხვა" while the bank holds 20 is worse
   * than one that promises nothing.
   */
  socket.on('dumb:categories' as any, async (payload: any, cb: any) => {
    const ack = typeof payload === 'function' ? payload : cb;
    if (typeof ack !== 'function') return;
    try {
      ack(ok({
        categories: CATEGORIES,
        perTest: QUESTIONS_PER_TEST,
        mine: await getCategoryBests(uid()),
      }));
    } catch (e: any) { ack(err(e?.message ?? 'Failed.')); }
  });

  /** A fresh twelve from the chosen category, avoiding this player's last run. */
  socket.on('dumb:start' as any, async (payload: any, cb: any) => {
    const ack = typeof payload === 'function' ? payload : cb;
    if (typeof ack !== 'function') return;
    try {
      const category = asCategory(payload?.category);
      const status = await getStatus(uid(), category);
      const test = drawTest(status.lastQuestionIds, category);
      ack(ok({
        questions: test.map(publicOf),
        total: test.length,
        perTest: QUESTIONS_PER_TEST,
        category,
        bankSize: status.bankSize,
        best: status.best,
        plays: status.plays,
      }));
    } catch (e: any) { ack(err(e?.message ?? 'ვერ დაიწყო')); }
  });

  /** Scored here. The client's own opinion of its score is never asked for. */
  socket.on('dumb:submit' as any, async (data: any, cb: any) => {
    if (typeof cb !== 'function') return;
    try {
      const raw = Array.isArray(data?.answers) ? data.answers : [];
      const answers: DumbAnswer[] = raw.slice(0, 60).map((a: any) => ({
        questionId: String(a?.questionId ?? ''),
        optionId: a?.optionId == null ? null : String(a.optionId),
      }));
      cb(ok(await submitAttempt(uid(), answers, Number(data?.durationMs ?? 0))));
    } catch (e: any) { cb(err(e?.message ?? 'ვერ შეფასდა')); }
  });

  socket.on('dumb:leaderboard' as any, async (payload: any, cb: any) => {
    const ack = typeof payload === 'function' ? payload : cb;
    if (typeof ack !== 'function') return;
    try {
      const me = socket.data.profileId ?? null;
      const category = asCategory(payload?.category);
      ack(ok({
        category,
        rows: await getLeaderboard(me, category, Number(payload?.limit ?? 50)),
        me: me ? await getStatus(me, category) : null,
      }));
    } catch (e: any) { ack(err(e?.message ?? 'Failed.')); }
  });
}
