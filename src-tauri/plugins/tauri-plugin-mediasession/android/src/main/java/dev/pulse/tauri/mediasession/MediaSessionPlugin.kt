package dev.pulse.tauri.mediasession

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class QueueItemArg {
    var id: String = ""
    var uri: String = ""
    var title: String = ""
    var artist: String = ""
    var album: String? = null
    var durationMs: Long = 0
}

@InvokeArg
class SetQueueArgs {
    var items: List<QueueItemArg> = emptyList()
    var startIndex: Int = 0
    var startPositionMs: Long = 0
    var autoplay: Boolean = true
    var preserve: Boolean = false
}

@InvokeArg
class SeekToArgs {
    var positionMs: Long = 0
}

@InvokeArg
class SeekToIndexArgs {
    var index: Int = 0
    var positionMs: Long = 0
    var autoplay: Boolean = true
}

@InvokeArg
class SeekByArgs {
    var deltaMs: Long = 0
}

@InvokeArg
class SetVolumeArgs {
    var volume: Double = 1.0
}

@InvokeArg
class SetSpeedArgs {
    var speed: Double = 1.0
}

@InvokeArg
class SetStopAtTrackEndArgs {
    var enabled: Boolean = false
}

@InvokeArg
class SetRepeatModeArgs {
    /** "off" | "all" | "one" */
    var mode: String = "all"
}

@InvokeArg
class SetShuffleArgs {
    var enabled: Boolean = false
}

@InvokeArg
class SetSleepTimerArgs {
    /** Epoch ms when playback must stop; 0 cancels the timer. */
    var deadlineMs: Long = 0
    var fadeOutSeconds: Int = 0
}

/**
 * Tauri side of the media-session plugin. Since 0.1.11 playback is native
 * (ExoPlayer inside [PulsePlaybackService]); JS is a controller. Commands
 * land here from Rust and are applied to the player on the main thread;
 * player events flow back to JS as `playback-event` triggers. The
 * POST_NOTIFICATIONS runtime permission is declared here so the plugin
 * manager provides checkPermissions / requestPermissions (Android 13+
 * shows no notification without it).
 *
 * Every command body is guarded: a failure resolves/rejects cleanly and
 * must never crash the app.
 */
@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "postNotifications")
    ]
)
class MediaSessionPlugin(private val activity: Activity) : Plugin(activity) {

    override fun load(webView: WebView) {
        PlaybackStore.setAppContext(activity)
        PlaybackStore.eventSink = { obj ->
            // The bridge to the WebView can throw when the activity/webview
            // is gone (e.g. service outlived the UI). That must never crash.
            try {
                trigger("playback-event", obj)
            } catch (t: Throwable) {
                android.util.Log.e("PulseMediaPlugin", "playback-event trigger failed", t)
            }
        }
    }

