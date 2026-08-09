import { findStoredImages } from '../../../src/server/repository.js';
import { authErrorResponse, requireUser } from '../../../src/server/auth.js';
import { normalizeSearchImageUrl } from '../../../src/server/externalImageUrls.js';

const DAUM_IMAGE_SEARCH_URL = 'https://dapi.kakao.com/v2/search/image';

const BLOCKED_IMAGE_DOMAINS = [
  'mapianist.com',
  'akbotong.com',
  'akbobada.com',
  'musicscore.co.kr',
  'musicday.co.kr',
  'ukulscore.com',
  'musescore.com',
  'mymusicsheet.com',
  'musicnotes.com',
  'sheetmusicdirect.com',
  'sheetmusicplus.com',
  'youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'ytimg.com',
  'yt3.googleusercontent.com',
];

const stripHtml = (value = '') => value
  .replace(/<[^>]*>/g, '')
  .replaceAll('&quot;', '"')
  .replaceAll('&amp;', '&')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>');

const getHostname = (value = '') => {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
};

const isBlockedImageDomain = hostname => BLOCKED_IMAGE_DOMAINS.some(
  domain => hostname === domain || hostname.endsWith(`.${domain}`),
);

const isBlockedDocument = document => [
  document.image_url,
  document.thumbnail_url,
  document.doc_url,
].some(url => isBlockedImageDomain(getHostname(url)));

const useHttps = (value = '') => value.replace(/^http:\/\//i, 'https://');

/* 검색 결과의 폭이 곧 실제 해상도는 아니다.
   네이버는 ?type=w966 같은 축소본을 노출하지만 원본은 2000~6000px 인 경우가 많고,
   다음 카페(pds*.cafe.daum.net, cfile*.uf.daum.net)는 URL 이 곧 원본이라 더 커지지 않는다.
   정렬·화질 표시는 이 '기대 해상도' 를 기준으로 해야 사용자가 헷갈리지 않는다. */
const estimateOriginalWidth = (imageUrl = '', width = 0) => {
  if (!width) return 0;
  try {
    const host = new URL(imageUrl).hostname.toLowerCase();
    // 네이버 축소본은 원본 복구 여지가 크다. 다만 과대평가하지 않도록 보수적으로 잡는다.
    if (host.endsWith('pstatic.net') && width >= 700) return Math.max(width, 2000);
  } catch { /* 파싱 실패 시 원래 폭 사용 */ }
  return width;
};

/* 서버 저장본은 이미 팀이 쓴 악보라 우선 노출하는 게 맞다.
   다만 옛날에 저해상도로 저장해 둔 것까지 맨 앞에 두면, 검색에 있는 더 선명한
   악보를 놓치게 된다. 그래서 '쓸 만한 해상도'인 저장본만 앞에 고정한다. */
const USABLE_WIDTH = 700;

const orderWithStored = (storedItems, externalItems) => {
  const good = storedItems.filter(item => (item.width || 0) >= USABLE_WIDTH);
  const small = storedItems.filter(item => (item.width || 0) < USABLE_WIDTH);
  // 저해상도 저장본은 버리지 않고, 검색 결과 중 그보다 나쁜 것들 앞에 끼워 넣는다.
  const merged = [...externalItems];
  for (const item of small) {
    const at = merged.findIndex(x => (x.expectedWidth || 0) < (item.width || 0));
    if (at === -1) merged.push(item);
    else merged.splice(at, 0, item);
  }
  return [...good, ...merged];
};

export async function GET(request) {
  try {
    await requireUser(request);
  } catch (error) {
    return authErrorResponse(error, '로그인이 필요합니다.');
  }
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  if (!query) {
    return Response.json({ message: '검색어를 입력해 주세요.' }, { status: 400 });
  }

  const restApiKey = process.env.KAKAO_REST_API_KEY;
  const baseQuery = query.replace(/\s*악보\s*$/u, '').trim();
  const searchQuery = `${baseQuery} 악보`;
  let storedItems = [];
  try {
    storedItems = await findStoredImages(baseQuery);
  } catch (error) {
    console.error('Stored score lookup failed', error);
  }

  if (!restApiKey) {
    if (storedItems.length) {
      return Response.json({
        items: storedItems,
        query: searchQuery,
        excludedCount: 0,
        savedCount: storedItems.length,
        provider: 'server',
      });
    }
    return Response.json(
      { message: '카카오 REST API 키가 설정되지 않았어요. .env.local에 KAKAO_REST_API_KEY를 추가해 주세요.' },
      { status: 503 },
    );
  }

  const endpoint = new URL(DAUM_IMAGE_SEARCH_URL);
  endpoint.searchParams.set('query', searchQuery);
  endpoint.searchParams.set('size', '80');
  endpoint.searchParams.set('page', '1');
  endpoint.searchParams.set('sort', 'accuracy');

  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `KakaoAK ${restApiKey}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      console.error('Daum image search failed', response.status, errorBody.code);
      return Response.json(
        { message: response.status === 401 || response.status === 403
          ? '카카오 REST API 키를 확인해 주세요.'
          : '다음 이미지 검색에 연결하지 못했어요.' },
        { status: response.status },
      );
    }

    const data = await response.json();
    const validDocuments = (data.documents || []).filter(
      document => document.image_url && document.thumbnail_url,
    );
    const allowedDocuments = validDocuments.filter(document => !isBlockedDocument(document));
    const excludedCount = validDocuments.length - allowedDocuments.length;
    const seenImages = new Set();
    const externalItems = allowedDocuments
      .filter(document => {
        const imageUrl = normalizeSearchImageUrl(document.image_url);
        if (seenImages.has(imageUrl)) return false;
        seenImages.add(imageUrl);
        return true;
      })
      .map(document => {
        const image = normalizeSearchImageUrl(document.image_url);
        const width = Number(document.width) || null;
        const height = Number(document.height) || null;
        return {
          title: baseQuery,
          image,
          thumbnail: normalizeSearchImageUrl(document.thumbnail_url),
          source: stripHtml(document.display_sitename) || getHostname(document.doc_url) || 'Daum 이미지 검색',
          sourceUrl: useHttps(document.doc_url),
          width,
          height,
          // 네이버는 검색 결과가 축소본이라 실제로는 훨씬 커질 수 있다.
          // 화질 판단과 정렬은 이 '기대 해상도' 기준으로 한다.
          expectedWidth: estimateOriginalWidth(image, width),
        };
      })
      // 악보는 해상도가 곧 실용성이라 큰 것부터 보여준다.
      .sort((a, b) => (b.expectedWidth || 0) - (a.expectedWidth || 0))
      .slice(0, Math.max(0, 30 - storedItems.length))
      .map((item, index) => ({ ...item, id: `${index}-${item.image}` }));

    return Response.json({
      items: orderWithStored(storedItems, externalItems),
      query: searchQuery,
      excludedCount,
      savedCount: storedItems.length,
      provider: 'daum',
    });
  } catch (error) {
    console.error('Daum image search request error', error);
    if (storedItems.length) {
      return Response.json({
        items: storedItems,
        query: searchQuery,
        excludedCount: 0,
        savedCount: storedItems.length,
        provider: 'server',
      });
    }
    return Response.json(
      { message: '다음 이미지 검색에 연결하지 못했어요.' },
      { status: 502 },
    );
  }
}
