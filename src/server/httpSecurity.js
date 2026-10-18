const MIB = 1024 * 1024;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const boundedNumber = (value, fallback, minimum, maximum) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum ? Math.min(maximum, parsed) : fallback;
};

export function requestBodyLimit(pathname) {
  if (pathname === '/api/contis/pdf-import') {
    return boundedNumber(process.env.MAX_PDF_REQUEST_BYTES, 27 * MIB, 1 * MIB, 64 * MIB);
  }
  if (pathname === '/api/contis') {
    return boundedNumber(process.env.MAX_CONTI_REQUEST_BYTES, 128 * MIB, 2 * MIB, 256 * MIB);
  }
  if (pathname === '/api/contis/change-requests') {
    return boundedNumber(process.env.MAX_IMAGE_REQUEST_BYTES, 36 * MIB, 2 * MIB, 64 * MIB);
  }
  return boundedNumber(process.env.MAX_REQUEST_BODY_BYTES, 2 * MIB, 64 * 1024, 16 * MIB);
}

const firstHeader = value => String(Array.isArray(value) ? value[0] : value || '').split(',')[0].trim();

/*
 * 브라우저가 보내는 Origin/Fetch Metadata를 이용해 상태 변경 요청을 검증한다.
 * 두 헤더가 모두 없는 서버 간 호출과 CLI는 기존 호환성을 위해 허용한다.
 */
export function requestSourceError(method, headers) {
  if (SAFE_METHODS.has(String(method || 'GET').toUpperCase())) return '';
  const site = firstHeader(headers['sec-fetch-site']);
  if (site === 'cross-site') return '다른 사이트에서 보낸 요청은 허용되지 않습니다.';

  const originValue = firstHeader(headers.origin);
  if (!originValue) return '';
  if (originValue === 'null') return '요청 출처를 확인할 수 없습니다.';

  let origin;
  try {
    origin = new URL(originValue);
  } catch {
    return '요청 출처가 올바르지 않습니다.';
  }

  const host = firstHeader(headers.host);
  const forwardedProtocol = firstHeader(headers['x-forwarded-proto']).replace(/:$/, '');
  const expectedProtocol = forwardedProtocol || 'http';
  let expectedOrigin;
  try {
    expectedOrigin = new URL(`${expectedProtocol}://${host}`).origin;
  } catch {
    return '요청 호스트가 올바르지 않습니다.';
  }
  if (origin.origin.toLowerCase() !== expectedOrigin.toLowerCase()) {
    return '요청 출처가 일치하지 않습니다.';
  }
  return '';
}

export function isSecureHeaders(headers) {
  return firstHeader(headers['x-forwarded-proto']).replace(/:$/, '') === 'https';
}

export function securityHeaders({ secure = false } = {}) {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self'",
      "font-src 'self' https://fonts.gstatic.com",
      "form-action 'self'",
      "frame-ancestors 'none'",
      // 인터넷 악보 검색의 썸네일과 미리보기는 외부 HTTPS 주소를 사용한다.
      "img-src 'self' data: blob: https:",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    ].join('; '),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...(secure ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
  };
}
