use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
    pub offline_first: bool,
}

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        name: "MedPOS Pro",
        version: env!("CARGO_PKG_VERSION"),
        offline_first: true,
    }
}

#[tauri::command]
pub fn health_check() -> &'static str {
    "ok"
}
