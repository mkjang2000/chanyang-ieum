import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { getImageStorageDir } from '../../../src/server/config.js';
import { getPool } from '../../../src/server/db.js';

export async function GET() {
  try {
    await Promise.all([
      getPool().query('SELECT 1'),
      access(getImageStorageDir(), constants.R_OK | constants.W_OK),
    ]);
    return Response.json({ status: 'ok' }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ status: 'unavailable' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
