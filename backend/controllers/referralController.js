const Referral = require('../models/Referral');

// Utility to get the primary lab administrator ID
const getAdminId = (req) => {
    return req.user.role === 'Admin' ? req.user.id : req.user.parentAdminId;
};

// @desc    Get all referrals for the lab
// @route   GET /api/referrals
// @access  Private
exports.getReferrals = async (req, res) => {
    try {
        const adminId = getAdminId(req);
        const referrals = await Referral.find({ parentAdminId: adminId }).sort({ name: 1 });
        res.status(200).json({ success: true, count: referrals.length, data: referrals });
    } catch (error) {
        console.error('getReferrals error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to retrieve referrers' });
    }
};

// @desc    Add a referral source
// @route   POST /api/referrals
// @access  Private
exports.addReferral = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Name is required' });

        const adminId = getAdminId(req);
        
        // Check for duplicates
        const existing = await Referral.findOne({ name, parentAdminId: adminId });
        if (existing) return res.status(400).json({ success: false, error: 'Referral with this name already exists' });

        const referral = await Referral.create({
            name,
            parentAdminId: adminId
        });

        res.status(201).json({ success: true, data: referral });
    } catch (error) {
        console.error('addReferral error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to add referral' });
    }
};

// @desc    Delete a referral source
// @route   DELETE /api/referrals/:id
// @access  Private
exports.deleteReferral = async (req, res) => {
    try {
        const adminId = getAdminId(req);
        const referral = await Referral.findOne({ _id: req.params.id, parentAdminId: adminId });

        if (!referral) {
            return res.status(404).json({ success: false, error: 'Referral source not found' });
        }

        await referral.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        console.error('deleteReferral error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to delete referral' });
    }
};
