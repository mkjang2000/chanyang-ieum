import {
  authErrorResponse, createUser, deleteUser, listUsers, requireUser, updateUser,
} from '../../../../src/server/auth.js';

export async function GET(request) {
  try {
    await requireUser(request, ['admin']);
    return Response.json({ users: await listUsers() });
  } catch (error) {
    return authErrorResponse(error, '사용자 목록을 불러오지 못했어요.');
  }
}

export async function POST(request) {
  try {
    await requireUser(request, ['admin']);
    return Response.json(await createUser(await request.json()), { status: 201 });
  } catch (error) {
    return authErrorResponse(error, '사용자를 만들지 못했어요.');
  }
}

export async function PATCH(request) {
  try {
    const actor = await requireUser(request, ['admin']);
    return Response.json(await updateUser(actor, await request.json()));
  } catch (error) {
    return authErrorResponse(error, '사용자 정보를 수정하지 못했어요.');
  }
}

export async function DELETE(request) {
  try {
    const actor = await requireUser(request, ['admin']);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ message: '사용자 ID가 필요합니다.' }, { status: 400 });
    return Response.json({ deleted: await deleteUser(actor, id) });
  } catch (error) {
    return authErrorResponse(error, '사용자를 삭제하지 못했어요.');
  }
}
