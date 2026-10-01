/**
 * ტკბილეული თუ ხრიკი — socket handlers.
 *
 * Every action answers with the whole state, so the screen never has to work
 * out what a door did to the bag: it shows what the server says.
 */
import { ok, err, } from './types/index.js';
import { getState, startWalk, knockDoor, walkHome, getBoard, TotError } from './services/trickOrTreatService.js';
export function registerTrickOrTreatHandlers(_io, socket) {
    const uid = () => String(socket.data.profileId ?? socket.id);
    const handle = (event, act) => {
        socket.on(event, async (payload, cb) => {
            const ack = typeof payload === 'function' ? payload : cb;
            if (typeof ack !== 'function')
                return;
            try {
                const extra = await act();
                ack(ok({ ...(await getState(uid())), ...(extra && typeof extra === 'object' ? extra : {}) }));
            }
            catch (e) {
                // Rule refusals are for the player; anything else is ours, said plainly.
                if (!(e instanceof TotError))
                    console.error(`[tot] ${event}:`, e?.message);
                ack(err(e instanceof TotError ? e.message : 'ვერ მოხერხდა, სცადე თავიდან.'));
            }
        });
    };
    handle('tot:state', async () => null);
    handle('tot:start', async () => { await startWalk(uid()); return null; });
    handle('tot:knock', async () => ({ door: await knockDoor(uid()) }));
    handle('tot:home', async () => ({ banked: await walkHome(uid()) }));
    socket.on('tot:board', async (payload, cb) => {
        const ack = typeof payload === 'function' ? payload : cb;
        if (typeof ack !== 'function')
            return;
        try {
            ack(ok(await getBoard(socket.data.profileId ?? null)));
        }
        catch (e) {
            console.error('[tot] board:', e?.message);
            ack(err('ვერ ჩაიტვირთა.'));
        }
    });
}
//# sourceMappingURL=trickOrTreat.js.map