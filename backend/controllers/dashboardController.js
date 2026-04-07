const Patient = require('../models/Patient');
const ReportInstance = require('../models/ReportInstance');
const mongoose = require('mongoose');

// @desc    Get dashboard summary
// @route   GET /api/dashboard/summary
// @access  Private
exports.getSummary = async (req, res) => {
  try {
    const doctorId = req.user.role === 'LabTech' ? req.user.parentDoctorId : req.user.id;

    // Convert to ObjectId for aggregation pipeline (aggregations don't auto-cast strings)
    const doctorObjectId = new mongoose.Types.ObjectId(doctorId);

    const totalPatients = await Patient.countDocuments({ doctorId });
    const totalReports = await ReportInstance.countDocuments({ doctorId });
    const pendingReports = await ReportInstance.countDocuments({ doctorId, status: { $in: ['draft', 'saved'] } });
    const sentReports = await ReportInstance.countDocuments({ doctorId, status: 'sent' });

    // Last 5 patients added
    const recentPatients = await Patient.find({ doctorId })
      .sort({ createdAt: -1 })
      .limit(5);

    // Last 5 reports generated
    const recentReports = await ReportInstance.find({ doctorId })
      .populate('patientId', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    // Calculate weekly report stats
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Aggregate reports grouped by day for the last 7 days
    // BUG FIX: Use ObjectId type for doctorId in aggregate $match
    const weeklyReportsAgg = await ReportInstance.aggregate([
      { $match: { doctorId: doctorObjectId, createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Format for frontend array
    const weeklyReports = weeklyReportsAgg.map(day => ({ date: day._id, count: day.count }));

    res.status(200).json({
      success: true,
      data: {
        totalPatients,
        totalReports,
        pendingReports,
        sentReports,
        recentPatients,
        recentReports,
        weeklyReports
      }
    });
  } catch (error) {
    console.error('getSummary error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve dashboard data' });
  }
};
