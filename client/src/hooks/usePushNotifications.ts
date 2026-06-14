import { useState, useEffect } from 'react';
import { emitWithAck } from '@/lib/socket';

const SW_PATH = '/sw.js';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  const [permission, setPermission] = useState<NotificationPermission>(
    () => (typeof Notification !== 'undefined' ? Notification.permission : 'default'),
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [vapidKey, setVapidKey] = useState('');

  useEffect(() => {
    fetch('/api/push/vapid-key')
      .then(r => r.json())
      .then(d => { if (d.publicKey) setVapidKey(d.publicKey); })
      .catch(() => {});
  }, []);

  // Register SW and check subscription state
  useEffect(() => {
    if (!isSupported || !vapidKey) return;
    navigator.serviceWorker.register(SW_PATH).then(reg => {
      reg.pushManager.getSubscription().then(sub => setIsSubscribed(!!sub));
    }).catch(() => {});
  }, [isSupported, vapidKey]);

  const subscribe = async () => {
    if (!isSupported || !vapidKey || isLoading) return;
    setIsLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      const subJson = sub.toJSON() as any;
      await emitWithAck('push:subscribe', {
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
      });

      setIsSubscribed(true);
    } catch (e) {
      console.warn('[Push] subscribe failed', e);
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    if (!isSupported || isLoading) return;
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await emitWithAck('push:unsubscribe', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (e) {
      console.warn('[Push] unsubscribe failed', e);
    } finally {
      setIsLoading(false);
    }
  };

  return { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
