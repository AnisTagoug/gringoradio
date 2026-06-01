/**
 * Run from your backend folder: node DIAGNOSE2.js
 * 
 * This patches reloadAfterBroadcasterChange with live logging so you can
 * see EXACTLY what happens when you click Enable in the dashboard.
 * 
 * After running this, click Enable on the broadcaster, then look at the
 * backend console output and paste it here.
 */

const fs   = require('fs');
const path = require('path');

const CTRL = path.join(__dirname, 'src/controllers/broadcastersController.js');
let src = fs.readFileSync(CTRL, 'utf8');

const OLD = `const reloadAfterBroadcasterChange = async (stationId) => {
  await reloadIcecast();

  const stationRes = await pool.query('SELECT * FROM stations WHERE id=$1', [stationId]);
  if (stationRes.rows.length === 0) return;
  const station = stationRes.rows[0];

  const bRes = await pool.query(
    'SELECT * FROM broadcasters WHERE station_id=$1 AND is_active=true',
    [stationId]
  );

  regenerateLiqScript(station, bRes.rows);

  // FIXED: was \`if (isRunning(...)) { startLiquidsoap(...) }\`
  // isRunning() returns false after a disable/kick clears the process map,
  // so the enable path silently skipped the restart. Always restart.
  startLiquidsoap(station);
};`;

const NEW = `const reloadAfterBroadcasterChange = async (stationId) => {
  console.log(\`\\n🔍 [RELOAD] START stationId=\${stationId}\`);
  
  console.log(\`🔍 [RELOAD] calling reloadIcecast...\`);
  await reloadIcecast();
  console.log(\`🔍 [RELOAD] reloadIcecast done\`);

  const stationRes = await pool.query('SELECT * FROM stations WHERE id=$1', [stationId]);
  if (stationRes.rows.length === 0) { console.log('🔍 [RELOAD] station not found!'); return; }
  const station = stationRes.rows[0];
  console.log(\`🔍 [RELOAD] station: \${station.name}, mount: \${station.mount_point}\`);

  const bRes = await pool.query(
    'SELECT * FROM broadcasters WHERE station_id=$1 AND is_active=true',
    [stationId]
  );
  console.log(\`🔍 [RELOAD] active broadcasters: \${bRes.rows.length} → passwords: [\${bRes.rows.map(b => b.password).join(', ')}]\`);

  console.log(\`🔍 [RELOAD] calling regenerateLiqScript...\`);
  regenerateLiqScript(station, bRes.rows);
  console.log(\`🔍 [RELOAD] regenerateLiqScript done\`);

  console.log(\`🔍 [RELOAD] calling startLiquidsoap...\`);
  await startLiquidsoap(station);
  console.log(\`🔍 [RELOAD] startLiquidsoap done\\n\`);
};`;

if (src.includes(OLD)) {
  fs.writeFileSync(CTRL, src.replace(OLD, NEW), 'utf8');
  console.log('✅ Logging patch applied. Restart your backend, then click Enable.');
  console.log('   Watch the backend console and paste the output here.\n');
  console.log('   To UNDO this patch later, run: node DIAGNOSE2.js --undo\n');
} else if (process.argv[2] === '--undo') {
  // Try reverse
  if (src.includes(NEW)) {
    fs.writeFileSync(CTRL, src.replace(NEW, OLD), 'utf8');
    console.log('✅ Patch undone.');
  } else {
    console.log('Nothing to undo.');
  }
} else {
  console.log('❌ Could not find the function to patch.');
  console.log('   The function may already be patched, or whitespace differs.');
  console.log('   Paste your broadcastersController.js content so I can check.\n');
  
  // Show what the function currently looks like
  const idx = src.indexOf('reloadAfterBroadcasterChange');
  if (idx !== -1) {
    const block = src.slice(idx, idx + 600);
    console.log('Current function:\n');
    console.log(block);
  }
}