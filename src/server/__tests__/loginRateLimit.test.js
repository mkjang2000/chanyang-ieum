import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.LOGIN_RATE_WINDOW_SECONDS = '10';
process.env.LOGIN_RATE_GLOBAL_LIMIT = '10';
process.env.LOGIN_RATE_USER_LIMIT = '3';

const {
  clearLoginAttemptsForUser,
  consumeLoginAttempt,
  LoginRateLimitError,
  resetLoginRateLimit,
} = await import('../loginRateLimit.js');

before(resetLoginRateLimit);
after(resetLoginRateLimit);

test('한 계정의 반복 로그인을 제한하고 Retry-After를 제공한다', () => {
  const now = 1_000_000;
  for (let index = 0; index < 3; index += 1) consumeLoginAttempt('leader', now + index);
  assert.throws(
    () => consumeLoginAttempt('leader', now + 3),
    error => error instanceof LoginRateLimitError && error.status === 429 && error.retryAfter >= 9,
  );
});

test('로그인 성공 후 계정별 실패 횟수를 비운다', () => {
  resetLoginRateLimit();
  consumeLoginAttempt('leader', 2_000_000);
  consumeLoginAttempt('leader', 2_000_001);
  clearLoginAttemptsForUser('LEADER');
  assert.doesNotThrow(() => consumeLoginAttempt('leader', 2_000_002));
});

test('아이디를 바꾸는 공격도 전체 상한에서 차단한다', () => {
  resetLoginRateLimit();
  const now = 3_000_000;
  for (let index = 0; index < 10; index += 1) consumeLoginAttempt(`random-${index}`, now + index);
  assert.throws(() => consumeLoginAttempt('another', now + 10), LoginRateLimitError);
});

test('제한 시간이 지나면 다시 로그인할 수 있다', () => {
  resetLoginRateLimit();
  const now = 4_000_000;
  for (let index = 0; index < 3; index += 1) consumeLoginAttempt('leader', now + index);
  assert.doesNotThrow(() => consumeLoginAttempt('leader', now + 10_001));
});
