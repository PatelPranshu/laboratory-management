const os = require('os');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const ExportJob = require('../models/ExportJob');
const User = require('../models/User');
const Patient = require('../models/Patient');
const ReportInstance = require('../models/ReportInstance');
const { sendDataExportReadyEmail } = require('../services/emailService');

const EXPORTS_DIR = path.join(__dirname, '..', 'exports');

// Ensure exports directory exists
if (!fs.existsSync(EXPORTS_DIR)) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------
// Advanced Resource Throttling Logic (Phase 2 Enterprise Portability)
// ---------------------------------------------------------------------
const MAX_CPU_THRESHOLD = 70; // Stop process if CPU > 70%
const MAX_MEM_THRESHOLD = 95; // Stop process if RAM > 95% (OS caches can take up to 90%)
const RESUME_CPU_THRESHOLD = 20; // Resume process if CPU drops to 20%
const RESUME_MEM_THRESHOLD = 90; // Resume process if RAM drops to 90%
const BATCH_SIZE = 100; // Yield to event loop every 100 rows to ensure lowest priority

// Cross-platform function to measure CPU usage asynchronously
function getCPUUsage() {
    return new Promise(resolve => {
        const cpus = os.cpus();
        let startIdle = 0, startTotal = 0;
        for (let cpu of cpus) {
            startIdle += cpu.times.idle;
            for (let type in cpu.times) startTotal += cpu.times[type];
        }

        setTimeout(() => {
            const endCpus = os.cpus();
            let endIdle = 0, endTotal = 0;
            for (let cpu of endCpus) {
                endIdle += cpu.times.idle;
                for (let type in cpu.times) endTotal += cpu.times[type];
            }
            const idleDifference = endIdle - startIdle;
            const totalDifference = endTotal - startTotal;
            const percentageCPU = 100 - ~~(100 * idleDifference / totalDifference);
            resolve(percentageCPU);
        }, 100);
    });
}

function getMemoryUsage() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    return (totalMem - freeMem) / totalMem * 100;
}

const yieldToEventLoop = () => new Promise(resolve => setImmediate(resolve));

async function applyThrottle() {
  let cpu = await getCPUUsage();
  let mem = getMemoryUsage();
  
  if (cpu > MAX_CPU_THRESHOLD || mem > MAX_MEM_THRESHOLD) {
    console.log(`[EXPORT WORKER] High traffic detected (CPU: ${cpu}%, RAM: ${Math.round(mem)}%). Pausing export process...`);
    
    // Hold the request until traffic becomes low
    while (true) {
       await new Promise(resolve => setTimeout(resolve, 5000)); // check every 5s
       cpu = await getCPUUsage();
       mem = getMemoryUsage();
       if (cpu <= RESUME_CPU_THRESHOLD && mem <= RESUME_MEM_THRESHOLD) {
           console.log(`[EXPORT WORKER] Traffic subsided (CPU: ${cpu}%, RAM: ${Math.round(mem)}%). Resuming export process...`);
           break;
       }
    }
  }
}
// ---------------------------------------------------------------------

