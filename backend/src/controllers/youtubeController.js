/**
 * YouTube AutoDJ Controller — v5.3 (fixed proxy_url + auto-start AutoDJ)
 *
 * Uses yt-dlp to extract a direct audio stream URL.
 * NO audio is downloaded — only the stream URL is saved in DB.
 *
 * WINDOWS SETUP (one-time):
 *   1. Download yt-dlp.exe from https://github.com/yt-dlp/yt-dlp/releases/latest
 *   2. Move yt-dlp.exe to C:\Windows\System32\
 *      — OR add its folder to System PATH in Environment Variables
 *   3. Restart your terminal, verify with: yt-dlp --version
 *
 * LINUX/MAC SETUP:
 *   sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
 *     -o /usr/local/bin/yt-dlp && sudo chmod +x /usr/local/bin/yt-dlp
 */

const { exec } = require('child_process');
const path = require('path');
const { pool } = require('../config/db');
const {
  writePlaylist,
  reloadPlaylist,
  regenerateLiqScript,
  startLiquidsoap,
  isRunning,
} = require('../services/liquidsoapService');
const { registerTrack, getProxyUrl } = require('../services/youtubeStreamProxy');

// Stream URLs expire ~6h; we refresh at 5h to be safe
const URL_TTL_MS = 5 * 60 * 60 * 1000;

const getYtDlpBin = () => {
  if (process.env.YT_DLP_PATH) return `"${process.env.YT_DLP_PATH}"`;
  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
};

const extractYouTubeInfo = (youtubeUrl) =>
  new Promise((resolve, reject) => {
    const bin = getYtDlpBin();

        const cmd = [
      bin,
      ...(process.env.YT_DLP_COOKIES ? ['--cookies', process.env.YT_DLP_COOKIES] : []),
      '--js-runtimes', 'node',
      '--no-playlist',
      '--js-runtimes', 'node',
      '--no-warnings',
      '--no-check-certificates',
      '-f', 'bestaudio',
      '--print', 'title',
      '--print', 'duration_string',
      '--print', 'url',
      `"${youtubeUrl}"`,
    ].join(' ');

    exec(cmd, { timeout: 45000 }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || err.message || '').trim();

        if (
          msg.includes('is not recognized') ||
          msg.includes("n'est pas reconnu") ||
          msg.includes('cannot find') ||
          msg.includes('No such file') ||
          msg.includes('not found')
        ) {
          return reject(new Error(
            'yt-dlp not found. On Windows: move yt-dlp.exe to C:\\Windows\\System32\\ ' +
            'or set YT_DLP_PATH in your .env to the full path (e.g. C:\\Users\\Anis\\yt-dlp.exe)'
          ));
        }

        if (msg.includes('Video unavailable') || msg.includes('Private video'))
          return reject(new Error('This YouTube video is unavailable or private.'));

        if (msg.includes('Sign in') || msg.includes('age-restricted'))
          return reject(new Error('This video requires sign-in or is age-restricted.'));

        return reject(new Error(`yt-dlp error: ${msg.slice(0, 300)}`));
      }

      const lines = stdout.trim().split('\n').map(l => l.trim()).filter(Boolean);

      if (lines.length < 3)
        return reject(new Error('Could not extract audio URL — check that this is a valid YouTube URL.'));

      resolve({
        title:     lines[0],
        duration:  lines[1],
        streamUrl: lines[2],
      });
    });
  });

