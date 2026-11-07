//! Local-only, durable command outbox. No cloud credentials or business-table writes.
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Clone, Deserialize, Serialize)]
pub struct Scope { pub user_id: String, pub clinic_id: String }
#[derive(Clone, Deserialize, Serialize)]
pub struct Command {
    pub command_id: String, pub device_id: String,
    #[serde(rename = "type")] pub command_type: String,
    pub payload: Value,
}
#[derive(Serialize)]
pub struct Entry { #[serde(flatten)] pub command: Command, pub status: String, pub result: Option<Value>, pub attempts: i64 }
#[derive(Serialize)]
pub struct Summary { pub pending: i64, pub conflicts: i64, pub rejected: i64, pub applied: i64 }
fn now() -> i64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64 }
fn id_valid(id: &str) -> bool { id.len()==36 && id.chars().enumerate().all(|(i,c)| if [8,13,18,23].contains(&i) { c=='-' } else { c.is_ascii_hexdigit() }) }
fn validate(scope: &Scope, command: Option<&Command>) -> Result<(), String> {
    if !id_valid(&scope.user_id) || !id_valid(&scope.clinic_id) { return Err("A saved user and clinic are required".into()); }
    if let Some(c)=command {
        if !id_valid(&c.command_id) || c.device_id.is_empty() || c.device_id.len()>100 || !["SALE","SALE_RETURN"].contains(&c.command_type.as_str()) || !c.payload.is_object() || c.payload.to_string().len()>1_000_000 { return Err("Invalid offline command".into()); }
    }
    Ok(())
}
pub fn initialize(db: &Connection) -> Result<(),String> {
    db.busy_timeout(Duration::from_secs(5)).map_err(|e|e.to_string())?;
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS offline_command_outbox(
       command_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, clinic_id TEXT NOT NULL,
       device_id TEXT NOT NULL, command_type TEXT NOT NULL, payload TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPLIED','CONFLICT','REJECTED','RESOLVED')),
       result TEXT, attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, superseded_by TEXT);
      CREATE INDEX IF NOT EXISTS outbox_scope_status ON offline_command_outbox(user_id,clinic_id,status,created_at);").map_err(|e|e.to_string())
}
pub fn queue(db:&mut Connection,scope:&Scope,command:&Command) -> Result<(),String> {
    validate(scope,Some(command))?;
    let tx=db.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e|e.to_string())?;
    let previous:Option<(String,String,String,String)>=tx.query_row("SELECT user_id,clinic_id,command_type,payload FROM offline_command_outbox WHERE command_id=?",[&command.command_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(|e|e.to_string())?;
    let payload=command.payload.to_string();
    if let Some((user,clinic,kind,old))=previous {
        if user!=scope.user_id || clinic!=scope.clinic_id || kind!=command.command_type || old!=payload { return Err("Command identity already belongs to different details".into()); }
    } else {
        tx.execute("INSERT INTO offline_command_outbox(command_id,user_id,clinic_id,device_id,command_type,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",params![command.command_id,scope.user_id,scope.clinic_id,command.device_id,command.command_type,payload,now(),now()]).map_err(|e|e.to_string())?;
    }
    tx.commit().map_err(|e|e.to_string())
}
pub fn list(db:&Connection,scope:&Scope,pending_only:bool) -> Result<Vec<Entry>,String> {
    validate(scope,None)?;
    let mut stmt=db.prepare("SELECT command_id,device_id,command_type,payload,status,result,attempts FROM offline_command_outbox WHERE user_id=? AND clinic_id=? AND (?=0 OR status='PENDING') ORDER BY created_at,command_id LIMIT 100").map_err(|e|e.to_string())?;
    let rows=stmt.query_map(params![scope.user_id,scope.clinic_id,pending_only as i32],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,String>(4)?,r.get::<_,Option<String>>(5)?,r.get::<_,i64>(6)?))).map_err(|e|e.to_string())?;
    rows.map(|row|{let(id,device,kind,payload,status,result,attempts)=row.map_err(|e|e.to_string())?;
      Ok(Entry{command:Command{command_id:id,device_id:device,command_type:kind,payload:serde_json::from_str(&payload).map_err(|e|e.to_string())?},status,result:result.map(|s|serde_json::from_str(&s)).transpose().map_err(|e|e.to_string())?,attempts})}).collect()
}
pub fn record_result(db:&Connection,scope:&Scope,id:&str,result:&Value) -> Result<(),String> {
    validate(scope,None)?;
    if result.get("command_id").and_then(Value::as_str)!=Some(id) { return Err("Receipt identity does not match the pending command".into()); }
    let status=result.get("status").and_then(Value::as_str).unwrap_or("");
    if !["APPLIED","CONFLICT","REJECTED","PENDING"].contains(&status) { return Err("Unrecognized synchronization receipt".into()); }
    let changed=db.execute("UPDATE offline_command_outbox SET status=?,result=?,attempts=attempts+1,updated_at=? WHERE command_id=? AND user_id=? AND clinic_id=? AND status='PENDING'",params![status,result.to_string(),now(),id,scope.user_id,scope.clinic_id]).map_err(|e|e.to_string())?;
    if changed!=1 { return Err("Pending command not found in this account".into()); } Ok(())
}
pub fn summary(db:&Connection,scope:&Scope) -> Result<Summary,String> {
    validate(scope,None)?;
    db.query_row("SELECT COALESCE(SUM(status='PENDING'),0),COALESCE(SUM(status='CONFLICT'),0),COALESCE(SUM(status='REJECTED'),0),COALESCE(SUM(status='APPLIED'),0) FROM offline_command_outbox WHERE user_id=? AND clinic_id=?",params![scope.user_id,scope.clinic_id],|r|Ok(Summary{pending:r.get(0)?,conflicts:r.get(1)?,rejected:r.get(2)?,applied:r.get(3)?})).map_err(|e|e.to_string())
}
#[cfg(test)] mod tests {
 use super::*;
 fn scope()->Scope{Scope{user_id:"11111111-1111-4111-8111-111111111111".into(),clinic_id:"22222222-2222-4222-8222-222222222222".into()}}
 fn command()->Command{Command{command_id:"33333333-3333-4333-8333-333333333333".into(),device_id:"qa".into(),command_type:"SALE".into(),payload:serde_json::json!({"quantity":1})}}
 fn db()->Connection{let db=Connection::open_in_memory().unwrap();initialize(&db).unwrap();db}
 #[test] fn duplicate_enqueue_is_idempotent(){let mut d=db();queue(&mut d,&scope(),&command()).unwrap();queue(&mut d,&scope(),&command()).unwrap();assert_eq!(summary(&d,&scope()).unwrap().pending,1);}
 #[test] fn changed_payload_cannot_reuse_identity(){let mut d=db();let mut c=command();queue(&mut d,&scope(),&c).unwrap();c.payload=serde_json::json!({"quantity":2});assert!(queue(&mut d,&scope(),&c).is_err());}
 #[test] fn failed_network_keeps_pending_payload(){let mut d=db();let c=command();queue(&mut d,&scope(),&c).unwrap();record_result(&d,&scope(),&c.command_id,&serde_json::json!({"command_id":c.command_id,"status":"PENDING","error":"network"})).unwrap();assert_eq!(list(&d,&scope(),true).unwrap()[0].command.payload,c.payload);}
 #[test] fn foreign_scope_cannot_read_or_acknowledge(){let mut d=db();let c=command();queue(&mut d,&scope(),&c).unwrap();let mut other=scope();other.user_id="44444444-4444-4444-8444-444444444444".into();assert_eq!(list(&d,&other,false).unwrap().len(),0);assert!(record_result(&d,&other,&c.command_id,&serde_json::json!({"command_id":c.command_id,"status":"APPLIED"})).is_err());}
 #[test] fn conflicts_remain_visible_and_are_not_retried_silently(){let mut d=db();let c=command();queue(&mut d,&scope(),&c).unwrap();record_result(&d,&scope(),&c.command_id,&serde_json::json!({"command_id":c.command_id,"status":"CONFLICT"})).unwrap();assert_eq!(summary(&d,&scope()).unwrap().conflicts,1);assert_eq!(list(&d,&scope(),true).unwrap().len(),0);assert_eq!(list(&d,&scope(),false).unwrap()[0].command.payload,c.payload);}
 #[test] fn arbitrary_http_success_is_not_an_acknowledgement(){let mut d=db();let c=command();queue(&mut d,&scope(),&c).unwrap();assert!(record_result(&d,&scope(),&c.command_id,&serde_json::json!({"success":true})).is_err());assert_eq!(summary(&d,&scope()).unwrap().pending,1);}
 #[test]
 fn restored_wal_snapshot_retains_pending_identity_and_acknowledges_once() {
     let directory = std::env::temp_dir().join(format!("medical-outbox-restore-{}-{}", std::process::id(), now()));
     std::fs::create_dir(&directory).unwrap();
     let source = directory.join("outbox.db");
     let snapshot = directory.join("restored.db");
     let mut db = Connection::open(source).unwrap();
     initialize(&db).unwrap();
     let scope = scope();
     let command = command();
     queue(&mut db, &scope, &command).unwrap();
     db.execute("VACUUM INTO ?1", [snapshot.to_str().unwrap()]).unwrap();
     drop(db);

     let mut restored = Connection::open(snapshot).unwrap();
     initialize(&restored).unwrap();
     queue(&mut restored, &scope, &command).unwrap();
     let pending = list(&restored, &scope, true).unwrap();
     assert_eq!(pending.len(), 1);
     assert_eq!(pending[0].command.command_id, command.command_id);
     assert_eq!(pending[0].command.payload, command.payload);
     let receipt = serde_json::json!({"command_id": command.command_id, "status": "APPLIED"});
     record_result(&restored, &scope, &command.command_id, &receipt).unwrap();
     assert!(record_result(&restored, &scope, &command.command_id, &receipt).is_err());
     assert_eq!(summary(&restored, &scope).unwrap().applied, 1);
     drop(restored);
     std::fs::remove_dir_all(directory).unwrap();
 }

}
