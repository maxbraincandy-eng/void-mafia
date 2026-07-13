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
export declare function startAiBots(io: Server): void;
//# sourceMappingURL=aiBotService.d.ts.map