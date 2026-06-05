import { Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { v4 as uuidv4 } from 'uuid';
import { sql } from './db.js';
import { getOrCreatePlayer } from './services/playerService.js';

// ── Session type augmentation ─────────────────────────────────────────
declare module 'express-session' {
  interface SessionData {
    uid: string;
    username: string;
    linkUid: string | undefined;
  }
}

// ── DB helpers ────────────────────────────────────────────────────────

async function findUserIdByProvider(provider: string, providerUserId: string): Promise<string | null> {
  const rows = await sql`
    SELECT user_id FROM auth_accounts
    WHERE provider = ${provider} AND provider_user_id = ${providerUserId}
    LIMIT 1
  ` as any[];
  return rows[0]?.user_id ?? null;
}

async function upsertAuthAccount(
  userId: string,
  provider: string,
  providerUserId: string,
  email: string | null,
  displayName: string | null,
  avatarUrl: string | null,
): Promise<void> {
  const now = Date.now();
  await sql`
    INSERT INTO auth_accounts (id, user_id, provider, provider_user_id, email, display_name, avatar_url, created_at, updated_at)
    VALUES (${uuidv4()}, ${userId}, ${provider}, ${providerUserId}, ${email}, ${displayName}, ${avatarUrl}, ${now}, ${now})
    ON CONFLICT (provider, provider_user_id)
    DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url, updated_at = EXCLUDED.updated_at
  `;
}

export async function getLinkedProviders(userId: string): Promise<Array<{ provider: string; email: string | null; displayName: string | null }>> {
  return sql`
    SELECT provider, email, display_name as "displayName"
    FROM auth_accounts WHERE user_id = ${userId}
  ` as any;
}

async function findOrCreateOAuthUser(
  provider: string,
  providerUserId: string,
  email: string | null,
  displayName: string,
  avatarUrl: string | null,
): Promise<string> {
  // Check if this OAuth account is already linked to a user
  const existingUid = await findUserIdByProvider(provider, providerUserId);
  if (existingUid) {
    await upsertAuthAccount(existingUid, provider, providerUserId, email, displayName, avatarUrl);
    return existingUid;
  }

  // New OAuth user — create a fresh player record
  const newUid = `oauth_${provider.slice(0,2)}_` + uuidv4().replace(/-/g, '').slice(0, 16);
  const sanitizedName = displayName.slice(0, 24) || 'Player';
  await getOrCreatePlayer(newUid, sanitizedName);
  await upsertAuthAccount(newUid, provider, providerUserId, email, displayName, avatarUrl);
  return newUid;
}

async function linkProviderToUser(
  userId: string,
  provider: string,
  providerUserId: string,
  email: string | null,
  displayName: string | null,
  avatarUrl: string | null,
): Promise<{ ok: boolean; error?: string }> {
  // Check if this OAuth identity is already linked to a different account
  const existingUid = await findUserIdByProvider(provider, providerUserId);
  if (existingUid && existingUid !== userId) {
    return { ok: false, error: 'This account is already linked to a different player.' };
  }
  await upsertAuthAccount(userId, provider, providerUserId, email, displayName, avatarUrl);
  return { ok: true };
}

// ── Passport configuration ────────────────────────────────────────────

export function configurePassport(): void {
  // Passport serialize/deserialize are required even though we use stateless session uid
  passport.serializeUser((user: any, done) => done(null, user));
  passport.deserializeUser((user: any, done) => done(null, user));

  const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID ?? '';
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
  const FACEBOOK_APP_ID      = process.env.FACEBOOK_APP_ID ?? '';
  const FACEBOOK_APP_SECRET  = process.env.FACEBOOK_APP_SECRET ?? '';
  // Strip trailing slash to avoid double-slash in callback URL
  const SERVER_PUBLIC_URL    = (process.env.SERVER_PUBLIC_URL ?? '').replace(/\/+$/, '');

  const googleCallbackURL  = `${SERVER_PUBLIC_URL}/api/auth/google/callback`;
  const facebookCallbackURL = `${SERVER_PUBLIC_URL}/api/auth/facebook/callback`;

  console.log(`[Auth] Google callback URL = ${googleCallbackURL}`);
  if (!SERVER_PUBLIC_URL) {
    console.warn('[Auth] WARNING: SERVER_PUBLIC_URL is not set — OAuth callbacks will use the wrong host in production');
  }

  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy(
      {
        clientID:     GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL:  googleCallbackURL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email      = profile.emails?.[0]?.value ?? null;
          const displayName = profile.displayName || profile.name?.givenName || 'Player';
          const avatarUrl  = profile.photos?.[0]?.value ?? null;
          done(null, { provider: 'google', providerUserId: profile.id, email, displayName, avatarUrl });
        } catch (e) {
          done(e as Error);
        }
      },
    ));
  }

  if (FACEBOOK_APP_ID && FACEBOOK_APP_SECRET) {
    passport.use(new FacebookStrategy(
      {
        clientID:     FACEBOOK_APP_ID,
        clientSecret: FACEBOOK_APP_SECRET,
        callbackURL:  facebookCallbackURL,
        profileFields: ['id', 'displayName', 'emails', 'photos'],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email      = profile.emails?.[0]?.value ?? null;
          const displayName = profile.displayName || 'Player';
          const avatarUrl  = profile.photos?.[0]?.value ?? null;
          done(null, { provider: 'facebook', providerUserId: profile.id, email, displayName, avatarUrl });
        } catch (e) {
          done(e as Error);
        }
      },
    ));
  }
}

// ── Auth Router ───────────────────────────────────────────────────────

