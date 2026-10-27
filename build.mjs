import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(root, process.argv[2] || 'dist/index.html');
const [template, css, engine, app, art] = await Promise.all([
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'styles.css'), 'utf8'),
  readFile(resolve(root, 'engine.js'), 'utf8'),
  readFile(resolve(root, 'app.js'), 'utf8'),
  readFile(resolve(root, 'assets/hero-blocks.webp')),
]);
const script = engine.replace(/^export /gm, '') + '\n' + app.replace(/^import .*?;\s*/m, '');
const html = template
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>${css}</style>`)
  .replace('src="assets/hero-blocks.webp"', () => `src="data:image/webp;base64,${art.toString('base64')}"`)
  .replace('<script type="module" src="app.js"></script>', () => `<script type="module">${script.replace(/<\/script/gi, '<\\/script')}</script>`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html);
console.log(`Standalone page saved: ${output}`);
