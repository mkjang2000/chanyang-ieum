import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';
import sharp from 'sharp';
import { test } from 'node:test';

// 별도 임시 MariaDB 소켓을 명시할 때만 실행. 일반 개발/운영 DB는 사용하지 않는다.
test('변경 요청 DB 통합: 동시 처리, 원본 보호, 권한, 이력 보존', { skip: !process.env.MUSE_CHANGE_TEST_SOCKET }, async t => {
  const socketPath = process.env.MUSE_CHANGE_TEST_SOCKET;
  assert.ok(socketPath.startsWith('/tmp/'));
  const database = `muse_change_test_${randomUUID().replaceAll('-', '')}`;
  const storage = await mkdtemp(path.join(tmpdir(), 'muse-change-images-'));
  const setup = await mysql.createConnection({ socketPath, user: 'root', multipleStatements: true });
  let pool;
  try {
    await setup.query(`CREATE DATABASE ${database}`);
    await setup.query(`USE ${database}`);
    const schema = await readFile(new URL('../../../database/schema.sql', import.meta.url), 'utf8');
    await setup.query(schema);
    await setup.query(schema);
    await setup.query("CREATE USER IF NOT EXISTS 'muse_change_test'@'localhost' IDENTIFIED BY 'temporary-test-only'");
    await setup.query(`GRANT ALL ON ${database}.* TO 'muse_change_test'@'localhost'`);
    Object.assign(process.env, { DB_SOCKET: socketPath, DB_USER: 'muse_change_test', DB_PASSWORD: 'temporary-test-only', DB_NAME: database, IMAGE_STORAGE_DIR: storage });
    const db = await import('../db.js'); pool = db.getPool();
    const { createChangeRequest, listChangeRequests, reviewChangeRequest } = await import('../changeRequests.js');
    const { saveConti, listContis, updateContiItemCue } = await import('../repository.js');
    const { runOrphanCleanup } = await import('../maintenance.js');
    const leader = { id: randomUUID(), role: 'leader', displayName: '테스트 인도자' };
    const player = { id: randomUUID(), role: 'accompanist', displayName: '테스트 반주자' };
    const other = { id: randomUUID(), role: 'accompanist', displayName: '다른 반주자' };
    const admin = { id: randomUUID(), role: 'admin', displayName: '테스트 관리자' };
    for (const user of [leader, player, other, admin]) await pool.query('INSERT INTO users (id, username, display_name, password_hash, role) VALUES (?, ?, ?, ?, ?)', [user.id, user.id, user.displayName, 'unused', user.role]);
    const png = async color => `data:image/png;base64,${(await sharp({ create: { width: 40, height: 60, channels: 3, background: color } }).png().toBuffer()).toString('base64')}`;
    const conti = await saveConti({ id: 'test-conti', title: '테스트 콘티', date: '2026-09-27', mode: 'regular', serviceType: 'sunday-morning', pages: [{ id: 'test-item', title: '테스트 곡', key: 'G', image: await png('white'), memo: '유지할 메모', startInstrument: 'piano', transitionMode: 'continue', bpm: 120, timeSignature: '4/4' }] }, leader);
    const original = conti.pages[0];
    await t.test('BPM과 박자 저장, 공유 조회, 부분 진행 설정에서 보존', async () => {
      const { getContiForExport } = await import('../exports.js');
      const { loadCueSnapshot } = await import('../realtime.js');
      assert.equal(original.bpm, 120);
      assert.equal(original.timeSignature, '4/4');
      const cue = await updateContiItemCue(conti.id, original.id, { startInstrument: 'piano', transitionMode: 'continue' });
      assert.equal(cue.bpm, 120);
      assert.equal(cue.timeSignature, '4/4');
      const changed = await updateContiItemCue(conti.id, original.id, { startInstrument: 'piano', transitionMode: 'continue', bpm: 132, timeSignature: '6/8' });
      assert.equal(changed.bpm, 132);
      assert.equal((await getContiForExport(conti.id)).pages[0].timeSignature, '6/8');
      assert.equal((await loadCueSnapshot(conti.id))[0].bpm, 132);
      await assert.rejects(() => updateContiItemCue(conti.id, original.id, { bpm: 0 }), error => error.status === 400);
      await updateContiItemCue(conti.id, original.id, { startInstrument: 'piano', transitionMode: 'continue', bpm: 120, timeSignature: '4/4' });
    });
    const input = { contiId: conti.id, itemId: original.id, title: original.title, beforeImageId: original.imageId, beforeKey: original.key, beforeContiKey: original.contiKey, image: await png('yellow'), key: 'A', reason: '편곡 변경' };
    const state = async () => (await listContis())[0].pages[0];
    const fail = (fn, status) => assert.rejects(fn, error => error.status === status);
    let pending;
    await t.test('동일 곡 중복 요청은 동시에 보내도 한 건만 등록', async () => {
      const results = await Promise.allSettled([createChangeRequest(input, player), createChangeRequest(input, player)]);
      assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
      assert.equal(results.find(row => row.status === 'rejected').reason.status, 409);
      pending = (await listChangeRequests(conti.id, player))[0];
      assert.equal((await state()).imageId, original.imageId);
      assert.equal((await state()).key, 'G');
      assert.equal((await listChangeRequests(conti.id, other)).length, 0);
    });
    await t.test('반주자 승인, 타인의 취소, 다른 인도자 조회 차단', async () => {
      await fail(() => reviewChangeRequest({ contiId: conti.id, id: pending.id, action: 'approve' }, player), 403);
      await fail(() => reviewChangeRequest({ contiId: conti.id, id: pending.id, action: 'cancel' }, other), 403);
      await fail(() => listChangeRequests(conti.id, { ...other, role: 'leader' }), 403);
    });
    await t.test('메모와 진행정보를 보존하며 Key와 이미지만 승인 반영', async () => {
      await reviewChangeRequest({ contiId: conti.id, id: pending.id, action: 'approve' }, leader);
      const page = await state();
      assert.equal(page.imageId, pending.proposedImageId); assert.equal(page.key, 'A');
      assert.equal(page.memo, original.memo); assert.equal(page.startInstrument, 'piano'); assert.equal(page.transitionMode, 'continue');
      assert.equal(page.bpm, 120); assert.equal(page.timeSignature, '4/4');
      await fail(() => reviewChangeRequest({ contiId: conti.id, id: pending.id, action: 'reject' }, leader), 409);
      const [rows] = await pool.query('SELECT key_name FROM images WHERE id = ?', [original.imageId]);
      assert.equal(rows[0].key_name, 'G');
    });
    const currentInput = async key => {
      const page = await state();
      return { ...input, beforeImageId: page.imageId, beforeKey: page.key, beforeContiKey: page.contiKey, imageId: page.imageId, key };
    };
    await t.test('반려 사유 보존과 본인 취소, 원본 유지', async () => {
      const created = await createChangeRequest(await currentInput('B'), player);
      await reviewChangeRequest({ contiId: conti.id, id: created.id, action: 'reject', reviewReason: '기존 편곡으로 진행합니다.' }, admin);
      const rejected = (await listChangeRequests(conti.id, player)).find(row => row.id === created.id);
      assert.equal(rejected.reviewReason, '기존 편곡으로 진행합니다.');
      assert.equal(rejected.reviewerName, admin.displayName);
      const cancel = await createChangeRequest(await currentInput('C'), player);
      await reviewChangeRequest({ contiId: conti.id, id: cancel.id, action: 'cancel' }, player);
      assert.equal((await state()).key, 'A');
    });
    await t.test('같은 원본에 대한 두 승인은 한 건만 반영', async () => {
      const a = await createChangeRequest(await currentInput('D'), player);
      const b = await createChangeRequest(await currentInput('E'), other);
      const results = await Promise.allSettled([a, b].map(({ id }) => reviewChangeRequest({ contiId: conti.id, id, action: 'approve' }, leader)));
      assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
      assert.equal(results.find(row => row.status === 'rejected').reason.status, 409);
      const stale = (await listChangeRequests(conti.id, leader)).find(row => row.status === 'pending');
      assert.equal(stale.stale, true);
      await reviewChangeRequest({ contiId: conti.id, id: stale.id, action: 'reject' }, leader);
    });
    await t.test('기존 콘티 저장과 곡 삭제 이후에도 이력 이미지 보존', async () => {
      const pendingDelete = await createChangeRequest(await currentInput('F'), player);
      await saveConti({ ...conti, pages: [{ ...await state(), id: 'replacement-item', image: await png('blue'), imageId: null }] }, leader);
      await fail(() => reviewChangeRequest({ contiId: conti.id, id: pendingDelete.id, action: 'approve' }, leader), 409);
      await reviewChangeRequest({ contiId: conti.id, id: pendingDelete.id, action: 'reject' }, leader);
      await runOrphanCleanup({ force: true });
      const history = await listChangeRequests(conti.id, leader);
      assert.ok(history.length >= 6);
      const [images] = await pool.query('SELECT id FROM images WHERE id IN (?, ?)', [pending.beforeImageId, pending.proposedImageId]);
      assert.equal(images.length, 2);
    });
  } finally {
    if (pool) await pool.end();
    await setup.query(`DROP DATABASE IF EXISTS ${database}`);
    await setup.end();
    await rm(storage, { recursive: true, force: true });
  }
});
