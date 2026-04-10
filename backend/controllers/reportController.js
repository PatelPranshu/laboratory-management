const ReportInstance = require('../models/ReportInstance');
const Patient = require('../models/Patient');
const PrintSettings = require('../models/PrintSettings');
const pdfService = require('../services/pdfService');
const mongoose = require('mongoose');
const { pickFields } = require('../middlewares/validate');

// Allowed fields for report create/update — prevents mass assignment
const REPORT_CREATE_FIELDS = ['patientId', 'date', 'referredBy', 'sections', 'status', 'templateIds', 'creatorId', 'verifierId', 'referredByDoctorId'];
const REPORT_UPDATE_FIELDS = ['date', 'referredBy', 'sections', 'status', 'templateIds', 'creatorId', 'verifierId', 'referredByDoctorId'];

const getAdminId = (req) => {
  return req.user.role === 'Admin' ? req.user.id : req.user.parentAdminId;
};

// @desc    Get all reports
// @route   GET /api/reports
// @access  Private
exports.getReports = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    const startIndex = (page - 1) * limit;

    const adminId = getAdminId(req);
    
    let query = { doctorId: adminId };
    if (req.user.role === 'LabTech') {
      query.createdBy = req.user.id;
    }
    if (req.query.patientId) {
      // Validate patientId format before using in query
      if (mongoose.Types.ObjectId.isValid(req.query.patientId)) {
        query.patientId = req.query.patientId;
      }
    }

    const reports = await ReportInstance.find(query)
      .populate('patientId', 'name phone age gender')
      .skip(startIndex)
      .limit(limit)
      .sort({ createdAt: -1 });

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
  } catch (error) {
    console.error('getReports error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve reports' });
  }
};

// @desc    Get single report
// @route   GET /api/reports/:id
// @access  Private
exports.getReport = async (req, res) => {
  try {
    const adminId = getAdminId(req);
    let query = { _id: req.params.id, doctorId: adminId };
    if (req.user.role === 'LabTech') {
      query.createdBy = req.user.id;
    }
    
    const report = await ReportInstance.findOne(query)
      .populate('patientId', 'name phone age gender email');

    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    res.status(200).json({ success: true, data: report });
  } catch (error) {
    console.error('getReport error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve report' });
  }
};

// @desc    Create new report
// @route   POST /api/reports
// @access  Private
exports.createReport = async (req, res) => {
  try {
    const adminId = getAdminId(req);

    // Whitelist fields FIRST, then set doctorId to prevent override
    const sanitizedBody = pickFields(req.body, REPORT_CREATE_FIELDS);
    sanitizedBody.doctorId = adminId;
    sanitizedBody.createdBy = req.user.id; // backward comp
    sanitizedBody.creatorId = req.user.id;

    if (sanitizedBody.referredByDoctorId) {
        sanitizedBody.status = 'saved';
    } else {
        sanitizedBody.status = 'draft';
    }
    
    // Add audit log
    sanitizedBody.auditLogs = [{
      action: 'Created',
      userId: req.user.id
    }];

    const report = await ReportInstance.create(sanitizedBody);

    res.status(201).json({ success: true, data: report });
  } catch (error) {
    console.error('createReport error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to create report' });
  }
};

// @desc    Update report
// @route   PUT /api/reports/:id
// @access  Private
exports.updateReport = async (req, res) => {
  try {
    const adminId = getAdminId(req);
    let query = { _id: req.params.id, doctorId: adminId };
    if (req.user.role === 'LabTech') {
      query.createdBy = req.user.id;
    }

    let report = await ReportInstance.findOne(query);

    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    // Whitelist fields — prevent doctorId/auditLogs manipulation
    const sanitizedBody = pickFields(req.body, REPORT_UPDATE_FIELDS);

    if (sanitizedBody.referredByDoctorId) {
        sanitizedBody.status = 'saved';
    } else {
        sanitizedBody.status = 'draft';
    }

    // Append audit log (don't allow client to overwrite)
    sanitizedBody.auditLogs = [...report.auditLogs, { action: 'Modified', userId: req.user.id }];

    report = await ReportInstance.findByIdAndUpdate(req.params.id, sanitizedBody, {
      returnDocument: 'after',
      runValidators: true
    });

    res.status(200).json({ success: true, data: report });
  } catch (error) {
    console.error('updateReport error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update report' });
  }
};

