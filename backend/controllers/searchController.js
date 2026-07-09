const Patient = require('../models/Patient');
const ReportInstance = require('../models/ReportInstance');
const mongoose = require('mongoose');

// @desc    Global multi-collection live search (Text + Date)
// @route   GET /api/search
// @access  Private
exports.globalSearch = async (req, res) => {
    const doctorId = req.user.role === 'LabTech' ? req.user.parentAdminId : req.user.id;
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
    let isSearchQuery = false;
    let sanitizedQuery = '';
    if (query && typeof query === 'string' && query.trim().length >= 2) {
        sanitizedQuery = query.trim().substring(0, 50);

        // If it looks like an ObjectId, do direct _id match (index-backed)
        if (mongoose.Types.ObjectId.isValid(sanitizedQuery) && sanitizedQuery.length === 24) {
            textFilter = { _id: sanitizedQuery };
        } else {
            const searchRegex = new RegExp('^' + sanitizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            textFilter = {
                $or: [
                    { name: { $regex: searchRegex } },
                    { phone: { $regex: searchRegex } }
                ]
            };
        }
        isSearchQuery = true;
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

    // Search Reports
    let reportMatch = { ...baseMatch, ...dateFilter };
    if (isSearchQuery) {
        // If search is a valid ObjectId, match report _id or patientId directly
        if (mongoose.Types.ObjectId.isValid(sanitizedQuery) && sanitizedQuery.length === 24) {
            reportMatch.$or = [
                { _id: sanitizedQuery },
                { patientId: sanitizedQuery }
            ];
        } else {
            const matchedPatientIds = await Patient.find({ ...baseMatch, ...textFilter }).distinct('_id');
            reportMatch.patientId = { $in: matchedPatientIds };
        }
    }

    const reports = await ReportInstance.find(reportMatch)
      .populate('patientId', 'name phone')
      .select('_id patientId date status createdAt')
      .limit(8)
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: {
        patients,
        reports
      }
    });
  };
