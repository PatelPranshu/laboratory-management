const Patient = require('../models/Patient');
const ReportInstance = require('../models/ReportInstance');
const User = require('../models/User');
const mongoose = require('mongoose');

// Self-healing recount cooldown: 5 minutes per admin
const RECOUNT_COOLDOWN_MS = 5 * 60 * 1000;
const lastRecountMap = new Map();

/**
 * Performs a lightweight recount of all 4 dashboard counters.
 * Returns accurate values from actual DB counts.
 * @param {string} adminId
 * @returns {Promise<{totalPatients: number, totalReports: number, pendingReports: number, sentReports: number}>}
 */
async function recountStats(adminId) {
  const [totalPatients, totalReports, pendingReports, sentReports] = await Promise.all([
    Patient.countDocuments({ doctorId: adminId }),
    ReportInstance.countDocuments({ doctorId: adminId }),
    ReportInstance.countDocuments({ doctorId: adminId, status: { $in: ['draft', 'DRAFT'] } }),
    ReportInstance.countDocuments({ doctorId: adminId, status: 'sent' })
  ]);

  return { totalPatients, totalReports, pendingReports, sentReports };
}

/**
 * Checks if recount is needed (cooldown expired) and performs self-healing
 * if cached stats have drifted from actual DB values.
 * @param {string} adminId
 * @param {object} cachedStats - Current stats from User document
 * @returns {Promise<object>} - Accurate stats (either cached if correct, or recounted)
 */
async function selfHealIfNeeded(adminId, cachedStats) {
  const adminKey = String(adminId);
  const lastRecount = lastRecountMap.get(adminKey) || 0;
  const now = Date.now();

  // Skip recount if within cooldown
  if (now - lastRecount < RECOUNT_COOLDOWN_MS) {
    return cachedStats;
  }

  lastRecountMap.set(adminKey, now);

  // Evict stale entries to prevent memory leak (keep max 200 entries)
  if (lastRecountMap.size > 200) {
    const cutoff = now - RECOUNT_COOLDOWN_MS * 3;
    for (const [key, ts] of lastRecountMap) {
      if (ts < cutoff) lastRecountMap.delete(key);
    }
  }

  const accurate = await recountStats(adminId);

  // Check for drift
  const hasDrift =
    cachedStats.totalPatients !== accurate.totalPatients ||
    cachedStats.totalReports !== accurate.totalReports ||
    cachedStats.pendingReports !== accurate.pendingReports ||
    cachedStats.sentReports !== accurate.sentReports;

  if (hasDrift) {
    // Silently fix with $set (not $inc — avoids compounding errors)
    await User.findByIdAndUpdate(adminId, {
      $set: {
        'stats.totalPatients': accurate.totalPatients,
        'stats.totalReports': accurate.totalReports,
        'stats.pendingReports': accurate.pendingReports,
        'stats.sentReports': accurate.sentReports
      }
    });
  }

  return accurate;
}

// @desc    Get dashboard summary
// @route   GET /api/dashboard/summary
// @access  Private
exports.getSummary = async (req, res) => {
    const adminId = req.user.role === 'Admin' ? req.user.id : req.user.parentAdminId;
    const user = await User.findById(adminId).select('stats');
    const cachedStats = user?.stats || { totalPatients: 0, totalReports: 0, pendingReports: 0, sentReports: 0, weeklyReports: [] };

    // Self-healing: recount from DB every 5 min and fix drift silently
    const stats = await selfHealIfNeeded(adminId, cachedStats);

    let patientQuery = { doctorId: adminId };
    let reportQuery = { doctorId: adminId };

    // Last 5 patients + last 5 reports in parallel (minimal field projection)
    const [recentPatients, recentReports] = await Promise.all([
      Patient.find(patientQuery)
        .select('name phone age gender createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      ReportInstance.find(reportQuery)
        .select('patientId date status createdAt')
        .populate('patientId', 'name')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalPatients: stats.totalPatients,
        totalReports: stats.totalReports,
        pendingReports: stats.pendingReports,
        sentReports: stats.sentReports,
        recentPatients,
        recentReports,
        weeklyReports: cachedStats.weeklyReports || []
      }
    });
  };

// @desc    Force re-sync of dashboard statistics
// @route   POST /api/dashboard/sync-stats
// @access  Private
exports.syncStats = async (req, res) => {
    const adminId = req.user.role === 'Admin' ? req.user.id : req.user.parentAdminId;
    const adminObjectId = new mongoose.Types.ObjectId(adminId);

    // Recount all values from database (Full Scan)
    const accurate = await recountStats(adminId);

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
      ...accurate,
      weeklyReports
    };

    // Update User Cache with $set (authoritative source of truth)
    await User.findByIdAndUpdate(adminId, { stats });

    // Reset recount cooldown so next getSummary uses fresh cache
    lastRecountMap.set(String(adminId), Date.now());

    res.status(200).json({
      success: true,
      message: 'Statistics synchronized successfully',
      data: stats
    });
  };
