const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const initDB = async () => {
  const client = await pool.connect();
  try {
    // Base schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS stations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        genre VARCHAR(50),
        stream_url VARCHAR(255),
        mount_point VARCHAR(100) UNIQUE NOT NULL,
        source_password VARCHAR(100) NOT NULL,
        status VARCHAR(20) DEFAULT 'offline',
        is_live BOOLEAN DEFAULT FALSE,
        autodj_enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS proxy_url TEXT;

      CREATE TABLE IF NOT EXISTS broadcasters (
        id SERIAL PRIMARY KEY,
        station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        display_name VARCHAR(100) NOT NULL,
        username VARCHAR(50) NOT NULL,
        password VARCHAR(100) NOT NULL,
        mount_point VARCHAR(150) NOT NULL,
        role VARCHAR(20) DEFAULT 'broadcaster',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(station_id, username)
      );

      CREATE TABLE IF NOT EXISTS tracks (
        id SERIAL PRIMARY KEY,
        station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        artist VARCHAR(255),
        filename VARCHAR(255) NOT NULL,
        filepath VARCHAR(1000) NOT NULL,
        duration INTEGER,
        file_size INTEGER,
        mime_type VARCHAR(50),
        source VARCHAR(20) DEFAULT 'upload',
        youtube_url VARCHAR(500),
        stream_url_expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS playlist_items (
        id SERIAL PRIMARY KEY,
        station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
        track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // ── Migrations ─────────────────────────────────────────────────────────

    // M-A: broadcasters input_mount → mount_point (v3 → v4)
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='broadcasters' AND column_name='input_mount'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='broadcasters' AND column_name='mount_point'
        ) THEN
          ALTER TABLE broadcasters RENAME COLUMN input_mount TO mount_point;
          RAISE NOTICE 'M-A: broadcasters.input_mount → mount_point';
        END IF;
      END$$;
    `);

    // M-B: fix legacy /slug-in-username mount_points
    await client.query(`
      UPDATE broadcasters b
      SET mount_point = s.mount_point
      FROM stations s
      WHERE b.station_id = s.id
        AND b.mount_point LIKE '%-in-%';
    `);

    // M-C: add source column to tracks (v4 → v5)
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tracks' AND column_name='source'
        ) THEN
          ALTER TABLE tracks ADD COLUMN source VARCHAR(20) DEFAULT 'upload';
          RAISE NOTICE 'M-C: tracks.source added';
        END IF;
      END$$;
    `);

    // M-D: add youtube_url and stream_url_expires_at columns (v5)
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tracks' AND column_name='youtube_url'
        ) THEN
          ALTER TABLE tracks ADD COLUMN youtube_url VARCHAR(500);
          ALTER TABLE tracks ADD COLUMN stream_url_expires_at TIMESTAMP;
          RAISE NOTICE 'M-D: tracks.youtube_url + stream_url_expires_at added';
        END IF;
      END$$;
    `);

    // M-E: widen filepath column to 1000 chars for long URLs
    await client.query(`
      DO $$ BEGIN
        IF (
          SELECT character_maximum_length
          FROM information_schema.columns
          WHERE table_name='tracks' AND column_name='filepath'
        ) < 1000 THEN
          ALTER TABLE tracks ALTER COLUMN filepath TYPE VARCHAR(1000);
          RAISE NOTICE 'M-E: tracks.filepath widened to 1000';
        END IF;
      EXCEPTION WHEN others THEN NULL;
      END$$;
    `);

    // M-F: add harbor_port to stations (v5.3 — one port per station for Liquidsoap)
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='stations' AND column_name='harbor_port'
        ) THEN
          ALTER TABLE stations ADD COLUMN harbor_port INTEGER;
          RAISE NOTICE 'M-F: stations.harbor_port added';
        END IF;
      END$$;
    `);

    // M-H: add is_admin column to users
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='is_admin'
        ) THEN
          ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
          RAISE NOTICE 'M-H: users.is_admin added';
        END IF;
      END$$;
    `);

    // M-I: add autodj_mode column to stations (v6.0)
    // Values: 'randomize' (shuffle) or 'sequential' (playlist order)
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='stations' AND column_name='autodj_mode'
        ) THEN
          ALTER TABLE stations ADD COLUMN autodj_mode VARCHAR(20) DEFAULT 'randomize';
          RAISE NOTICE 'M-I: stations.autodj_mode added';
        END IF;
      END$$;
    `);

    // M-G: fix stale stream_url values saved with old port (e.g. 8040 → correct port from env)
    const correctPort = process.env.ICECAST_PORT || '8000';
    const correctHost = process.env.ICECAST_HOST || 'localhost';
    await client.query(`
      UPDATE stations
      SET stream_url = 'http://' || $1 || ':' || $2 || mount_point
      WHERE stream_url NOT LIKE $3
    `, [correctHost, correctPort, `http://${correctHost}:${correctPort}%`]);

    // M-F2: assign harbor_port for all stations using 9000+id range.
    // This range avoids conflicts with the old fixed 8100 env-var value.
    // Force-update any station still on the old 8100 value or NULL.
    await client.query(`
      UPDATE stations SET harbor_port = 9000 + id
      WHERE harbor_port IS NULL OR harbor_port = 8100;
    `);

    console.log('✅ Database initialized successfully');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, initDB };