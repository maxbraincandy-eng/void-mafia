/**
 * სპორტული მაფია — the tournament ruleset.
 *
 * WHAT MAKES IT A DIFFERENT GAME
 * ──────────────────────────────
 * Hosted mafia's default rules are the casual ones: the mafia see each other's
 * picks and settle on a target together, a tie at the vote is re-run, and the
 * don is simply the mafia who also checks for the sheriff. Sport is the strict
 * version and it changes four things that matter:
 *
 *   · The mafia shoot BLIND. Nobody sees who anybody else pressed, and unless
 *     every living member of the team lands on the same name, the night passes
 *     with nobody dead. That is the whole reason the planning night exists —
 *     the plan is the only coordination they get, and remembering it is the
 *     skill being tested.
 *
 *   · The don reads as a CITIZEN to the sheriff. In the casual rules the
 *     sheriff finds the don and the game is close to over; here the don is the
 *     mafia's insurance and the sheriff's check on them comes back clean.
 *
 *   · A tied vote goes to TRIBUNAL, not to a re-vote. The tied players defend
 *     themselves, and if the town still cannot separate them it decides whether
 *     to lose both or neither — and the players on trial do not get a say in
 *     their own fate.
 *
 *   · The game opens on a night with no killing in it.
 *
 * WHY IT IS ITS OWN MODULE
 * ────────────────────────
 * These are rules, not mechanics, and they are the part somebody will want to
 * read and check against how the game is actually played at a table. Left
 * inline they would be a dozen `if (m.sport)` branches spread across a
 * thousand-line service, and the ruleset would only exist in the reader's head.
 */
/**
 * Sport is played ten-handed and only ten-handed.
 *
 * Not a default that can be nudged — the role split, the parity maths and the
 * shape of a tribunal are all built on this number. Nine players is a different
 * game with the same name, so the mode simply refuses to start.
 */
export const SPORT_SEATS = 10;
/**
 * The fixed composition. One don, two mafia, one sheriff, six citizens.
 *
 * The host does not choose this. Sport's whole premise is that every table is
 * the same table, and a composition anybody can adjust is a house rule.
 */
export const SPORT_ROLES = {
    don: 1,
    mafia: 2,
    sheriff: 1,
    doctor: 0,
    maniac: 0,
    cult: 0,
};
/** Citizens are whatever is left, and this is the number it should come to. */
export const SPORT_CITIZENS = SPORT_SEATS - SPORT_ROLES.don - SPORT_ROLES.mafia - SPORT_ROLES.sheriff;
/**
 * Timings, in seconds.
 *
 * From how the game is actually run: a minute to plan, a minute each to speak,
 * half a minute to defend yourself, a minute to say goodbye.
 */
export const SPORT_TIMES = {
    /** The opening night: the mafia meet and agree an order. */
    planNight: 60,
    /** Each player's turn to talk in the day circle. */
    speech: 60,
    /** One tied player's defence at tribunal. */
    tribunalDefense: 30,
    /** The town's punish-or-free decision. */
    tribunalVote: 30,
    /** A dead player's farewell. */
    lastWords: 60,
};
/**
 * Does this table qualify to start as sport?
 *
 * Both halves are required and neither is inferred. The host asks for sport by
 * turning the don card on; the table has to have ten people in it. Anything
 * else is refused rather than quietly played by different rules — a game that
 * silently changes its own ruleset is worse than one that will not start.
 */
export function canStartSport(seatCount, donEnabled) {
    if (!donEnabled)
        return { ok: false, reason: 'დონის კარტი ჩართული არ არის' };
    if (seatCount !== SPORT_SEATS) {
        return { ok: false, reason: `სპორტული მაფია მხოლოდ ${SPORT_SEATS} მოთამაშეშია — ახლა ${seatCount}-ია` };
    }
    return { ok: true, reason: null };
}
/**
 * Who the sheriff sees when they check.
 *
 * The one line that makes the don worth being. `true` means the check comes
 * back as mafia — and the don never does, which is exactly the difference from
 * the casual rules where `isMafiaRole` answers this and the don is caught.
 */
export function sheriffSees(role) {
    return role === 'mafia';
}
/**
 * Did the mafia agree?
 *
 * Every living member of the team — the don included — must have pressed, and
 * all of them must have pressed the same name. One absence or one disagreement
 * and the night is quiet.
 *
 * Deliberately not a plurality with the don breaking ties, which is what the
 * casual rules do. Blind coordination is the mechanic; a tiebreak would hand it
 * back.
 */
export function agreedTarget(aliveTeam, picks) {
    if (aliveTeam.length === 0)
        return null;
    let target = null;
    for (const member of aliveTeam) {
        const pick = picks[member.userId];
        if (!pick)
            return null; // somebody did not shoot
        if (target === null)
            target = pick;
        else if (target !== pick)
            return null; // somebody shot somebody else
    }
    return target;
}
/**
 * Has the mafia's night ended?
 *
 * Separate from `agreedTarget` because "everybody has acted" and "everybody
 * agreed" are different questions, and only the first one closes the night. A
 * team that all pressed different names is finished acting; they have simply
 * wasted the night.
 */
export function teamHasActed(aliveTeam, picks) {
    return aliveTeam.every(s => Boolean(picks[s.userId]));
}
/**
 * Who may vote at tribunal.
 *
 * Not the players on trial. Their fate is the question, and letting them answer
 * it turns "should we lose both?" into a maths problem about how many of the
 * remaining town they need — which is not what the tribunal is for.
 */
export function tribunalElectorate(seats, onTrial) {
    return seats.filter(s => s.alive && !onTrial.includes(s.userId));
}
/**
 * The tribunal's verdict.
 *
 * A strict majority of those who voted is needed to punish. Everything else —
 * a tie, an empty room, more abstentions than votes — frees them, because
 * taking two players out of a ten-hand game is the heavier outcome and the
 * burden belongs on the side asking for it.
 */
export function tribunalVerdict(punish, free) {
    return punish > free ? 'punish' : 'free';
}
//# sourceMappingURL=sportMafiaRules.js.map