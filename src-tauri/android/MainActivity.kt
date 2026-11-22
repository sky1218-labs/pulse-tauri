package dev.pulse.tauri

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * Pulse's MainActivity — copied over the Tauri CLI template's generated
 * MainActivity.kt by the release workflow after `tauri android init`
 * (the template body is just enableEdgeToEdge() + super.onCreate()).
 *
 * Additions over the template:
 *  - Startup runtime permissions: folder scanning reads audio files
 *    through plain filesystem paths (READ_MEDIA_AUDIO / legacy storage),
 *    and the media-session notification needs POST_NOTIFICATIONS on
 *    Android 13+.
 *  - System back handling: the back gesture/button first asks the web
 *    layer (`window.__pulseBack()`, installed by src/utils/backNav.ts) —
 *    it closes the topmost dialog or navigates back one screen and
 *    returns true; only when it declines (root screen / WebView not
 *    ready) does the default behaviour run and exit the app.
 */
class MainActivity : TauriActivity() {

  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    requestStartupPermissions()
    onBackPressedDispatcher.addCallback(this, backCallback)
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
  }

  private val backCallback = object : OnBackPressedCallback(true) {
    override fun handleOnBackPressed() {
      val view = webView
      if (view == null) {
        exitViaDefaultBack()
        return
      }
      // __pulseBack returns true when the web layer consumed the press.
      view.evaluateJavascript(BACK_SCRIPT) { result ->
        if (result != "true") {
          exitViaDefaultBack()
        }
      }
    }
  }

  /** Runs the platform default for back (finishes the activity). */
  private fun exitViaDefaultBack() {
    backCallback.isEnabled = false
    onBackPressedDispatcher.onBackPressed()
  }

  private fun requestStartupPermissions() {
    val wanted = mutableListOf<String>()
    val audioPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      Manifest.permission.READ_MEDIA_AUDIO
    } else {
      Manifest.permission.READ_EXTERNAL_STORAGE
    }
    wanted.add(audioPermission)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      wanted.add(Manifest.permission.POST_NOTIFICATIONS)
    }
    val missing = wanted.filter {
      ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
    }
    if (missing.isNotEmpty()) {
      ActivityCompat.requestPermissions(this, missing.toTypedArray(), REQUEST_PERMISSIONS)
    }
  }

  companion object {
    private const val REQUEST_PERMISSIONS = 1001

    // The IIFE never throws: any failure (bridge absent, JS error) reads
    // as "not handled", and Android falls through to exiting.
    private const val BACK_SCRIPT =
      "(function(){try{return typeof window.__pulseBack==='function' ? !!window.__pulseBack() : false;}catch(e){return false;}})()"
  }
}
