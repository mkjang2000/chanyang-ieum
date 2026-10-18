import { performance } from 'node:perf_hooks';
import { METRONOME_EPOCH } from '../../../src/metronome.js';

export const dynamic = 'force-dynamic';
// Public time only; no account or conti information. Avoid DB latency in clock probes.
export async function GET() {
  const receivedAt = performance.timeOrigin + performance.now();
  return Response.json({ receivedAt, sentAt: performance.timeOrigin + performance.now(), epoch: METRONOME_EPOCH }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'X-Accel-Buffering': 'no' },
  });
}
