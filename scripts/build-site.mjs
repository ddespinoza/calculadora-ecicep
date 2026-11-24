#!/usr/bin/env node
/**
 * Assembles the Calculator for GitHub Pages:  site/ + the Engine  ->  _site/
 *
 * Not a bundler. It COPIES site/ — whose three engine modules are symlinks to the root — unchanged, and
 * stamps the release version into the two places that name it (index.html's footer and
 * cache-busting query, and sw.js's cache name). No byte of motor.mjs, ecicep-codigos.mjs or
 * ecicep-titulos.mjs is touched — the deployed engine is the committed one.
 *
 *   node scripts/build-site.mjs                  version from `git describe`, else "dev"
 *   node scripts/build-site.mjs --version v1.0.0
 *   node scripts/build-site.mjs --out /tmp/x     somewhere other than _site/
 *
 * Preview locally:  node scripts/build-site.mjs && python3 -m http.server -d _site 8000
 * (or serve site/ directly — the symlinks resolve — with no version stamped)
 */
import { cpSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : undefined;
};

let version = arg('--version');
if (!version) {
  try {
    version = execFileSync('git', ['describe', '--tags', '--always', '--dirty'], { cwd: raiz, encoding: 'utf8' }).trim();
  } catch { version = 'dev'; }
}
if (!/^[\w.+-]+$/.test(version)) throw new Error(`Versión no válida: ${version}`);

const salida = resolve(arg('--out') ?? join(raiz, '_site'));
rmSync(salida, { recursive: true, force: true });
mkdirSync(salida, { recursive: true });

/* site/ holds the three engine modules as relative SYMLINKS (site/motor.mjs -> ../motor.mjs),
   so ui.mjs imports them as siblings in the tests, in a local preview and on Pages alike.
   Here each becomes the real file, and the check below refuses anything else. */
cpSync(join(raiz, 'site'), salida, { recursive: true });
const MOTOR = ['motor.mjs', 'ecicep-codigos.mjs', 'ecicep-titulos.mjs'];
for (const f of MOTOR) {
  /* cpSync keeps nested symlinks even with `dereference`, so each link is replaced by the
     real file from the root by hand. rmSync first: copying onto the link would write
     THROUGH it, into the root file itself. */
  rmSync(join(salida, f), { force: true });
  cpSync(join(raiz, f), join(salida, f));
}
for (const f of MOTOR) {
  if (!lstatSync(join(salida, f)).isFile()) throw new Error(`${f} no llegó como archivo al sitio`);
  if (!readFileSync(join(salida, f)).equals(readFileSync(join(raiz, f)))) {
    throw new Error(`${f} del sitio no es idéntico al de la raíz — revise el enlace site/${f}`);
  }
}

for (const f of ['index.html', 'sw.js']) {
  const p = join(salida, f);
  const texto = readFileSync(p, 'utf8');
  if (!texto.includes('__VERSION__')) throw new Error(`${f} no tiene la marca __VERSION__`);
  writeFileSync(p, texto.replaceAll('__VERSION__', version));
}
/* Pages runs Jekyll unless told not to, and Jekyll drops files it does not expect. */
writeFileSync(join(salida, '.nojekyll'), '');

console.log(`sitio armado en ${salida} — versión ${version}, ${readdirSync(salida).length} archivos`);
