/* 비밀번호 검증(scrypt)의 동시 실행 수를 제한한다.
 *
 * 막으려는 것은 비밀번호 크래킹이 아니라 자원 고갈이다.
 * scrypt N=32768 은 1건당 메모리 64MB 를 쓰기 때문에, 로그인 요청이 동시에 몰리면
 * 계산이 끝나기 전에 서버 메모리가 먼저 바닥난다. 주일 아침에 앱이 죽는 시나리오다.
 *
 * IP 를 보지 않는다는 점이 중요하다.
 * 교회 와이파이 하나에 찬양단 전원이 붙으면 서버에서는 전부 같은 IP 로 보이므로,
 * IP 기준으로 세면 "3명이 각자 한 번씩 틀렸을 뿐인데 전원이 막히는" 일이 생긴다.
 * 여기서는 "지금 계산 중인 건수"만 세기 때문에 차단 대상이 되는 사용자가 없다.
 * 정상 사용자에게 일어날 수 있는 최악은 몇백 ms 더 기다리는 것뿐이다.
 *
 * 주의: 카운터는 프로세스 메모리에 있다. realtime.js, keyqueue.js 와 마찬가지로
 * 웹 프로세스 하나로 운영하는 것을 전제한다. 인스턴스를 늘리면 상한도 배로 늘어난다.
 */
import { getLoginConcurrency, getLoginQueueLimit } from './config.js';

export class LoginBusyError extends Error {
  constructor(message = '로그인 요청이 많아 잠시 후 다시 시도해 주세요.') {
    super(message);
    this.status = 429;
  }
}

let active = 0;
const waiting = [];

const release = () => {
  const next = waiting.shift();
  // 대기자가 있으면 자리를 넘겨준다. 넘겨줄 때 active 를 줄이지 않는 이유는
  // 그 자리를 그대로 물려받기 때문이다. 여기서 줄이면 상한을 넘겨 실행된다.
  if (next) next();
  else active -= 1;
};

/* 상한 안에서 work 를 실행한다. 자리가 없으면 기다렸다가 순서대로 실행한다.
 * 대기 줄이 한도까지 차 있으면 기다리지 않고 LoginBusyError 를 던진다. */
export async function withLoginSlot(work) {
  const limit = getLoginConcurrency();
  if (active >= limit) {
    if (waiting.length >= getLoginQueueLimit()) throw new LoginBusyError();
    await new Promise(resolve => waiting.push(resolve));
  } else {
    active += 1;
  }
  try {
    return await work();
  } finally {
    release();
  }
}

/* 관리 화면의 시스템 상태용. */
export function getLoginGateStatus() {
  return {
    active,
    waiting: waiting.length,
    limit: getLoginConcurrency(),
    queueLimit: getLoginQueueLimit(),
  };
}
