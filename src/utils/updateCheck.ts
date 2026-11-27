import { compareVersions } from "./sleepTimer";
import { APP_VERSION } from "./appVersion";

/**
 * Lightweight "a newer version exists" hint.
 *
 * The user asked for just a small hint, not an in-app updater: check
 * GitHub Releases on startup (throttled, cached), and let Home show a
 * slim dismissible bar. Downloading still happens on the release page,
 * exactly like the manual check in Settings.
 *
 * Cache + dismissal live in localStorage next to the sleep-timer
 * deadline (same pattern as repository.loadSleepDeadline).
 */
export const RELEASES_API = "https://api.github.com/repos/sky1218-labs/pulse-tauri/releases/latest";
export const RELEASES_PAGE = "https://github.com/sky1218-labs/pulse-tauri/releases/latest";

const CACHE_KEY = "pulse.updateCheck.v1";
/** Re-check at most every 6 hours; the cached "latest" is reused meanwhile. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface UpdateCache {
  checkedAt: number;
  latest: string | null;
  dismissed: string | null;
}

function loadCache(): UpdateCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<UpdateCache>;
      return {
        checkedAt: typeof p.checkedAt === "number" ? p.checkedAt : 0,
        latest: typeof p.latest === "string" ? p.latest : null,
        dismissed: typeof p.dismissed === "string" ? p.dismissed : null,
      };
    }
  } catch {
    /* ignore */
  }
  return { checkedAt: 0, latest: null, dismissed: null };
}

function saveCache(c: UpdateCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

/** The newer version to hint about, or null. Pure decision logic — unit-tested. */
export function hintVersion(latest: string | null, dismissed: string | null, current = APP_VERSION): string | null {
  if (!latest) return null;
  if (compareVersions(latest, current) <= 0) return null;
  if (dismissed && compareVersions(dismissed, latest) >= 0) return null;
  return latest;
}

export function dismissUpdateHint(version: string): void {
  const c = loadCache();
  c.dismissed = version;
  saveCache(c);
}

/**
 * Returns the version to hint about (or null). Serves the cache when
 * the last check is fresh; otherwise fetches the latest release tag.
 * Never throws — offline just means no hint.
 */
export async function checkForUpdateHint(now = Date.now()): Promise<string | null> {
  const cache = loadCache();
  if (now - cache.checkedAt < CHECK_INTERVAL_MS && cache.checkedAt > 0) {
    return hintVersion(cache.latest, cache.dismissed);
  }
  let latest: string | null = null;
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
    if (res.ok) {
      const json = (await res.json()) as { tag_name?: string };
      latest = (json.tag_name ?? "").replace(/^v/, "") || null;
    }
  } catch {
    latest = null;
  }
  if (latest === null && cache.latest) {
    // Fetch failed: keep the previous answer, just don't stamp it fresh
    // so the next launch retries.
    return hintVersion(cache.latest, cache.dismissed);
  }
  cache.checkedAt = now;
  cache.latest = latest;
  saveCache(cache);
  return hintVersion(latest, cache.dismissed);
}
