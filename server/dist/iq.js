import { ok, err, } from './types/index.js';
import { assembleTest, totalQuestions } from './services/iqBank.js';
import { scoreTest } from './services/iqScoring.js';
import { cooldownRemaining, recordAttempt, getLeaderboard, getMyStatus, getPublicProfile, isModerator, IQ_COOLDOWN_MS, } from './services/iqService.js';
function userId(socket) { return socket.data.profileId ?? socket.id; }
const DISCLAIMER = 'ეს ონლაინ შეფასება იძლევა კოგნიტური შესაძლებლობების სავარაუდო შეფასებას ლოგიკის, ' +
    'პატერნების ამოცნობის, რიცხვითი, სივრცითი და ვერბალური ამოცანების საფუძველზე. ' +
    'ეს არ არის კლინიკური ან პროფესიონალურად ჩატარებული IQ გამოცდა.';
const VALID_SCOPES = ['all', 'global', 'weekly', 'monthly', 'friends', 'clan'];
export function registerIQHandlers(io, socket) {
    const uid = () => userId(socket);
    // Begin a test — gated by the retake cooldown (moderators exempt).
    socket.on('iq:start', async (cb) => {
        try {
            const id = uid();
            const mod = await isModerator(id);
            const remaining = await cooldownRemaining(id, mod);
            if (remaining > 0) {
                return cb(ok({ available: false, retakeInMs: remaining, cooldownMs: IQ_COOLDOWN_MS, disclaimer: DISCLAIMER }));
            }
            const test = assembleTest();
            cb(ok({ available: true, test, total: test.length, disclaimer: DISCLAIMER }));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // Submit answers — scored on the server; the client-claimed score is ignored.
    socket.on('iq:submit', async (data, cb) => {
        try {
            const id = uid();
            const mod = await isModerator(id);
            const remaining = await cooldownRemaining(id, mod);
            if (remaining > 0)
                return cb(err('cooldown'));
            const rawAnswers = Array.isArray(data?.answers) ? data.answers : [];
            const answers = rawAnswers.slice(0, 200).map((a) => ({
                questionId: String(a?.questionId ?? ''),
                optionId: a?.optionId == null ? null : String(a.optionId),
                timeMs: Math.max(0, Math.min(3600000, Number(a?.timeMs ?? 0))),
            }));
            const meta = {
                totalMs: Math.max(0, Math.min(6 * 3600000, Number(data?.meta?.totalMs ?? 0))),
                tabBlurs: Math.max(0, Math.min(9999, Number(data?.meta?.tabBlurs ?? 0))),
                startedAt: Number(data?.meta?.startedAt ?? Date.now()),
            };
            const result = scoreTest(answers, meta);
            const { id: attemptId, isHighest, rank } = await recordAttempt(id, result);
            cb(ok({ attemptId, isHighest, rank, disclaimer: DISCLAIMER, ...result }));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('iq:leaderboard', async (data, cb) => {
        try {
            const scopeRaw = String(data?.scope ?? 'all');
            const scope = VALID_SCOPES.includes(scopeRaw) ? scopeRaw : 'all';
            const rows = await getLeaderboard(scope, uid());
            const me = rows.find(r => r.userId === uid()) ?? null;
            cb(ok({ scope, rows, myRow: me }));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('iq:me', async (cb) => {
        try {
            const id = uid();
            const mod = await isModerator(id);
            const status = await getMyStatus(id, mod);
            cb(ok({ ...status, totalQuestions: totalQuestions() }));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('iq:profile', async (data, cb) => {
        try {
            const targetId = String(data?.userId ?? '');
            if (!targetId)
                return cb(err('No user'));
            cb(ok(await getPublicProfile(targetId)));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
}
//# sourceMappingURL=iq.js.map