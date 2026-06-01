const http = require('http');

const BACKEND_HOST = '68.210.100.174';
const BACKEND_PORT = 5000;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // req.url here is the FULL original path e.g. /api/auth/login
  // We send it as-is to the backend which expects /api/...
  const targetPath = req.url;

  console.log(`[PROXY] ${req.method} ${targetPath}`);

  const forwardHeaders = {};
  // Copy only safe headers
  if (req.headers['authorization']) forwardHeaders['authorization'] = req.headers['authorization'];
  if (req.headers['content-type'])  forwardHeaders['content-type']  = req.headers['content-type'];
  if (req.headers['content-length']) forwardHeaders['content-length'] = req.headers['content-length'];
  if (req.headers['accept'])        forwardHeaders['accept']         = req.headers['accept'];
  forwardHeaders['host'] = BACKEND_HOST;

  const options = {
    hostname: BACKEND_HOST,
    port:     BACKEND_PORT,
    path:     targetPath,
    method:   req.method,
    headers:  forwardHeaders,
  };

  return new Promise((resolve) => {
    const proxyReq = http.request(options, (proxyRes) => {
      res.status(proxyRes.statusCode);
      Object.entries(proxyRes.headers).forEach(([key, val]) => {
        try { res.setHeader(key, val); } catch {}
      });
      proxyRes.pipe(res);
      proxyRes.on('end', resolve);
    });

    proxyReq.on('error', (err) => {
      console.error('[PROXY ERROR]', err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Backend unreachable', detail: err.message });
      }
      resolve();
    });

    req.pipe(proxyReq);
  });
};