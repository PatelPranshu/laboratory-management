const User = require('../models/User');
const ReportInstance = require('../models/ReportInstance');
const { invalidateAuthCache } = require('../middlewares/authMiddleware');

// @desc    Get Platform Stats
// @route   GET /api/superadmin/stats
// @access  Private (SuperAdmin only)
exports.getPlatformStats = async (req, res) => {
  // Run all 5 counts in parallel instead of sequential
  const [totalLabs, suspendedLabs, deletedLabs, totalUsers, totalReports] = await Promise.all([
    User.countDocuments({ role: 'Admin', accountStatus: 'Active', isDeleted: false }),
    User.countDocuments({ role: 'Admin', accountStatus: 'Suspended', isDeleted: false }),
    User.countDocuments({ role: 'Admin', isDeleted: true }),
    User.countDocuments({ role: { $in: ['Doctor', 'LabTech'] }, isDeleted: false }),
    ReportInstance.countDocuments()
  ]);

  res.status(200).json({
    success: true,
    data: { totalLabs, suspendedLabs, deletedLabs, totalUsers, totalReports }
  });
};

// @desc    Get All Labs
// @route   GET /api/superadmin/labs
// @access  Private (SuperAdmin only)
exports.getAllLabs = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const startIndex = (page - 1) * limit;

  const [labs, total] = await Promise.all([
    User.find({ role: 'Admin' })
      .select('-password -__v -stats')
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limit)
      .lean(),
    User.countDocuments({ role: 'Admin' })
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

  res.status(200).json({ success: true, data: lab });
};

const Patient = require('../models/Patient');

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
      stats: { totalReports, pendingReports, totalPatients },
      staff
    }
  });
};

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

  if (name) staff.name = name;
  if (role && ['Admin', 'Doctor', 'LabTech'].includes(role)) {
    if (staff.role === 'Admin' && role !== 'Admin') {
      return res.status(400).json({ success: false, error: 'Cannot change the role of the Lab Owner' });
    }
    staff.role = role;
  }
  
  await staff.save();
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

  if (hardDelete) {
    await User.findByIdAndDelete(staffId);
    return res.status(200).json({ success: true, message: 'Staff permanently deleted' });
  } else {
    staff.isDeleted = true;
    staff.deletedAt = new Date();
    await staff.save();
    return res.status(200).json({ success: true, message: 'Staff soft-deleted (will be removed in 30 days)' });
  }
};

const SystemSettings = require('../models/SystemSettings');

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

  let settings = await SystemSettings.findOne({ key: 'deletionReasons' });
  if (!settings) {
    settings = new SystemSettings({ key: 'deletionReasons' });
  }
  
  settings.value = reasons;
  await settings.save();
  
  res.status(200).json({ success: true, data: settings.value });
};
