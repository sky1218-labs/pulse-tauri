package dev.pulse.tauri

import dev.pulse.tauri.data.SortTracks
import dev.pulse.tauri.data.Track
import dev.pulse.tauri.data.VersionCompare
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DataLogicTest {

    private fun tr(title: String, artist: String = "", album: String = "", durationMs: Long = 0L, addedAt: Long = 0L, path: String = "/m/x.mp3") =
        Track(id = title, path = path, title = title, artist = artist, album = album, durationMs = durationMs, addedAt = addedAt)

    @Test
    fun naturalCompareOrdersDigitRunsNumerically() {
        assertTrue(SortTracks.naturalCompare("Track 2", "Track 10") < 0)
        assertTrue(SortTracks.naturalCompare("Track 10", "Track 2") > 0)
        assertEquals(0, SortTracks.naturalCompare("Same", "Same"))
    }

    @Test
    fun sortByTitleNaturalAndReversible() {
        val tracks = listOf(tr("Track 10"), tr("Track 2"), tr("Track 1"))
        assertEquals(listOf("Track 1", "Track 2", "Track 10"), SortTracks.sort(tracks, "title", "asc").map { it.title })
        assertEquals(listOf("Track 10", "Track 2", "Track 1"), SortTracks.sort(tracks, "title", "desc").map { it.title })
    }

    @Test
    fun sortByDateAddedMissingIsOldest() {
        val tracks = listOf(tr("new", addedAt = 300), tr("unstamped"), tr("old", addedAt = 100))
        assertEquals(listOf("new", "old", "unstamped"), SortTracks.sort(tracks, "dateAdded", "desc").map { it.title })
    }

    @Test
    fun sortByArtistFallsThroughToAlbumThenTitle() {
        val tracks = listOf(
            tr("one", artist = "B", album = "Z"),
            tr("two", artist = "B", album = "A"),
            tr("three", artist = "A", album = "Z"),
        )
        assertEquals(listOf("three", "two", "one"), SortTracks.sort(tracks, "artist", "asc").map { it.title })
    }

    @Test
    fun versionCompareSemver() {
        assertTrue(VersionCompare.compare("1.0.0", "0.3.0") > 0)
        assertTrue(VersionCompare.compare("0.2.4", "0.3.0") < 0)
        assertEquals(0, VersionCompare.compare("v1.0.0", "1.0.0"))
    }
}
