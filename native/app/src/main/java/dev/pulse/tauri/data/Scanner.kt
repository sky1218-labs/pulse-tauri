package dev.pulse.tauri.data

import android.media.MediaMetadataRetriever
import java.io.File
import java.security.MessageDigest

/**
 * Folder scanning, in Kotlin now (this used to be the Rust layer's one
 * real job): walk the folder tree for audio files and read their tags
 * with MediaMetadataRetriever. Track ids are a stable hash of the
 * canonical path, so rescans keep playlists/favourites/positions.
 */
object Scanner {

    private val AUDIO_EXTENSIONS = setOf("mp3", "flac", "wav", "aac", "ogg", "m4a", "opus")

    fun trackIdForPath(path: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(path.toByteArray(Charsets.UTF_8))
        val hex = digest.joinToString("") { "%02x".format(it) }
        return "t_" + hex.substring(0, 16)
    }

    fun isAudioFile(file: File): Boolean =
        file.isFile && file.extension.lowercase() in AUDIO_EXTENSIONS

    /** All audio files under [root], in walk order. */
    fun findAudioFiles(root: File): List<File> {
        if (!root.exists()) return emptyList()
        if (root.isFile) return if (isAudioFile(root)) listOf(root) else emptyList()
        return root.walkTopDown()
            .filter { isAudioFile(it) }
            .toList()
    }

    /** Read one file's tags; falls back to the file name as the title. */
    fun readTrack(file: File, now: Long): Track {
        val path = file.canonicalPath
        var title = ""
        var artist = ""
        var album = ""
        var durationMs = 0L
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(path)
            title = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE)?.trim().orEmpty()
            artist = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST)?.trim().orEmpty()
            album = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM)?.trim().orEmpty()
            durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                ?.toLongOrNull() ?: 0L
        } catch (t: Throwable) {
            // Unreadable tags: the file still belongs in the library.
        } finally {
            try { retriever.release() } catch (t: Throwable) { /* ignore */ }
        }
        if (title.isBlank()) title = file.nameWithoutExtension
        return Track(
            id = trackIdForPath(path),
            path = path,
            title = title,
            artist = artist,
            album = album,
            durationMs = durationMs,
            fileSizeBytes = file.length(),
            addedAt = now,
        )
    }
}
