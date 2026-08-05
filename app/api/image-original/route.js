import { authErrorResponse, requireUser } from '../../../src/server/auth.js';

const NAVER_BLOG_HOSTS = new Set(['blog.naver.com', 'm.blog.naver.com']);
const NAVER_IMAGE_HOSTS = new Set([
  'postfiles.pstatic.net',
  'blogfiles.pstatic.net',
  'mblogthumb-phinf.pstatic.net',
  'blogthumb.pstatic.net',
]);
/* 카카오·다음 계열은 검색 결과 URL 자체가 원본이라 변환할 규칙이 없다.
   다만 브라우저에서 직접 불러오면 막히는 경우가 있어 프록시 대상에는 포함한다. */
const PROXY_ONLY_IMAGE_HOSTS = new Set([
  'blog.kakaocdn.net',
  'st.kakaocdn.net',
  't1.daumcdn.net',
  'img1.daumcdn.net',
]);
const PROXY_HOST_SUFFIXES = ['.uf.daum.net', '.cafe.daum.net', '.daumcdn.net', '.kakaocdn.net'];

/* cfile*.uf.daum.net, pds*.cafe.daum.net 같은 구형 호스트는 HTTPS 인증서가 없어
   https 로 바꾸면 연결 자체가 실패한다. 원래 스킴을 유지해야 한다. */
const isHttpsOnlyHost = hostname => {
  const host = hostname.toLowerCase();
  return !(host.endsWith('.uf.daum.net') || host.endsWith('.cafe.daum.net'));
};

const isProxyableImageHost = hostname => {
  const host = hostname.toLowerCase();
  if (NAVER_IMAGE_HOSTS.has(host) || PROXY_ONLY_IMAGE_HOSTS.has(host)) return true;
  return PROXY_HOST_SUFFIXES.some(suffix => host.endsWith(suffix));
};
const SAFE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
]);
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

const decodeHtml = (value = '') => value
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
  .replaceAll('&quot;', '"')
  .replaceAll('&amp;', '&')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>');

const useHttps = (value = '') => value.replace(/^http:\/\//i, 'https://');

const getOriginalFileUrl = url => {
  const original = new URL(url);
  original.protocol = 'https:';
  original.hostname = 'blogfiles.pstatic.net';
  original.search = '';
  original.hash = '';
  return original;
};

const getProxyPath = url => `/api/image-original?image=${encodeURIComponent(url.toString())}`;

/* 검색 결과의 네이버 이미지는 ?type=w966 처럼 축소본으로 노출된다.
   blogfiles 호스트 + 쿼리 제거만으로 원본을 받을 수 있어, 블로그 HTML 파싱보다
   빠르고 성공률이 높다. 측정상 966px 축소본의 대부분이 2000~3000px 로 복구된다. */
const probeOriginalBySize = async url => {
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ChanyangIeum/1.0)',
        Referer: 'https://blog.naver.com/',
        Range: 'bytes=0-131071',   // 헤더만 필요하므로 앞부분만 받는다
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok && response.status !== 206) return null;
    const type = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!SAFE_IMAGE_TYPES.has(type)) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    const { default: imageSize } = await import('image-size');
    const size = imageSize(buffer);
    if (!size?.width || !size?.height) return null;
    return { url, width: size.width, height: size.height };
  } catch {
    return null;
  }
};

const buildNaverOriginalCandidates = imageUrl => {
  const candidates = [];
  const push = build => {
    try {
      const next = new URL(imageUrl.toString());
      build(next);
      if (!candidates.some(c => c.toString() === next.toString())) candidates.push(next);
    } catch { /* 후보 생성 실패는 무시 */ }
  };
  // 1순위: blogfiles + 쿼리 제거 (실측상 가장 큰 원본)
  push(u => { u.protocol = 'https:'; u.hostname = 'blogfiles.pstatic.net'; u.search = ''; u.hash = ''; });
  // 2순위: 호스트는 그대로 두고 쿼리만 제거
  push(u => { u.protocol = 'https:'; u.search = ''; u.hash = ''; });
  // 3순위: 폭 상한을 크게 지정 (일부 이미지는 쿼리가 있어야 응답한다)
  push(u => { u.protocol = 'https:'; u.hostname = 'blogfiles.pstatic.net'; u.search = '?type=w2000'; u.hash = ''; });
  return candidates;
};

