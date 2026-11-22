# Versions

Everything is pinned exactly — no floating ranges. Upgrade policy: one component at a time, CI must pass before the next; never let ranges float.

| Component | Version | LTS / Stable | Pinned in |
|---|---|---|---|
| Node.js | 26.13.1 | LTS | `.nvmrc`, `.github/workflows/*` |
| Rust | 1.100.0 | Stable | `rust-toolchain.toml`, `.github/workflows/*` |
| Java (Temurin) | 17.0.21 | LTS (17 line) | `.github/workflows/release-android.yml` |
| @tauri-apps/api | 2.12.5 | Stable | `package.json` |
| @tauri-apps/cli | 2.12.6 | Stable | `package.json` |
| tauri (crate) | 2.12.7 | Stable | `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` |
| tauri-build | 2.7.6 | Stable | `src-tauri/Cargo.toml` |
| tauri-plugin (build crate) | 2.7.4 | Stable | `src-tauri/plugins/tauri-plugin-mediasession/Cargo.toml` |
| @tauri-apps/plugin-dialog | 2.8.4 | Stable | `package.json`, `src-tauri/Cargo.toml` |
| @tauri-apps/plugin-fs | 2.7.1 | Stable | `package.json`, `src-tauri/Cargo.toml` |
| react / react-dom | 19.3.1 | Stable | `package.json` |
| @types/react / @types/react-dom | 19.3.0 | Stable | `package.json` |
| vite | 8.3.8 | Stable | `package.json` |
| @vitejs/plugin-react | 6.3.0 | Stable | `package.json` |
| typescript | 7.0.2 | Stable | `package.json` |
| vitest | 5.1.1 | Stable | `package.json` |
| serde | 1.0.229 | Stable | `src-tauri/Cargo.toml`, plugin `Cargo.toml` |
| serde_json | 1.0.154 | Stable | plugin `Cargo.toml` |
| lofty | 0.21.1 | Stable | `src-tauri/Cargo.toml` |
| walkdir | 2.5.1 | Stable | `src-tauri/Cargo.toml` |
| thiserror | 2.0.21 | Stable | plugin `Cargo.toml` |
| androidx.media3:media3-session | 1.11.1 | Stable | plugin `android/build.gradle.kts` |
| androidx.media3:media3-exoplayer | 1.11.1 | Stable | plugin `android/build.gradle.kts` |
| Android compileSdk | 37 | Stable | plugin `android/build.gradle.kts` (generated app: tauri-cli 2.12.6 template) |
| Android NDK | 27.2.12479018 | Stable | `.github/workflows/release-android.yml` |
| actions/checkout | v7.0.1 (SHA-pinned) | Stable | `.github/workflows/*` |
| actions/setup-node | v7.1.0 (SHA-pinned) | Stable | `.github/workflows/*` |
| actions/setup-java | v5.3.0 (SHA-pinned) | Stable | `.github/workflows/release-android.yml` |
| actions/cache | v6.1.0 (SHA-pinned) | Stable | `.github/workflows/release-android.yml` |
| actions/upload-artifact | v7.0.2 (SHA-pinned) | Stable | `.github/workflows/release-android.yml` |
| gradle/actions/setup-gradle | v6.4.1 (SHA-pinned) | Stable | `.github/workflows/release-android.yml` |
| softprops/action-gh-release | v3.0.0 (SHA-pinned) | Stable | `.github/workflows/release-android.yml` |
| Swatinem/rust-cache | v2.9.3 (SHA-pinned) | Stable | `.github/workflows/*` |
| dtolnay/rust-toolchain | master (SHA-pinned, no release tags) | — | `.github/workflows/*` |
| Signing | release keystore (not in repo) | — | GitHub secrets |

- Java stays on the 17 LTS line: AGP documents JDK 17; JDK 25 (newer LTS) is not AGP-supported.
- Transitive dependencies are frozen by `package-lock.json` and `src-tauri/Cargo.lock` — both committed.
