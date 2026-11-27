package dev.pulse.tauri.mediasession

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
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

    /** User's repeat preference ("off" | "all" | "one"); stopAtTrackEnd overrides it. */
    var repeatModePref: String = "all"

    /** User's shuffle preference; applied to the player alongside the queue. */
    var shufflePref: Boolean = false

    /** True while the player's list is collapsed to the current item only. */
    @Volatile
    var collapsed: Boolean = false

    /* ------------------------- sleep timer (timed) -------------------------
     * The timed sleep deadline is enforced HERE, in the playback process,
     * never in the WebView: Android freezes WebView JS timers when the app
     * is backgrounded / the screen is off — exactly when a sleep timer
     * matters — while this service keeps playing. The deadline is also
     * persisted (SharedPreferences) so a process restart re-arms it.
     * Wall-clock deadline, monotonic scheduling: the Handler runs on
     * SystemClock.uptimeMillis, so each runnable re-checks the wall clock
     * and re-schedules if the clock moved. */

    private const val PREFS_NAME = "pulse_playback"
    private const val KEY_SLEEP_DEADLINE = "sleep_deadline_ms"
    private const val KEY_SLEEP_FADE = "sleep_fade_seconds"

    const val SLEEP_TIMER_ACTION = "dev.pulse.tauri.mediasession.SLEEP_TIMER_FIRE"
    private const val SLEEP_ALARM_REQUEST = 7331

    @Volatile
    private var appContext: Context? = null

    /** Armed deadline (epoch ms); 0 = no timed sleep timer. */
    @Volatile
    var sleepDeadlineMs: Long = 0L
        private set

    @Volatile
    private var sleepFadeSeconds: Int = 0

    /** Volume captured when the fade started; restored after the pause. */
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

    /** The user set a new volume; if a fade is running it follows the new base. */
    fun onUserSetVolume(volume: Float) {
        if (sleepFadeBaseVolume != null) sleepFadeBaseVolume = volume
    }

    private fun cancelSleepRunnables() {
        sleepFireRunnable?.let { mainHandler.removeCallbacks(it) }
        sleepFadeRunnable?.let { mainHandler.removeCallbacks(it) }
        sleepFireRunnable = null
        sleepFadeRunnable = null
    }

    /**
     * Keep the AlarmManager backup in sync with the armed deadline. The
     * Handler schedule is precise while the service lives (it holds a
     * wake lock while playing), but if the process is throttled or killed
     * the alarm is what guarantees the deadline is re-checked at all.
     * Exact-and-allow-while-idle where the platform permits it, otherwise
     * the inexact allow-while-idle variant (no SCHEDULE_EXACT_ALARM
     * prompt — a sleep timer must never nag for a permission).
     */
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
            // The alarm can be what woke a fresh process: the in-memory
            // deadline is then still empty, so fall back to the persisted
            // one before deciding anything.
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
                // Clock moved; rebuild both schedules for the real remainder.
                scheduleSleepTimer()
            }
        }
    }

    /** (Re)build the Handler schedule for the current deadline. Main thread. */
    private fun scheduleSleepTimer() {
        updateSleepAlarm()
        cancelSleepRunnables()
        // Re-arming or cancelling ends any in-progress fade: restore volume.
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
            // Wall clock moved backwards; re-schedule for the real remainder.
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

    /** Deadline reached: pause, restore the pre-fade volume, disarm. Main thread. */
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
    }

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
            player.repeatMode = repeatModeConstant()
            collapsed = false
        }
        player.shuffleModeEnabled = shufflePref
    }

    private fun repeatModeConstant(): Int = when (repeatModePref) {
        "off" -> Player.REPEAT_MODE_OFF
        "one" -> Player.REPEAT_MODE_ONE
        else -> Player.REPEAT_MODE_ALL
    }

    /** The setRepeatMode command: remember the preference and apply it now
     *  (unless the sleep timer's stop-at-track-end override is active). */
    fun updateRepeatModePref(mode: String) {
        repeatModePref = mode
        withPlayer { p ->
            if (!stopAtTrackEnd) p.repeatMode = repeatModeConstant()
        }
    }

    /** The setShuffle command. */
    fun updateShufflePref(enabled: Boolean) {
        shufflePref = enabled
        withPlayer { p -> p.shuffleModeEnabled = enabled }
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
                p.repeatMode = repeatModeConstant()
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
