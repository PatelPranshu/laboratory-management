const ReportInstance = require('../models/ReportInstance');
const Patient = require('../models/Patient');
const PrintSettings = require('../models/PrintSettings');
const pdfService = require('../services/pdfService');
const mongoose = require('mongoose');
const Signature = require('../models/Signature');
const { sendNotification } = require('../utils/notifier');
const { pickFields } = require('../middlewares/validate');
const { updateLabStats } = require('../utils/statsHelper');
const { calculateDerivedResult } = require('../utils/mathHelper');
const ReportTemplate = require('../models/ReportTemplate');

/**
 * Resolves all CALCULATED parameters across report sections.
 * Uses multi-pass resolution (up to 10 passes) to handle chained formulas
 * where one calculated param depends on another calculated param's result.
 * 
 * @param {Array} sections - The report sections containing parameters
 * @param {Object} patientContext - Patient demographics { 'Patient Age': N, ... }
 */
function resolveCalculatedParams(sections, patientContext = {}) {
  const MAX_PASSES = 10;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let resolvedAny = false;

    // Build a flat results map from ALL sections' parameters
    const resultsMap = {};
    for (const section of sections) {
      for (const param of (section.parameters || [])) {
        if (param.result && param.result.trim() !== '') {
          const numVal = parseFloat(param.result);
          if (!isNaN(numVal)) {
            resultsMap[param.name] = numVal;
          }
        }
      }
    }

    // Iterate through all CALCULATED parameters and attempt resolution
    for (const section of sections) {
      for (const param of (section.parameters || [])) {
        if (param.dataType !== 'CALCULATED' || !param.formula) continue;

        // Skip if already resolved in a previous pass
        if (param.result && param.result.trim() !== '') continue;

        const result = calculateDerivedResult(param.formula, resultsMap, patientContext);
        if (result !== null) {
          param.result = String(result);
          resolvedAny = true;
        }
      }
    }

    // If no new values were resolved this pass, we're done
    if (!resolvedAny) break;
  }
}

// Allowed fields for report create/update — prevents mass assignment
// creatorId, verifierId, performedByLabTechId are set SERVER-SIDE only to prevent spoofing
const REPORT_CREATE_FIELDS = ['patientId', 'date', 'referredBy', 'performedBy', 'sections', 'templateIds', 'performedByLabTechId', 'status'];
const REPORT_UPDATE_FIELDS = ['date', 'referredBy', 'performedBy', 'sections', 'templateIds', 'performedByLabTechId', 'status'];

const getAdminId = (req) => {
  return req.user.role === 'Admin' ? req.user.id : (req.user.parentAdminId || req.user.id);
};

// @desc    Get all reports
// @route   GET /api/reports
// @access  Private
exports.getReports = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
  const startIndex = (page - 1) * limit;

  const adminId = getAdminId(req);
  
  let query = { doctorId: adminId };
  
  // Status filtering
  if (req.query.status) {
    query.status = req.query.status;
  }

  // Date range filtering
  if (req.query.startDate || req.query.endDate) {
    query.createdAt = {};
    if (req.query.startDate) {
      query.createdAt.$gte = new Date(req.query.startDate);
    }
    if (req.query.endDate) {
      const endDate = new Date(req.query.endDate);
      endDate.setUTCHours(23, 59, 59, 999);
      query.createdAt.$lte = endDate;
    }
  }

  // Patient ID filtering
  if (req.query.patientId && mongoose.Types.ObjectId.isValid(req.query.patientId)) {
    query.patientId = req.query.patientId;
  }

  // Search by patient name, phone, patient id or report id
  if (req.query.search) {
    const searchStr = String(req.query.search).trim();

    if (mongoose.Types.ObjectId.isValid(searchStr)) {
      // Exact ObjectId match — index-backed, O(1)
      query.$or = [
        { _id: searchStr },
        { patientId: searchStr },
      ];
    } else {
      // Text index search on name + anchored regex on phone (uses standard index)
      const safeRegex = '^' + searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patientIds = await Patient.find({
        doctorId: adminId,
        $or: [
          { $text: { $search: searchStr } },
          { phone: { $regex: safeRegex, $options: 'i' } }
        ]
      }).distinct('_id');

      query.patientId = { $in: patientIds };
    }
  }

  const reports = await ReportInstance.find(query)
    .select('-sections') // Optimization: Don't fetch large section data for list view
    .populate('patientId', 'name phone age gender')
    .populate('templateIds', 'templateName')
    .populate('performedByLabTechId', 'fullName doctorName signatureUrl')
    .skip(startIndex)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean(); // Optimization: Return plain JS objects instead of Mongoose documents

  const total = await ReportInstance.countDocuments(query);

  res.status(200).json({
    success: true,
    count: reports.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    },
    data: reports
  });
};

