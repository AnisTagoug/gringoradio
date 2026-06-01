require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const { pool, initDB } = require('./config/db');
const { startIcecast } = require('./services/icecastService');
const { startAllStations } = require('./services/liquidsoapService');
const { refreshExpiredYouTubeTracks } = require('./controllers/youtubeController');
const { UPLOAD_DIR } = require('./services/storageService');
const { registerTrack, getProxyUrl } = require('./services/youtubeStreamProxy');

// After DB init, re-register all YouTube tracks with the proxy
// FIX: also update proxy_url in DB so playlist rebuilds use correct URLs
const reRegisterYouTubeTracks = async () => {
  try {
    const res = await pool.query(
      "SELECT id, filepath FROM tracks WHERE source='youtube'"
    );
    for (const t of res.rows) {
      registerTrack(t.id, t.filepath);
      const proxyUrl = getProxyUrl(t.id);
      await pool.query(
        'UPDATE tracks SET proxy_url=$1 WHERE id=$2',
        [proxyUrl, t.id]
      );
    }
    console.log(`🎧 Re-registered ${res.rows.length} YouTube track(s) with proxy`);
  } catch (e) {
    console.error('Proxy re-register error:', e.message);
  }
};

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://gringoo-three.vercel.app',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Local audio files served as static files
app.use('/uploads', express.static(UPLOAD_DIR));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/stations', require('./routes/stations'));
app.use('/api/stations/:stationId/tracks',       require('./routes/tracks'));
app.use('/api/stations/:stationId/broadcasters', require('./routes/broadcasters'));
app.use('/api/stations/:stationId/youtube',      require('./routes/youtube'));
app.use('/api/stations/:stationId/autodj',       require('./routes/autodj'));
app.use('/api/stations/:stationId/now-playing',  require('./routes/nowPlaying'));
app.use('/api/stations/:stationId/drive',        require('./routes/drive'));

app.get('/api/health', (req, res) => res.json({
  status:  'ok',
  time:    new Date(),
  storage: process.env.STORAGE_BACKEND || 'local',
}));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n🚀 RadioStudio backend — http://localhost:${PORT}`);
  console.log(`📦 Storage: ${process.env.STORAGE_BACKEND || 'local'}`);

  await initDB();
  await startIcecast();

  // Small delay so Icecast container is ready before Liquidsoap connects
  setTimeout(async () => {
    // FIX: reRegisterYouTubeTracks runs BEFORE startAllStations so proxy_url
    // is already correct in DB when playlists are built
    await reRegisterYouTubeTracks();
    await startAllStations();
  }, 4000);

  // YouTube stream URL refresh every 30 minutes
  await refreshExpiredYouTubeTracks();
  setInterval(refreshExpiredYouTubeTracks, 30 * 60 * 1000);
  console.log('🎵 YouTube URL refresh job active (every 30 min)\n');
});