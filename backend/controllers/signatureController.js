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

    let parentAdminId;
    let doctorId = null;

    if (req.user.role === 'Admin') {
      parentAdminId = req.user.id;
    } else if (req.user.role === 'Doctor') {
      parentAdminId = req.user.parentAdminId;
      doctorId = req.user.id;
      // Doctors can only add their own signature
      if (req.body.doctorName.trim() !== req.user.name) {
         // allow slight variations, or strictly enforce it or just use their user.name directly
         // We will enforce using their user name
      }
    } else {
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
      parentAdminId,
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
    // Find parentAdminId for the current user
    let adminId = req.user.role === 'Admin' ? req.user.id : req.user.parentAdminId;

    const signatures = await Signature.find({ parentAdminId: adminId });
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
