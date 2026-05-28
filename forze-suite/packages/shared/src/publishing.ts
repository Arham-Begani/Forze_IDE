import { z } from 'zod';

/**
 * Trust-Delegated Social Publishing.
 *
 * The Tauri IDE never holds OAuth client secrets. Instead it authenticates
 * the founder via Supabase Auth and forwards the publish intent to the Forge
 * Next.js backend, which decrypts the platform credentials server-side.
 */

export const PlatformSchema = z.enum([
  'linkedin',
  'instagram',
  'youtube',
  'x',
  'threads',
  'tiktok',
  'reddit',
]);
export type Platform = z.infer<typeof PlatformSchema>;

/** Per-platform constraints applied before the broker fans out. */
const PLATFORM_CAPTION_LIMITS: Record<Platform, number> = {
  linkedin: 3_000,
  instagram: 2_200,
  youtube: 5_000,
  x: 280,
  threads: 500,
  tiktok: 2_200,
  reddit: 40_000,
};

const baseFields = {
  ventureId: z.string().uuid(),
  mediaUrls: z.array(z.string().url()).optional(),
};

export const IdealPublishPayloadSchema = z
  .object({
    ...baseFields,
    platform: PlatformSchema,
    caption: z.string().min(1),
    /** Reddit requires a subreddit; the broker rejects without one. */
    subreddit: z.string().min(2).max(40).optional(),
    /** Optional epoch ms for scheduling. Omitted = publish immediately. */
    scheduledFor: z.number().int().nonnegative().optional(),
  })
  .superRefine((payload, ctx) => {
    const limit = PLATFORM_CAPTION_LIMITS[payload.platform];
    if (payload.caption.length > limit) {
      ctx.addIssue({
        code: 'custom',
        message: `${payload.platform} caption exceeds ${limit} characters`,
        path: ['caption'],
      });
    }
    if (payload.platform === 'reddit' && !payload.subreddit) {
      ctx.addIssue({
        code: 'custom',
        message: 'Reddit posts require a target subreddit',
        path: ['subreddit'],
      });
    }
    if (
      (payload.platform === 'tiktok' || payload.platform === 'youtube') &&
      (!payload.mediaUrls || payload.mediaUrls.length === 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `${payload.platform} posts require at least one media URL`,
        path: ['mediaUrls'],
      });
    }
  });

export type IdealPublishPayload = z.infer<typeof IdealPublishPayloadSchema>;

export interface PublishResponse {
  success: boolean;
  postId?: string;
  error?: string;
}

export interface PublishContext {
  /** Base URL of the Forge Next.js backend, e.g. https://forge.app */
  appUrl: string;
  /** Supabase session JWT for the authenticated founder. */
  sessionToken: string;
  /** Optional fetch override — useful for tests and Tauri custom transports. */
  fetchImpl?: typeof fetch;
}

export async function publishPostFromIDE(
  context: PublishContext,
  payload: IdealPublishPayload,
): Promise<PublishResponse> {
  const parsed = IdealPublishPayloadSchema.parse(payload);
  const fetchImpl = context.fetchImpl ?? fetch;

  const response = await fetchImpl(
    `${context.appUrl.replace(/\/$/, '')}/api/ventures/${parsed.ventureId}/publish`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${context.sessionToken}`,
      },
      body: JSON.stringify(parsed),
    },
  );

  if (!response.ok) {
    let message = `Publish failed with HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // fall through with status-derived message
    }
    return { success: false, error: message };
  }

  return (await response.json()) as PublishResponse;
}

export function captionLimitFor(platform: Platform): number {
  return PLATFORM_CAPTION_LIMITS[platform];
}

export function platformLabel(platform: Platform): string {
  switch (platform) {
    case 'linkedin':
      return 'LinkedIn';
    case 'instagram':
      return 'Instagram';
    case 'youtube':
      return 'YouTube';
    case 'x':
      return 'X';
    case 'threads':
      return 'Threads';
    case 'tiktok':
      return 'TikTok';
    case 'reddit':
      return 'Reddit';
  }
}
