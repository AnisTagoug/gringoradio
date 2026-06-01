/**
 * Unified Storage Service
 * ───────────────────────
 * Automatically selects the storage backend based on STORAGE_BACKEND in .env:
 *
 *   STORAGE_BACKEND=local     → saves to backend/uploads/ (default, no setup)
 *   STORAGE_BACKEND=gdrive    → Google Drive (15 GB free, no card)
 *   STORAGE_BACKEND=r2        → Cloudflare R2 (10 GB free, needs card)
 *
 * This lets you start with local storage today and switch to cloud
 * later by changing one env variable.
 */

const path = require('path');
const fs   = require('fs-extra');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
fs.ensureDirSync(UPLOAD_DIR);

const getBackend = () => (process.env.STORAGE_BACKEND || 'local').toLowerCase();

// ── LOCAL ──────────────────────────────────────────────────────────────────────
const saveLocally = async (buffer, key, _mime) => {
  const filePath = path.join(UPLOAD_DIR, key.replace(/\//g, '_'));
  await fs.writeFile(filePath, buffer);
  // Return a URL that Express serves statically
  const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  return `${baseUrl}/uploads/${path.basename(filePath)}`;
};

const deleteLocally = async (fileUrl) => {
  const filename = path.basename(fileUrl);
  const filePath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(filePath)) await fs.remove(filePath);
};

// ── MAIN API ───────────────────────────────────────────────────────────────────

/**
 * Upload a buffer to the configured storage backend.
 * @param {Buffer} buffer
 * @param {string} key      — unique path/filename key
 * @param {string} mimeType
 * @returns {Promise<string>} — public URL
 */
const uploadFile = async (buffer, key, mimeType) => {
  const backend = getBackend();

  if (backend === 'gdrive') {
    const { uploadToGDrive } = require('./googleDriveService');
    const filename = path.basename(key);
    const { url } = await uploadToGDrive(buffer, filename, mimeType);
    return url;
  }

  if (backend === 'r2') {
    const { uploadToR2 } = require('./r2Service');
    return uploadToR2(buffer, key, mimeType);
  }

  // Default: local
  return saveLocally(buffer, key, mimeType);
};

/**
 * Delete a file from the configured storage backend.
 * @param {string} fileUrl — the URL returned by uploadFile
 */
const deleteFile = async (fileUrl) => {
  const backend = getBackend();

  if (backend === 'gdrive') {
    const { deleteFromGDrive, fileIdFromUrl } = require('./googleDriveService');
    const fileId = fileIdFromUrl(fileUrl);
    if (fileId) await deleteFromGDrive(fileId);
    return;
  }

  if (backend === 'r2') {
    const { deleteFromR2, keyFromUrl } = require('./r2Service');
    const key = keyFromUrl(fileUrl);
    if (key) await deleteFromR2(key);
    return;
  }

  await deleteLocally(fileUrl);
};

const isCloudConfigured = () => {
  const backend = getBackend();
  if (backend === 'gdrive') return require('./googleDriveService').isConfigured();
  if (backend === 'r2') return require('./r2Service').isConfigured();
  return true; // local is always "configured"
};

const currentBackend = () => getBackend();

module.exports = { uploadFile, deleteFile, isCloudConfigured, currentBackend, UPLOAD_DIR };
