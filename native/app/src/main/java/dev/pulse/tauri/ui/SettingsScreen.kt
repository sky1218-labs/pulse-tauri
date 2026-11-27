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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(vm: AppViewModel, goBack: () -> Unit, goScanner: () -> Unit) {
    val data by vm.data.collectAsStateWithLifecycle()
    val s = data.settings
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var confirmReset by remember { mutableStateOf(false) }
    var confirmClearAll by remember { mutableStateOf(false) }
    var updateNote by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = goBack) { Icon(Icons.Filled.ArrowBack, contentDescription = vm.t("back")) }
            Text(vm.t("settings"), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        }

        SectionTitle(vm.t("language"))
        Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((code, label) in listOf("zh-TW" to "繁體中文", "en" to "English")) {
                TextButton(
                    onClick = { vm.updateSettings { it.copy(locale = code) } },
                ) {
                    Text(
                        label,
                        fontWeight = if (s.locale == code) FontWeight.Bold else FontWeight.Normal,
                        color = if (s.locale == code) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }

        SectionTitle(vm.t("playback"))
        SettingSlider(
            title = vm.t("defaultVolume"),
            value = s.defaultVolume,
            range = 0f..1f,
            format = { "${(it * 100).toInt()}%" },
            onCommit = { v -> vm.updateSettings { it.copy(defaultVolume = v) }; vm.setVolume(v) },
        )
        SettingSlider(
            title = vm.t("defaultSpeed"),
            value = s.defaultPlaybackSpeed,
            range = 0.5f..2f,
            format = { "${trimSpeedLabel(it)}x" },
            quantize = { Math.round(it * 20) / 20f },
            onCommit = { v -> vm.updateSettings { it.copy(defaultPlaybackSpeed = v) }; vm.setSpeed(v) },
        )
        SettingSlider(
            title = vm.t("skipForward"),
            value = s.skipForwardSeconds.toFloat(),
            range = 5f..60f,
            format = { vm.t("seconds", it.toInt()) },
            quantize = { Math.round(it / 5f) * 5f },
            onCommit = { v -> vm.updateSettings { it.copy(skipForwardSeconds = v.toInt()) } },
        )
        SettingSlider(
            title = vm.t("skipBackward"),
            value = s.skipBackwardSeconds.toFloat(),
            range = 5f..60f,
            format = { vm.t("seconds", it.toInt()) },
            quantize = { Math.round(it / 5f) * 5f },
            onCommit = { v -> vm.updateSettings { it.copy(skipBackwardSeconds = v.toInt()) } },
        )

        SectionTitle(vm.t("features"))
        SwitchRow(
            title = vm.t("sleepFade"),
            desc = vm.t("sleepFadeDesc"),
            on = s.sleepTimerFadeOutEnabled,
            onToggle = { vm.updateSettings { it.copy(sleepTimerFadeOutEnabled = !s.sleepTimerFadeOutEnabled) } },
        )
        if (s.sleepTimerFadeOutEnabled) {
            SettingSlider(
                title = vm.t("sleepFadeSeconds"),
                value = s.sleepTimerFadeOutSeconds.toFloat(),
                range = 0f..30f,
                format = { vm.t("seconds", it.toInt()) },
                quantize = { it.toInt().toFloat() },
                onCommit = { v -> vm.updateSettings { it.copy(sleepTimerFadeOutSeconds = v.toInt()) } },
            )
        }
        SwitchRow(
            title = vm.t("autoUpdate"),
            desc = vm.t("autoUpdateDesc"),
            on = s.autoUpdateEnabled,
            onToggle = { vm.updateSettings { it.copy(autoUpdateEnabled = !s.autoUpdateEnabled) } },
        )
        ActionRow(
            icon = Icons.Filled.Refresh,
            title = vm.t("checkForUpdates"),
            desc = vm.t("scanFoldersDesc"),
            onClick = {
                scope.launch {
                    val latest = UpdateChecker.fetchLatest()
                    updateNote = when {
                        latest == null -> vm.t("updateCheckFailed")
                        dev.pulse.tauri.data.VersionCompare.compare(latest, UpdateChecker.CURRENT_VERSION) > 0 ->
                            "${vm.t("updateAvailable")}: v$latest"
                        else -> vm.t("updateUpToDate")
                    }
                    if (latest != null && dev.pulse.tauri.data.VersionCompare.compare(latest, UpdateChecker.CURRENT_VERSION) > 0) {
                        context.startActivity(vm.openUpdatePage())
                    }
                }
            },
        )
        if (updateNote != null) {
            Text(updateNote!!, Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.primary)
        }
        ActionRow(icon = Icons.Filled.Folder, title = vm.t("scanFolders"), desc = vm.t("scanFoldersDesc"), onClick = goScanner)

        SectionTitle(vm.t("other"))
        ActionRow(icon = Icons.Filled.Replay, title = vm.t("resetSettings"), desc = "", onClick = { confirmReset = true })
        ActionRow(icon = Icons.Filled.Delete, title = vm.t("clearAllData"), desc = "", danger = true, onClick = { confirmClearAll = true })

        Spacer(Modifier.height(24.dp))
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Pulse", style = MaterialTheme.typography.titleMedium)
            Text("${vm.t("version")} ${UpdateChecker.CURRENT_VERSION}", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.height(32.dp))
    }

    if (confirmReset) {
        AlertDialog(
            onDismissRequest = { confirmReset = false },
            title = { Text(vm.t("resetSettings")) },
            text = { Text(vm.t("clearAllDataConfirm")) },
            confirmButton = { TextButton(onClick = { vm.resetSettings(); confirmReset = false }) { Text(vm.t("confirm")) } },
            dismissButton = { TextButton(onClick = { confirmReset = false }) { Text(vm.t("cancel")) } },
        )
    }
    if (confirmClearAll) {
        AlertDialog(
            onDismissRequest = { confirmClearAll = false },
            title = { Text(vm.t("clearAllData")) },
            text = { Text(vm.t("clearAllDataConfirm")) },
            confirmButton = { TextButton(onClick = { vm.clearAllData(); confirmClearAll = false }) { Text(vm.t("delete")) } },
            dismissButton = { TextButton(onClick = { confirmClearAll = false }) { Text(vm.t("cancel")) } },
        )
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 16.dp, top = 20.dp, bottom = 8.dp),
    )
}

@Composable
private fun SettingSlider(
    title: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    format: (Float) -> String,
    quantize: (Float) -> Float = { it },
    onCommit: (Float) -> Unit,
) {
    // The label follows the thumb from a local draft; the value commits
    // once, on release (same rule as the Tauri build's sliders).
    var draft by remember { mutableStateOf<Float?>(null) }
    val shown = draft ?: value
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
        Row(Modifier.fillMaxWidth()) {
            Text(title, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
            Text(format(shown), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Slider(
            value = shown,
            onValueChange = { draft = quantize(it) },
            onValueChangeFinished = {
                draft?.let { if (it != value) onCommit(it) }
                draft = null
            },
            valueRange = range,
        )
    }
}

@Composable
private fun SwitchRow(title: String, desc: String, on: Boolean, onToggle: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onToggle).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (desc.isNotBlank()) {
                Text(desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Switch(checked = on, onCheckedChange = { onToggle() })
    }
}

@Composable
private fun ActionRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    desc: String,
    danger: Boolean = false,
    onClick: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, color = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
            if (desc.isNotBlank()) {
                Text(desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun trimSpeedLabel(s: Float): String =
    if (s == s.toLong().toFloat()) s.toLong().toString() + ".0" else s.toString()
