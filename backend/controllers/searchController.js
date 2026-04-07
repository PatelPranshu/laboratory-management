const Patient = require('../models/Patient');
const ReportInstance = require('../models/ReportInstance');

// @desc    Global multi-collection text search
// @route   GET /api/search
// @access  Private
exports.globalSearch = async (req, res) => {
  try {
    const doctorId = req.user.role === 'LabTech' ? req.user.parentDoctorId : req.user.id;
    const { query } = req.query;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
       return res.status(400).json({ success: false, error: 'Please provide a search query' });
    }

    // Sanitize: limit query length to prevent abuse
    const sanitizedQuery = query.trim().substring(0, 200);

    // Search Patients
    const patients = await Patient.find({
        doctorId,
        $text: { $search: sanitizedQuery }
    }).limit(10);

    // Search Reports
    const reports = await ReportInstance.find({
        doctorId,
        $text: { $search: sanitizedQuery }
    }).populate('patientId', 'name phone').limit(10);

    res.status(200).json({
      success: true,
      data: {
        patients,
        reports
      }
    });
  } catch (error) {
    console.error('globalSearch error:', error.message);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
};
