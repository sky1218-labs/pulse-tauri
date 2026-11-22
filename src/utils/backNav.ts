/**
 * Android system-back routing for the web layer.
 *
 * MainActivity (Android) asks `window.__pulseBack()` before exiting: the
 * function walks a priority stack of handlers — most recently registered
 * first, so an open dialog beats the screen router — and returns true when
 * someone consumed the press. When nobody does, Android falls through to
 * its default behaviour (exit the app).
 */

export type BackHandler = () => boolean;

export class BackNavRegistry {
  private handlers: BackHandler[] = [];

  /** Registers a handler; returns the unregister function. */
  register(handler: BackHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /** Asks handlers topmost-first; true when one consumed the press. */
  handleBack(): boolean {
    for (let i = this.handlers.length - 1; i >= 0; i--) {
      try {
        if (this.handlers[i]()) return true;
      } catch {
        /* a broken handler must not trap the back button */
      }
    }
    return false;
  }

  get size(): number {
    return this.handlers.length;
  }
}

/** The app-wide stack: dialogs register on mount, the router once at shell level. */
export const backNav = new BackNavRegistry();

/** Exposes the registry to the Android shell as `window.__pulseBack`. */
export function installBackBridge(registry: BackNavRegistry = backNav): void {
  if (typeof window === "undefined") return;
  (window as unknown as { __pulseBack?: () => boolean }).__pulseBack = () => registry.handleBack();
}
