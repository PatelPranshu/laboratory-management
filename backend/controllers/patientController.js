const Patient = require('../models/Patient');
const ReportInstance = require('../models/ReportInstance');
const User = require('../models/User');
const socketService = require('../services/socketService');
const { sendNotification } = require('../utils/notifier');
const { pickFields } = require('../middlewares/validate');
const { updateLabStats } = require('../utils/statsHelper');
const mongoose = require('mongoose');

// Allowed fields for patient create/update — prevents mass assignment
const PATIENT_FIELDS = ['name', 'phone', 'email', 'age', 'ageUnit', 'gender', 'address', 'weight', 'height'];

// Resolve the lab admin ID regardless of the caller's role
const getAdminId = (req) => {
  return req.user.role === 'Admin' ? req.user.id : req.user.parentAdminId;
};

// @desc    Get all patients for a doctor (with pagination & search)
// @route   GET /api/patients
// @access  Private
exports.getPatients = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100); // Cap at 100
  const startIndex = (page - 1) * limit;
  
  const doctorId = getAdminId(req);

  // Build Query
  let query = { doctorId };

  // 1. Text Search Logic
  if (req.query.search) {
    const searchStr = String(req.query.search).trim();
    if (searchStr.length >= 2) {
      // If it looks like an ObjectId, do direct _id match (index-backed)
      if (mongoose.Types.ObjectId.isValid(searchStr) && searchStr.length === 24) {
        query._id = searchStr;
      } else {
        const searchRegex = new RegExp('^' + searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        query.$or = [
          { name: { $regex: searchRegex } },
          { phone: { $regex: searchRegex } }
        ];
      }
    }
  }

  // 2. Date Range Logic (createdAt)
  const { fromDate, toDate } = req.query;
  if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  const total = await Patient.countDocuments(query);
  const patients = await Patient.find(query)
    .select(req.query.search ? '_id name phone age gender' : '') // Optimize payload if searching
    .skip(startIndex)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    count: patients.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    },
    data: patients
  });
};

// @desc    Get single patient
// @route   GET /api/patients/:id
// @access  Private
exports.getPatient = async (req, res) => {
  const adminId = getAdminId(req);
  const query = { _id: req.params.id, doctorId: adminId };
  const patient = await Patient.findOne(query);

  if (!patient) {
    const err = new Error('Patient not found');
    err.statusCode = 404;
    throw err;
  }

  res.status(200).json({ success: true, data: patient });
};

// @desc    Create a patient
// @route   POST /api/patients
// @access  Private
exports.createPatient = async (req, res) => {
  const doctorId = getAdminId(req);

  // Whitelist fields — prevent mass assignment of doctorId or other internal fields
  const sanitizedBody = pickFields(req.body, PATIENT_FIELDS);

  sanitizedBody.doctorId = doctorId;
  sanitizedBody.createdBy = req.user.id;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const patients = await Patient.create([sanitizedBody], { session });
    const patient = patients[0];

    // Update Stats Cache
    await updateLabStats(doctorId, { 'stats.totalPatients': 1 }, session);

    await sendNotification(req.user.id, doctorId, {
      type: 'NEW_PATIENT',
      title: 'New Patient Registered',
      message: `${patient.name} has been registered by ${req.user.name}.`,
      referenceId: patient._id
    }, session);

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ success: true, data: patient });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

// @desc    Update a patient
// @route   PUT /api/patients/:id
// @access  Private
exports.updatePatient = async (req, res) => {
  const doctorId = getAdminId(req);
  let patient = await Patient.findOne({ _id: req.params.id, doctorId });

  if (!patient) {
    const err = new Error('Patient not found');
    err.statusCode = 404;
    throw err;
  }

  // Whitelist fields — prevent mass assignment
  const sanitizedBody = pickFields(req.body, PATIENT_FIELDS);

  patient = await Patient.findByIdAndUpdate(req.params.id, sanitizedBody, {
    returnDocument: 'after',
    runValidators: true
  });

  res.status(200).json({ success: true, data: patient });
};

