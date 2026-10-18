import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { getPool, withTransaction } from './db.js';
import { LoginBusyError, withLoginSlot } from './loginGate.js';
import { getLoginRecordLimit } from './config.js';
import {
  clearLoginAttemptsForUser, consumeLoginAttempt, LoginRateLimitError,
} from './loginRateLimit.js';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'muse_session';
const SESSION_DAYS = 30;
const SESSION_MAX_AGE = SESSION_DAYS * 86400;
const PASSWORD_MIN_LENGTH = 8;
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const VALID_ROLES = new Set(['admin', 'leader', 'accompanist', 'member']);
const LOGIN_RECORD_DAYS = 180;
const LOGIN_RECORD_CLEANUP_INTERVAL = 60 * 60 * 1000;
let nextLoginRecordCleanupAt = 0;

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

const normalizeUsername = value => String(value || '').trim().toLowerCase();
const tokenHash = token => createHash('sha256').update(token).digest('hex');

function clientAddress(request) {
  return String(
    request.headers.get('cf-connecting-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]
      || request.headers.get('x-real-ip')
      || '',
  ).trim().slice(0, 64);
}

async function recordLogin(request, { userId = null, username = '', success = false }) {
  try {
    await getPool().query(
      `INSERT INTO login_records (user_id, username, success, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [
        userId,
        normalizeUsername(username).slice(0, 64),
        success ? 1 : 0,
        clientAddress(request),
        String(request.headers.get('user-agent') || '').slice(0, 500),
      ],
    );
    const now = Date.now();
    if (now >= nextLoginRecordCleanupAt) {
      nextLoginRecordCleanupAt = now + LOGIN_RECORD_CLEANUP_INTERVAL;
      await getPool().query(
        `DELETE FROM login_records WHERE created_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ${LOGIN_RECORD_DAYS} DAY)`,
      );
      const [[countRow]] = await getPool().query('SELECT COUNT(*) AS count FROM login_records');
      const excess = Math.max(0, Number(countRow.count || 0) - getLoginRecordLimit());
      if (excess) {
        // LIMIT은 계산된 정수만 보간한다. mysql2/MariaDB 조합에 따른 LIMIT 바인딩 차이를 피한다.
        // 한 번에 너무 많은 행을 지워 로그인 요청이 오래 잠기지 않도록 시간당 1만 건씩 줄인다.
        await getPool().query(`DELETE FROM login_records ORDER BY id ASC LIMIT ${Math.min(excess, 10_000)}`);
      }
    }
  } catch (error) {
    // 기록 기능 장애가 실제 로그인을 막아서는 안 된다.
    console.error('로그인 기록을 저장하지 못했습니다.', error);
  }
}

function parseCookies(request) {
  const values = {};
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    values[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim());
  }
  return values;
}

function isSecureRequest(request) {
  return request.headers.get('x-forwarded-proto')?.split(',')[0].trim() === 'https:'
    || request.headers.get('x-forwarded-proto')?.split(',')[0].trim() === 'https'
    || new URL(request.url).protocol === 'https:';
}

function cookieHeader(request, value, maxAge) {
  const expires = new Date(Date.now() + Math.max(0, maxAge) * 1000);
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    `Expires=${expires.toUTCString()}`,
    isSecureRequest(request) ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw new AuthError(`비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`, 400);
  }
  if (password.length > 200) throw new AuthError('비밀번호가 너무 깁니다.', 400);
  // 길이 검사를 통과한 뒤에 자리를 잡는다. 형식이 틀린 요청은 대기 줄에 들어가지 않는다.
  return withLoginSlot(async () => {
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return `scrypt$32768$8$1$${salt.toString('base64')}$${Buffer.from(derived).toString('base64')}`;
  });
}

export async function verifyPassword(password, encoded) {
  try {
    const [algorithm, n, r, p, saltValue, hashValue] = String(encoded).split('$');
    if (algorithm !== 'scrypt') return false;
    const expected = Buffer.from(hashValue, 'base64');
    const actual = Buffer.from(await scrypt(password, Buffer.from(saltValue, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    }));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
  };
}

export async function getSessionUser(request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token || token.length < 32) return null;
  const [rows] = await getPool().query(
    `SELECT u.id, u.username, u.display_name AS displayName, u.role, u.active
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP(3)
      LIMIT 1`,
    [tokenHash(token)],
  );
  if (!rows.length || !rows[0].active) return null;
  return publicUser(rows[0]);
}

async function refreshSession(request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token || token.length < 32) return { user: null, setCookie: null };
  const hash = tokenHash(token);
  const [rows] = await getPool().query(
    `SELECT u.id, u.username, u.display_name AS displayName, u.role, u.active
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP(3)
      LIMIT 1`,
    [hash],
  );
  if (!rows.length || !rows[0].active) return { user: null, setCookie: null };
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
  await getPool().query(
    `UPDATE sessions
        SET expires_at = ?, last_seen_at = CURRENT_TIMESTAMP(3)
      WHERE token_hash = ?`,
    [expiresAt, hash],
  );
  return {
    user: publicUser(rows[0]),
    setCookie: cookieHeader(request, token, SESSION_MAX_AGE),
  };
}

export async function requireUser(request, roles = null) {
  const user = await getSessionUser(request);
  if (!user) throw new AuthError('로그인이 필요합니다.', 401);
  if (roles && !roles.includes(user.role)) throw new AuthError('이 작업을 수행할 권한이 없습니다.', 403);
  return user;
}

export async function getAuthStatus(request) {
  const [[countRow], session] = await Promise.all([
    getPool().query('SELECT COUNT(*) AS count FROM users').then(([rows]) => rows),
    refreshSession(request),
  ]);
  return {
    setupRequired: Number(countRow.count) === 0,
    user: session.user,
    setCookie: session.setCookie,
  };
}

async function createSession(request, userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await getPool().query('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP(3)');
  await getPool().query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    [tokenHash(token), userId, expiresAt],
  );
  return cookieHeader(request, token, SESSION_MAX_AGE);
}

export async function setupFirstAdmin(request, input) {
  const username = normalizeUsername(input.username);
  const displayName = String(input.displayName || '').trim();
  if (!USERNAME_PATTERN.test(username)) throw new AuthError('아이디는 영문 소문자, 숫자, 점, 밑줄, 하이픈으로 3~32자여야 합니다.', 400);
  if (!displayName || displayName.length > 100) throw new AuthError('표시 이름을 입력해 주세요.', 400);
  const passwordHash = await hashPassword(input.password);
  const id = randomUUID();

  await withTransaction(async connection => {
    const [rows] = await connection.query('SELECT id FROM users FOR UPDATE');
    if (rows.length) throw new AuthError('최초 관리자 설정이 이미 완료됐습니다.', 409);
    await connection.query(
      `INSERT INTO users (id, username, display_name, password_hash, role)
       VALUES (?, ?, ?, ?, 'admin')`,
      [id, username, displayName, passwordHash],
    );
  });
  const setCookie = await createSession(request, id);
  await recordLogin(request, { userId: id, username, success: true });
  return { user: { id, username, displayName, role: 'admin' }, setCookie };
}

export async function login(request, input) {
  const username = normalizeUsername(input.username);
  consumeLoginAttempt(username);
  const [rows] = await getPool().query(
    `SELECT id, username, display_name AS displayName, password_hash AS passwordHash, role, active
       FROM users WHERE username = ? LIMIT 1`,
    [username],
  );
  const account = rows[0];
  // 존재하지 않거나 비활성인 계정은 scrypt 까지 가지 않으므로 자리를 차지하지 않는다.
  // 무작위 아이디를 쏟아붓는 요청이 정상 사용자의 대기 줄을 밀어내지 않는다.
  const valid = Boolean(account) && Boolean(account.active) && await withLoginSlot(
    () => verifyPassword(String(input.password || ''), account.passwordHash),
  );
  if (!valid) {
    await recordLogin(request, { userId: account?.id || null, username, success: false });
    throw new AuthError('아이디 또는 비밀번호를 확인해 주세요.', 401);
  }
  await getPool().query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [account.id]);
  const setCookie = await createSession(request, account.id);
  await recordLogin(request, { userId: account.id, username, success: true });
  clearLoginAttemptsForUser(username);
  return { user: publicUser(account), setCookie };
}

export async function logout(request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token) await getPool().query('DELETE FROM sessions WHERE token_hash = ?', [tokenHash(token)]);
  return cookieHeader(request, '', 0);
}

export async function listUsers() {
  const [rows] = await getPool().query(
    `SELECT id, username, display_name AS displayName, role, active,
            DATE_FORMAT(last_login_at, '%Y-%m-%d %H:%i') AS lastLoginAt,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS createdAt,
            (SELECT COUNT(*) FROM sessions s
              WHERE s.user_id = users.id AND s.expires_at > CURRENT_TIMESTAMP(3)) AS sessionCount
       FROM users ORDER BY (role = 'admin') DESC, display_name, username`,
  );
  return rows.map(row => ({ ...row, active: Boolean(row.active), sessionCount: Number(row.sessionCount || 0) }));
}

export async function listLoginRecords(limit = 200) {
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200));
  const [rows] = await getPool().query(
    `SELECT lr.id, lr.user_id AS userId, lr.username,
            COALESCE(u.display_name, '') AS displayName,
            lr.success, lr.ip_address AS ipAddress, lr.user_agent AS userAgent,
            DATE_FORMAT(lr.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
       FROM login_records lr
       LEFT JOIN users u ON u.id = lr.user_id
      ORDER BY lr.created_at DESC
      LIMIT ?`,
    [safeLimit],
  );
  return rows.map(row => ({ ...row, success: Boolean(row.success) }));
}

export async function forceLogoutUser(userId) {
  const [users] = await getPool().query('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!users.length) throw new AuthError('사용자를 찾을 수 없습니다.', 404);
  const [result] = await getPool().query('DELETE FROM sessions WHERE user_id = ?', [userId]);
  return Number(result.affectedRows || 0);
}

export async function createUser(input) {
  const username = normalizeUsername(input.username);
  const displayName = String(input.displayName || '').trim();
  const role = VALID_ROLES.has(input.role) ? input.role : 'leader';
  if (!USERNAME_PATTERN.test(username)) throw new AuthError('아이디 형식을 확인해 주세요.', 400);
  if (!displayName || displayName.length > 100) throw new AuthError('표시 이름을 입력해 주세요.', 400);
  const id = randomUUID();
  try {
    await getPool().query(
      `INSERT INTO users (id, username, display_name, password_hash, role)
       VALUES (?, ?, ?, ?, ?)`,
      [id, username, displayName, await hashPassword(input.password), role],
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new AuthError('이미 사용 중인 아이디입니다.', 409);
    throw error;
  }
  return (await listUsers()).find(user => user.id === id);
}

export async function updateUser(actor, input) {
  const id = String(input.id || '');
  const [rows] = await getPool().query('SELECT id, role, active FROM users WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw new AuthError('사용자를 찾을 수 없습니다.', 404);
  const current = rows[0];
  const displayName = String(input.displayName || '').trim();
  const role = VALID_ROLES.has(input.role) ? input.role : current.role;
  const active = input.active !== false;
  if (!displayName || displayName.length > 100) throw new AuthError('표시 이름을 입력해 주세요.', 400);
  if (actor.id === id && (!active || role !== 'admin')) throw new AuthError('자신의 관리자 권한이나 활성 상태는 변경할 수 없습니다.', 400);

  if (current.role === 'admin' && (role !== 'admin' || !active)) {
    const [[adminCount]] = await getPool().query(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1`);
    if (Number(adminCount.count) <= 1) throw new AuthError('마지막 관리자는 비활성화할 수 없습니다.', 400);
  }

  const passwordHash = input.password ? await hashPassword(input.password) : null;
  await withTransaction(async connection => {
    await connection.query(
      `UPDATE users SET display_name = ?, role = ?, active = ?,
         password_hash = COALESCE(?, password_hash) WHERE id = ?`,
      [displayName, role, active ? 1 : 0, passwordHash, id],
    );
    if (!active || passwordHash) await connection.query('DELETE FROM sessions WHERE user_id = ?', [id]);
  });
  return (await listUsers()).find(user => user.id === id);
}

export async function updateOwnProfile(actor, input) {
  const displayName = String(input.displayName || '').trim();
  if (!displayName || displayName.length > 100) {
    throw new AuthError('표시 이름을 입력해 주세요.', 400);
  }
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  await withTransaction(async connection => {
    await connection.query(
      `UPDATE users
          SET display_name = ?, password_hash = COALESCE(?, password_hash)
        WHERE id = ?`,
      [displayName, passwordHash, actor.id],
    );
    if (passwordHash) {
      await connection.query('DELETE FROM sessions WHERE user_id = ?', [actor.id]);
    }
  });
  return {
    user: { ...actor, displayName },
    passwordChanged: Boolean(passwordHash),
  };
}

export async function deleteUser(actor, id) {
  if (actor.id === id) throw new AuthError('현재 로그인한 계정은 삭제할 수 없습니다.', 400);
  const [rows] = await getPool().query('SELECT role, active FROM users WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) return false;
  if (rows[0].role === 'admin' && rows[0].active) {
    const [[adminCount]] = await getPool().query(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1`);
    if (Number(adminCount.count) <= 1) throw new AuthError('마지막 관리자는 삭제할 수 없습니다.', 400);
  }
  const [result] = await getPool().query('DELETE FROM users WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

export function authErrorResponse(error, fallback = '요청을 처리하지 못했어요.') {
  // 혼잡으로 되돌려보낸 요청은 서버 오류가 아니다. 로그를 남기지 않고 429 로 알린다.
  if (error instanceof LoginBusyError) {
    return Response.json({ message: error.message }, {
      status: error.status,
      headers: { 'Retry-After': '5' },
    });
  }
  if (error instanceof LoginRateLimitError) {
    return Response.json({ message: error.message }, {
      status: error.status,
      headers: { 'Retry-After': String(error.retryAfter) },
    });
  }
  const status = error instanceof AuthError ? error.status : 500;
  if (status === 500) console.error(fallback, error);
  return Response.json({ message: status === 500 ? fallback : error.message }, { status });
}
