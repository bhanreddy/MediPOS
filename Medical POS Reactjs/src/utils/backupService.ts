import { db } from '../db/index';
import { exportDB, importDB } from "dexie-export-import";

/**
 * PHASE 10: BACKUP & RESTORE SERVICE
 * 
 * Rules:
 * 1. Manual Only: Operator must trigger export/import.
 * 2. Offline Safe: No cloud/internet dependency.
 * 3. File Based: Data travels via .json or .dexie files.
 */

export const BackupService = {

    /**
     * EXPORT: DB -> Blob (JSON)
     */
    async exportData(): Promise<Blob> {
        console.log("[Backup] Starting Export...");
        try {
            // dexie-export-import handles the heavy lifting
            const blob = await exportDB(db, {
                prettyJson: true,
                // We exclude auth_sessions to avoid hijacking if backup is stolen
                filter: (table: string, _value: any, _key: any) => table !== 'auth_sessions'
            });
            console.log("[Backup] Export Successful");
            return blob;
        } catch (error) {
            console.error("[Backup] Export Failed", error);
            throw new Error(`Export Failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    },

    /**
     * RESTORE: Blob -> DB
     * WARNING: This overwrites local data.
     */
    async restoreData(blob: Blob): Promise<void> {
        console.log("[Backup] Starting Restore...");

        // Safety check: confirm blob exists
        if (!blob) throw new Error("No backup file provided");

        try {
            // We use importDB which takes a Dexie instance or name.
            // importDB(db, ...) will clear existing tables and refill.
            await importDB(blob);

            console.log("[Backup] Restore Successful. Reloading application...");
            // Forcing reload is the safest way to reset all service states and Redux
            window.location.reload();
        } catch (error) {
            console.error("[Backup] Restore Failed", error);
            throw new Error(`Restore Failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    },

    /**
     * Utility for Browser Download
     */
    downloadBackup(blob: Blob) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `MedicalPOS_Backup_${timestamp}.json`;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};