// @desc    Get single report
// @route   GET /api/reports/:id
// @access  Private
exports.getReport = async (req, res) => {
  const adminId = getAdminId(req);
  let query = { _id: req.params.id, doctorId: adminId };
  
  const report = await ReportInstance.findOne(query)
    .populate('patientId', 'name phone age gender email')
    .populate('performedByLabTechId', 'fullName doctorName signatureUrl');

  if (!report) {
    const err = new Error('Report not found');
    err.statusCode = 404;
    throw err;
  }

  res.status(200).json({ success: true, data: report });
};

// @desc    Create new report
// @route   POST /api/reports
// @access  Private
exports.createReport = async (req, res) => {
  const adminId = getAdminId(req);

  // Whitelist fields FIRST, then set doctorId to prevent override
  const sanitizedBody = pickFields(req.body, REPORT_CREATE_FIELDS);
  sanitizedBody.doctorId = adminId;
  sanitizedBody.createdBy = req.user.id;
  sanitizedBody.creatorId = req.user.id;

  // Handle empty string IDs
  if (sanitizedBody.performedByLabTechId === '') sanitizedBody.performedByLabTechId = null;

  // Resolve CALCULATED parameters before saving
  if (sanitizedBody.sections && sanitizedBody.patientId) {
    try {
      const patient = await Patient.findById(sanitizedBody.patientId);
      if (patient) {
        const patientContext = {
          'Patient Age': patient.age,
          'Patient Weight': patient.weight,
          'Patient Height': patient.height
        };
        resolveCalculatedParams(sanitizedBody.sections, patientContext);
      }
    } catch (calcErr) {
      console.warn('Calculated param resolution failed (non-blocking):', calcErr.message);
    }
  }

  // Determine final status
  const requestedStatus = req.body.status;
  
  if (requestedStatus === 'draft') {
    sanitizedBody.status = 'draft';
  } else if (sanitizedBody.performedByLabTechId) {
    const signature = await Signature.findOne({ 
      $or: [
        { userId: sanitizedBody.performedByLabTechId },
        { _id: sanitizedBody.performedByLabTechId }
      ],
      parentAdminId: adminId
    });

    if (signature) {
      sanitizedBody.status = 'saved';
      sanitizedBody.performedByLabTechId = signature._id;
      sanitizedBody.verifierId = signature._id;
      sanitizedBody.performedBy = signature.fullName || signature.doctorName;
    } else {
      sanitizedBody.status = 'draft';
      sanitizedBody.verifierId = sanitizedBody.performedByLabTechId;
    }
  } else {
    sanitizedBody.status = 'draft';
  }

  // Validation for non-drafts
  if (sanitizedBody.status === 'saved') {
    if (!sanitizedBody.performedBy) {
      const err = new Error('Performing technician/doctor name is required for finalized reports');
      err.statusCode = 400;
      throw err;
    }
    if (!sanitizedBody.referredBy) {
      const err = new Error('Referring source is required for finalized reports');
      err.statusCode = 400;
      throw err;
    }
  }
  
  // Add audit log
  sanitizedBody.auditLogs = [{
    action: 'Created',
    userId: req.user.id
  }];

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const reports = await ReportInstance.create([sanitizedBody], { session });
    const report = reports[0];

    if (report.templateIds && report.templateIds.length > 0) {
      await ReportTemplate.updateMany(
        { _id: { $in: report.templateIds } },
        { $inc: { usageCount: 1 } },
        { session }
      );
    }

    // Update Stats Cache
    const statsUpdate = { 'stats.totalReports': 1 };
    if (report.status === 'draft') {
      statsUpdate['stats.pendingReports'] = 1;
    } else if (report.status === 'sent') {
      statsUpdate['stats.sentReports'] = 1;
    }
    await updateLabStats(adminId, statsUpdate, session);

    // Send Notification
    await sendNotification(req.user.id, adminId, {
      type: 'NEW_REPORT',
      title: report.status === 'saved' ? 'Finalized Report Signed' : 'New Report Created',
      message: `Report for patient ${report.patientId ? 'is ready' : 'was created'} by ${req.user.name}.`,
      referenceId: report._id
    }, session);

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ success: true, data: report });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

