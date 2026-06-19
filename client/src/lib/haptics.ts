type HapticType = 'tap' | 'selection' | 'success' | 'error' | 'heavy';

const PATTERNS: Record<HapticType, number | number[]> = {
  tap:       10,
  selection: 15,
  success:   [20, 40, 60],
  error:     [80, 40, 80],
  heavy:     55,
};

export function haptic(type: HapticType = 'tap') {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(PATTERNS[type]);
    }
  } catch {
    // silently ignore — vibration not supported
  }
}
