import path from 'node:path';
import { unlink } from 'node:fs/promises';
import { getImageStorageDir } from './config.js';
import { getPool } from './db.js';

const TASK_NAME = 'orphan-library-cleanup';
const LOCK_NAME = 'muse-conti-orphan-library-cleanup';
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
let nextAutomaticCheckAt = 0;

const parseResult = value => {
  try {
    return typeof value === 'string' ? JSON.parse(value) : (value || null);
  } catch {
    return null;
  }
};

export async function countOrphanedLibrary(connection = getPool()) {
  const [[songs], [images]] = await Promise.all([
    connection.query(
      `SELECT COUNT(*) AS count
         FROM songs s
        WHERE NOT EXISTS (
          SELECT 1 FROM conti_items ci WHERE ci.song_id = s.id
        )`,
    ),
    connection.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(i.file_size), 0) AS bytes
         FROM images i
        WHERE NOT EXISTS (
          SELECT 1 FROM conti_change_requests cr
           WHERE cr.before_image_id = i.id OR cr.proposed_image_id = i.id
        ) AND NOT EXISTS (
          SELECT 1 FROM conti_items ci WHERE ci.image_id = i.id
        )
          AND NOT EXISTS (
            SELECT 1
              FROM song_images si
             WHERE si.image_id = i.id
               AND EXISTS (
                 SELECT 1 FROM conti_items ci2 WHERE ci2.song_id = si.song_id
               )
          )`,
    ),
  ]);
  return {
    songs: Number(songs[0].count),
    images: Number(images[0].count),
    bytes: Number(images[0].bytes),
  };
}

export async function getMaintenanceStatus() {
  const [rows] = await getPool().query(
    `SELECT DATE_FORMAT(last_run_at, '%Y-%m-%d %H:%i:%s') AS lastRunAt, result_json AS result
       FROM maintenance_runs WHERE task_name = ?`,
    [TASK_NAME],
  );
  return {
    lastRunAt: rows[0]?.lastRunAt || null,
    lastResult: parseResult(rows[0]?.result),
    pending: await countOrphanedLibrary(),
  };
}

export async function runOrphanCleanup({ force = false } = {}) {
  const pool = getPool();
  const connection = await pool.getConnection();
  let locked = false;
  let transactionStarted = false;
  try {
    const [[lockRow]] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [LOCK_NAME]);
    locked = Number(lockRow.acquired) === 1;
    if (!locked) return { executed: false, reason: 'busy' };

    if (!force) {
      const [recent] = await connection.query(
        `SELECT 1 FROM maintenance_runs
          WHERE task_name = ? AND last_run_at >= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY)
          LIMIT 1`,
        [TASK_NAME],
      );
      if (recent.length) return { executed: false, reason: 'not-due' };
    }

    await connection.beginTransaction();
    transactionStarted = true;
    const [orphanSongs] = await connection.query(
      `SELECT s.id
         FROM songs s
        WHERE NOT EXISTS (
          SELECT 1 FROM conti_items ci WHERE ci.song_id = s.id
        )
        FOR UPDATE`,
    );
    if (orphanSongs.length) {
      await connection.query(
        `DELETE FROM songs
          WHERE NOT EXISTS (
            SELECT 1 FROM conti_items ci WHERE ci.song_id = songs.id
          )`,
      );
    }

    const [orphanImages] = await connection.query(
      `SELECT i.id, i.file_path AS filePath, i.file_size AS fileSize
         FROM images i
        WHERE NOT EXISTS (
          SELECT 1 FROM conti_change_requests cr
           WHERE cr.before_image_id = i.id OR cr.proposed_image_id = i.id
        ) AND NOT EXISTS (
          SELECT 1 FROM conti_items ci WHERE ci.image_id = i.id
        )
          AND NOT EXISTS (
            SELECT 1 FROM song_images si WHERE si.image_id = i.id
          )
        FOR UPDATE`,
    );
    if (orphanImages.length) {
      await connection.query(
        `DELETE FROM images
          WHERE NOT EXISTS (
            SELECT 1 FROM conti_change_requests cr
             WHERE cr.before_image_id = images.id OR cr.proposed_image_id = images.id
          ) AND NOT EXISTS (
            SELECT 1 FROM conti_items ci WHERE ci.image_id = images.id
          )
            AND NOT EXISTS (
              SELECT 1 FROM song_images si WHERE si.image_id = images.id
            )`,
      );
    }

    const initialResult = {
      executed: true,
      songsDeleted: orphanSongs.length,
      imagesDeleted: orphanImages.length,
      bytesDeleted: orphanImages.reduce((sum, image) => sum + Number(image.fileSize || 0), 0),
      filesDeleted: 0,
      missingFiles: 0,
      skippedFiles: 0,
    };
    await connection.query(
      `INSERT INTO maintenance_runs (task_name, last_run_at, result_json)
       VALUES (?, CURRENT_TIMESTAMP(3), ?)
       ON DUPLICATE KEY UPDATE last_run_at = VALUES(last_run_at), result_json = VALUES(result_json)`,
      [TASK_NAME, JSON.stringify(initialResult)],
    );
    await connection.commit();
    transactionStarted = false;

    const root = path.resolve(getImageStorageDir());
    const result = { ...initialResult };
    for (const image of orphanImages) {
      const resolved = path.resolve(image.filePath);
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
        result.skippedFiles += 1;
        continue;
      }
      try {
        await unlink(resolved);
        result.filesDeleted += 1;
      } catch (error) {
        if (error.code === 'ENOENT') result.missingFiles += 1;
        else result.skippedFiles += 1;
      }
    }
    await connection.query(
      'UPDATE maintenance_runs SET result_json = ? WHERE task_name = ?',
      [JSON.stringify(result), TASK_NAME],
    );
    return result;
  } catch (error) {
    if (transactionStarted) await connection.rollback().catch(() => {});
    throw error;
  } finally {
    if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {});
    connection.release();
  }
}

export async function runDailyCleanupIfDue() {
  const now = Date.now();
  if (now < nextAutomaticCheckAt) return { executed: false, reason: 'process-throttled' };
  nextAutomaticCheckAt = now + HOUR_MS;
  try {
    const result = await runOrphanCleanup();
    if (result.executed) nextAutomaticCheckAt = now + DAY_MS;
    return result;
  } catch (error) {
    nextAutomaticCheckAt = now + 15 * 60 * 1000;
    throw error;
  }
}
