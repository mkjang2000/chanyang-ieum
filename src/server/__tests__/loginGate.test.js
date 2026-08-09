/* 로그인 동시 처리 제한.
 *
 * 자리 반납이 한 번이라도 새면 로그인이 영영 막히므로, 정상 종료뿐 아니라
 * 예외 경로에서도 카운터가 0 으로 돌아오는지 함께 확인한다.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.LOGIN_CONCURRENCY = '2';
process.env.LOGIN_QUEUE_LIMIT = '50';

const { withLoginSlot, LoginBusyError, getLoginGateStatus } = await import('../loginGate.js');

const defer = ms => new Promise(resolve => setTimeout(resolve, ms));
const gate = () => {
  const status = getLoginGateStatus();
  return { active: status.active, waiting: status.waiting };
};

/* 상한을 넘겨 동시에 실행되지 않는지 확인한다. */
const runConcurrently = async count => {
  let running = 0;
  let peak = 0;
  await Promise.all(Array.from({ length: count }, () => withLoginSlot(async () => {
    running += 1;
    peak = Math.max(peak, running);
    await defer(5);
    running -= 1;
  })));
  return peak;
};

test('상한을 넘겨 동시에 실행되지 않는다', async () => {
  assert.equal(await runConcurrently(30), 2);
  assert.deepEqual(gate(), { active: 0, waiting: 0 });
});

test('작업이 예외를 던져도 자리를 반납한다', async () => {
  await Promise.all(Array.from({ length: 10 }, () => withLoginSlot(async () => {
    await defer(2);
    throw new Error('검증 중 오류');
  }).catch(() => {})));
  assert.deepEqual(gate(), { active: 0, waiting: 0 });
});

test('예외가 난 뒤에도 상한이 그대로 유지된다', async () => {
  assert.equal(await runConcurrently(12), 2);
});

test('먼저 들어온 요청이 먼저 처리된다', async () => {
  const order = [];
  await Promise.all(Array.from({ length: 8 }, (_, index) => withLoginSlot(async () => {
    order.push(index);
    await defer(3);
  })));
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('대기 줄이 차면 기다리지 않고 거절한다', async () => {
  process.env.LOGIN_QUEUE_LIMIT = '5';
  const held = Array.from({ length: 7 }, () => withLoginSlot(() => defer(40)));
  await defer(5);
  assert.equal(gate().waiting, 5, '대기 줄이 한도까지 차 있어야 한다');

  await assert.rejects(() => withLoginSlot(async () => 'never'), LoginBusyError);
  const rejected = await withLoginSlot(async () => 'never').catch(error => error);
  assert.equal(rejected.status, 429, '429 로 응답할 수 있어야 한다');

  await Promise.all(held);
  process.env.LOGIN_QUEUE_LIMIT = '50';
  assert.deepEqual(gate(), { active: 0, waiting: 0 });
});

test('거절 이후에도 정상 요청이 계속 처리된다', async () => {
  assert.equal(await withLoginSlot(async () => 'ok'), 'ok');
  assert.deepEqual(gate(), { active: 0, waiting: 0 });
});

test('상한이 1이어도 교착 없이 끝난다', async () => {
  process.env.LOGIN_CONCURRENCY = '1';
  assert.equal(await runConcurrently(12), 1);
  process.env.LOGIN_CONCURRENCY = '2';
  assert.deepEqual(gate(), { active: 0, waiting: 0 });
});

test('잘못된 설정값은 기본값으로 되돌린다', async () => {
  const original = process.env.LOGIN_CONCURRENCY;
  for (const value of ['0', '-1', 'abc', '', '1.5']) {
    process.env.LOGIN_CONCURRENCY = value;
    assert.equal(getLoginGateStatus().limit, 2, `LOGIN_CONCURRENCY=${JSON.stringify(value)}`);
  }
  process.env.LOGIN_CONCURRENCY = original;
});
