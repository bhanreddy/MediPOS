import api from '../lib/api';
import toast from 'react-hot-toast';

/**
 * PHASE 10: BACKUP & RESTORE SERVICE
 * 
 * Direct API-backed cloud backup and restore implementation (Option A).
 * Communicates with the Express backend REST endpoints.
 */

export const BackupService = {

    /**
     * EXPORT: Fetch all clinic data from backend and return as JSON Blob
     */
    async exportData(): Promise<Blob> {
        console.log("[Backup] Starting Cloud Export...");
        try {
            const res = await api.get('/backup/export');
            const data = res.data?.data;
            if (!data) throw new Error("No data returned from backend export.");

            if (res.data.complete === false) toast.error(`Partial backup: database migration is needed for ${res.data.missingTables.join(', ')}.`);
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
            console.log("[Backup] Export Successful");
            return blob;
        } catch (error) {
            console.error("[Backup] Export Failed", error);
            throw new Error(`Export Failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    },

    /**
     * RESTORE: Accept uploaded JSON blob, parse, and upload to import endpoint
     */
    async restoreData(file: File): Promise<void> {
        console.log("[Backup] Starting Cloud Restore...");
        if (!file) throw new Error("No backup file provided");

        try {
            const text = await file.text();
            const parsed = JSON.parse(text);

            const res = await api.post('/backup/import', { data: parsed.version === 2 ? parsed.data : parsed });
            if (!res.data?.success) {
                throw new Error(res.data?.error || "Restore rejected by backend.");
            }

            console.log("[Backup] Restore Successful. Reloading application...");
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
        const fileName = `MedicalPOS_Cloud_Backup_${timestamp}.json`;
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
