const Signature = require('../models/Signature');
const User = require('../models/User');
const { deleteFromCloudinary } = require('../utils/cloudinary');

// @desc    Add a new signature
// @route   POST /api/signatures
// @access  Private (Admin, Doctor, LabTech)
exports.addSignature = async (req, res) => {
    const { fullName, signatureUrl } = req.body;

    if (!signatureUrl || (!fullName && req.user.role === 'Admin')) {
      const err = new Error('Name and signature URL are required');
      err.statusCode = 400;
      throw err;
    }

    // Validate URL format
    try {
      const parsed = new URL(signatureUrl);
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        const err = new Error('Signature URL must use HTTPS');
        err.statusCode = 400;
        throw err;
      }
    } catch (e) {
      const err = new Error('Invalid URL format');
      err.statusCode = 400;
      throw err;
    }

    const labId = req.user.role === 'Admin' ? req.user.id : req.user.parentAdminId;

    const signature = await Signature.create({
      userId: req.user.id,
      parentAdminId: labId,
      fullName: fullName || req.user.name,
      signatureUrl
    });

    res.status(201).json({ success: true, data: signature });
};

// @desc    Get all signatures for the tenant lab
// @route   GET /api/signatures
// @access  Private (All staff)
exports.getSignatures = async (req, res) => {
    // Find parentAdminId for the current user (Standardized fallback)
    let labId = req.user.role === 'Admin' ? req.user.id : (req.user.parentAdminId || req.user.id);

    // Resolve the query (Admin sees all, Staff sees only their own)
    const query = { parentAdminId: labId };
    if (req.user.role !== 'Admin') {
        query.$or = [
            { userId: req.user.id },
            { doctorId: req.user.id } // Backwards compatibility for old records
        ];
    }

    const signatures = await Signature.find(query).lean();
    
    // Backwards compatibility mapping
    const mappedSignatures = signatures.map(sig => ({
      ...sig,
      fullName: sig.fullName || sig.doctorName || 'Unknown',
      userId: sig.userId || sig.doctorId || sig._id
    }));
    
    res.status(200).json({ success: true, count: mappedSignatures.length, data: mappedSignatures });
  };

// @desc    Delete a signature
// @route   DELETE /api/signatures/:id
// @access  Private (Admin only)
exports.deleteSignature = async (req, res) => {
    const signature = await Signature.findById(req.params.id);

    if (!signature) {
      return res.status(404).json({ success: false, error: 'Signature not found' });
    }

    // Authorization Logic:
    // 1. Admins can delete any signature in their lab
    // 2. Staff can only delete their own signature
    const isAdminOfLab = req.user.role === 'Admin' && signature.parentAdminId.toString() === req.user.id.toString();
    const isRecordOwner = (signature.userId || signature.doctorId)?.toString() === req.user.id.toString();

    if (!isAdminOfLab && !isRecordOwner) {
       return res.status(403).json({ success: false, error: 'Not authorized to delete this signature. You can only delete your own identity.' });
    }

    // Delete image from Cloudinary
    if (signature.signatureUrl) {
      await deleteFromCloudinary(signature.signatureUrl);
    }

    await signature.deleteOne();
    res.status(200).json({ success: true, data: {} });
  };
