import { createHash, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import { imageSize } from 'image-size';
import sharp from 'sharp';
import { getImageStorageDir } from './config.js';
import { getPool } from './db.js';

const storageRoot = () => path.resolve(getImageStorageDir());
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const VIEWER_MAX_WIDTH = 2200;
const VIEWER_MAX_HEIGHT = 4000;
const viewerImageJobs = new Map();
const MAX_REDIRECTS = 3;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const NAVER_IMAGE_HOSTS = new Set([
  'postfiles.pstatic.net',
  'blogfiles.pstatic.net',
  'mblogthumb-phinf.pstatic.net',
  'blogthumb.pstatic.net',
]);
/* 검색 결과 이미지를 저장할 때 허용하는 호스트.
   app/api/image-original 의 프록시 허용 범위와 맞춰야 한다.
   여기가 좁으면 미리보기는 되는데 저장에서 실패한다. */
const PROXY_ONLY_IMAGE_HOSTS = new Set([
  'blog.kakaocdn.net',
  'st.kakaocdn.net',
  't1.daumcdn.net',
  'img1.daumcdn.net',
]);
const PROXY_HOST_SUFFIXES = ['.uf.daum.net', '.cafe.daum.net', '.daumcdn.net', '.kakaocdn.net'];

const isProxyableImageHost = hostname => {
  const host = hostname.toLowerCase();
  if (NAVER_IMAGE_HOSTS.has(host) || PROXY_ONLY_IMAGE_HOSTS.has(host)) return true;
  return PROXY_HOST_SUFFIXES.some(suffix => host.endsWith(suffix));
};

/* cfile*.uf.daum.net, pds*.cafe.daum.net 은 HTTPS 인증서가 없어 https 로 바꾸면 실패한다. */
const isHttpsOnlyHost = hostname => {
  const host = hostname.toLowerCase();
  return !(host.endsWith('.uf.daum.net') || host.endsWith('.cafe.daum.net'));
};

const refererFor = hostname => (hostname.toLowerCase().endsWith('pstatic.net')
  ? 'https://blog.naver.com/'
  : 'https://search.daum.net/');
const TYPE_TO_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};
const MIME_TO_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

function isPrivateAddress(address) {
  if (address === '::1' || address === '::') return true;
  if (address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) return true;
  if (address.startsWith('::ffff:')) return isPrivateAddress(address.slice(7));
  if (!isIP(address)) return true;
  if (address.includes(':')) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 10
    || a === 127
    || a === 0
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a >= 224;
}

async function assertPublicUrl(url) {
  // 구형 다음 호스트는 HTTPS 를 지원하지 않아 http 를 허용해야 저장할 수 있다.
  const httpAllowed = !isHttpsOnlyHost(url.hostname) && isProxyableImageHost(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && httpAllowed)) {
    throw new Error('HTTPS 이미지 주소만 가져올 수 있습니다.');
  }
  if (url.username || url.password || url.port) throw new Error('지원하지 않는 이미지 주소입니다.');
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) {
    throw new Error('내부 네트워크 이미지는 가져올 수 없습니다.');
  }
}

function parseRemoteImage(value) {
  if (value.startsWith('/api/image-original?')) {
    const proxyUrl = new URL(value, 'http://muse-conti.local');
    const inner = new URL(proxyUrl.searchParams.get('image') || '');
    if (!isProxyableImageHost(inner.hostname)) throw new Error('지원하지 않는 이미지 출처입니다.');
    // 프록시 주소에 담긴 URL 은 이미 원본으로 해석된 결과다.
    // 쿼리를 지우면 원본 지정이 사라져 404 가 난다(네이버 ?type=..., 다음 download.php 등).
    if (isHttpsOnlyHost(inner.hostname)) inner.protocol = 'https:';
    inner.hash = '';
    return inner;
  }
  return new URL(value);
}

async function fetchRemoteImage(initialUrl, redirectCount = 0) {
  const url = typeof initialUrl === 'string' ? parseRemoteImage(initialUrl) : initialUrl;
  await assertPublicUrl(url);
  const response = await fetch(url, {
    redirect: 'manual',
    headers: {
      Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif',
      'User-Agent': 'Mozilla/5.0 (compatible; ChanyangIeum/1.0)',
      // 네이버·다음 이미지 서버는 Referer 가 없으면 거부하는 경우가 있다.
      Referer: refererFor(url.hostname),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });

  if (response.status >= 300 && response.status < 400) {
    if (redirectCount >= MAX_REDIRECTS) throw new Error('이미지 주소의 이동 횟수가 너무 많습니다.');
    const location = response.headers.get('location');
    if (!location) throw new Error('이미지 이동 주소가 없습니다.');
    return fetchRemoteImage(new URL(location, url), redirectCount + 1);
  }
  if (!response.ok) throw new Error(`이미지를 불러오지 못했습니다 (${response.status}).`);

  const contentLength = Number(response.headers.get('content-length')) || 0;
  if (contentLength > MAX_IMAGE_BYTES) throw new Error('이미지는 25MB 이하여야 합니다.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error('이미지는 25MB 이하여야 합니다.');
  return { buffer, sourceUrl: url.toString(), declaredMime: response.headers.get('content-type')?.split(';')[0] };
}

function decodeDataUrl(value) {
  const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) throw new Error('올바른 이미지 파일이 아닙니다.');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error('이미지는 25MB 이하여야 합니다.');
  return { buffer, declaredMime: match[1].toLowerCase(), sourceUrl: null };
}

export async function prepareImageBuffer(buffer, {
  declaredMime = '', sourceUrl = null, sourceType = 'upload',
} = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('이미지는 25MB 이하여야 합니다.');
  }
  let dimensions;
  try {
    dimensions = imageSize(buffer);
  } catch {
    throw new Error('지원하지 않거나 손상된 이미지입니다.');
  }
  const mime = TYPE_TO_MIME[String(dimensions.type || '').toLowerCase()] || declaredMime;
  if (!ALLOWED_MIME.has(mime)) throw new Error('JPG, PNG, WEBP, GIF, AVIF 이미지만 저장할 수 있습니다.');
  return {
    buffer,
    mime,
    width: dimensions.width || null,
    height: dimensions.height || null,
    checksum: createHash('sha256').update(buffer).digest('hex'),
    sourceUrl,
    sourceType,
  };
}

