/**
 * Tell the Android shell whether a voice room is open.
 *
 * Android silences the microphone of an app that is not on screen and may
 * freeze it, unless a foreground service is running. The shell starts one
 * (VoiceCallService, with its "you are in a voice room" notification) while
 * this is on. Absent everywhere but the Android app, where it is a no-op.
 */
let active = false;

export function setNativeVoiceActive(on: boolean): void {
  if (on === active) return;
  const bridge = (window as any).AndroidVoiceService;
  if (!bridge || typeof bridge.setActive !== 'function') return;
  try {
    bridge.setActive(on);
    active = on;
  } catch { /* the shell refused; voice still works on screen */ }
}
