/* 악보 이미지에서 Key(조표) 를 읽어낸다.
 *
 * 방식: Audiveris(OMR) 로 조표를 직접 읽는다. 코드 텍스트를 통계로 추론하는 OCR 보다
 *       근거가 명확해 정확도가 크게 높다(실측 12/12 vs 2/12).
 *
 * Audiveris 는 이미지 크기에 양쪽 한계가 있다.
 *   - 오선 간격이 좁으면(대략 폭 1600px 미만) "too low interline" 으로 거부
 *   - 전체 2000만 픽셀을 넘으면 "Too large image" 로 거부
 * 그래서 넣기 전에 그 사이로 맞춘다. 원본 그대로면 12곡 중 8곡만 처리됐다.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, readdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const SHARP_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const FLAT_KEYS = { '-1': 'F', '-2': 'A#', '-3': 'D#', '-4': 'G#', '-5': 'C#', '-6': 'F#', '-7': 'B' };

const MIN_WIDTH = 1600;          // 오선 간격 확보를 위한 최소 폭
const MAX_PIXELS = 19_000_000;   // Audiveris 상한(2000만) 아래로 여유를 둔다
const TIMEOUT_MS = 120_000;      // 곡당 실측 3~33초. 넉넉히 잡되 무한대기는 막는다.

export function getAudiverisPath() {
  return process.env.AUDIVERIS_PATH || '';
}

export function isKeyDetectionAvailable() {
  const bin = getAudiverisPath();
  return Boolean(bin) && existsSync(bin);
}

/* MusicXML(.mxl) 은 zip 컨테이너다. 표준 unzip 으로 XML 을 꺼내 조표를 읽는다.
 *
 * 주의: <fifths> 가 없다고 곧바로 "조표 0개 = C장조" 로 단정하면 안 된다.
 * Audiveris 가 악보를 제대로 못 읽었을 때도 <fifths> 가 비어 있기 때문이다.
 * 실제로 A장조(#3) 악보를 C 로 잘못 저장하는 사고가 있었다.
 * 그래서 "자리표를 일관되게 읽었는가" 를 해석 성공의 조건으로 함께 본다.
 */
async function readKeyFromMxl(mxlPath) {
  const { stdout: listing } = await run('unzip', ['-Z1', mxlPath], { timeout: 15000 });
  const entries = listing.split('\n')
    .map(name => name.trim())
    .filter(name => name.endsWith('.xml') && !name.startsWith('META-INF'));

  for (const entry of entries) {
    const { stdout: xml } = await run('unzip', ['-p', mxlPath, entry], {
      timeout: 15000,
      maxBuffer: 32 * 1024 * 1024,
    });

    const fifths = xml.match(/<fifths>(-?\d+)<\/fifths>/);
    if (fifths) {
      const value = Number(fifths[1]);
      const key = value >= 0 ? SHARP_KEYS[value] : FLAT_KEYS[String(value)];
      if (key) return { key, fifths: value };
      continue;
    }

    // <fifths> 가 없는 경우: 진짜 C장조인지, 해석 실패인지 가려야 한다.
    const signs = [...xml.matchAll(/<sign>([A-G])<\/sign>/g)].map(m => m[1]);
    if (!signs.length) continue;
    // 자리표가 뒤죽박죽이면(G/F/C 혼재) 악보를 못 읽은 것이다. 대중 악보는 대개 G 로 통일된다.
    const uniqueSigns = new Set(signs);
    if (uniqueSigns.size > 1) continue;
    return { key: 'C', fifths: 0 };
  }
  return null;
}

/* Audiveris 가 받아들이는 크기로 맞춘다. */
async function normalize(sourcePath, workDir) {
  const target = path.join(workDir, 'in.png');
  const { stdout } = await run('identify', ['-format', '%w %h', sourcePath], { timeout: 15000 });
  const [width, height] = stdout.trim().split(/\s+/).map(Number);
  if (!width || !height) throw new Error('이미지 크기를 읽지 못했습니다.');

  const args = [sourcePath];
  if (width < MIN_WIDTH) {
    args.push('-resize', `${Math.round((MIN_WIDTH / width) * 100)}%`);
  } else if (width * height > MAX_PIXELS) {
    // '>' 를 붙여 축소만 하도록 한다. 없으면 작은 이미지까지 이 크기로 늘어난다.
    args.push('-resize', `${MAX_PIXELS}@>`);
  }
  args.push(target);
  await run('magick', args, { timeout: 60000 });
  return target;
}

/* Audiveris 는 CPU·메모리를 많이 쓴다. 두 개가 동시에 돌면 서로 느려지다가
   일부가 조표를 못 읽고 끝나는 일이 실제로 있었다(정상 15초짜리가 9초 만에 실패).
   그래서 프로세스 안에서는 순차 실행하고, 다른 프로세스와는 파일 락으로 겹치지 않게 한다. */
const LOCK_PATH = path.join(tmpdir(), 'muse-conti-omr.lock');
const LOCK_STALE_MS = 5 * 60_000;

let queueTail = Promise.resolve();
function runExclusive(task) {
  const result = queueTail.then(task, task);
  queueTail = result.then(() => {}, () => {});
  return result;
}

async function acquireLock() {
  for (let attempt = 0; attempt < 240; attempt += 1) {   // 최대 약 4분 대기
    try {
      await writeFile(LOCK_PATH, String(process.pid), { flag: 'wx' });
      return true;
    } catch {
      // 죽은 프로세스가 남긴 락은 걷어낸다.
      try {
        const info = await stat(LOCK_PATH);
        if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
          await rm(LOCK_PATH, { force: true });
          continue;
        }
      } catch { /* 그 사이 풀렸으면 다음 시도에서 잡힌다 */ }
      await new Promise(resolve => { setTimeout(resolve, 1000); });
    }
  }
  return false;
}

const releaseLock = () => rm(LOCK_PATH, { force: true }).catch(() => {});

/**
 * 악보 이미지에서 Key 를 읽는다.
 * @returns {Promise<{key: string, source: 'omr', fifths: number} | null>}
 */
export async function detectKey(imagePath) {
  return runExclusive(async () => {
    const locked = await acquireLock();
    if (!locked) throw new Error('다른 악보 분석이 끝나기를 기다리다 시간이 지났습니다.');
    try {
      return await detectKeyOnce(imagePath);
    } finally {
      await releaseLock();
    }
  });
}

async function detectKeyOnce(imagePath) {
  const bin = getAudiverisPath();
  if (!bin || !existsSync(bin)) return null;
  if (!existsSync(imagePath)) return null;

  const workDir = await mkdtemp(path.join(tmpdir(), 'muse-key-'));
  try {
    const input = await normalize(imagePath, workDir);
    const outDir = path.join(workDir, 'out');
    await run(bin, ['-batch', '-export', '-output', outDir, input], {
      timeout: TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    }).catch(error => {
      // Audiveris 는 일부 시트를 못 읽어도 0이 아닌 코드로 끝나는 경우가 있다.
      // 결과 파일이 생겼는지로 성패를 판단하므로 여기서는 삼킨다.
      if (!error?.killed) return;
      throw new Error('악보 분석이 시간 내에 끝나지 않았습니다.');
    });

    const files = await readdir(outDir).catch(() => []);
    for (const name of files.filter(f => f.endsWith('.mxl')).sort()) {
      const found = await readKeyFromMxl(path.join(outDir, name));
      if (found) return { ...found, source: 'omr' };
    }
    return null;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
