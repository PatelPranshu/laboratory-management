const User = require('../models/User');
const ReportInstance = require('../models/ReportInstance');
const Patient = require('../models/Patient');
const AuditLog = require('../models/AuditLog');
const SystemSettings = require('../models/SystemSettings');
const { invalidateAuthCache } = require('../middlewares/authMiddleware');
const mongoose = require('mongoose');

// --------------- Helpers ---------------

/**
 * Extracts client IP from request, handling proxies.
 * @param {object} req - Express request object
 * @returns {string} Client IP address
 */
const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
};

/**
 * Creates an audit log entry. Fire-and-forget — never blocks the response.
 */
const logAudit = async (action, performedBy, targetId, targetType, details, ipAddress, metadata = null) => {
  try {
    await AuditLog.create({
      action,
      performedBy,
      targetId,
      targetType,
      details: String(details).slice(0, 500),
      ipAddress,
      metadata
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write audit log:', err.message);
  }
};

// --------------- Platform Stats ---------------

// @desc    Get Platform Stats (Enhanced)
// @route   GET /api/superadmin/stats
// @access  Private (SuperAdmin only)
exports.getPlatformStats = async (req, res) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    totalLabs,
    suspendedLabs,
    deletedLabs,
    pendingLabs,
    newLabsThisWeek,
    totalDoctors,
    totalLabTechs,
    totalReports
  ] = await Promise.all([
    User.countDocuments({ role: 'Admin', accountStatus: 'Active', isDeleted: false }),
    User.countDocuments({ role: 'Admin', accountStatus: 'Suspended', isDeleted: false }),
    User.countDocuments({ role: 'Admin', isDeleted: true }),
    User.countDocuments({ role: 'Admin', accountStatus: 'Pending', isDeleted: false }),
    User.countDocuments({ role: 'Admin', isDeleted: false, createdAt: { $gte: sevenDaysAgo } }),
    User.countDocuments({ role: 'Doctor', isDeleted: false }),
    User.countDocuments({ role: 'LabTech', isDeleted: false }),
    ReportInstance.countDocuments()
  ]);

  const totalUsers = totalDoctors + totalLabTechs;

  res.status(200).json({
    success: true,
    data: {
      totalLabs,
      suspendedLabs,
      deletedLabs,
      pendingLabs,
      newLabsThisWeek,
      totalUsers,
      totalDoctors,
      totalLabTechs,
      totalReports
    }
  });
};

// --------------- Lab Management ---------------

// @desc    Get All Labs (with search and filter)
// @route   GET /api/superadmin/labs
// @access  Private (SuperAdmin only)
exports.getAllLabs = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const startIndex = (page - 1) * limit;
  const search = req.query.search ? req.query.search.trim() : '';
  const statusFilter = req.query.status; // 'Active', 'Suspended', 'Deleted'

  // Build query
  const query = { role: 'Admin' };

  if (statusFilter === 'Deleted') {
    query.isDeleted = true;
  } else if (statusFilter === 'Active') {
    query.accountStatus = 'Active';
    query.isDeleted = false;
  } else if (statusFilter === 'Suspended') {
    query.accountStatus = 'Suspended';
    query.isDeleted = false;
  } else if (statusFilter === 'Pending') {
    query.accountStatus = 'Pending';
    query.isDeleted = false;
  } else {
    query.isDeleted = { $ne: true };
  }

  // Search by lab name or email
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { labName: { $regex: escapedSearch, $options: 'i' } },
      { email: { $regex: escapedSearch, $options: 'i' } },
      { name: { $regex: escapedSearch, $options: 'i' } }
    ];
  }

  const [labs, total] = await Promise.all([
    User.find(query)
      .select('-password -__v -stats')
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limit)
      .lean(),
    User.countDocuments(query)
  ]);

  res.status(200).json({
    success: true,
    count: labs.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: labs
  });
};

