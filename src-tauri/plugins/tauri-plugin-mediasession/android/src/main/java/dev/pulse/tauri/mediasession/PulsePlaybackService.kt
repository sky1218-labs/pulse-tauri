package dev.pulse.tauri.mediasession

import android.content.Intent
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import app.tauri.plugin.JSObject

/**
 * The real player, hosted the way production Android music apps do it
 * (Auxio, Gramophone, React Native Track Player): an ExoPlayer inside a
 * Media3 [MediaSessionService]. Media3 builds the media notification from
 * the player's state and delivers its buttons (and lock-screen /
 * Bluetooth commands) straight to the player — they act on actual
 * playback, not on a mirror. The WebView UI is just a controller: it
 * sends queue/transport commands through the plugin and renders the
 * state snapshots this service pushes back.
 *
 * Repeat is REPEAT_MODE_ALL, mirroring the app's wrap-around queue
 * semantics (next/previous wrap; track end auto-advances with wrap).
 * The sleep timer's stop-at-track-end mode temporarily collapses the
 * list to the current item with repeat off (see PlaybackStore).
 */
@OptIn(UnstableApi::class)
class PulsePlaybackService : MediaSessionService() {

    private var exoPlayer: ExoPlayer? = null
    private var mediaSession: MediaSession? = null
    private var lastMediaId: String? = null

    private val playbackListener = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            val previousId = lastMediaId
            lastMediaId = mediaItem?.mediaId
            emitEvent(previousId = previousId)
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            emitEvent()
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            emitEvent()
        }

        override fun onPlayerError(error: PlaybackException) {
            emitEvent(error = error.message ?: error.errorCodeName)
        }
    }

    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus = */ true
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .build()
        player.repeatMode = Player.REPEAT_MODE_ALL
        player.addListener(playbackListener)
        exoPlayer = player
        PlaybackStore.player = player
        PlaybackStore.snapshotProvider = { snapshot() }
        lastMediaId = player.currentMediaItem?.mediaId

        val session = MediaSession.Builder(this, player).build()
        mediaSession = session
        addSession(session)

        // A setQueue that arrived before the service existed is applied now.
        PlaybackStore.pendingQueue?.let { pending ->
            PlaybackStore.pendingQueue = null
            PlaybackStore.applySetQueue(player, pending)
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? =
        mediaSession

    override fun onTaskRemoved(rootIntent: Intent?) {
        val p = exoPlayer
        if (p == null || !p.playWhenReady || p.mediaItemCount == 0 ||
            p.playbackState == Player.STATE_ENDED
        ) {
            stopSelf()
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        if (PlaybackStore.player === exoPlayer) {
            PlaybackStore.player = null
        }
        PlaybackStore.snapshotProvider = null
        PlaybackStore.pendingQueue = null
        PlaybackStore.collapsed = false
        mediaSession?.let { session ->
            session.player.release()
            session.release()
        }
        mediaSession = null
        exoPlayer = null
        super.onDestroy()
    }

    /** Current player state as a JSObject (also the get_state response shape). */
    private fun snapshot(): JSObject {
        val p = exoPlayer ?: return PlaybackStore.defaultState()
        val obj = JSObject()
        obj.put("playing", p.isPlaying)
        obj.put("positionMs", p.currentPosition.coerceAtLeast(0L))
        val duration = p.duration
        obj.put("durationMs", if (duration == C.TIME_UNSET) 0L else duration.coerceAtLeast(0L))
        obj.put("currentId", p.currentMediaItem?.mediaId ?: "")
        obj.put("ended", p.playbackState == Player.STATE_ENDED)
        return obj
    }

    private fun emitEvent(previousId: String? = null, error: String? = null) {
        val obj = snapshot()
        obj.put("type", "event")
        if (previousId != null) obj.put("previousId", previousId)
        if (error != null) obj.put("error", error)
        PlaybackStore.emitEvent(obj)
    }
}