// @desc    Update report
// @route   PUT /api/reports/:id
// @access  Private
exports.updateReport = async (req, res) => {
  const adminId = getAdminId(req);
  let query = { _id: req.params.id, doctorId: adminId };

  let report = await ReportInstance.findOne(query);

  if (!report) {
    const err = new Error('Report not found');
    err.statusCode = 404;
    throw err;
  }

  const oldStatus = report.status;

  // Enforce amendment lock
  if (['saved', 'sent', 'FINAL'].includes(oldStatus)) {
    if (!req.body.amendmentReason && req.user.role !== 'Admin') {
      const err = new Error('Cannot modify a finalized report directly. An amendment reason is required.');
      err.statusCode = 400;
      throw err;
    }
  }

  // Whitelist fields — prevent doctorId/auditLogs manipulation
  const sanitizedBody = pickFields(req.body, REPORT_UPDATE_FIELDS);

  // Resolve CALCULATED parameters before saving
  if (sanitizedBody.sections) {
    try {
      const patientId = report.patientId;
      const patient = await Patient.findById(patientId);
      if (patient) {
        const patientContext = {
          'Patient Age': patient.age,
          'Patient Weight': patient.weight,
          'Patient Height': patient.height
        };
        resolveCalculatedParams(sanitizedBody.sections, patientContext);
      }
    } catch (calcErr) {
      console.warn('Calculated param resolution failed (non-blocking):', calcErr.message);
    }
  }

  // Handle empty string IDs
  if (sanitizedBody.performedByLabTechId === '') sanitizedBody.performedByLabTechId = null;

  // Determine final status
  const requestedStatus = req.body.status;
  
  if (['saved', 'sent', 'FINAL'].includes(oldStatus) && req.body.amendmentReason) {
    sanitizedBody.status = 'AMENDED';
    sanitizedBody.amendmentHistory = [
      ...(report.amendmentHistory || []),
      { date: new Date(), userId: req.user.id, reason: req.body.amendmentReason, previousStatus: oldStatus }
    ];
  } else if (requestedStatus === 'draft' || requestedStatus === 'DRAFT') {
    sanitizedBody.status = 'draft';
  } else if (sanitizedBody.performedByLabTechId) {
    const signature = await Signature.findOne({ 
      $or: [
        { userId: sanitizedBody.performedByLabTechId },
        { _id: sanitizedBody.performedByLabTechId }
      ],
      parentAdminId: adminId 
    });

    if (signature) {
        sanitizedBody.status = 'saved';
        sanitizedBody.performedByLabTechId = signature._id;
        sanitizedBody.verifierId = signature._id;
        sanitizedBody.performedBy = signature.fullName || signature.doctorName;
    } else {
        sanitizedBody.status = 'draft';
        sanitizedBody.verifierId = sanitizedBody.performedByLabTechId;
    }
  } else {
    sanitizedBody.status = 'draft';
  }

  // Validation for non-drafts
  if (sanitizedBody.status === 'saved' || sanitizedBody.status === 'FINAL') {
    if (!sanitizedBody.performedBy && !report.performedBy) {
      const err = new Error('Performing technician/doctor name is required for finalized reports');
      err.statusCode = 400;
      throw err;
    }
    // referredBy has a default in model, but good to check if it's being cleared
    if (sanitizedBody.referredBy === '') {
      const err = new Error('Referring source is required for finalized reports');
      err.statusCode = 400;
      throw err;
    }
  }

  // Append audit log (don't allow client to overwrite)
  sanitizedBody.auditLogs = [...report.auditLogs, { action: 'Modified', userId: req.user.id }];

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    report = await ReportInstance.findByIdAndUpdate(req.params.id, sanitizedBody, {
      returnDocument: 'after',
      runValidators: true,
      session
    });

    const newStatus = report.status;

    // Synchronize Stats Cache on status change
    if (oldStatus !== newStatus) {
      const statsUpdate = {};
      
      // Categorize old and new statuses
      const isOldPending = (oldStatus === 'draft');
      const isNewPending = (newStatus === 'draft');
      const isOldSent = (oldStatus === 'sent');
      const isNewSent = (newStatus === 'sent');

      if (isOldPending && !isNewPending) statsUpdate['stats.pendingReports'] = -1;
      if (!isOldPending && isNewPending) statsUpdate['stats.pendingReports'] = 1;
      if (isOldSent && !isNewSent) statsUpdate['stats.sentReports'] = -1;
      if (!isOldSent && isNewSent) statsUpdate['stats.sentReports'] = 1;

      if (Object.keys(statsUpdate).length > 0) {
        await updateLabStats(adminId, statsUpdate, session);
      }
    }

    // Notify if the report was finalized (signed) or amended during this update
    if (oldStatus === 'draft' && report.status === 'saved') {
      await sendNotification(req.user.id, adminId, {
        type: 'NEW_REPORT',
        title: 'Report Finalized & Signed',
        message: `Clinical findings for a report have been finalized by ${req.user.name}.`,
        referenceId: report._id
      }, session);
    } else if (newStatus === 'AMENDED' || (oldStatus === 'saved' && req.body.status !== 'draft')) {
      await sendNotification(req.user.id, adminId, {
        type: 'NEW_REPORT',
        title: 'Report Modified',
        message: `A report was modified or amended by ${req.user.name}.`,
        referenceId: report._id
      }, session);
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, data: report });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

