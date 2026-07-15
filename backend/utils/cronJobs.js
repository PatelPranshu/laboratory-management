const cron = require('node-cron');
const mongoose = require('mongoose');
const User = require('../models/User');
const ExportJob = require('../models/ExportJob');
const { processExports } = require('./exportWorker');
const fs = require('fs');

function initCronJobs() {
    // Run every day at 3:00 AM server time
    cron.schedule('0 3 * * *', async () => {
        console.log('[CRON] Starting daily automated deletion sweep...');
        try {
            // Find 30 days ago
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            // Find all Admins (Labs) that were soft deleted more than 30 days ago
            const deletedAdmins = await User.find({
                role: 'Admin',
                isDeleted: true,
                deletedAt: { $lte: thirtyDaysAgo }
            }).select('_id');

            if (deletedAdmins.length === 0) {
                console.log('[CRON] No labs found for permanent deletion today.');
                return;
            }

            console.log(`[CRON] Found ${deletedAdmins.length} lab(s) to permanently delete.`);

            for (const admin of deletedAdmins) {
                const adminId = admin._id;
                const session = await mongoose.startSession();
                session.startTransaction();

                try {
                    // Cascade delete: First, delete all staff members associated with this admin
                    await User.deleteMany({ parentAdminId: adminId }, { session });
                    
                    // Second, delete the admin account itself
                    await User.deleteOne({ _id: adminId }, { session });

                    // Note: If there are other associated collections (like Patients, Reports, PrintSettings)
                    // they should ideally be deleted here as well to ensure full "Right to be Forgotten".
                    const Patient = require('../models/Patient');
                    if (Patient) await Patient.deleteMany({ parentAdminId: adminId }, { session });

                    const ReportInstance = require('../models/ReportInstance');
                    if (ReportInstance) await ReportInstance.deleteMany({ parentAdminId: adminId }, { session });

                    const PrintSettings = require('../models/PrintSettings');
                    if (PrintSettings) await PrintSettings.deleteMany({ doctorId: adminId }, { session });

                    const Template = require('../models/Template');
                    if (Template) await Template.deleteMany({ doctorId: adminId }, { session });
                    
                    const Notification = require('../models/Notification');
                    if (Notification) await Notification.deleteMany({ 
                        $or: [{ userId: adminId }, { parentAdminId: adminId }]
                    }, { session });

                    await session.commitTransaction();
                    session.endSession();
                    console.log(`[CRON] Successfully hard-deleted Lab ${adminId} and all associated data.`);
                } catch (err) {
                    await session.abortTransaction();
                    session.endSession();
                    console.error(`[CRON] Error hard-deleting Lab ${adminId}:`, err);
                }
            }
            
            console.log('[CRON] Daily automated deletion sweep completed.');
        } catch (error) {
            console.error('[CRON] Fatal error during automated deletion sweep:', error);
        }
    });

    console.log('[CRON] Scheduled daily deletion sweep for 3:00 AM.');

    // Run export processor every 1 minute
    cron.schedule('* * * * *', async () => {
        await processExports();
    });
    console.log('[CRON] Scheduled export worker every 1 minute.');

    // Run export cleanup every day at 4:00 AM (to delete expired Excel files that Mongoose TTL index doesn't delete from disk)
    cron.schedule('0 4 * * *', async () => {
        console.log('[CRON] Starting expired export file cleanup...');
        try {
            // Find all jobs that have expired (Mongoose TTL might have deleted the document, so we can't just query ExportJob)
            // Actually, if we query before Mongoose deletes them, we can get the paths. Or we just scan the directory.
            // Scanning the directory is safer.
            const EXPORTS_DIR = require('path').join(__dirname, '..', 'exports');
            if (fs.existsSync(EXPORTS_DIR)) {
                const files = fs.readdirSync(EXPORTS_DIR);
                const now = Date.now();
                const sevenDays = 7 * 24 * 60 * 60 * 1000;
                let deletedCount = 0;
                
                files.forEach(file => {
                    const filePath = require('path').join(EXPORTS_DIR, file);
                    const stats = fs.statSync(filePath);
                    if (now - stats.mtimeMs > sevenDays) {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    }
                });
                console.log(`[CRON] Cleaned up ${deletedCount} expired export files.`);
            }
        } catch (error) {
            console.error('[CRON] Error during export file cleanup:', error);
        }
    });
}

module.exports = initCronJobs;
