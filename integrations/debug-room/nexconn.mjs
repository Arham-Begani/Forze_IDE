import { createHash, randomBytes, randomUUID } from 'node:crypto';

const regions = {
  'https://api.sg-light-api.com': 'SG',
  'https://api.us-light-api.com': 'NA',
  'https://api.sau-light-api.com': 'SA'
};

export async function credentials(config, userId, peerId, role, request = fetch) {
  const { NEXCONN_APP_KEY: appKey, NEXCONN_APP_SECRET: secret, NEXCONN_API_BASE: base } = config;
  if (!appKey || !secret || !Object.hasOwn(regions, base)) {
    throw new Error('Chat needs the server App Key, App Secret and regional API base. Reconnect after setup.');
  }
  const nonce = randomBytes(16).toString('hex');
  const timestamp = String(Date.now());
  const signature = createHash('sha1').update(secret + nonce + timestamp).digest('hex');
  const result = await request(base + '/v4/auth/access-token/issue', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(9000),
    headers: { 'Content-Type': 'application/json', 'App-Key': appKey, Nonce: nonce,
      Timestamp: timestamp, Signature: signature, 'X-Request-ID': randomUUID() },
    body: JSON.stringify({ userId, name: role === 'owner' ? 'Developer' : 'Teammate' })
  });
  if (!result.ok) throw new Error('Nexconn declined the token request (HTTP ' + result.status + ').');
  const { code, result: identity } = await result.json();
  if (code !== 0 || identity?.userId !== userId || !identity.accessToken) throw new Error('Nexconn could not issue this room identity.');
  return { appKey, area: regions[base], token: identity.accessToken, self: userId, peer: peerId };
}
