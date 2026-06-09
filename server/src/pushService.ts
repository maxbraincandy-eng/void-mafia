import webpush from 'web-push';
import { sql } from './db.js';

let _publicKey = '';

export async function initPushService(): Promise<void> {
  let publicKey  = process.env.VAPID_PUBLIC_KEY  ?? '';
  let privateKey = process.env.VAPID_PRIVATE_KEY ?? '';

  if (!publicKey || !privateKey) {
    const [row] = await sql`SELECT value FROM app_settings WHERE key = 'vapid_keys'` as any[];
    if (row) {
      const saved = JSON.parse(row.value);
      publicKey  = saved.publicKey;
      privateKey = saved.privateKey;
    } else {
      const keys = webpush.generateVAPIDKeys();
      publicKey  = keys.publicKey;
      privateKey = keys.privateKey;
      await sql`
        INSERT INTO app_settings (key, value)
        VALUES ('vapid_keys', ${JSON.stringify(keys)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
      console.log('[Push] Generated and stored new VAPID keys');
    }
  }

  webpush.setVapidDetails('mailto:admin@voidmafia.app', publicKey, privateKey);
  _publicKey = publicKey;
  console.log('[Push] VAPID ready, public key:', publicKey.slice(0, 20) + '…');
}

export function getVapidPublicKey(): string {
  return _publicKey;
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; icon?: string },
): Promise<void> {
  if (!_publicKey) return;
  const subs = await sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${userId}
  ` as any[];
  if (subs.length === 0) return;

  const data = JSON.stringify({ ...payload, icon: payload.icon ?? '/icon-192.png' });
  await Promise.allSettled(
    subs.map(async (sub: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          data,
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await sql`DELETE FROM push_subscriptions WHERE endpoint = ${sub.endpoint}`;
        }
      }
    }),
  );
}
