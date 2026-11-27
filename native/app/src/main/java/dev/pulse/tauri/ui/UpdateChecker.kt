package dev.pulse.tauri.ui

import android.content.Context
import dev.pulse.tauri.data.VersionCompare
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * The update hint, native edition: check GitHub Releases on startup
 * (throttled to once per 6 hours, cached in SharedPreferences) and
 * surface just the newer version string. Downloading happens on the
 * release page — a hint, not an in-app updater.
 */
object UpdateChecker {

    const val CURRENT_VERSION = "1.0.0"
    private const val API = "https://api.github.com/repos/sky1218-labs/pulse-tauri/releases/latest"
    const val RELEASES_PAGE = "https://github.com/sky1218-labs/pulse-tauri/releases/latest"
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
    suspend fun check(context: Context): String? = withContext(Dispatchers.IO) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val dismissed = prefs.getString("dismissed", null)
        val lastAt = prefs.getLong("checkedAt", 0L)
        val cached = prefs.getString("latest", null)
        if (System.currentTimeMillis() - lastAt < INTERVAL_MS && lastAt > 0L) {
            return@withContext hintVersion(cached, dismissed)
        }
        val latest = fetchLatest()
        if (latest == null) return@withContext hintVersion(cached, dismissed)
        prefs.edit()
            .putLong("checkedAt", System.currentTimeMillis())
            .putString("latest", latest)
            .apply()
        hintVersion(latest, dismissed)
    }

    /** One-off manual check (Settings). Returns the latest tag or null. */
    suspend fun fetchLatest(): String? = withContext(Dispatchers.IO) {
        try {
            val conn = URL(API).openConnection() as HttpURLConnection
            conn.setRequestProperty("Accept", "application/vnd.github+json")
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            if (conn.responseCode != 200) return@withContext null
            val body = conn.inputStream.bufferedReader().readText()
            val tag = JSONObject(body).optString("tag_name", "")
            tag.removePrefix("v").ifBlank { null }
        } catch (t: Throwable) {
            null
        }
    }
}
