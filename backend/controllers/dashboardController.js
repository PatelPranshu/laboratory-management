const Patient = require('../models/Patient');
const ReportInstance = require('../models/ReportInstance');
const mongoose = require('mongoose');

// @desc    Get dashboard summary
// @route   GET /api/dashboard/summary
// @access  Private
exports.getSummary = async (req, res) => {
  try {
    const adminId = req.user.role === 'Admin' ? req.user.id : req.user.parentAdminId;

    // Convert to ObjectId for aggregation pipeline (aggregations don't auto-cast strings)
    const adminObjectId = new mongoose.Types.ObjectId(adminId);

    let patientQuery = { doctorId: adminId };
    let reportQuery = { doctorId: adminId };

    const totalPatients = await Patient.countDocuments(patientQuery);
    const totalReports = await ReportInstance.countDocuments(reportQuery);
    const pendingReports = await ReportInstance.countDocuments({ ...reportQuery, status: { $in: ['draft', 'saved'] } });
    const sentReports = await ReportInstance.countDocuments({ ...reportQuery, status: 'sent' });

    // Last 5 patients added
    const recentPatients = await Patient.find(patientQuery)
      .sort({ createdAt: -1 })
      .limit(5);

    // Last 5 reports generated
    const recentReports = await ReportInstance.find(reportQuery)
      .populate('patientId', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    // Calculate weekly report stats
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const weeklyMatchQuery = { doctorId: adminObjectId, createdAt: { $gte: sevenDaysAgo } };

    const weeklyReportsAgg = await ReportInstance.aggregate([
      { $match: weeklyMatchQuery },
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
