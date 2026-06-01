/**
 * Google Drive Folder Import Controller
 * ──────────────────────────────────────
 * Lets a station owner import audio files directly from a shared Google Drive folder.
 *
 * Flow:
 *   1. On first import for a station, the service creates a sub-folder named after
 *      the station inside the configured root folder (GOOGLE_DRIVE_FOLDER_ID).
 *   2. It lists all audio files in that station sub-folder.
 *   3. The user picks which files to import — each one is added to the DB as a track
 *      with source='gdrive' and a direct streaming URL.
 *   4. The playlist + Liquidsoap script are rebuilt so AutoDJ picks them up immediately.
 *
 * No file is downloaded to the server — only the Drive file ID / streaming URL is saved.
 *
 * Routes (all under /api/stations/:stationId/drive):
 *   GET  /folder       — get (or create) the station's Drive sub-folder, list its audio files
 *   POST /import       — import selected file IDs into the station's track library
 *   GET  /folder-url   — return the folder's Google Drive URL so the user can open it
 */

const { pool } = require('../config/db');
const { writePlaylist, reloadPlaylist } = require('../services/liquidsoapService');

// ── Drive helpers ─────────────────────────────────────────────────────────────

let _driveClient = null;

const getDrive = () => {
  if (_driveClient) return _driveClient;
  let google;
  try {
    google = require('googleapis').google;
  } catch {
    throw new Error('googleapis not installed. Run: npm install googleapis');
  }
  const fs   = require('fs');
  const path = require('path');
  const credPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './service-account.json';
  const absPath  = path.resolve(process.cwd(), credPath);
  if (!fs.existsSync(absPath))
    throw new Error(`Service account file not found at ${absPath}`);
  const credentials = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  _driveClient = google.drive({ version: 'v3', auth });
  return _driveClient;
};

const AUDIO_MIME_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
  'audio/flac', 'audio/x-flac', 'audio/aac', 'audio/x-m4a',
  'audio/mp4', 'audio/webm',
]);

/**
 * Find a child folder by name inside a parent, or create it if missing.
 * Returns the folder ID.
 */
const findOrCreateFolder = async (drive, parentId, folderName) => {
  // Search for existing folder
  const safe = folderName.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${safe}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 1,
  });
  if (res.data.files.length > 0) return res.data.files[0].id;

  // Create it
  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  // Make folder publicly viewable so users can open it in browser
  await drive.permissions.create({
    fileId: created.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return created.data.id;
};

/**
 * List all audio files (recursively one level) in a Drive folder.
 */
const listAudioFiles = async (drive, folderId) => {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType, size, modifiedTime)',
    pageSize: 200,
    orderBy: 'name',
  });
  return res.data.files.filter(f => AUDIO_MIME_TYPES.has(f.mimeType));
};

/**
 * Make a Drive file publicly readable and return its direct stream URL.
 */
const makePublicAndGetUrl = async (drive, fileId) => {
  // Try to set public — may already be public, ignore error
  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
  } catch (_) { /* already public */ }
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
};

// ── DB helper ─────────────────────────────────────────────────────────────────

const getStation = async (stationId, userId) => {
  const res = await pool.query(
    'SELECT * FROM stations WHERE id=$1 AND user_id=$2',
    [stationId, userId]
  );
  return res.rows[0] || null;
};

const rebuildPlaylist = async (stationId, mount_point) => {
  const tracks = await pool.query(
    'SELECT filepath, proxy_url FROM tracks WHERE station_id=$1 ORDER BY created_at ASC',
    [stationId]
  );
  writePlaylist(mount_point, tracks.rows);
  reloadPlaylist(mount_point).catch(() => {});
};

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/stations/:stationId/drive/folder
 * Returns the station's Drive sub-folder info + list of audio files inside it.
 */
const getFolderContents = async (req, res) => {
  try {
    const station = await getStation(req.params.stationId, req.user.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!rootFolderId)
      return res.status(500).json({ error: 'GOOGLE_DRIVE_FOLDER_ID is not set in .env' });

    const drive    = getDrive();
    const folderId = await findOrCreateFolder(drive, rootFolderId, station.name);
    const files    = await listAudioFiles(drive, folderId);

    // Get already-imported Drive file IDs for this station so the UI can mark them
    const imported = await pool.query(
      "SELECT filename FROM tracks WHERE station_id=$1 AND source='gdrive'",
      [station.id]
    );
    const importedIds = new Set(imported.rows.map(r => r.filename));

    res.json({
      folder_id:  folderId,
      folder_url: `https://drive.google.com/drive/folders/${folderId}`,
      folder_name: station.name,
      files: files.map(f => ({
        id:       f.id,
        name:     f.name,
        size:     parseInt(f.size || 0),
        modified: f.modifiedTime,
        already_imported: importedIds.has(f.id),
      })),
    });
  } catch (err) {
    console.error('Drive folder error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/stations/:stationId/drive/import
 * Body: { file_ids: ['id1', 'id2', ...] }
 * Imports selected Drive files as tracks (no download — just saves stream URLs).
 */
const importTracks = async (req, res) => {
  try {
    const station = await getStation(req.params.stationId, req.user.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    const { file_ids } = req.body;
    if (!Array.isArray(file_ids) || file_ids.length === 0)
      return res.status(400).json({ error: 'file_ids must be a non-empty array' });

    const drive   = getDrive();
    const results = [];
    const errors  = [];

    for (const fileId of file_ids) {
      try {
        // Get file metadata
        const meta = await drive.files.get({
          fileId,
          fields: 'id, name, mimeType, size',
        });
        const file = meta.data;

        if (!AUDIO_MIME_TYPES.has(file.mimeType)) {
          errors.push({ id: fileId, error: 'Not a supported audio file' });
          continue;
        }

        // Skip already imported
        const exists = await pool.query(
          "SELECT id FROM tracks WHERE station_id=$1 AND filename=$2 AND source='gdrive'",
          [station.id, fileId]
        );
        if (exists.rows.length > 0) {
          errors.push({ id: fileId, name: file.name, error: 'Already imported' });
          continue;
        }

        const streamUrl = await makePublicAndGetUrl(drive, fileId);

        // Derive title from filename (strip extension)
        const title = file.name.replace(/\.[^/.]+$/, '');

        const inserted = await pool.query(
          `INSERT INTO tracks
             (station_id, user_id, title, artist, filename, filepath, file_size, mime_type, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'gdrive')
           RETURNING *`,
          [
            station.id,
            req.user.id,
            title,
            'Google Drive',
            fileId,          // store file ID in filename for dedup checks
            streamUrl,       // direct stream URL
            parseInt(file.size || 0),
            file.mimeType,
          ]
        );

        results.push(inserted.rows[0]);
      } catch (err) {
        errors.push({ id: fileId, error: err.message });
      }
    }

    // Rebuild playlist so AutoDJ picks up new tracks immediately
    if (results.length > 0) {
      await rebuildPlaylist(station.id, station.mount_point);
    }

    res.status(201).json({
      imported: results.length,
      skipped:  errors.length,
      tracks:   results,
      errors,
    });
  } catch (err) {
    console.error('Drive import error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getFolderContents, importTracks };
