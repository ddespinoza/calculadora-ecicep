import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolver, evaluar, GRUPOS, ETIQUETAS, DESCRIPCIONES, listado, buscar, ESTRATEGIAS, interpretar } from '../motor.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const oro = JSON.parse(readFileSync(join(raiz, 'tests/golden.fixture.json'), 'utf8'));

/* Anti-vacuity rule: an empty fixture would make everything below pass while checking nothing. */
test('la fixture no esta vacia', () => {
  assert.ok(oro.resolucion.length >= 10, `resolucion tiene ${oro.resolucion.length} casos`);
  assert.ok(oro.estratificacion.length >= 10, `estratificacion tiene ${oro.estratificacion.length} casos`);
  assert.ok(oro.no_resuelve.length >= 2, `no_resuelve tiene ${oro.no_resuelve.length} casos`);
});

test('resolucion: cada entrada cae en la condicion que registra la planilla', () => {
  for (const caso of oro.resolucion) {
    const r = resolver(caso.entrada);
    assert.ok(r, `"${caso.entrada}" no resolvio a ninguna condicion`);
    assert.equal(r.condicion, caso.condicion, `"${caso.entrada}" -> condicion`);
    assert.equal(r.patologia, caso.patologia, `"${caso.entrada}" -> patologia`);
    assert.equal(r.puntaje, caso.puntaje, `"${caso.entrada}" -> puntaje`);
  }
});

test('no_resuelve: un codigo fuera del listado devuelve null, nunca 0 puntos en silencio', () => {
  for (const caso of oro.no_resuelve) {
    assert.equal(resolver(caso.entrada), null, `"${caso.entrada}" deberia no resolver`);
  }
});

test('estratificacion: distintas, puntaje y grupo coinciden con la planilla', () => {
  for (const caso of oro.estratificacion) {
    const r = evaluar(caso.entradas);
    const etiqueta = JSON.stringify(caso.entradas);
    assert.equal(r.distintas, caso.distintas, `${etiqueta} -> distintas`);
    assert.equal(r.puntaje, caso.puntaje, `${etiqueta} -> puntaje`);
    assert.equal(r.grupo, caso.grupo, `${etiqueta} -> grupo`);
  }
});

test('estratificacion: repetidas y desconocidas se marcan, no se descartan', () => {
  for (const caso of oro.estratificacion) {
    const r = evaluar(caso.entradas);
    const repetidas = r.items.filter((i) => i.estado === 'repetida').map((i) => i.entrada);
    const desconocidas = r.items.filter((i) => i.estado === 'desconocida').map((i) => i.entrada);
    assert.deepEqual(repetidas, caso.repetidas ?? []);
    assert.deepEqual(desconocidas, caso.sin_resolver ?? []);
    assert.equal(r.items.length, caso.entradas.length, 'ninguna entrada puede desaparecer del detalle');
  }
});

test('los cortes son los de la planilla: 0 / 1 / 2-4 / 5+', () => {
  assert.equal(GRUPOS(0), 'G0');
  assert.equal(GRUPOS(1), 'G1');
  for (const p of [2, 3, 4]) assert.equal(GRUPOS(p), 'G2');
  for (const p of [5, 6, 20, 60]) assert.equal(GRUPOS(p), 'G3');
});

test('resolver es insensible a mayusculas y espacios', () => {
  for (const variante of ['e11', ' E11 ', 'E11']) {
    assert.equal(resolver(variante)?.condicion, 14, `"${variante}"`);
  }
});

test('cada grupo tiene etiqueta y descripcion', () => {
  for (const g of ['G0', 'G1', 'G2', 'G3']) {
    assert.ok(ETIQUETAS[g], `${g} sin etiqueta`);
    assert.ok(DESCRIPCIONES[g] && DESCRIPCIONES[g].length > 5, `${g} sin descripcion`);
  }
});

test('el listado de referencia trae las 52 condiciones con codigos visibles', () => {
  const filas = listado();
  assert.equal(filas.length, 52);
  for (const f of filas) {
    assert.ok(f.nombre.length > 2, `condicion ${f.n} sin nombre`);
    assert.ok(f.puntaje === 1 || f.puntaje === 2, `condicion ${f.n} con puntaje ${f.puntaje}`);
    assert.ok(f.codigos.length > 0, `condicion ${f.n} sin ningun codigo que mostrar`);
  }
  // 38 is defined by ranges, not by individual codes.
  assert.deepEqual(filas.find((f) => f.n === 38).codigos, ['C00-C97', 'D00-D48']);
  // 14 shows master codes, the way the spreadsheet's reference table writes them.
  assert.deepEqual(filas.find((f) => f.n === 14).codigos, ['E10', 'E11', 'E12', 'E13', 'E14']);
  // 13 has no master of its own, so it falls back to its subcodes.
  assert.deepEqual(filas.find((f) => f.n === 13).codigos, ['F33.2', 'F33.3']);
});

test('buscar() encuentra por nombre y por codigo', () => {
  assert.equal(buscar('hipertension')[0].n, 32);
  assert.equal(buscar('hipertensión')[0].n, 32);
  assert.equal(buscar('E11')[0].n, 14);
  assert.equal(buscar('N18.4')[0].n, 22);
  assert.equal(buscar('I10')[0].n, 32);
  // With no text it returns all 52 — that is what fills the dropdown.
  assert.equal(buscar('').length, 52);
  // Carries which code produced the hit, when the match was by code.
  assert.equal(buscar('E11')[0].coincide, 'E11');
  assert.equal(buscar('diabetes')[0].coincide, null);
  assert.deepEqual(buscar('zzzz'), []);
});

test('cada grupo tiene la estrategia que describe el documento', () => {
  for (const g of ['G0', 'G1', 'G2', 'G3']) {
    assert.ok(ESTRATEGIAS[g] && ESTRATEGIAS[g].length > 20, `${g} sin estrategia`);
  }
  assert.match(ESTRATEGIAS.G1, /automanejo/i);
  assert.match(ESTRATEGIAS.G3, /caso/i);
});

test('interpretar() se niega a adivinar cuando el texto es ambiguo', () => {
  // "renal" matches ERC (1 pt) and ERC avanzada (2 pts). Silently taking the first
  // changes the group at the G1/G2 boundary — that is what must not happen.
  const r = interpretar('renal');
  assert.equal(r.tipo, 'ambiguo');
  assert.equal(r.opciones.length, 2);
  assert.deepEqual(r.opciones.map((o) => o.n).sort((a, b) => a - b), [21, 22]);

  // Un código exacto nunca es ambiguo, aunque su nombre lo sea.
  assert.equal(interpretar('N18.4').tipo, 'ok');
  assert.equal(interpretar('N18.4').condicion, 22);
  assert.equal(interpretar('N18').tipo, 'ok');       // maestro: primera coincidencia, como la planilla
  assert.equal(interpretar('N18').condicion, 21);

  // Un nombre que sólo coincide con una sigue siendo directo.
  assert.equal(interpretar('diabetes').tipo, 'ok');
  assert.equal(interpretar('diabetes').condicion, 14);

  // Lo que no está en el listado se declara desconocido, no se ignora.
  assert.equal(interpretar('XYZ99').tipo, 'desconocido');
  assert.equal(interpretar('').tipo, 'vacio');
});
