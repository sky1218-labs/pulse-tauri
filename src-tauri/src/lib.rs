use std::path::{Path, PathBuf};

use lofty::prelude::*;
use lofty::probe::Probe;
use serde::Serialize;
use walkdir::WalkDir;

/// Audio extensions supported by Pulse (mirrors the Flutter original).
const AUDIO_EXTENSIONS: [&str; 6] = ["mp3", "flac", "wav", "aac", "ogg", "m4a"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioMetadata {
    pub path: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_ms: u64,
    pub file_size_bytes: u64,
}

/// Normalize a path the same way the frontend `canonicalize` does:
/// trims whitespace, converts backslashes, resolves `.` / `..` lexically.
fn canonicalize_str(input: &str) -> String {
    let trimmed = input.trim().replace('\\', "/");
    let is_absolute = trimmed.starts_with('/');
    let mut segments: Vec<&str> = Vec::new();
    for seg in trimmed.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                segments.pop();
            }
            s => segments.push(s),
        }
    }
    let joined = segments.join("/");
    if is_absolute {
        format!("/{joined}")
    } else {
        joined
    }
}

#[tauri::command]
fn canonicalize_path(path: String) -> String {
    canonicalize_str(&path)
}

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn fallback_title(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string()
}

fn read_metadata(path: &Path) -> Result<AudioMetadata, String> {
    let canonical = canonicalize_str(&path.to_string_lossy());
    let file_size_bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);

    let tagged = Probe::open(path)
        .map_err(|e| e.to_string())?
        .read()
        .map_err(|e| e.to_string())?;

    let properties = tagged.properties();
    let duration_ms = properties.duration().as_millis() as u64;

    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());
    let (title, artist, album) = match tag {
        Some(tag) => (
            tag.title()
                .map(|s| s.to_string())
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| fallback_title(path)),
            tag.artist().map(|s| s.to_string()),
            tag.album().map(|s| s.to_string()),
        ),
        None => (fallback_title(path), None, None),
    };

    Ok(AudioMetadata {
        path: canonical,
        title,
        artist,
        album,
        duration_ms,
        file_size_bytes,
    })
}

#[tauri::command]
fn get_audio_metadata(path: String) -> Result<AudioMetadata, String> {
    read_metadata(Path::new(&path))
}

/// Recursively scan a folder for supported audio files and read their tags.
/// Unreadable files are skipped (matching the original scanner behaviour of
/// reporting what it could read rather than failing the whole scan).
#[tauri::command]
fn scan_folder(path: String) -> Result<Vec<AudioMetadata>, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }
    let mut results: Vec<AudioMetadata> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for entry in WalkDir::new(&root).follow_links(false).into_iter().filter_map(|e| e.ok()) {
        let p = entry.path();
        if !p.is_file() || !is_audio(p) {
            continue;
        }
        if let Ok(meta) = read_metadata(p) {
            if seen.contains(&meta.path) {
                continue;
            }
            seen.push(meta.path.clone());
            results.push(meta);
        }
    }
    results.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    Ok(results)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_mediasession::init())
        .invoke_handler(tauri::generate_handler![
            scan_folder,
            get_audio_metadata,
            canonicalize_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pulse");
}
