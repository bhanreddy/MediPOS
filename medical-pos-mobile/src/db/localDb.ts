/**
 * localDb.ts — Singleton expo-sqlite database accessor
 *
 * Uses expo-sqlite (synchronous JSI bindings in Expo SDK 54+).
 * The DB file is stored in the app's sandboxed document directory automatically.
 */
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'medpos_local.db';

let _db: SQLite.SQLiteDatabase | null = null;

/**
 * Returns the singleton SQLite database instance.
 * Opens the DB on first call; subsequent calls return the cached handle.
 */
export function getLocalDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync(DB_NAME);
    // Enable WAL mode for better concurrent read/write performance
    _db.execSync('PRAGMA journal_mode = WAL;');
    // Enable foreign keys
    _db.execSync('PRAGMA foreign_keys = ON;');
  }
  return _db;
}

/**
 * Close the database connection (useful during logout / clinic switch).
 */
export function closeLocalDb(): void {
  if (_db) {
    _db.closeSync();
    _db = null;
  }
}
