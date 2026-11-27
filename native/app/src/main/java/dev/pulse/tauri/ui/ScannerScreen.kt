package dev.pulse.tauri.ui

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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

private val QUICK_PATHS = listOf(
    "/storage/emulated/0/Music",
    "/storage/emulated/0/Download",
    "/storage/emulated/0",
)

@Composable
fun ScannerScreen(vm: AppViewModel, goBack: () -> Unit, hasAudioPermission: Boolean, requestPermission: () -> Unit) {
    val data by vm.data.collectAsStateWithLifecycle()
    val scanState by vm.scanState.collectAsStateWithLifecycle()
    var folders by remember(data.settings.monitoredFolders) { mutableStateOf(data.settings.monitoredFolders) }
    var adding by remember { mutableStateOf(false) }
    var newPath by remember { mutableStateOf("") }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = goBack) { Icon(Icons.Filled.ArrowBack, contentDescription = vm.t("back")) }
            Column {
                Text(vm.t("scanFolders"), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(vm.t("scanFoldersDesc"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        if (!hasAudioPermission) {
            Column(Modifier.padding(16.dp)) {
                Text(vm.t("permissionNeeded"))
                Spacer(Modifier.height(8.dp))
                Button(onClick = requestPermission) { Text(vm.t("grantPermission")) }
            }
        }

        if (folders.isEmpty()) {
            Text(
                vm.t("noFolders"),
                Modifier.padding(16.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            LazyColumn(Modifier.weight(1f)) {
                items(folders) { folder ->
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.Folder, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(folder, Modifier.weight(1f).padding(horizontal = 12.dp), style = MaterialTheme.typography.bodyMedium)
                        IconButton(onClick = { folders = folders - folder }) {
                            Icon(Icons.Filled.Delete, contentDescription = vm.t("removeFolder"))
                        }
                    }
                }
            }
        }

        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            when (val st = scanState) {
                is ScanState.Scanning -> Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator()
                    Text("  ${vm.t("scanning")} ${vm.t("filesFound", st.found)}")
                }
                is ScanState.Done -> Text(vm.t("scanDone", st.total), color = MaterialTheme.colorScheme.primary)
                is ScanState.Failed -> Text(st.message, color = MaterialTheme.colorScheme.error)
                ScanState.Idle -> {}
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { adding = true }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Filled.Add, contentDescription = null)
                    Text(vm.t("addFolder"))
                }
                Button(
                    onClick = { vm.scanFolders(folders) },
                    enabled = folders.isNotEmpty() && scanState !is ScanState.Scanning,
                    modifier = Modifier.weight(1f),
                ) { Text(vm.t("scanNow")) }
            }
            OutlinedButton(
                onClick = {
                    val n = vm.cleanupMissing()
                    vm.showToast(vm.t("cleanupDone", n))
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(vm.t("cleanupMissing")) }
        }
    }

    if (adding) {
        AlertDialog(
            onDismissRequest = { adding = false },
            title = { Text(vm.t("addFolder")) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = newPath,
                        onValueChange = { newPath = it },
                        label = { Text(vm.t("folderPath")) },
                        singleLine = true,
                    )
                    for (quick in QUICK_PATHS) {
                        TextButton(onClick = { newPath = quick }) { Text(quick) }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val p = newPath.trim()
                    if (p.isNotEmpty() && p !in folders) folders = folders + p
                    adding = false
                    newPath = ""
                }) { Text(vm.t("create")) }
            },
            dismissButton = { TextButton(onClick = { adding = false }) { Text(vm.t("cancel")) } },
        )
    }
}
