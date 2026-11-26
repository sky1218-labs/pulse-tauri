use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

mod commands;
#[cfg(desktop)]
mod desktop;
mod error;
#[cfg(mobile)]
mod mobile;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::MediaSession;
#[cfg(mobile)]
use mobile::MediaSession;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`]
/// to access the mediasession APIs.
pub trait MediaSessionExt<R: Runtime> {
    fn mediasession(&self) -> &MediaSession<R>;
}

impl<R: Runtime, T: Manager<R>> MediaSessionExt<R> for T {
    fn mediasession(&self) -> &MediaSession<R> {
        self.state::<MediaSession<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("mediasession")
        .invoke_handler(tauri::generate_handler![
            commands::set_queue,
            commands::play,
            commands::pause,
            commands::next,
            commands::previous,
            commands::seek_to,
            commands::seek_to_index,
            commands::seek_by,
            commands::set_volume,
            commands::set_speed,
            commands::set_stop_at_track_end,
            commands::stop_playback,
            commands::get_state
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let handle = mobile::init(app, api)?;
            #[cfg(desktop)]
            let handle = desktop::init(app, api)?;
            app.manage(handle);
            Ok(())
        })
        .build()
}
