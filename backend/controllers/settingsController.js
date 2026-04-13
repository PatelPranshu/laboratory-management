const PrintSettings = require('../models/PrintSettings');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { pickFields } = require('../middlewares/validate');

// Resolve the lab admin ID regardless of the caller's role
const getAdminId = (req) => {
  return req.user.role === 'Admin' ? req.user.id : req.user.parentAdminId;
};

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
    const doctorId = getAdminId(req);
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
    const doctorId = getAdminId(req);

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
    // Roles authorized to upload (Branding is Admin, Signatures is All)
    if (req.user.role !== 'Admin' && req.user.role !== 'Doctor' && req.user.role !== 'LabTech') {
      return res.status(403).json({ success: false, error: 'Not authorized to upload images' });
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
    if (req.user.role !== 'Admin' && req.user.role !== 'Doctor' && req.user.role !== 'LabTech') {
      return res.status(403).json({ success: false, error: 'Not authorized to manage images' });
    }

    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ success: false, error: 'Image URL is required' });
    }

    // Verify this image belongs to the user's print settings OR is a personal signature
    const doctorId = getAdminId(req);
    const settings = await PrintSettings.findOne({ doctorId });
    
    // For Admin branding, we verify against PrintSettings. 
    // For staff signatures, we allow deletion if the URL exists (further verification could check the Signature model)
    const isBrandingImage = settings && (settings.headerImageURL === imageUrl || settings.footerImageURL === imageUrl);
    
    if (isBrandingImage && req.user.role !== 'Admin') {
       return res.status(403).json({ success: false, error: 'Only administrators can delete laboratory branding images' });
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

    // If it was a branding image, clear the URL from settings
    if (isBrandingImage) {
        const updateField = settings.headerImageURL === imageUrl
          ? { headerImageURL: '' }
          : { footerImageURL: '' };
        await PrintSettings.findOneAndUpdate({ doctorId }, updateField);
    }

    res.status(200).json({ success: true, message: 'Image deleted from Cloudinary' });
  } catch (error) {
    console.error('deleteImage error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to delete image' });
  }
};
