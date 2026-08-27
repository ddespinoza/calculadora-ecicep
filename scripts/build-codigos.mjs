#!/usr/bin/env node
/**
 * datos/codigos_ecicep_estratificacion.csv  ->  ecicep-codigos.mjs
 *
 * The CSV is produced by `gen_enriquecido.py` from Marco Operativo ECICEP
 * 2025, Anexo 4, pp. 94-101. This script only normalises it for the browser: it
 * decides NO scores, corrects NO codes, reorders NOTHING.
 *
 * CSV row order is preserved because three codes appear under more than one
 * condition (N18, Z71, Z72) and the spreadsheet resolves by first match.
 *
 *   node scripts/build-codigos.mjs           writes the module
 *   node scripts/build-codigos.mjs --check   fails if the file on disk differs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEN = join(raiz, 'datos/codigos_ecicep_estratificacion.csv');
const DESTINO = join(raiz, 'ecicep-codigos.mjs');

/** Minimal CSV parser: double quotes, commas inside quotes, no embedded newlines. */
function filas(texto) {
  return texto.replace(/\r\n/g, '\n').trim().split('\n').map((linea) => {
    const celdas = [];
    let actual = '';
    let entreComillas = false;
    for (let i = 0; i < linea.length; i += 1) {
      const c = linea[i];
      if (c === '"') {
        if (entreComillas && linea[i + 1] === '"') { actual += '"'; i += 1; }
        else entreComillas = !entreComillas;
      } else if (c === ',' && !entreComillas) { celdas.push(actual); actual = ''; }
      else actual += c;
    }
    celdas.push(actual);
    return celdas;
  });
}


/*
 * Accented names, for display only. The CSV stores them accent-stripped because
 * that is how gen_codigos_ecicep.py produced them, and on a clinical site in
 * Spanish that reads badly. No calculation changes: search already ignores
 * accents, and codes and scores come through from the CSV untouched.
 *
 * Self-validating: stripping the accents from each entry must reproduce the
 * exact CSV name. A typo fails the build instead of shipping.
 */
const CON_TILDES = {
  4: 'Anemia crónica',
  9: 'Catarata / Retinopatía',
  12: 'Depresión leve o moderada',
  13: 'Depresión (Grave, Grave con ideación suicida, refractaria y con psicosis)',
  15: 'Dificultades socioeconómicas o psicosociales',
  19: 'Enfermedad hepática',
  20: 'Enfermedad pulmonar obstructiva crónica (EPOC)',
  21: 'Enfermedad renal crónica',
  22: 'Enfermedad renal crónica avanzada',
  23: 'Enfermedades cardiovasculares / IAM / cardiopatía isquémica',
  24: 'Enteritis crónica / colitis ulcerosa / Crohn',
  26: 'Esclerosis múltiple',
  28: 'Fibrilación auricular / flutter',
  29: 'Función limitada / discapacidad / dependencia',
  32: 'Hipertensión',
  33: 'Hipertrofia prostática benigna',
  35: 'Infección por VIH / SIDA',
  36: 'Insuficiencia cardíaca',
  38: 'Malignidad / Neoplasia / Tumor maligno / Cáncer No esp.',
  39: 'Maltrato físico / psicológico / violencia intrafamiliar / Abuso Sexual / ideación e intento suicida',
  40: 'Dolor neuropático / fibromialgia',
  44: 'Trastornos de la coagulación',
  46: 'Arritmia cardíaca / Taquicardia paroxística',
  49: 'Trastornos del sueño',
  52: 'Úlcera crónica de la piel',
};

const sinTildes = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const [cabecera, ...cuerpo] = filas(readFileSync(ORIGEN, 'utf8'));
const col = Object.fromEntries(cabecera.map((n, i) => [n, i]));
for (const requerida of ['N°', 'Patología', 'Puntaje', 'Código CIE-10', 'Tipo']) {
  if (col[requerida] === undefined) throw new Error(`Falta la columna "${requerida}" en ${ORIGEN}`);
}

const condiciones = {};
const codigos = [];
const reglas = [];

for (const fila of cuerpo) {
  const n = Number(fila[col['N°']]);
  const puntaje = Number(fila['Puntaje'] ?? fila[col['Puntaje']]);
  const nombre = fila[col['Patología']].trim();
  const codigo = fila[col['Código CIE-10']].trim().toUpperCase();
  const tipo = fila[col['Tipo']].trim();

  if (!Number.isInteger(n) || (puntaje !== 1 && puntaje !== 2)) {
    throw new Error(`Fila invalida: N°=${fila[col['N°']]} puntaje=${fila[col['Puntaje']]}`);
  }
  if (!condiciones[n]) {
    const bonito = CON_TILDES[n];
    if (bonito !== undefined && sinTildes(bonito) !== nombre) {
      throw new Error(
        `CON_TILDES[${n}] no corresponde al CSV.\n  csv:     ${nombre}\n  tildes:  ${sinTildes(bonito)}`
      );
    }
    condiciones[n] = { nombre: bonito ?? nombre, puntaje };
  }
  else if (condiciones[n].puntaje !== puntaje) {
    throw new Error(`La condicion ${n} tiene dos puntajes distintos en el CSV`);
  }

  if (tipo === 'Regla') {
    const m = codigo.match(/^([A-Z]\d{2})-([A-Z]\d{2})$/);
    if (!m) throw new Error(`Regla de rango no reconocida: ${codigo}`);
    reglas.push([m[1], m[2], n]);
  } else {
    codigos.push([codigo, n]);
  }
}

const total = Object.keys(condiciones).length;
if (total !== 52) throw new Error(`Se esperaban 52 condiciones, se encontraron ${total}`);

const cuerpoJson = JSON.stringify({
  meta: {
    fuente: 'Marco Operativo ECICEP 2025, Anexo 4, pags. 94-101',
    origen: 'datos/codigos_ecicep_estratificacion.csv',
    generado_por: 'scripts/build-codigos.mjs',
    advertencia: 'GENERADO. No editar a mano: se sobrescribe.',
    condiciones: total,
    codigos: codigos.length,
    reglas: reglas.length,
  },
  condiciones,
  codigos,
  reglas,
}, null, 2);

/* Emitted as an ES module rather than .json so one file loads synchronously in
   both Node and the browser, with no import attributes and no fetch. */
const json = `/* GENERADO por scripts/build-codigos.mjs — no editar a mano. */\nexport const DATOS = ${cuerpoJson};\n`;

if (process.argv.includes('--check')) {
  const enDisco = readFileSync(DESTINO, 'utf8');
  if (enDisco !== json) {
    console.error('ecicep-codigos.mjs NO coincide con el CSV. Ejecuta: node scripts/build-codigos.mjs');
    process.exit(1);
  }
  console.log(`   ecicep-codigos.mjs al dia (${codigos.length} codigos, ${total} condiciones, ${reglas.length} reglas)`);
} else {
  writeFileSync(DESTINO, json);
  console.log(`escrito ${DESTINO}: ${codigos.length} codigos, ${total} condiciones, ${reglas.length} reglas`);
}
