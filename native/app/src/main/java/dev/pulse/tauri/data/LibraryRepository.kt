package dev.pulse.tauri.data

import java.io.File
import kotlinx.serialization.json.Json

/**
 * The whole library is one JSON document (same shape philosophy as the
 * Tauri build's localStorage document): simple, inspectable, and the
 * writes are debounced by the ViewModel. Writes go to a temp file and
 * are renamed over the target so a crash mid-write cannot corrupt it.
 */
class LibraryRepository(private val dir: File) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val file = File(dir, "library.json")

    fun load(): LibraryData {
        return try {
            if (!file.exists()) return LibraryData()
            json.decodeFromString(LibraryData.serializer(), file.readText())
        } catch (t: Throwable) {
            LibraryData()
        }
    }

    fun save(data: LibraryData) {
        try {
            dir.mkdirs()
            val tmp = File(dir, "library.json.tmp")
            tmp.writeText(json.encodeToString(LibraryData.serializer(), data))
            if (!tmp.renameTo(file)) {
                file.writeText(tmp.readText())
                tmp.delete()
            }
        } catch (t: Throwable) {
            // Persistence must never crash playback; the next save retries.
        }
    }
}
