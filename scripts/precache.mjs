// Genera lab/precache.json: la lista de archivos que el service worker guarda para usar el Lab sin conexión.
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function walk(dir, ext) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, ext) : ext.some((e) => name.endsWith(e)) ? [path] : [];
  });
}

export function precacheList() {
  const lab = join(ROOT, 'lab');
  const files = [
    ...['index.html', 'lab.css', 'manifest.webmanifest', 'icon.svg'].map((f) => join(lab, f)),
    ...walk(join(lab, 'js'), ['.js']),
    // alphaTab (copia local): módulos, fuente musical y soundfont para tocar sin conexión.
    ...walk(join(lab, 'vendor'), ['.mjs', '.woff2', '.woff', '.sf2']),
    ...walk(join(ROOT, 'src'), ['.js']),
  ];
  return files
    .map((f) => relative(lab, f).split(sep).join(posix.sep))
    .map((p) => (p.startsWith('..') ? p : `./${p}`))
    .sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const list = precacheList();
  writeFileSync(join(ROOT, 'lab', 'precache.json'), `${JSON.stringify(list, null, 2)}\n`);
  console.log(`lab/precache.json: ${list.length} archivos`);
}
