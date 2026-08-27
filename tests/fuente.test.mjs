/**
 * What ships, checked against the MINSAL document itself.
 *
 * tests/golden.fixture.json compares against the SPREADSHEET; this compares
 * against the PDF. The fixture was extracted from Anexo 4 with pdftotext — a
 * different route from the one that produces the CSV — so the cross-check is
 * worth something: a bad regeneration makes the two extractions disagree.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DATOS } from '../ecicep-codigos.mjs';
import { resolver } from '../motor.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const fuente = JSON.parse(readFileSync(join(raiz, 'tests/anexo4-fuente.fixture.json'), 'utf8'));

test('la fixture del documento no esta vacia', () => {
  assert.equal(fuente.condiciones.length, 52);
  assert.ok(fuente.condiciones.every((c) => c.codigos.length > 0));
});

test('los 52 puntajes coinciden con el Anexo 4', () => {
  for (const c of fuente.condiciones) {
    assert.equal(DATOS.condiciones[c.n]?.puntaje, c.puntaje,
      `condicion ${c.n}: el PDF dice ${c.puntaje}`);
  }
});

test('cada codigo impreso en el Anexo 4 resuelve a su condicion', () => {
  /* Three codes are printed under more than one condition in Anexo 4 itself
     (N18, Z71, Z72). The spreadsheet resolves them by first match, like a
     VLOOKUP, so for those we assert only that they land in ONE OF the conditions
     the document assigns them — not in a particular one. */
  const dueños = new Map();
  for (const c of fuente.condiciones) {
    for (const codigo of c.codigos) {
      if (!dueños.has(codigo)) dueños.set(codigo, []);
      dueños.get(codigo).push(c);
    }
  }
  const ambiguos = [...dueños].filter(([, cs]) => cs.length > 1).map(([c]) => c).sort();
  assert.deepEqual(ambiguos, ['N18', 'Z71', 'Z72'],
    'aparecio un codigo ambiguo nuevo en el documento: revisar antes de seguir');

  let comprobados = 0;
  for (const [codigo, condiciones] of dueños) {
    const r = resolver(codigo);
    assert.ok(r, `${codigo} no resuelve`);
    assert.ok(condiciones.some((c) => c.n === r.condicion),
      `${codigo} resolvio a ${r.condicion}, el PDF lo pone en ${condiciones.map((c) => c.n)}`);
    assert.ok(condiciones.some((c) => c.puntaje === r.puntaje),
      `${codigo} puntua ${r.puntaje}, el PDF dice ${condiciones.map((c) => c.puntaje)}`);
    comprobados += 1;
  }
  assert.ok(comprobados > 900, `solo se comprobaron ${comprobados} codigos`);
});

test('de los tres ambiguos, solo N18 cambia el puntaje', () => {
  // Z71 and Z72 score 1 under either condition, so order changes no result.
  // N18 does: 1 point as ERC, 2 as ERC avanzada.
  assert.equal(resolver('Z71').puntaje, 1);
  assert.equal(resolver('Z72').puntaje, 1);
  assert.equal(resolver('N18').condicion, 21);
  assert.equal(resolver('N18').puntaje, 1);
  assert.equal(resolver('N18.4').puntaje, 2);
});
