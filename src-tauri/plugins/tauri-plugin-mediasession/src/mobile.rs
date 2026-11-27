use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::*;

const PLUGIN_IDENTIFIER: &str = "dev.pulse.tauri.mediasession";

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<MediaSession<R>> {
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "MediaSessionPlugin")?;
    Ok(MediaSession(handle))
}

/// Access to the mediasession APIs.
pub struct MediaSession<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> MediaSession<R> {
    // `::<()>` is required on the fire-and-forget calls: Rust 1.100 infers
    // the never type `!` for a discarded return value, and `!` does not
    // implement DeserializeOwned. Kotlin resolves these with no value.
    pub fn set_queue(&self, payload: SetQueuePayload) -> crate::Result<()> {
        self.0.run_mobile_plugin::<()>("setQueue", payload)?;
        Ok(())
    }

    pub fn play(&self) -> crate::Result<()> {
        self.0.run_mobile_plugin::<()>("play", serde_json::json!({}))?;
        Ok(())
    }

    pub fn pause(&self) -> crate::Result<()> {
        self.0.run_mobile_plugin::<()>("pause", serde_json::json!({}))?;
        Ok(())
    }

    pub fn next(&self) -> crate::Result<()> {
        self.0.run_mobile_plugin::<()>("next", serde_json::json!({}))?;
        Ok(())
    }

    pub fn previous(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<()>("previous", serde_json::json!({}))?;
        Ok(())
    }

    pub fn seek_to(&self, payload: SeekToPayload) -> crate::Result<()> {
        self.0.run_mobile_plugin::<()>("seekTo", payload)?;
        Ok(())
    }

    pub fn seek_to_index(&self, payload: SeekToIndexPayload) -> crate::Result<()> {
        self.0.run_mobile_plugin::<()>("seekToIndex", payload)?;
        Ok(())
    }

    pub fn seek_by(&self, payload: SeekByPayload) -> crate::Result<()> {
        self.0.run_mobile_plugin::<()>("seekBy", payload)?;
        Ok(())
    }

    pub fn set_volume(&self, payload: SetVolumePayload) -> crate::Result<()> {
        self.0.run_mobile_plugin::<()>("setVolume", payload)?;
        Ok(())
    }

    pub fn set_speed(&self, payload: SetSpeedPayload) -> crate::Result<()> {
        self.0.run_mobile_plugin::<()>("setSpeed", payload)?;
        Ok(())
    }

    pub fn set_stop_at_track_end(
        &self,
        payload: SetStopAtTrackEndPayload,
    ) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<()>("setStopAtTrackEnd", payload)?;
        Ok(())
    }

    pub fn set_repeat_mode(&self, payload: SetRepeatModePayload) -> crate::Result<()> {
        self.0.run_mobile_plugin::<()>("setRepeatMode", payload)?;
        Ok(())
    }

    pub fn set_shuffle(&self, payload: SetShufflePayload) -> crate::Result<()> {
        self.0.run_mobile_plugin::<()>("setShuffle", payload)?;
        Ok(())
    }

    pub fn set_sleep_timer(&self, payload: SetSleepTimerPayload) -> crate::Result<()> {
        self.0.run_mobile_plugin::<()>("setSleepTimer", payload)?;
        Ok(())
    }

    pub fn stop_playback(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<()>("stopPlayback", serde_json::json!({}))?;
        Ok(())
    }

    pub fn get_state(&self) -> crate::Result<GetStateResponse> {
        let res = self
            .0
            .run_mobile_plugin::<GetStateResponse>("getState", serde_json::json!({}))?;
        Ok(res)
    }
}
