const Signature = require('../models/Signature');
const User = require('../models/User');

// @desc    Add a new signature
// @route   POST /api/signatures
// @access  Private (Admin or Doctor)
exports.addSignature = async (req, res) => {
  try {
    const { doctorName, signatureUrl } = req.body;

    if (!signatureUrl || !doctorName) {
      return res.status(400).json({ success: false, error: 'Doctor name and signature URL are required' });
    }

    // Validate URL format — only allow HTTPS URLs to prevent XSS/injection
    try {
      const parsed = new URL(signatureUrl);
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        return res.status(400).json({ success: false, error: 'Signature URL must use HTTPS' });
      }
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid signature URL format' });
    }

    // Resolve the Lab ID (Standardized)
    let labId;
    if (req.user.role === 'Admin') {
      labId = req.user.id;
    } else {
      labId = req.user.parentAdminId || req.user.id; // Fallback for primary/solo accounts
    }
    
    let doctorId = null;
    if (req.user.role === 'Doctor') {
      doctorId = req.user.id;
    } else if (req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, error: 'Not authorized to add signatures' });
    }

    // Optionally check if a doctor already has a signature
    if (req.user.role === 'Doctor') {
        const existingSign = await Signature.findOne({ doctorId: req.user.id });
        if (existingSign) {
            existingSign.signatureUrl = signatureUrl;
            await existingSign.save();
            return res.status(200).json({ success: true, data: existingSign });
        }
    }

    const signature = await Signature.create({
      doctorName: req.user.role === 'Doctor' ? req.user.name : doctorName,
      signatureUrl,
      parentAdminId: labId,
      doctorId
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

    const signatures = await Signature.find({ parentAdminId: labId });
    res.status(200).json({ success: true, count: signatures.length, data: signatures });
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

    // Ensure the caller is an Admin and owns the signature
    if (req.user.role !== 'Admin' || signature.parentAdminId.toString() !== req.user.id) {
       return res.status(403).json({ success: false, error: 'Not authorized to delete this signature' });
    }

    await signature.deleteOne();
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error('deleteSignature error:', error.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
