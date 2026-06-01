/**
 * Liquidsoap Service — v6.1
 *
 * FIX v6.1: stopLiquidsoapAndWait() — waits 2.5s after SIGTERM so the OS
 * fully releases the harbor port before the new process tries to bind it.
 * This fixes "Address already in use" when enabling a broadcaster after disabling.
 *
 * KEY FEATURES:
 *   - HOT playlist reload: writePlaylist() writes the file only — Liquidsoap's
 *     reload_mode="watch" picks it up automatically. No restart needed.
 *   - Unix socket control: each station gets a socket at /tmp/liq-<mount>.sock
 *     so we can send skip / reload / mode commands without restarting.
 *   - Playback mode: "randomize" or "normal" (sequential).
 *   - Per-station harbor ports: 9000 + station.id (no conflicts).
 *
 * FALLBACK CHAIN:
 *   1. Live broadcaster (harbor input) — always wins
 *   2. AutoDJ playlist — plays 24/7 when no live
 *   3. Silence — only if playlist is empty
 */

const fs        = require('fs-extra');
const path      = require('path');
const net       = require('net');
const { spawn, exec } = require('child_process');
const { pool }  = require('../config/db');

const LIQ_DIR      = path.join(__dirname, '../../liq');
const PLAYLIST_DIR = path.join(__dirname, '../../playlists');
const METADATA_DIR = path.join(__dirname, '../../metadata');

fs.ensureDirSync(LIQ_DIR);
fs.ensureDirSync(PLAYLIST_DIR);
fs.ensureDirSync(METADATA_DIR);

// mount_point → child process
const processes = {};

// Pending auto-restart timer handles — cancelled on intentional stop/start
const restartTimers = {};

// ── Playlist (HOT — no restart) ───────────────────────────────────────────────

/**
 * Write the playlist file only.
 * Liquidsoap's reload_mode="watch" detects the file change and reloads
 * at the next track boundary. No restart. No stream interruption.
 */
const writePlaylist = (mount_point, tracks = []) => {
  const playlistPath = path.join(PLAYLIST_DIR, `${mount_point}.txt`);
  const lines = tracks
    .map(t => {
      if (!t.filepath) return null;
      return t.proxy_url || t.filepath;
    })
    .filter(Boolean)
    .join('\n');
  fs.writeFileSync(playlistPath, lines + '\n');
  return playlistPath;
};

// ── Socket control ────────────────────────────────────────────────────────────

const socketPath = (mount_point) =>
  `/tmp/liq-${mount_point.replace(/\//g, '_')}.sock`;

/**
 * Send a command to Liquidsoap's socket server.
 * Returns the response string, or null on error.
 */
const sendCommand = (mount_point, command) =>
  new Promise((resolve) => {
    const sockPath = socketPath(mount_point);
    if (!fs.existsSync(sockPath)) return resolve(null);

    const client = net.createConnection(sockPath);
    let response = '';

    client.setTimeout(2000);
    client.on('connect', () => client.write(command + '\n'));
    client.on('data',    d  => { response += d.toString(); });
    client.on('end',     ()  => resolve(response.trim()));
    client.on('timeout', ()  => { client.destroy(); resolve(null); });
    client.on('error',   ()  => resolve(null));
  });

/**
 * Skip to the next track via the socket.
 */
const skipTrack = (mount_point) =>
  sendCommand(mount_point, 'autodj.skip');

/**
 * Reload the playlist file via the socket (belt-and-suspenders on top of "watch").
 */
const reloadPlaylist = (mount_point) =>
  sendCommand(mount_point, 'autodj.reload');

// ── Script generation (COLD — restarts Liquidsoap) ───────────────────────────

const toWslPath = (p) => {
  let s = p.replace(/\\/g, '/');
  if (process.env.LIQUIDSOAP_PATH && process.env.LIQUIDSOAP_PATH.trim().startsWith('wsl')) {
    s = s.replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
  }
  return s;
};

