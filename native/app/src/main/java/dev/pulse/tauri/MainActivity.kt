package dev.pulse.tauri

import android.Manifest
import android.content.IntentSender
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import dev.pulse.tauri.ui.AppViewModel
import dev.pulse.tauri.ui.PulseApp
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val vm: AppViewModel by viewModels()
    private var hasAudioPermission = false

    private lateinit var deleteLauncher: ActivityResultLauncher<IntentSenderRequest>
    private lateinit var permissionLauncher: ActivityResultLauncher<String>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        hasAudioPermission = checkAudioPermission()

        deleteLauncher = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
            vm.onDeleteConsentResult(result.resultCode == RESULT_OK)
        }
        permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            hasAudioPermission = granted
            recreate()
        }

        // When the ViewModel produces a MediaStore delete request, hand
        // it to the system consent dialog.
        lifecycleScope.launch {
            vm.deleteConsent.collectLatest { pending ->
                if (pending != null) {
                    try {
                        deleteLauncher.launch(
                            IntentSenderRequest.Builder(pending.first.intentSender).build()
                        )
                    } catch (e: IntentSender.SendIntentException) {
                        vm.onDeleteConsentResult(false)
                    }
                }
            }
        }

        setContent {
            PulseApp(
                vm = vm,
                hasAudioPermission = hasAudioPermission,
                requestPermission = {
                    permissionLauncher.launch(audioPermission())
                },
            )
        }
    }

    private fun audioPermission(): String =
        if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO
        else Manifest.permission.READ_EXTERNAL_STORAGE

    private fun checkAudioPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, audioPermission()) == PackageManager.PERMISSION_GRANTED
}
