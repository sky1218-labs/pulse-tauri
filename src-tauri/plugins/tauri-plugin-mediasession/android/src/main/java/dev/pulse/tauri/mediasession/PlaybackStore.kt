package dev.pulse.tauri.mediasession

import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import app.tauri.plugin.JSObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** One queue entry as sent by JS (uri is the raw file path / URL). */
data class QueueItemData(
    val id: String,
    val uri: String,
    val title: String,
    val artist: String,
    val album: String,
    val durationMs: Long,
)

/** A setQueue request, held when it arrives before the service exists. */
data class PendingQueue(
    val items: List<QueueItemData>,
    val startIndex: Int,
    val startPositionMs: Long,
    val autoplay: Boolean,
    val preserve: Boolean,
)

fun List<QueueItemData>.toMediaItems(): List<MediaItem> = map { item ->
    val uri = if (item.uri.contains("://")) item.uri else "file://${item.uri}"
    MediaItem.Builder()
        .setMediaId(item.id)
        .setUri(uri)
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(item.title)
                .setArtist(item.artist)
                .setAlbumTitle(item.album)
                .build()
        )
        .build()
}

/**
 * Bridge registry between the Tauri plugin commands (driven by JS) and
 * [PulsePlaybackService] (which owns the real ExoPlayer). Plain
 * process-local state: both sides live in the app process.
 *
 * Since 0.1.11 the player is native: JS is a controller that sends queue /
 * transport commands, and the service pushes state snapshots back through
 * [eventSink]. The WebView no longer plays audio on Android.
 */
object PlaybackStore {

    private const val TAG = "PulsePlaybackStore"

    /** The service's ExoPlayer; null while the service is not running. */
    @Volatile
    var player: ExoPlayer? = null

    /** Set by the plugin at load; receives player event snapshots for JS. */
    @Volatile
    var eventSink: ((JSObject) -> Unit)? = null

    /** Builds a current-state snapshot JSObject; registered by the service. */
    @Volatile
    var snapshotProvider: (() -> JSObject)? = null

    /** A setQueue that arrived before the service existed; applied in onCreate. */
    @Volatile
    var pendingQueue: PendingQueue? = null

    /** Sleep-timer "stop at track end" mode: repeat is off and the queue may be collapsed. */
    @Volatile
    var stopAtTrackEnd: Boolean = false

    /** True while the player's list is collapsed to the current item only. */
    @Volatile
    var collapsed: Boolean = false

    private val mainHandler = Handler(Looper.getMainLooper())

    /** Run [block] with the player on the main looper (ExoPlayer's thread). Never throws. */
    fun withPlayer(block: (ExoPlayer) -> Unit) {
        val p = player ?: return
        // Annotated () -> Unit: without it the try/catch lambda infers
        // Function0<Int> from Log.e's return value and post() rejects it.
        val run: () -> Unit = {
            try {
                block(p)
            } catch (t: Throwable) {
                Log.e(TAG, "player op failed", t)
            }
        }
        if (Looper.myLooper() == Looper.getMainLooper()) run() else mainHandler.post(run)
    }

    /** Current state for the get_state command; safe to call from any thread. */
    fun stateSnapshot(): JSObject {
        val provider = snapshotProvider ?: return defaultState()
        if (Looper.myLooper() == Looper.getMainLooper()) {
            return try {
                provider()
            } catch (t: Throwable) {
                defaultState()
            }
        }
        val latch = CountDownLatch(1)
        var result: JSObject? = null
        mainHandler.post {
            result = try {
                provider()
            } catch (t: Throwable) {
                null
            }
            latch.countDown()
        }
        return try {
            latch.await(2, TimeUnit.SECONDS)
            result ?: defaultState()
        } catch (t: Throwable) {
            defaultState()
        }
    }

    fun defaultState(): JSObject {
        val obj = JSObject()
        obj.put("playing", false)
        obj.put("positionMs", 0L)
        obj.put("durationMs", 0L)
        obj.put("currentId", "")
        obj.put("ended", false)
        return obj
    }

    fun emitEvent(obj: JSObject) {
        try {
            eventSink?.invoke(obj)
        } catch (t: Throwable) {
            Log.e(TAG, "event sink failed", t)
        }
    }

    /**
     * Apply a setQueue to the player. Non-preserve replaces the list and
     * seeks to (startIndex, startPositionMs); preserve keeps the currently
     * playing item (by mediaId), its position and playWhenReady. Afterwards
     * the repeat/collapse state for [stopAtTrackEnd] is re-applied.
     */
    fun applySetQueue(player: ExoPlayer, queue: PendingQueue) {
        val items = queue.items.toMediaItems()
        if (items.isEmpty()) {
            player.stop()
            player.clearMediaItems()
            collapsed = false
            return
        }
        if (queue.preserve) {
            // While collapsed, the single-item list must stay untouched —
            // the restore path (setStopAtTrackEnd off) re-syncs the queue.
            if (collapsed) return
            val curId = player.currentMediaItem?.mediaId
            val curPos = player.currentPosition
            val curPlayWhenReady = player.playWhenReady
            val newIndex = if (curId != null) items.indexOfFirst { it.mediaId == curId } else -1
            player.setMediaItems(items)
            if (newIndex >= 0) {
                player.seekTo(newIndex, curPos)
                player.playWhenReady = curPlayWhenReady
            }
            player.prepare()
        } else {
            val index = queue.startIndex.coerceIn(0, items.size - 1)
            player.setMediaItems(items, index, queue.startPositionMs)
            player.prepare()
            player.playWhenReady = queue.autoplay
        }
        applyRepeatAndCollapse(player)
    }

    /** Enforce repeat mode + single-item collapse for the stopAtTrackEnd flag. */
    fun applyRepeatAndCollapse(player: ExoPlayer) {
        if (stopAtTrackEnd) {
            player.repeatMode = Player.REPEAT_MODE_OFF
            if (player.mediaItemCount > 1) {
                val item = player.currentMediaItem ?: return
                val pos = player.currentPosition
                val playWhenReady = player.playWhenReady
                player.setMediaItems(listOf(item), 0, pos)
                player.prepare()
                player.playWhenReady = playWhenReady
                collapsed = true
            }
        } else {
            player.repeatMode = Player.REPEAT_MODE_ALL
            collapsed = false
        }
    }

    /**
     * The setStopAtTrackEnd command. Enabling collapses the queue around
     * the current item (repeat off). Disabling restores repeat-all and, if
     * the queue was collapsed, asks JS to re-sync the full queue by
     * emitting a needs-queue-restore event.
     */
    fun setStopAtTrackEndEnabled(enabled: Boolean) {
        stopAtTrackEnd = enabled
        withPlayer { p ->
            if (enabled) {
                applyRepeatAndCollapse(p)
            } else {
                val wasCollapsed = collapsed
                p.repeatMode = Player.REPEAT_MODE_ALL
                collapsed = false
                if (wasCollapsed) {
                    val obj = stateSnapshot()
                    obj.put("type", "needs-queue-restore")
                    emitEvent(obj)
                }
            }
        }
    }
}
