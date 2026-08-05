import { authErrorResponse, requireUser } from '../../../src/server/auth.js';
import {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  SHARE_ROLES,
} from '../../../src/server/shares.js';

export async function GET(request) {
  const contiId = new URL(request.url).searchParams.get('contiId');
  if (!contiId) return Response.json({ message: '콘티 ID가 필요합니다.' }, { status: 400 });
  try {
    const actor = await requireUser(request, SHARE_ROLES);
    return Response.json({ links: await listShareLinks(actor, contiId) });
  } catch (error) {
    return authErrorResponse(error, '공유 링크 목록을 불러오지 못했어요.');
  }
}

export async function POST(request) {
  try {
    const actor = await requireUser(request, SHARE_ROLES);
    const input = await request.json();
    const share = await createShareLink(actor, String(input.contiId || ''), input.expiresAt);
    const origin = new URL(request.url).origin;
    return Response.json({
      share,
      url: `${origin}/share?token=${encodeURIComponent(share.token)}`,
    }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error, '공유 링크를 만들지 못했어요.');
  }
}

export async function DELETE(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ message: '공유 링크 ID가 필요합니다.' }, { status: 400 });
  try {
    // 발급 뒤 역할이 낮아져도 본인이 만든 링크는 직접 폐기할 수 있어야 한다.
    const actor = await requireUser(request);
    await revokeShareLink(actor, id);
    return Response.json({ revoked: true });
  } catch (error) {
    return authErrorResponse(error, '공유 링크를 폐기하지 못했어요.');
  }
}