const parseNaverBlogUrl = (value = '') => {
  try {
    const url = new URL(value);
    if (!NAVER_BLOG_HOSTS.has(url.hostname.toLowerCase())) return null;

    let [blogId, logNo] = url.pathname.split('/').filter(Boolean);
    if (/^PostView\.(?:naver|nhn)$/i.test(blogId || '')) {
      blogId = url.searchParams.get('blogId');
      logNo = url.searchParams.get('logNo');
    }
    if (!/^[a-z0-9_.-]{2,50}$/i.test(blogId || '') || !/^\d{5,20}$/.test(logNo || '')) return null;

    return `https://m.blog.naver.com/${encodeURIComponent(blogId)}/${logNo}`;
  } catch {
    return null;
  }
};

const parseNaverImageUrl = (value = '') => {
  try {
    const url = new URL(value);
    if (!NAVER_IMAGE_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url;
  } catch {
    return null;
  }
};

const getPathParts = url => {
  try {
    return decodeURIComponent(url.pathname).split('/').filter(Boolean);
  } catch {
    return url.pathname.split('/').filter(Boolean);
  }
};

const getImageKey = url => getPathParts(url).slice(-2).join('/').toLocaleLowerCase('ko-KR');
const getFileName = url => getPathParts(url).at(-1)?.toLocaleLowerCase('ko-KR') || '';

const extractNaverImages = html => {
  const images = [];
  for (const match of html.matchAll(/data-linkdata=(['"])(.*?)\1/g)) {
    try {
      const metadata = JSON.parse(decodeHtml(match[2]));
      const url = parseNaverImageUrl(metadata.src);
      if (!url) continue;
      images.push({
        url,
        width: Number(metadata.originalWidth) || null,
        height: Number(metadata.originalHeight) || null,
      });
    } catch {
      // Smart Editor also uses data-linkdata for non-image blocks.
    }
  }
  return images;
};

const findMatchingImage = (images, target, targetWidth, targetHeight) => {
  const exact = images.find(image => getImageKey(image.url) === getImageKey(target));
  if (exact) return exact;

  const sameName = images.filter(image => getFileName(image.url) === getFileName(target));
  if (sameName.length === 1) return sameName[0];
  if (!sameName.length || !targetWidth || !targetHeight) return null;

  const targetRatio = targetWidth / targetHeight;
  return sameName
    .filter(image => image.width && image.height)
    .sort((a, b) => (
      Math.abs(a.width / a.height - targetRatio) - Math.abs(b.width / b.height - targetRatio)
    ))[0] || null;
};

export async function GET(request) {
  try {
    await requireUser(request);
  } catch (error) {
    return authErrorResponse(error, '로그인이 필요합니다.');
  }
  const { searchParams } = new URL(request.url);
  let imageUrl;
  try {
    imageUrl = new URL(searchParams.get('image') || '');
  } catch {
    return Response.json({ message: '지원하지 않는 이미지 주소입니다.' }, { status: 400 });
  }
  if (!isProxyableImageHost(imageUrl.hostname)) {
    return Response.json({ message: '지원하지 않는 이미지 주소입니다.' }, { status: 400 });
  }

  try {
    // 일부 호스트는 Referer 가 없으면 거부한다.
    const referer = imageUrl.hostname.endsWith('pstatic.net')
      ? 'https://blog.naver.com/'
      : 'https://search.daum.net/';
    // uf.daum.net 등 구형 호스트는 HTTPS 를 지원하지 않아 강제 승격하면 실패한다.
    const target = isHttpsOnlyHost(imageUrl.hostname)
      ? useHttps(imageUrl.toString())
      : imageUrl.toString();
    const response = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChanyangIeum/1.0)', Referer: referer },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const contentType = response.headers.get('content-type') || '';
    const contentLength = Number(response.headers.get('content-length')) || 0;
    if (!response.ok || !SAFE_IMAGE_TYPES.has(contentType.split(';')[0].toLowerCase())) {
      throw new Error(`Naver image returned ${response.status}`);
    }
    if (contentLength > MAX_IMAGE_BYTES) throw new Error('Naver image is too large');

    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
    });
    if (contentLength) headers.set('Content-Length', String(contentLength));
    return new Response(response.body, { headers });
  } catch (error) {
    console.error('Naver original image proxy failed', error.message);
    return Response.json({ message: '원본 이미지를 불러오지 못했어요.' }, { status: 502 });
  }
}

export async function POST(request) {
  try {
    await requireUser(request);
  } catch (error) {
    return authErrorResponse(error, '로그인이 필요합니다.');
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: '잘못된 요청입니다.' }, { status: 400 });
  }

  let currentImage;
  try {
    const raw = new URL(body.imageUrl || '');
    // http 전용 호스트는 스킴을 그대로 두어야 프록시가 성공한다.
    currentImage = isHttpsOnlyHost(raw.hostname) ? new URL(useHttps(raw.toString())) : raw;
  } catch {
    return Response.json({ message: '지원하지 않는 이미지 주소입니다.' }, { status: 400 });
  }
  if (!isProxyableImageHost(currentImage.hostname)) {
    return Response.json({ message: '지원하지 않는 이미지 출처입니다.' }, { status: 400 });
  }

  const currentWidth = Number(body.width) || 0;
  const currentHeight = Number(body.height) || 0;
  const currentFile = currentImage;
  const currentPixels = currentWidth * currentHeight;
  const asIs = () => Response.json({
    image: getProxyPath(currentFile),
    fallbackImage: getProxyPath(currentFile),
    width: currentWidth || null,
    height: currentHeight || null,
    upgraded: false,
    originalFound: false,
  });

  // 네이버가 아닌 호스트(카카오·다음 등)는 검색 URL 자체가 원본이라 프록시만 걸어준다.
  const isNaverImage = NAVER_IMAGE_HOSTS.has(currentImage.hostname.toLowerCase());
  if (!isNaverImage) return asIs();

  let best = null;

  // 1) URL 규칙으로 바로 원본을 노려본다 (HTML 파싱보다 빠르고 성공률이 높다)
  for (const candidate of buildNaverOriginalCandidates(currentImage)) {
    const probed = await probeOriginalBySize(candidate);
    if (!probed) continue;
    if (!best || probed.width * probed.height > best.width * best.height) best = probed;
    if (best.width * best.height > currentPixels * 1.2) break;  // 충분히 크면 그만
  }

  // 2) 규칙으로 못 얻었을 때만 블로그 HTML 을 파싱한다 (기존 경로, 보조 수단)
  if (!best || best.width * best.height <= currentPixels * 1.2) {
    const blogUrl = parseNaverBlogUrl(body.sourceUrl);
    if (blogUrl) {
      try {
        const response = await fetch(blogUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChanyangIeum/1.0)' },
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          const images = extractNaverImages(await response.text());
          const matched = findMatchingImage(images, currentImage, currentWidth, currentHeight);
          if (matched?.width && matched?.height) {
            const fromHtml = { url: getOriginalFileUrl(matched.url), width: matched.width, height: matched.height };
            if (!best || fromHtml.width * fromHtml.height > best.width * best.height) best = fromHtml;
          }
        }
      } catch (error) {
        console.error('Naver blog original image lookup failed', error.message);
      }
    }
  }

  if (!best) return asIs();

  const bestPixels = best.width * best.height;
  const upgraded = bestPixels > 0 && (!currentPixels || bestPixels > currentPixels * 1.2);
  return Response.json({
    image: getProxyPath(upgraded ? best.url : currentFile),
    fallbackImage: getProxyPath(currentFile),
    width: upgraded ? best.width : (currentWidth || null),
    height: upgraded ? best.height : (currentHeight || null),
    upgraded,
    originalFound: true,
  });
}
