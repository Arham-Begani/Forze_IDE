import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { blobStore, fileStore } from './storage.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { approved, diagnostic } from './public/excerpt.mjs';
import { credentials } from './nexconn.mjs';
import { runSample } from './sample.mjs';

const root = new URL('./public/', import.meta.url);
const random = () => randomBytes(24).toString('base64url');
const hash = s => createHash('sha256').update(s).digest('hex');
const matches = (value, digest) => typeof value === 'string' && !!digest &&
  timingSafeEqual(Buffer.from(hash(value)), Buffer.from(digest));
const slug = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const states = ['ERROR', 'READY', 'CANCELED', 'BUILDING', 'QUEUED', 'INITIALIZING'];
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
async function payload(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'Use JSON for this action.');
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body) && !Buffer.isBuffer(req.body)) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > 8192) fail(413,'Excerpt too long.');
    return req.body;
  }
  let size = 0;
  const parts = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) fail(413, 'The selected excerpt is too long.');
    parts.push(chunk);
  }
  try { const body = JSON.parse(Buffer.concat(parts)); if (body && !Array.isArray(body) && typeof body === 'object') return body; }
  catch { /* Report a readable request error. */ }
  fail(400, 'Invalid request.');
}
const assets = new Map(Object.entries({
  '/app.mjs':'text/javascript', '/chat.mjs':'text/javascript', '/excerpt.mjs':'text/javascript',
  '/room.css':'text/css', '/vendor/nexconn.js':'text/javascript'
}));

