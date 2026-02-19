import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class UploadHelper {
    constructor() {
        this.uploadDir = path.join(__dirname, '../public/uploads');
        this.maxFileSize = 5 * 1024 * 1024; // 5MB
        this.allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        this.imageConfig = {
            maxWidth: 1024,
            maxHeight: 1024,
            quality: 80,
            format: 'webp'
        };
    }

    /**
     * Ensure upload directory exists
     */
    ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * Validate uploaded file
     */
    validateFile(file) {
        if (!file) {
            return { status: false, error: 'No file uploaded' };
        }

        if (!this.allowedMimeTypes.includes(file.mimetype)) {
            return {
                status: false,
                error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed'
            };
        }

        if (file.size > this.maxFileSize) {
            return {
                status: false,
                error: `File size exceeds maximum limit of ${this.maxFileSize / 1024 / 1024}MB`
            };
        }

        return { status: true };
    }

    /**
     * Upload and optimize image
     * @param {Object} file - File object from express-fileupload
     * @param {Object} options - Upload options
     * @param {string} options.subDir - Subdirectory (e.g., 'vehicles')
     * @param {string} options.fileName - Custom filename without extension
     * @returns {Promise<Object>} Result with file path
     */
    async uploadImage(file, options = {}) {
        try {
            const { subDir = '', fileName } = options;

            // Validate file
            const validation = this.validateFile(file);
            if (!validation.status) {
                return validation;
            }

            // Ensure upload directory exists
            const targetDir = path.join(this.uploadDir, subDir);
            this.ensureDir(targetDir);

            // Generate filename
            const timestamp = Date.now();
            const finalFileName = fileName 
                ? `${fileName}.${this.imageConfig.format}`
                : `${timestamp}.${this.imageConfig.format}`;
            
            const filePath = path.join(targetDir, finalFileName);

            // Optimize and save image
            await sharp(file.data)
                .resize(this.imageConfig.maxWidth, this.imageConfig.maxHeight, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .webp({ quality: this.imageConfig.quality })
                .toFile(filePath);

            // Return relative path for database storage
            const relativePath = path.join('uploads', subDir, finalFileName).replace(/\\/g, '/');

            return {
                status: true,
                data: {
                    path: relativePath,
                    fullPath: filePath,
                    fileName: finalFileName,
                    size: fs.statSync(filePath).size
                }
            };

        } catch (error) {
            return {
                status: false,
                error: error.message || 'Failed to upload image'
            };
        }
    }

    /**
     * Delete image file
     * @param {string} relativePath - Relative path from public directory
     * @returns {Object} Result
     */
    deleteImage(relativePath) {
        try {
            if (!relativePath) {
                return { status: true };
            }

            const fullPath = path.join(__dirname, '../public', relativePath);
            
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }

            return { status: true };
        } catch (error) {
            return {
                status: false,
                error: error.message || 'Failed to delete image'
            };
        }
    }

    /**
     * Replace existing image with new one
     * @param {Object} file - New file object
     * @param {string} oldPath - Old file relative path
     * @param {Object} options - Upload options
     * @returns {Promise<Object>} Result
     */
    async replaceImage(file, oldPath, options = {}) {
        try {
            // Upload new image
            const uploadResult = await this.uploadImage(file, options);
            
            if (!uploadResult.status) {
                return uploadResult;
            }

            // Delete old image
            if (oldPath && uploadResult.data.path !== oldPath) {
                this.deleteImage(oldPath);
            }

            return uploadResult;
        } catch (error) {
            return {
                status: false,
                error: error.message || 'Failed to replace image'
            };
        }
    }
}

export default new UploadHelper();
