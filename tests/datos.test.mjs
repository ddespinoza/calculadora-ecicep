import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DATOS } from '../ecicep-codigos.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

/*
 * Conteo de codigos por condicion segun la pestana ÍNDICE de la planilla
 * «Calculadora ECICEP», leida el 2026-08-25. Es la referencia externa: si el
 * CSV se regenera y estos numeros cambian, algo se movio en el Anexo 4.
 */
const INDICE_PLANILLA = {
  1: 18, 2: 17, 3: 90, 4: 79, 5: 9, 6: 15, 7: 39, 8: 6, 9: 27, 10: 9,
  11: 20, 12: 6, 13: 2, 14: 55, 15: 51, 16: 10, 17: 26, 18: 8, 19: 40, 20: 16,
  21: 11, 22: 4, 23: 39, 24: 19, 25: 10, 26: 1, 27: 22, 28: 7, 29: 19, 30: 12,
  31: 7, 32: 12, 33: 1, 34: 23, 35: 19, 36: 4, 37: 9, 38: 2, 39: 14, 40: 6,
  41: 6, 42: 24, 43: 17, 44: 19,
};

test('la referencia del ÍNDICE no esta vacia', () => {
  assert.ok(Object.keys(INDICE_PLANILLA).length >= 44);
});

test('el listado tiene 52 condiciones y 1003 filas de codigo', () => {
  assert.equal(Object.keys(DATOS.condiciones).length, 52);
  assert.equal(DATOS.codigos.length + DATOS.reglas.length, 1003);
});

test('solo ocho condiciones tienen doble ponderacion, y son las del Marco Operativo', () => {
  const dobles = Object.entries(DATOS.condiciones)
    .filter(([, c]) => c.puntaje === 2).map(([n]) => Number(n)).sort((a, b) => a - b);
  assert.deepEqual(dobles, [11, 13, 14, 17, 22, 23, 27, 29]);
});

test('todo puntaje es 1 o 2', () => {
  for (const [n, c] of Object.entries(DATOS.condiciones)) {
    assert.ok(c.puntaje === 1 || c.puntaje === 2, `condicion ${n} tiene puntaje ${c.puntaje}`);
  }
});

test('el conteo de codigos por condicion coincide con el ÍNDICE de la planilla', () => {
  const conteo = {};
  for (const [, n] of DATOS.codigos) conteo[n] = (conteo[n] ?? 0) + 1;
  for (const [, , n] of DATOS.reglas) conteo[n] = (conteo[n] ?? 0) + 1;
  for (const [n, esperado] of Object.entries(INDICE_PLANILLA)) {
    assert.equal(conteo[n], esperado, `condicion ${n}: ${conteo[n]} codigos, la planilla dice ${esperado}`);
  }
});

test('N18 se reparte entre ERC (1) y ERC avanzada (2) por subcodigo', () => {
  const n18 = DATOS.codigos.filter(([c]) => c.startsWith('N18'));
  assert.ok(n18.length > 0, 'no hay codigos N18');
  assert.deepEqual(n18.filter(([, n]) => n === 21).map(([c]) => c).sort(),
    ['N18', 'N18.1', 'N18.2', 'N18.3', 'N18.9']);
  assert.deepEqual(n18.filter(([, n]) => n === 22).map(([c]) => c).sort(),
    ['N18', 'N18.4', 'N18.5', 'N18.6']);
});

test('el archivo generado corresponde al CSV (nadie lo edito a mano)', () => {
  execFileSync('node', [join(raiz, 'scripts/build-codigos.mjs'), '--check'], { cwd: raiz });
});
