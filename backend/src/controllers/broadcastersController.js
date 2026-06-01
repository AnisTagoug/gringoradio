const { pool } = require('../config/db');
const { reloadIcecast } = require('../services/icecastService');
const {
  regenerateLiqScript,
  writeHarborPasswords,
  startLiquidsoap,
  isRunning,
  sendCommand,
} = require('../services/liquidsoapService');

const getBroadcasters = async (req, res) => {
  try {
    const check = await pool.query(
      'SELECT id FROM stations WHERE id=$1 AND user_id=$2',
      [req.params.stationId, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Station not found' });

    const result = await pool.query(
      `SELECT id, display_name, username, mount_point, role, is_active, created_at
       FROM broadcasters WHERE station_id=$1 ORDER BY created_at ASC`,
      [req.params.stationId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const kickLiveBroadcaster = async (mount_point) => {
  const icecastHost     = process.env.ICECAST_HOST          || 'localhost';
  const icecastPort     = process.env.ICECAST_PORT          || process.env.ICECAST_INTERNAL_PORT || '8000';
  const icecastAdminPwd = process.env.ICECAST_ADMIN_PASSWORD || 'adminpass123';

  // Try to kick via Liquidsoap socket first
  try {
    const liqResult = await sendCommand(mount_point, 'live.stop');
    console.log(`🔇 Liquidsoap kick for ${mount_point}: ${liqResult || 'no response'}`);
  } catch (e) {
    console.warn(`⚠️  Liquidsoap kick failed for ${mount_point}: ${e.message}`);
  }

  // Also kick via Icecast admin API to be sure
  try {
    const auth = Buffer.from(`admin:${icecastAdminPwd}`).toString('base64');
    const url  = `http://${icecastHost}:${icecastPort}/admin/killsource?mount=${encodeURIComponent(mount_point)}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(3000),
    });
    console.log(`🔇 Icecast kill source for ${mount_point}: HTTP ${resp.status}`);
  } catch (e) {
    console.warn(`⚠️  Icecast kill source failed for ${mount_point}: ${e.message}`);
  }
};

/**
 * Apply a broadcaster change so the new password set takes effect.
 *
 * Harbor auth is now DYNAMIC — the running Liquidsoap process reads the valid
 * passwords from a file on every connection attempt. So all we MUST do to make
 * an add / edit / deactivate take effect is rewrite that file. No Liquidsoap
 * restart, no Icecast restart, and no backend restart needed.
 *
 * This is why the previous version broke on the Azure VM: it depended on
 * `reloadIcecast()` and a full Liquidsoap restart succeeding. If the Icecast
 * restart errored or hung on the server, the function threw before the harbor
 * was updated, so new passwords were rejected until a manual backend restart.
 *
 * Flow:
 *   1. Rewrite the harbor password file (instant, authoritative).
 *   2. Keep the .liq script in sync for the next cold start (no restart).
 *   3. Start Liquidsoap only if it is not already running for this station.
 *   4. Best-effort Icecast refresh — non-fatal, cannot block the auth update.
 */
const reloadAfterBroadcasterChange = async (stationId) => {
  const stationRes = await pool.query('SELECT * FROM stations WHERE id=$1', [stationId]);
  if (stationRes.rows.length === 0) return;
  const station = stationRes.rows[0];

  const bRes = await pool.query(
    'SELECT * FROM broadcasters WHERE station_id=$1 AND is_active=true',
    [stationId]
  );

  // 1. CRITICAL & INSTANT: the running harbor reads this file on every connect.
  writeHarborPasswords(station, bRes.rows);
  console.log(`🔐 Harbor passwords updated for "${station.name}" — ${bRes.rows.length} active broadcaster(s)`);

  // 2. Keep the generated script consistent for the next cold start.
  //    This does NOT restart the running process.
  try {
    regenerateLiqScript(station, bRes.rows);
  } catch (e) {
    console.warn(`⚠️  regenerateLiqScript failed (non-fatal): ${e.message}`);
  }

  // 3. Ensure Liquidsoap is up. If it is already running we leave it alone —
  //    dynamic auth already has the new passwords, so no restart is needed.
  try {
    if (!isRunning(station.mount_point)) {
      console.log(`▶️  Liquidsoap not running for ${station.mount_point} — starting it`);
      await startLiquidsoap(station);
    }
  } catch (e) {
    console.warn(`⚠️  startLiquidsoap failed (non-fatal): ${e.message}`);
  }

  // 4. Best-effort Icecast refresh. Harbor auth does NOT depend on this, so a
  //    failure here can no longer block broadcaster password updates.
  try {
    await reloadIcecast();
  } catch (e) {
    console.warn(`⚠️  reloadIcecast failed (non-fatal): ${e.message}`);
  }
};

const createBroadcaster = async (req, res) => {
  const { display_name, username, password, role } = req.body;
  if (!display_name || !username || !password)
    return res.status(400).json({ error: 'display_name, username, and password are required' });

  try {
    const stationRes = await pool.query(
      'SELECT * FROM stations WHERE id=$1 AND user_id=$2',
      [req.params.stationId, req.user.id]
    );
    if (stationRes.rows.length === 0) return res.status(404).json({ error: 'Station not found' });
    const station = stationRes.rows[0];

    const result = await pool.query(
      `INSERT INTO broadcasters (station_id, user_id, display_name, username, password, mount_point, role)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [station.id, req.user.id, display_name, username, password, station.mount_point, role || 'broadcaster']
    );

    await reloadAfterBroadcasterChange(station.id);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists for this station' });
    res.status(500).json({ error: 'Server error' });
  }
};

const updateBroadcaster = async (req, res) => {
  const { display_name, password, role, is_active } = req.body;
  try {
    const check = await pool.query(
      `SELECT b.id, b.station_id, b.mount_point, b.is_active as was_active
       FROM broadcasters b
       JOIN stations s ON b.station_id = s.id
       WHERE b.id=$1 AND s.user_id=$2`,
      [req.params.broadcasterId, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Broadcaster not found' });

    const { station_id, mount_point, was_active } = check.rows[0];

    const result = await pool.query(
      `UPDATE broadcasters SET
        display_name=COALESCE($1,display_name),
        password=COALESCE($2,password),
        role=COALESCE($3,role),
        is_active=COALESCE($4,is_active)
       WHERE id=$5 RETURNING *`,
      [display_name, password, role, is_active, req.params.broadcasterId]
    );

    // eslint-disable-next-line eqeqeq
    const nowDisabled = was_active == true && is_active === false;
    // eslint-disable-next-line eqeqeq
    const nowEnabled  = was_active == false && is_active === true;

    if (nowDisabled) {
      console.log(`🚫 Broadcaster disabled — kicking live source on ${mount_point}`);
      // Kick the live broadcaster first, then reload (with port wait)
      await kickLiveBroadcaster(mount_point);
    }

    if (nowEnabled) {
      console.log(`✅ Broadcaster enabled — restarting Liquidsoap on ${mount_point}`);
    }

    // Always reload after any broadcaster change (disable or enable).
    // reloadAfterBroadcasterChange now includes the port-release wait.
    await reloadAfterBroadcasterChange(station_id);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteBroadcaster = async (req, res) => {
  try {
    const check = await pool.query(
      `SELECT b.id, b.station_id, b.mount_point, b.is_active
       FROM broadcasters b
       JOIN stations s ON b.station_id = s.id
       WHERE b.id=$1 AND s.user_id=$2`,
      [req.params.broadcasterId, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Broadcaster not found' });

    const { station_id, mount_point, is_active } = check.rows[0];

    if (is_active) {
      console.log(`🚫 Active broadcaster deleted — kicking live source on ${mount_point}`);
      await kickLiveBroadcaster(mount_point);
    }

    await pool.query('DELETE FROM broadcasters WHERE id=$1', [req.params.broadcasterId]);
    await reloadAfterBroadcasterChange(station_id);
    res.json({ message: 'Broadcaster deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getBroadcasterCredentials = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, s.name as station_name, s.stream_url, s.mount_point as station_mount,
              s.harbor_port as station_harbor_port
       FROM broadcasters b
       JOIN stations s ON b.station_id = s.id
       WHERE b.id=$1 AND s.user_id=$2`,
      [req.params.broadcasterId, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Broadcaster not found' });

    const b = result.rows[0];
    const host = process.env.ICECAST_HOST || 'localhost';
    const port = process.env.ICECAST_PORT || process.env.ICECAST_INTERNAL_PORT || '8000';
    const harborPort = b.station_harbor_port || (9000 + b.station_id);
    const stream_url = `http://${host}:${port}${b.mount_point}`;

    res.json({
      display_name: b.display_name,
      username: b.username,
      password: b.password,
      mount_point: b.mount_point,
      stream_url,
      host,
      port,
      harbor_port: harborPort,
      note: 'Connect to the Liquidsoap harbor port. Liquidsoap handles switching between live and AutoDJ automatically.',
      instructions: {
        butt:  `Server: ${host}, Port: ${harborPort}, Mount: ${b.mount_point}, Password: ${b.password}`,
        obs:   `Server: http://${host}:${harborPort}${b.mount_point}, Password: ${b.password}`,
        mixxx: `Host: ${host}:${harborPort}, Mount: ${b.mount_point}, Password: ${b.password}`,
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getBroadcasters,
  createBroadcaster,
  updateBroadcaster,
  deleteBroadcaster,
  getBroadcasterCredentials,
};