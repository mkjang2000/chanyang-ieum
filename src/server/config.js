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
