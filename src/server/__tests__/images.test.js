/* SSRF 방어의 핵심 판정.
 *
 * 여기가 회귀하면 외부 이미지 주소로 내부망을 훑을 수 있게 된다.
 * 특히 ::ffff: 매핑과 172.16/12 경계는 직접 짠 판정이라 값으로 고정해 둔다.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPrivateAddress } from '../images.js';
import { getDaumSourceReferer, normalizeSearchImageUrl } from '../externalImageUrls.js';

const PRIVATE = [
  ['127.0.0.1', '루프백'],
  ['127.1.2.3', '루프백 대역 전체'],
  ['10.0.0.1', '사설 10/8'],
  ['192.168.1.1', '사설 192.168/16'],
  ['172.16.0.1', '사설 172.16/12 시작'],
  ['172.31.255.255', '사설 172.16/12 끝'],
  ['169.254.169.254', '링크 로컬(클라우드 메타데이터)'],
  ['100.64.0.1', 'CGNAT'],
  ['100.127.255.255', 'CGNAT 끝'],
  ['0.0.0.0', '미지정 주소'],
  ['224.0.0.1', '멀티캐스트'],
  ['255.255.255.255', '브로드캐스트'],
  ['::1', 'IPv6 루프백'],
  ['fd00::1', 'IPv6 ULA'],
  ['fe80::1', 'IPv6 링크 로컬'],
  ['::ffff:127.0.0.1', 'IPv4 매핑 루프백'],
  ['::ffff:10.0.0.1', 'IPv4 매핑 사설'],
  ['not-an-ip', 'IP 가 아닌 값'],
  ['', '빈 값'],
];

const PUBLIC = [
  ['8.8.8.8', '공인 IPv4'],
  ['1.1.1.1', '공인 IPv4'],
  ['172.15.255.255', '172.16/12 바로 앞'],
  ['172.32.0.1', '172.16/12 바로 뒤'],
  ['100.63.255.255', 'CGNAT 바로 앞'],
  ['100.128.0.1', 'CGNAT 바로 뒤'],
  ['2606:4700::1111', '공인 IPv6'],
  ['::ffff:8.8.8.8', 'IPv4 매핑 공인'],
];

test('내부망 주소를 차단한다', () => {
  for (const [address, label] of PRIVATE) {
    assert.equal(isPrivateAddress(address), true, `${label}: ${address}`);
  }
});

test('공인 주소는 통과시킨다', () => {
  for (const [address, label] of PUBLIC) {
    assert.equal(isPrivateAddress(address), false, `${label}: ${address}`);
  }
});

test('구형 다음 카페 이미지의 HTTP 스킴을 보존한다', () => {
  assert.equal(
    normalizeSearchImageUrl('http://cfile270.uf.daum.net/image.jpg'),
    'http://cfile270.uf.daum.net/image.jpg',
  );
  assert.equal(
    normalizeSearchImageUrl('http://pds77.cafe.daum.net/download.php?file=image.jpg'),
    'http://pds77.cafe.daum.net/download.php?file=image.jpg',
  );
  assert.equal(
    normalizeSearchImageUrl('http://blog.kakaocdn.net/image.jpg'),
    'https://blog.kakaocdn.net/image.jpg',
  );
});

test('다음 이미지에는 다음 원문 Referer만 허용한다', () => {
  assert.equal(
    getDaumSourceReferer('https://cafe.daum.net/worship/123', 'pds77.cafe.daum.net'),
    'https://cafe.daum.net/worship/123',
  );
  assert.equal(getDaumSourceReferer('https://example.com/private', 'pds77.cafe.daum.net'), '');
  assert.equal(getDaumSourceReferer('https://cafe.daum.net/worship/123', 'postfiles.pstatic.net'), '');
});
