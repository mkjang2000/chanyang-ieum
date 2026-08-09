const isLegacyDaumImageHost = hostname => {
  const host = hostname.toLowerCase();
  return host.endsWith('.uf.daum.net') || host.endsWith('.cafe.daum.net');
};

const isDaumImageHost = hostname => {
  const host = hostname.toLowerCase();
  return host.endsWith('.daum.net') || host.endsWith('.daumcdn.net') || host.endsWith('.kakaocdn.net');
};

/* 구형 다음 카페 원본은 HTTPS 인증서가 없으므로 HTTP를 그대로 둔다. */
export const normalizeSearchImageUrl = (value = '') => {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' && !isLegacyDaumImageHost(url.hostname)) url.protocol = 'https:';
    return url.toString();
  } catch {
    return value;
  }
};

/* 다음 이미지 요청에 원문 Referer를 쓸 때는 다음 계열 주소만 허용한다. */
export const getDaumSourceReferer = (value, imageHostname) => {
  if (!value || !isDaumImageHost(imageHostname)) return '';
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    if (host !== 'cafe.daum.net' && !host.endsWith('.daum.net')) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
};
