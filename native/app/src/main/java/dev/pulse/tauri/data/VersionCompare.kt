package dev.pulse.tauri.data

/** Semver-ish comparison for the update hint ("0.3.0" vs "1.0.0"). */
object VersionCompare {
    fun compare(a: String, b: String): Int {
        val pa = a.trim().removePrefix("v").split(".", "-").map { it.toIntOrNull() ?: 0 }
        val pb = b.trim().removePrefix("v").split(".", "-").map { it.toIntOrNull() ?: 0 }
        val n = maxOf(pa.size, pb.size)
        for (i in 0 until n) {
            val x = pa.getOrElse(i) { 0 }
            val y = pb.getOrElse(i) { 0 }
            if (x != y) return x.compareTo(y)
        }
        return 0
    }
}