// POST /api/stations/:stationId/youtube
const addYouTubeTrack = async (req, res) => {
  const { youtube_url, artist } = req.body;

  if (!youtube_url)
    return res.status(400).json({ error: 'youtube_url is required' });

  const isYT = youtube_url.includes('youtube.com') || youtube_url.includes('youtu.be');
  if (!isYT)
    return res.status(400).json({ error: 'Please provide a valid YouTube URL' });

  const stationResult = await pool.query(
    'SELECT * FROM stations WHERE id=$1 AND user_id=$2',
    [req.params.stationId, req.user.id]
  );
  if (stationResult.rows.length === 0)
    return res.status(404).json({ error: 'Station not found' });

  const station = stationResult.rows[0];

  try {
    const { title, duration, streamUrl } = await extractYouTubeInfo(youtube_url);
    const expiresAt = new Date(Date.now() + URL_TTL_MS);

    const result = await pool.query(
      `INSERT INTO tracks
         (station_id, user_id, title, artist, filename, filepath,
          file_size, mime_type, source, youtube_url, stream_url_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,0,'audio/mpeg','youtube',$7,$8)
       RETURNING *`,
      [
        station.id,
        req.user.id,
        title,
        artist || 'YouTube',
        `youtube:${youtube_url}`,
        streamUrl,
        youtube_url,
        expiresAt,
      ]
    );

    const track = result.rows[0];

    // Register with proxy and persist proxy_url to DB immediately
    registerTrack(track.id, streamUrl);
    const proxyUrl = getProxyUrl(track.id);
    await pool.query('UPDATE tracks SET proxy_url=$1 WHERE id=$2', [proxyUrl, track.id]);

    // FIX: rebuild playlist AND auto-start AutoDJ if not already running
    await rebuildPlaylistAndAutoStart(station);

    res.status(201).json({ ...track, proxy_url: proxyUrl });
  } catch (err) {
    console.error('YouTube extract error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// POST /api/stations/:stationId/youtube/:trackId/refresh
const refreshYouTubeTrack = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, s.mount_point, s.user_id as station_owner
       FROM tracks t JOIN stations s ON t.station_id = s.id
       WHERE t.id=$1 AND t.source='youtube' AND s.user_id=$2`,
      [req.params.trackId, req.user.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'YouTube track not found' });

    const track = result.rows[0];
    const { streamUrl } = await extractYouTubeInfo(track.youtube_url);
    const expiresAt = new Date(Date.now() + URL_TTL_MS);

    // Re-register with proxy so it serves the fresh URL
    registerTrack(track.id, streamUrl);
    const proxyUrl = getProxyUrl(track.id);

    // Update both filepath AND proxy_url in DB
    await pool.query(
      'UPDATE tracks SET filepath=$1, stream_url_expires_at=$2, proxy_url=$3 WHERE id=$4',
      [streamUrl, expiresAt, proxyUrl, track.id]
    );

    const stationResult = await pool.query('SELECT * FROM stations WHERE id=$1', [track.station_id]);
    if (stationResult.rows.length > 0) {
      await rebuildPlaylistAndAutoStart(stationResult.rows[0]);
    }

    res.json({ message: 'Stream URL refreshed', expires_at: expiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Background job — runs every 30 min to refresh expiring YouTube URLs.
 */
const refreshExpiredYouTubeTracks = async () => {
  try {
    const result = await pool.query(
      `SELECT t.*, s.mount_point
       FROM tracks t JOIN stations s ON t.station_id = s.id
       WHERE t.source='youtube'
         AND t.stream_url_expires_at IS NOT NULL
         AND t.stream_url_expires_at < NOW() + INTERVAL '30 minutes'`
    );

    if (result.rows.length === 0) return;
    console.log(`🔄 Refreshing ${result.rows.length} expired YouTube URL(s)...`);

    for (const track of result.rows) {
      try {
        const { streamUrl } = await extractYouTubeInfo(track.youtube_url);
        const expiresAt = new Date(Date.now() + URL_TTL_MS);

        // Re-register with proxy and update proxy_url in DB
        registerTrack(track.id, streamUrl);
        const proxyUrl = getProxyUrl(track.id);

        await pool.query(
          'UPDATE tracks SET filepath=$1, stream_url_expires_at=$2, proxy_url=$3 WHERE id=$4',
          [streamUrl, expiresAt, proxyUrl, track.id]
        );
        console.log(`  ✅ Refreshed: ${track.title}`);
      } catch (e) {
        console.error(`  ❌ Failed "${track.title}": ${e.message}`);
      }
    }

    const stationIds = [...new Set(result.rows.map(t => t.station_id))];
    for (const sid of stationIds) {
      const s = await pool.query('SELECT * FROM stations WHERE id=$1', [sid]);
      if (s.rows.length > 0) await rebuildPlaylistAndAutoStart(s.rows[0]);
    }
  } catch (err) {
    console.error('YouTube refresh job error:', err.message);
  }
};

/**
 * Rebuilds the playlist file and:
 * - If AutoDJ is already running: hot-reloads via file watch + socket (no interruption)
 * - If AutoDJ is NOT running: generates .liq script and starts Liquidsoap automatically
 */
const rebuildPlaylistAndAutoStart = async (station) => {
  const tracks = await pool.query(
    'SELECT filepath, proxy_url FROM tracks WHERE station_id=$1 ORDER BY created_at ASC',
    [station.id]
  );

  writePlaylist(station.mount_point, tracks.rows);

  if (isRunning(station.mount_point)) {
    // Hot reload — no restart, no stream interruption
    reloadPlaylist(station.mount_point).catch(() => {});
  } else if (tracks.rows.length > 0) {
    // Not running but we have tracks — start automatically
    console.log(`▶️  Auto-starting AutoDJ for station "${station.name}" (${station.mount_point})`);
    const broadcasters = await pool.query(
      'SELECT * FROM broadcasters WHERE station_id=$1 AND is_active=true',
      [station.id]
    );
    regenerateLiqScript(station, broadcasters.rows);
    startLiquidsoap(station);
  }
};

// Keep old name as alias for backward compatibility (used by index.js)
const rebuildPlaylist = rebuildPlaylistAndAutoStart;

module.exports = { addYouTubeTrack, refreshYouTubeTrack, refreshExpiredYouTubeTracks };