export async function prepareImage(page) {
  if (page.imageId) return { existingId: String(page.imageId) };
  if (typeof page.image !== 'string' || !page.image) throw new Error('악보 이미지가 빠져 있습니다.');
  if (page.image.startsWith('/api/images?')) {
    const id = new URL(page.image, 'http://muse-conti.local').searchParams.get('id');
    if (id) return { existingId: id };
  }

  const raw = page.image.startsWith('data:') ? decodeDataUrl(page.image) : await fetchRemoteImage(page.image);
  return prepareImageBuffer(raw.buffer, {
    declaredMime: raw.declaredMime,
    sourceUrl: page.sourceUrl || raw.sourceUrl,
    sourceType: page.sourceType || (page.image.startsWith('data:') ? 'upload' : 'search'),
  });
}

export async function persistPreparedImage(prepared) {
  const pool = getPool();
  if (prepared.existingId) {
    const [rows] = await pool.query('SELECT id FROM images WHERE id = ? LIMIT 1', [prepared.existingId]);
    if (!rows.length) throw new Error('저장된 이미지를 찾을 수 없습니다.');
    return prepared.existingId;
  }

  const [existing] = await pool.query('SELECT id FROM images WHERE checksum = ? LIMIT 1', [prepared.checksum]);
  if (existing.length) return existing[0].id;

  const id = randomUUID();
  const extension = MIME_TO_EXTENSION[prepared.mime];
  const directory = path.join(storageRoot(), id.slice(0, 2));
  const filePath = path.join(directory, `${id}.${extension}`);
  await mkdir(directory, { recursive: true, mode: 0o750 });
  await writeFile(filePath, prepared.buffer, { mode: 0o640, flag: 'wx' });

  try {
    await pool.query(
      `INSERT INTO images
        (id, checksum, file_path, mime_type, width, height, file_size, source_type, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        prepared.checksum,
        filePath,
        prepared.mime,
        prepared.width,
        prepared.height,
        prepared.buffer.length,
        prepared.sourceType,
        prepared.sourceUrl,
      ],
    );
    return id;
  } catch (error) {
    await unlink(filePath).catch(() => {});
    if (error.code === 'ER_DUP_ENTRY') {
      const [duplicate] = await pool.query('SELECT id FROM images WHERE checksum = ? LIMIT 1', [prepared.checksum]);
      if (duplicate.length) return duplicate[0].id;
    }
    throw error;
  }
}

async function getStoredImageRecord(id) {
  const [rows] = await getPool().query(
    `SELECT id, file_path AS filePath, mime_type AS mime, file_size AS fileSize,
            width, height
       FROM images WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows.length) return null;
  const image = rows[0];
  const root = storageRoot();
  const resolved = path.resolve(image.filePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  return { ...image, filePath: resolved };
}

export async function getStoredImage(id) {
  const image = await getStoredImageRecord(id);
  return image ? { ...image, buffer: await readFile(image.filePath) } : null;
}

// 원본 악보는 다운로드·PDF용으로 그대로 보존한다. 뷰어에서는 초고해상도 PNG가
// 브라우저에서 수백 MB로 풀리는 일을 막기 위해 화면용 축소본을 한 번 만들어 캐시한다.
export async function getViewerImage(id) {
  const image = await getStoredImageRecord(id);
  if (!image) return null;
  if ((image.width || 0) <= VIEWER_MAX_WIDTH && (image.height || 0) <= VIEWER_MAX_HEIGHT) {
    return { ...image, buffer: await readFile(image.filePath) };
  }

  const existingJob = viewerImageJobs.get(id);
  if (existingJob) return existingJob;
  const job = (async () => {
    const cacheDirectory = path.join(storageRoot(), '.viewer-cache');
    const cachePath = path.join(cacheDirectory, `${id}-v1-${VIEWER_MAX_WIDTH}x${VIEWER_MAX_HEIGHT}.png`);
    try {
      const buffer = await readFile(cachePath);
      return { ...image, mime: 'image/png', fileSize: buffer.length, buffer };
    } catch { /* 아직 축소본이 없으면 아래에서 만든다. */ }

    const original = await readFile(image.filePath);
    const { data, info } = await sharp(original, { limitInputPixels: 100_000_000 })
      .rotate()
      .resize({
        width: VIEWER_MAX_WIDTH,
        height: VIEWER_MAX_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      })
      .png({ compressionLevel: 8 })
      .toBuffer({ resolveWithObject: true });
    await mkdir(cacheDirectory, { recursive: true, mode: 0o750 });
    await writeFile(cachePath, data, { mode: 0o640 });
    return {
      ...image,
      mime: 'image/png',
      fileSize: data.length,
      width: info.width,
      height: info.height,
      buffer: data,
    };
  })().finally(() => viewerImageJobs.delete(id));
  viewerImageJobs.set(id, job);
  return job;
}
