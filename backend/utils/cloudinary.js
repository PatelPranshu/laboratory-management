const cloudinary = require('cloudinary').v2;

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Extracts Cloudinary Public ID from a URL
 * @param {string} imageUrl - The full Cloudinary secure URL
 * @returns {string|null} - The public_id or null if invalid
 */
const extractPublicId = (imageUrl) => {
  if (!imageUrl) return null;
  try {
    const urlParts = imageUrl.split('/');
    const uploadIndex = urlParts.indexOf('upload');
    if (uploadIndex === -1) return null;

    const pathAfterUpload = urlParts.slice(uploadIndex + 1);
    // Remove version segment (e.g., v12345678)
    const pathWithoutVersion = pathAfterUpload.filter(p => !p.match(/^v\d+$/));
    
    // Join the remaining parts (folder + filename)
    const publicIdWithExt = pathWithoutVersion.join('/');
    // Strip file extension
    return publicIdWithExt.replace(/\.[^/.]+$/, '');
  } catch (err) {
    console.error('Error extracting Cloudinary public_id:', err.message);
    return null;
  }
};

/**
 * Deletes an image from Cloudinary by its URL
 * @param {string} imageUrl - The full Cloudinary secure URL
 */
const deleteFromCloudinary = async (imageUrl) => {
  const publicId = extractPublicId(imageUrl);
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary Destruction Error:', error.message);
  }
};

module.exports = {
  cloudinary,
  deleteFromCloudinary,
  extractPublicId
};
