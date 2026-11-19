// Export only a small vocabulary of diagnostics. Raw lines never enter a room.
const localName = /^(?:\.{1,2}\/)?(?:[a-z][a-z0-9_-]{0,20}\/){0,3}[a-z][a-z0-9_.-]{0,28}$/i;
export function diagnostic(line) {
  const text = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
  if (/-----|secret|password|passwd|token|bearer|api.?key|private.?key|auth(?:orization)?\b|\.env\b|[A-Z][A-Z_0-9]+\s*=|https?:\/\/|\beyJ[\w-]+\.|[A-Za-z0-9_+-]{32,}/i.test(text)) return null;
  const path = text.match(/(?:cannot find module|can't resolve|could not resolve)\s+['"]([^'"]+)['"]/i)?.[1];
  if (path && localName.test(path)) return "Cannot find module '" + path + "'";
  const location = text.match(/^Import location: ([\w./-]+)$/);
  if (location && localName.test(location[1])) return 'Import location: ' + location[1];
  const exit = text.match(/(?:exited with (?:exit )?code|exit code)\s*[:=]?\s*(\d{1,3})\b/i);
  if (exit) return 'Build exited with code ' + Number(exit[1]);
  const ts = text.match(/\berror (TS\d{3,5})\b/i);
  if (ts) return 'TypeScript error ' + ts[1].toUpperCase();
  if (/^TypeScript error TS\d{3,5}$/.test(text)) return text;
  if (/\b(syntaxerror|syntax error)\b/i.test(text)) return 'Syntax error';
  if (/\b(typeerror|type error)\b/i.test(text)) return 'Type error';
  if (/\b(build failed|failed to compile)\b/i.test(text)) return 'Build failed';
  return null;
}
export function approved(lines) {
  return Array.isArray(lines) && lines.length > 0 && lines.length <= 12 &&
    lines.every(line => typeof line === 'string' && line.length < 150 && diagnostic(line) === line) &&
    lines.join('\n').length <= 1200;
}
