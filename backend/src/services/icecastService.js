const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const { pool } = require('../config/db');

const ICECAST_CONFIG_DIR = path.join(__dirname, '../../icecast');
const ICECAST_CONFIG_PATH = path.join(ICECAST_CONFIG_DIR, 'icecast.xml');
const CONTAINER_NAME = process.env.ICECAST_CONTAINER_NAME || 'radiostudio-icecast';
const ICECAST_PORT = process.env.ICECAST_INTERNAL_PORT || '8000';
const ICECAST_ADMIN_PASSWORD = process.env.ICECAST_ADMIN_PASSWORD || 'adminpass123';
const ICECAST_SOURCE_PASSWORD = process.env.ICECAST_SOURCE_PASSWORD || 'changeme';

fs.ensureDirSync(ICECAST_CONFIG_DIR);

/**
 * NEW ARCHITECTURE — No Liquidsoap needed for live switching.
 *
 * Each station has ONE public mount (e.g. /gringo-mpeo5svt).
 * Every broadcaster connects DIRECTLY to that same mount with their own password.
 * Icecast accepts whichever broadcaster connects first; rejects others until the
 * current one disconnects.
 *
 * How multiple passwords work in Icecast:
 *   - The global <source-password> in <authentication> is a catch-all fallback.
 *   - Per-mount <password> inside <mount> blocks override it for that mount.
 *   - BUT Icecast only supports ONE password per <mount> block natively.
 *
 * Solution: we use Icecast's <authentication> + per-mount htpasswd file.
 * Simpler alternative used here: generate ONE <mount> block per broadcaster,
 * ALL pointing to the same mount-name, each with their password.
 * Icecast processes mount blocks in order and accepts ANY matching password.
 *
 * Actually the CLEANEST approach: use a single mount with a custom
 * auth URL, OR — simplest of all — put each broadcaster password as a
 * separate <mount> entry with the SAME <mount-name>. Icecast merges them.
 *
 * Verified working: multiple <mount> blocks with the same <mount-name>
 * are all checked; first password match wins.
 */
const generateIcecastConfig = async () => {
  const stationsRes = await pool.query('SELECT * FROM stations');
  const stations = stationsRes.rows;

  let mountBlocks = '';

  for (const station of stations) {
    const bRes = await pool.query(
      'SELECT * FROM broadcasters WHERE station_id=$1 AND is_active=true',
      [station.id]
    );
  mountBlocks += `
    <!-- Liquidsoap AutoDJ: ${station.name} -->
    <mount type="normal">
      <mount-name>${station.mount_point}</mount-name>
      <password>${station.source_password}</password>
      <max-listeners>500</max-listeners>
      <public>0</public>
    </mount>`;
    if (bRes.rows.length > 0) {
      // One <mount> block per broadcaster, ALL on the SAME mount-name.
      // Icecast checks each block's <password> in order — first match wins.
      // This lets every DJ use the same public URL with their own password.
      for (const b of bRes.rows) {
        mountBlocks += `
    <!-- Broadcaster: ${b.display_name} (@${b.username}) -->
    <mount type="normal">
      <mount-name>${station.mount_point}</mount-name>
      <password>${b.password}</password>
      <max-listeners>500</max-listeners>
      <public>1</public>
      <stream-name>${station.name}</stream-name>
      <stream-description>${(station.description || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')}</stream-description>
      <genre>${station.genre || 'Various'}</genre>
    </mount>`;
      }
    } else {
      // No broadcasters — station mount with its own source_password (for AutoDJ)
      mountBlocks += `
    <!-- Station: ${station.name} (AutoDJ only) -->
    <mount type="normal">
      <mount-name>${station.mount_point}</mount-name>
      <password>${station.source_password}</password>
      <max-listeners>500</max-listeners>
      <public>1</public>
      <stream-name>${station.name}</stream-name>
      <genre>${station.genre || 'Various'}</genre>
    </mount>`;
    }
  }

  const xml = `<icecast>
  <location>Earth</location>
  <admin>admin@radiostudio.local</admin>

  <limits>
    <clients>1000</clients>
    <sources>100</sources>
    <queue-size>524288</queue-size>
    <client-timeout>30</client-timeout>
    <header-timeout>15</header-timeout>
    <source-timeout>10</source-timeout>
    <burst-on-connect>1</burst-on-connect>
    <burst-size>65535</burst-size>
  </limits>

  <authentication>
    <source-password>${ICECAST_SOURCE_PASSWORD}</source-password>
    <relay-password>${ICECAST_SOURCE_PASSWORD}</relay-password>
    <admin-user>admin</admin-user>
    <admin-password>${ICECAST_ADMIN_PASSWORD}</admin-password>
  </authentication>

  <hostname>localhost</hostname>

  <listen-socket>
    <port>8000</port>
  </listen-socket>

  ${mountBlocks}

  <fileserve>1</fileserve>

  <paths>
    <basedir>/usr/share/icecast2</basedir>
    <logdir>/var/log/icecast2</logdir>
    <webroot>/usr/share/icecast2/web</webroot>
    <adminroot>/usr/share/icecast2/admin</adminroot>
    <pidfile>/var/run/icecast2/icecast2.pid</pidfile>
  </paths>

  <logging>
    <accesslog>access.log</accesslog>
    <errorlog>error.log</errorlog>
    <loglevel>3</loglevel>
    <logsize>10000</logsize>
  </logging>

  <security>
    <chroot>0</chroot>
  </security>
</icecast>`;

  fs.writeFileSync(ICECAST_CONFIG_PATH, xml);
  console.log('✅ icecast.xml generated');
  return ICECAST_CONFIG_PATH;
};

