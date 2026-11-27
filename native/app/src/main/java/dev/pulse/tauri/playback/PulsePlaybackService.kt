package dev.pulse.tauri.playback

import android.content.Intent
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * The real player, hosted the way production Android music apps do it:
 * an ExoPlayer inside a Media3 [MediaSessionService]. Media3 builds the
 * media notification from the player's state and delivers its buttons
 * (and lock-screen / Bluetooth commands) straight to the player.
 *
 * Repeat/shuffle preferences and the sleep timer live in
 * [PlaybackStore]; this service only owns the player instance.
 */
@OptIn(UnstableApi::class)
class PulsePlaybackService : MediaSessionService() {

    private var exoPlayer: ExoPlayer? = null
    private var mediaSession: MediaSession? = null

    private val playbackListener = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: androidx.media3.common.MediaItem?, reason: Int) {
            PlaybackStore.notifyChanged()
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            PlaybackStore.notifyChanged()
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            PlaybackStore.notifyChanged()
        }

        override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
            PlaybackStore.notifyChanged()
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
        PlaybackStore.setAppContext(this)

        val session = MediaSession.Builder(this, player).build()
        mediaSession = session
        addSession(session)

        // Re-arm a persisted sleep-timer deadline (the process may have
        // been killed after the user armed it).
        PlaybackStore.restoreSleepTimer(this)

        // A setQueue that arrived before the service existed is applied now.
        if (PlaybackStore.pendingQueue != null) {
            PlaybackStore.applyPendingQueue(player)
        }
        PlaybackStore.notifyChanged()
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
}
