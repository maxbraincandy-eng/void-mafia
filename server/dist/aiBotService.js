import { getAIProvider } from './ai/hermesProvider.js';
import { getAllRooms } from './services/roomService.js';
import { createPlayerMessage, addMessage } from './services/chatService.js';
const TALK_PHASES = new Set(['day', 'speech', 'voting']);
const TICK_MS = 5000; // how often we consider making a bot talk
const MIN_GAP_MS = 8000; // min time between two bot lines in one room
const SPEAK_CHANCE = 0.55; // randomness so it isn't clockwork
const PER_GAME_BUDGET = 80; // hard cap on LLM calls per game (quota safety)
const roomState = new Map();
function roleHint(bot) {
    if (bot.team === 'mafia')
        return 'შენ ფარულად მაფიის გუნდში ხარ — არასდროს გასცე ეს, თავი მშვიდობიან მოქალაქედ მოაჩვენე და ეჭვი უდანაშაულოებზე გადაიტანე.';
    if (bot.role === 'sheriff')
        return 'შენ შერიფი ხარ — ფრთხილად წარმართე დისკუსია, პირდაპირ ნუ გასცემ ვინ ხარ.';
    if (bot.role === 'don')
        return 'შენ დონი ხარ (მაფიის ლიდერი) — თავი მშვიდობიანად მოაჩვენე.';
    return 'შენ მშვიდობიანი მოქალაქე ხარ — ეძებე მაფია არგუმენტებით.';
}
async function generateLine(provider, room, bot) {
    const alive = [...room.players.values()]
        .filter(p => p.isAlive && !p.isSpectator && !p.isQueuedNextRound)
        .map(p => `#${p.seat} ${p.name}${p.id === bot.id ? ' (შენ)' : ''}`);
    const recent = room.chat.slice(-8).filter(m => !m.isSystem)
        .map(m => `#${m.seat ?? '?'} ${m.senderName}: ${m.text}`).join('\n');
    const system = `შენ ხარ "${bot.name}", მაფიის სოციალურ-დედუქციური თამაშის ცოცხალი მოთამაშე (ადგილი #${bot.seat}). ${roleHint(bot)}
წესები:
- უპასუხე მხოლოდ ქართულად, ერთი ბუნებრივი მოკლე რეპლიკით (მაქსიმუმ 1–2 წინადადება).
- ილაპარაკე როგორც ცოცხალი მოთამაშე: ეჭვი, კითხვა, თავის დაცვა ან მოკავშირის ძებნა.
- არ დაწერო რომ AI ხარ და არ გაამხილო შენი როლი.
- არ გაიმეორო ის, რაც უკვე თქვეს. მიმართე კონკრეტულ მოთამაშეს ნომრით ან სახელით.`;
    const user = `ცოცხალი მოთამაშეები: ${alive.join(', ')}.
ბოლო რეპლიკები:
${recent || '(ჯერ ყველა ჩუმად არის)'}

დაწერე შენი შემდეგი მოკლე რეპლიკა ქართულად.`;
    const r = await provider.chat([{ role: 'user', content: user }], system);
    return (r.text || '').trim().replace(/^["“'']+|["”'']+$/g, '').slice(0, 280);
}
async function tick(io) {
    const provider = getAIProvider();
    if (!provider)
        return;
    const now = Date.now();
    for (const room of getAllRooms()) {
        let st = roomState.get(room.id);
        if (!st) {
            st = { lastAt: 0, calls: 0, busy: false, day: room.day };
            roomState.set(room.id, st);
        }
        // reset the per-game budget when a fresh game starts
        if (room.phase === 'lobby' || room.day < st.day) {
            st.calls = 0;
        }
        st.day = room.day;
        if (st.busy)
            continue;
        if (!TALK_PHASES.has(room.phase))
            continue;
        if (now - st.lastAt < MIN_GAP_MS)
            continue;
        if (st.calls >= PER_GAME_BUDGET)
            continue;
        if (Math.random() > SPEAK_CHANCE)
            continue;
        const bots = [...room.players.values()].filter(p => p.isBot && p.isAlive && !p.isSpectator && !p.isQueuedNextRound);
        if (!bots.length)
            continue;
        const bot = bots[Math.floor(Math.random() * bots.length)];
        st.busy = true;
        st.lastAt = now;
        st.calls++;
        generateLine(provider, room, bot)
            .then(line => {
            if (line && room.players.has(bot.id) && bot.isAlive) {
                const msg = createPlayerMessage(bot, line, 'room');
                addMessage(room, msg);
                io.to(room.id).emit('chat:new', msg);
            }
        })
            .catch(() => { })
            .finally(() => { const s = roomState.get(room.id); if (s)
            s.busy = false; });
    }
}
let _timer = null;
export function startAiBots(io) {
    if (_timer)
        return;
    _timer = setInterval(() => { tick(io).catch(() => { }); }, TICK_MS);
    console.log('[AI bots] chatter loop started');
}
//# sourceMappingURL=aiBotService.js.map