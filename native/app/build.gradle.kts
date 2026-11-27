plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "dev.pulse.tauri"
    compileSdk = 34

    defaultConfig {
        // Same applicationId as the Tauri build so the native app
        // upgrades the installed app in place (same signing key too).
        applicationId = "dev.pulse.tauri"
        minSdk = 26
        targetSdk = 34
        versionCode = 100
        versionName = "1.0.0"
    }

    // Release signing comes from CI-injected properties (the same
    // keystore secret the Tauri release used); local builds fall back
    // to the debug key.
    val keystoreFile = providers.gradleProperty("pulse.keystoreFile").orNull
    signingConfigs {
        if (keystoreFile != null) {
            create("ci") {
                storeFile = file(keystoreFile)
                storePassword = providers.gradleProperty("pulse.keystorePassword").orNull
                keyAlias = providers.gradleProperty("pulse.keyAlias").orNull ?: "pulse"
                keyPassword = providers.gradleProperty("pulse.keyPassword").orNull
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystoreFile != null) signingConfig = signingConfigs.getByName("ci")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.session)
    implementation(libs.media3.common)
    implementation(libs.coroutines.android)
    implementation(libs.serialization.json)
    testImplementation(libs.junit)
}
