// The deployed Calculator: the titles module and the assembled Pages site.
// What ships to GitHub Pages must carry the committed engine byte for byte — the
// assembly copies and stamps a version, and decides nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATOS } from '../ecicep-codigos.mjs';
import { TITULOS } from '../ecicep-titulos.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the titles fixture is not empty', () => {
  assert.ok(Object.keys(TITULOS).length > 900);
});

test('every code and range rule has a CIE-10 title', () => {
  const sin = [
    ...DATOS.codigos.map(([c]) => c),
    ...DATOS.reglas.map(([d, h]) => `${d}-${h}`),
  ].filter((c) => !TITULOS[c]);
  assert.deepEqual(sin, []);
});

test('titles are the CSV\'s, spot-checked', () => {
  assert.equal(TITULOS['E11'], 'Diabetes mellitus no insulinodependiente');
  assert.equal(TITULOS['N18.4'], 'Enfermedad renal crónica, estadio 4');
});

test('the assembled site carries the engine unchanged and stamps the version everywhere', () => {
  const salida = mkdtempSync(join(tmpdir(), 'ecicep-sitio-'));
  try {
    execFileSync('node', [join(raiz, 'scripts/build-site.mjs'), '--version', 'v9.9.9-test', '--out', salida], { cwd: raiz });
    for (const f of ['motor.mjs', 'ecicep-codigos.mjs', 'ecicep-titulos.mjs']) {
      assert.ok(readFileSync(join(salida, f)).equals(readFileSync(join(raiz, f))), `${f} changed on the way to Pages`);
    }
    const index = readFileSync(join(salida, 'index.html'), 'utf8');
    const sw = readFileSync(join(salida, 'sw.js'), 'utf8');
    assert.ok(!index.includes('__VERSION__') && !sw.includes('__VERSION__'), 'an unstamped version marker shipped');
    assert.ok(index.includes('versión v9.9.9-test'));
    assert.ok(sw.includes("const VERSION = 'v9.9.9-test'"));
    // Everything the service worker precaches must exist, or install fails and offline never arrives.
    const precache = [...sw.matchAll(/'\.\/([^'?]*)'|`\.\/([^`?]*)\?/g)].map((m) => m[1] ?? m[2]).filter(Boolean);
    const presentes = new Set(readdirSync(salida));
    for (const f of precache) assert.ok(presentes.has(f), `sw.js precaches ${f}, which is not in the site`);
    assert.ok(presentes.has('.nojekyll'));
  } finally {
    rmSync(salida, { recursive: true, force: true });
  }
});
