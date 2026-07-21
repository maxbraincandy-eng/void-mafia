import { ok, err, } from './types/index.js';
import { saveResult, getBoard, getMine, modRemove, MP_BOARD_SCOPES, } from './services/maxPuzzleService.js';
function userId(socket) { return socket.data.profileId ?? socket.id; }
export function registerMaxPuzzleHandlers(io, socket) {
    const uid = () => userId(socket);
    socket.on('maxpuzzle:submit', async (data, cb) => {
        try {
            await saveResult(uid(), {
                archetype: String(data?.archetype ?? ''),
                archetypeKa: String(data?.archetypeKa ?? ''),
                traits: (data?.traits && typeof data.traits === 'object') ? data.traits : {},
            });
            cb?.(ok({ saved: true }));
        }
        catch (e) {
            cb?.(err(e.message));
        }
    });
    socket.on('maxpuzzle:leaderboard', async (data, cb) => {
        try {
            const scopeRaw = String(data?.scope ?? 'independence');
            const scope = MP_BOARD_SCOPES.includes(scopeRaw) ? scopeRaw : 'independence';
            const { rows, myRow } = await getBoard(scope, uid());
            cb(ok({ scope, rows, myRow }));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('maxpuzzle:me', async (cb) => {
        try {
            cb(ok({ row: await getMine(uid()) }));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('maxpuzzle:mod_remove', async (data, cb) => {
        try {
            cb(ok(await modRemove(uid(), String(data?.userId ?? ''))));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
}
//# sourceMappingURL=maxpuzzle.js.map