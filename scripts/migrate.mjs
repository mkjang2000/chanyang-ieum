import { readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import mysql from 'mysql2/promise';
import { getDatabaseConfig } from '../src/server/config.js';

try {
  loadEnvFile('.env.local');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const databaseConfig = getDatabaseConfig();
const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');

const connection = await mysql.createConnection({
  ...databaseConfig,
  multipleStatements: true,
});

try {
  await connection.query(schema);
  console.log(`MuseConti schema is ready in ${databaseConfig.database}.`);
} finally {
  await connection.end();
}
