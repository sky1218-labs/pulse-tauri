package dev.pulse.tauri.data

/**
 * Library sort orders, ported from the Tauri build's sortTracks:
 * title / artist / album / date added / duration / file name, with a
 * natural comparison ("Track 2" before "Track 10") and artist/album/
 * title tie-breakers so equal keys stay meaningful.
 */
object SortTracks {

    val KEYS = listOf("title", "artist", "album", "dateAdded", "duration", "fileName")

    fun defaultDir(key: String): String = if (key == "dateAdded") "desc" else "asc"

    /** Natural string comparison: digit runs compare numerically. */
    fun naturalCompare(a: String, b: String): Int {
        var i = 0
        var j = 0
        while (i < a.length && j < b.length) {
            val ca = a[i]
            val cb = b[j]
            if (ca.isDigit() && cb.isDigit()) {
                var ei = i
                while (ei < a.length && a[ei].isDigit()) ei++
                var ej = j
                while (ej < b.length && b[ej].isDigit()) ej++
                val na = a.substring(i, ei).trimStart('0')
                val nb = b.substring(j, ej).trimStart('0')
                if (na.length != nb.length) return na.length - nb.length
                val byDigits = na.compareTo(nb)
                if (byDigits != 0) return byDigits
                i = ei
                j = ej
            } else {
                val byChar = ca.lowercaseChar().compareTo(cb.lowercaseChar())
                if (byChar != 0) return byChar
                i++
                j++
            }
        }
        return (a.length - i) - (b.length - j)
    }

    private fun baseName(path: String): String = path.substringAfterLast('/').substringAfterLast('\\')

    fun sort(tracks: List<Track>, key: String, dir: String): List<Track> {
        val byTitle = Comparator<Track> { x, y ->
            val c = naturalCompare(x.title, y.title)
            if (c != 0) c else naturalCompare(x.artist, y.artist)
        }
        val primary: Comparator<Track> = when (key) {
            "artist" -> Comparator { x, y ->
                val c = naturalCompare(x.artist, y.artist)
                if (c != 0) c else {
                    val a = naturalCompare(x.album, y.album)
                    if (a != 0) a else byTitle.compare(x, y)
                }
            }
            "album" -> Comparator { x, y ->
                val c = naturalCompare(x.album, y.album)
                if (c != 0) c else byTitle.compare(x, y)
            }
            "dateAdded" -> Comparator { x, y ->
                val c = x.addedAt.compareTo(y.addedAt)
                if (c != 0) c else byTitle.compare(x, y)
            }
            "duration" -> Comparator { x, y ->
                val c = x.durationMs.compareTo(y.durationMs)
                if (c != 0) c else byTitle.compare(x, y)
            }
            "fileName" -> Comparator { x, y ->
                val c = naturalCompare(baseName(x.path), baseName(y.path))
                if (c != 0) c else byTitle.compare(x, y)
            }
            else -> byTitle
        }
        val sorted = tracks.sortedWith(primary)
        return if (dir == "desc") sorted.reversed() else sorted
    }
}
