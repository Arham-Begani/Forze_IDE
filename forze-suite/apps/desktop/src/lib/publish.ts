import { httpFetch } from './http';
import { invokeCommand } from './tauri';
import { useIntegrations } from '../workbench/integrationsStore';

/**
 * LinkedIn publishing for the Build in Public page's posts.
 *
 * Connecting runs the full "Log in with LinkedIn" OAuth flow in Rust
 * (`linkedin_login` opens the browser, captures the redirect, and exchanges the
 * code so the client secret never touches the webview). The resulting access
 * token is stored in the integrations store and used here to call the LinkedIn
 * REST API directly via `httpFetch` (which runs through the Tauri HTTP plugin,
 * so it dodges the webview's CORS/CSP).
 */

interface LinkedinSession {
  access_token: string;
  expires_in: number;
  refresh_token?: string | null;
  refresh_token_expires_in?: number | null;
}

function applySession(session: LinkedinSession): void {
  // Refresh a minute early to avoid posting with a token that expires mid-flight.
  const expiresAt = Date.now() + session.expires_in * 1000 - 60_000;
  useIntegrations.getState().setLinkedinSession({
    token: session.access_token,
    refreshToken: session.refresh_token ?? '',
    expiresAt,
  });
}

/** True when the LinkedIn app credentials (client id/secret) exist in `.env`. */
export async function linkedinConfigured(): Promise<boolean> {
  try {
    return await invokeCommand<boolean>('linkedin_configured');
  } catch {
    return false;
  }
}

/** True when we hold a LinkedIn access token that hasn't expired. */
export function linkedinConnected(): boolean {
  const { linkedinToken, linkedinExpiresAt } = useIntegrations.getState();
  if (!linkedinToken) return false;
  return linkedinExpiresAt === 0 || linkedinExpiresAt > Date.now();
}

/** Run the OAuth login flow and persist the session. */
export async function connectLinkedin(): Promise<void> {
  const session = await invokeCommand<LinkedinSession>('linkedin_login');
  applySession(session);
}

export function disconnectLinkedin(): void {
  useIntegrations.getState().clearLinkedin();
}

/** A valid access token, refreshing or erroring if the stored one is stale. */
async function freshToken(): Promise<string> {
  const s = useIntegrations.getState();
  if (!s.linkedinToken) throw new Error('Connect LinkedIn first.');
  if (s.linkedinExpiresAt !== 0 && s.linkedinExpiresAt <= Date.now()) {
    if (s.linkedinRefreshToken) {
      try {
        const session = await invokeCommand<LinkedinSession>('linkedin_refresh', {
          token: s.linkedinRefreshToken,
        });
        applySession(session);
        return useIntegrations.getState().linkedinToken;
      } catch {
        throw new Error('Your LinkedIn session expired. Please reconnect LinkedIn.');
      }
    }
    throw new Error('Your LinkedIn session expired. Please reconnect LinkedIn.');
  }
  return s.linkedinToken;
}

/** Resolve (and cache) the author URN required by the posts API. */
async function authorUrn(token: string): Promise<string> {
  const cached = useIntegrations.getState().linkedinUrn;
  if (cached) return cached;
  const res = await httpFetch('https://api.linkedin.com/v2/userinfo', {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LinkedIn couldn't identify your account (${res.status}). ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { sub?: string };
  if (!json.sub) throw new Error('LinkedIn did not return a member id for this token.');
  const urn = `urn:li:person:${json.sub}`;
  useIntegrations.getState().setLinkedinUrn(urn);
  return urn;
}

export interface PublishResult {
  url?: string;
}

/** Post `text` to the connected LinkedIn account. Throws on any failure. */
export async function postToLinkedin(text: string): Promise<PublishResult> {
  const body = text.trim();
  if (!body) throw new Error('Nothing to publish.');
  const token = await freshToken();
  const author = await authorUrn(token);

  const res = await httpFetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-restli-protocol-version': '2.0.0',
    },
    body: JSON.stringify({
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: body },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`LinkedIn rejected the post (${res.status}). ${errBody.slice(0, 240)}`);
  }
  const id = res.headers.get('x-restli-id') ?? ((await res.json()) as { id?: string }).id;
  return { url: id ? `https://www.linkedin.com/feed/update/${id}` : undefined };
}

/** LinkedIn's commentary character ceiling. */
export const LINKEDIN_LIMIT = 3000;