// WARNING: pdfmake consumes heavy RAM (50-100MB per PDF). For 512MB servers,
// this route is a primary crash risk under concurrent load.
// Move to Vercel Serverless Functions.
// @desc    Generate PDF
// @route   GET /api/reports/:id/pdf
// @access  Private
exports.generatePdf = async (req, res) => {
  const adminId = getAdminId(req);
  let query = { _id: req.params.id, doctorId: adminId };
  // Even for generating PDF, we might restrict LabTech if they shouldn't see others, 
  // but the route restricts generatePdf to Admin/Doctor anyway.
  const report = await ReportInstance.findOne(query)
    .populate('patientId')
    .populate('templateIds', 'templateName')
    .populate('performedByLabTechId', 'fullName doctorName signatureUrl');

  if (!report) {
    const err = new Error('Report not found');
    err.statusCode = 404;
    throw err;
  }

  if (!report.patientId) {
    const err = new Error('Associated patient not found');
    err.statusCode = 404;
    throw err;
  }

  if (report.status === 'draft') {
    const err = new Error('Cannot download a draft report. It must be signed / saved first.');
    err.statusCode = 403;
    throw err;
  }

  const settings = await PrintSettings.findOne({ doctorId: adminId });
  
  let finalSettings = null;
  if (settings) {
    finalSettings = settings.toObject();
    if (req.query.withHeaderFooter === 'false') {
      finalSettings.headerImageURL = null;
      finalSettings.footerImageURL = null;
      finalSettings.headerHeight = 0;
      finalSettings.footerHeight = 0;

      if (finalSettings.layoutPreferences) {
        if (finalSettings.layoutPreferences.marginTopWithoutHeader !== undefined) {
          finalSettings.layoutPreferences.marginTop = finalSettings.layoutPreferences.marginTopWithoutHeader;
        }
        if (finalSettings.layoutPreferences.marginBottomWithoutFooter !== undefined) {
          finalSettings.layoutPreferences.marginBottom = finalSettings.layoutPreferences.marginBottomWithoutFooter;
        }
      }
    }
  }

  // Convert Mongoose docs to plain objects to avoid serialization issues in pdfmake
  const reportObj = report.toObject();
  const patientObj = report.patientId.toObject ? report.patientId.toObject() : report.patientId;
  
  const pdfBuffer = await pdfService.generateReportPdf(reportObj, patientObj, finalSettings);

  // Add audit log for download
  report.auditLogs.push({ action: 'Downloaded PDF', userId: req.user.id });
  await report.save();

  // Sanitize and construct filename using patient name and template names
  const patientName = (report.patientId.name || 'Patient')
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .replace(/\s+/g, '_');

  const templateNames = (report.templateIds || [])
    .map(t => (t.templateName || '').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_'))
    .filter(Boolean);

  let baseName = [patientName, ...templateNames].join('_');
  
  // Ensure no consecutive underscores
  baseName = baseName.replace(/_+/g, '_');

  // Ensure the filename length never exceeds a safe limit (e.g. 150 characters)
  if (baseName.length > 150) {
    baseName = baseName.substring(0, 150);
  }

  // Remove any leading or trailing underscores from the filename
  baseName = baseName.replace(/^_+|_+$/g, '');

  // Fallback if name is empty
  if (!baseName) {
    baseName = 'Report';
  }

  const filename = `${baseName}.pdf`;

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': pdfBuffer.length
  });

  res.send(pdfBuffer);
};

