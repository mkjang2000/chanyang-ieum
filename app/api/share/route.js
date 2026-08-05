import { getSharedConti, shareErrorResponse } from '../../../src/server/shares.js';

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token');
  try {
    const { share, conti } = await getSharedConti(token, { touch: true });
    return Response.json({
      share: { expiresAt: share.expiresAt },
      conti: {
        ...conti,
        pages: conti.pages.map(page => ({
          ...page,
          image: `/api/share/image?token=${encodeURIComponent(token)}&id=${encodeURIComponent(page.imageId)}&variant=viewer`,
        })),
      },
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    return shareErrorResponse(error);
  }
}
