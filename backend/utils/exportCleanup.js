const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const EXPORTS_DIR = path.join(__dirname, '..', 'exports');
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000; // 48 hours

// Ensure exports directory exists
if (!fs.existsSync(EXPORTS_DIR)) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

/**
 * Calculates current disk storage usage percentage.
 * Uses fs.statfsSync (supported in Node.js 18.15+ / 19.6+).
 * @param {string} dirPath 
 * @returns {number} Storage usage percentage (0-100)
 */
function getDiskStorageUsage(dirPath = EXPORTS_DIR) {
  try {
    if (fs.existsSync(dirPath) && typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync(dirPath);
      if (stats.blocks > 0) {
        const usedBlocks = stats.blocks - stats.bavail;
        return (usedBlocks / stats.blocks) * 100;
      }
    }
  } catch (err) {
    // Fail-safe if statfs is unavailable or unsupported on the OS
  }
  return 0;
}

/**
 * Sweeps the exports folder to delete:
 * 1. .xlsx export files older than 48 hours.
 * 2. ALL .xlsx export files if server storage reaches or exceeds 90%.
 * @param {boolean} forcePurge - Force deletion of all export files regardless of age
 */
function cleanupExportFiles(forcePurge = false) {
  try {
    if (!fs.existsSync(EXPORTS_DIR)) return;

    const files = fs.readdirSync(EXPORTS_DIR);
    if (files.length === 0) return;

    const now = Date.now();
    const diskUsage = getDiskStorageUsage();
    const emergencyStoragePurge = forcePurge || diskUsage >= 90;

    if (emergencyStoragePurge) {
      logger.warn(`[STORAGE CLEANUP] High disk storage detected (${Math.round(diskUsage)}% >= 90%). Emergency purging export .xlsx files to free server storage...`);
    }

    let deletedCount = 0;

    files.forEach(file => {
      if (!file.endsWith('.xlsx')) return;

      const filePath = path.join(EXPORTS_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        const ageMs = now - stats.mtimeMs;

        // Delete if file is older than 48 hours OR if emergency 90% storage purge is triggered
        if (ageMs >= FORTY_EIGHT_HOURS_MS || emergencyStoragePurge) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (fileErr) {
        // Ignore file lock errors
      }
    });

    if (deletedCount > 0) {
      logger.info(`[EXPORT CLEANUP] Successfully deleted ${deletedCount} .xlsx export file(s). (Reason: ${emergencyStoragePurge ? '90%+ storage emergency purge' : '48-hour expiration'})`);
    }
  } catch (error) {
    console.error('[EXPORT CLEANUP] Error during export file cleanup:', error.message);
  }
}

module.exports = {
  cleanupExportFiles,
  getDiskStorageUsage,
  EXPORTS_DIR
};
