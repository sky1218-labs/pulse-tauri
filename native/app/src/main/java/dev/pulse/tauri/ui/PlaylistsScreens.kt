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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.pulse.tauri.data.Playlist

@Composable
fun PlaylistsScreen(vm: AppViewModel, goBack: () -> Unit, openPlaylist: (String) -> Unit) {
    val data by vm.data.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }
    var sortMode by remember { mutableStateOf("recent") }
    var creating by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var renaming by remember { mutableStateOf<Playlist?>(null) }
    var renameText by remember { mutableStateOf("") }
    var confirmDelete by remember { mutableStateOf<Playlist?>(null) }
    var menu by remember { mutableStateOf<Playlist?>(null) }

    val visible = remember(data.playlists, query, sortMode) {
        val q = query.trim().lowercase()
        val filtered = if (q.isBlank()) data.playlists else data.playlists.filter { it.name.lowercase().contains(q) }
        if (sortMode == "name") filtered.sortedBy { it.name.lowercase() } else filtered.sortedByDescending { it.updatedAt }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = goBack) { Icon(Icons.Filled.ArrowBack, contentDescription = vm.t("back")) }
                Column {
                    Text(vm.t("playlist"), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text(vm.t("scanFoldersDesc"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text(vm.t("searchHint")) },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                trailingIcon = {
                    if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Filled.Close, contentDescription = "clear") }
                },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            )
            Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = sortMode == "recent", onClick = { sortMode = "recent" }, label = { Text(vm.t("playlistSortRecent")) })
                FilterChip(selected = sortMode == "name", onClick = { sortMode = "name" }, label = { Text(vm.t("playlistSortName")) })
            }
            if (data.playlists.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(vm.t("playlistsEmpty"), style = MaterialTheme.typography.titleLarge)
                        Spacer(Modifier.height(8.dp))
                        Text(vm.t("playlistsEmptyHint"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(16.dp))
                        Button(onClick = { name = ""; creating = true }) { Text(vm.t("createPlaylist")) }
                    }
                }
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
                    items(visible, key = { it.id }) { p ->
                        Row(
                            Modifier.fillMaxWidth().clickable { openPlaylist(p.id) }.padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(p.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(vm.t("songsCount", p.trackIds.size), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            IconButton(onClick = { menu = p }) { Icon(Icons.Filled.MoreVert, contentDescription = "menu") }
                        }
                    }
                }
            }
        }
        FloatingActionButton(
            onClick = { name = ""; creating = true },
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
        ) { Icon(Icons.Filled.Add, contentDescription = vm.t("createPlaylist")) }
    }

    if (creating) {
        AlertDialog(
            onDismissRequest = { creating = false },
            title = { Text(vm.t("createPlaylist")) },
            text = {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text(vm.t("playlistName")) }, singleLine = true)
            },
            confirmButton = {
                TextButton(onClick = { vm.createPlaylist(name); creating = false }) { Text(vm.t("create")) }
            },
            dismissButton = { TextButton(onClick = { creating = false }) { Text(vm.t("cancel")) } },
        )
    }
    renaming?.let { p ->
        AlertDialog(
            onDismissRequest = { renaming = null },
            title = { Text(vm.t("rename")) },
            text = {
                OutlinedTextField(value = renameText, onValueChange = { renameText = it }, label = { Text(vm.t("playlistName")) }, singleLine = true)
            },
            confirmButton = {
                TextButton(onClick = { vm.renamePlaylist(p.id, renameText); renaming = null }) { Text(vm.t("confirm")) }
            },
            dismissButton = { TextButton(onClick = { renaming = null }) { Text(vm.t("cancel")) } },
        )
    }
    confirmDelete?.let { p ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text(vm.t("deletePlaylist")) },
            text = { Text(vm.t("deletePlaylistConfirm")) },
            confirmButton = {
                TextButton(onClick = { vm.deletePlaylist(p.id); confirmDelete = null }) { Text(vm.t("delete")) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text(vm.t("cancel")) } },
        )
    }
    menu?.let { p ->
        AlertDialog(
            onDismissRequest = { menu = null },
            title = { Text(p.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            text = {
                Column {
                    MenuItem(Icons.Filled.Edit, vm.t("rename")) { renameText = p.name; renaming = p; menu = null }
                    MenuItem(Icons.Filled.Delete, vm.t("deletePlaylist")) { confirmDelete = p; menu = null }
                }
            },
            confirmButton = { TextButton(onClick = { menu = null }) { Text(vm.t("close")) } },
        )
    }
}

@Composable
fun PlaylistDetailScreen(vm: AppViewModel, playlistId: String, goBack: () -> Unit, openPlayer: () -> Unit) {
    val data by vm.data.collectAsStateWithLifecycle()
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val playlist = data.playlists.find { it.id == playlistId }
    if (playlist == null) {
        LaunchedBack(goBack)
        return
    }
    val byId = data.tracks.associateBy { it.id }
    val tracks = playlist.trackIds.mapNotNull { byId[it] }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = goBack) { Icon(Icons.Filled.ArrowBack, contentDescription = vm.t("back")) }
            Column(Modifier.weight(1f)) {
                Text(playlist.name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(vm.t("songsCount", tracks.size), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Button(onClick = { if (tracks.isNotEmpty()) { vm.playTrack(tracks.first(), tracks); openPlayer() } }) {
                Text(vm.t("nowPlaying"))
            }
        }
        LazyColumn(Modifier.fillMaxSize()) {
            itemsIndexed(tracks, key = { _, tr -> tr.id }) { index, tr ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f)) {
                        TrackRow(
                            track = tr,
                            isCurrent = snapshot.currentId == tr.id,
                            onClick = { vm.playTrack(tr, tracks); openPlayer() },
                            onMenu = {},
                        )
                    }
                    IconButton(onClick = {
                        if (index > 0) {
                            val ids = playlist.trackIds.toMutableList()
                            ids.swap(index, index - 1)
                            vm.setPlaylistTrackIds(playlist.id, ids)
                        }
                    }) { Icon(Icons.Filled.ArrowUpward, contentDescription = vm.t("moveUp")) }
                    IconButton(onClick = {
                        if (index < playlist.trackIds.lastIndex) {
                            val ids = playlist.trackIds.toMutableList()
                            ids.swap(index, index + 1)
                            vm.setPlaylistTrackIds(playlist.id, ids)
                        }
                    }) { Icon(Icons.Filled.ArrowDownward, contentDescription = vm.t("moveDown")) }
                    IconButton(onClick = {
                        vm.setPlaylistTrackIds(playlist.id, playlist.trackIds.filter { it != tr.id })
                    }) { Icon(Icons.Filled.Close, contentDescription = vm.t("removeFromPlaylist")) }
                }
            }
        }
    }
}

private fun <T> MutableList<T>.swap(i: Int, j: Int) {
    val tmp = this[i]
    this[i] = this[j]
    this[j] = tmp
}

@Composable
private fun LaunchedBack(goBack: () -> Unit) {
    androidx.compose.runtime.LaunchedEffect(Unit) { goBack() }
}
