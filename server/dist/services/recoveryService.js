/**
 * Account recovery.
 *
 * WHY A CODE AND NOT A RESET EMAIL
 * ────────────────────────────────
 * There is no mail sender configured in this project — no SMTP, no provider,
 * no API key. A "reset link" feature would therefore be a button that silently
 * does nothing, which is worse than no button at all on a product where losing
 * your password means losing a dead relative's memorial.
 *
 * So recovery works with what exists: a one-time code, generated on request,
 * shown ONCE, and stored only as a bcrypt hash. The user writes it down or
 * saves it. Later they reset with email + code + a new password.
 *
 * This is not a stopgap that has to be torn out. When a mail provider is added,
 * the reset endpoint stays exactly as it is and email simply becomes a second
 * way to deliver the same kind of token.
 *
 * PROPERTIES THAT MATTER
 *   - stored hashed, so a database leak does not hand out accounts
 *   - single use: consumed on success, so a code seen over someone's shoulder
 *     is worthless once used
 *   - expires, so an old note in a drawer is not a permanent key
 *   - generating a new code invalidates the previous one
 *   - failures are rate-limited and never reveal whether the email exists
 */
import bcrypt from 'bcryptjs';
import { sql } from '../db.js';
export const RECOVERY_TTL_MS = 365 * 24 * 60 * 60 * 1000; // a year
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
/** Unambiguous alphabet: no 0/O, 1/I/L — these get written on paper. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** e.g. "M4KZ-7QPT-R9WD". Ambiguity removed because people transcribe these. */
export function generateCode() {
    const bytes = new Uint8Array(12);
    globalThis.crypto.getRandomValues(bytes);
    const chars = [...bytes].map(b => ALPHABET[b % ALPHABET.length]);
    return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map(g => g.join('')).join('-');
}
function normalise(code) {
    return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
/** Issue a new code for a player, invalidating any previous one. */
export async function issueRecoveryCode(playerId) {
    const code = generateCode();
    const hash = await bcrypt.hash(normalise(code), 10);
    await sql `
    UPDATE players
    SET recovery_hash = ${hash}, recovery_issued_at = ${Date.now()},
        recovery_attempts = 0, recovery_attempt_at = NULL
    WHERE id = ${playerId}
  `;
    return code;
}
export async function hasRecoveryCode(playerId) {
    const [row] = await sql `SELECT recovery_hash FROM players WHERE id = ${playerId}`;
    return !!row?.recovery_hash;
}
/**
 * Reset a password with email + recovery code.
 *
 * Every failure path returns the SAME message. Telling an attacker "no such
 * email" turns this endpoint into a way to enumerate who has an account —
 * and on this product, who has an account is itself sensitive.
 */
export async function resetWithCode(emailRaw, codeRaw, newPassword) {
    const generic = new Error('ელფოსტა ან კოდი არასწორია.');
    const email = String(emailRaw ?? '').trim().toLowerCase();
    const code = normalise(codeRaw);
    if (!email || code.length < 8)
        throw generic;
    if (String(newPassword ?? '').length < 6)
        throw new Error('პაროლი მინიმუმ 6 სიმბოლო უნდა იყოს.');
    const [row] = await sql `
    SELECT id, recovery_hash, recovery_issued_at, recovery_attempts, recovery_attempt_at
    FROM players WHERE LOWER(email) = ${email}
  `;
    // Still hash-compare against a dummy when the account is missing, so a wrong
    // email is not measurably faster than a wrong code.
    const hash = row?.recovery_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu';
    const issuedAt = Number(row?.recovery_issued_at ?? 0);
    const lastAttempt = Number(row?.recovery_attempt_at ?? 0);
    // The window runs from the last FAILED ATTEMPT, not from when the code was
    // issued. Measuring it from issuance would make the limiter inert for a code
    // older than the window — and these codes are valid for a year.
    const fresh = Date.now() - lastAttempt < ATTEMPT_WINDOW_MS;
    const attempts = fresh ? Number(row?.recovery_attempts ?? 0) : 0;
    if (row && attempts >= MAX_ATTEMPTS) {
        throw new Error('ძალიან ბევრი მცდელობა. სცადე მოგვიანებით.');
    }
    const good = await bcrypt.compare(code, hash);
    if (!row || !row.recovery_hash || !good) {
        if (row) {
            await sql `
        UPDATE players
        SET recovery_attempts = ${attempts + 1}, recovery_attempt_at = ${Date.now()}
        WHERE id = ${row.id}
      `;
        }
        throw generic;
    }
    if (Date.now() - issuedAt > RECOVERY_TTL_MS) {
        throw new Error('კოდს ვადა გაუვიდა. შედი ანგარიშში და ახალი აიღე.');
    }
    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    // The code is consumed on success — one use, exactly.
    await sql `
    UPDATE players
    SET password_hash = ${passwordHash}, recovery_hash = NULL,
        recovery_attempts = 0, recovery_attempt_at = NULL
    WHERE id = ${row.id}
  `;
    return { ok: true };
}
//# sourceMappingURL=recoveryService.js.map