/**
 * Generate (or regenerate) the .liq script.
 * Only call this when something structural changes: new broadcaster,
 * station rename, or playback mode change.
 * For track uploads/deletes, call writePlaylist() only — no restart needed.
 */
const regenerateLiqScript = (station, broadcasters = []) => {
  const {
    mount_point, source_password, name, genre, description,
    autodj_mode,
  } = station;

  const playlistPath = path.join(PLAYLIST_DIR, `${mount_point}.txt`);
  const liqPath      = path.join(LIQ_DIR,      `${mount_point}.liq`);
  const metadataPath = path.join(METADATA_DIR,  `${mount_point}.json`);
  const sockPath     = socketPath(mount_point);

  const playlistLiq  = toWslPath(playlistPath);
  const metadataLiq  = toWslPath(metadataPath);
  const sockLiq      = toWslPath(sockPath);

 const icecastHost = 'localhost';
  const icecastPort       = process.env.ICECAST_INTERNAL_PORT || '8000';
  const icecastSourcePass = process.env.ICECAST_SOURCE_PASSWORD || source_password;

  const harborPort = station.harbor_port
    ? Number(station.harbor_port)
    : (9000 + station.id);

  const safeDesc  = (description || '').replace(/"/g, "'");
  const safeGenre = (genre || 'Various').replace(/"/g, "'");
  const safeName  = name.replace(/"/g, "'");

  // "randomize" = shuffle, "normal" = sequential
  const playMode = (autodj_mode === 'sequential') ? 'normal' : 'randomize';

  const harborPasswords = broadcasters.length > 0
    ? broadcasters.map(b => `"${b.password}"`).join(', ')
    : `"${source_password}"`;

  const script = `# RadioStudio — AutoDJ Script v6.1
# Station : ${name}
# Mount   : ${mount_point}
# Mode    : ${playMode}
# Generated: ${new Date().toISOString()}

settings.log.level := 3
settings.log.stdout := true
settings.server.telnet := false

# ── Unix socket server ────────────────────────────────────────────────────────
# Allows the backend to send skip/reload commands without restarting Liquidsoap.
settings.server.socket := true
settings.server.socket.path := "${sockLiq}"

# ── 1. Live broadcaster input ─────────────────────────────────────────────────
def auth(args) =
  password = args.password
  list.mem(password, [${harborPasswords}])
end

live = input.harbor(
  "${mount_point}",
  port=${harborPort},
  auth=auth,
  buffer=2.,
  max=20.
)

# ── 2. AutoDJ playlist ────────────────────────────────────────────────────────
# reload_mode="watch" — Liquidsoap watches the file on disk.
# When writePlaylist() rewrites it, Liquidsoap reloads at the next track
# boundary automatically. NO restart required.
autodj = playlist(
  "${playlistLiq}",
  reload_mode="watch",
  mode="${playMode}"
)

# Register a socket command to skip the current track
server.register(
  namespace="autodj",
  description="Skip to next track",
  "skip",
  fun(_) -> begin autodj.skip() ; "OK" end
)

# Register a socket command to force-reload the playlist
server.register(
  namespace="autodj",
  description="Reload playlist file",
  "reload",
  fun(_) -> begin autodj.reload() ; "OK" end
)

# ── 3. Silence fallback ───────────────────────────────────────────────────────
silence = blank(duration=10.)

# ── 4. Priority chain ─────────────────────────────────────────────────────────
radio = fallback(
  track_sensitive=false,
  [live, autodj, silence]
)

# ── 5. Now Playing metadata ───────────────────────────────────────────────────
# Writes a JSON file on every track change.
# The API reads this file — no polling of Liquidsoap needed.
def write_metadata(m) =
  title    = m["title"]
  artist   = m["artist"]
  album    = m["album"]
  src_kind = list.assoc(default="", "source_kind", m) == "harbor" ? "live" : "autodj"
  ts       = string(time())
  json_str = '{"title":"' ^ title ^ '","artist":"' ^ artist ^ '","album":"' ^ album ^ '","source":"' ^ src_kind ^ '","updated_at":"' ^ ts ^ '"}'
  file.write(data=json_str, "${metadataLiq}")
end

radio.on_metadata(write_metadata)

# ── 6. Output to Icecast ──────────────────────────────────────────────────────
icecast_out = output.icecast(
  %mp3(bitrate=128, stereo=true),
  host        = "${icecastHost}",
  port        = ${icecastPort},
  password    = "${icecastSourcePass}",
  mount       = "${mount_point}",
  name        = "${safeName}",
  genre       = "${safeGenre}",
  description = "${safeDesc}",
  radio
)

`;

  fs.writeFileSync(liqPath, script);
  console.log(`✅ Liquidsoap script written → ${liqPath}`);
  return liqPath;
};

// ── Process management ────────────────────────────────────────────────────────

const getLiqBin = () => {
  const raw   = process.env.LIQUIDSOAP_PATH || 'liquidsoap';
  const parts = raw.trim().split(/\s+/);
  return { bin: parts[0], prefixArgs: parts.slice(1) };
};

/**
 * Stop Liquidsoap for a station immediately (SIGTERM).
 * Does NOT wait for the port to be released.
 * Use stopLiquidsoapAndWait() when you plan to restart immediately after.
 */
const stopLiquidsoap = (mount_point) => {
  if (restartTimers[mount_point]) {
    clearTimeout(restartTimers[mount_point]);
    delete restartTimers[mount_point];
  }

  const existing = processes[mount_point];
  if (existing) {
    try { existing.kill('SIGTERM'); } catch {}
    delete processes[mount_point];
    console.log(`🛑 Liquidsoap stopped: ${mount_point}`);
  }
};

/**
 * Stop Liquidsoap and wait for the OS to fully release the harbor port.
 *
 * WHY THIS EXISTS:
 *   When you disable then immediately re-enable a broadcaster, the backend
 *   sends SIGTERM and immediately tries to spawn a new Liquidsoap process.
 *   The dying process hasn't released its TCP port yet, so the new process
 *   crashes with "Address already in use in bind()".
 *
 *   This function waits 2.5 seconds after SIGTERM, giving the kernel time
 *   to release the port before the new process starts.
 *
 * @param {string} mount_point
 * @param {number} waitMs — milliseconds to wait after SIGTERM (default: 2500)
 * @returns {Promise<void>}
 */
const stopLiquidsoapAndWait = (mount_point, waitMs = 2500) =>
  new Promise((resolve) => {
    stopLiquidsoap(mount_point);

    // Belt-and-suspenders: also try to kill any zombie process still
    // holding the port, in case SIGTERM didn't work cleanly.
    const harborPort = 9000; // We kill by port name but don't know exact port here —
    // the main protection is the timeout below.

    setTimeout(() => {
      // Try to free the port just in case (works on Linux/WSL, no-op elsewhere)
      exec(`fuser -k ${mount_point.replace(/\//g, '')} 2>/dev/null || true`, () => {});
      resolve();
    }, waitMs);
  });

const startLiquidsoap = async (station) => {
  const { mount_point, name } = station;
  const liqPath  = path.join(LIQ_DIR, `${mount_point}.liq`);
  const sockPath = socketPath(mount_point);

  if (!fs.existsSync(liqPath)) {
    console.warn(`⚠️  No .liq script for "${name}"`);
    return;
  }

  // Cancel any pending auto-restart timer so it cannot fire after this
  // intentional start and kill the process we are about to spawn.
  if (restartTimers[mount_point]) {
    clearTimeout(restartTimers[mount_point]);
    delete restartTimers[mount_point];
  }

  // Stop old process and wait for OS to release the harbor port.
  // This prevents "Address already in use" on rapid disable→enable.
  await stopLiquidsoapAndWait(mount_point, 2500);

  // Remove stale socket file so Liquidsoap can bind fresh
  try { if (fs.existsSync(sockPath)) fs.unlinkSync(sockPath); } catch {}

  const { bin, prefixArgs } = getLiqBin();

  let liqPathForSpawn = liqPath.replace(/\\/g, '/');
  if (bin === 'wsl') {
    liqPathForSpawn = liqPathForSpawn.replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
  }

  console.log(`🎵 Starting Liquidsoap for "${name}" (${mount_point})…`);

  let proc;
  try {
    proc = spawn(bin, [...prefixArgs, liqPathForSpawn], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
  } catch (spawnErr) {
    console.warn(`⚠️  Could not spawn liquidsoap: ${spawnErr.message}`);
    return;
  }

  proc.on('error', (err) => {
    if (err.code === 'ENOENT')
      console.warn(`⚠️  [LIQ:${mount_point}] liquidsoap not found in PATH`);
    else
      console.error(`❌ [LIQ:${mount_point}] error: ${err.message}`);
    delete processes[mount_point];
  });

  proc.stdout.on('data', d => process.stdout.write(`[LIQ:${mount_point}] ${d}`));
  proc.stderr.on('data', d => process.stderr.write(`[LIQ:${mount_point}] ${d}`));

  proc.on('close', (code) => {
    console.log(`[LIQ:${mount_point}] exited (code ${code})`);
    delete processes[mount_point];
    // -4058 = ENOENT on Windows — don't retry endlessly
    if (code !== 0 && code !== null && code !== -4058) {
      restartTimers[mount_point] = setTimeout(async () => {
        delete restartTimers[mount_point];
        try {
          const res = await pool.query('SELECT * FROM stations WHERE mount_point=$1', [mount_point]);
          if (res.rows.length > 0) startLiquidsoap(res.rows[0]);
        } catch (e) {
          console.error(`[LIQ:${mount_point}] restart error:`, e.message);
        }
      }, 5000);
    }
  });

  processes[mount_point] = proc;
  return proc;
};

const isRunning = (mount_point) => !!processes[mount_point];

const startAllStations = async () => {
  try {
    const stationsRes = await pool.query('SELECT * FROM stations');
    for (const station of stationsRes.rows) {
      const tracksRes = await pool.query(
        'SELECT filepath, proxy_url FROM tracks WHERE station_id=$1 ORDER BY created_at ASC',
        [station.id]
      );
      writePlaylist(station.mount_point, tracksRes.rows);

      const broadcastersRes = await pool.query(
        'SELECT * FROM broadcasters WHERE station_id=$1 AND is_active=true',
        [station.id]
      );
      regenerateLiqScript(station, broadcastersRes.rows);
      startLiquidsoap(station);
    }
    console.log(`🎵 Liquidsoap started for ${stationsRes.rows.length} station(s)`);
  } catch (e) {
    console.error('startAllStations error:', e.message);
  }
};

// ── Now Playing ───────────────────────────────────────────────────────────────

const getNowPlaying = (mount_point) => {
  const metadataPath = path.join(METADATA_DIR, `${mount_point}.json`);
  try {
    if (fs.existsSync(metadataPath)) {
      return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    }
  } catch {}
  return { title: 'AutoDJ', artist: '', album: '', source: 'autodj', updated_at: null };
};

// Legacy aliases
const generateLiqScript = regenerateLiqScript;
const getLiqStatus = (mount_point) => fs.existsSync(path.join(LIQ_DIR, `${mount_point}.liq`));

module.exports = {
  writePlaylist,
  regenerateLiqScript,
  generateLiqScript,
  startLiquidsoap,
  stopLiquidsoap,
  stopLiquidsoapAndWait,
  startAllStations,
  isRunning,
  getNowPlaying,
  getLiqStatus,
  skipTrack,
  reloadPlaylist,
  sendCommand,
  socketPath,
  LIQ_DIR,
  PLAYLIST_DIR,
  METADATA_DIR,
};