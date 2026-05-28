import { NextResponse } from 'next/server';
import { IdealPublishPayloadSchema } from '@forze/shared/publishing';

interface RouteContext {
  params: { ventureId: string };
}

export async function POST(request: Request, { params }: RouteContext) {
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json({ success: false, error: 'Missing bearer token' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = IdealPublishPayloadSchema.safeParse({
    ...(body as Record<string, unknown>),
    ventureId: params.ventureId,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
      { status: 422 },
    );
  }

  // The real backend would decrypt platform credentials from Supabase Vault
  // and call the appropriate publishing utility from lib/marketing-publish.
  // The stub returns a deterministic id so end-to-end flows stay testable.
  return NextResponse.json({
    success: true,
    postId: `${parsed.data.platform}_${Date.now()}`,
  });
}