const processExports = async () => {
  try {
    // Initial check before picking up job
    let initialCpu = await getCPUUsage();
    let initialMem = getMemoryUsage();
    if (initialCpu > MAX_CPU_THRESHOLD || initialMem > MAX_MEM_THRESHOLD) {
      console.log('[EXPORT WORKER] Server load is too high initially. Deferring background export processing.');
      return;
    }

    // Find one pending job
    const job = await ExportJob.findOneAndUpdate(
      { status: 'PENDING' },
      { $set: { status: 'PROCESSING' } },
      { new: true, sort: { createdAt: 1 } }
    );

    if (!job) return; // No jobs to process

    console.log(`[EXPORT WORKER] Starting processing for job ${job._id} (Lab: ${job.labId})`);

    const admin = await User.findById(job.labId);
    if (!admin) {
      await ExportJob.findByIdAndUpdate(job._id, { status: 'FAILED', errorReason: 'Admin user not found' });
      return;
    }

    // Prepare paths
    const patientFileName = `patients_export_${job._id}.xlsx`;
    const reportFileName = `reports_export_${job._id}.xlsx`;
    const patientFilePath = path.join(EXPORTS_DIR, patientFileName);
    const reportFilePath = path.join(EXPORTS_DIR, reportFileName);
    const filePaths = [patientFilePath, reportFilePath];

    // Generate Patients Excel
    const patientWorkbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: patientFilePath });
    const patientSheet = patientWorkbook.addWorksheet('Patients');
    patientSheet.columns = [
      { header: 'ID', key: '_id' },
      { header: 'Title', key: 'title' },
      { header: 'Name', key: 'name' },
      { header: 'Gender', key: 'gender' },
      { header: 'Age', key: 'age' },
      { header: 'Phone', key: 'phone' },
      { header: 'Email', key: 'email' },
      { header: 'Created At', key: 'createdAt' }
    ];

    const patientsCursor = Patient.find({ doctorId: admin._id }).cursor();
    let rowCount = 0;
    for await (const doc of patientsCursor) {
      patientSheet.addRow({
        _id: doc._id.toString(),
        title: doc.title,
        name: doc.name,
        gender: doc.gender,
        age: `${doc.age} ${doc.ageUnit}`,
        phone: doc.phone,
        email: doc.email,
        createdAt: doc.createdAt
      }).commit();
      
      rowCount++;
      if (rowCount % BATCH_SIZE === 0) {
        await yieldToEventLoop(); // ensure lowest priority among requests
        await applyThrottle(); // Check if server is overloaded and pause if necessary
      }
    }
    await patientWorkbook.commit();

    // Generate Reports Excel
    const reportWorkbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: reportFilePath });
    const reportSheet = reportWorkbook.addWorksheet('Reports');

    const ReportTemplate = require('../models/ReportTemplate');
    const templates = await ReportTemplate.find({ doctorId: admin._id }).lean();

    rowCount = 0;
    const exportedReportIds = new Set();

    for (const template of templates) {
      // Find all parameter names dynamically
      const paramNames = [];
      if (template.sections) {
        for (const sec of template.sections) {
          if (sec.parameters) {
            for (const p of sec.parameters) {
              if (p.name) paramNames.push(p.name);
            }
          }
        }
      }

      // Query reports for this specific template
      const reportsCursor = ReportInstance.find({ 
        doctorId: admin._id, 
        templateIds: template._id 
      }).populate('patientId', 'name title').cursor();

      let hasReports = false;

      for await (const doc of reportsCursor) {
        if (!hasReports) {
          // Write Header for this Template Section
          const titleRow = reportSheet.addRow([template.name]);
          titleRow.font = { bold: true, size: 14 };
          titleRow.commit();
          
          const headersRow = reportSheet.addRow(['Report ID', 'Patient Name', 'Date', 'Status', ...paramNames, 'Notes']);
          headersRow.font = { bold: true };
          headersRow.commit();
          hasReports = true;
        }

        exportedReportIds.add(doc._id.toString());
        
        const patientName = doc.patientId ? `${doc.patientId.title || ''} ${doc.patientId.name}`.trim() : 'Unknown';
        
        // Build map of results
        const resultsMap = {};
        let allNotes = '';
        if (doc.sections) {
          for (const sec of doc.sections) {
            if (sec.text) allNotes += sec.text + '\n';
            if (sec.parameters) {
              for (const p of sec.parameters) {
                if (!p.name) continue;
                let val = p.result || p.valueText || '';
                if (p.valueNumeric !== undefined && p.valueNumeric !== null) val = p.valueNumeric.toString();
                else if (p.valueBoolean !== undefined && p.valueBoolean !== null) val = p.valueBoolean ? 'Positive' : 'Negative';
                resultsMap[p.name] = val;
              }
            }
          }
        }

        const row = [
          doc._id.toString(),
          patientName,
          doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : '',
          doc.status
        ];

        for (const pName of paramNames) {
          row.push(resultsMap[pName] || '');
        }
        row.push(allNotes.trim());

        reportSheet.addRow(row).commit();
        
        rowCount++;
        if (rowCount % BATCH_SIZE === 0) {
          await yieldToEventLoop();
          await applyThrottle();
        }
      }

      if (hasReports) {
        reportSheet.addRow([]).commit(); // Spacing between templates
        reportSheet.addRow([]).commit();
      }
    }

    // Now process any reports that did not belong to any templates (e.g. ad-hoc/legacy)
    const miscCursor = ReportInstance.find({ 
      doctorId: admin._id,
      $or: [
        { templateIds: { $exists: false } },
        { templateIds: { $size: 0 } }
      ]
    }).populate('patientId', 'name title').cursor();

    let hasMisc = false;
    for await (const doc of miscCursor) {
      if (!exportedReportIds.has(doc._id.toString())) {
        if (!hasMisc) {
          const titleRow = reportSheet.addRow(['Miscellaneous / Ad-Hoc Reports']);
          titleRow.font = { bold: true, size: 14 };
          titleRow.commit();
          const headersRow = reportSheet.addRow(['Report ID', 'Patient Name', 'Date', 'Status', 'Notes']);
          headersRow.font = { bold: true };
          headersRow.commit();
          hasMisc = true;
        }

        const patientName = doc.patientId ? `${doc.patientId.title || ''} ${doc.patientId.name}`.trim() : 'Unknown';
        
        let allNotes = '';
        if (doc.sections) {
          for (const sec of doc.sections) {
            if (sec.sectionName) allNotes += sec.sectionName + ':\n';
            if (sec.text) allNotes += sec.text + '\n';
            if (sec.parameters) {
              for (const p of sec.parameters) {
                let val = p.result || p.valueText || p.valueNumeric || '';
                allNotes += `${p.name}: ${val}\n`;
              }
            }
          }
        }

        reportSheet.addRow([
          doc._id.toString(),
          patientName,
          doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : '',
          doc.status,
          allNotes.trim()
        ]).commit();
        
        rowCount++;
        if (rowCount % BATCH_SIZE === 0) {
          await yieldToEventLoop();
          await applyThrottle();
        }
      }
    }
    
    await reportWorkbook.commit();

    // Mark Job Completed
    await ExportJob.findByIdAndUpdate(job._id, {
      status: 'COMPLETED',
      filePaths,
      completedAt: new Date()
    });

    console.log(`[EXPORT WORKER] Job ${job._id} completed successfully.`);

    // Send Email to Admin
    try {
      const profileUrl = `${process.env.CLIENT_URL || 'http://localhost:5500'}/profile`;
      await sendDataExportReadyEmail(admin.email, profileUrl);
    } catch (emailErr) {
      console.error(`[EXPORT WORKER] Failed to send email for job ${job._id}:`, emailErr.message);
    }

  } catch (error) {
    console.error('[EXPORT WORKER] Error processing export job:', error);
    await ExportJob.findOneAndUpdate(
      { status: 'PROCESSING' },
      { status: 'FAILED', errorReason: error.message }
    );
  }
};

module.exports = { processExports };
