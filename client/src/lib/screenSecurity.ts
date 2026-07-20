/**
 * screenSecurity — toggle the native screenshot / screen-recording guard.
 *
 * On the native Android build, MainActivity exposes `AndroidScreenSecurity`
 * (FLAG_SECURE): screenshots come out black, screen recording is blocked, and
 * the app is hidden in the recents preview. On the web (or iOS, which has no
 * equivalent) this is a safe no-op — browsers can't block OS screenshots.
 *
 * Use it around proctored screens like the VOID IQ test.
 */
export function setScreenSecure(enabled: boolean): void {
  try {
    const bridge = (window as any).AndroidScreenSecurity;
    if (bridge && typeof bridge.setSecure === 'function') {
      bridge.setSecure(enabled);
    }
  } catch { /* ignore — not on the native build */ }
}

/** True when the native screenshot guard is available (Android app build). */
export function screenSecuritySupported(): boolean {
  try {
    const bridge = (window as any).AndroidScreenSecurity;
    return !!(bridge && typeof bridge.setSecure === 'function');
  } catch { return false; }
}
