/**
 * სიტყვა — socket handlers.
 *
 * Four events: read today, guess, read the boards. The same shape as the other
 * game modules so it hangs off the connection with everything else.
 *
 * Nothing here decides anything. The guess is scored in the service against a
 * word this process derives from the date, and the client is told five marks.
 * It is never sent the word while it can still be guessed — see wordService.
 */
import { ok, err, } from './types/index.js';
import { ALPHABET, MAX_GUESSES, WORD_LENGTH, SOLUTIONS } from './services/wordBank.js';
import { getState, submitGuess, getLeaderboard, getStreakBoard } from './services/wordService.js';
export function registerWordHandlers(_io, socket) {
    const uid = () => String(socket.data.profileId ?? socket.id);
    /**
     * Today, for this player, plus the shape of the board.
     *
     * The alphabet is sent rather than hardcoded in the client for the same
     * reason the categories are in დებილების ტესტი: one definition, and a
     * keyboard that cannot drift out of step with what the server will accept.
     */
    socket.on('word:state', async (payload, cb) => {
        const ack = typeof payload === 'function' ? payload : cb;
        if (typeof ack !== 'function')
            return;
        try {
            ack(ok({
                ...await getState(uid()),
                alphabet: ALPHABET,
                length: WORD_LENGTH,
                maxGuesses: MAX_GUESSES,
                bankSize: SOLUTIONS.length,
            }));
        }
        catch (e) {
            ack(err(e?.message ?? 'ვერ ჩაიტვირთა.'));
        }
    });
    /** A guess. Rejections cost nothing — see submitGuess. */
    socket.on('word:guess', async (payload, cb) => {
        const ack = typeof payload === 'function' ? payload : cb;
        if (typeof ack !== 'function')
            return;
        try {
            const out = await submitGuess(uid(), String(payload?.guess ?? ''));
            ack(ok(out));
        }
        catch (e) {
            ack(err(e?.message ?? 'ვერ გაიგზავნა.'));
        }
    });
    /** Today's solvers, fewest guesses first. Never their guesses. */
    socket.on('word:board', async (payload, cb) => {
        const ack = typeof payload === 'function' ? payload : cb;
        if (typeof ack !== 'function')
            return;
        try {
            ack(ok({ today: await getLeaderboard(), streaks: await getStreakBoard() }));
        }
        catch (e) {
            ack(err(e?.message ?? 'ვერ ჩაიტვირთა.'));
        }
    });
}
//# sourceMappingURL=word.js.map