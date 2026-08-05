import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { Readable } from 'node:stream';

try {
  loadEnvFile('.env.local');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const { default: worker } = await import('../dist/server/index.js');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const clientRoot = path.resolve('dist/client');
const contentTypes = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.eot': 'application/vnd.ms-fontobject',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function serveStatic(request, response, pathname) {
  if (!['GET', 'HEAD'].includes(request.method || 'GET') || pathname === '/') return false;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  const filePath = path.resolve(clientRoot, `.${decoded}`);
  if (filePath !== clientRoot && !filePath.startsWith(`${clientRoot}${path.sep}`)) return false;
  let details;
  try {
    details = await stat(filePath);
  } catch {
    return false;
  }
  if (!details.isFile()) return false;
  response.writeHead(200, {
    'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Content-Length': String(details.size),
    'Cache-Control': pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600',
    'Last-Modified': details.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
  });
  if (request.method === 'HEAD') {
    response.end();
  } else {
    createReadStream(filePath).pipe(response);
  }
  return true;
}

const server = http.createServer(async (request, response) => {
  try {
    const origin = `http://${request.headers.host || `${host}:${port}`}`;
    const url = new URL(request.url || '/', origin);
    if (await serveStatic(request, response, url.pathname)) return;
    const init = {
      method: request.method,
      headers: request.headers,
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = Readable.toWeb(request);
      init.duplex = 'half';
    }
    const result = await worker.fetch(new Request(url, init));
    response.writeHead(result.status, Object.fromEntries(result.headers));
    if (result.body) Readable.fromWeb(result.body).pipe(response);
    else response.end();
  } catch (error) {
    console.error(error);
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Internal Server Error');
  }
});

server.listen(port, host, () => {
  console.log(`찬양이음 running at http://${host}:${port}`);
});
