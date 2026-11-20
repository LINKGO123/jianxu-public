import { access, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const [publicDir, outDir] = process.argv.slice(2);
if (!publicDir || !outDir) throw new Error('Usage: node scripts/build-demo.mjs <demo-assets-dir> <new-build-dir>');
const root = fileURLToPath(new URL('../demo/', import.meta.url));
await access(resolve(publicDir, '_headers'));
const target = resolve(outDir);
await mkdir(dirname(target), { recursive: true });
await mkdir(target);
await build({ configFile: false, root, publicDir: resolve(publicDir), build: { outDir: target, emptyOutDir: false } });
