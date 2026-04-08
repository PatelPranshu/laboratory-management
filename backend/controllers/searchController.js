const Patient = require('../models/Patient');
const ReportInstance = require('../models/ReportInstance');

// @desc    Global multi-collection live search (Text + Date)
// @route   GET /api/search
// @access  Private
exports.globalSearch = async (req, res) => {
  try {
    const doctorId = req.user.role === 'LabTech' ? req.user.parentDoctorId : req.user.id;
    const { query, fromDate, toDate } = req.query;

    // 1. Initial match criteria (for indexing)
    const baseMatch = { doctorId };

    // 2. Build Date Range Filter
    const dateFilter = {};
    if (fromDate || toDate) {
        dateFilter.createdAt = {};
        if (fromDate) dateFilter.createdAt.$gte = new Date(fromDate);
        if (toDate) {
            const end = new Date(toDate);
            end.setHours(23, 59, 59, 999);
            dateFilter.createdAt.$lte = end;
        }
    }

    // 3. Build Text Search Criteria
    let textFilter = {};
    if (query && typeof query === 'string' && query.trim().length >= 2) {
        const sanitizedQuery = query.trim().substring(0, 50);
        const searchRegex = new RegExp('^' + sanitizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        textFilter = {
            $or: [
                { name: { $regex: searchRegex } },
                { phone: { $regex: searchRegex } }
            ]
        };
    } else if (!fromDate && !toDate) {
        // Return empty if no query AND no date filters provided
        return res.status(200).json({ success: true, data: { patients: [], reports: [] } });
    }

    // Merge match criteria
    const finalPatientMatch = { ...baseMatch, ...dateFilter, ...textFilter };

    // Search Patients
    const patients = await Patient.find(finalPatientMatch)
      .select('_id name phone age gender createdAt')
      .limit(8)
      .sort({ createdAt: -1 })
      .lean();

    // Search Reports (Merge matching patient filter if needed)
    const reportMatch = { ...baseMatch, ...dateFilter };
    if (Object.keys(textFilter).length > 0) {
        // We'll use populate match to filter reports by patient name if text search is active
    }

    const reports = await ReportInstance.find(reportMatch)
      .populate({
        path: 'patientId',
        match: textFilter.$or ? { name: textFilter.$or[0].name } : {}, // Simplification for population match
        select: 'name phone'
      })
      .select('_id patientId date status createdAt')
      .limit(20)
      .sort({ createdAt: -1 })
      .lean();

    // Filter out reports that don't match populated patient name (if searching by text)
    const filteredReports = reports
        .filter(r => !Object.keys(textFilter).length || r.patientId)
        .slice(0, 8);

    res.status(200).json({
      success: true,
      data: {
        patients,
        reports: filteredReports
      }
    });
  } catch (error) {
    console.error('globalSearch error:', error.message);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
};
