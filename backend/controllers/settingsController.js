const PrintSettings = require('../models/PrintSettings');
const ExportJob = require('../models/ExportJob');
const path = require('path');
const fs = require('fs');
const { cloudinary, deleteFromCloudinary } = require('../utils/cloudinary');
const streamifier = require('streamifier');
const { pickFields } = require('../middlewares/validate');

// Resolve the lab admin ID regardless of the caller's role
const getAdminId = (req) => {
  return req.user.role === 'Admin' ? req.user.id : req.user.parentAdminId;
};

// Cloudinary is now configured in ../utils/cloudinary.js

// Allowed fields for print settings update
const SETTINGS_FIELDS = ['headerImageURL', 'footerImageURL', 'layoutPreferences'];

// Allowed MIME types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// @desc    Get Print Settings
// @route   GET /api/settings/print
// @access  Private
exports.getPrintSettings = async (req, res) => {
    const doctorId = getAdminId(req);
    let settings = await PrintSettings.findOne({ doctorId });

    if (!settings) {
      settings = await PrintSettings.create({ doctorId });
    }

    res.status(200).json({ success: true, data: settings });
  };

// @desc    Update Print Settings
// @route   PUT /api/settings/print
// @access  Private
exports.updatePrintSettings = async (req, res) => {
    const doctorId = getAdminId(req);

    // Whitelist allowed fields
    const sanitizedBody = pickFields(req.body, SETTINGS_FIELDS);

    let settings = await PrintSettings.findOne({ doctorId });

    if (!settings) {
       settings = await PrintSettings.create({ doctorId, ...sanitizedBody });
    } else {
       // Cleanup old images if they are being replaced
       if (sanitizedBody.headerImageURL && settings.headerImageURL && sanitizedBody.headerImageURL !== settings.headerImageURL) {
           await deleteFromCloudinary(settings.headerImageURL);
       }
       if (sanitizedBody.footerImageURL && settings.footerImageURL && sanitizedBody.footerImageURL !== settings.footerImageURL) {
           await deleteFromCloudinary(settings.footerImageURL);
       }

       settings = await PrintSettings.findOneAndUpdate({ doctorId }, sanitizedBody, { returnDocument: 'after', runValidators: true });
    }

    res.status(200).json({ success: true, data: settings });
  };

// @desc    Upload Image to Cloudinary (Header/Footer)
// @route   POST /api/settings/upload
// @access  Private
exports.uploadImage = async (req, res) => {
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
        error: 'Invalid file type. Only JPEG, PNG, WebP images and PDFs are allowed'
      });
    }

    const streamUpload = (req) => {
        return new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                folder: 'lis_app',
                allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
                resource_type: 'auto'
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

  };

// @desc    Delete Image from Cloudinary
// @route   POST /api/settings/delete-image
// @access  Private
exports.deleteImage = async (req, res) => {
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

    // Delete from Cloudinary using utility
    await deleteFromCloudinary(imageUrl);

    // If it was a branding image, clear the URL from settings
    if (isBrandingImage) {
        const updateField = settings.headerImageURL === imageUrl
          ? { headerImageURL: '' }
          : { footerImageURL: '' };
        await PrintSettings.findOneAndUpdate({ doctorId }, updateField);
    }

    res.status(200).json({ success: true, message: 'Image deleted from Cloudinary' });
  };

// @desc    Request a full data export
// @route   POST /api/settings/request-export
// @access  Private (Admin only)
exports.requestDataExport = async (req, res) => {
  try {
    const adminId = getAdminId(req);
    
    // Rate limit: Check if there's a PENDING or PROCESSING job already
    const existingJob = await ExportJob.findOne({
      labId: adminId,
      status: { $in: ['PENDING', 'PROCESSING'] }
    });
    
    if (existingJob) {
      return res.status(400).json({ success: false, error: 'An export is already in progress. Please wait for it to complete.' });
    }
    
    // Rate limit: 1 export per week
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    const recentJob = await ExportJob.findOne({
      labId: adminId,
      status: 'COMPLETED',
      createdAt: { $gt: lastWeek }
    });
    
    if (recentJob) {
      return res.status(429).json({ success: false, error: 'You can only request one full data export per week.' });
    }
    
    const job = await ExportJob.create({ labId: adminId });
    
    res.status(201).json({ success: true, data: job });
  } catch (error) {
    console.error('Export request error:', error);
    res.status(500).json({ success: false, error: 'Failed to request data export' });
  }
};

// @desc    Get all export jobs for the lab
// @route   GET /api/settings/exports
// @access  Private (Admin only)
exports.getExportJobs = async (req, res) => {
  try {
    const adminId = getAdminId(req);
    const jobs = await ExportJob.find({ labId: adminId }).sort('-createdAt');
    res.status(200).json({ success: true, data: jobs });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch export jobs' });
  }
};

// @desc    Download an exported file
// @route   GET /api/settings/exports/download/:jobId/:fileIndex
// @access  Private (Admin only)
exports.downloadExportFile = async (req, res) => {
  try {
    const adminId = getAdminId(req);
    const { jobId, fileIndex } = req.params;
    
    const job = await ExportJob.findOne({ _id: jobId, labId: adminId, status: 'COMPLETED' });
    if (!job) {
      return res.status(404).json({ success: false, error: 'Export not found or not completed' });
    }
    
    const filePath = job.filePaths[parseInt(fileIndex, 10)];
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found on server. It may have expired.' });
    }
    
    res.download(filePath);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to download file' });
  }
};
