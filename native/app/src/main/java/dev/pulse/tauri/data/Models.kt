package dev.pulse.tauri.data

import kotlinx.serialization.Serializable

@Serializable
data class Track(
    val id: String,
    val path: String,
    val title: String,
    val artist: String = "",
    val album: String = "",
    val durationMs: Long = 0L,
    val fileSizeBytes: Long = 0L,
    val addedAt: Long = 0L,
    val favorite: Boolean = false,
) {
    val displayTitle: String get() = title.ifBlank { path.substringAfterLast('/') }
}

@Serializable
data class Playlist(
    val id: String,
    val name: String,
    val trackIds: List<String> = emptyList(),
    val createdAt: Long = 0L,
    val updatedAt: Long = 0L,
)

@Serializable
data class Settings(
    val defaultVolume: Float = 1.0f,
    val defaultPlaybackSpeed: Float = 1.0f,
    val skipForwardSeconds: Int = 30,
    val skipBackwardSeconds: Int = 10,
    val sleepTimerFadeOutEnabled: Boolean = true,
    val sleepTimerFadeOutSeconds: Int = 5,
    val repeatMode: String = "all",
    val shuffleEnabled: Boolean = false,
    val librarySortKey: String = "title",
    val librarySortDir: String = "asc",
    val monitoredFolders: List<String> = emptyList(),
    val autoUpdateEnabled: Boolean = true,
    val locale: String = "zh-TW",
)

@Serializable
data class LibraryData(
    val tracks: List<Track> = emptyList(),
    val playlists: List<Playlist> = emptyList(),
    val settings: Settings = Settings(),
    /** Saved playback position per track id (resume). */
    val positions: Map<String, Long> = emptyMap(),
    /** Last session, for the resume prompt / restore. */
    val lastQueueIds: List<String> = emptyList(),
    val lastCurrentId: String = "",
    val lastPositionMs: Long = 0L,
)
