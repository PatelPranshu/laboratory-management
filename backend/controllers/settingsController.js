const PrintSettings = require('../models/PrintSettings');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { pickFields } = require('../middlewares/validate');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Allowed fields for print settings update
const SETTINGS_FIELDS = ['headerImageURL', 'footerImageURL', 'layoutPreferences'];

// Allowed image MIME types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// @desc    Get Print Settings
// @route   GET /api/settings/print
// @access  Private
exports.getPrintSettings = async (req, res) => {
  try {
    const doctorId = req.user.role === 'LabTech' ? req.user.parentDoctorId : req.user.id;
    let settings = await PrintSettings.findOne({ doctorId });

    if (!settings) {
      settings = await PrintSettings.create({ doctorId });
    }

    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('getPrintSettings error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve print settings' });
  }
};

// @desc    Update Print Settings
// @route   PUT /api/settings/print
// @access  Private
exports.updatePrintSettings = async (req, res) => {
  try {
    const doctorId = req.user.role === 'LabTech' ? req.user.parentDoctorId : req.user.id;

    // Whitelist allowed fields
    const sanitizedBody = pickFields(req.body, SETTINGS_FIELDS);

    let settings = await PrintSettings.findOne({ doctorId });

    if (!settings) {
       settings = await PrintSettings.create({ doctorId, ...sanitizedBody });
    } else {
       settings = await PrintSettings.findOneAndUpdate({ doctorId }, sanitizedBody, { returnDocument: 'after', runValidators: true });
    }

    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('updatePrintSettings error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update print settings' });
  }
};

// @desc    Upload Image to Cloudinary (Header/Footer)
// @route   POST /api/settings/upload
// @access  Private
exports.uploadImage = async (req, res) => {
  try {
    // Only Doctor should upload brand settings
    if (req.user.role !== 'Doctor') {
      return res.status(403).json({ success: false, error: 'Only doctors can upload branding images' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Please upload a file' });
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed'
      });
    }

    const streamUpload = (req) => {
        return new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                folder: 'lis_app',
                allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
                resource_type: 'image'
              },
              (error, result) => {
                if (result) {
                  resolve(result);
                } else {
                  reject(error);
                }
              }
            );
            streamifier.createReadStream(req.file.buffer).pipe(stream);
        });
    };

    const result = await streamUpload(req);

    res.status(200).json({
      success: true,
      data: {
        url: result.secure_url
      }
    });

  } catch (error) {
    console.error('uploadImage error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to upload image' });
  }
};

// @desc    Delete Image from Cloudinary
// @route   POST /api/settings/delete-image
// @access  Private
exports.deleteImage = async (req, res) => {
  try {
    if (req.user.role !== 'Doctor') {
      return res.status(403).json({ success: false, error: 'Only doctors can manage branding images' });
    }

    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ success: false, error: 'Image URL is required' });
    }

    // Verify this image belongs to the user's print settings
    const doctorId = req.user.id;
    const settings = await PrintSettings.findOne({ doctorId });
    if (!settings) {
      return res.status(404).json({ success: false, error: 'Print settings not found' });
    }

    // Check that the imageUrl matches either the headerImageURL or footerImageURL
    if (settings.headerImageURL !== imageUrl && settings.footerImageURL !== imageUrl) {
      return res.status(403).json({ success: false, error: 'You can only delete your own branding images' });
    }

    // Extract public_id from Cloudinary URL
    // URL format: https://res.cloudinary.com/<cloud>/image/upload/v123/lis_app/filename.ext
    const urlParts = imageUrl.split('/');
    const uploadIndex = urlParts.indexOf('upload');
    if (uploadIndex === -1) {
      return res.status(400).json({ success: false, error: 'Invalid Cloudinary URL' });
    }
    const pathAfterUpload = urlParts.slice(uploadIndex + 1);
    const pathWithoutVersion = pathAfterUpload.filter(p => !p.match(/^v\d+$/));
    const publicIdWithExt = pathWithoutVersion.join('/');
    const publicId = publicIdWithExt.replace(/\.[^/.]+$/, '');

    await cloudinary.uploader.destroy(publicId);

    // Clear the URL from settings
    const updateField = settings.headerImageURL === imageUrl
      ? { headerImageURL: '' }
      : { footerImageURL: '' };
    await PrintSettings.findOneAndUpdate({ doctorId }, updateField);

    res.status(200).json({ success: true, message: 'Image deleted from Cloudinary' });
  } catch (error) {
    console.error('deleteImage error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to delete image' });
  }
};
