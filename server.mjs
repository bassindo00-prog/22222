import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const defaultRoot = existsSync(join(projectRoot, 'dist', 'index.html')) ? join(projectRoot, 'dist') : projectRoot;
const publicRoot = resolve(process.env.STATIC_ROOT || defaultRoot);
const PORT = Number(process.env.PORT) || 4173;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm'
};

function respond(res, status, message) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer'
  });
  res.end(message);
}

function isPublicPath(pathname) {
  return pathname === '/'
    || pathname === '/index.html'
    || pathname.startsWith('/src/')
    || pathname.startsWith('/node_modules/mediabunny/dist/');
}

async function serveStatic(req, res, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { return respond(res, 400, 'Invalid path.'); }
  if (!isPublicPath(decoded)) return respond(res, 404, 'Not found.');
  const requestPath = decoded === '/' ? '/index.html' : decoded;
  const absolute = resolve(publicRoot, `.${requestPath}`);
  if (absolute !== publicRoot && !absolute.startsWith(`${publicRoot}${sep}`)) return respond(res, 403, 'Forbidden.');
  const file = await stat(absolute).catch(() => null);
  if (!file?.isFile()) return respond(res, 404, 'Not found.');
  res.writeHead(200, {
    'Content-Type': mimeTypes[extname(absolute).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': absolute.includes('mediabunny') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Content-Length': file.size,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer'
  });
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(absolute);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res, url.pathname);
    respond(res, 405, 'Only static files are served.');
  } catch (error) {
    console.error('Static file request failed:', error);
    if (!res.headersSent) respond(res, 500, 'Unable to serve this file.');
    else res.destroy();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`SonicFrame static app: http://127.0.0.1:${PORT}`);
  console.log('Audio, cover and rendered video stay in the browser. No media processing API is exposed.');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. Set PORT to another number and restart.`);
  else console.error(error);
  process.exitCode = 1;
});
