import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// Stream the video binary for a specific preview
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;

  const preview = await prisma.videoPreview.findFirst({
    where: { id, userId: session.user.id },
    select: { videoData: true, mimeType: true },
  });

  if (!preview) return new Response('Not found', { status: 404 });

  return new Response(new Uint8Array(preview.videoData as Buffer), {
    headers: {
      'Content-Type': preview.mimeType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
