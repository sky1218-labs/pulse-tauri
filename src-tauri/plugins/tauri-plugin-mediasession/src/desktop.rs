use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<MediaSession<R>> {
    Ok(MediaSession(app.clone()))
}

/// Access to the mediasession APIs. Desktop has no native playback
/// service — the Web Audio engine plays in the WebView and the Web Media
/// Session API covers OS integration there — so every call is a
/// successful no-op and `get_state` reports an idle player.
#[allow(dead_code)]
pub struct MediaSession<R: Runtime>(AppHandle<R>);

impl<R: Runtime> MediaSession<R> {
    pub fn set_queue(&self, _payload: SetQueuePayload) -> crate::Result<()> {
        Ok(())
    }

    pub fn play(&self) -> crate::Result<()> {
        Ok(())
    }

    pub fn pause(&self) -> crate::Result<()> {
        Ok(())
    }

    pub fn next(&self) -> crate::Result<()> {
        Ok(())
    }

    pub fn previous(&self) -> crate::Result<()> {
        Ok(())
    }

    pub fn seek_to(&self, _payload: SeekToPayload) -> crate::Result<()> {
        Ok(())
    }

    pub fn seek_to_index(&self, _payload: SeekToIndexPayload) -> crate::Result<()> {
        Ok(())
    }

    pub fn seek_by(&self, _payload: SeekByPayload) -> crate::Result<()> {
        Ok(())
    }

    pub fn set_volume(&self, _payload: SetVolumePayload) -> crate::Result<()> {
        Ok(())
    }

    pub fn set_speed(&self, _payload: SetSpeedPayload) -> crate::Result<()> {
        Ok(())
    }

    pub fn set_stop_at_track_end(
        &self,
        _payload: SetStopAtTrackEndPayload,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub fn set_sleep_timer(&self, _payload: SetSleepTimerPayload) -> crate::Result<()> {
        Ok(())
    }

    pub fn stop_playback(&self) -> crate::Result<()> {
        Ok(())
    }

    pub fn get_state(&self) -> crate::Result<GetStateResponse> {
        Ok(GetStateResponse::default())
    }
}
