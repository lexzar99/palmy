import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

const router = Router();
router.use(authenticate);

const hasCloudinaryConfig = Boolean(
  process.env.CLOUDINARY_URL ||
    (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
);

// Configure Cloudinary
// It will automatically pick up the CLOUDINARY_URL environment variable if set.
// Otherwise, we can pass the keys directly.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // extract extension, and let cloudinary handle the rest (like format mapping)
    return {
      folder: 'matgo_uploads',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      public_id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // increased to 5MB for high res heroes
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Endast bilder tillåts'));
      return;
    }
    cb(null, true);
  },
});

// POST /api/admin/upload - Upload a single image
router.post('/', (req: Request, res: Response, next) => {
  if (!hasCloudinaryConfig) {
    res.status(503).json({ error: 'Bilduppladdning är inte konfigurerad på servern' });
    return;
  }
  next();
}, upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'Ingen fil uppladdad' });
    return;
  }

  // With CloudinaryStorage, req.file.path contains the uploaded Cloudinary URL
  const url = req.file.path;
  const filename = req.file.filename;

  res.json({ url, filename });
});

export default router;