export function createAuthRouter(): Router {
  const router = Router();

  // GET /api/auth/me — return uid if logged in via OAuth
  router.get('/me', (req, res) => {
    if (req.session.uid) {
      res.json({ ok: true, uid: req.session.uid, username: req.session.username });
    } else {
      res.json({ ok: false });
    }
  });

  // GET /api/auth/logout
  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  // ── Google ──────────────────────────────────────────────────────
  // Resolve callbackURL at request time so Railway env var changes
  // take effect without a restart, and the startup-time value never
  // gets stale.
  function getGoogleCallbackURL(): string {
    const base = (process.env.SERVER_PUBLIC_URL ?? '').replace(/\/+$/, '');
    const url = `${base}/api/auth/google/callback`;
    console.log(`[Auth] Google callback URL = ${url}`);
    return url;
  }

  router.get('/google', (req, res, next) => {
    if (req.query.link === '1' && req.session.uid) {
      req.session.linkUid = req.session.uid;
    }
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false,
      callbackURL: getGoogleCallbackURL(),
    } as any)(req, res, next);
  });

  router.get('/google/callback',
    (req, res, next) => {
      passport.authenticate('google', {
        session: false,
        callbackURL: getGoogleCallbackURL(),
        failureRedirect: `${process.env.CLIENT_URL ?? ''}/?oauth_error=1`,
      } as any)(req, res, next);
    },
    async (req, res) => {
      const CLIENT_URL = process.env.CLIENT_URL ?? '';
      try {
        const profile = req.user as any;
        const linkUid = req.session.linkUid;

        if (linkUid) {
          req.session.linkUid = undefined;
          const result = await linkProviderToUser(linkUid, profile.provider, profile.providerUserId, profile.email, profile.displayName, profile.avatarUrl);
          if (!result.ok) {
            return res.redirect(`${CLIENT_URL}/?oauth_error=${encodeURIComponent(result.error ?? 'Link failed')}`);
          }
          return res.redirect(`${CLIENT_URL}/?oauth_linked=google`);
        }

        const uid = await findOrCreateOAuthUser(profile.provider, profile.providerUserId, profile.email, profile.displayName, profile.avatarUrl);
        const rows = await sql`SELECT username FROM players WHERE id = ${uid} LIMIT 1` as any[];
        req.session.uid = uid;
        req.session.username = rows[0]?.username ?? 'Player';
        // Explicitly save session before redirect so the cookie is flushed
        await new Promise<void>((resolve, reject) =>
          req.session.save(err => (err ? reject(err) : resolve()))
        );
        res.redirect(`${CLIENT_URL}/?oauth_success=1`);
      } catch (e) {
        console.error('[Auth] Google callback error', e);
        res.redirect(`${process.env.CLIENT_URL ?? ''}/?oauth_error=1`);
      }
    }
  );

  // ── Facebook ─────────────────────────────────────────────────────
  router.get('/facebook', (req, res, next) => {
    if (req.query.link === '1' && req.session.uid) {
      req.session.linkUid = req.session.uid;
    }
    passport.authenticate('facebook', { scope: ['email'], session: false })(req, res, next);
  });

  router.get('/facebook/callback', passport.authenticate('facebook', { session: false, failureRedirect: `${process.env.CLIENT_URL ?? ''}/?oauth_error=1` }),
    async (req, res) => {
      const CLIENT_URL = process.env.CLIENT_URL ?? '';
      try {
        const profile = req.user as any;
        const linkUid = req.session.linkUid;

        if (linkUid) {
          req.session.linkUid = undefined;
          const result = await linkProviderToUser(linkUid, profile.provider, profile.providerUserId, profile.email, profile.displayName, profile.avatarUrl);
          if (!result.ok) {
            return res.redirect(`${CLIENT_URL}/?oauth_error=${encodeURIComponent(result.error ?? 'Link failed')}`);
          }
          return res.redirect(`${CLIENT_URL}/?oauth_linked=facebook`);
        }

        const uid = await findOrCreateOAuthUser(profile.provider, profile.providerUserId, profile.email, profile.displayName, profile.avatarUrl);
        const rows = await sql`SELECT username FROM players WHERE id = ${uid} LIMIT 1` as any[];
        req.session.uid = uid;
        req.session.username = rows[0]?.username ?? 'Player';
        res.redirect(`${CLIENT_URL}/?oauth_success=1`);
      } catch (e) {
        console.error('[Auth] Facebook callback error', e);
        res.redirect(`${process.env.CLIENT_URL ?? ''}/?oauth_error=1`);
      }
    }
  );

  // POST /api/auth/init-link — sets session.linkUid before redirecting to OAuth
  router.post('/init-link', (req, res) => {
    const uid = req.body?.uid as string | undefined;
    if (!uid) { res.status(400).json({ ok: false, error: 'Missing uid' }); return; }
    req.session.linkUid = uid;
    req.session.uid = uid;
    res.json({ ok: true });
  });

  // ── Linked accounts (for profile page) ───────────────────────────
  router.get('/linked', async (req, res) => {
    const uid = req.session.uid ?? req.query.uid as string;
    if (!uid) { res.json({ ok: true, providers: [] }); return; }
    try {
      const providers = await getLinkedProviders(uid);
      res.json({ ok: true, providers });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'DB error' });
    }
  });

  // DELETE /api/auth/unlink/:provider
  router.delete('/unlink/:provider', async (req, res) => {
    const uid = req.session.uid ?? (req.query.uid as string);
    if (!uid) { res.status(401).json({ ok: false, error: 'Not authenticated' }); return; }
    try {
      await sql`DELETE FROM auth_accounts WHERE user_id = ${uid} AND provider = ${req.params.provider}`;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'DB error' });
    }
  });

  return router;
}
