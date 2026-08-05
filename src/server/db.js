import mysql from 'mysql2/promise';
import { getDatabaseConfig } from './config.js';

let pool;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...getDatabaseConfig(),
      connectionLimit: 8,
      waitForConnections: true,
      dateStrings: true,
    });
  }
  return pool;
}

export async function withTransaction(work) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function normalizeSongTitle(value = '') {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/\s+/g, '')
    .replace(/[()[\]{}'"“”‘’.,!?·~:;_\-/\\]/g, '');
}
