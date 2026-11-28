package dev.pulse.tauri.ui

import android.app.Application
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import dev.pulse.tauri.data.LibraryData
import dev.pulse.tauri.data.LibraryRepository
import dev.pulse.tauri.data.Playlist
import dev.pulse.tauri.data.Scanner
import dev.pulse.tauri.data.Settings
import dev.pulse.tauri.data.Track
import dev.pulse.tauri.playback.PlaybackSnapshot
import dev.pulse.tauri.playback.PlaybackStore
import dev.pulse.tauri.playback.PulsePlaybackService
import dev.pulse.tauri.playback.QueueItemData
import java.io.File
import java.util.concurrent.ExecutionException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

sealed interface ScanState {
    data object Idle : ScanState
    data class Scanning(val found: Int) : ScanState
    data class Done(val total: Int) : ScanState
    data class Failed(val message: String) : ScanState
}

/**
 * The single state holder: library data (persisted JSON), the playback
 * mirror (polled from PlaybackStore at the same cadence the Tauri build
 * used — 500 ms playing / 2 s paused), and all user actions. The UI is
 * a pure function of these flows.
 */
class AppViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = LibraryRepository(app.filesDir)

    private val _data = MutableStateFlow(repo.load())
    val data: StateFlow<LibraryData> = _data.asStateFlow()

    private val _snapshot = MutableStateFlow(PlaybackSnapshot())
    val snapshot: StateFlow<PlaybackSnapshot> = _snapshot.asStateFlow()

    private val _queue = MutableStateFlow<List<Track>>(emptyList())
    val queue: StateFlow<List<Track>> = _queue.asStateFlow()

    private val _volume = MutableStateFlow(_data.value.settings.defaultVolume)
    val volume: StateFlow<Float> = _volume.asStateFlow()

    private val _speed = MutableStateFlow(_data.value.settings.defaultPlaybackSpeed)
    val speed: StateFlow<Float> = _speed.asStateFlow()

    private val _sleepDeadline = MutableStateFlow(PlaybackStore.sleepDeadlineMs)
    val sleepDeadline: StateFlow<Long> = _sleepDeadline.asStateFlow()

    private val _sleepEndOfTrack = MutableStateFlow(false)
    val sleepEndOfTrack: StateFlow<Boolean> = _sleepEndOfTrack.asStateFlow()

    private val _scanState = MutableStateFlow<ScanState>(ScanState.Idle)
    val scanState: StateFlow<ScanState> = _scanState.asStateFlow()

    private val _toast = MutableStateFlow<String?>(null)
    val toast: StateFlow<String?> = _toast.asStateFlow()

    private val _updateHint = MutableStateFlow<String?>(null)
    val updateHint: StateFlow<String?> = _updateHint.asStateFlow()

    private val _updateState = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val updateState: StateFlow<UpdateState> = _updateState.asStateFlow()

    /** A MediaStore delete consent waiting for the user (system dialog). */
    private val _deleteConsent = MutableStateFlow<Pair<PendingIntent, Track>?>(null)
    val deleteConsent: StateFlow<Pair<PendingIntent, Track>?> = _deleteConsent.asStateFlow()

    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var saveJob: Job? = null
    private var lastPositionSaveAt = 0L

    fun t(key: String, vararg args: Any): String = Strings.t(_data.value.settings.locale, key, *args)

    val currentTrack: Track?
        get() {
            val id = _snapshot.value.currentId
            if (id.isBlank()) return null
            return _queue.value.find { it.id == id } ?: _data.value.tracks.find { it.id == id }
        }

    init {
        PlaybackStore.setAppContext(app)
        PlaybackStore.updateRepeatModePref(_data.value.settings.repeatMode)
        PlaybackStore.updateShufflePref(_data.value.settings.shuffleEnabled)
        if (PlaybackStore.sleepDeadlineMs > 0L) {
            _sleepDeadline.value = PlaybackStore.sleepDeadlineMs
        }

        // Connect a MediaController: the canonical way to bring the
        // MediaSessionService up. Transport itself goes through
        // PlaybackStore directly (same process).
        val token = SessionToken(app, ComponentName(app, PulsePlaybackService::class.java))
        controllerFuture = MediaController.Builder(app, token).buildAsync()
        controllerFuture?.addListener(
            { try { controllerFuture?.get() } catch (e: ExecutionException) { /* service unavailable */ } },
            { it.run() },
        )

        PlaybackStore.onStateChanged = { refreshSnapshot() }

        // Restore the last session as a paused queue.
        val d = _data.value
        if (d.lastQueueIds.isNotEmpty()) {
            val byId = d.tracks.associateBy { it.id }
            val restored = d.lastQueueIds.mapNotNull { byId[it] }
            val startIdx = restored.indexOfFirst { it.id == d.lastCurrentId }.coerceAtLeast(0)
            if (restored.isNotEmpty()) {
                _queue.value = restored
                PlaybackStore.setQueue(
                    restored.map { it.toQueueItem() },
                    startIdx,
                    d.lastPositionMs,
                    autoplay = false,
                )
                PlaybackStore.setVolume(_volume.value)
                PlaybackStore.setSpeed(_speed.value)
            }
        }

        viewModelScope.launch {
            while (true) {
                refreshSnapshot()
                persistPlaybackProgress()
                delay(if (_snapshot.value.playing) 500L else 2000L)
            }
        }

        if (_data.value.settings.autoUpdateEnabled) {
            viewModelScope.launch {
                _updateHint.value = UpdateChecker.check(app)
            }
        }
    }

    override fun onCleared() {
        controllerFuture?.let { MediaController.releaseFuture(it) }
        PlaybackStore.onStateChanged = null
        super.onCleared()
    }

    private fun refreshSnapshot() {
        val snap = PlaybackStore.snapshot()
        _snapshot.value = snap
        // The timed sleep timer fired natively: clear the local mirror.
        if (_sleepDeadline.value > 0L && PlaybackStore.sleepDeadlineMs <= 0L &&
            System.currentTimeMillis() >= _sleepDeadline.value - 500L
        ) {
            _sleepDeadline.value = 0L
        }
    }

    private fun persistPlaybackProgress() {
        val snap = _snapshot.value
        if (snap.currentId.isBlank()) return
        val now = System.currentTimeMillis()
        if (now - lastPositionSaveAt < 5000L) return
        lastPositionSaveAt = now
        val queueIds = _queue.value.map { it.id }
        updateData { d ->
            d.copy(
                positions = d.positions + (snap.currentId to snap.positionMs),
                lastQueueIds = queueIds,
                lastCurrentId = snap.currentId,
                lastPositionMs = snap.positionMs,
            )
        }
    }

    private fun updateData(transform: (LibraryData) -> LibraryData) {
        _data.value = transform(_data.value)
        saveJob?.cancel()
        saveJob = viewModelScope.launch {
            delay(800L)
            val snapshotData = _data.value
            withContext(Dispatchers.IO) { repo.save(snapshotData) }
        }
    }

    fun showToast(message: String) {
        _toast.value = message
        viewModelScope.launch {
            delay(2200L)
            if (_toast.value == message) _toast.value = null
        }
    }

    /* ------------------------------ playback ------------------------------ */

    private fun Track.toQueueItem() = QueueItemData(
        id = id, uri = path, title = displayTitle, artist = artist, album = album, durationMs = durationMs,
    )

    fun playTrack(track: Track, queueTracks: List<Track>) {
        val idx = queueTracks.indexOfFirst { it.id == track.id }.coerceAtLeast(0)
        _queue.value = queueTracks
        PlaybackStore.setQueue(queueTracks.map { it.toQueueItem() }, idx, 0L, autoplay = true)
        PlaybackStore.setVolume(_volume.value)
        PlaybackStore.setSpeed(_speed.value)
    }

    fun jumpToQueueTrack(track: Track) {
        val q = _queue.value
        val idx = q.indexOfFirst { it.id == track.id }
        if (idx < 0) {
            playTrack(track, q.ifEmpty { listOf(track) })
            return
        }
        // Same queue: a seek-to-index, never a queue rebuild.
        if (PlaybackStore.fullQueue.map { it.id } == q.map { it.id }) {
            PlaybackStore.seekToIndex(idx, 0L, autoplay = true)
        } else {
            playTrack(track, q)
        }
    }

    fun togglePlay() {
        if (_snapshot.value.playing) PlaybackStore.pause() else PlaybackStore.play()
    }

    fun next() = PlaybackStore.next()
    fun previous() = PlaybackStore.previous()
    fun seekTo(ms: Long) = PlaybackStore.seekTo(ms)
    fun seekBy(deltaMs: Long) = PlaybackStore.seekBy(deltaMs)

    fun setVolume(v: Float) {
        _volume.value = v.coerceIn(0f, 1f)
        PlaybackStore.setVolume(_volume.value)
    }

    fun setSpeed(s: Float) {
        _speed.value = s.coerceIn(0.5f, 2.0f)
        PlaybackStore.setSpeed(_speed.value)
    }

    fun cycleRepeat() {
        val next = when (_data.value.settings.repeatMode) {
            "all" -> "one"
            "one" -> "off"
            else -> "all"
        }
        updateSettings { it.copy(repeatMode = next) }
        PlaybackStore.updateRepeatModePref(next)
    }

    fun toggleShuffle() {
        val next = !_data.value.settings.shuffleEnabled
        updateSettings { it.copy(shuffleEnabled = next) }
        PlaybackStore.updateShufflePref(next)
    }

    fun playNext(track: Track) {
        val current = currentTrack
        if (current == null || _queue.value.isEmpty()) {
            playTrack(track, listOf(track))
            return
        }
        val without = _queue.value.filter { it.id != track.id }
        val curIdx = without.indexOfFirst { it.id == current.id }
        val next = without.toMutableList().apply { add(curIdx + 1, track) }
        _queue.value = next
        PlaybackStore.syncQueue(next.map { it.toQueueItem() })
    }

    fun addToQueue(track: Track) {
        if (_queue.value.isEmpty()) {
            playTrack(track, listOf(track))
            return
        }
        if (_queue.value.any { it.id == track.id }) return
        val next = _queue.value + track
        _queue.value = next
        PlaybackStore.syncQueue(next.map { it.toQueueItem() })
    }

    /* ------------------------------ sleep timer ------------------------------ */

    fun startSleepTimed(ms: Long) {
        val s = _data.value.settings
        val deadline = System.currentTimeMillis() + ms
        PlaybackStore.setStopAtTrackEndEnabled(false)
        _sleepEndOfTrack.value = false
        PlaybackStore.setSleepTimer(deadline, if (s.sleepTimerFadeOutEnabled) s.sleepTimerFadeOutSeconds else 0)
        _sleepDeadline.value = deadline
    }

    fun startSleepEndOfTrack() {
        PlaybackStore.setSleepTimer(0L, 0)
        _sleepDeadline.value = 0L
        PlaybackStore.setStopAtTrackEndEnabled(true)
        _sleepEndOfTrack.value = true
    }

    fun stopSleep() {
        PlaybackStore.setSleepTimer(0L, 0)
        _sleepDeadline.value = 0L
        if (_sleepEndOfTrack.value) {
            PlaybackStore.setStopAtTrackEndEnabled(false)
            _sleepEndOfTrack.value = false
        }
        PlaybackStore.setVolume(_volume.value)
    }

    /* ------------------------------ library ------------------------------ */

    fun updateSettings(transform: (Settings) -> Settings) {
        updateData { d -> d.copy(settings = transform(d.settings)) }
    }

    fun toggleFavorite(trackId: String) {
        updateData { d ->
            d.copy(tracks = d.tracks.map { if (it.id == trackId) it.copy(favorite = !it.favorite) else it })
        }
        // Keep the queued copy's flag in step for the player's heart.
        _queue.value = _queue.value.map { tr ->
            _data.value.tracks.find { it.id == tr.id } ?: tr
        }
    }

    fun createPlaylist(name: String) {
        val now = System.currentTimeMillis()
        val playlist = Playlist(
            id = "p_$now",
            name = name.ifBlank { "Playlist" },
            createdAt = now,
            updatedAt = now,
        )
        updateData { d -> d.copy(playlists = d.playlists + playlist) }
    }

    fun renamePlaylist(id: String, name: String) {
        updateData { d ->
            d.copy(playlists = d.playlists.map {
                if (it.id == id) it.copy(name = name, updatedAt = System.currentTimeMillis()) else it
            })
        }
    }

    fun deletePlaylist(id: String) {
        updateData { d -> d.copy(playlists = d.playlists.filter { it.id != id }) }
    }

    fun addToPlaylist(playlistId: String, track: Track) {
        updateData { d ->
            d.copy(playlists = d.playlists.map { p ->
                if (p.id == playlistId && track.id !in p.trackIds) {
                    p.copy(trackIds = p.trackIds + track.id, updatedAt = System.currentTimeMillis())
                } else p
            })
        }
    }

    fun setPlaylistTrackIds(playlistId: String, ids: List<String>) {
        updateData { d ->
            d.copy(playlists = d.playlists.map {
                if (it.id == playlistId) it.copy(trackIds = ids, updatedAt = System.currentTimeMillis()) else it
            })
        }
    }

    fun removeTrackFromLibrary(trackId: String) {
        updateData { d ->
            d.copy(
                tracks = d.tracks.filter { it.id != trackId },
                playlists = d.playlists.map { p -> p.copy(trackIds = p.trackIds.filter { it != trackId }) },
                positions = d.positions - trackId,
            )
        }
        if (_queue.value.any { it.id == trackId }) {
            val next = _queue.value.filter { it.id != trackId }
            _queue.value = next
            if (currentTrack?.id == trackId) PlaybackStore.stopPlayback()
            else PlaybackStore.syncQueue(next.map { it.toQueueItem() })
        }
    }

    fun clearLibrary() {
        PlaybackStore.stopPlayback()
        _queue.value = emptyList()
        updateData { d -> d.copy(tracks = emptyList(), playlists = emptyList(), positions = emptyMap()) }
    }

    fun clearAllData() {
        PlaybackStore.stopPlayback()
        _queue.value = emptyList()
        _data.value = LibraryData()
        viewModelScope.launch(Dispatchers.IO) { repo.save(LibraryData()) }
    }

    fun resetSettings() {
        updateData { d -> d.copy(settings = Settings(locale = d.settings.locale)) }
    }

    /* ------------------------------ scanning ------------------------------ */

    fun scanFolders(folders: List<String>) {
        if (_scanState.value is ScanState.Scanning) return
        _scanState.value = ScanState.Scanning(0)
        viewModelScope.launch {
            try {
                val found = withContext(Dispatchers.IO) {
                    val files = folders.flatMap { Scanner.findAudioFiles(File(it)) }
                    _scanState.value = ScanState.Scanning(files.size)
                    val now = System.currentTimeMillis()
                    val existing = _data.value.tracks.associateBy { it.id }
                    files.map { file ->
                        val fresh = Scanner.readTrack(file, now)
                        val old = existing[fresh.id]
                        if (old != null) {
                            fresh.copy(addedAt = old.addedAt, favorite = old.favorite)
                        } else fresh
                    }
                }
                updateData { d ->
                    val byId = d.tracks.associateBy { it.id }.toMutableMap()
                    for (tr in found) byId[tr.id] = tr
                    d.copy(
                        tracks = byId.values.toList(),
                        settings = d.settings.copy(monitoredFolders = folders),
                    )
                }
                _scanState.value = ScanState.Done(found.size)
            } catch (t: Throwable) {
                _scanState.value = ScanState.Failed(t.message ?: "scan failed")
            }
        }
    }

    fun cleanupMissing(): Int {
        val missing = _data.value.tracks.filter { !File(it.path).exists() }
        for (tr in missing) removeTrackFromLibrary(tr.id)
        return missing.size
    }

    /* ------------------------------ file deletion ------------------------------ */

    /**
     * Delete the actual audio file. On Android 11+ most files need the
     * system's consent dialog (MediaStore delete request); the UI
     * launches [deleteConsent] and reports back via
     * [onDeleteConsentResult]. Older systems / app-owned files delete
     * directly.
     */
    fun requestDeleteFile(track: Track) {
        viewModelScope.launch {
            val ctx = getApplication<Application>()
            var launched = false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val uri = withContext(Dispatchers.IO) { findMediaStoreUri(ctx, track.path) }
                if (uri != null) {
                    val request = MediaStore.createDeleteRequest(ctx.contentResolver, listOf(uri))
                    _deleteConsent.value = request to track
                    launched = true
                }
            }
            if (!launched) {
                val ok = withContext(Dispatchers.IO) {
                    try { File(track.path).delete() } catch (t: Throwable) { false }
                }
                if (ok) {
                    removeTrackFromLibrary(track.id)
                    showToast(t("fileDeleted"))
                } else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                    showToast(t("fileDeleteFailed"))
                } else {
                    // No MediaStore row and direct delete failed.
                    showToast(t("fileDeleteFailed"))
                }
            }
        }
    }

    fun onDeleteConsentResult(granted: Boolean) {
        val pending = _deleteConsent.value ?: return
        _deleteConsent.value = null
        if (granted) {
            removeTrackFromLibrary(pending.second.id)
            showToast(t("fileDeleted"))
        } else {
            showToast(t("fileDeleteFailed"))
        }
    }

    private fun findMediaStoreUri(ctx: Application, path: String): Uri? {
        val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        return try {
            ctx.contentResolver.query(
                collection,
                arrayOf(MediaStore.Audio.Media._ID),
                "${MediaStore.Audio.Media.DATA} = ?",
                arrayOf(path),
                null,
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val id = cursor.getLong(0)
                    Uri.withAppendedPath(collection, id.toString())
                } else null
            }
        } catch (t: Throwable) {
            null
        }
    }

    /* ------------------------------ in-app update ------------------------------ */

    /** Check now and, if a newer release exists, move to Available. */
    fun checkForUpdateNow() {
        viewModelScope.launch {
            _updateState.value = UpdateState.Checking
            val info = Updater.fetchUpdate()
            _updateState.value = if (info != null) UpdateState.Available(info) else UpdateState.UpToDate
        }
    }

    /** Download the available update inside the app (with progress). */
    fun startUpdateDownload() {
        val state = _updateState.value
        val info = when (state) {
            is UpdateState.Available -> state.info
            is UpdateState.Failed -> state.info
            else -> null
        } ?: run {
            checkForUpdateNow()
            return
        }
        viewModelScope.launch {
            _updateState.value = UpdateState.Downloading(info, 0)
            val file = Updater.download(getApplication(), info) { pct ->
                _updateState.value = UpdateState.Downloading(info, pct)
            }
            _updateState.value = if (file != null) {
                UpdateState.Downloaded(info, file)
            } else {
                UpdateState.Failed(info, t("updateDownloadFailed"))
            }
        }
    }

    /** The system installer intent for a downloaded update, or null. */
    fun updateInstallIntent(): Intent? {
        val state = _updateState.value as? UpdateState.Downloaded ?: return null
        val ctx = getApplication<Application>()
        return if (Updater.canInstall(ctx)) {
            Updater.installIntent(ctx, state.file)
        } else {
            null
        }
    }

    fun unknownSourcesIntent(): Intent =
        Updater.unknownSourcesSettingsIntent(getApplication())

    fun canInstallUpdates(): Boolean = Updater.canInstall(getApplication())

    fun resetUpdateState() {
        _updateState.value = UpdateState.Idle
    }

    /* ------------------------------ update hint ------------------------------ */

    fun dismissUpdateHint() {
        val v = _updateHint.value ?: return
        UpdateChecker.dismiss(getApplication(), v)
        _updateHint.value = null
    }

}

sealed interface UpdateState {
    data object Idle : UpdateState
    data object Checking : UpdateState
    data object UpToDate : UpdateState
    data class Available(val info: ReleaseInfo) : UpdateState
    data class Downloading(val info: ReleaseInfo, val percent: Int) : UpdateState
    data class Downloaded(val info: ReleaseInfo, val file: java.io.File) : UpdateState
    data class Failed(val info: ReleaseInfo?, val message: String) : UpdateState
}
