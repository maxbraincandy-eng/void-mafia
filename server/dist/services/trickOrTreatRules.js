/**
 * ტკბილეული თუ ხრიკი — the rules, with no I/O.
 *
 * A walk down a haunted street. Each knock opens one door; most give candy,
 * some give something useful, and a ghost takes the whole bag unless an amulet
 * stops it. Going home banks the bag. The ghost gets likelier with every door,
 * and the odds for the next one are on the screen — so the only question is
 * the one that makes it a game: one more door, or home?
 *
 * Every roll happens on the server. The client is told what a door held after
 * it is opened, and is told the next door early only by a lantern, which it
 * found by knocking. Nothing about an unopened door is in any payload.
 */
export const RUNS_PER_DAY = 5;
/** A walk ends by itself here; nobody should be able to knock for ever. */
export const MAX_DOORS = 30;
export const newWalk = () => ({ doors: [], bag: 0, amulet: false, peek: null, status: 'walking', banked: 0 });
/** The chance that door number `n` (1-based) is a ghost. */
export function ghostChance(n) {
    return Math.min(0.55, 0.06 + 0.04 * (n - 1));
}
/**
 * What is behind door `n`.
 *
 * Candy grows with depth, so walking further is worth something besides the
 * risk; without that the right play would be to bank after every door.
 */
export function rollDoor(n, rng = Math.random) {
    if (rng() < ghostChance(n))
        return { kind: 'ghost', amount: 0 };
    const r = rng();
    if (r < 0.70)
        return { kind: 'candy', amount: 1 + Math.floor(n / 3) + Math.floor(rng() * 3) };
    if (r < 0.78)
        return { kind: 'treat', amount: 8 + n };
    if (r < 0.85)
        return { kind: 'amulet', amount: 0 };
    if (r < 0.93)
        return { kind: 'lantern', amount: 0 };
    return { kind: 'cat', amount: 0 };
}
export class WalkError extends Error {
}
/** Open the next door. Returns the new walk and the door as it played out. */
export function knock(w, rng = Math.random) {
    if (w.status !== 'walking')
        throw new WalkError('ეს გასეირნება უკვე დასრულდა.');
    const n = w.doors.length + 1;
    let door = w.peek ?? rollDoor(n, rng);
    const walk = { ...w, doors: [...w.doors], peek: null };
    switch (door.kind) {
        case 'candy':
        case 'treat':
            walk.bag += door.amount;
            break;
        case 'amulet':
            // One at a time: a second amulet is worth a little candy instead.
            if (walk.amulet)
                door = { kind: 'candy', amount: 2 };
            if (door.kind === 'candy')
                walk.bag += door.amount;
            else
                walk.amulet = true;
            break;
        case 'lantern':
            walk.peek = rollDoor(n + 1, rng);
            break;
        case 'ghost':
            if (walk.amulet) {
                walk.amulet = false;
                door = { kind: 'ghost', amount: 0, saved: true };
            }
            else {
                walk.status = 'scared';
                walk.bag = 0;
            }
            break;
        case 'cat':
            break;
    }
    walk.doors.push(door);
    // The end of the street walks you home with whatever you are carrying.
    if (walk.status === 'walking' && walk.doors.length >= MAX_DOORS)
        return { walk: goHome(walk), door };
    return { walk, door };
}
/** Bank the bag. */
export function goHome(w) {
    if (w.status !== 'walking')
        throw new WalkError('ეს გასეირნება უკვე დასრულდა.');
    return { ...w, status: 'home', banked: w.bag, peek: null };
}
/**
 * Is it Halloween on the street?
 *
 * The whole of October and the first three days of November, by the Tbilisi
 * calendar — a month long rather than one night, so it is something to come
 * back to rather than something to miss.
 */
const TBILISI_OFFSET_MS = 4 * 3600000;
export function tbilisiDate(now) {
    const d = new Date(now + TBILISI_OFFSET_MS);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), key: d.toISOString().slice(0, 10) };
}
export function isSeason(now = Date.now()) {
    const { month, day } = tbilisiDate(now);
    return month === 10 || (month === 11 && day <= 3);
}
/** The season a moment belongs to: its Tbilisi year. */
export const seasonOf = (now = Date.now()) => tbilisiDate(now).year;
/** The next Tbilisi midnight, when the walks come back. */
export function nextMidnight(now = Date.now()) {
    const shifted = now + TBILISI_OFFSET_MS;
    return shifted - (shifted % 86400000) + 86400000 - TBILISI_OFFSET_MS;
}
/** What a finished walk looks like as text, for sharing. Never an unopened door. */
export function shareLine(w) {
    const icon = {
        candy: '🍬', treat: '🍫', amulet: '🧿', lantern: '🎃', cat: '🐈‍⬛', ghost: '👻',
    };
    const path = w.doors.map(d => (d.saved ? '🛡️' : icon[d.kind])).join('');
    const end = w.status === 'scared' ? '😱 შემაშინეს' : `🏠 ${w.banked} 🍬`;
    return `🎃 ტკბილეული თუ ხრიკი\n${path}\n${end}\nvoidmafia.one`;
}
//# sourceMappingURL=trickOrTreatRules.js.map