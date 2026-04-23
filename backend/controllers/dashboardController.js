const Patient = require('../models/Patient');
const ReportInstance = require('../models/ReportInstance');
const User = require('../models/User');
const mongoose = require('mongoose');

// @desc    Get dashboard summary
// @route   GET /api/dashboard/summary
// @access  Private
exports.getSummary = async (req, res) => {
  try {
    const adminId = req.user.role === 'Admin' ? req.user.id : req.user.parentAdminId;
    const user = await User.findById(adminId).select('stats');
    const stats = user?.stats || { totalPatients: 0, totalReports: 0, pendingReports: 0, sentReports: 0, weeklyReports: [] };

    const totalPatients = stats.totalPatients;
    const totalReports = stats.totalReports;
    const pendingReports = stats.pendingReports;
    const sentReports = stats.sentReports;
    const weeklyReports = stats.weeklyReports;

    // Convert to ObjectId for aggregation pipeline
    const adminObjectId = new mongoose.Types.ObjectId(adminId);
    let patientQuery = { doctorId: adminId };
    let reportQuery = { doctorId: adminId };

    // Last 5 patients added (Minimal scan - limit 5)
    const recentPatients = await Patient.find(patientQuery)
      .sort({ createdAt: -1 })
      .limit(5);

    // Last 5 reports generated (Minimal scan - limit 5)
    const recentReports = await ReportInstance.find(reportQuery)
      .populate('patientId', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

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

// @desc    Force re-sync of dashboard statistics
// @route   POST /api/dashboard/sync-stats
// @access  Private
exports.syncStats = async (req, res) => {
  try {
    const adminId = req.user.role === 'Admin' ? req.user.id : req.user.parentAdminId;
    const adminObjectId = new mongoose.Types.ObjectId(adminId);

    // Recount all values from database (Full Scan)
    const totalPatients = await Patient.countDocuments({ doctorId: adminId });
    const totalReports = await ReportInstance.countDocuments({ doctorId: adminId });
    const pendingReports = await ReportInstance.countDocuments({ 
      doctorId: adminId, 
      status: 'draft' 
    });
    const sentReports = await ReportInstance.countDocuments({ 
      doctorId: adminId, 
      status: 'sent' 
    });

    // Calculate weekly report stats (Expensive Aggregation)
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

    const weeklyReports = weeklyReportsAgg.map(day => ({ date: day._id, count: day.count }));

    const stats = {
      totalPatients,
      totalReports,
      pendingReports,
      sentReports,
      weeklyReports
    };

    // Update User Cache
    await User.findByIdAndUpdate(adminId, { stats });

    res.status(200).json({
      success: true,
      message: 'Statistics synchronized successfully',
      data: stats
    });
  } catch (error) {
    console.error('syncStats error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to synchronize statistics' });
  }
};
