// The Calculator's interface adapter (site/ui.mjs), held to its pure contract without a DOM.
// Ported from the Site's tests/ui.test.mjs (APS-Conecta/aps-conecta-web) when the
// interface moved here — ADR-0002 — plus the listing helpers added with the move.
// ui.mjs guards its auto-start for node, so this suite imports the REAL module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretar, buscar, resolver } from '../motor.mjs';
import { DATOS } from '../ecicep-codigos.mjs';
import {
  partirEntrada, planAgregar, escDe, codigosPorCondicion, codigosQueResuelven, filtrarListado,
} from '../site/ui.mjs';

const FILAS = codigosPorCondicion();

test('the listing fixture is not empty', () => {
  assert.equal(FILAS.length, 52);
});

test('partirEntrada: split, trim, drop empties', () => {
  assert.deepEqual(partirEntrada('E11, hipertensión , ,N18.4,'), ['E11', 'hipertensión', 'N18.4']);
  assert.deepEqual(partirEntrada('  '), []);
  assert.deepEqual(partirEntrada('solo'), ['solo']);
});

test('planAgregar: unambiguous submission adds everything', () => {
  const { inmediatas, pendiente } = planAgregar('E11, I10', interpretar);
  assert.deepEqual(inmediatas, ['E11', 'I10']);
  assert.equal(pendiente, null);
});

test('planAgregar: the ambiguous part stops the plan — and nothing typed is lost', () => {
  const { inmediatas, pendiente } = planAgregar('E11, renal, I10', interpretar);
  assert.deepEqual(inmediatas, ['E11']);
  assert.equal(pendiente, 'renal');
  assert.ok(!inmediatas.includes('I10'));
});

test('planAgregar: ambiguity-first — the FIRST ambiguous part wins even mid-string', () => {
  const { pendiente } = planAgregar('E11, hipertensión, renal', interpretar);
  assert.equal(pendiente, 'renal');
});

test('planAgregar: a wholly ambiguous submission adds nothing and keeps the input', () => {
  const { inmediatas, pendiente } = planAgregar('renal', interpretar);
  assert.deepEqual(inmediatas, []);
  assert.equal(pendiente, 'renal');
});

test('esc: typed clinical text cannot become markup or break an attribute', () => {
  for (const p of ['<img src=x onerror=alert(1)>', '" onmouseover="alert(1)', 'a&b<c>d"e']) {
    const out = escDe(p);
    assert.ok(!/[<"]/.test(out), `esc left a dangerous char in ${JSON.stringify(out)}`);
    assert.ok(!`<span title="${out}"></span>`.includes('" on'), 'escaped text broke out of the attribute');
  }
  assert.equal(escDe('Diabetes mellitus'), 'Diabetes mellitus');
});

test('motor agrees: an exact code is unambiguous, the ambiguous name is not', () => {
  assert.notEqual(interpretar('E11').tipo, 'ambiguo');
  assert.equal(interpretar('renal').tipo, 'ambiguo');
  assert.ok(buscar('renal').length > 1, 'renal matches more than one pathology');
});

test('the listing carries every code and range rule exactly once', () => {
  const total = FILAS.reduce((t, f) => t + f.todos.length, 0);
  assert.equal(total, DATOS.codigos.length + DATOS.reglas.length);
});

test('a condition is SHOWN only with codes that resolve to it (the N18 display defect)', () => {
  // N18 alone resolves to ERC (21, 1 pt). The Site printed it beside ERC avanzada (22, 2 pts).
  assert.equal(resolver('N18').condicion, 21);
  const avanzada = FILAS.find((f) => f.n === 22);
  assert.deepEqual(avanzada.visibles, ['N18.4', 'N18.5', 'N18.6']);
  assert.deepEqual(FILAS.find((f) => f.n === 21).visibles, ['N15', 'N18', 'N19']);
  // Z71/Z72 resolve to alcohol (1) by first match, so Tabaquismo (2) does not claim them.
  assert.deepEqual(FILAS.find((f) => f.n === 2).visibles, ['F17', 'T65']);
});

test('every shown code resolves to the condition it is shown under', () => {
  for (const f of FILAS) {
    assert.ok(f.visibles.length > 0, `condition ${f.n} shows no code`);
    for (const c of f.visibles) {
      if (c.includes('-')) continue; // range rule
      assert.equal(resolver(c)?.condicion, f.n, `${c} shown under ${f.n} resolves elsewhere`);
    }
  }
  assert.deepEqual(codigosQueResuelven(22, ['N18']), []);
});

test('a code listed under a condition it does not count for says which one it counts as', () => {
  const n18 = FILAS.find((f) => f.n === 22).todos.find((c) => c.codigo === 'N18');
  assert.equal(n18.otra, 'Enfermedad renal crónica');
  const n184 = FILAS.find((f) => f.n === 22).todos.find((c) => c.codigo === 'N18.4');
  assert.equal(n184.otra, null);
});

test('filtrarListado: by name, by code prefix, by CIE-10 title', () => {
  assert.equal(filtrarListado(FILAS, '').length, 52);
  const renal = filtrarListado(FILAS, 'renal').map((r) => r.fila.n);
  assert.ok(renal.includes(21) && renal.includes(22));
  const e11 = filtrarListado(FILAS, 'e11');
  assert.deepEqual(e11.map((r) => r.fila.n), [14]);
  assert.ok(e11[0].aciertos.has('E11') && e11[0].aciertos.has('E11.9'));
  const insulino = filtrarListado(FILAS, 'insulino');
  assert.deepEqual(insulino.map((r) => r.fila.n), [14]);
  assert.equal(insulino[0].porNombre, false);
  assert.equal(filtrarListado(FILAS, 'zzzz').length, 0);
});
