import { execFile } from 'node:child_process';
import { access, statfs } from 'node:fs/promises';
import { constants } from 'node:fs';
import { promisify } from 'node:util';
import { getImageStorageDir } from './config.js';
import { getPool } from './db.js';
import { getKeyQueueStatus } from './keyqueue.js';
import { getMaintenanceStatus } from './maintenance.js';

const run = promisify(execFile);

async function commandAvailable(command, args) {
  try {
    await run(command, args, { timeout: 5000, maxBuffer: 256 * 1024 });
    return true;
  } catch (error) {
    // poppler 도구는 버전 정보를 stderr 로 쓰지만 정상 설치 시 종료 코드는 0이다.
    return error.code === 0;
  }
}

async function storageStatus() {
  try {
    const directory = getImageStorageDir();
    await access(directory, constants.R_OK | constants.W_OK);
    const stats = await statfs(directory);
    return {
      ok: true,
      directory,
      totalBytes: Number(stats.blocks) * Number(stats.bsize),
      freeBytes: Number(stats.bavail) * Number(stats.bsize),
    };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

export async function getSystemStatus() {
  const startedAt = performance.now();
  await getPool().query('SELECT 1');
  const databaseLatencyMs = Math.max(0, Math.round(performance.now() - startedAt));
  const [[counts], storage, maintenance, keyQueue, tools] = await Promise.all([
    getPool().query(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE active = 1) AS activeUsers,
         (SELECT COUNT(*) FROM sessions WHERE expires_at > CURRENT_TIMESTAMP(3)) AS activeSessions,
         (SELECT COUNT(*) FROM contis) AS contis,
         (SELECT COUNT(*) FROM images) AS images,
         (SELECT COALESCE(SUM(file_size), 0) FROM images) AS imageBytes,
         (SELECT COUNT(*) FROM share_links
           WHERE revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP(3)) AS activeShares`,
    ).then(([rows]) => rows),
    storageStatus(),
    getMaintenanceStatus(),
    getKeyQueueStatus(),
    Promise.all([
      commandAvailable('tesseract', ['--version']),
      commandAvailable('pdftoppm', ['-v']),
      commandAvailable('pdfinfo', ['-v']),
    ]),
  ]);
  return {
    checkedAt: new Date().toISOString(),
    database: { ok: true, latencyMs: databaseLatencyMs },
    storage,
    counts: {
      activeUsers: Number(counts.activeUsers || 0),
      activeSessions: Number(counts.activeSessions || 0),
      contis: Number(counts.contis || 0),
      images: Number(counts.images || 0),
      imageBytes: Number(counts.imageBytes || 0),
      activeShares: Number(counts.activeShares || 0),
    },
    integrations: {
      imageSearch: Boolean(process.env.KAKAO_REST_API_KEY),
      pdfOcr: tools.every(Boolean),
      tesseract: tools[0],
      poppler: tools[1] && tools[2],
    },
    keyQueue,
    maintenance,
  };
}