// @desc    Update Lab Status (Suspend / Activate)
// @route   PUT /api/superadmin/labs/:id/status
// @access  Private (SuperAdmin only)
exports.updateLabStatus = async (req, res) => {
  const { status } = req.body;
  if (!['Active', 'Suspended'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' });
  }

  const lab = await User.findById(req.params.id);
  if (!lab || lab.role !== 'Admin') {
    return res.status(404).json({ success: false, error: 'Lab Admin not found' });
  }

  const oldStatus = lab.accountStatus;
  lab.accountStatus = status;
  await lab.save();

  // Cascade status to staff
  const staffUsers = await User.find({ parentAdminId: lab._id }).select('_id');
  await User.updateMany(
    { parentAdminId: lab._id },
    { $set: { accountStatus: status } }
  );

  // Invalidate auth cache for lab + all staff
  invalidateAuthCache(lab._id);
  staffUsers.forEach(s => invalidateAuthCache(s._id));

  // Audit log
  const action = status === 'Suspended' ? 'LAB_SUSPENDED' : 'LAB_ACTIVATED';
  logAudit(action, req.user.id, lab._id, 'Lab',
    `Lab "${lab.labName}" (${lab.email}) changed from ${oldStatus} to ${status}`,
    getClientIp(req)
  );

  res.status(200).json({ success: true, data: lab });
};

// @desc    Restore Deleted Lab
// @route   PUT /api/superadmin/labs/:id/restore
// @access  Private (SuperAdmin only)
exports.restoreLab = async (req, res) => {
  const lab = await User.findById(req.params.id);
  if (!lab || lab.role !== 'Admin') {
    return res.status(404).json({ success: false, error: 'Lab Admin not found' });
  }

  lab.isDeleted = false;
  lab.deletedAt = undefined;
  lab.deletionReason = undefined;
  lab.holdDeletion = false;
  await lab.save();

  // Cascade restore to staff
  const staffUsers = await User.find({ parentAdminId: lab._id }).select('_id');
  await User.updateMany(
    { parentAdminId: lab._id },
    { 
      $set: { isDeleted: false, holdDeletion: false },
      $unset: { deletedAt: 1, deletionReason: 1 }
    }
  );

  invalidateAuthCache(lab._id);
  staffUsers.forEach(s => invalidateAuthCache(s._id));

  // Audit log
  logAudit('LAB_RESTORED', req.user.id, lab._id, 'Lab',
    `Lab "${lab.labName}" (${lab.email}) restored from deletion`,
    getClientIp(req)
  );

  res.status(200).json({ success: true, data: lab });
};

// @desc    Toggle Hold Deletion
// @route   PUT /api/superadmin/labs/:id/hold
// @access  Private (SuperAdmin only)
exports.toggleHoldDeletion = async (req, res) => {
  const lab = await User.findById(req.params.id);
  if (!lab || lab.role !== 'Admin') {
    return res.status(404).json({ success: false, error: 'Lab Admin not found' });
  }

  lab.holdDeletion = !lab.holdDeletion;
  await lab.save();

  // Audit log
  logAudit('LAB_HOLD_TOGGLED', req.user.id, lab._id, 'Lab',
    `Lab "${lab.labName}" hold deletion ${lab.holdDeletion ? 'enabled' : 'disabled'}`,
    getClientIp(req)
  );

  res.status(200).json({ success: true, data: lab });
};

// @desc    Get Lab Profile Details
// @route   GET /api/superadmin/labs/:id/details
// @access  Private (SuperAdmin only)
exports.getLabDetails = async (req, res) => {
  const adminId = req.params.id;
  const admin = await User.findById(adminId);
  if (!admin || admin.role !== 'Admin') {
    return res.status(404).json({ success: false, error: 'Lab Admin not found' });
  }

  // Run all 3 counts + staff query in parallel
  const [totalReports, pendingReports, totalPatients, staff] = await Promise.all([
    ReportInstance.countDocuments({ doctorId: adminId }),
    ReportInstance.countDocuments({ doctorId: adminId, status: 'draft' }),
    Patient.countDocuments({ doctorId: adminId }),
    User.find({
      $or: [{ _id: adminId }, { parentAdminId: adminId }]
    }).select('-password -__v -stats').sort({ role: 1 }).lean()
  ]);

  res.status(200).json({
    success: true,
    data: {
      labName: admin.labName,
      status: admin.accountStatus,
      isDeleted: admin.isDeleted,
      createdAt: admin.createdAt,
      email: admin.email,
      stats: { totalReports, pendingReports, totalPatients },
      staff
    }
  });
};

// --------------- Staff Management ---------------

// @desc    Update Lab Staff
// @route   PUT /api/superadmin/labs/:id/staff/:staffId
// @access  Private (SuperAdmin only)
exports.updateLabStaff = async (req, res) => {
  const { name, role } = req.body;
  const { id: adminId, staffId } = req.params;

  const staff = await User.findOne({ _id: staffId, $or: [{ _id: adminId }, { parentAdminId: adminId }] });
  if (!staff) {
    return res.status(404).json({ success: false, error: 'Staff member not found in this lab' });
  }

  const oldRole = staff.role;

  if (name) staff.name = name;
  if (role && ['Admin', 'Doctor', 'LabTech'].includes(role)) {
    if (staff.role === 'Admin' && role !== 'Admin') {
      return res.status(400).json({ success: false, error: 'Cannot change the role of the Lab Owner' });
    }
    staff.role = role;
  }
  
  await staff.save();

  // Audit log
  if (role && role !== oldRole) {
    logAudit('STAFF_ROLE_CHANGED', req.user.id, staff._id, 'Staff',
      `Staff "${staff.name}" (${staff.email}) role changed from ${oldRole} to ${role} in lab ${adminId}`,
      getClientIp(req)
    );
  }

  res.status(200).json({ success: true, data: staff });
};

// @desc    Remove Lab Staff
// @route   DELETE /api/superadmin/labs/:id/staff/:staffId
// @access  Private (SuperAdmin only)
exports.removeLabStaff = async (req, res) => {
  const { id: adminId, staffId } = req.params;
  const hardDelete = req.query.hard === 'true';

  const staff = await User.findOne({ _id: staffId, parentAdminId: adminId });
  if (!staff) {
    return res.status(404).json({ success: false, error: 'Staff member not found or cannot remove Lab Owner' });
  }

  const staffName = staff.name;
  const staffEmail = staff.email;

  if (hardDelete) {
    await User.findByIdAndDelete(staffId);
    logAudit('STAFF_HARD_DELETED', req.user.id, new mongoose.Types.ObjectId(staffId), 'Staff',
      `Staff "${staffName}" (${staffEmail}) permanently deleted from lab ${adminId}`,
      getClientIp(req)
    );
    return res.status(200).json({ success: true, message: 'Staff permanently deleted' });
  } else {
    staff.isDeleted = true;
    staff.deletedAt = new Date();
    await staff.save();
    logAudit('STAFF_REMOVED', req.user.id, staff._id, 'Staff',
      `Staff "${staffName}" (${staffEmail}) soft-deleted from lab ${adminId}`,
      getClientIp(req)
    );
    return res.status(200).json({ success: true, message: 'Staff soft-deleted (will be removed in 30 days)' });
  }
};

// --------------- Force Password Reset ---------------

// @desc    Force password reset for a lab admin and all their staff
// @route   POST /api/superadmin/labs/:id/force-password-reset
// @access  Private (SuperAdmin only)
exports.forcePasswordReset = async (req, res) => {
  const lab = await User.findById(req.params.id);
  if (!lab || lab.role !== 'Admin') {
    return res.status(404).json({ success: false, error: 'Lab Admin not found' });
  }

  // Set passwordChangedAt to Date.now() for admin and all staff to instantly invalidate their sessions
  const staffUsers = await User.find({ parentAdminId: lab._id }).select('_id');
  const allUserIds = [lab._id, ...staffUsers.map(s => s._id)];

  await User.updateMany(
    { _id: { $in: allUserIds } },
    { $set: { passwordChangedAt: new Date() } }
  );

  // Invalidate auth cache so they get forced on next request
  allUserIds.forEach(id => invalidateAuthCache(id));

  // Audit log
  logAudit('PASSWORD_RESET_FORCED', req.user.id, lab._id, 'Lab',
    `Forced password reset for lab "${lab.labName}" (${lab.email}) and ${staffUsers.length} staff members`,
    getClientIp(req)
  );

  res.status(200).json({
    success: true,
    message: `Password reset forced for ${allUserIds.length} users (admin + ${staffUsers.length} staff)`
  });
};

// --------------- Permanent Lab Deletion (GDPR) ---------------

// @desc    Permanently delete a lab and ALL associated data
// @route   DELETE /api/superadmin/labs/:id/permanent
// @access  Private (SuperAdmin only)
exports.permanentDeleteLab = async (req, res) => {
  const { confirmEmail } = req.body;

  const lab = await User.findById(req.params.id);
  if (!lab || lab.role !== 'Admin') {
    return res.status(404).json({ success: false, error: 'Lab Admin not found' });
  }

  // Safety: require typing lab email to confirm
  if (!confirmEmail || confirmEmail.toLowerCase() !== lab.email.toLowerCase()) {
    return res.status(400).json({
      success: false,
      error: 'Confirmation failed. Please type the lab admin email to confirm permanent deletion.'
    });
  }

  const labName = lab.labName;
  const labEmail = lab.email;
  const labId = lab._id;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Count for audit before deletion
    const [staffCount, patientCount, reportCount] = await Promise.all([
      User.countDocuments({ parentAdminId: labId }),
      Patient.countDocuments({ doctorId: labId }),
      ReportInstance.countDocuments({ doctorId: labId })
    ]);

    // 2. Delete all reports for this lab
    await ReportInstance.deleteMany({ doctorId: labId }, { session });

    // 3. Delete all patients for this lab
    await Patient.deleteMany({ doctorId: labId }, { session });

    // 4. Delete all staff users
    await User.deleteMany({ parentAdminId: labId }, { session });

    // 5. Delete the lab admin
    await User.findByIdAndDelete(labId, { session });

    // 6. Invalidate caches
    invalidateAuthCache(labId);

    await session.commitTransaction();
    session.endSession();

    // Audit log (outside transaction — the lab no longer exists)
    logAudit('LAB_PERMANENTLY_DELETED', req.user.id, labId, 'Lab',
      `Lab "${labName}" (${labEmail}) permanently deleted. Cascade: ${staffCount} staff, ${patientCount} patients, ${reportCount} reports`,
      getClientIp(req),
      { staffCount, patientCount, reportCount }
    );

    res.status(200).json({
      success: true,
      message: `Lab "${labName}" and all associated data permanently deleted`,
      deletedCounts: { staff: staffCount, patients: patientCount, reports: reportCount }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

// --------------- Audit Logs ---------------

// @desc    Get Audit Logs
// @route   GET /api/superadmin/audit-logs
// @access  Private (SuperAdmin only)
exports.getAuditLogs = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
  const startIndex = (page - 1) * limit;
  const actionFilter = req.query.action;
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;

  const query = {};

  if (actionFilter) {
    query.action = actionFilter;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .populate('performedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(query)
  ]);

  res.status(200).json({
    success: true,
    count: logs.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: logs
  });
};

// --------------- Data Export ---------------

// @desc    Export Labs as CSV
// @route   GET /api/superadmin/export/labs
// @access  Private (SuperAdmin only)
exports.exportLabsCsv = async (req, res) => {
  const labs = await User.find({ role: 'Admin' })
    .select('labName name email accountStatus isDeleted createdAt deletedAt deletionReason')
    .sort({ createdAt: -1 })
    .lean();

  // Get staff counts per lab in a single aggregation
  const staffCounts = await User.aggregate([
    { $match: { role: { $in: ['Doctor', 'LabTech'] }, parentAdminId: { $exists: true } } },
    { $group: { _id: '$parentAdminId', count: { $sum: 1 } } }
  ]);
  const staffMap = {};
  staffCounts.forEach(s => { staffMap[s._id.toString()] = s.count; });

  // Get report counts per lab
  const reportCounts = await ReportInstance.aggregate([
    { $group: { _id: '$doctorId', count: { $sum: 1 } } }
  ]);
  const reportMap = {};
  reportCounts.forEach(r => { reportMap[r._id.toString()] = r.count; });

  // Build CSV
  const headers = ['Lab Name', 'Owner Name', 'Email', 'Status', 'Is Deleted', 'Staff Count', 'Report Count', 'Joined Date', 'Deleted Date', 'Deletion Reason'];
  const csvRows = [headers.join(',')];

  labs.forEach(lab => {
    const status = lab.isDeleted ? 'Deleted' : lab.accountStatus;
    const row = [
      `"${(lab.labName || '').replace(/"/g, '""')}"`,
      `"${(lab.name || '').replace(/"/g, '""')}"`,
      `"${lab.email}"`,
      status,
      lab.isDeleted ? 'Yes' : 'No',
      staffMap[lab._id.toString()] || 0,
      reportMap[lab._id.toString()] || 0,
      lab.createdAt ? new Date(lab.createdAt).toISOString().split('T')[0] : '',
      lab.deletedAt ? new Date(lab.deletedAt).toISOString().split('T')[0] : '',
      `"${(lab.deletionReason || '').replace(/"/g, '""')}"`
    ];
    csvRows.push(row.join(','));
  });

  // Audit log
  logAudit('DATA_EXPORTED', req.user.id, null, 'System',
    `Exported ${labs.length} labs as CSV`,
    getClientIp(req)
  );

  const csvContent = csvRows.join('\n');
  const filename = `labs-export-${new Date().toISOString().split('T')[0]}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(csvContent);
};

// --------------- Announcements ---------------

// @desc    Create Announcement
// @route   POST /api/superadmin/announcements
// @access  Private (SuperAdmin only)
exports.createAnnouncement = async (req, res) => {
  const { title, message, type } = req.body;

  if (!title || !message) {
    return res.status(400).json({ success: false, error: 'Title and message are required' });
  }

  if (title.length > 100) {
    return res.status(400).json({ success: false, error: 'Title cannot exceed 100 characters' });
  }
  if (message.length > 500) {
    return res.status(400).json({ success: false, error: 'Message cannot exceed 500 characters' });
  }

  const validTypes = ['info', 'warning', 'critical'];
  const announcementType = validTypes.includes(type) ? type : 'info';

  let settings = await SystemSettings.findOne({ key: 'announcements' });
  if (!settings) {
    settings = new SystemSettings({ key: 'announcements', value: [] });
  }

  const announcement = {
    id: new mongoose.Types.ObjectId().toString(),
    title: title.trim(),
    message: message.trim(),
    type: announcementType,
    createdBy: req.user.id,
    createdAt: new Date().toISOString()
  };

  // Keep max 20 announcements
  const announcements = settings.value || [];
  announcements.unshift(announcement);
  if (announcements.length > 20) announcements.length = 20;

  settings.value = announcements;
  settings.markModified('value');
  await settings.save();

  // Audit log
  logAudit('ANNOUNCEMENT_CREATED', req.user.id, null, 'System',
    `Created announcement: "${title.trim()}" (${announcementType})`,
    getClientIp(req)
  );

  // Emit via socket to all connected users
  try {
    const socketService = require('../services/socketService');
    const io = socketService.getIO();
    io.emit('system_announcement', announcement);
  } catch (err) {
    // Socket not initialized — ignore
  }

  res.status(201).json({ success: true, data: announcement });
};

// @desc    Get Announcements
// @route   GET /api/superadmin/announcements
// @access  Private (SuperAdmin only)
exports.getAnnouncements = async (req, res) => {
  const settings = await SystemSettings.findOne({ key: 'announcements' });
  const announcements = settings?.value || [];

  res.status(200).json({ success: true, data: announcements });
};

// @desc    Delete Announcement
// @route   DELETE /api/superadmin/announcements/:announcementId
// @access  Private (SuperAdmin only)
exports.deleteAnnouncement = async (req, res) => {
  const { announcementId } = req.params;

  const settings = await SystemSettings.findOne({ key: 'announcements' });
  if (!settings || !settings.value) {
    return res.status(404).json({ success: false, error: 'No announcements found' });
  }

  const announcements = settings.value;
  const index = announcements.findIndex(a => a.id === announcementId);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Announcement not found' });
  }

  const removed = announcements.splice(index, 1)[0];
  settings.value = announcements;
  settings.markModified('value');
  await settings.save();

  // Audit log
  logAudit('ANNOUNCEMENT_DELETED', req.user.id, null, 'System',
    `Deleted announcement: "${removed.title}"`,
    getClientIp(req)
  );

  res.status(200).json({ success: true, message: 'Announcement deleted' });
};

// --------------- Settings ---------------

// @desc    Get Deletion Reasons
// @route   GET /api/superadmin/settings/deletion-reasons
// @access  Private (SuperAdmin or Admin)
exports.getDeletionReasons = async (req, res) => {
  let settings = await SystemSettings.findOne({ key: 'deletionReasons' });
  if (!settings) {
    const defaultReasons = ['Too expensive', 'Missing features', 'Hard to use', 'Business closed', 'Other'];
    settings = await SystemSettings.create({ key: 'deletionReasons', value: defaultReasons });
  }
  res.status(200).json({ success: true, data: settings.value });
};

// @desc    Update Deletion Reasons
// @route   PUT /api/superadmin/settings/deletion-reasons
// @access  Private (SuperAdmin only)
exports.updateDeletionReasons = async (req, res) => {
  const { reasons } = req.body;
  if (!Array.isArray(reasons)) {
    return res.status(400).json({ success: false, error: 'reasons must be an array of strings' });
  }

  // Sanitize: only strings, max 50 chars each, max 20 reasons
  const sanitized = reasons
    .filter(r => typeof r === 'string' && r.trim().length > 0)
    .map(r => r.trim().slice(0, 50))
    .slice(0, 20);

  let settings = await SystemSettings.findOne({ key: 'deletionReasons' });
  if (!settings) {
    settings = new SystemSettings({ key: 'deletionReasons' });
  }
  
  settings.value = sanitized;
  await settings.save();

  // Audit log
  logAudit('DELETION_REASONS_UPDATED', req.user.id, null, 'System',
    `Updated deletion reasons (${sanitized.length} items)`,
    getClientIp(req)
  );
  
  res.status(200).json({ success: true, data: settings.value });
};
