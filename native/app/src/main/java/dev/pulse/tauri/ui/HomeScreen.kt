package dev.pulse.tauri.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Sort
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.pulse.tauri.data.SortTracks
import dev.pulse.tauri.data.Track
import java.text.DateFormat
import java.util.Date

@Composable
fun HomeScreen(
    vm: AppViewModel,
    goScanner: () -> Unit,
    goPlaylists: () -> Unit,
    goSettings: () -> Unit,
    openPlayer: () -> Unit,
) {
    val data by vm.data.collectAsStateWithLifecycle()
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val updateHint by vm.updateHint.collectAsStateWithLifecycle()
    val context = LocalContext.current

    var query by remember { mutableStateOf("") }
    var favOnly by remember { mutableStateOf(false) }
    var menuTrack by remember { mutableStateOf<Track?>(null) }
    var pickPlaylistFor by remember { mutableStateOf<Track?>(null) }
    var infoTrack by remember { mutableStateOf<Track?>(null) }
    var confirmDeleteFile by remember { mutableStateOf<Track?>(null) }
    var confirmClearLibrary by remember { mutableStateOf(false) }
    var showSort by remember { mutableStateOf(false) }
    var showHomeMenu by remember { mutableStateOf(false) }

    val sortKey = data.settings.librarySortKey
    val sortDir = data.settings.librarySortDir

    val visible = remember(data.tracks, query, favOnly, sortKey, sortDir) {
        val q = query.trim().lowercase()
        val base = if (favOnly) data.tracks.filter { it.favorite } else data.tracks
        val filtered = if (q.isBlank()) base else base.filter { tr ->
            listOf(tr.title, tr.artist, tr.album, tr.path.substringAfterLast('/'))
                .any { it.lowercase().contains(q) }
        }
        SortTracks.sort(filtered, sortKey, sortDir)
    }
    val recent = remember(data.tracks) {
        val stamped = data.tracks.filter { it.addedAt > 0 }
        if (stamped.size < 4) emptyList()
        else stamped.sortedByDescending { it.addedAt }.take(8)
    }

    Column(Modifier.fillMaxSize()) {
        // Header
        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(vm.t("musicLibrary"), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text(vm.t("exploreYourMusic"), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = goSettings) { Icon(Icons.Filled.Settings, contentDescription = vm.t("settings")) }
            IconButton(onClick = { showHomeMenu = true }) { Icon(Icons.Filled.MoreHoriz, contentDescription = "menu") }
        }

        // Update hint bar
        if (updateHint != null) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(8.dp))
                Text(
                    vm.t("updateHint", "v$updateHint"),
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = { context.startActivity(vm.openUpdatePage()) }) { Text(vm.t("updateView")) }
                IconButton(onClick = { vm.dismissUpdateHint() }) {
                    Icon(Icons.Filled.Close, contentDescription = "dismiss")
                }
            }
        }

        // Actions
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = goScanner, modifier = Modifier.weight(1f)) { Text(vm.t("scanMusic")) }
            OutlinedButton(onClick = goPlaylists, modifier = Modifier.weight(1f)) { Text(vm.t("playlist")) }
        }

        Spacer(Modifier.height(12.dp))

        // Search
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text(vm.t("searchHint")) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = {
                if (query.isNotEmpty()) {
                    IconButton(onClick = { query = "" }) { Icon(Icons.Filled.Close, contentDescription = "clear") }
                }
            },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        )

        // Recently added rail
        if (query.isBlank() && !favOnly && recent.isNotEmpty()) {
            Text(
                vm.t("recentlyAdded"),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 16.dp, top = 16.dp, bottom = 8.dp),
            )
            LazyRow(
                Modifier.fillMaxWidth().padding(horizontal = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                items(recent, key = { it.id }) { tr ->
                    Column(
                        Modifier.width(112.dp).clickable { vm.playTrack(tr, recent); openPlayer() }.padding(8.dp),
                    ) {
                        ArtworkImage(tr.path, 88)
                        Text(tr.displayTitle, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(tr.artist, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }

        // List head: count + favourites filter + sort
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                if (query.isBlank()) "${visible.size}" else "${vm.t("results")} · ${visible.size}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = { favOnly = !favOnly }) {
                Icon(
                    if (favOnly) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    contentDescription = vm.t("favorites"),
                    tint = if (favOnly) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(onClick = { showSort = true }) {
                Icon(Icons.Filled.Sort, contentDescription = null)
                Spacer(Modifier.width(4.dp))
                Text(vm.t("sort" + sortKey.replaceFirstChar { it.uppercase() }))
                Text(if (sortDir == "asc") " ↑" else " ↓")
            }
        }

        if (data.tracks.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(vm.t("emptyLibrary"), style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(8.dp))
                    Text(vm.t("emptyLibraryHint"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(16.dp))
                    Button(onClick = goScanner) { Text(vm.t("scanMusic")) }
                }
            }
        } else if (visible.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(vm.t("noResults"), style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(8.dp))
                    Text(vm.t("tryOtherKeywords"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        } else {
            LazyColumn(Modifier.fillMaxSize()) {
                items(visible, key = { it.id }) { tr ->
                    TrackRow(
                        track = tr,
                        isCurrent = snapshot.currentId == tr.id,
                        onClick = { vm.playTrack(tr, visible); openPlayer() },
                        onMenu = { menuTrack = tr },
                    )
                }
            }
        }
    }

    // ---- dialogs ----

    if (showSort) {
        AlertDialog(
            onDismissRequest = { showSort = false },
            title = { Text(vm.t("sortBy")) },
            text = {
                Column {
                    for (key in SortTracks.KEYS) {
                        Row(
                            Modifier.fillMaxWidth().clickable {
                                if (key == sortKey) {
                                    vm.updateSettings { it.copy(librarySortDir = if (sortDir == "asc") "desc" else "asc") }
                                } else {
                                    vm.updateSettings { it.copy(librarySortKey = key, librarySortDir = SortTracks.defaultDir(key)) }
                                }
                                showSort = false
                            }.padding(vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(vm.t("sort" + key.replaceFirstChar { it.uppercase() }), Modifier.weight(1f))
                            if (key == sortKey) Text(if (sortDir == "asc") "↑" else "↓")
                        }
                    }
                    Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { vm.updateSettings { it.copy(librarySortDir = "asc") } }, modifier = Modifier.weight(1f)) {
                            Text(vm.t("sortAscending"))
                        }
                        OutlinedButton(onClick = { vm.updateSettings { it.copy(librarySortDir = "desc") } }, modifier = Modifier.weight(1f)) {
                            Text(vm.t("sortDescending"))
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showSort = false }) { Text(vm.t("close")) } },
        )
    }

    menuTrack?.let { tr ->
        AlertDialog(
            onDismissRequest = { menuTrack = null },
            title = { Text(tr.displayTitle, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            text = {
                Column {
                    MenuItem(Icons.Filled.PlayArrow, vm.t("playNext")) {
                        vm.playNext(tr); menuTrack = null; vm.showToast(vm.t("queuedNext"))
                    }
                    MenuItem(Icons.Filled.QueueMusic, vm.t("addToQueue")) {
                        vm.addToQueue(tr); menuTrack = null; vm.showToast(vm.t("queuedAdded"))
                    }
                    MenuItem(Icons.Filled.QueueMusic, vm.t("addToPlaylist")) {
                        pickPlaylistFor = tr; menuTrack = null
                    }
                    MenuItem(if (tr.favorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                        if (tr.favorite) vm.t("removeFavorite") else vm.t("addFavorite")) {
                        vm.toggleFavorite(tr.id); menuTrack = null
                    }
                    MenuItem(Icons.Filled.Info, vm.t("trackInfo")) {
                        infoTrack = tr; menuTrack = null
                    }
                    MenuItem(Icons.Filled.Delete, vm.t("deleteFile")) {
                        confirmDeleteFile = tr; menuTrack = null
                    }
                    MenuItem(Icons.Filled.Delete, vm.t("removeFromLibrary")) {
                        vm.removeTrackFromLibrary(tr.id); menuTrack = null; vm.showToast(vm.t("musicDeleted"))
                    }
                }
            },
            confirmButton = { TextButton(onClick = { menuTrack = null }) { Text(vm.t("close")) } },
        )
    }

    pickPlaylistFor?.let { tr ->
        AlertDialog(
            onDismissRequest = { pickPlaylistFor = null },
            title = { Text(vm.t("playlist")) },
            text = {
                Column {
                    if (data.playlists.isEmpty()) {
                        Text(vm.t("playlistsEmptyHint"))
                    }
                    for (p in data.playlists) {
                        TextButton(onClick = {
                            vm.addToPlaylist(p.id, tr)
                            pickPlaylistFor = null
                            vm.showToast(vm.t("songsAdded", 1))
                        }) { Text(p.name) }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { pickPlaylistFor = null }) { Text(vm.t("close")) } },
        )
    }

    infoTrack?.let { tr ->
        AlertDialog(
            onDismissRequest = { infoTrack = null },
            title = { Text(vm.t("trackInfo")) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    InfoRow(vm.t("sortTitle"), tr.displayTitle)
                    if (tr.artist.isNotBlank()) InfoRow(vm.t("sortArtist"), tr.artist)
                    if (tr.album.isNotBlank()) InfoRow(vm.t("sortAlbum"), tr.album)
                    InfoRow(vm.t("infoDuration"), formatDuration(tr.durationMs))
                    InfoRow(vm.t("infoSize"), "%.1f MB".format(tr.fileSizeBytes / (1024.0 * 1024.0)))
                    if (tr.addedAt > 0) InfoRow(vm.t("infoAdded"), DateFormat.getDateInstance().format(Date(tr.addedAt)))
                    InfoRow(vm.t("infoPath"), tr.path)
                }
            },
            confirmButton = { TextButton(onClick = { infoTrack = null }) { Text(vm.t("close")) } },
        )
    }

    confirmDeleteFile?.let { tr ->
        AlertDialog(
            onDismissRequest = { confirmDeleteFile = null },
            title = { Text(vm.t("deleteFile")) },
            text = { Text("${tr.displayTitle}\n\n${vm.t("deleteFileConfirm")}") },
            confirmButton = {
                TextButton(onClick = { vm.requestDeleteFile(tr); confirmDeleteFile = null }) { Text(vm.t("delete")) }
            },
            dismissButton = { TextButton(onClick = { confirmDeleteFile = null }) { Text(vm.t("cancel")) } },
        )
    }

    if (showHomeMenu) {
        AlertDialog(
            onDismissRequest = { showHomeMenu = false },
            title = { Text(vm.t("musicLibrary")) },
            text = {
                Column {
                    MenuItem(Icons.Filled.Delete, vm.t("clearLibrary")) {
                        showHomeMenu = false; confirmClearLibrary = true
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showHomeMenu = false }) { Text(vm.t("close")) } },
        )
    }

    if (confirmClearLibrary) {
        AlertDialog(
            onDismissRequest = { confirmClearLibrary = false },
            title = { Text(vm.t("clearLibrary")) },
            text = { Text(vm.t("clearLibraryConfirm")) },
            confirmButton = {
                TextButton(onClick = { vm.clearLibrary(); confirmClearLibrary = false; vm.showToast(vm.t("libraryCleared")) }) {
                    Text(vm.t("delete"))
                }
            },
            dismissButton = { TextButton(onClick = { confirmClearLibrary = false }) { Text(vm.t("cancel")) } },
        )
    }
}

@Composable
fun MenuItem(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(16.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
fun InfoRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth()) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(72.dp))
        Text(value, modifier = Modifier.weight(1f))
    }
}
