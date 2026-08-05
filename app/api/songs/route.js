import { getSongDetails, listSongs } from '../../../src/server/repository.js';
import { authErrorResponse, requireUser } from '../../../src/server/auth.js';

export async function GET(request) {
  try {
    await requireUser(request);
    const id = new URL(request.url).searchParams.get('id');
    if (id) {
      const song = await getSongDetails(id);
      if (!song) return Response.json({ message: '찬양을 찾을 수 없습니다.' }, { status: 404 });
      return Response.json({ song });
    }
    return Response.json({ songs: await listSongs() });
  } catch (error) {
    return authErrorResponse(error, '찬양 라이브러리를 불러오지 못했어요.');
  }
}
