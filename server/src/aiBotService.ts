/**
 * AI bot chatter — makes bot players (owner-added via dev:fill_bots) actually
 * talk in the room chat during discussion phases, in Georgian, aware of the
 * game state. Powered by the configured Hermes provider (Groq/Gemini/etc).
 *
 * Deliberately conservative: one line per room per tick, min gap between lines,
 * a per-game LLM-call budget, and skips entirely when no provider is set — so
 * it never spams chat or burns the free-tier quota.
 */
import type { Server } from 'socket.io';
import { getAIProvider } from './ai/hermesProvider.js';
import { getAllRooms } from './services/roomService.js';
import { createPlayerMessage, addMessage } from './services/chatService.js';
import { submitVote, submitNightAction } from './services/gameService.js';
import { getRole } from './services/roleService.js';
import type { Room, Player } from './types/index.js';

const TALK_PHASES = new Set(['day', 'speech', 'voting']);
const TICK_MS = 5000;       // how often we consider making a bot talk
const MIN_GAP_MS = 8000;    // min time between two bot lines in one room
const SPEAK_CHANCE = 0.55;  // randomness so it isn't clockwork
const PER_GAME_BUDGET = 30; // hard cap on LLM calls per game (quota safety)

interface RoomState { lastAt: number; calls: number; busy: boolean; day: number }
const roomState = new Map<string, RoomState>();

function roleHint(bot: Player): string {
  if (bot.team === 'mafia') return 'შენ ფარულად მაფიის გუნდში ხარ — არასდროს გასცე ეს, თავი მშვიდობიან მოქალაქედ მოაჩვენე და ეჭვი უდანაშაულოებზე გადაიტანე.';
  if (bot.role === 'sheriff') return 'შენ შერიფი ხარ — ფრთხილად წარმართე დისკუსია, პირდაპირ ნუ გასცემ ვინ ხარ.';
  if (bot.role === 'don') return 'შენ დონი ხარ (მაფიის ლიდერი) — თავი მშვიდობიანად მოაჩვენე.';
  return 'შენ მშვიდობიანი მოქალაქე ხარ — ეძებე მაფია არგუმენტებით.';
}

async function generateLine(provider: NonNullable<ReturnType<typeof getAIProvider>>, room: Room, bot: Player): Promise<string> {
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

  // Tiny cap — a bot line is 1-2 sentences. This is the single biggest lever on
  // the daily token budget (Groq bills the requested max_tokens, not just used).
  const r = await provider.chat([{ role: 'user', content: user }], system, 100);
  return (r.text || '').trim().replace(/^["“'']+|["”'']+$/g, '').slice(0, 280);
}

// ── Bot game actions (heuristic — fast, no LLM/quota) ─────────────────
const rnd = <T>(arr: T[]): T | null => (arr.length ? arr[Math.floor(Math.random() * arr.length)]! : null);

function aliveOthers(room: Room, self: Player): Player[] {
  return [...room.players.values()].filter(p => p.isAlive && !p.isSpectator && !p.isQueuedNextRound && p.id !== self.id);
}

function pickVoteTarget(room: Room, bot: Player): Player | null {
  const others = aliveOthers(room, bot);
  // Mafia team avoids voting its own; town votes anyone.
  const pool = bot.team === 'mafia' ? others.filter(p => p.team !== 'mafia') : others;
  return rnd(pool.length ? pool : others);
}

function pickNightTarget(room: Room, bot: Player): Player | null {
  const others = aliveOthers(room, bot);
  if (bot.team === 'mafia') {
    const town = others.filter(p => p.team !== 'mafia');
    return rnd(town.length ? town : others);
  }
  if (bot.role === 'doctor' || bot.role === 'bodyguard') {
    // protect someone (or self if allowed)
    const pool = room.settings.allowDoctorSelfHeal ? [...others, bot] : others;
    return rnd(pool);
  }
  // sheriff / detective / lookout / tracker / consigliere … investigate anyone else
  return rnd(others);
}

/** Bots cast votes and perform night actions so games actually resolve.
 *  They only populate state — existing triggers (a human's action, or the
 *  phase timer) do the resolution, so no engine logic is duplicated here. */
function driveBotActions(room: Room): void {
  const bots = [...room.players.values()].filter(p => p.isBot && p.isAlive && !p.isSpectator && !p.isQueuedNextRound);
  if (!bots.length) return;

  if (room.phase === 'voting' || room.phase === 'revote') {
    for (const bot of bots) {
      if (room.votes.has(bot.id)) continue;
      const t = pickVoteTarget(room, bot);
      if (t) { try { submitVote(room, bot, t.id); } catch { /* invalid — skip */ } }
    }
  } else if (room.phase === 'night') {
    for (const bot of bots) {
      if (bot.hasActedThisPhase || room.nightActions.has(bot.id)) continue;
      if (!bot.role) continue;
      let role; try { role = getRole(bot.role); } catch { continue; }
      if (!role?.wakeAtNight) continue;
      if (bot.role === 'veteran' || bot.role === 'arsonist') continue; // skip chaotic self-target roles
      const t = pickNightTarget(room, bot);
      if (t) { try { submitNightAction(room, bot, t.id); } catch { /* invalid — skip */ } }
    }
  }
}

async function tick(io: Server): Promise<void> {
  // Game actions run even without an LLM provider (heuristic only).
  for (const room of getAllRooms()) { try { driveBotActions(room); } catch { /* ignore */ } }

  const provider = getAIProvider();
  if (!provider) return;
  const now = Date.now();

  for (const room of getAllRooms()) {
    let st = roomState.get(room.id);
    if (!st) { st = { lastAt: 0, calls: 0, busy: false, day: room.day }; roomState.set(room.id, st); }
    // reset the per-game budget when a fresh game starts
    if (room.phase === 'lobby' || room.day < st.day) { st.calls = 0; }
    st.day = room.day;

    if (st.busy) continue;
    if (!TALK_PHASES.has(room.phase)) continue;
    if (now - st.lastAt < MIN_GAP_MS) continue;
    if (st.calls >= PER_GAME_BUDGET) continue;
    if (Math.random() > SPEAK_CHANCE) continue;

    const bots = [...room.players.values()].filter(p => p.isBot && p.isAlive && !p.isSpectator && !p.isQueuedNextRound);
    if (!bots.length) continue;
    const bot = bots[Math.floor(Math.random() * bots.length)]!;

    st.busy = true; st.lastAt = now; st.calls++;
    generateLine(provider, room, bot)
      .then(line => {
        if (line && room.players.has(bot.id) && bot.isAlive) {
          const msg = createPlayerMessage(bot, line, 'room');
          addMessage(room, msg);
          io.to(room.id).emit('chat:new', msg as any);
        }
      })
      .catch(() => { /* provider hiccup — stay silent */ })
      .finally(() => { const s = roomState.get(room.id); if (s) s.busy = false; });
  }
}

let _timer: NodeJS.Timeout | null = null;
export function startAiBots(io: Server): void {
  if (_timer) return;
  _timer = setInterval(() => { tick(io).catch(() => {}); }, TICK_MS);
  console.log('[AI bots] chatter loop started');
}
