import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { Readable } from 'node:stream';
import {
  isSecureHeaders, requestBodyLimit, requestSourceError, securityHeaders,
} from '../src/server/httpSecurity.js';

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

class RequestBodyTooLargeError extends Error {
  constructor(limit) {
    super(`Request body exceeds ${limit} bytes`);
    this.code = 'REQUEST_BODY_TOO_LARGE';
  }
}

const withSecurityHeaders = (headers, requestHeaders) => {
  const result = new Headers(headers);
  for (const [name, value] of Object.entries(securityHeaders({ secure: isSecureHeaders(requestHeaders) }))) {
    if (!result.has(name)) result.set(name, value);
  }
  return Object.fromEntries(result);
};

const readLimitedBody = (request, limit) => new Promise((resolve, reject) => {
  const chunks = [];
  let received = 0;
  let settled = false;
  const cleanup = () => {
    request.off('data', onData);
    request.off('end', onEnd);
    request.off('error', onError);
    request.off('aborted', onAborted);
  };
  const finish = callback => {
    if (settled) return;
    settled = true;
    cleanup();
    callback();
  };
  const onData = chunk => {
    received += chunk.length;
    if (received > limit) {
      // 남은 본문은 저장하지 않고 흘려보내 연결을 안전하게 정리한다.
      finish(() => {
        request.resume();
        reject(new RequestBodyTooLargeError(limit));
      });
      return;
    }
    chunks.push(chunk);
  };
  const onEnd = () => finish(() => resolve(Buffer.concat(chunks, received)));
  const onError = error => finish(() => reject(error));
  const onAborted = () => finish(() => reject(new Error('Request aborted')));
  request.on('data', onData);
  request.on('end', onEnd);
  request.on('error', onError);
  request.on('aborted', onAborted);
});

const writeJsonError = (response, requestHeaders, status, message) => {
  const body = Buffer.from(JSON.stringify({ message }));
  response.writeHead(status, withSecurityHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(body.length),
    'Cache-Control': 'no-store',
  }, requestHeaders));
  response.end(body);
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
  response.writeHead(200, withSecurityHeaders({
    'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Content-Length': String(details.size),
    'Cache-Control': pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600',
    'Last-Modified': details.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
  }, request.headers));
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
    const sourceError = requestSourceError(request.method, request.headers);
    if (sourceError) {
      writeJsonError(response, request.headers, 403, sourceError);
      return;
    }
    const init = {
      method: request.method,
      headers: request.headers,
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const bodyLimit = requestBodyLimit(url.pathname);
      const contentLength = Number(request.headers['content-length']) || 0;
      if (contentLength > bodyLimit) {
        writeJsonError(response, request.headers, 413, '요청 본문이 너무 큽니다.');
        return;
      }
      init.body = await readLimitedBody(request, bodyLimit);
      init.duplex = 'half';
    }
    const result = await worker.fetch(new Request(url, init));
    response.writeHead(result.status, withSecurityHeaders(result.headers, request.headers));
    if (result.body) Readable.fromWeb(result.body).pipe(response);
    else response.end();
  } catch (error) {
    if (!response.headersSent && error?.code === 'REQUEST_BODY_TOO_LARGE') {
      writeJsonError(response, request.headers, 413, '요청 본문이 너무 큽니다.');
    } else if (!response.headersSent) {
      console.error(error);
      response.writeHead(500, withSecurityHeaders({
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      }, request.headers));
      response.end('Internal Server Error');
    } else {
      console.error(error);
      response.destroy(error);
    }
  }
});

server.listen(port, host, () => {
  console.log(`찬양이음 running at http://${host}:${port}`);
});