// @desc    Mock Send Report (Email/WhatsApp)
// @route   POST /api/reports/:id/send
// @access  Private
exports.sendReport = async (req, res) => {
  // Handled by route middleware authorize('Admin', 'Doctor')

  const adminId = getAdminId(req);
  const report = await ReportInstance.findOne({ _id: req.params.id, doctorId: adminId })
    .populate('patientId')
    .populate('performedByLabTechId', 'fullName doctorName signatureUrl');
  if (!report) {
    const err = new Error('Report not found');
    err.statusCode = 404;
    throw err;
  }

  if (report.status === 'draft') {
    const err = new Error('Cannot send a draft report. It must be signed / saved first.');
    err.statusCode = 403;
    throw err;
  }

  const { method } = req.body;

  // Validate method
  const allowedMethods = ['email', 'whatsapp'];
  if (!method || !allowedMethods.includes(method)) {
    const err = new Error('Invalid send method. Use "email" or "whatsapp"');
    err.statusCode = 400;
    throw err;
  }

  // Update status and audit log
  report.status = 'saved';
  report.auditLogs.push({ action: 'Sent', userId: req.user.id });
  await report.save();

  res.status(200).json({ success: true, message: `Report successfully sent via ${method}` });
};

// @desc    Get pending reports
// @route   GET /api/reports/pending
// @access  Private
exports.getPendingReports = async (req, res) => {
  const adminId = getAdminId(req);
  
  let query = {
    doctorId: adminId,
    status: 'draft'
  };

  if (req.user.role === 'Doctor') {
    query.verifierId = req.user.id;
  }

  const reports = await ReportInstance.find(query)
    .populate('patientId', 'name phone age gender')
    .populate('creatorId', 'name role email')
    .populate('verifierId', 'name role email')
    .populate('performedByLabTechId', 'fullName doctorName signatureUrl')
    .populate('templateIds', 'templateName')
    .sort('-createdAt');

  res.status(200).json({ success: true, count: reports.length, data: reports });
};

// @desc    Delete report
// @route   DELETE /api/reports/:id
// @access  Private
exports.deleteReport = async (req, res) => {
  const adminId = getAdminId(req);
  const report = await ReportInstance.findOne({ _id: req.params.id, doctorId: adminId });

  if (!report) {
    const err = new Error('Report not found');
    err.statusCode = 404;
    throw err;
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Update Stats Cache before deletion
    const statsUpdate = { 'stats.totalReports': -1 };
    if (report.status === 'draft') {
      statsUpdate['stats.pendingReports'] = -1;
    } else if (report.status === 'sent') {
      statsUpdate['stats.sentReports'] = -1;
    }
    await updateLabStats(adminId, statsUpdate, session);

    await report.deleteOne({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};
