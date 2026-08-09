/* 비밀번호 해싱과 검증.
 *
 * scrypt 파라미터를 해시 문자열에 함께 저장하는 형식이라,
 * 형식이 바뀌면 기존 계정이 전부 로그인하지 못하게 된다.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

// 해싱은 로그인 게이트를 거치므로 테스트가 서로 기다리지 않도록 넉넉히 잡는다.
process.env.LOGIN_CONCURRENCY = '4';

const { hashPassword, verifyPassword } = await import('../auth.js');

const PASSWORD = 'correct-horse-battery';

test('해시는 매번 달라지고 원본을 담지 않는다', async () => {
  const [first, second] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
  assert.notEqual(first, second, '소금이 매번 달라야 한다');
  assert.ok(!first.includes(PASSWORD));
  assert.match(first, /^scrypt\$32768\$8\$1\$/);
});

test('올바른 비밀번호를 통과시킨다', async () => {
  assert.equal(await verifyPassword(PASSWORD, await hashPassword(PASSWORD)), true);
});

test('틀린 비밀번호를 거절한다', async () => {
  const encoded = await hashPassword(PASSWORD);
  for (const wrong of [`${PASSWORD} `, PASSWORD.toUpperCase(), PASSWORD.slice(0, -1), '']) {
    assert.equal(await verifyPassword(wrong, encoded), false, JSON.stringify(wrong));
  }
});

test('손상되거나 낯선 형식은 예외 없이 거절한다', async () => {
  // 검증 실패가 예외로 새어 나가면 500 이 되어 로그인 화면이 깨진다.
  const encoded = await hashPassword(PASSWORD);
  const broken = [
    '', 'not-a-hash', 'bcrypt$1$2$3$4$5', 'scrypt$32768$8$1$only-salt',
    encoded.replace('scrypt', 'sha256'), encoded.slice(0, 20),
  ];
  for (const value of broken) {
    assert.equal(await verifyPassword(PASSWORD, value), false, JSON.stringify(value));
  }
  for (const value of [null, undefined, 42]) {
    assert.equal(await verifyPassword(PASSWORD, value), false, String(value));
  }
});

test('너무 짧거나 긴 비밀번호는 거부한다', async () => {
  for (const value of ['', 'short', '1234567']) {
    await assert.rejects(() => hashPassword(value), { status: 400 }, JSON.stringify(value));
  }
  await assert.rejects(() => hashPassword('a'.repeat(201)), { status: 400 });
});

test('문자열이 아닌 비밀번호는 거부한다', async () => {
  for (const value of [null, undefined, 12345678, {}]) {
    await assert.rejects(() => hashPassword(value), { status: 400 }, String(value));
  }
});
