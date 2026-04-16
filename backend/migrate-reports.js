const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '.env') });

const ReportInstance = require('./models/ReportInstance');
const ReportTemplate = require('./models/ReportTemplate');

async function migrate() {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error('MONGO_URI not found in .env file');
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected successfully.');

        // Find reports that have sections missing templateId
        // Specifically look for reports where at least one section has no templateId
        const reports = await ReportInstance.find({
            'sections.templateId': { $exists: false }
        });

        console.log(`Found ${reports.length} reports requiring migration.`);

        let updatedCount = 0;

        for (const report of reports) {
            console.log(`Processing report ${report._id} (${report.templateIds.length} templates)...`);
            let modified = false;

            if (report.templateIds && report.templateIds.length === 1) {
                // Scenario 1: Only one template ID, apply to all sections
                const singleTid = report.templateIds[0];
                report.sections.forEach(section => {
                    if (!section.templateId) {
                        section.templateId = singleTid;
                        modified = true;
                    }
                });
            } else if (report.templateIds && report.templateIds.length > 1) {
                // Scenario 2: Multiple template IDs, match by sectionName
                const templates = await ReportTemplate.find({ _id: { $in: report.templateIds } });
                
                // Map section names to their template IDs
                const nameToTidMap = {};
                templates.forEach(template => {
                    template.sections.forEach(ts => {
                        nameToTidMap[ts.sectionName] = template._id;
                    });
                });

                report.sections.forEach(section => {
                    if (!section.templateId && nameToTidMap[section.sectionName]) {
                        section.templateId = nameToTidMap[section.sectionName];
                        modified = true;
                    }
                });
            }

            if (modified) {
                await report.save();
                updatedCount++;
                console.log(`Successfully updated report ${report._id}.`);
            } else {
                console.log(`No changes made for report ${report._id} (could not find matching templateId).`);
            }
        }

        console.log('-------------------------------------------');
        console.log(`Migration completed. Total reports updated: ${updatedCount}/${reports.length}`);
        console.log('-------------------------------------------');

        await mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error('Migration failed with error:');
        console.error(err);
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
        }
        process.exit(1);
    }
}

migrate();
