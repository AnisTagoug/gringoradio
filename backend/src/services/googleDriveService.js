/**
 * Google Drive Storage Service
 * ─────────────────────────────
 * Free: 15 GB per Google account — no credit card required.
 * Uses a Service Account (JSON key file) — no OAuth redirect needed.
 *
 * HOW TO SET UP (one-time, ~10 minutes):
 * ──────────────────────────────────────
 * 1. Go to https://console.cloud.google.com
 *    (sign in with any Google account — no billing needed)
 *
 * 2. Create a new project (e.g. "RadioStudio")
 *
 * 3. Enable the Google Drive API:
 *    APIs & Services → Enable APIs → search "Google Drive API" → Enable
 *
 * 4. Create a Service Account:
 *    APIs & Services → Credentials → Create Credentials → Service Account
 *    Name: "radiostudio-drive" → Create and Continue → Done
 *
 * 5. Create a key for the service account:
 *    Click the service account → Keys tab → Add Key → JSON → Download
 *    Save the file as: backend/service-account.json
 *
 * 6. Create a folder in YOUR Google Drive:
 *    Go to drive.google.com → New → Folder → name it "RadioStudio Audio"
 *    Right-click the folder → Share → paste the service account email
 *    (looks like radiostudio-drive@your-project.iam.gserviceaccount.com)
 *    Give it "Editor" access → Share
 *    Copy the folder ID from the URL:
 *    https://drive.google.com/drive/folders/THIS_IS_THE_FOLDER_ID
 *
 * 7. Add to backend/.env:
 *    GOOGLE_SERVICE_ACCOUNT_PATH=./service-account.json
 *    GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here
 *    STORAGE_BACKEND=gdrive
 *
 * FILES ARE PUBLICLY READABLE via a direct link — no authentication needed
 * for playback. Only the upload uses the service account.
 */

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// Lazy-load googleapis to avoid crash if not installed
let google = null;
const getGoogle = () => {
  if (google) return google;
  try {
    google = require('googleapis').google;
    return google;
  } catch {
    throw new Error(
      'googleapis package not installed. Run: npm install googleapis'
    );
  }
};

const getCredentials = () => {
  const credPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './service-account.json';
  const absPath = path.resolve(process.cwd(), credPath);
  if (!fs.existsSync(absPath))
    throw new Error(
      `Service account file not found at ${absPath}. ` +
      'Download it from Google Cloud Console → Service Accounts → Keys → JSON.'
    );
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
};

const getDriveClient = () => {
  const g = getGoogle();
  const credentials = getCredentials();
  const auth = new g.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return g.google.drive({ version: 'v3', auth });
};

/**
 * Upload a buffer to Google Drive.
 * Returns the public direct-download URL.
 *
 * @param {Buffer} buffer    — file content
 * @param {string} filename  — original filename
 * @param {string} mimeType  — e.g. "audio/mpeg"
 * @returns {Promise<{url: string, fileId: string}>}
 */
const uploadToGDrive = async (buffer, filename, mimeType) => {
  const drive = getDriveClient();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId)
    throw new Error('GOOGLE_DRIVE_FOLDER_ID is not set in .env');

  // Upload the file
  const response = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id, name',
  });

  const fileId = response.data.id;

  // Make the file publicly readable (anyone with the link can stream it)
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  // Direct download URL — works with Liquidsoap's input.http()
  // This URL streams the file without redirects
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;

  return { url, fileId };
};

/**
 * Delete a file from Google Drive by file ID.
 */
const deleteFromGDrive = async (fileId) => {
  const drive = getDriveClient();
  await drive.files.delete({ fileId });
};

/**
 * Extract the Google Drive file ID from a stored URL.
 * Handles both /uc?id= and /file/d/ URL formats.
 */
const fileIdFromUrl = (url) => {
  if (!url) return null;
  const ucMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (ucMatch) return ucMatch[1];
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  return null;
};

const isConfigured = () => {
  const credPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './service-account.json';
  const absPath = path.resolve(process.cwd(), credPath);
  return fs.existsSync(absPath) && !!process.env.GOOGLE_DRIVE_FOLDER_ID;
};

module.exports = { uploadToGDrive, deleteFromGDrive, fileIdFromUrl, isConfigured };
