plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "dev.pulse.tauri.mediasession"
    // Media3 1.11 requires compiling against a recent SDK; the generated
    // app already compiles/targets API 37 (tauri-cli 2.12.6 template),
    // so this module does the same.
    compileSdk = 37

    defaultConfig {
        minSdk = 24
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_1_8.toString()
    }
}

dependencies {
    // Media3 session + ExoPlayer: since 0.1.11 the playback itself is
    // native — PulsePlaybackService hosts an ExoPlayer inside a
    // MediaSessionService (the architecture production players use), and
    // Media3 builds the media notification from the real player's state.
    // The WebView is only a controller. This replaces both the deprecated
    // androidx.media stack (0.1.8/0.1.9, crashed on notification taps) and
    // the 0.1.10 forwarding SimpleBasePlayer (notification buttons gated
    // to no-ops by the mirroring design).
    implementation("androidx.media3:media3-session:1.11.1")
    implementation("androidx.media3:media3-exoplayer:1.11.1")
    implementation(project(":tauri-android"))
}
