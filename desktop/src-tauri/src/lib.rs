//! LSPD Kill-Clips – erkennt eigene Kills im Spiel und schneidet sie automatisch als Clip.
//!
//! Basiert auf der Kill-Clip-Erkennung aus FIB Desktop – Credits: Emin.

mod autostart;
mod clipper;
mod convert;
mod killclip;
mod media;
mod recorder;
mod settings;

use std::{
    path::PathBuf,
    sync::{atomic::AtomicBool, Mutex},
};

use serde::Serialize;
use serde_json::json;
use settings::Settings;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;

pub const APP_NAME: &str = "LSPD Kill-Clips";

struct AppState {
    client: reqwest::Client,
    settings: Mutex<Settings>,
    /// Kill-Clips und Einrichtung teilen sich das Clip-Programm – nie gleichzeitig auslösen.
    capturing: AtomicBool,
    kill_clips: killclip::KillClips,
    recorder: recorder::Recorder,
    /// Taste für den Einrichtungs-Screenshot, solange die Einrichtung offen ist.
    calibration_shortcut: Mutex<Option<Shortcut>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsView {
    settings: Settings,
    autostart_available: bool,
    autostart_error: Option<String>,
    default_clip_dir: String,
    default_clipper_hotkey: String,
}

fn videos_dir(app: &AppHandle) -> PathBuf {
    app.path().video_dir().unwrap_or_else(|_| PathBuf::from(r"C:\Users\Public\Videos"))
}

fn settings_view(app: &AppHandle, settings: &Settings) -> SettingsView {
    SettingsView {
        settings: settings.clone(),
        autostart_available: autostart::AVAILABLE,
        autostart_error: autostart::status_error(settings.auto_start),
        default_clip_dir: clipper::default_clip_dir(settings.clipper, &videos_dir(app)).display().to_string(),
        default_clipper_hotkey: clipper::default_hotkey(settings.clipper),
    }
}

fn effective_clip_dir(app: &AppHandle, settings: &Settings) -> PathBuf {
    if settings.clip_dir.trim().is_empty() {
        clipper::default_clip_dir(settings.clipper, &videos_dir(app))
    } else {
        PathBuf::from(settings.clip_dir.trim())
    }
}

fn effective_clipper_hotkey(settings: &Settings) -> String {
    if settings.clipper_hotkey.trim().is_empty() {
        clipper::default_hotkey(settings.clipper)
    } else {
        settings.clipper_hotkey.trim().to_string()
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Self-Clip läuft, solange es als Clip-Programm gewählt ist (wie Instant Replay).
fn sync_recorder(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let settings = state.settings.lock().unwrap().clone();
        if settings.clipper == settings::Clipper::SelfClip && recorder::ffmpeg_path(&app).is_some_and(|p| p.exists()) {
            let _ = state.recorder.start(&app, &settings.self_clip);
        } else {
            state.recorder.stop();
        }
        let _ = app.emit("selfclip-status", state.recorder.status(&app));
    });
}

// ── Einstellungen ────────────────────────────────────────────────────

#[tauri::command]
fn get_settings(app: AppHandle, state: State<AppState>) -> SettingsView {
    settings_view(&app, &state.settings.lock().unwrap())
}

#[tauri::command]
fn save_settings(app: AppHandle, state: State<AppState>, mut settings: Settings) -> Result<SettingsView, String> {
    // Kill-Clip-Einrichtung und Self-Clip haben eigene Befehle und bleiben hier unberührt.
    {
        let current = state.settings.lock().unwrap();
        settings.kill_clip = current.kill_clip.clone();
        settings.self_clip = current.self_clip.clone();
    }
    if !settings.clipper_hotkey.trim().is_empty() {
        clipper::parse_hotkey(&settings.clipper_hotkey)?;
    }
    let previous_autostart = state.settings.lock().unwrap().auto_start;
    if settings.auto_start != previous_autostart {
        autostart::sync(settings.auto_start)?;
    }
    settings::save(&app, &settings)?;
    let clipper_changed = state.settings.lock().unwrap().clipper != settings.clipper;
    *state.settings.lock().unwrap() = settings.clone();
    if clipper_changed {
        sync_recorder(&app);
    }
    Ok(settings_view(&app, &settings))
}

/// Links (Credits) im Browser öffnen – nur http(s), nie Dateien oder Programme.
#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Ungültiger Link".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

// ── Self-Clip ────────────────────────────────────────────────────────

#[tauri::command]
fn selfclip_status(app: AppHandle, state: State<AppState>) -> recorder::Status {
    state.recorder.status(&app)
}

#[tauri::command]
async fn selfclip_install(app: AppHandle, state: State<'_, AppState>) -> Result<recorder::Status, String> {
    recorder::install(&app, &state.client).await?;
    sync_recorder(&app);
    Ok(state.recorder.status(&app))
}

#[tauri::command]
fn selfclip_save_config(app: AppHandle, state: State<AppState>, config: recorder::Config) -> Result<SettingsView, String> {
    let view = {
        let mut settings = state.settings.lock().unwrap();
        settings.self_clip = config;
        settings::save(&app, &settings)?;
        settings_view(&app, &settings)
    };
    sync_recorder(&app);
    Ok(view)
}

#[tauri::command]
fn selfclip_restart(app: AppHandle) {
    sync_recorder(&app);
}

// ── Kill-Clips ───────────────────────────────────────────────────────

/// Taste für den Einrichtungs-Screenshot (nur aktiv, solange die Einrichtung offen ist).
const CALIBRATION_HOTKEY: &str = "Ctrl+Alt+K";

#[tauri::command]
fn killclip_status(state: State<AppState>) -> killclip::Status {
    state.kill_clips.status()
}

#[tauri::command]
async fn killclip_start(app: AppHandle, state: State<'_, AppState>) -> Result<killclip::Status, String> {
    state.kill_clips.start(app.clone()).await
}

#[tauri::command]
fn killclip_stop(app: AppHandle, state: State<AppState>) {
    state.kill_clips.stop(&app);
}

#[tauri::command]
fn killclip_save_config(app: AppHandle, state: State<AppState>, config: killclip::Config) -> Result<SettingsView, String> {
    let mut settings = state.settings.lock().unwrap();
    let mut updated = settings.clone();
    updated.kill_clip = config;
    settings::save(&app, &updated)?;
    *settings = updated;
    Ok(settings_view(&app, &settings))
}

/// Einrichtung öffnen/schließen: solange offen, speichert Strg+Alt+K im Spiel das Replay mit dem Kill.
#[tauri::command]
fn killclip_calibration(app: AppHandle, state: State<AppState>, active: bool) -> Result<String, String> {
    let shortcuts = app.global_shortcut();
    let mut current = state.calibration_shortcut.lock().unwrap();
    if let Some(previous) = current.take() {
        let _ = shortcuts.unregister(previous);
    }
    if active {
        let shortcut: Shortcut = CALIBRATION_HOTKEY.parse().map_err(|_| "Ungültige Taste".to_string())?;
        shortcuts
            .register(shortcut)
            .map_err(|_| format!("„{CALIBRATION_HOTKEY}“ ist schon von einem anderen Programm belegt"))?;
        *current = Some(shortcut);
    }
    Ok(CALIBRATION_HOTKEY.into())
}

/// Einrichtungstaste im Spiel: Replay mit dem Kill speichern und im Einrichtungsfenster zeigen.
fn emit_reference_clip(app: &AppHandle) {
    let _ = app.emit("killclip-reference-clip", json!({ "saving": true }));
    let payload = match killclip::record_reference(app) {
        Ok((path, duration)) => json!({ "path": path.display().to_string(), "duration": duration }),
        Err(message) => json!({ "error": message }),
    };
    let _ = app.emit("killclip-reference-clip", payload);
}

#[tauri::command]
async fn killclip_saved_reference(app: AppHandle) -> Option<killclip::SavedReference> {
    tauri::async_runtime::spawn_blocking(move || killclip::saved_reference(&app)).await.ok().flatten()
}

#[tauri::command]
async fn killclip_analyze(app: AppHandle, path: String, at: f64) -> Result<killclip::reference::Reference, String> {
    let clip = PathBuf::from(path);
    if !clipper::is_video(&clip) || !clip.exists() {
        return Err("Clip nicht gefunden".into());
    }
    tauri::async_runtime::spawn_blocking(move || killclip::analyze_reference(&app, &clip, at)).await.map_err(|e| e.to_string())?
}

/// Ordner mit den fertigen Kill-Clips (bzw. die Datei darin) im Explorer zeigen.
#[tauri::command]
fn killclip_reveal(app: AppHandle, path: Option<String>) -> Result<(), String> {
    let dir = killclip::output_dir(&app);
    match path.map(PathBuf::from).filter(|p| p.starts_with(&dir) && p.exists()) {
        Some(file) => app.opener().reveal_item_in_dir(file).map_err(|e| e.to_string()),
        None => {
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            app.opener().open_path(dir.display().to_string(), None::<&str>).map_err(|e| e.to_string())
        }
    }
}

#[tauri::command]
async fn killclip_test_marker(app: AppHandle) -> Result<f32, String> {
    tauri::async_runtime::spawn_blocking(move || killclip::test_marker(&app)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn killclip_test_feed(app: AppHandle, region: killclip::screen::Region) -> Result<killclip::FeedTest, String> {
    tauri::async_runtime::spawn_blocking(move || killclip::test_killfeed(&app, region))
        .await
        .map_err(|e| e.to_string())?
}

pub fn run() {
    tauri::Builder::default()
        // Nur eine Instanz: sonst würden zwei Kill-Erkennungen gleichzeitig laufen.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main_window(app)))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let calibration = app
                        .try_state::<AppState>()
                        .is_some_and(|s| s.calibration_shortcut.lock().unwrap().is_some_and(|c| &c == shortcut));
                    if calibration {
                        let app = app.clone();
                        tauri::async_runtime::spawn_blocking(move || emit_reference_clip(&app));
                    }
                })
                .build(),
        )
        .setup(|app| {
            let handle = app.handle().clone();
            let settings = settings::load(&handle);
            if let Err(error) = autostart::sync(settings.auto_start) {
                eprintln!("{error}");
            }
            let self_clip = settings.clipper == settings::Clipper::SelfClip;
            app.manage(AppState {
                client: reqwest::Client::builder()
                    .user_agent(concat!("lspd-killclips/", env!("CARGO_PKG_VERSION")))
                    .build()
                    .expect("HTTP-Client"),
                settings: Mutex::new(settings),
                capturing: AtomicBool::new(false),
                kill_clips: killclip::KillClips::default(),
                recorder: recorder::Recorder::default(),
                calibration_shortcut: Mutex::default(),
            });

            if self_clip {
                sync_recorder(&handle);
            }

            // Im Hintergrund weiterlaufen, damit die Erkennung auch mit geschlossenem Fenster greift.
            let open = MenuItem::with_id(app, "open", "Öffnen", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Beenden", true, None::<&str>)?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().expect("App-Icon fehlt"))
                .tooltip(APP_NAME)
                .menu(&Menu::with_items(app, &[&open, &quit])?)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            open_external,
            selfclip_status,
            selfclip_install,
            selfclip_save_config,
            selfclip_restart,
            killclip_status,
            killclip_start,
            killclip_stop,
            killclip_save_config,
            killclip_calibration,
            killclip_analyze,
            killclip_saved_reference,
            killclip_reveal,
            killclip_test_feed,
            killclip_test_marker,
        ])
        .build(tauri::generate_context!())
        .expect("LSPD Kill-Clips konnte nicht gestartet werden")
        .run(|_, _| {});
}
