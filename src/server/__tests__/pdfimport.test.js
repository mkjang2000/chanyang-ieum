/* PDF 악보에서 뽑아낸 텍스트로 곡 제목을 고르는 부분.
 *
 * 정규식 체인이 길어 한 줄만 바꿔도 엉뚱한 줄이 제목이 된다.
 * 실제 악보에서 자주 보이는 형태를 그대로 케이스로 둔다.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanLine, matchKnownSongTitle, titleCandidate } from '../pdfimport.js';

test('앞뒤 장식과 번호를 걷어낸다', () => {
  assert.equal(cleanLine('  주 은혜임을  '), '주 은혜임을');
  assert.equal(cleanLine('1. 주 은혜임을'), '주 은혜임을');
  assert.equal(cleanLine('||| 주 은혜임을 |||'), '주 은혜임을');
  assert.equal(cleanLine('주  은혜임을'), '주 은혜임을');
});

test('작사·작곡 표기 이후를 잘라낸다', () => {
  assert.equal(cleanLine('주 은혜임을 작사 홍길동'), '주 은혜임을');
  assert.equal(cleanLine('Amazing Grace Words & Music by John'), 'Amazing Grace');
});

test('제목 앞의 코드 표기를 걷어낸다', () => {
  assert.equal(cleanLine('Key C 주 은혜임을'), '주 은혜임을');
});

test('저작권 표기를 제목으로 고르지 않는다', () => {
  assert.equal(titleCandidate('CCLI 12345\n주 은혜임을\n작사 홍길동'), '주 은혜임을');
});

test('코드만 있는 줄을 제목으로 고르지 않는다', () => {
  assert.equal(titleCandidate('G  D  Em  C\n나의 반석되신 주\nVerse 1'), '나의 반석되신 주');
});

test('출처 URL 을 제목으로 고르지 않는다', () => {
  // cleanLine 이 콜론을 지운 뒤에 검사되므로 'https //...' 형태도 걸러야 한다.
  assert.equal(titleCandidate('https://example.com\n1\nAmazing Grace'), 'Amazing Grace');
  assert.equal(titleCandidate('http://blog.naver.com/abc\n주 은혜임을'), '주 은혜임을');
  assert.equal(titleCandidate('www.example.com\n주 은혜임을'), '주 은혜임을');
});

test('구간 표시를 제목으로 고르지 않는다', () => {
  for (const marker of ['Verse 1', 'Chorus', 'Bridge', 'Intro']) {
    assert.equal(titleCandidate(`${marker}\n주 은혜임을`), '주 은혜임을', marker);
  }
});

test('제목을 찾지 못하면 빈 문자열을 낸다', () => {
  assert.equal(titleCandidate(''), '');
  assert.equal(titleCandidate('\n\n'), '');
});

test('이미 등록된 곡 제목으로 맞춰 준다', () => {
  // 표기가 조금 달라도 기존 곡에 붙어야 곡이 둘로 갈라지지 않는다.
  assert.equal(matchKnownSongTitle('주은혜임을', ['주 은혜임을', '나의 반석되신 주']), '주 은혜임을');
});

test('비슷한 곡이 없으면 원래 값을 유지한다', () => {
  assert.equal(matchKnownSongTitle('전혀다른제목xyz', ['주 은혜임을']), '전혀다른제목xyz');
});
