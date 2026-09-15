/**
 * ვინ თქვა? — the phrases.
 *
 * WHAT MAKES A PHRASE WORK HERE
 * ─────────────────────────────
 * It is read ALOUD, once, by somebody trying not to sound like themselves, to
 * people who know their voice. So a phrase has three jobs and they all pull in
 * the same direction:
 *
 *   SHORT ENOUGH to read in one breath. A long sentence gives the reader time
 *   to settle back into their own voice, which is the whole thing the game is
 *   about hiding.
 *
 *   ABSURD ENOUGH that nobody would say it by accident. If a phrase sounds
 *   like something a person might actually mean, the room starts arguing about
 *   whether it was said in character, and the round stops being about voices.
 *
 *   NOT ABOUT ANYBODY. No phrase may be aimed at a player, a real person, or a
 *   group — the reader has to say it out loud to their friends, and a line that
 *   is funny to type is not always one that is fair to be handed.
 *
 * Nothing here is stored per player. The bank is a constant and a round sends
 * one index to one person.
 */

export const PHRASES = [
  'ჩემი მეზობლის კატა ჩემზე უკეთ მღერის',
  'გუშინ ღამით მაცივარმა მითხრა, რომ დამღლელი ვარ',
  'ვფიქრობ, პინგვინები ჩვენზე მეტს ფიქრობენ',
  'სამი წელია ერთსა და იმავე ნაყინს ვეძებ',
  'ჩემი ფეხსაცმელი ჩემზე ადრე დგება',
  'ყოველ ოთხშაბათს ვცდილობ კედელს დავეთანხმო',
  'ბანანი არასდროს მაპატიებს იმას, რაც გავაკეთე',
  'მე ვარ ერთადერთი, ვინც იცის სად მიდის ლიფტი, როცა ცარიელია',
  'ღრუბლები ჩემზე იცინიან, დარწმუნებული ვარ',
  'ჩემი ძაღლი ფიქრობს, რომ მე ვარ მისი ძაღლი',
  'თუ ჩაის ძალიან დიდხანს უყურებ, ის ჩაი აღარ არის',
  'კიბეებს არასოდეს ვენდობი — ისინი ორივე მხარეს მიდიან',
  'გუშინ თეფშს ბოდიში მოვუხადე',
  'ვფიქრობ, ჩემს ხმას სხვა ადამიანი იყენებს',
  'მთვარე ზედმეტად ხშირად მიყურებს',
  'ყველა ჩემი წინდა ერთმანეთს ეჭვიანობს',
  'მე და ჩემი სავარძელი აღარ ვსაუბრობთ',
  'საათი განზრახ ნელა დადის, როცა ვუყურებ',
  'ერთხელ ავტობუსს დავეჯიბრე და მოვიგე',
  'ჩემი სახელი უცნაურად ჟღერს, როცა თვითონ ვამბობ',
  'ვეჭვობ, რომ ხუთშაბათი არ არსებობს',
  'ყველაზე დიდი შიში მაქვს, რომ თევზებმა იციან',
  'პარასკევს ყოველთვის სხვანაირად ვსუნთქავ',
  'ჩემი ჩრდილი ჩემზე ადრე ბრუნდება სახლში',
  'ცოტა ხნის წინ გავიგე, რომ კარები მიმართულებას ირჩევენ',
  'დილით სარკეს ვეუბნები, რომ ყველაფერი კარგადაა',
  'ერთი ჭიქა წყალი მიპირებს რაღაცას',
  'მატარებლები ჩემზე უკეთ იციან სად მიდიან',
  'ხანდახან ვფიქრობ, რომ ხე უფრო მშვიდადაა',
  'ჩემმა კალამმა უარი თქვა ამის დაწერაზე',
  'გუშინ ორჯერ ვიყავი ერთსა და იმავე ადგილას, ერთდროულად',
  'ყველა ჩემი გასაღები ერთმანეთს ჰგავს და არცერთი არ მუშაობს',
  'ღამით სახლი ოდნავ დიდდება',
  'თოვლი მხოლოდ მაშინ მოდის, როცა არავინ უყურებს',
  'ჩემი ჩანთა ჩემზე მეტს ატარებს, ვიდრე უნდა',
  'ვფიცავ, რომ ეს კიბე გუშინ აქ არ იყო',
  'ზოგჯერ ტელეფონი განზრახ არ მრეკავს',
  'მე მგონი, ღრუბელი ჩემს უკან დადის',
  'ჩემი ჭიქა ყოველთვის ცოტათი უფრო ცარიელია, ვიდრე უნდა იყოს',
  'პომიდორმა ერთხელ დამანახა რაღაც, რაც ვერ დამავიწყდა',
];

/** How long the reader has, and how long everybody has to vote. */
export const READ_SECONDS = 25;
export const VOTE_SECONDS = 25;

/** Who gets what. */
export const POINTS_CORRECT_GUESS = 2;
/** The reader earns this for each player who voted for somebody else. */
export const POINTS_PER_FOOLED = 1;

/**
 * Pick a phrase for a round, avoiding the ones this match has already used.
 *
 * Deterministic in nothing — a match should not be able to predict its own
 * next line — but it must never repeat inside a match, because a phrase heard
 * twice tells the room more about the reader than about the voice.
 */
export function pickPhrase(used: number[]): number {
  const free = PHRASES.map((_, i) => i).filter(i => !used.includes(i));
  const pool = free.length ? free : PHRASES.map((_, i) => i);
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/**
 * Whose turn it is to read.
 *
 * Fair rotation rather than a random pick each round: with a random reader and
 * six rounds, somebody reads three times and somebody never reads at all, and
 * the player who never read has not played the game. The reader is the player
 * who has read least, ties broken by seat so it is stable, and the previous
 * reader is excluded outright so nobody goes twice in a row.
 */
export function pickReader(
  players: { userId: string; seat: number; timesRead: number; connected: boolean }[],
  previous: string | null,
): string | null {
  const eligible = players.filter(p => p.connected && p.userId !== previous);
  // Everyone but the last reader has left: they read again rather than nobody.
  const pool = eligible.length ? eligible : players.filter(p => p.connected);
  if (!pool.length) return null;
  let best = pool[0]!;
  for (const p of pool) {
    if (p.timesRead < best.timesRead || (p.timesRead === best.timesRead && p.seat < best.seat)) best = p;
  }
  return best.userId;
}

/**
 * Score one round.
 *
 * `votes` maps a voter to whom they accused. The reader does not vote — they
 * know the answer — and a vote for the reader is a correct guess.
 *
 * The reader is paid per player fooled rather than a flat bonus for escaping,
 * because a flat bonus makes a six-player round and a three-player round worth
 * the same, and in six it is far harder to stay hidden.
 */
export function scoreRound(
  readerId: string,
  votes: Record<string, string>,
): { correct: string[]; fooled: number; points: Record<string, number> } {
  const points: Record<string, number> = {};
  const correct: string[] = [];
  let fooled = 0;

  for (const [voter, target] of Object.entries(votes)) {
    if (voter === readerId) continue;            // the reader does not vote
    if (target === readerId) {
      correct.push(voter);
      points[voter] = (points[voter] ?? 0) + POINTS_CORRECT_GUESS;
    } else {
      fooled++;
    }
  }
  if (fooled > 0) points[readerId] = (points[readerId] ?? 0) + fooled * POINTS_PER_FOOLED;
  return { correct, fooled, points };
}
