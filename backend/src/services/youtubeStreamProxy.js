/**
 * YouTube Stream Proxy
 * Pipes audio from googlevideo.com through ffmpeg → local HTTP
 * so Liquidsoap reads from localhost instead of hitting Google CDN directly.
 */

const { spawn } = require('child_process');
const http = require('http');

const PROXY_PORT = process.env.YOUTUBE_PROXY_PORT || 9000;
const streams = {}; // trackId → { url, clients }

const server = http.createServer((req, res) => {
  const match = req.url.match(/^\/stream\/(.+)$/);
  if (!match) { res.writeHead(404); res.end(); return; }

  const trackId = match[1];
  const streamUrl = streams[trackId];
  if (!streamUrl) { res.writeHead(404); res.end('Track not registered'); return; }

 const ffmpeg = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [

    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-i', streamUrl,
    '-vn',
    '-acodec', 'libmp3lame',
    '-ab', '128k',
    '-f', 'mp3',
    '-bufsize', '512k',
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  // Buffer first 256KB before sending so Liquidsoap gets enough to decode
  const chunks = [];
  let buffered = 0;
  let headersSent = false;

  ffmpeg.stdout.on('data', (chunk) => {
    if (!headersSent) {
      chunks.push(chunk);
      buffered += chunk.length;
      if (buffered >= 256 * 1024) {
        headersSent = true;
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
        });
        for (const c of chunks) res.write(c);
        ffmpeg.stdout.pipe(res);
      }
    }
  });

  ffmpeg.stderr.on('data', (d) => {
    const msg = d.toString();
    if (!headersSent && msg.includes('Output #0')) {
      // ffmpeg started encoding, flush buffer early
      headersSent = true;
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      });
      for (const c of chunks) res.write(c);
      ffmpeg.stdout.pipe(res);
    }
  });

  req.on('close', () => ffmpeg.kill('SIGTERM'));
  ffmpeg.on('error', (e) => { 
    console.error('ffmpeg proxy error:', e.message);
    try { res.end(); } catch {} 
  });
});
server.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log(`🎧 YouTube proxy running on http://127.0.0.1:${PROXY_PORT}`);
});

const registerTrack = (trackId, googlevideUrl) => {
  streams[trackId] = googlevideUrl;
};

const unregisterTrack = (trackId) => {
  delete streams[trackId];
};

const getProxyUrl = (trackId) =>
  `http://127.0.0.1:${PROXY_PORT}/stream/${trackId}`;

module.exports = { registerTrack, unregisterTrack, getProxyUrl };