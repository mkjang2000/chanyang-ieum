#!/bin/sh
set -eu

mkdir -p "${IMAGE_STORAGE_DIR}"

attempt=1
max_attempts="${DB_MIGRATION_ATTEMPTS:-30}"

while ! node scripts/migrate.mjs; do
  if [ "${attempt}" -ge "${max_attempts}" ]; then
    echo "데이터베이스 준비를 ${max_attempts}회 시도했지만 연결하지 못했습니다." >&2
    exit 1
  fi
  echo "데이터베이스를 기다리는 중입니다. (${attempt}/${max_attempts})" >&2
  attempt=$((attempt + 1))
  sleep 2
done

exec node scripts/start.mjs
