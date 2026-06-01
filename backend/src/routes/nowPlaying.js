/**
 * Now Playing API
 * GET /api/stations/:stationId/now-playing
 *
 * Returns current track metadata from the Liquidsoap metadata file.
 * Also polls the Icecast admin API to check if the mount is live.
 */
const express = require('express');
const router  = express.Router({ mergeParams: true });
const { pool } = require('../config/db');
const { getNowPlaying, isRunning } = require('../services/liquidsoapService');
const http = require('http');

const getIcecastStats = (mount_point) =>
  new Promise((resolve) => {
    const host     = process.env.ICECAST_HOST || 'localhost';
    const port     = process.env.ICECAST_INTERNAL_PORT || '8000';
    const user     = process.env.ICECAST_ADMIN_USER || 'admin';
    const password = process.env.ICECAST_ADMIN_PASSWORD || 'adminpass123';

    const options = {
      host, port,
      path: '/admin/stats',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64'),
      },
      timeout: 2000,
    };

    const req = http.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          // Quick parse: find listener count for this mount
          const mountMatch = data.match(
            new RegExp(`<source mount="${mount_point.replace('/', '\\/')}">([\\s\\S]*?)<\\/source>`)
          );
          if (!mountMatch) return resolve({ listeners: 0, connected: false });

          const block = mountMatch[1];
          const listenersMatch = block.match(/<listeners>(\d+)<\/listeners>/);
          const listeners = listenersMatch ? parseInt(listenersMatch[1]) : 0;
          resolve({ listeners, connected: true });
        } catch {
          resolve({ listeners: 0, connected: false });
        }
      });
    });

    req.on('error', () => resolve({ listeners: 0, connected: false }));
    req.on('timeout', () => { req.destroy(); resolve({ listeners: 0, connected: false }); });
  });

router.get('/', async (req, res) => {
  try {
    const stationRes = await pool.query('SELECT * FROM stations WHERE id=$1', [req.params.stationId]);
    if (stationRes.rows.length === 0)
      return res.status(404).json({ error: 'Station not found' });

    const station = stationRes.rows[0];
    const nowPlaying = getNowPlaying(station.mount_point);
    const icecastStats = await getIcecastStats(station.mount_point);

    res.json({
      station_id:    station.id,
      station_name:  station.name,
      mount_point:   station.mount_point,
      stream_url:    station.stream_url,
      autodj_running: isRunning(station.mount_point),
      source:        nowPlaying.source || 'autodj',
      is_live:       nowPlaying.source === 'live',
      title:         nowPlaying.title  || 'AutoDJ',
      artist:        nowPlaying.artist || '',
      album:         nowPlaying.album  || '',
      updated_at:    nowPlaying.updated_at || null,
      listeners:     icecastStats.listeners,
      icecast_connected: icecastStats.connected,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
