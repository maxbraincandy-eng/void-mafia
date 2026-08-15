export declare const RECOVERY_TTL_MS: number;
/** e.g. "M4KZ-7QPT-R9WD". Ambiguity removed because people transcribe these. */
export declare function generateCode(): string;
/** Issue a new code for a player, invalidating any previous one. */
export declare function issueRecoveryCode(playerId: string): Promise<string>;
export declare function hasRecoveryCode(playerId: string): Promise<boolean>;
/**
 * Reset a password with email + recovery code.
 *
 * Every failure path returns the SAME message. Telling an attacker "no such
 * email" turns this endpoint into a way to enumerate who has an account —
 * and on this product, who has an account is itself sensitive.
 */
export declare function resetWithCode(emailRaw: string, codeRaw: string, newPassword: string): Promise<{
    ok: true;
}>;
//# sourceMappingURL=recoveryService.d.ts.map