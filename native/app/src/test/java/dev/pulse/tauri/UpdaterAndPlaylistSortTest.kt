package dev.pulse.tauri

import dev.pulse.tauri.data.Playlist
import dev.pulse.tauri.data.PlaylistSort
import dev.pulse.tauri.ui.ReleaseAsset
import dev.pulse.tauri.ui.Updater
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UpdaterAndPlaylistSortTest {

    private fun asset(name: String) = ReleaseAsset(name, "https://example.com/$name", 1000L)

    @Test
    fun selectAssetPrefersReleaseArm64Apk() {
        val assets = listOf(
            asset("pulse-android-release.aab"),
            asset("pulse-android-armeabi-v7a.apk"),
            asset("pulse-android-arm64-v8a.apk"),
        )
        assertEquals("pulse-android-arm64-v8a.apk", Updater.selectAsset(assets)?.name)
    }

    @Test
    fun selectAssetSkipsDebugBuilds() {
        val assets = listOf(
            asset("pulse-android-arm64-v8a-debug.apk"),
            asset("pulse-android-armeabi-v7a.apk"),
        )
        assertEquals("pulse-android-armeabi-v7a.apk", Updater.selectAsset(assets)?.name)
    }

    @Test
    fun selectAssetNullWhenNoApk() {
        assertNull(Updater.selectAsset(listOf(asset("pulse-android-release.aab"))))
    }

    @Test
    fun parseReleaseReadsTagAndAssets() {
        val body = """
            {"tag_name":"v1.0.0","assets":[
              {"name":"pulse-android-arm64-v8a.apk","size":13744542,
               "browser_download_url":"https://github.com/x/releases/download/v1.0.0/pulse-android-arm64-v8a.apk"},
              {"name":"pulse-android-release.aab","size":13450956,
               "browser_download_url":"https://github.com/x/releases/download/v1.0.0/pulse-android-release.aab"}
            ]}
        """.trimIndent()
        val parsed = Updater.parseRelease(body)
        assertEquals("1.0.0", parsed?.first)
        assertEquals(2, parsed?.second?.size)
        assertEquals(13744542L, parsed?.second?.first()?.sizeBytes)
        // End to end: the parsed payload selects the arm64 APK.
        assertEquals(
            "pulse-android-arm64-v8a.apk",
            Updater.selectAsset(parsed!!.second)?.name,
        )
    }

    @Test
    fun parseReleaseRejectsGarbage() {
        assertNull(Updater.parseRelease("not json"))
        assertNull(Updater.parseRelease("{}"))
    }

    private fun pl(name: String, created: Long, updated: Long, count: Int) =
        Playlist(id = name, name = name, trackIds = List(count) { "t$it" }, createdAt = created, updatedAt = updated)

    @Test
    fun playlistSortRecentNameCreatedCount() {
        val lists = listOf(
            pl("Beta", created = 100, updated = 300, count = 2),
            pl("alpha", created = 300, updated = 100, count = 5),
            pl("Gamma", created = 200, updated = 200, count = 1),
        )
        assertEquals(listOf("Beta", "Gamma", "alpha"), PlaylistSort.sort(lists, "recent", "desc").map { it.name })
        assertEquals(listOf("alpha", "Beta", "Gamma"), PlaylistSort.sort(lists, "name", "asc").map { it.name })
        assertEquals(listOf("alpha", "Gamma", "Beta"), PlaylistSort.sort(lists, "created", "desc").map { it.name })
        assertEquals(listOf("alpha", "Beta", "Gamma"), PlaylistSort.sort(lists, "count", "desc").map { it.name })
        assertEquals(listOf("Gamma", "Beta", "alpha"), PlaylistSort.sort(lists, "count", "asc").map { it.name })
    }
}
