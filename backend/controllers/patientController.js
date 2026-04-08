const Patient = require('../models/Patient');
const ReportInstance = require('../models/ReportInstance');
const { pickFields } = require('../middlewares/validate');

// Allowed fields for patient create/update — prevents mass assignment
const PATIENT_FIELDS = ['name', 'phone', 'email', 'age', 'gender', 'address'];

// @desc    Get all patients for a doctor (with pagination & search)
// @route   GET /api/patients
// @access  Private
exports.getPatients = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100); // Cap at 100
    const startIndex = (page - 1) * limit;
    
    const doctorId = req.user.role === 'LabTech' ? req.user.parentDoctorId : req.user.id;

    // Build Query
    let query = { doctorId };

    // 1. Text Search Logic
    if (req.query.search) {
      const searchStr = String(req.query.search).trim();
      if (searchStr.length >= 2) {
        const searchRegex = new RegExp('^' + searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        query.$or = [
          { name: { $regex: searchRegex } },
          { phone: { $regex: searchRegex } }
        ];
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
  } catch (error) {
    console.error('getPatients error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve patients' });
  }
};

// @desc    Get single patient
// @route   GET /api/patients/:id
// @access  Private
exports.getPatient = async (req, res) => {
  try {
    const doctorId = req.user.role === 'LabTech' ? req.user.parentDoctorId : req.user.id;
    const patient = await Patient.findOne({ _id: req.params.id, doctorId });

    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    res.status(200).json({ success: true, data: patient });
  } catch (error) {
    console.error('getPatient error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve patient' });
  }
};

// @desc    Create a patient
// @route   POST /api/patients
// @access  Private
exports.createPatient = async (req, res) => {
  try {
    const doctorId = req.user.role === 'LabTech' ? req.user.parentDoctorId : req.user.id;

    // Whitelist fields — prevent mass assignment of doctorId or other internal fields
    const sanitizedBody = pickFields(req.body, PATIENT_FIELDS);
    sanitizedBody.doctorId = doctorId;

    const patient = await Patient.create(sanitizedBody);

    res.status(201).json({ success: true, data: patient });
  } catch (error) {
    console.error('createPatient error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to create patient' });
  }
};

// @desc    Update a patient
// @route   PUT /api/patients/:id
// @access  Private
exports.updatePatient = async (req, res) => {
  try {
    const doctorId = req.user.role === 'LabTech' ? req.user.parentDoctorId : req.user.id;
    let patient = await Patient.findOne({ _id: req.params.id, doctorId });

    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    // Whitelist fields — prevent mass assignment
    const sanitizedBody = pickFields(req.body, PATIENT_FIELDS);

    patient = await Patient.findByIdAndUpdate(req.params.id, sanitizedBody, {
      returnDocument: 'after',
      runValidators: true
    });

    res.status(200).json({ success: true, data: patient });
  } catch (error) {
    console.error('updatePatient error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update patient' });
  }
};

// @desc    Delete a patient
// @route   DELETE /api/patients/:id
// @access  Private
exports.deletePatient = async (req, res) => {
  try {
    const doctorId = req.user.role === 'LabTech' ? req.user.parentDoctorId : req.user.id;
    const patient = await Patient.findOne({ _id: req.params.id, doctorId });

    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    // Cascade delete associated reports
    await ReportInstance.deleteMany({ patientId: patient._id });
    
    await patient.deleteOne();

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error('deletePatient error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to delete patient' });
  }
};
