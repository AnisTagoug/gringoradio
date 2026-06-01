/**
 * Tracks controller — v5.2 (fixed: start AutoDJ automatically on first track)
 *
 * Storage backend is selected by STORAGE_BACKEND in .env:
 *   local   → saved to backend/uploads/, served by Express (default, zero setup)
 *   gdrive  → Google Drive (15 GB free, no card)
 *   r2      → Cloudflare R2 (10 GB free, needs card)
 */

const multer = require('multer');
const path   = require('path');
const { pool } = require('../config/db');
const {
  writePlaylist,
  reloadPlaylist,
  regenerateLiqScript,
  startLiquidsoap,
  isRunning,
} = require('../services/liquidsoapService');
const { uploadFile, deleteFile, currentBackend } = require('../services/storageService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 52428800 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
      'audio/flac', 'audio/x-flac', 'audio/aac', 'audio/x-m4a',
    ];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only audio files are allowed (MP3, WAV, OGG, FLAC, AAC)'));
  },
}).single('audio');

// POST /api/stations/:stationId/tracks/upload
const uploadTrack = async (req, res) => {
  const stationResult = await pool.query(
    'SELECT * FROM stations WHERE id=$1 AND user_id=$2',
    [req.params.stationId, req.user.id]
  );
  if (stationResult.rows.length === 0)
    return res.status(404).json({ error: 'Station not found' });

  const station = stationResult.rows[0];

  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { title, artist } = req.body;
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const safeName = req.file.originalname
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-z0-9]/gi, '-')
      .toLowerCase()
      .slice(0, 40);
    const key = `stations/${station.id}/tracks/${Date.now()}-${safeName}.${ext}`;

    try {
      const publicUrl = await uploadFile(req.file.buffer, key, req.file.mimetype);

      const result = await pool.query(
        `INSERT INTO tracks
           (station_id, user_id, title, artist, filename, filepath, file_size, mime_type, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'upload')
         RETURNING *`,
        [
          station.id, req.user.id,
          title || req.file.originalname.replace(/\.[^/.]+$/, ''),
          artist || 'Unknown',
          req.file.originalname,
          publicUrl,
          req.file.size,
          req.file.mimetype,
        ]
      );

      // FIX: rebuild playlist AND auto-start AutoDJ if it isn't running yet
      await rebuildPlaylistAndAutoStart(station);

      res.status(201).json({
        ...result.rows[0],
        storage_backend: currentBackend(),
      });
    } catch (uploadErr) {
      console.error('Storage upload error:', uploadErr.message);
      res.status(500).json({ error: `Upload failed: ${uploadErr.message}` });
    }
  });
};

// GET /api/stations/:stationId/tracks
const getTracks = async (req, res) => {
  try {
    const stationCheck = await pool.query(
      'SELECT id FROM stations WHERE id=$1 AND user_id=$2',
      [req.params.stationId, req.user.id]
    );
    if (stationCheck.rows.length === 0)
      return res.status(404).json({ error: 'Station not found' });

    const result = await pool.query(
      'SELECT * FROM tracks WHERE station_id=$1 ORDER BY created_at DESC',
      [req.params.stationId]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
};

// DELETE /api/stations/:stationId/tracks/:trackId
const deleteTrack = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM tracks WHERE id=$1 AND user_id=$2 RETURNING *',
      [req.params.trackId, req.user.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Track not found' });

    const track = result.rows[0];

    if (track.filepath) {
      deleteFile(track.filepath).catch(e =>
        console.warn('Storage delete warning:', e.message)
      );
    }

    const stationResult = await pool.query('SELECT * FROM stations WHERE id=$1', [track.station_id]);
    if (stationResult.rows.length > 0) {
      await rebuildPlaylistAndAutoStart(stationResult.rows[0]);
    }

    res.json({ message: 'Track deleted' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Rebuilds the playlist file and:
 * - If AutoDJ is already running: hot-reloads via file watch + socket signal (no interruption)
 * - If AutoDJ is NOT running: generates the .liq script and starts Liquidsoap automatically
 *
 * This means adding the very first track to a station starts AutoDJ immediately,
 * with no manual "Start AutoDJ" button press required.
 */
const rebuildPlaylistAndAutoStart = async (station) => {
  const tracks = await pool.query(
    'SELECT filepath, proxy_url FROM tracks WHERE station_id=$1 ORDER BY created_at ASC',
    [station.id]
  );

  // Always write the playlist file first
  writePlaylist(station.mount_point, tracks.rows);

  if (isRunning(station.mount_point)) {
    // AutoDJ already running — hot reload only, no restart, no stream interruption
    reloadPlaylist(station.mount_point).catch(() => {});
  } else if (tracks.rows.length > 0) {
    // AutoDJ not running but we now have tracks — start it automatically
    console.log(`▶️  Auto-starting AutoDJ for station "${station.name}" (${station.mount_point})`);
    const bRes = await pool.query(
      'SELECT * FROM broadcasters WHERE station_id=$1 AND is_active=true',
      [station.id]
    );
    regenerateLiqScript(station, bRes.rows);
    startLiquidsoap(station);
  }
  // If tracks.rows.length === 0 after a delete, AutoDJ is already stopped or will go silent — no action needed
};

module.exports = { uploadTrack, getTracks, deleteTrack };