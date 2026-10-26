#!/usr/bin/env node
/** Build a Pages artifact from an explicit public-file allowlist. */
import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const publicFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'core.js',
  'assets/europe.svg',
  'assets/favicon.svg',
  'assets/map-projection.json',
  'data/atlas.json',
  'data/tunings.json',
  'data/source/belegorte.json',
  'data/source/komponisten.json',
  'data/source/modelle.json',
  'data/source/quellen.json',
  'data/source/zeitpunkte.json',
];

// Check the complete input before replacing a previously successful build.
const sizes = await Promise.all(publicFiles.map(async (relative) => {
  const info = await stat(path.join(root, relative));
  if (!info.isFile()) throw new Error(`Expected a file: ${relative}`);
  return info.size;
}));

await mkdir(output, { recursive: true });
// Keep the output directory itself in place so a running static preview can
// retain it as its working directory while this build replaces its contents.
for (const entry of await readdir(output)) await rm(path.join(output, entry), { recursive: true, force: true });
for (const relative of publicFiles) {
  const destination = path.join(output, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(root, relative), destination);
}
await writeFile(path.join(output, '.nojekyll'), '');

const kibibytes = (sizes.reduce((sum, size) => sum + size, 0) / 1024).toFixed(1);
console.log(`Built dist/: ${publicFiles.length} public files + .nojekyll (${kibibytes} KiB).`);
