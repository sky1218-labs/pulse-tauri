package dev.pulse.tauri.data

/**
 * Sort orders for the playlist LIST (the tracks inside a playlist use
 * [SortTracks]). Keys: recent (last updated), name, created, count.
 */
object PlaylistSort {

    val KEYS = listOf("recent", "name", "created", "count")

    fun defaultDir(key: String): String = if (key == "name") "asc" else "desc"

    fun sort(playlists: List<Playlist>, key: String, dir: String): List<Playlist> {
        val primary: Comparator<Playlist> = when (key) {
            "name" -> Comparator { x, y -> SortTracks.naturalCompare(x.name, y.name) }
            "created" -> Comparator { x, y ->
                val c = x.createdAt.compareTo(y.createdAt)
                if (c != 0) c else SortTracks.naturalCompare(x.name, y.name)
            }
            "count" -> Comparator { x, y ->
                val c = x.trackIds.size.compareTo(y.trackIds.size)
                if (c != 0) c else SortTracks.naturalCompare(x.name, y.name)
            }
            else -> Comparator { x, y ->
                val c = x.updatedAt.compareTo(y.updatedAt)
                if (c != 0) c else SortTracks.naturalCompare(x.name, y.name)
            }
        }
        val sorted = playlists.sortedWith(primary)
        return if (dir == "desc") sorted.reversed() else sorted
    }
}
