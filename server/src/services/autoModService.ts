/**
 * Automatic moderation.
 *
 * The app had no filter at all, which means at 03:00 a determined troll is
 * unopposed until a moderator happens to wake up. This closes that window.
 *
 * DESIGN RULE: it FLAGS, it does not punish.
 * Every automatic system produces false positives, and an automatic ban turns
 * a false positive into a lost player with no recourse. So the filter's whole
 * job is to raise a report a human then judges — the queue arrives pre-sorted
 * instead of empty. The only thing it does on its own is rate-limit a flood,
 * and that is reversible within seconds.
 *
 * The word list is deliberately short and targets unambiguous abuse. A long
 * list catches ordinary conversation and trains moderators to ignore the queue,
 * which is worse than having no filter.
 */

export type AutoFlagKind = 'slur' | 'spam' | 'flood' | 'link';

export interface AutoVerdict {
  /** Non-null when the message should raise an automatic report. */
  flag: AutoFlagKind | null;
  /** Short human-readable reason, shown to the moderator. */
  reason: string;
  /** True when the message should be withheld from the room entirely. */
  block: boolean;
}

// Unambiguous abuse in the three languages the app is actually used in.
// Matched on word boundaries against a normalised string, so "classic" cannot
// trip a substring rule.
const SLURS: string[] = [
  // English
  'faggot', 'nigger', 'retard', 'tranny',
  // Russian
  'пидор', 'пидорас', 'нигер', 'даун',
  // Georgian
  'პიდარასტი', 'ძაღლიშვილი', 'ყლე',
];

/**
 * Fold look-alike characters onto one alphabet before matching. Without this,
 * swapping a Latin "o" for a Cyrillic "о" walks straight past the list — which
 * is the first thing anyone tries.
 */
const CONFUSABLES: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'к': 'k',
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '@': 'a', '$': 's',
};

function normalise(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map(ch => CONFUSABLES[ch] ?? ch)
    .join('')
    // collapse padding used to break up a word: f.u.c.k / f u c k
    .replace(/[\s._\-*]+/g, '');
}

/** Per-sender recent history, for flood and repeat detection. */
interface Recent { texts: Array<{ t: number; norm: string }>; }
const recent = new Map<string, Recent>();
const WINDOW_MS = 12_000;
const FLOOD_COUNT = 6;      // messages in the window
const REPEAT_COUNT = 3;     // identical messages in the window

/** Drop history for senders who have gone quiet, so the map cannot grow forever. */
function prune(now: number): void {
  for (const [id, r] of recent) {
    r.texts = r.texts.filter(x => now - x.t < WINDOW_MS);
    if (r.texts.length === 0) recent.delete(id);
  }
}

let lastPrune = 0;

/**
 * Judge one message. Pure apart from the per-sender history it keeps, so the
 * rules can be tested directly.
 */
export function inspectMessage(senderId: string, text: string, now = Date.now()): AutoVerdict {
  if (now - lastPrune > WINDOW_MS) { prune(now); lastPrune = now; }

  const norm = normalise(text);

  // ── slurs ──
  for (const w of SLURS) {
    if (norm.includes(normalise(w))) {
      return { flag: 'slur', reason: `შესაძლო შეურაცხყოფა: „${w}"`, block: true };
    }
  }

  // ── history-based rules ──
  const r = recent.get(senderId) ?? { texts: [] };
  r.texts = r.texts.filter(x => now - x.t < WINDOW_MS);
  const identical = r.texts.filter(x => x.norm === norm).length;
  r.texts.push({ t: now, norm });
  recent.set(senderId, r);

  if (norm.length > 0 && identical + 1 >= REPEAT_COUNT) {
    return { flag: 'spam', reason: `ერთი და იგივე შეტყობინება ${identical + 1}-ჯერ ${WINDOW_MS / 1000} წამში`, block: true };
  }
  if (r.texts.length >= FLOOD_COUNT) {
    return { flag: 'flood', reason: `${r.texts.length} შეტყობინება ${WINDOW_MS / 1000} წამში`, block: false };
  }

  // ── unsolicited links ──
  // Flagged, never blocked: sharing a clip is normal, and blocking it would be
  // the filter interfering with ordinary conversation.
  if (/https?:\/\/|www\.|t\.me\/|discord\.gg\//i.test(text)) {
    return { flag: 'link', reason: 'შეტყობინება შეიცავს ბმულს', block: false };
  }

  return { flag: null, reason: '', block: false };
}

/** Forget a sender's history — used when a room closes. */
export function forgetSender(senderId: string): void { recent.delete(senderId); }
