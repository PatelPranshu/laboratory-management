const Signature = require('../models/Signature');
const User = require('../models/User');
const { deleteFromCloudinary } = require('../utils/cloudinary');

// @desc    Add a new signature
// @route   POST /api/signatures
// @access  Private (Admin, Doctor, LabTech)
exports.addSignature = async (req, res) => {
  try {
    const { fullName, signatureUrl } = req.body;

    if (!signatureUrl || (!fullName && req.user.role === 'Admin')) {
      return res.status(400).json({ success: false, error: 'Name and signature URL are required' });
    }

    // Validate URL format
    try {
      const parsed = new URL(signatureUrl);
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        return res.status(400).json({ success: false, error: 'Signature URL must use HTTPS' });
      }
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid signature URL format' });
    }

    // Resolve the Lab ID
    let labId = req.user.role === 'Admin' ? req.user.id : (req.user.parentAdminId || req.user.id);
    
    // For non-admins, they can only manage their own signature
    if (req.user.role !== 'Admin') {
      const existingSign = await Signature.findOne({ userId: req.user.id });
      if (existingSign) {
        // Delete old image from Cloudinary if URL changed
        if (existingSign.signatureUrl && existingSign.signatureUrl !== signatureUrl) {
          await deleteFromCloudinary(existingSign.signatureUrl);
        }
        existingSign.signatureUrl = signatureUrl;
        existingSign.fullName = req.user.name; // Always sync name with profile
        await existingSign.save();
        return res.status(200).json({ success: true, data: existingSign });
      }

      const signature = await Signature.create({
        fullName: req.user.name,
        signatureUrl,
        parentAdminId: labId,
        userId: req.user.id
      });
      return res.status(201).json({ success: true, data: signature });
    }

    // For Admins adding/updating signatures manually
    const signature = await Signature.create({
      fullName,
      signatureUrl,
      parentAdminId: labId,
      // userId might be null if admin is adding a generic signature or for a user not yet linked
    });

    res.status(201).json({ success: true, data: signature });
  } catch (error) {
    console.error('addSignature error:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get all signatures for the tenant lab
// @route   GET /api/signatures
// @access  Private (All staff)
exports.getSignatures = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('getSignatures error:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Delete a signature
// @route   DELETE /api/signatures/:id
// @access  Private (Admin only)
exports.deleteSignature = async (req, res) => {
  try {
    const signature = await Signature.findById(req.params.id);

    if (!signature) {
      return res.status(404).json({ success: false, error: 'Signature not found' });
    }

    // Authorization Logic:
    // 1. Admins can delete any signature in their lab
    // 2. Staff can only delete their own signature
    const isAdminOfLab = req.user.role === 'Admin' && signature.parentAdminId.toString() === req.user.id;
    const isRecordOwner = (signature.userId || signature.doctorId)?.toString() === req.user.id;

    if (!isAdminOfLab && !isRecordOwner) {
       return res.status(403).json({ success: false, error: 'Not authorized to delete this signature. You can only delete your own identity.' });
    }

    // Delete image from Cloudinary
    if (signature.signatureUrl) {
      await deleteFromCloudinary(signature.signatureUrl);
    }

    await signature.deleteOne();
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error('deleteSignature error:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