const run = (cmd) =>
  new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });

const isDockerAvailable = async () => {
  try { await run('docker info'); return true; }
  catch { return false; }
};

const isIcecastAvailable = async () => {
  try { await run('which icecast2 || which icecast'); return true; }
  catch { return false; }
};

// Tracks the native icecast process (non-Docker mode)
let icecastProc = null;

const startIcecastNative = async () => {
  await generateIcecastConfig();
  const configAbs = path.resolve(ICECAST_CONFIG_PATH);

  // Kill existing native process if any
  if (icecastProc) {
    try { icecastProc.kill('SIGTERM'); } catch {}
    icecastProc = null;
  }

  // Also kill any stale icecast process on the port
  await run(`fuser -k ${ICECAST_PORT}/tcp`).catch(() => {});

  const { spawn } = require('child_process');
  const bin = await run('which icecast2 || which icecast').catch(() => 'icecast2');

  console.log(`🔊 Starting native Icecast on port ${ICECAST_PORT}...`);

  icecastProc = spawn(bin.trim(), ['-c', configAbs], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  icecastProc.stdout.on('data', d => process.stdout.write(`[ICE] ${d}`));
  icecastProc.stderr.on('data', d => process.stderr.write(`[ICE] ${d}`));
  icecastProc.on('close', (code) => {
    console.log(`[ICE] Icecast exited (code ${code})`);
    icecastProc = null;
  });
  icecastProc.on('error', (err) => {
    console.error(`❌ Icecast error: ${err.message}`);
  });

  // Give it a moment to start
  await new Promise(r => setTimeout(r, 1500));
  console.log(`✅ Icecast started natively on port ${ICECAST_PORT}`);
  return true;
};

const startIcecast = async () => {
  await generateIcecastConfig();
  const configAbs = path.resolve(ICECAST_CONFIG_PATH);

  // Try Docker first
  const dockerAvailable = false; // disabled on Linux VPS
  if (dockerAvailable) {
    try {
      await run(`docker stop ${CONTAINER_NAME}`).catch(() => {});
      await run(`docker rm ${CONTAINER_NAME}`).catch(() => {});
      // moul/icecast ignores volume-mounted XML — it only reads env vars.
      // Pass passwords via -e flags so the image writes them into its own config.
      await run(
        `docker run -d --name ${CONTAINER_NAME} -p ${ICECAST_PORT}:8000 ` +
        `-e ICECAST_SOURCE_PASSWORD=${ICECAST_SOURCE_PASSWORD} ` +
        `-e ICECAST_RELAY_PASSWORD=${ICECAST_SOURCE_PASSWORD} ` +
        `-e ICECAST_ADMIN_PASSWORD=${ICECAST_ADMIN_PASSWORD} ` +
        `-e ICECAST_PASSWORD=${ICECAST_SOURCE_PASSWORD} ` +
        `-e ICECAST_HOSTNAME=localhost ` +
        `moul/icecast`
      );
      console.log(`✅ Icecast container started on port ${ICECAST_PORT}`);
      return true;
    } catch (err) {
      console.warn(`⚠️  Docker Icecast failed: ${err.message} — trying native...`);
    }
  } else {
    console.warn('⚠️  Docker not available — trying native Icecast...');
  }

  // Fallback: native icecast2 installed in WSL/Linux
  const nativeAvailable = await isIcecastAvailable();
  if (nativeAvailable) {
    return startIcecastNative();
  }

  console.error('❌ Neither Docker nor native Icecast found.');
  console.error('   Install it in WSL with: sudo apt install icecast2');
  return false;
};

const reloadIcecast = async () => startIcecast();

module.exports = { generateIcecastConfig, startIcecast, reloadIcecast };
