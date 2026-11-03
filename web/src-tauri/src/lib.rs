mod commands;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().unwrap();
            let db_path = app_data_dir.join("medical_pos.db");

            let (_, _child) = app.shell()
                .sidecar("server")
                .unwrap()
                .env("LOCAL_DB_PATH", db_path.to_str().unwrap())
                .env("PORT", "3712")
                .spawn()
                .unwrap();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::health_check,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run MedPOS Pro desktop runtime");
}
