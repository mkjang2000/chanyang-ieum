const requiredValue = name => {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} 환경변수가 설정되지 않았습니다. .env.local을 확인해 주세요.`);
  }
  return value;
};

export function getDatabaseConfig() {
  const socketPath = String(process.env.DB_SOCKET || '').trim();
  const host = String(process.env.DB_HOST || '').trim();
  if (!socketPath && !host) {
    throw new Error('DB_SOCKET 또는 DB_HOST 환경변수 중 하나를 설정해 주세요.');
  }
  return {
    ...(socketPath
      ? { socketPath }
      : { host, port: Math.max(1, Math.min(65535, Number(process.env.DB_PORT) || 3306)) }),
    user: requiredValue('DB_USER'),
    password: requiredValue('DB_PASSWORD'),
    database: requiredValue('DB_NAME'),
    charset: 'utf8mb4',
  };
}

export function getImageStorageDir() {
  return requiredValue('IMAGE_STORAGE_DIR');
}

/* 비밀번호 검증(scrypt)을 동시에 몇 건까지 돌릴지.
 *
 * scrypt N=32768 은 1건당 CPU 코어 하나를 50~100ms 점유하고 메모리 64MB 를 쓴다.
 * 상한이 없으면 로그인 요청 50건만 동시에 들어와도 3GB 를 잡아 서버가 멈춘다.
 * 반대로 정상 사용자(찬양단 20명이 예배 직전에 몰리는 경우)는 순서만 기다리면 되므로
 * 기본값 2 로도 마지막 사람이 1초 안에 처리된다.
 *
 * 서버 사양에 여유가 있으면 LOGIN_CONCURRENCY 로 늘린다. 코어 수 이하를 권장한다.
 */
export function getLoginConcurrency() {
  const value = Number(process.env.LOGIN_CONCURRENCY);
  if (!Number.isInteger(value) || value < 1) return 2;
  return Math.min(64, value);
}

/* 대기 줄의 상한. 여기까지 차면 새 요청은 기다리지 않고 429 로 돌려보낸다.
 *
 * 정상 사용자 20~30명으로는 절대 닿지 않는 값이라 실질적으로는 봇만 걸린다.
 * 상한이 없으면 요청이 무한정 쌓여, 결국 막으려던 메모리 고갈이 그대로 일어난다.
 */
export function getLoginQueueLimit() {
  const value = Number(process.env.LOGIN_QUEUE_LIMIT);
  if (!Number.isInteger(value) || value < 1) return 50;
  return Math.min(1000, value);
}

export function getLoginRateWindowMs() {
  const seconds = Number(process.env.LOGIN_RATE_WINDOW_SECONDS);
  if (!Number.isInteger(seconds) || seconds < 10) return 300_000;
  return Math.min(3600, seconds) * 1000;
}

export function getLoginGlobalLimit() {
  const value = Number(process.env.LOGIN_RATE_GLOBAL_LIMIT);
  if (!Number.isInteger(value) || value < 10) return 300;
  return Math.min(10_000, value);
}

export function getLoginUserLimit() {
  const value = Number(process.env.LOGIN_RATE_USER_LIMIT);
  if (!Number.isInteger(value) || value < 3) return 20;
  return Math.min(1000, value);
}

export function getLoginRecordLimit() {
  const value = Number(process.env.LOGIN_RECORD_MAX_ROWS);
  if (!Number.isInteger(value) || value < 1000) return 100_000;
  return Math.min(1_000_000, value);
}
