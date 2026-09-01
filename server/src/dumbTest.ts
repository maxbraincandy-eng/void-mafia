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
import { drawTest, publicOf, QUESTIONS_PER_TEST } from './services/dumbBank.js';
import { submitAttempt, getLeaderboard, getStatus, type DumbAnswer } from './services/dumbService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function registerDumbHandlers(_io: AppServer, socket: AppSocket): void {
  const uid = () => String(socket.data.profileId ?? socket.id);

  /** A fresh twelve, avoiding whatever this player saw last time. */
  socket.on('dumb:start' as any, async (payload: any, cb: any) => {
    const ack = typeof payload === 'function' ? payload : cb;
    if (typeof ack !== 'function') return;
    try {
      const status = await getStatus(uid());
      const test = drawTest(status.lastQuestionIds);
      ack(ok({
        questions: test.map(publicOf),
        total: test.length,
        perTest: QUESTIONS_PER_TEST,
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
      ack(ok({
        rows: await getLeaderboard(me, Number(payload?.limit ?? 50)),
        me: me ? await getStatus(me) : null,
      }));
    } catch (e: any) { ack(err(e?.message ?? 'Failed.')); }
  });
}