// @desc    Generate PDF
// @route   GET /api/reports/:id/pdf
// @access  Private
exports.generatePdf = async (req, res) => {
  try {
    const adminId = getAdminId(req);
    let query = { _id: req.params.id, doctorId: adminId };
    // Even for generating PDF, we might restrict LabTech if they shouldn't see others, 
    // but the route restricts generatePdf to Admin/Doctor anyway.
    const report = await ReportInstance.findOne(query)
      .populate('patientId')
      .populate('referredByDoctorId');

    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    if (!report.patientId) {
      return res.status(404).json({ success: false, error: 'Associated patient not found' });
    }

    if (report.status === 'draft') {
      return res.status(403).json({ success: false, error: 'Cannot download a draft report. It must be signed / saved first.' });
    }

    const settings = await PrintSettings.findOne({ doctorId: adminId });
    
    // Convert Mongoose docs to plain objects to avoid serialization issues in pdfmake
    const reportObj = report.toObject();
    const patientObj = report.patientId.toObject ? report.patientId.toObject() : report.patientId;
    
    const pdfBuffer = await pdfService.generateReportPdf(reportObj, patientObj, settings ? settings.toObject() : null);
    
    // Update status to 'saved' if it was a draft
    if (report.status === 'draft') {
        report.status = 'saved';
        report.auditLogs.push({ action: 'Downloaded PDF', userId: req.user.id });
        await report.save();
    }

    // Sanitize filename — remove special chars
    const safeName = (report.patientId.name || 'Patient').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=Report_${safeName}.pdf`,
      'Content-Length': pdfBuffer.length
    });

    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF Generation Error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate PDF' });
  }
};

// @desc    Mock Send Report (Email/WhatsApp)
// @route   POST /api/reports/:id/send
// @access  Private
exports.sendReport = async (req, res) => {
  try {
    // Handled by route middleware authorize('Admin', 'Doctor')

    const adminId = getAdminId(req);
    const report = await ReportInstance.findOne({ _id: req.params.id, doctorId: adminId })
      .populate('patientId')
      .populate('referredByDoctorId');
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

    if (report.status === 'draft') {
      return res.status(403).json({ success: false, error: 'Cannot send a draft report. It must be signed / saved first.' });
    }

    const { method } = req.body;

    // Validate method
    const allowedMethods = ['email', 'whatsapp'];
    if (!method || !allowedMethods.includes(method)) {
      return res.status(400).json({ success: false, error: 'Invalid send method. Use "email" or "whatsapp"' });
    }

    // Mock logic
    console.log(`Mock sending report ${report._id} via ${method}`);

    // Update status and audit log
    report.status = 'saved';
    report.auditLogs.push({ action: 'Sent', userId: req.user.id });
    await report.save();

    res.status(200).json({ success: true, message: `Report successfully sent via ${method}` });
  } catch (error) {
    console.error('sendReport error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to send report' });
  }
};

// @desc    Get pending reports
// @route   GET /api/reports/pending
// @access  Private
exports.getPendingReports = async (req, res) => {
  try {
    const adminId = getAdminId(req);
    
    let query = {
      doctorId: adminId,
      status: 'draft'
    };

    if (req.user.role === 'Doctor') {
      query.verifierId = req.user.id;
    } else if (req.user.role === 'LabTech') {
       // Optional: LabTech can only see their own drafted items
      query.creatorId = req.user.id;
    }

    const reports = await ReportInstance.find(query)
      .populate('patientId', 'name phone age gender')
      .populate('creatorId', 'name role email')
      .populate('verifierId', 'name role email')
      .sort('-createdAt');

    res.status(200).json({ success: true, count: reports.length, data: reports });
  } catch (error) {
    console.error('getPendingReports error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve pending reports' });
  }
};
