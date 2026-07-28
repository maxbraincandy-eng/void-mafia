import { ok, err, } from './types/index.js';
import { getProfile, tap, merge, evolve, openChest, claimSocial, buyUpgrade, catalog, leaderboard, shopState, buyChest, buyEnergy, } from './services/mergeService.js';
const isErr = (r) => !!r && typeof r === 'object' && 'error' in r;
export function registerMergeHandlers(_io, socket) {
    const uid = () => socket.data.profileId ?? '';
    const need = (cb) => {
        const id = uid();
        if (!id) {
            cb(err('საჭიროა ავტორიზაცია'));
            return null;
        }
        return id;
    };
    socket.on('merge:state', async (cb) => {
        try {
            const id = need(cb);
            if (!id)
                return;
            cb(ok({ profile: await getProfile(id), catalog: catalog() }));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('merge:tap', async (data, cb) => {
        try {
            const id = need(cb);
            if (!id)
                return;
            const r = await tap(id, Number(data?.count ?? 1));
            if (isErr(r))
                return cb(err(r.error));
            cb(ok(r));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('merge:merge', async (data, cb) => {
        try {
            const id = need(cb);
            if (!id)
                return;
            const r = await merge(id, String(data?.key), Number(data?.times ?? 1));
            if (isErr(r))
                return cb(err(r.error));
            cb(ok(r));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('merge:evolve', async (cb) => {
        try {
            const id = need(cb);
            if (!id)
                return;
            const r = await evolve(id);
            if (isErr(r))
                return cb(err(r.error));
            cb(ok(r));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('merge:open', async (data, cb) => {
        try {
            const id = need(cb);
            if (!id)
                return;
            const r = await openChest(id, String(data?.tier));
            if (isErr(r))
                return cb(err(r.error));
            cb(ok(r));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('merge:social', async (cb) => {
        try {
            const id = need(cb);
            if (!id)
                return;
            const r = await claimSocial(id);
            if (isErr(r))
                return cb(err(r.error));
            cb(ok(r));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('merge:upgrade', async (data, cb) => {
        try {
            const id = need(cb);
            if (!id)
                return;
            const r = await buyUpgrade(id, String(data?.key));
            if (isErr(r))
                return cb(err(r.error));
            cb(ok(r));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── coin shop: chests for the app's ordinary mafia coins ──
    socket.on('merge:shop', async (cb) => {
        try {
            const id = need(cb);
            if (!id)
                return;
            cb(ok(await shopState(id)));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('merge:buy_chest', async (data, cb) => {
        try {
            const id = need(cb);
            if (!id)
                return;
            const r = await buyChest(id, String(data?.tier));
            if (isErr(r))
                return cb(err(r.error));
            cb(ok(r));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('merge:buy_energy', async (cb) => {
        try {
            const id = need(cb);
            if (!id)
                return;
            const r = await buyEnergy(id);
            if (isErr(r))
                return cb(err(r.error));
            cb(ok(r));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('merge:board', async (data, cb) => {
        try {
            cb(ok(await leaderboard(Number(data?.limit ?? 50))));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
}
//# sourceMappingURL=merge.js.map