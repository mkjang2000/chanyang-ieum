import {
  getLoginGlobalLimit,
  getLoginRateWindowMs,
  getLoginUserLimit,
} from './config.js';

export class LoginRateLimitError extends Error {
  constructor(retryAfter = 60) {
    super('로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    this.status = 429;
    this.retryAfter = Math.max(1, Math.ceil(retryAfter));
  }
}

const globalAttempts = [];
const attemptsByUsername = new Map();
let lastSweepAt = 0;

const trim = (values, cutoff) => {
  let expired = 0;
  while (expired < values.length && values[expired] <= cutoff) expired += 1;
  if (expired) values.splice(0, expired);
};

const retryAfter = (values, now, windowMs) => (
  Math.ceil(Math.max(1000, (values[0] || now) + windowMs - now) / 1000)
);

function sweep(now, windowMs) {
  const cutoff = now - windowMs;
  trim(globalAttempts, cutoff);
  if (now - lastSweepAt < windowMs) return;
  lastSweepAt = now;
  for (const [username, attempts] of attemptsByUsername) {
    trim(attempts, cutoff);
    if (!attempts.length) attemptsByUsername.delete(username);
  }
}

/*
 * scrypt 동시 실행 제한과 별개로, 짧은 시간에 들어오는 전체 로그인 요청과
 * 한 계정에 대한 반복 시도를 제한한다. 전체 제한은 무작위 아이디를 계속
 * 바꾸는 공격도 DB 기록을 무한히 쌓지 못하게 한다.
 */
export function consumeLoginAttempt(username, now = Date.now()) {
  const windowMs = getLoginRateWindowMs();
  const normalized = String(username || '').trim().toLowerCase().slice(0, 64);
  sweep(now, windowMs);

  if (globalAttempts.length >= getLoginGlobalLimit()) {
    throw new LoginRateLimitError(retryAfter(globalAttempts, now, windowMs));
  }

  const userAttempts = attemptsByUsername.get(normalized) || [];
  trim(userAttempts, now - windowMs);
  if (userAttempts.length >= getLoginUserLimit()) {
    throw new LoginRateLimitError(retryAfter(userAttempts, now, windowMs));
  }

  globalAttempts.push(now);
  userAttempts.push(now);
  attemptsByUsername.set(normalized, userAttempts);
}

export function clearLoginAttemptsForUser(username) {
  attemptsByUsername.delete(String(username || '').trim().toLowerCase().slice(0, 64));
}

export function resetLoginRateLimit() {
  globalAttempts.length = 0;
  attemptsByUsername.clear();
  lastSweepAt = 0;
}
