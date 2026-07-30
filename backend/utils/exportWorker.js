const os = require('os');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const ExportJob = require('../models/ExportJob');
const User = require('../models/User');
const Patient = require('../models/Patient');
const ReportInstance = require('../models/ReportInstance');
const { sendDataExportReadyEmail } = require('../services/emailService');
const { evaluatePatientResult } = require('./resultEvaluator');
const { cleanupExportFiles } = require('./exportCleanup');

const EXPORTS_DIR = path.join(__dirname, '..', 'exports');

// Ensure exports directory exists
if (!fs.existsSync(EXPORTS_DIR)) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------
// Advanced Resource Throttling Logic (Phase 2 Enterprise Portability)
// ---------------------------------------------------------------------
const MAX_CPU_THRESHOLD = 70; // Stop process if CPU > 70%
const MAX_MEM_THRESHOLD = 90; // Stop process if RAM > 95% (OS caches can take up to 90%)
const RESUME_CPU_THRESHOLD = 20; // Resume process if CPU drops to 20%
const RESUME_MEM_THRESHOLD = 70; // Resume process if RAM drops to 70%
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
    // Run pre-flight storage check & 48h file cleanup before picking up job
    cleanupExportFiles();

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
      { returnDocument: 'after', sort: { createdAt: 1 } }
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
    reportSheet.addRow(['Report ID', 'Patient Name', 'Age', 'Gender', 'Phone', 'Report Date', 'Referred By', 'Performed By', 'Template Name', 'Methodology', 'Sample Type', 'Notes']).commit();
    
    const sectionSheet = reportWorkbook.addWorksheet('Sections');
    sectionSheet.addRow(['Section ID', 'Report ID', 'Section Order', 'Section Name', 'Notes']).commit();
    
    const paramSheet = reportWorkbook.addWorksheet('Parameters');
    paramSheet.addRow(['Parameter ID', 'Report ID', 'Section ID', 'Parameter Order', 'Parameter Name', 'Result', 'Unit', 'Normal Range']).commit();

    const ReportTemplate = require('../models/ReportTemplate');
    const templates = await ReportTemplate.find({ doctorId: admin._id }).lean();
    const templateMap = {};
    for (const t of templates) templateMap[t._id.toString()] = t.templateName;

    const reportsCursor = ReportInstance.find({ doctorId: admin._id })
      .populate('patientId', 'name title age ageUnit gender phone')
      .cursor();

    let sectionIdCounter = 1;
    let paramIdCounter = 1;
    rowCount = 0;

    for await (const doc of reportsCursor) {
      const rId = doc._id.toString();
      const patient = doc.patientId || {};
      const pName = `${patient.title || ''} ${patient.name || ''}`.trim() || 'Unknown';
      const pAge = patient.age ? `${patient.age} ${patient.ageUnit || ''}`.trim() : '';
      const pGender = patient.gender || '';
      const pPhone = patient.phone || '';
      const rDate = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : '';
      const rRef = doc.referredBy || '';
      const pPerf = doc.performedBy || '';
      
      let tName = '';
      if (doc.templateIds && doc.templateIds.length > 0) {
          tName = templateMap[doc.templateIds[0].toString()] || 'Unknown';
      } else {
          tName = 'Miscellaneous / Ad-Hoc';
      }

      let meth = '';
      let samp = '';
      let rNotes = '';
      if (doc.sections && doc.sections.length > 0) {
           meth = doc.sections.map(s => s.methodology).filter(Boolean).join(', ');
           samp = doc.sections.map(s => s.sampleType).filter(Boolean).join(', ');
           rNotes = doc.sections.map(s => s.text).filter(Boolean).join('\n');
      }

      reportSheet.addRow([
          rId, pName, pAge, pGender, pPhone, rDate, rRef, pPerf, tName, meth, samp, rNotes
      ]).commit();

      if (doc.sections) {
          let sOrder = 1;
          for (const sec of doc.sections) {
              const sId = sectionIdCounter++;
              sectionSheet.addRow([
                  sId, rId, sOrder, sec.sectionName || '', sec.text || ''
              ]).commit();

              if (sec.parameters) {
                  let pOrder = 1;
                  for (const p of sec.parameters) {
                      let val = p.result || p.valueText || '';
                      if (p.valueNumeric !== undefined && p.valueNumeric !== null) val = p.valueNumeric.toString();
                      else if (p.valueBoolean !== undefined && p.valueBoolean !== null) val = p.valueBoolean ? 'Positive' : 'Negative';

                      const evaluation = evaluatePatientResult(val, p, pGender);
                      let nRangeStr = evaluation.rangeDisplay;

                      paramSheet.addRow([
                          paramIdCounter++, rId, sId, pOrder, p.name || '', val, p.units || '', nRangeStr
                      ]).commit();
                      pOrder++;
                  }
              }
              sOrder++;
          }
      }

      rowCount++;
      if (rowCount % BATCH_SIZE === 0) {
          await yieldToEventLoop();
          await applyThrottle();
      }
    }

    await reportWorkbook.commit();

    // Mark Job Completed with 48h expiration timestamp
    const fortyEightHoursFromNow = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await ExportJob.findByIdAndUpdate(job._id, {
      status: 'COMPLETED',
      filePaths,
      completedAt: new Date(),
      expiresAt: fortyEightHoursFromNow
    });

    console.log(`[EXPORT WORKER] Job ${job._id} completed successfully.`);

    // Send Email to Admin
    try {
      const profileUrl = `${process.env.FRONTEND_URL || 'http://localhost:5500'}/profile`;
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
