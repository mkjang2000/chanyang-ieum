import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  requestBodyLimit, requestSourceError, securityHeaders,
} from '../httpSecurity.js';

test('안전한 메서드와 브라우저가 아닌 호출은 기존처럼 허용한다', () => {
  assert.equal(requestSourceError('GET', { host: 'app.example.com', origin: 'https://evil.example' }), '');
  assert.equal(requestSourceError('POST', { host: 'app.example.com' }), '');
});

test('HTTPS 프록시 뒤의 동일 출처 요청을 허용한다', () => {
  assert.equal(requestSourceError('PATCH', {
    host: 'app.example.com',
    origin: 'https://app.example.com',
    'sec-fetch-site': 'same-origin',
    'x-forwarded-proto': 'https',
  }), '');
  assert.equal(requestSourceError('POST', {
    host: 'app.example.com:443',
    origin: 'https://app.example.com',
    'x-forwarded-proto': 'https',
  }), '');
});

test('교차 사이트와 다른 서브도메인의 상태 변경 요청을 차단한다', () => {
  assert.match(requestSourceError('POST', {
    host: 'app.example.com',
    origin: 'https://evil.example',
    'sec-fetch-site': 'cross-site',
    'x-forwarded-proto': 'https',
  }), /허용되지/);
  assert.match(requestSourceError('DELETE', {
    host: 'app.example.com',
    origin: 'https://other.example.com',
    'sec-fetch-site': 'same-site',
    'x-forwarded-proto': 'https',
  }), /일치하지/);
});

test('프록시 프로토콜과 Origin 프로토콜이 다르면 차단한다', () => {
  assert.match(requestSourceError('POST', {
    host: 'app.example.com',
    origin: 'http://app.example.com',
    'x-forwarded-proto': 'https',
  }), /일치하지/);
});

test('경로별 요청 크기 상한을 구분한다', () => {
  assert.equal(requestBodyLimit('/api/ordinary'), 2 * 1024 * 1024);
  assert.equal(requestBodyLimit('/api/contis/pdf-import'), 27 * 1024 * 1024);
  assert.equal(requestBodyLimit('/api/contis/change-requests'), 36 * 1024 * 1024);
  assert.equal(requestBodyLimit('/api/contis'), 128 * 1024 * 1024);
});

test('페이지 격리 헤더와 HTTPS 전용 HSTS를 제공한다', () => {
  const plain = securityHeaders();
  const secure = securityHeaders({ secure: true });
  assert.match(plain['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal(plain['X-Frame-Options'], 'DENY');
  assert.equal(plain['Strict-Transport-Security'], undefined);
  assert.match(secure['Strict-Transport-Security'], /max-age=31536000/);
});

test('악보 검색의 외부 HTTPS 이미지를 허용하고 스크립트와 연결은 동일 출처로 제한한다', () => {
  for (const secure of [false, true]) {
    const policy = securityHeaders({ secure })['Content-Security-Policy'];
    const directives = new Map(policy.split('; ').map(directive => {
      const [name, ...sources] = directive.split(' ');
      return [name, sources];
    }));
    const images = directives.get('img-src');
    for (const source of ["'self'", 'data:', 'blob:', 'https:']) {
      assert.ok(images.includes(source), `이미지 출처 허용: ${source}`);
    }
    assert.ok(!images.includes('http:'));
    assert.ok(!images.includes('*'));
    assert.deepEqual(directives.get('connect-src'), ["'self'"]);
    assert.deepEqual(directives.get('script-src'), ["'self'", "'unsafe-inline'"]);
  }
});
