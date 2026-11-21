import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const licenses = ['@nexconn/chat', '@nexconn/engine', 'path-browserify'].map(name => {
  const url = new URL('./LICENSE', import.meta.resolve(name));
  const text = readFileSync(url, 'utf8').trim().replaceAll('*/', '* /');
  return '/*! ' + name + '\n' + text + '\n*/';
});

await build({
  entryPoints: ['sdk-entry.mjs'],
  outfile: 'public/vendor/nexconn.js',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2020',
  // The official 26.2.1 engine ships Node-only protobuf branches in its ESM entry.
  alias: { path: 'path-browserify' },
  minify: true,
  legalComments: 'inline',
  banner: { js: licenses.join('\n') },
});
