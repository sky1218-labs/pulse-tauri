package dev.pulse.tauri.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.FastRewind
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun PlayerScreen(vm: AppViewModel, goBack: () -> Unit) {
    val data by vm.data.collectAsStateWithLifecycle()
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val queue by vm.queue.collectAsStateWithLifecycle()
    val volume by vm.volume.collectAsStateWithLifecycle()
    val speed by vm.speed.collectAsStateWithLifecycle()
    val sleepDeadline by vm.sleepDeadline.collectAsStateWithLifecycle()
    val sleepEndOfTrack by vm.sleepEndOfTrack.collectAsStateWithLifecycle()

    val track = vm.currentTrack

    var showSleep by remember { mutableStateOf(false) }
    var showSpeed by remember { mutableStateOf(false) }
    var showQueue by remember { mutableStateOf(false) }
    var scrub by remember { mutableStateOf<Float?>(null) }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = goBack) { Icon(Icons.Filled.ExpandMore, contentDescription = vm.t("back")) }
            Spacer(Modifier.weight(1f))
            val sleepActive = sleepDeadline > 0L || sleepEndOfTrack
            IconButton(onClick = { showSleep = true }) {
                Icon(
                    Icons.Filled.Bedtime,
                    contentDescription = vm.t("sleepTimer"),
                    tint = if (sleepActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (track == null) {
            Spacer(Modifier.weight(1f))
            Text("—", Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            Spacer(Modifier.weight(1f))
            return@Column
        }

        val liveTrack = data.tracks.find { it.id == track.id } ?: track
        val duration = if (snapshot.durationMs > 0) snapshot.durationMs else track.durationMs

        Spacer(Modifier.height(8.dp))
        ArtworkImage(track.path, 280, Modifier.align(Alignment.CenterHorizontally))
        Spacer(Modifier.height(24.dp))
        Text(
            track.displayTitle,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            track.artist.ifBlank { vm.t("unknownArtist") },
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )

        Spacer(Modifier.height(16.dp))
        Slider(
            value = (scrub ?: snapshot.positionMs.toFloat()).coerceIn(0f, maxOf(1L, duration).toFloat()),
            onValueChange = { scrub = it },
            onValueChangeFinished = {
                scrub?.let { vm.seekTo(it.toLong()) }
                scrub = null
            },
            valueRange = 0f..maxOf(1L, duration).toFloat(),
            modifier = Modifier.fillMaxWidth(),
        )
        Row(Modifier.fillMaxWidth()) {
            Text(formatDuration((scrub?.toLong() ?: snapshot.positionMs)), style = MaterialTheme.typography.labelMedium)
            Spacer(Modifier.weight(1f))
            Text(formatDuration(duration), style = MaterialTheme.typography.labelMedium)
        }

        // Transport
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = { vm.seekBy(-data.settings.skipBackwardSeconds * 1000L) }) {
                Icon(Icons.Filled.FastRewind, contentDescription = vm.t("skipBackward"))
            }
            IconButton(onClick = { vm.previous() }) {
                Icon(Icons.Filled.SkipPrevious, contentDescription = null, modifier = Modifier.height(36.dp))
            }
            IconButton(onClick = { vm.togglePlay() }, modifier = Modifier.height(64.dp)) {
                Icon(
                    if (snapshot.playing) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = null,
                    modifier = Modifier.height(56.dp),
                )
            }
            IconButton(onClick = { vm.next() }) {
                Icon(Icons.Filled.SkipNext, contentDescription = null, modifier = Modifier.height(36.dp))
            }
            IconButton(onClick = { vm.seekBy(data.settings.skipForwardSeconds * 1000L) }) {
                Icon(Icons.Filled.FastForward, contentDescription = vm.t("skipForward"))
            }
        }

        // Mode row: shuffle / repeat / favourite / queue
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            IconButton(onClick = { vm.toggleShuffle() }) {
                Icon(
                    Icons.Filled.Shuffle,
                    contentDescription = vm.t("shuffle"),
                    tint = if (data.settings.shuffleEnabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = { vm.cycleRepeat() }) {
                Icon(
                    if (data.settings.repeatMode == "one") Icons.Filled.RepeatOne else Icons.Filled.Repeat,
                    contentDescription = vm.t("repeatAll"),
                    tint = if (data.settings.repeatMode != "off") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = { vm.toggleFavorite(track.id) }) {
                Icon(
                    if (liveTrack.favorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    contentDescription = vm.t("favorites"),
                    tint = if (liveTrack.favorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = { showQueue = true }) {
                Icon(Icons.Filled.QueueMusic, contentDescription = vm.t("queueTitle"))
            }
        }

        Spacer(Modifier.height(8.dp))
        // Volume
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.VolumeUp, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Slider(
                value = volume,
                onValueChange = { vm.setVolume(it) },
                valueRange = 0f..1f,
                modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
            )
            Text("${(volume * 100).toInt()}%", style = MaterialTheme.typography.labelMedium)
        }
        // Speed row
        Row(
            Modifier.fillMaxWidth().clickable { showSpeed = true }.padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Speed, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.padding(8.dp))
            Text(vm.t("playbackSpeed"), Modifier.weight(1f))
            Text("${trimSpeed(speed)}x", style = MaterialTheme.typography.labelLarge)
        }
        if (sleepEndOfTrack) {
            Text(vm.t("sleepEndOfTrack"), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
        } else if (sleepDeadline > 0L) {
            val remaining = sleepDeadline - System.currentTimeMillis()
            if (remaining > 0) {
                Text(
                    vm.t("timerRemaining", formatDuration(remaining)),
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }
    }

    if (showSleep) {
        SleepDialog(vm, onClose = { showSleep = false })
    }
    if (showSpeed) {
        SpeedDialog(vm, speed, onClose = { showSpeed = false })
    }
    if (showQueue) {
        AlertDialog(
            onDismissRequest = { showQueue = false },
            title = { Text("${vm.t("queueTitle")} · ${queue.size}") },
            text = {
                LazyColumn {
                    items(queue, key = { it.id }) { tr ->
                        TrackRow(
                            track = tr,
                            isCurrent = snapshot.currentId == tr.id,
                            onClick = { vm.jumpToQueueTrack(tr); showQueue = false },
                            onMenu = {},
                        )
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showQueue = false }) { Text(vm.t("close")) } },
        )
    }
}

private fun trimSpeed(s: Float): String =
    if (s == s.toLong().toFloat()) s.toLong().toString() + ".0" else s.toString()

@Composable
private fun SpeedDialog(vm: AppViewModel, speed: Float, onClose: () -> Unit) {
    var draft by remember { mutableStateOf<Float?>(null) }
    val shown = draft ?: speed
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(vm.t("playbackSpeed")) },
        text = {
            Column {
                Text("${trimSpeed(shown)}x", style = MaterialTheme.typography.headlineSmall)
                Slider(
                    value = shown,
                    onValueChange = { draft = (Math.round(it * 20) / 20f) },
                    onValueChangeFinished = { draft?.let { vm.setSpeed(it) }; draft = null },
                    valueRange = 0.5f..2f,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (preset in listOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 2.0f)) {
                        TextButton(onClick = { vm.setSpeed(preset) }) { Text(trimSpeed(preset)) }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text(vm.t("close")) } },
    )
}

@Composable
private fun SleepDialog(vm: AppViewModel, onClose: () -> Unit) {
    val sleepDeadline by vm.sleepDeadline.collectAsStateWithLifecycle()
    val sleepEndOfTrack by vm.sleepEndOfTrack.collectAsStateWithLifecycle()
    var custom by remember { mutableStateOf("20") }
    val active = sleepDeadline > 0L || sleepEndOfTrack
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(vm.t("sleepTimer")) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                for (min in listOf(5, 10, 15, 30, 45, 60)) {
                    TextButton(onClick = { vm.startSleepTimed(min * 60_000L); onClose() }) {
                        Text(vm.t("minutes", min))
                    }
                }
                TextButton(onClick = { vm.startSleepEndOfTrack(); onClose() }) {
                    Text(vm.t("sleepEndOfTrack"))
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = custom,
                        onValueChange = { custom = it.filter { c -> c.isDigit() } },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    Button(
                        onClick = {
                            custom.toLongOrNull()?.takeIf { it > 0 }?.let { vm.startSleepTimed(it * 60_000L) }
                            onClose()
                        },
                    ) { Text(vm.t("start")) }
                }
                if (active) {
                    TextButton(onClick = { vm.stopSleep(); onClose() }) { Text(vm.t("stopTimer")) }
                }
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text(vm.t("close")) } },
    )
}
