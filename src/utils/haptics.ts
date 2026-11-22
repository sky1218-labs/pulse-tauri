/**
 * Tactile feedback. Android WebView honours navigator.vibrate; desktop and
 * iOS Safari make it a no-op. Only for deliberate taps (play/pause, track
 * skip, chip select, primary confirmations, sleep-timer set) — never for
 * scroll or continuous slider drags.
 */
export function tap(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
    }
  } catch {
    /* unsupported — feedback is optional */
  }
}
