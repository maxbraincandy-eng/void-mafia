/**
 * Copy text to the clipboard, with the fallback that still matters.
 *
 * `navigator.clipboard` needs a secure context and a user gesture, and it is
 * missing or refused often enough — an in-app browser, an older iOS, a page
 * opened over plain http during development — that a copy button which
 * silently does nothing is a real outcome. The old textarea trick works in all
 * of those, so it is kept as the second attempt rather than assumed dead.
 *
 * Returns whether the text actually made it, so callers can say so instead of
 * showing a confirmation that might be a lie.
 */
export async function copyText(text: string): Promise<boolean> {
  const value = String(text ?? '');
  if (!value) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch { /* fall through to the old way */ }

  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    // Off-screen but focusable: `display: none` cannot be selected, and iOS
    // refuses to copy from an element it considers invisible.
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
