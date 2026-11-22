const COMMANDS: &[&str] = &[
    "set_queue",
    "play",
    "pause",
    "next",
    "previous",
    "seek_to",
    "seek_by",
    "set_volume",
    "set_speed",
    "set_stop_at_track_end",
    "stop_playback",
    "get_state",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