    @Command
    fun setQueue(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SetQueueArgs::class.java)
            val queue = PendingQueue(
                items = args.items.map {
                    QueueItemData(
                        id = it.id,
                        uri = it.uri,
                        title = it.title,
                        artist = it.artist,
                        album = it.album ?: "",
                        durationMs = it.durationMs
                    )
                },
                startIndex = args.startIndex,
                startPositionMs = args.startPositionMs,
                autoplay = args.autoplay,
                preserve = args.preserve
            )
            if (PlaybackStore.player == null) {
                // Service not running yet: park the queue and start it;
                // PulsePlaybackService.onCreate applies the pending queue.
                PlaybackStore.pendingQueue = queue
                startPlaybackService()
            } else {
                PlaybackStore.withPlayer { PlaybackStore.applySetQueue(it, queue) }
            }
            invoke.resolve()
        } catch (t: Throwable) {
            android.util.Log.e("PulseMediaPlugin", "setQueue failed", t)
            invoke.reject(t.message ?: "setQueue failed")
        }
    }

    @Command
    fun play(invoke: Invoke) {
        PlaybackStore.withPlayer { it.play() }
        invoke.resolve()
    }

    @Command
    fun pause(invoke: Invoke) {
        PlaybackStore.withPlayer { it.pause() }
        invoke.resolve()
    }

    @Command
    fun next(invoke: Invoke) {
        PlaybackStore.withPlayer { it.seekToNextMediaItem() }
        invoke.resolve()
    }

    @Command
    fun previous(invoke: Invoke) {
        PlaybackStore.withPlayer { it.seekToPreviousMediaItem() }
        invoke.resolve()
    }

    @Command
    fun seekTo(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SeekToArgs::class.java)
            PlaybackStore.withPlayer { it.seekTo(args.positionMs.coerceAtLeast(0L)) }
            invoke.resolve()
        } catch (t: Throwable) {
            invoke.reject(t.message ?: "seekTo failed")
        }
    }

    @Command
    fun seekToIndex(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SeekToIndexArgs::class.java)
            PlaybackStore.withPlayer {
                it.seekTo(args.index.coerceAtLeast(0), args.positionMs.coerceAtLeast(0L))
                it.playWhenReady = args.autoplay
                it.prepare()
            }
            invoke.resolve()
        } catch (t: Throwable) {
            invoke.reject(t.message ?: "seekToIndex failed")
        }
    }

    @Command
    fun seekBy(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SeekByArgs::class.java)
            PlaybackStore.withPlayer { it.seekTo(it.currentPosition + args.deltaMs) }
            invoke.resolve()
        } catch (t: Throwable) {
            invoke.reject(t.message ?: "seekBy failed")
        }
    }

    @Command
    fun setVolume(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SetVolumeArgs::class.java)
            val v = args.volume.toFloat().coerceIn(0f, 1f)
            PlaybackStore.onUserSetVolume(v)
            PlaybackStore.withPlayer { it.volume = v }
            invoke.resolve()
        } catch (t: Throwable) {
            invoke.reject(t.message ?: "setVolume failed")
        }
    }

    @Command
    fun setSpeed(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SetSpeedArgs::class.java)
            PlaybackStore.withPlayer { it.setPlaybackSpeed(args.speed.toFloat()) }
            invoke.resolve()
        } catch (t: Throwable) {
            invoke.reject(t.message ?: "setSpeed failed")
        }
    }

    @Command
    fun setStopAtTrackEnd(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SetStopAtTrackEndArgs::class.java)
            PlaybackStore.setStopAtTrackEndEnabled(args.enabled)
            invoke.resolve()
        } catch (t: Throwable) {
            invoke.reject(t.message ?: "setStopAtTrackEnd failed")
        }
    }

    @Command
    fun setRepeatMode(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SetRepeatModeArgs::class.java)
            PlaybackStore.updateRepeatModePref(args.mode)
            invoke.resolve()
        } catch (t: Throwable) {
            invoke.reject(t.message ?: "setRepeatMode failed")
        }
    }

    @Command
    fun setShuffle(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SetShuffleArgs::class.java)
            PlaybackStore.updateShufflePref(args.enabled)
            invoke.resolve()
        } catch (t: Throwable) {
            invoke.reject(t.message ?: "setShuffle failed")
        }
    }

    @Command
    fun setSleepTimer(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SetSleepTimerArgs::class.java)
            PlaybackStore.setSleepTimer(args.deadlineMs, args.fadeOutSeconds)
            invoke.resolve()
        } catch (t: Throwable) {
            invoke.reject(t.message ?: "setSleepTimer failed")
        }
    }

    @Command
    fun stopPlayback(invoke: Invoke) {
        try {
            PlaybackStore.setSleepTimer(0L, 0)
            PlaybackStore.pendingQueue = null
            PlaybackStore.withPlayer {
                it.stop()
                it.clearMediaItems()
            }
            activity.stopService(Intent(activity, PulsePlaybackService::class.java))
            invoke.resolve()
        } catch (t: Throwable) {
            android.util.Log.e("PulseMediaPlugin", "stopPlayback failed", t)
            invoke.reject(t.message ?: "stopPlayback failed")
        }
    }

    @Command
    fun getState(invoke: Invoke) {
        invoke.resolve(PlaybackStore.stateSnapshot())
    }

    private fun startPlaybackService() {
        try {
            // Plain framework calls (no androidx.core dependency): the
            // foreground-service start variant exists since API 26.
            val intent = Intent(activity, PulsePlaybackService::class.java)
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                activity.startForegroundService(intent)
            } else {
                activity.startService(intent)
            }
        } catch (t: Throwable) {
            android.util.Log.e("PulseMediaPlugin", "start service failed", t)
        }
    }
}
