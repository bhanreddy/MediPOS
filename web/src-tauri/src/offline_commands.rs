use crate::offline_outbox::{self, Command, Entry, Scope, Summary};
use rusqlite::Connection;
use serde_json::Value;
use std::path::PathBuf;
use tauri::{Manager,State};
pub struct OutboxPath(pub PathBuf);
fn open(path:&OutboxPath)->Result<Connection,String>{let db=Connection::open(&path.0).map_err(|e|e.to_string())?;offline_outbox::initialize(&db)?;Ok(db)}
pub fn setup(app:&mut tauri::App)->Result<(),Box<dyn std::error::Error>>{let directory=app.path().app_data_dir()?;std::fs::create_dir_all(&directory)?;let path=OutboxPath(directory.join("offline_commands.db"));open(&path).map_err(std::io::Error::other)?;app.manage(path);Ok(())}
#[tauri::command]
pub fn queue_offline_command(path:State<'_,OutboxPath>,scope:Scope,command:Command)->Result<(),String>{offline_outbox::queue(&mut open(&path)?,&scope,&command)}
#[tauri::command]
pub fn list_offline_commands(path:State<'_,OutboxPath>,scope:Scope,pending_only:bool)->Result<Vec<Entry>,String>{offline_outbox::list(&open(&path)?,&scope,pending_only)}
#[tauri::command]
pub fn record_offline_result(path:State<'_,OutboxPath>,scope:Scope,command_id:String,result:Value)->Result<(),String>{offline_outbox::record_result(&open(&path)?,&scope,&command_id,&result)}
#[tauri::command]
pub fn offline_queue_summary(path:State<'_,OutboxPath>,scope:Scope)->Result<Summary,String>{offline_outbox::summary(&open(&path)?,&scope)}
