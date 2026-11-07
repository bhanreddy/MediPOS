// Exercise the exact native SQLite module without requiring a packaged Tauri binary.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const project=fs.mkdtempSync(path.join(os.tmpdir(),'medical-outbox-test-'));fs.mkdirSync(path.join(project,'src'));
fs.writeFileSync(path.join(project,'Cargo.toml'),'[package]\nname="medical-desktop-outbox-verification"\nversion="0.1.0"\nedition="2021"\n[dependencies]\nrusqlite={version="0.32.1",features=["bundled"]}\nserde={version="1",features=["derive"]}\nserde_json="1"\n');
fs.writeFileSync(path.join(project,'src/lib.rs'),`#[path=${JSON.stringify(path.resolve(__dirname,'../../web/src-tauri/src/offline_outbox.rs'))}]\npub mod offline_outbox;\n`);
const result=spawnSync('cargo',['test','--manifest-path',path.join(project,'Cargo.toml')],{stdio:'inherit',env:{...process.env,CARGO_TARGET_DIR:path.join(os.tmpdir(),'medical-outbox-cargo-target')}});
if(result.error)throw result.error;process.exitCode=result.status||0;
