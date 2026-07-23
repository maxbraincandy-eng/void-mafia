/**
 * platform — detect whether we're running inside the native Capacitor app
 * (Android/iOS) versus a normal web browser.
 *
 * Capacitor injects a `window.Capacitor` global into the WebView, even when the
 * app loads the live remote site. We read that global directly (no bundled
 * dependency) so the check works in the remote-URL setup.
 *
 * Why this matters: digital goods (coins, passes) sold INSIDE the native app
 * must go through Google Play / Apple billing — Stripe/card checkout is not
 * allowed and gets the app rejected or removed. So the coin shop uses this to
 * pick the store-billing path in the app and keep Stripe on the web.
 */
export function isNativeApp(): boolean {
  try {
    const cap = (window as any).Capacitor;
    if (cap) {
      if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform();
      if (typeof cap.getPlatform === 'function') return cap.getPlatform() !== 'web';
    }
  } catch { /* ignore */ }
  return false;
}

export type NativePlatform = 'ios' | 'android' | 'web';

export function nativePlatform(): NativePlatform {
  try {
    const p = (window as any).Capacitor?.getPlatform?.();
    if (p === 'ios' || p === 'android') return p;
  } catch { /* ignore */ }
  return 'web';
}
