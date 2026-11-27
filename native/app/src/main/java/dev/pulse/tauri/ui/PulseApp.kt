package dev.pulse.tauri.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

sealed interface Screen {
    data object Home : Screen
    data object Player : Screen
    data object Playlists : Screen
    data class PlaylistDetail(val id: String) : Screen
    data object Scanner : Screen
    data object Settings : Screen
}

/** App shell: one screen at a time + the mini player above the bottom. */
@Composable
fun PulseApp(
    vm: AppViewModel,
    hasAudioPermission: Boolean,
    requestPermission: () -> Unit,
) {
    val toast by vm.toast.collectAsStateWithLifecycle()
    var screen by remember { mutableStateOf<Screen>(Screen.Home) }

    MaterialTheme(colorScheme = darkColorScheme()) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize()) {
                Box(Modifier.weight(1f)) {
                    when (val s = screen) {
                        Screen.Home -> HomeScreen(
                            vm,
                            goScanner = { screen = Screen.Scanner },
                            goPlaylists = { screen = Screen.Playlists },
                            goSettings = { screen = Screen.Settings },
                            openPlayer = { screen = Screen.Player },
                        )
                        Screen.Player -> PlayerScreen(vm, goBack = { screen = Screen.Home })
                        Screen.Playlists -> PlaylistsScreen(
                            vm,
                            goBack = { screen = Screen.Home },
                            openPlaylist = { screen = Screen.PlaylistDetail(it) },
                        )
                        is Screen.PlaylistDetail -> PlaylistDetailScreen(
                            vm,
                            s.id,
                            goBack = { screen = Screen.Playlists },
                            openPlayer = { screen = Screen.Player },
                        )
                        Screen.Scanner -> ScannerScreen(vm, goBack = { screen = Screen.Home }, hasAudioPermission, requestPermission)
                        Screen.Settings -> SettingsScreen(
                            vm,
                            goBack = { screen = Screen.Home },
                            goScanner = { screen = Screen.Scanner },
                        )
                    }
                }
                if (screen != Screen.Player) {
                    MiniPlayer(vm, openPlayer = { screen = Screen.Player })
                }
                if (toast != null) {
                    Text(
                        toast!!,
                        Modifier.fillMaxWidth().padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }
}

@Composable
private fun MiniPlayer(vm: AppViewModel, openPlayer: () -> Unit) {
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val track = vm.currentTrack ?: return
    Surface(
        Modifier.fillMaxWidth().clickable(onClick = openPlayer),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ArtworkImage(track.path, 44)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(track.displayTitle, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
                Text(track.artist, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            androidx.compose.material3.IconButton(onClick = { vm.togglePlay() }) {
                androidx.compose.material3.Icon(
                    if (snapshot.playing) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = null,
                )
            }
        }
    }
}
