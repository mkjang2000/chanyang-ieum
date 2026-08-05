/* 새로 들어온 악보 이미지의 Key 를 백그라운드로 분석한다.
 *
 * 곡당 3~33초(실측 평균 12초) 걸려 저장 요청 안에서 처리할 수 없다.
 * 그래서 이미지는 key_status='pending' 으로 저장해 두고, 여기서 하나씩 처리한다.
 *
 * 사용자가 직접 입력한 Key(key_source='manual')는 건드리지 않는다.
 */
import path from 'node:path';
import { getPool } from './db.js';
import { getImageStorageDir } from './config.js';
import { detectKey, isKeyDetectionAvailable } from './keydetect.js';

const IDLE_MS = 30_000;   // 대기 작업이 없을 때 다음 확인까지
const BUSY_MS = 1_000;    // 작업이 있을 때 다음 건까지 (CPU 를 독점하지 않도록)

let running = false;
let timer = null;

async function claimNext() {
  const pool = getPool();
  // 여러 워커가 같은 이미지를 잡지 않도록 상태를 먼저 선점한다.
  const [rows] = await pool.query(
    `SELECT id, file_path FROM images
      WHERE key_status = 'pending' AND key_source <> 'manual'
      ORDER BY created_at ASC LIMIT 1`,
  );
  if (!rows.length) return null;
  const image = rows[0];
  const [claimed] = await pool.query(
    `UPDATE images SET key_status = 'working' WHERE id = ? AND key_status = 'pending'`,
    [image.id],
  );
  return claimed.affectedRows ? image : null;
}

async function finish(id, { key = '', status, source = '' }) {
  await getPool().query(
    `UPDATE images
        SET key_name = COALESCE(NULLIF(?, ''), key_name),
            key_source = COALESCE(NULLIF(?, ''), key_source),
            key_status = ?,
            key_checked_at = CURRENT_TIMESTAMP(3)
      WHERE id = ? AND key_source <> 'manual'`,
    [key, source, status, id],
  );
}

async function processOne() {
  // 설정이 빠졌거나 실행 파일이 사라졌을 때 대기 목록을 실패로 태워버리면 안 된다.
  // (AUDIVERIS_PATH 없이 돌다가 17건이 1초 만에 전부 failed 로 찍힌 적이 있다.)
  if (!isKeyDetectionAvailable()) {
    console.warn('[keyqueue] Audiveris 를 찾을 수 없어 이번 차례를 건너뜁니다.');
    return false;
  }
  const image = await claimNext();
  if (!image) return false;
  // file_path 는 절대경로로 저장되지만, 상대경로로 들어와도 동작하도록 resolve 한다.
  const filePath = path.resolve(getImageStorageDir(), image.file_path);
  try {
    const found = await detectKey(filePath);
    if (found?.key) {
      await finish(image.id, { key: found.key, source: found.source, status: 'done' });
      // 이미 저장된 콘티 중 Key 가 비어 있는 항목에도 채워 준다.
      // (콘티를 저장한 직후에 인식이 끝나므로, 이걸 안 하면 편집 화면이 계속 비어 보인다.)
      const [filled] = await getPool().query(
        `UPDATE conti_items SET key_name = ? WHERE image_id = ? AND key_name = ''`,
        [found.key, image.id],
      );
      const note = filled.affectedRows ? ` (콘티 ${filled.affectedRows}건 반영)` : '';
      console.log(`[keyqueue] ${image.id} → ${found.key}${note}`);
    } else {
      // 조표를 못 읽는 악보도 있다(손글씨, 심한 기울어짐). 재시도해도 같으므로 failed 로 둔다.
      await finish(image.id, { status: 'failed' });
      console.log(`[keyqueue] ${image.id} → 판독 실패`);
    }
  } catch (error) {
    await finish(image.id, { status: 'failed' }).catch(() => {});
    console.error(`[keyqueue] ${image.id} 처리 오류:`, error.message);
  }
  return true;
}

async function tick() {
  if (!running) return;
  let worked = false;
  try {
    worked = await processOne();
  } catch (error) {
    console.error('[keyqueue] 큐 처리 오류:', error.message);
  }
  if (!running) return;
  timer = setTimeout(tick, worked ? BUSY_MS : IDLE_MS);
  timer.unref?.();
}

export function startKeyQueue() {
  if (running) return;
  if (!isKeyDetectionAvailable()) {
    console.log('[keyqueue] AUDIVERIS_PATH 가 없어 Key 자동 인식을 건너뜁니다.');
    return;
  }
  running = true;
  console.log('[keyqueue] 악보 Key 자동 인식을 시작합니다.');
  // 이전 서버가 처리 중에 죽었다면 working 으로 남아 영영 안 잡힌다. 대기로 되돌린다.
  getPool()
    .query(`UPDATE images SET key_status = 'pending' WHERE key_status = 'working'`)
    .then(([result]) => {
      if (result.affectedRows) console.log(`[keyqueue] 중단된 ${result.affectedRows}건을 대기로 되돌렸습니다.`);
    })
    .catch(error => console.error('[keyqueue] 중단 건 복구 실패:', error.message));
  timer = setTimeout(tick, 3_000);
  timer.unref?.();
}

export function stopKeyQueue() {
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

/* 처리 현황 — 관리 화면에서 보여주기 위한 값. */
export async function getKeyQueueStatus() {
  const [rows] = await getPool().query(
    `SELECT key_status AS status, COUNT(*) AS count FROM images GROUP BY key_status`,
  );
  const counts = Object.fromEntries(rows.map(r => [r.status, Number(r.count)]));
  return {
    available: isKeyDetectionAvailable(),
    running,
    pending: counts.pending || 0,
    working: counts.working || 0,
    done: counts.done || 0,
    failed: counts.failed || 0,
  };
}
