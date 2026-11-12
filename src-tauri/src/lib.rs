use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{
    ipc::{InvokeBody, Response},
    Manager,
};
use tauri_plugin_sql::{Migration, MigrationKind};

pub const DB_URL: &str = "sqlite:attractaris.db";

/// Folder where takes are stored: <Music>/Attractaris
fn recordings_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().audio_dir().map_err(|e| e.to_string())?.join("Attractaris");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Only allow reading/deleting files that live inside the recordings folder.
fn checked_path(app: &tauri::AppHandle, path: &str) -> Result<PathBuf, String> {
    let dir = recordings_dir(app)?.canonicalize().map_err(|e| e.to_string())?;
    let file = Path::new(path).canonicalize().map_err(|e| e.to_string())?;
    if file.starts_with(&dir) {
        Ok(file)
    } else {
        Err("path is outside the recordings folder".into())
    }
}

/// Saves raw audio bytes (the invoke body) and returns the file path.
/// The file extension comes from the `x-ext` header (defaults to "webm").
#[tauri::command]
fn save_recording(app: tauri::AppHandle, request: tauri::ipc::Request) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw audio bytes".into());
    };
    let ext: String = request
        .headers()
        .get("x-ext")
        .and_then(|v| v.to_str().ok())
        .filter(|e| !e.is_empty() && e.chars().all(|c| c.is_ascii_alphanumeric()))
        .unwrap_or("webm")
        .to_string();
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let path = recordings_dir(&app)?.join(format!("take-{ms}.{ext}"));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn read_recording(app: tauri::AppHandle, path: String) -> Result<Response, String> {
    let file = checked_path(&app, &path)?;
    std::fs::read(file).map(Response::new).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_recording(app: tauri::AppHandle, path: String) -> Result<(), String> {
    match checked_path(&app, &path) {
        Ok(file) => std::fs::remove_file(file).map_err(|e| e.to_string()),
        // Already gone from disk: nothing to delete.
        Err(_) if !Path::new(&path).exists() => Ok(()),
        Err(e) => Err(e),
    }
}

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create recordings and settings",
        sql: "CREATE TABLE recordings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                mime TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
              );
              CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
              );",
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            save_recording,
            read_recording,
            delete_recording
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
