const express = require('express');
const multer = require('multer');

const {
  getPrintSettings,
  updatePrintSettings,
  uploadImage,
  deleteImage
} = require('../controllers/settingsController');

const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// Memory storage for multer to safely pass buffer to Cloudinary using streamifier
const storage = multer.memoryStorage();

// File filter — only allow image uploads
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter
});

router.route('/print')
  .get(protect, getPrintSettings)
  .put(protect, updatePrintSettings);

router.post('/upload', protect, upload.single('image'), uploadImage);
router.post('/delete-image', protect, deleteImage);

module.exports = router;
