/**
 * AutoDJ control routes — v6.0
 *
 * POST   /start           — (re)generate script + start Liquidsoap
 * POST   /stop            — kill Liquidsoap process
 * POST   /skip            — skip to next track (no restart)
 * POST   /mode            — switch shuffle ↔ sequential (restarts Liquidsoap)
 * POST   /reload-playlist — hot-reload playlist file (no restart)
 * GET    /status          — running status + now playing + mode
 */
const express = require('express');
const router  = express.Router({ mergeParams: true });
const auth    = require('../middleware/auth');
const http    = require('http');
const { pool } = require('../config/db');

// Icecast listener count (same helper as nowPlaying route)
const getIcecastStats = (mount_point) =>
  new Promise((resolve) => {
    const host     = process.env.ICECAST_HOST || 'localhost';
    const port     = process.env.ICECAST_INTERNAL_PORT || '8000';
    const user     = process.env.ICECAST_ADMIN_USER || 'admin';
    const password = process.env.ICECAST_ADMIN_PASSWORD || 'adminpass123';
    const options  = {
      host, port, path: '/admin/stats',
      headers: { Authorization: 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64') },
      timeout: 2000,
    };
    const req = http.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const m = data.match(new RegExp(`<source mount="${mount_point.replace('/', '\\/')}">([\\s\\S]*?)<\/source>`));
          if (!m) return resolve({ listeners: 0 });
          const lm = m[1].match(/<listeners>(\d+)<\/listeners>/);
          resolve({ listeners: lm ? parseInt(lm[1]) : 0 });
        } catch { resolve({ listeners: 0 }); }
      });
    });
    req.on('error', () => resolve({ listeners: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ listeners: 0 }); });
  });
const {
  regenerateLiqScript,
  writePlaylist,
  startLiquidsoap,
  stopLiquidsoap,
  isRunning,
  getNowPlaying,
  skipTrack,
  reloadPlaylist,
} = require('../services/liquidsoapService');

const getStation = async (stationId, userId) => {
  const res = await pool.query(
    'SELECT * FROM stations WHERE id=$1 AND user_id=$2', [stationId, userId]
  );
  return res.rows[0] || null;
};

// ── Start ─────────────────────────────────────────────────────────────────────
router.post('/start', auth, async (req, res) => {
  try {
    const station = await getStation(req.params.stationId, req.user.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    const tracksRes = await pool.query(
      'SELECT filepath, proxy_url FROM tracks WHERE station_id=$1 ORDER BY created_at ASC',
      [station.id]
    );
    writePlaylist(station.mount_point, tracksRes.rows);

    const bRes = await pool.query(
      'SELECT * FROM broadcasters WHERE station_id=$1 AND is_active=true', [station.id]
    );
    regenerateLiqScript(station, bRes.rows);
    startLiquidsoap(station);

    res.json({ message: 'AutoDJ started', mount_point: station.mount_point });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stop ──────────────────────────────────────────────────────────────────────
router.post('/stop', auth, async (req, res) => {
  try {
    const station = await getStation(req.params.stationId, req.user.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    stopLiquidsoap(station.mount_point);
    res.json({ message: 'AutoDJ stopped' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Skip ──────────────────────────────────────────────────────────────────────
router.post('/skip', auth, async (req, res) => {
  try {
    const station = await getStation(req.params.stationId, req.user.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    if (!isRunning(station.mount_point))
      return res.status(400).json({ error: 'AutoDJ is not running' });

    const result = await skipTrack(station.mount_point);
    res.json({ message: 'Skipped to next track', socket_response: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Mode ──────────────────────────────────────────────────────────────────────
// Switches between "shuffle" and "sequential".
// Requires a Liquidsoap restart because the playlist mode is baked into the script.
router.post('/mode', auth, async (req, res) => {
  try {
    const station = await getStation(req.params.stationId, req.user.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    const { mode } = req.body; // "shuffle" | "sequential"
    if (!['shuffle', 'sequential'].includes(mode))
      return res.status(400).json({ error: 'mode must be "shuffle" or "sequential"' });

    // Persist the mode to DB
    const autodj_mode = mode === 'shuffle' ? 'randomize' : 'sequential';
    await pool.query(
      'UPDATE stations SET autodj_mode=$1 WHERE id=$2',
      [autodj_mode, station.id]
    );
    station.autodj_mode = autodj_mode;

    // Regenerate script and restart (mode is baked in)
    if (isRunning(station.mount_point)) {
      const tracksRes = await pool.query(
        'SELECT filepath, proxy_url FROM tracks WHERE station_id=$1 ORDER BY created_at ASC',
        [station.id]
      );
      writePlaylist(station.mount_point, tracksRes.rows);

      const bRes = await pool.query(
        'SELECT * FROM broadcasters WHERE station_id=$1 AND is_active=true', [station.id]
      );
      regenerateLiqScript(station, bRes.rows);
      startLiquidsoap(station);
    }

    res.json({ message: `Mode set to ${mode}`, autodj_mode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Hot-reload playlist ───────────────────────────────────────────────────────
// Rewrites the playlist file and signals Liquidsoap to reload it.
// No restart. The stream is NOT interrupted.
router.post('/reload-playlist', auth, async (req, res) => {
  try {
    const station = await getStation(req.params.stationId, req.user.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    const tracksRes = await pool.query(
      'SELECT filepath, proxy_url FROM tracks WHERE station_id=$1 ORDER BY created_at ASC',
      [station.id]
    );
    writePlaylist(station.mount_point, tracksRes.rows);

    // Belt-and-suspenders: also send a socket reload command
    const socketResult = await reloadPlaylist(station.mount_point);

    res.json({
      message: 'Playlist hot-reloaded — no restart needed',
      tracks:  tracksRes.rows.length,
      socket_response: socketResult,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Status ────────────────────────────────────────────────────────────────────
router.get('/status', auth, async (req, res) => {
  try {
    const station = await getStation(req.params.stationId, req.user.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    const np = getNowPlaying(station.mount_point);

    // Compute elapsed seconds since track started (best-effort from metadata timestamp)
    let elapsed_seconds = null;
    if (np.updated_at) {
      const startTs = parseFloat(np.updated_at);
      if (!isNaN(startTs)) {
        elapsed_seconds = Math.floor(Date.now() / 1000 - startTs);
        if (elapsed_seconds < 0) elapsed_seconds = 0;
      }
    }

    const icecast = await getIcecastStats(station.mount_point);

    res.json({
      running:         isRunning(station.mount_point),
      autodj_mode:     station.autodj_mode || 'randomize',
      now_playing:     np,
      elapsed_seconds,
      listeners:       icecast.listeners,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
