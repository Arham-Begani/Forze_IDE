import { writeFile } from 'node:fs/promises';

try {
  const { page } = await import('./storefront.mjs');
  await writeFile(new URL('./index.html', import.meta.url), page);
  console.log('Published index.html');
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  console.error("ERR_MODULE_NOT_FOUND: Cannot find module './prcing.mjs'");
  console.error('Import location: storefront.mjs');
  process.exitCode = 1;
}
