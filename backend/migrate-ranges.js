/**
 * Migration Script: Apply New Reference Range Structure to Old Data
 * 
 * This script updates all existing ReportTemplates and ReportInstances 
 * to include the 'ruleType' field, migrating from the legacy 
 * 'isGenderSpecific' boolean structure.
 * 
 * Run: node backend/migrate-ranges.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const ReportTemplate = require('./models/ReportTemplate');
const ReportInstance = require('./models/ReportInstance');

async function migrate() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/laboratory-management');
    console.log('Connected successfully.\n');

    // 1. Migrate Report Templates
    console.log('--- Migrating ReportTemplates ---');
    const templates = await ReportTemplate.find({});
    let tCount = 0;
    
    for (const template of templates) {
      let modified = false;
      if (template.sections) {
        template.sections.forEach(sec => {
          if (sec.parameters) {
            sec.parameters.forEach(param => {
              if (param.isGenderSpecific === true && param.ruleType !== 'GENDER_SPECIFIC') {
                param.ruleType = 'GENDER_SPECIFIC';
                modified = true;
              } else if (!param.ruleType) {
                param.ruleType = 'MIN_MAX';
                modified = true;
              }
            });
          }
        });
      }
      
      if (modified) {
        await template.save();
        tCount++;
        process.stdout.write('.');
      }
    }
    console.log(`\nUpdated ${tCount} templates.\n`);

    // 2. Migrate Report Instances (Saved Reports)
    console.log('--- Migrating ReportInstances ---');
    const reports = await ReportInstance.find({});
    let rCount = 0;

    for (const report of reports) {
      let modified = false;
      if (report.sections) {
        report.sections.forEach(sec => {
          if (sec.parameters) {
            sec.parameters.forEach(param => {
              if (param.isGenderSpecific === true && param.ruleType !== 'GENDER_SPECIFIC') {
                param.ruleType = 'GENDER_SPECIFIC';
                modified = true;
              } else if (!param.ruleType) {
                param.ruleType = 'MIN_MAX';
                modified = true;
              }
            });
          }
        });
      }

      if (modified) {
        await report.save();
        rCount++;
        process.stdout.write('.');
      }
    }
    console.log(`\nUpdated ${rCount} reports.\n`);

    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
