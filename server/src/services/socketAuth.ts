import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sql } from '../db.js';

const TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

function signingSecret(): string {
  const configured = process.env.AUTH_SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV !== 'production') return 'void-mafia-dev-secret';
  throw new Error('AUTH_SESSION_SECRET must be configured in production.');
}

/** Issue a signed bearer credential only after the server has authenticated the player. */
export async function issueSocketToken(uid: string): Promise<string> {
  const [row] = await sql`SELECT auth_version FROM players WHERE id = ${uid} LIMIT 1` as any[];
  if (!row) throw new Error('Player record not found.');
  const payload = Buffer.from(JSON.stringify({
    sub: uid,
    ver: Number(row.auth_version ?? 0),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    nonce: randomBytes(12).toString('hex'),
  })).toString('base64url');
  const signature = createHmac('sha256', signingSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

/** Verify signature, expiry, account version, and optional player binding. */
export async function verifySocketToken(token: unknown, expectedUid?: string): Promise<string | null> {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const [payload, supplied, extra] = token.split('.');
  if (!payload || !supplied || extra) return null;
  try {
    const expected = createHmac('sha256', signingSecret()).update(payload).digest();
    const actual = Buffer.from(supplied, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: unknown;
      ver?: unknown;
      exp?: unknown;
    };
    if (typeof claims.sub !== 'string' || !claims.sub || typeof claims.ver !== 'number' || typeof claims.exp !== 'number') return null;
    if (claims.exp <= Math.floor(Date.now() / 1000)) return null;
    if (expectedUid && claims.sub !== expectedUid) return null;
    const [row] = await sql`SELECT auth_version FROM players WHERE id = ${claims.sub} LIMIT 1` as any[];
    if (!row || Number(row.auth_version ?? 0) !== claims.ver) return null;
    return claims.sub;
  } catch {
    return null;
  }
}

export function bearerTokenFromHeader(value: string | undefined): string | null {
  const match = /^Bearer (.+)$/i.exec(value ?? '');
  return match?.[1] ?? null;
}
