import { createRoomHandler } from '../server.mjs';

const handler = createRoomHandler(process.env);
export default function room(req, res) {
  const route = new URL(req.url, 'http://localhost').searchParams.get('route');
  if (route && /^\/api\/(?:rooms|sample)(?:\/|$)/.test(route)) req.url = route;
  return handler(req,res);
}