export function createRoomHandler(config = process.env, issue = credentials) {
  const store = config.VERCEL || config.BLOB_READ_WRITE_TOKEN ? blobStore() : fileStore(config.ROOM_DATA_DIR);
  const initial = runSample(false);
  if (initial.state !== 'ERROR' || !initial.logs.some(l => l.includes('ERR_MODULE_NOT_FOUND'))) throw new Error('Expected the fixture to fail on its missing import.');
  const quotas = new Map();
  function limit(key, max) {
    const now = Date.now();
    let count = quotas.get(key);
    if (!count || count.until <= now) {
      for (const [k, v] of quotas) if (v.until <= now) quotas.delete(k);
      count = { n: 0, until: now + 600000 }; quotas.set(key, count);
    }
    if (++count.n > max) fail(429, 'Too many attempts. Try again in ten minutes.');
  }
  function cookie(res, room, value, secure) {
    res.setHeader('Set-Cookie','forze_seat=' + value + '; Path=/api/rooms/' + room.id +
      '; Max-Age=2592000; HttpOnly; SameSite=Strict' + (secure ? '; Secure' : ''));
  }
  return async (req, res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    const json = (status, value) => { res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify(value)); };
    try {
      const uri = new URL(req.url, 'http://localhost').pathname;
      const origin = config.PUBLIC_ORIGIN || ((config.VERCEL ? 'https://' : 'http://') + req.headers.host);
      const post = req.method === 'POST';
      if (post && req.headers.origin && req.headers.origin !== origin) fail(403,'This action must come from the room.');
      if (!post && req.method !== 'GET') fail(405,'Unsupported method.');
      const secure = origin.startsWith('https://');
      if (!post && (uri === '/' || /^\/r\/[A-Za-z0-9_-]+$/.test(uri))) {
        res.setHeader('Content-Type','text/html; charset=utf-8');
        res.end(readFileSync(new URL('index.html',root))); return;
      }
      if (!post && assets.has(uri)) {
        const file = new URL(uri.slice(1), root);
        if (!existsSync(file)) fail(503,'Build the Nexconn SDK bundle with npm run build.');
        res.setHeader('Content-Type',assets.get(uri)); res.end(readFileSync(file)); return;
      }
      if (!post && uri === '/api/sample') return json(200,{ name:'Orbit storefront', deployment:'sample-001', logs:initial.logs });
      if (post && uri === '/api/rooms') {
        const b = await payload(req);
        if (!approved(b.lines) || !['sample','ide'].includes(b.source)) fail(400,'Choose up to 12 shareable diagnostic lines.');
        if (b.source === 'ide' && (typeof b.name !== 'string' || !slug.test(b.name) || !/^dpl_[A-Za-z0-9]{1,54}$/.test(b.deployment))) fail(400,'Invalid Forze deployment.');
        if (b.source === 'sample' && b.lines.some(l => !initial.logs.some(raw => diagnostic(raw) === l))) fail(400,'Choose a line from the sample build.');
        limit('new-' + req.socket.remoteAddress, 50);
        const owner = random();
        const room = {id:randomBytes(12).toString('hex'), source:b.source,
          name:b.source === 'sample' ? 'Orbit storefront' : b.name, deployment:b.source === 'sample' ? 'sample-001' : b.deployment,
          lines:b.lines, ownerHash:hash(owner), guestHash:null, inviteHash:null, solution:null, rerun:null,
          ownerId:randomBytes(16).toString('hex'), guestId:randomBytes(16).toString('hex')};
        await store.save(room); cookie(res,room,owner,secure); return json(201,{id:room.id});
      }
      const route = /^\/api\/rooms\/([a-f0-9]{24})(?:\/(invite|join|chat|solution|sample-run|status|artifact))?$/.exec(uri);
      if (!route) fail(404,'This room could not be found. Ask the developer for a new invite.');
      // Read after request parsing so simultaneous writes see the latest room.
      const b = post ? await payload(req) : null;
      const room = await store.load(route[1]);
      if (!room) fail(404,'This room could not be found. Ask the developer for a new invite.');
      const seat = /(?:^|; )forze_seat=([A-Za-z0-9_-]{32})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const role = matches(seat,room.ownerHash) ? 'owner' : matches(seat,room.guestHash) ? 'guest' : null;
      const action = route[2];
      if (action === 'join' && post) {
        if (role) return json(200,{role});
        if (!matches(b.invite,room.inviteHash) || Date.now() > room.inviteUntil) fail(403,'This invite expired or was already used. Ask the developer for access.');
        const guest = random(); room.guestHash = hash(guest); room.inviteHash = null;
        await store.save(room); cookie(res,room,guest,secure); return json(200,{role:'guest'});
      }
      if (!role) fail(403,'Open the full invite link in the browser where you joined.');
      if (!post && !action) return json(200,{id:room.id,name:room.name,deployment:room.deployment,source:room.source,
        lines:room.lines,solution:room.solution,rerun:room.rerun,joined:!!room.guestHash,role});
      if (!post && action === 'artifact' && room.source === 'sample' && room.artifact) {
        res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(room.artifact); return;
      }
      if (!post) fail(405,'Use the room controls for this action.');
      if (action === 'chat') {
        limit('token-' + room.id + role,60);
        try { return json(200,await issue(config,role === 'owner' ? room.ownerId : room.guestId,
          role === 'owner' ? room.guestId : room.ownerId,role)); }
        catch (e) { fail(503, e.message.startsWith('Chat needs') ? e.message : 'Chat could not connect to Nexconn. Check the server settings and reconnect.'); }
      }
      if (role !== 'owner') fail(403,'Only the developer can change this room.');
      if (action === 'invite') {
        if (room.guestHash) fail(409,'A teammate already joined this two-person room.');
        const invite = random(); room.inviteHash = hash(invite); room.inviteUntil = Date.now()+86400000;
        await store.save(room); return json(200,{invite});
      }
      if (action === 'solution') {
        if (!room.guestHash || !/^[\w.:+-]{1,160}$/.test(b.messageId || '') || b.sender !== room.guestId ||
            typeof b.text !== 'string' || !b.text.trim() || b.text.length > 2000) fail(400,'Choose a teammate reply in this room.');
        room.solution = {messageId:b.messageId,text:b.text,acceptedAt:new Date().toISOString()};
      } else if (action === 'sample-run' && room.source === 'sample') {
        if (!['./prcing.mjs','./pricing.mjs'].includes(b.module)) fail(400,'Choose one of the sample imports.');
        limit('build-' + room.id,30);
        const run = runSample(b.module === './pricing.mjs');
        room.rerun = {id:'sample-' + String((room.rerun?.number || 1) + 1).padStart(3,'0'),
          number:(room.rerun?.number || 1) + 1,state:run.state, observedAt:new Date().toISOString()};
        room.artifact = run.artifact;
      } else if (action === 'status' && room.source === 'ide') {
        if (b.original !== room.deployment || !/^dpl_[a-zA-Z0-9]{1,54}$/.test(b.id) || b.id === b.original ||
            !states.includes(b.state) || !Number.isSafeInteger(b.observed) || b.observed > Date.now()+60000) fail(400,'Invalid deployment observation.');
        if (!room.rerun || b.observed >= Date.parse(room.rerun.observedAt)) room.rerun = { id:b.id, state:b.state, observedAt:new Date(b.observed).toISOString() };
      } else fail(404,'Unknown room action.');
      await store.save(room); return json(200,{ok:true});
    } catch (error) {
      json(error.status || 500,{error:error.status ? error.message : 'Room service unavailable. Try again.'});
    }
  };
}
export function createRoomServer(config, issue) { return createServer(createRoomHandler(config, issue)); }
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4174);
  createRoomServer().listen(port,process.env.HOST || '0.0.0.0',() => console.log('Forze Debug Rooms listening on port ' + port));
}
