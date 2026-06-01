# RadioStudio — AutoDJ Script v6.1
# Station : adriano
# Mount   : /adriano-mphghcyn
# Mode    : randomize
# Generated: 2026-05-31T18:21:59.107Z

settings.log.level := 3
settings.log.stdout := true
settings.server.telnet := false

# ── Unix socket server ────────────────────────────────────────────────────────
# Allows the backend to send skip/reload commands without restarting Liquidsoap.
settings.server.socket := true
settings.server.socket.path := "/tmp/liq-_adriano-mphghcyn.sock"

# ── 1. Live broadcaster input ─────────────────────────────────────────────────
def auth(args) =
  password = args.password
  list.mem(password, ["dri"])
end

live = input.harbor(
  "/adriano-mphghcyn",
  port=8102,
  auth=auth,
  buffer=2.,
  max=20.
)

# ── 2. AutoDJ playlist ────────────────────────────────────────────────────────
# reload_mode="watch" — Liquidsoap watches the file on disk.
# When writePlaylist() rewrites it, Liquidsoap reloads at the next track
# boundary automatically. NO restart required.
autodj = playlist(
  "/home/azureuser/backend/playlists/adriano-mphghcyn.txt",
  reload_mode="watch",
  mode="randomize"
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
  file.write(data=json_str, "/home/azureuser/backend/metadata/adriano-mphghcyn.json")
end

radio.on_metadata(write_metadata)

# ── 6. Output to Icecast ──────────────────────────────────────────────────────
icecast_out = output.icecast(
  %mp3(bitrate=128, stereo=true),
  host        = "localhost",
  port        = 8000,
  password    = "changeme",
  mount       = "/adriano-mphghcyn",
  name        = "adriano",
  genre       = "Various",
  description = "",
  radio
)

