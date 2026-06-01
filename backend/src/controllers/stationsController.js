const { pool } = require('../config/db');
const { regenerateLiqScript, writePlaylist } = require('../services/liquidsoapService');
const { reloadIcecast } = require('../services/icecastService');

const ICECAST_HOST = process.env.ICECAST_HOST || 'localhost';
const ICECAST_PORT = process.env.ICECAST_PORT || '8000';

const toSlug = (name) =>
  '/' + name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 30);

const generatePassword = () =>
  Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

const getMyStations = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, COUNT(b.id) as broadcaster_count
       FROM stations s
       LEFT JOIN broadcasters b ON b.station_id = s.id
       WHERE s.user_id=$1
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const getStation = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM stations WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Station not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const createStation = async (req, res) => {
  const { name, description, genre } = req.body;
  if (!name) return res.status(400).json({ error: 'Station name is required' });

  try {
    // ── ONE STATION PER USER — enforced at backend level ──────────────────
    const existing = await pool.query(
      'SELECT id FROM stations WHERE user_id=$1',
      [req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.status(403).json({
        error: 'You already have a radio station. Each account is limited to one station.'
      });
    }

    // Port, mount point and passwords are all auto-generated — users never choose these
    const mount_point = toSlug(name) + '-' + Date.now().toString(36);
    const source_password = generatePassword();
    const stream_url = `http://${ICECAST_HOST}:${ICECAST_PORT}${mount_point}`;

    const result = await pool.query(
      `INSERT INTO stations (user_id,name,description,genre,mount_point,source_password,stream_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.id, name, description, genre, mount_point, source_password, stream_url]
    );
    const station = result.rows[0];

    // Harbor port auto-assigned — user never sees or picks this
    const harbor_port = 9000 + station.id;
    await pool.query('UPDATE stations SET harbor_port=$1 WHERE id=$2', [harbor_port, station.id]);
    station.harbor_port = harbor_port;

    writePlaylist(mount_point, []);
    regenerateLiqScript(station, []);

    await reloadIcecast();

    res.status(201).json(station);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateStation = async (req, res) => {
  // Users can only update name, description, genre and autodj_enabled
  // They cannot change mount_point, ports, passwords, or server config
  const { name, description, genre, autodj_enabled } = req.body;
  try {
    const result = await pool.query(
      `UPDATE stations SET
        name=COALESCE($1,name),
        description=COALESCE($2,description),
        genre=COALESCE($3,genre),
        autodj_enabled=COALESCE($4,autodj_enabled),
        updated_at=NOW()
       WHERE id=$5 AND user_id=$6 RETURNING *`,
      [name, description, genre, autodj_enabled, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Station not found' });

    const station = result.rows[0];
    const bRes = await pool.query(
      'SELECT * FROM broadcasters WHERE station_id=$1 AND is_active=true', [station.id]
    );
    regenerateLiqScript(station, bRes.rows);

    res.json(station);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteStation = async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM stations WHERE id=$1 AND user_id=$2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Station not found' });
    await reloadIcecast();
    res.json({ message: 'Station deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const getCredentials = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, COUNT(b.id) as broadcaster_count
       FROM stations s
       LEFT JOIN broadcasters b ON b.station_id=s.id AND b.is_active=true
       WHERE s.id=$1 AND s.user_id=$2
       GROUP BY s.id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Station not found' });
    const s = result.rows[0];
    const host = ICECAST_HOST;
    const port = ICECAST_PORT;
    const harborPort = s.harbor_port || (9000 + s.id);

    // Always build stream_url fresh from env — never trust the stored value
    const stream_url = `http://${host}:${port}${s.mount_point}`;

    res.json({
      stream_url,
      mount_point: s.mount_point,
      source_password: s.source_password,
      icecast_host: host,
      icecast_port: port,
      harbor_port: harborPort,
      broadcaster_count: parseInt(s.broadcaster_count),
      architecture: {
        listener_url: stream_url,
        note: 'Listeners ALWAYS connect to this URL — it never changes regardless of who is broadcasting.',
        how_it_works: 'Broadcasters connect to Liquidsoap harbor with their own password. Liquidsoap automatically switches between live and AutoDJ.'
      },
      instructions: {
        butt: `Server: ${host}, Port: ${harborPort}, Mount: ${s.mount_point}, Password: (your broadcaster password)`,
        obs: `Server: http://${host}:${harborPort}${s.mount_point}, Password: (your broadcaster password)`,
        mixxx: `Host: ${host}:${harborPort}, Mount: ${s.mount_point}, Password: (your broadcaster password)`,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getMyStations, getStation, createStation, updateStation, deleteStation, getCredentials };