// @desc    Delete a patient
// @route   DELETE /api/patients/:id
// @access  Private
exports.deletePatient = async (req, res) => {
  const doctorId = getAdminId(req);
  const patient = await Patient.findOne({ _id: req.params.id, doctorId });

  if (!patient) {
    const err = new Error('Patient not found');
    err.statusCode = 404;
    throw err;
  }
  
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Cascading stats update for associated reports before they are deleted
    const reportCounts = await ReportInstance.aggregate([
      { $match: { patientId: patient._id } },
      { $group: { 
          _id: null, 
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $in: ['$status', ['draft', 'DRAFT']] }, 1, 0] } },
          sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } }
      }}
    ]).session(session);

    if (reportCounts.length > 0) {
      const stats = reportCounts[0];
      await updateLabStats(doctorId, {
        'stats.totalReports': -stats.total,
        'stats.pendingReports': -stats.pending,
        'stats.sentReports': -stats.sent
      }, session);
    }

    // Cascade delete associated reports
    await ReportInstance.deleteMany({ patientId: patient._id }, { session });
    
    await patient.deleteOne({ session });

    // Update Stats Cache
    await updateLabStats(doctorId, { 'stats.totalPatients': -1 }, session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

// @desc    Lookup patient — cross-lab aware
// @route   GET /api/patients/:id/lookup
// @access  Private
exports.lookupPatient = async (req, res) => {
  const adminId = getAdminId(req);

  // First check own lab
  const ownPatient = await Patient.findOne({ _id: req.params.id, doctorId: adminId }).lean();
  if (ownPatient) {
    return res.status(200).json({ success: true, belongsToCurrentLab: true, data: ownPatient });
  }

  // Check if patient exists in any other lab
  const foreignPatient = await Patient.findById(req.params.id).select('name _id doctorId').lean();
  if (!foreignPatient) {
    const err = new Error('Patient not found');
    err.statusCode = 404;
    throw err;
  }

  // Return limited info only — no sensitive data
  res.status(200).json({
    success: true,
    belongsToCurrentLab: false,
    data: { _id: foreignPatient._id, name: foreignPatient.name }
  });
};

// @desc    Import patient profile from another lab (profile only, no reports)
// @route   POST /api/patients/:id/import
// @access  Private
exports.importPatient = async (req, res) => {
  const adminId = getAdminId(req);

  // Verify patient is NOT already in this lab
  const existingInLab = await Patient.findOne({ _id: req.params.id, doctorId: adminId }).lean();
  if (existingInLab) {
    return res.status(200).json({ 
      success: true, 
      message: 'Patient already exists in your lab',
      data: existingInLab 
    });
  }

  // Fetch source patient
  const sourcePatient = await Patient.findById(req.params.id).lean();
  if (!sourcePatient) {
    const err = new Error('Patient not found');
    err.statusCode = 404;
    throw err;
  }

  // Copy profile fields only — no reports, no source lab linkage
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const importedData = {
      name: sourcePatient.name,
      phone: sourcePatient.phone || '',
      email: sourcePatient.email || '',
      age: sourcePatient.age,
      ageUnit: sourcePatient.ageUnit || 'Years',
      gender: sourcePatient.gender,
      weight: sourcePatient.weight,
      height: sourcePatient.height,
      address: sourcePatient.address || '',
      doctorId: adminId,
      createdBy: req.user.id
    };

    const patients = await Patient.create([importedData], { session });
    const newPatient = patients[0];

    // Update Stats Cache
    await updateLabStats(adminId, { 'stats.totalPatients': 1 }, session);

    await sendNotification(req.user.id, adminId, {
      type: 'NEW_PATIENT',
      title: 'Patient Imported',
      message: `${newPatient.name} has been imported by ${req.user.name}.`,
      referenceId: newPatient._id
    }, session);

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ success: true, data: newPatient });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};
