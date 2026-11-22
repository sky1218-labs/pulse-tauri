use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::MediaSessionExt;
use crate::Result;

#[command]
pub async fn set_queue<R: Runtime>(
    app: AppHandle<R>,
    payload: SetQueuePayload,
) -> Result<()> {
    app.mediasession().set_queue(payload)
}

#[command]
pub async fn play<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.mediasession().play()
}

#[command]
pub async fn pause<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.mediasession().pause()
}

#[command]
pub async fn next<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.mediasession().next()
}

#[command]
pub async fn previous<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.mediasession().previous()
}

#[command]
pub async fn seek_to<R: Runtime>(
    app: AppHandle<R>,
    payload: SeekToPayload,
) -> Result<()> {
    app.mediasession().seek_to(payload)
}

#[command]
pub async fn seek_by<R: Runtime>(
    app: AppHandle<R>,
    payload: SeekByPayload,
) -> Result<()> {
    app.mediasession().seek_by(payload)
}

#[command]
pub async fn set_volume<R: Runtime>(
    app: AppHandle<R>,
    payload: SetVolumePayload,
) -> Result<()> {
    app.mediasession().set_volume(payload)
}

#[command]
pub async fn set_speed<R: Runtime>(
    app: AppHandle<R>,
    payload: SetSpeedPayload,
) -> Result<()> {
    app.mediasession().set_speed(payload)
}

#[command]
pub async fn set_stop_at_track_end<R: Runtime>(
    app: AppHandle<R>,
    payload: SetStopAtTrackEndPayload,
) -> Result<()> {
    app.mediasession().set_stop_at_track_end(payload)
}

#[command]
pub async fn stop_playback<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.mediasession().stop_playback()
}

#[command]
pub async fn get_state<R: Runtime>(app: AppHandle<R>) -> Result<GetStateResponse> {
    app.mediasession().get_state()
}
