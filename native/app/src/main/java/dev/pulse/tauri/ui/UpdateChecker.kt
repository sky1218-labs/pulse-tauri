package dev.pulse.tauri.ui

import android.content.Context
import dev.pulse.tauri.data.VersionCompare

/**
 * The startup update hint: throttled (6 h) check of the latest GitHub
 * release, cached in SharedPreferences, dismissible per version. The
 * actual download/install lives in [Updater] / the ViewModel flow.
 */
object UpdateChecker {

    val CURRENT_VERSION: String get() = Updater.CURRENT_VERSION
    private const val PREFS = "pulse_update_check"
    private const val INTERVAL_MS = 6 * 60 * 60 * 1000L

    fun hintVersion(latest: String?, dismissed: String?): String? {
        if (latest.isNullOrBlank()) return null
        if (VersionCompare.compare(latest, CURRENT_VERSION) <= 0) return null
        if (!dismissed.isNullOrBlank() && VersionCompare.compare(dismissed, latest) >= 0) return null
        return latest
    }

    fun dismiss(context: Context, version: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString("dismissed", version).apply()
    }

    /** The version to hint about, or null. Never throws. */
    suspend fun check(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val dismissed = prefs.getString("dismissed", null)
        val lastAt = prefs.getLong("checkedAt", 0L)
        val cached = prefs.getString("latest", null)
        if (System.currentTimeMillis() - lastAt < INTERVAL_MS && lastAt > 0L) {
            return hintVersion(cached, dismissed)
        }
        val latest = Updater.fetchLatestVersion()
        if (latest == null) return hintVersion(cached, dismissed)
        prefs.edit()
            .putLong("checkedAt", System.currentTimeMillis())
            .putString("latest", latest)
            .apply()
        return hintVersion(latest, dismissed)
    }
}
