/* 곡 제목 정규화.
 *
 * songs.normalized_title 의 UNIQUE 키가 이 값으로 만들어진다.
 * 규칙이 바뀌면 같은 곡이 둘로 갈라지거나 다른 곡이 합쳐지므로 값으로 고정한다.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeSongTitle } from '../db.js';

test('공백과 대소문자 차이를 흡수한다', () => {
  const expected = '주은혜임을';
  for (const value of ['주 은혜임을', '주  은혜임을', ' 주은혜임을 ', '주\t은혜임을']) {
    assert.equal(normalizeSongTitle(value), expected, JSON.stringify(value));
  }
  assert.equal(normalizeSongTitle('Amazing Grace'), 'amazinggrace');
  assert.equal(normalizeSongTitle('AMAZING grace'), 'amazinggrace');
});

test('구두점과 괄호를 제거한다', () => {
  const expected = '주은혜임을';
  for (const value of ['주 은혜임을!', '(주)은혜임을', '주 은혜임을.', '주-은혜임을', '주_은혜임을', '“주 은혜임을”']) {
    assert.equal(normalizeSongTitle(value), expected, JSON.stringify(value));
  }
});

test('서로 다른 곡은 다른 값으로 남는다', () => {
  assert.notEqual(normalizeSongTitle('주 은혜임을'), normalizeSongTitle('나의 반석되신 주'));
});

test('빈 값은 빈 문자열이 된다', () => {
  // upsertSong 이 이 값을 보고 곡 등록을 건너뛴다.
  for (const value of ['', '   ', '...', '()']) {
    assert.equal(normalizeSongTitle(value), '', JSON.stringify(value));
  }
});
