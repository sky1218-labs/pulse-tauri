package dev.pulse.tauri.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings as AndroidSettings
import androidx.core.content.FileProvider
import dev.pulse.tauri.data.VersionCompare
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/** One downloadable asset from a GitHub release. */
data class ReleaseAsset(val name: String, val url: String, val sizeBytes: Long)

/** A newer release with the APK this device should install. */
data class ReleaseInfo(val version: String, val asset: ReleaseAsset)

/**
 * In-app updates: fetch the latest GitHub release, pick the APK built
 * for this device's ABI, download it inside the app, and hand it to the
 * system installer. (Android always shows its own install confirmation
 * for sideloaded updates — no app can skip that without device-owner
 * privileges — but nothing ever opens a browser.)
 */
object Updater {

    const val CURRENT_VERSION = "1.0.1"
    private const val API = "https://api.github.com/repos/sky1218-labs/pulse-tauri/releases/latest"
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Pick the asset this device should install: a release-signed APK
     * for arm64-v8a first, then armeabi-v7a, then any non-debug APK.
     * AAB bundles and debug-signed fallbacks never win over a proper APK.
     */
    fun selectAsset(assets: List<ReleaseAsset>): ReleaseAsset? {
        val apks = assets.filter { it.name.endsWith(".apk") && !it.name.contains("debug") }
        return apks.firstOrNull { it.name.contains("arm64-v8a") }
            ?: apks.firstOrNull { it.name.contains("armeabi-v7a") }
            ?: apks.firstOrNull()
    }

    /** Parse a GitHub release JSON body into (version, assets). Pure. */
    fun parseRelease(body: String): Pair<String, List<ReleaseAsset>>? {
        return try {
            val root = json.parseToJsonElement(body).jsonObject
            val tag = root["tag_name"]?.jsonPrimitive?.content?.removePrefix("v")
            if (tag.isNullOrBlank()) return null
            val assets = root["assets"]?.jsonArray?.mapNotNull { el ->
                val obj = el.jsonObject
                val name = obj["name"]?.jsonPrimitive?.content ?: return@mapNotNull null
                val url = obj["browser_download_url"]?.jsonPrimitive?.content ?: return@mapNotNull null
                val size = obj["size"]?.jsonPrimitive?.longOrNull ?: 0L
                ReleaseAsset(name, url, size)
            } ?: emptyList()
            tag to assets
        } catch (t: Throwable) {
            null
        }
    }

    /** The latest release if it is newer than the running app, else null. */
    suspend fun fetchUpdate(): ReleaseInfo? = withContext(Dispatchers.IO) {
        val body = httpGet(API) ?: return@withContext null
        val (version, assets) = parseRelease(body) ?: return@withContext null
        if (VersionCompare.compare(version, CURRENT_VERSION) <= 0) return@withContext null
        val asset = selectAsset(assets) ?: return@withContext null
        ReleaseInfo(version, asset)
    }

    /** The latest version tag regardless of newness (manual check). */
    suspend fun fetchLatestVersion(): String? = withContext(Dispatchers.IO) {
        val body = httpGet(API) ?: return@withContext null
        parseRelease(body)?.first
    }

    private fun httpGet(url: String): String? {
        return try {
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.setRequestProperty("Accept", "application/vnd.github+json")
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            if (conn.responseCode != 200) null else conn.inputStream.bufferedReader().readText()
        } catch (t: Throwable) {
            null
        }
    }

    fun updateFile(context: Context, version: String): File =
        File(File(context.cacheDir, "updates").apply { mkdirs() }, "pulse-$version.apk")

    /** Download the APK into the app cache, reporting 0..100 progress. */
    suspend fun download(context: Context, info: ReleaseInfo, onProgress: (Int) -> Unit): File? =
        withContext(Dispatchers.IO) {
            try {
                val target = updateFile(context, info.version)
                val conn = URL(info.asset.url).openConnection() as HttpURLConnection
                conn.connectTimeout = 15000
                conn.readTimeout = 30000
                if (conn.responseCode != 200) return@withContext null
                val total = if (info.asset.sizeBytes > 0) info.asset.sizeBytes else conn.contentLength.toLong()
                conn.inputStream.use { input ->
                    target.outputStream().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        var downloaded = 0L
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            output.write(buffer, 0, read)
                            downloaded += read
                            if (total > 0) onProgress(((downloaded * 100) / total).toInt().coerceIn(0, 100))
                        }
                    }
                }
                if (total > 0 && target.length() != total) {
                    target.delete()
                    return@withContext null
                }
                target
            } catch (t: Throwable) {
                null
            }
        }

    fun canInstall(context: Context): Boolean =
        Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()

    fun installIntent(context: Context, file: File): Intent {
        val uri: Uri = FileProvider.getUriForFile(context, "dev.pulse.tauri.fileprovider", file)
        return Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    fun unknownSourcesSettingsIntent(context: Context): Intent =
        Intent(
            AndroidSettings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + context.packageName),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
