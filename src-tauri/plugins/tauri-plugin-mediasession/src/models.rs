use serde::{Deserialize, Serialize};

/// One queue entry for the native ExoPlayer. `uri` is the raw file path
/// (Kotlin prefixes `file://` when it has no scheme) or a URL.
/// Field names serialize camelCase and map 1:1 onto the Kotlin @InvokeArg class.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueItem {
    pub id: String,
    pub uri: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration_ms: u64,
}

/// Replace (or, with `preserve`, re-sync) the native player's queue.
/// With preserve, Kotlin keeps the current item, its position and
/// playWhenReady and only swaps the surrounding list.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetQueuePayload {
    pub items: Vec<QueueItem>,
    pub start_index: u32,
    pub start_position_ms: u64,
    pub autoplay: bool,
    pub preserve: bool,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeekToPayload {
    pub position_ms: u64,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeekToIndexPayload {
    pub index: u32,
    pub position_ms: u64,
    pub autoplay: bool,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeekByPayload {
    pub delta_ms: i64,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetVolumePayload {
    pub volume: f64,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSpeedPayload {
    pub speed: f64,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetStopAtTrackEndPayload {
    pub enabled: bool,
}

/// Snapshot of the native player's state, returned by `get_state`
/// (Kotlin builds the same shape for `playback-event` triggers).
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetStateResponse {
    pub playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub current_id: String,
    pub ended: bool,
}
