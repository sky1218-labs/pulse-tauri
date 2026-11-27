package dev.pulse.tauri.playback

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** One queue entry (uri is the raw file path / URL). */
data class QueueItemData(
    val id: String,
    val uri: String,
    val title: String,
    val artist: String,
    val album: String,
    val durationMs: Long,
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

/** A point-in-time view of the player, read by the UI. */
data class PlaybackSnapshot(
    val playing: Boolean = false,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val currentId: String = "",
    val ended: Boolean = false,
    val volume: Float = 1f,
)

/**
 * Process-local owner of playback state: the queue, the repeat/shuffle
 * preferences, and the sleep timer. [PulsePlaybackService] owns the real
 * ExoPlayer and registers it here; the UI (same process) calls this
 * object directly — in the native app there is no bridge to cross.
 *
 * The timed sleep deadline is enforced HERE, never on a UI timer:
 * Android can freeze or kill the UI while this service keeps playing.
 * The deadline is persisted (SharedPreferences) and backed by an
 * AlarmManager alarm, so a process restart re-arms it.
 */
object PlaybackStore {

    private const val TAG = "PulsePlaybackStore"

    @Volatile
    var player: ExoPlayer? = null

    /** The full logical queue; the player's list may be a collapsed view of it. */
    @Volatile
    var fullQueue: List<QueueItemData> = emptyList()
        private set

    /** A setQueue that arrived before the service existed; applied in onCreate. */
    @Volatile
    var pendingQueue: PendingQueue? = null

    data class PendingQueue(
        val items: List<QueueItemData>,
        val startIndex: Int,
        val startPositionMs: Long,
        val autoplay: Boolean,
    )

    @Volatile
    var stopAtTrackEnd: Boolean = false

    var repeatModePref: String = "all"
    var shufflePref: Boolean = false

    @Volatile
    var collapsed: Boolean = false

    /** Notified (on the main thread) whenever the player reports a change. */
    @Volatile
    var onStateChanged: (() -> Unit)? = null

    fun notifyChanged() {
        val cb = onStateChanged ?: return
        if (Looper.myLooper() == Looper.getMainLooper()) cb() else mainHandler.post(cb)
    }

    /* ------------------------------ transport ------------------------------ */

    fun setQueue(items: List<QueueItemData>, startIndex: Int, startPositionMs: Long, autoplay: Boolean) {
        fullQueue = items
        val p = player
        if (p == null) {
            pendingQueue = PendingQueue(items, startIndex, startPositionMs, autoplay)
            return
        }
        withPlayer { applyQueueInternal(it, items, startIndex, startPositionMs, autoplay, preserve = false) }
    }

    /** Replace the queue but keep the current item, position and play state. */
    fun syncQueue(items: List<QueueItemData>) {
        fullQueue = items
        if (collapsed) return // the restore path re-applies the full queue
        withPlayer { p ->
            val curId = p.currentMediaItem?.mediaId
            val curPos = p.currentPosition
            val curPlayWhenReady = p.playWhenReady
            val mediaItems = items.toMediaItems()
            p.setMediaItems(mediaItems)
            val newIndex = if (curId != null) mediaItems.indexOfFirst { it.mediaId == curId } else -1
            if (newIndex >= 0) {
                p.seekTo(newIndex, curPos)
                p.playWhenReady = curPlayWhenReady
            }
            p.prepare()
            applyRepeatAndShuffle(p)
        }
    }

    fun seekToIndex(index: Int, positionMs: Long, autoplay: Boolean) {
        withPlayer { p ->
            if (index in 0 until p.mediaItemCount) {
                p.seekTo(index, positionMs)
                p.prepare()
                p.playWhenReady = autoplay
            }
        }
    }

    fun play() = withPlayer { it.play() }
    fun pause() = withPlayer { it.pause() }
    fun next() = withPlayer { it.seekToNext() }
    fun previous() = withPlayer { it.seekToPrevious() }
    fun seekTo(positionMs: Long) = withPlayer { it.seekTo(positionMs.coerceAtLeast(0L)) }
    fun seekBy(deltaMs: Long) = withPlayer { it.seekTo((it.currentPosition + deltaMs).coerceAtLeast(0L)) }

    fun setVolume(volume: Float) {
        onUserSetVolume(volume)
        withPlayer { it.volume = volume.coerceIn(0f, 1f) }
    }

    fun setSpeed(speed: Float) = withPlayer { it.setPlaybackSpeed(speed) }

    fun stopPlayback() {
        setSleepTimer(0L, 0)
        fullQueue = emptyList()
        withPlayer { p ->
            p.stop()
            p.clearMediaItems()
        }
        collapsed = false
    }

    fun applyPendingQueue(p: ExoPlayer) {
        val pending = pendingQueue ?: return
        pendingQueue = null
        applyQueueInternal(p, pending.items, pending.startIndex, pending.startPositionMs, pending.autoplay, preserve = false)
    }

    private fun applyQueueInternal(
        p: ExoPlayer,
        items: List<QueueItemData>,
        startIndex: Int,
        startPositionMs: Long,
        autoplay: Boolean,
        preserve: Boolean,
    ) {
        val mediaItems = items.toMediaItems()
        if (mediaItems.isEmpty()) {
            p.stop()
            p.clearMediaItems()
            collapsed = false
            return
        }
        if (preserve) {
            if (collapsed) return
            val curId = p.currentMediaItem?.mediaId
            val curPos = p.currentPosition
            val curPlayWhenReady = p.playWhenReady
            val newIndex = if (curId != null) mediaItems.indexOfFirst { it.mediaId == curId } else -1
            p.setMediaItems(mediaItems)
            if (newIndex >= 0) {
                p.seekTo(newIndex, curPos)
                p.playWhenReady = curPlayWhenReady
            }
            p.prepare()
        } else {
            val index = startIndex.coerceIn(0, mediaItems.size - 1)
            p.setMediaItems(mediaItems, index, startPositionMs)
            p.prepare()
            p.playWhenReady = autoplay
        }
        applyRepeatAndShuffle(p)
    }

    /** Enforce repeat mode + single-item collapse for the stopAtTrackEnd flag. */
    fun applyRepeatAndShuffle(p: ExoPlayer) {
        if (stopAtTrackEnd) {
            p.repeatMode = Player.REPEAT_MODE_OFF
            if (p.mediaItemCount > 1) {
                val item = p.currentMediaItem ?: return
                val pos = p.currentPosition
                val playWhenReady = p.playWhenReady
                p.setMediaItems(listOf(item), 0, pos)
                p.prepare()
                p.playWhenReady = playWhenReady
                collapsed = true
            }
        } else {
            p.repeatMode = repeatModeConstant()
            collapsed = false
        }
        p.shuffleModeEnabled = shufflePref
    }

    private fun repeatModeConstant(): Int = when (repeatModePref) {
        "off" -> Player.REPEAT_MODE_OFF
        "one" -> Player.REPEAT_MODE_ONE
        else -> Player.REPEAT_MODE_ALL
    }

    fun updateRepeatModePref(mode: String) {
        repeatModePref = mode
        withPlayer { p -> if (!stopAtTrackEnd) p.repeatMode = repeatModeConstant() }
    }

    fun updateShufflePref(enabled: Boolean) {
        shufflePref = enabled
        withPlayer { p -> p.shuffleModeEnabled = enabled }
    }

    /**
     * Sleep timer's end-of-track mode. Enabling collapses the queue around
     * the current item (repeat off). Disabling restores the repeat
     * preference and re-applies the full queue, preserving playback.
     */
    fun setStopAtTrackEndEnabled(enabled: Boolean) {
        stopAtTrackEnd = enabled
        withPlayer { p ->
            if (enabled) {
                applyRepeatAndShuffle(p)
            } else {
                val wasCollapsed = collapsed
                p.repeatMode = repeatModeConstant()
                collapsed = false
                if (wasCollapsed && fullQueue.isNotEmpty()) {
                    applyQueueInternal(p, fullQueue, 0, 0L, autoplay = false, preserve = true)
                }
            }
        }
    }

    /* ------------------------------ snapshots ------------------------------ */

    fun snapshot(): PlaybackSnapshot {
        val p = player ?: return PlaybackSnapshot()
        if (Looper.myLooper() == Looper.getMainLooper()) return readSnapshot(p)
        val latch = CountDownLatch(1)
        var result: PlaybackSnapshot? = null
        mainHandler.post {
            result = try { readSnapshot(p) } catch (t: Throwable) { null }
            latch.countDown()
        }
        return try {
            latch.await(2, TimeUnit.SECONDS)
            result ?: PlaybackSnapshot()
        } catch (t: Throwable) {
            PlaybackSnapshot()
        }
    }

    private fun readSnapshot(p: ExoPlayer): PlaybackSnapshot {
        val duration = p.duration
        return PlaybackSnapshot(
            playing = p.isPlaying,
            positionMs = p.currentPosition.coerceAtLeast(0L),
            durationMs = if (duration == C.TIME_UNSET) 0L else duration.coerceAtLeast(0L),
            currentId = p.currentMediaItem?.mediaId ?: "",
            ended = p.playbackState == Player.STATE_ENDED,
            volume = p.volume,
        )
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    /** Run [block] with the player on the main looper (ExoPlayer's thread). Never throws. */
    fun withPlayer(block: (ExoPlayer) -> Unit) {
        val p = player ?: return
        val run: () -> Unit = {
            try {
                block(p)
            } catch (t: Throwable) {
                Log.e(TAG, "player op failed", t)
            }
        }
        if (Looper.myLooper() == Looper.getMainLooper()) run() else mainHandler.post(run)
    }

    /* ------------------------- sleep timer (timed) -------------------------
     * Enforced here, in the playback process: the deadline is persisted
     * (SharedPreferences) and backed by an AlarmManager alarm, so it
     * fires even if the UI process is frozen or killed. Wall-clock
     * deadline, monotonic scheduling: the Handler runs on uptime, so
     * each runnable re-checks the wall clock and re-schedules if it
     * moved. */

    private const val PREFS_NAME = "pulse_playback"
    private const val KEY_SLEEP_DEADLINE = "sleep_deadline_ms"
    private const val KEY_SLEEP_FADE = "sleep_fade_seconds"

    const val SLEEP_TIMER_ACTION = "dev.pulse.tauri.mediasession.SLEEP_TIMER_FIRE"
    private const val SLEEP_ALARM_REQUEST = 7331

    @Volatile
    private var appContext: Context? = null

    @Volatile
    var sleepDeadlineMs: Long = 0L
        private set

    @Volatile
    private var sleepFadeSeconds: Int = 0

    private var sleepFadeBaseVolume: Float? = null
    private var sleepFireRunnable: Runnable? = null
    private var sleepFadeRunnable: Runnable? = null

    fun setAppContext(context: Context) {
        appContext = context.applicationContext
    }

    private fun persistSleepTimer() {
        try {
            val ctx = appContext ?: return
            val edit = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            if (sleepDeadlineMs > 0L) {
                edit.putLong(KEY_SLEEP_DEADLINE, sleepDeadlineMs)
                edit.putInt(KEY_SLEEP_FADE, sleepFadeSeconds)
            } else {
                edit.remove(KEY_SLEEP_DEADLINE)
                edit.remove(KEY_SLEEP_FADE)
            }
            edit.apply()
        } catch (t: Throwable) {
            Log.e(TAG, "persist sleep timer failed", t)
        }
    }

    /** Arm (deadlineMs > 0) or cancel (deadlineMs <= 0) the timed sleep timer. */
    fun setSleepTimer(deadlineMs: Long, fadeOutSeconds: Int) {
        sleepDeadlineMs = if (deadlineMs > 0L) deadlineMs else 0L
        sleepFadeSeconds = fadeOutSeconds.coerceAtLeast(0)
        persistSleepTimer()
        mainHandler.post { scheduleSleepTimer() }
    }

    /**
     * Called by the service onCreate: re-arm a persisted deadline after a
     * process restart. A deadline already in the past is dropped, never
     * fired — playback from before the restart is gone, and pausing a
     * future session would be a bug.
     */
    fun restoreSleepTimer(context: Context) {
        setAppContext(context)
        try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val deadline = prefs.getLong(KEY_SLEEP_DEADLINE, 0L)
            if (deadline > System.currentTimeMillis()) {
                sleepDeadlineMs = deadline
                sleepFadeSeconds = prefs.getInt(KEY_SLEEP_FADE, 0)
                mainHandler.post { scheduleSleepTimer() }
            } else if (deadline > 0L) {
                sleepDeadlineMs = 0L
                persistSleepTimer()
                updateSleepAlarmAfterClear()
            }
        } catch (t: Throwable) {
            Log.e(TAG, "restore sleep timer failed", t)
        }
    }

    fun onUserSetVolume(volume: Float) {
        if (sleepFadeBaseVolume != null) sleepFadeBaseVolume = volume
    }

    private fun cancelSleepRunnables() {
        sleepFireRunnable?.let { mainHandler.removeCallbacks(it) }
        sleepFadeRunnable?.let { mainHandler.removeCallbacks(it) }
        sleepFireRunnable = null
        sleepFadeRunnable = null
    }

    private fun updateSleepAlarm() {
        try {
            val ctx = appContext ?: return
            val alarm = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val intent = Intent(ctx, SleepTimerAlarmReceiver::class.java).setAction(SLEEP_TIMER_ACTION)
            val pending = PendingIntent.getBroadcast(
                ctx, SLEEP_ALARM_REQUEST, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val deadline = sleepDeadlineMs
            if (deadline <= 0L) {
                alarm.cancel(pending)
                return
            }
            val exactAllowed = Build.VERSION.SDK_INT < 31 || alarm.canScheduleExactAlarms()
            if (Build.VERSION.SDK_INT >= 23 && exactAllowed) {
                alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, deadline, pending)
            } else if (Build.VERSION.SDK_INT >= 23) {
                alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, deadline, pending)
            } else {
                alarm.setExact(AlarmManager.RTC_WAKEUP, deadline, pending)
            }
        } catch (t: Throwable) {
            Log.e(TAG, "update sleep alarm failed", t)
        }
    }

    private fun updateSleepAlarmAfterClear() {
        try {
            val ctx = appContext ?: return
            val alarm = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val intent = Intent(ctx, SleepTimerAlarmReceiver::class.java).setAction(SLEEP_TIMER_ACTION)
            val pending = PendingIntent.getBroadcast(
                ctx, SLEEP_ALARM_REQUEST, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            alarm.cancel(pending)
        } catch (t: Throwable) {
            Log.e(TAG, "cancel sleep alarm failed", t)
        }
    }

    /** Alarm fired: pause if the deadline has (really) been reached. */
    fun onSleepAlarmFired(context: Context) {
        setAppContext(context)
        mainHandler.post {
            if (sleepDeadlineMs <= 0L) {
                try {
                    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    val persisted = prefs.getLong(KEY_SLEEP_DEADLINE, 0L)
                    if (persisted > 0L) {
                        sleepDeadlineMs = persisted
                        sleepFadeSeconds = prefs.getInt(KEY_SLEEP_FADE, 0)
                    }
                } catch (t: Throwable) {
                    Log.e(TAG, "alarm fired: read persisted deadline failed", t)
                }
            }
            val deadline = sleepDeadlineMs
            if (deadline <= 0L) return@post
            if (System.currentTimeMillis() >= deadline - 500L) {
                fireSleepTimer()
            } else {
                scheduleSleepTimer()
            }
        }
    }

    private fun scheduleSleepTimer() {
        updateSleepAlarm()
        cancelSleepRunnables()
        sleepFadeBaseVolume?.let { base ->
            sleepFadeBaseVolume = null
            withPlayer { it.volume = base }
        }
        val deadline = sleepDeadlineMs
        if (deadline <= 0L) return
        val remaining = deadline - System.currentTimeMillis()
        if (remaining <= 0L) {
            fireSleepTimer()
            return
        }
        val fire = Runnable { onSleepFireTick() }
        sleepFireRunnable = fire
        mainHandler.postDelayed(fire, remaining)
        val fadeMs = sleepFadeSeconds * 1000L
        if (fadeMs > 0L) {
            val fade = Runnable { onSleepFadeTick() }
            sleepFadeRunnable = fade
            mainHandler.postDelayed(fade, (remaining - fadeMs).coerceAtLeast(0L))
        }
    }

    private fun onSleepFireTick() {
        val remaining = sleepDeadlineMs - System.currentTimeMillis()
        if (sleepDeadlineMs <= 0L) return
        if (remaining > 0L) {
            val fire = Runnable { onSleepFireTick() }
            sleepFireRunnable = fire
            mainHandler.postDelayed(fire, remaining)
            return
        }
        fireSleepTimer()
    }

    private fun onSleepFadeTick() {
        val deadline = sleepDeadlineMs
        if (deadline <= 0L) return
        val fadeMs = sleepFadeSeconds * 1000L
        val remaining = deadline - System.currentTimeMillis()
        if (remaining <= 0L || fadeMs <= 0L) return
        val progress = (1.0 - remaining.toDouble() / fadeMs.toDouble()).coerceIn(0.0, 1.0)
        withPlayer { p ->
            if (sleepFadeBaseVolume == null) sleepFadeBaseVolume = p.volume
            val base = sleepFadeBaseVolume ?: p.volume
            p.volume = (base * (1.0 - progress)).toFloat().coerceIn(0f, 1f)
        }
        val fade = Runnable { onSleepFadeTick() }
        sleepFadeRunnable = fade
        mainHandler.postDelayed(fade, 250L)
    }

    private fun fireSleepTimer() {
        updateSleepAlarmAfterClear()
        cancelSleepRunnables()
        val base = sleepFadeBaseVolume
        sleepFadeBaseVolume = null
        sleepDeadlineMs = 0L
        persistSleepTimer()
        withPlayer { p ->
            p.pause()
            if (base != null) p.volume = base
        }
        notifyChanged()
    }
}
