/**
 * ECICEP risk calculator — scoring engine.
 *
 * PURE DOMAIN: touches no DOM, performs no I/O, depends on no browser. That is
 * what makes it testable in Node in milliseconds, and what stops an interface
 * change from ever moving a score.
 *
 * The clinical logic is the spreadsheet's, not a re-reading of the PDFs: the
 * spreadsheet already resolved the points and the cut-offs.
 *
 *   G0 = 0   ·   G1 = 1   ·   G2 = 2 to 4   ·   G3 = 5 or more   (weighted score)
 */
import { DATOS } from './ecicep-codigos.mjs';

export const META = DATOS.meta;

/** Labels exactly as the spreadsheet writes them in its group table. */
export const ETIQUETAS = {
  G0: 'Sin riesgo',
  G1: 'Bajo',
  G2: 'Moderado',
  G3: 'Alto',
};

/**
 * The principal strategy for each level, from "Modelo poblacional de
 * estratificacion de condiciones cronicas" (3.4.1.2) of the founding ECICEP
 * document, which adapts the Kaiser pyramid. This is the guidance that travels
 * with the number.
 */
export const ESTRATEGIAS = {
  G0: 'Promoción de salud y prevención a nivel de toda la población.',
  G1: 'Apoyo al automanejo, con coordinación sistemática de los profesionales implicados.',
  G2: 'Gestión de la condición de cronicidad: cuidados profesionales combinados con apoyo al automanejo.',
  G3: 'Gestión integral con enfoque de manejo de casos, dirigida a prevenir complicaciones y a coordinar la atención conjunta de salud y lo social.',
};

/** What each group means, stated in terms of the score itself. */
export const DESCRIPCIONES = {
  G0: 'Sin condiciones crónicas identificadas.',
  G1: '1 punto ponderado.',
  G2: '2 a 4 puntos ponderados · multimorbilidad.',
  G3: '5 o más puntos ponderados.',
};

/**
 * The spreadsheet's cut-offs. Stratifies on weighted SCORE, not on the number
 * of distinct pathologies: a single double-weighted condition scores 2 and
 * lands in G2. The MINSAL PDFs are ambiguous at that boundary; the spreadsheet
 * is not, and the spreadsheet wins.
 */
export function GRUPOS(puntaje) {
  if (puntaje <= 0) return 'G0';
  if (puntaje === 1) return 'G1';
  if (puntaje <= 4) return 'G2';
  return 'G3';
}

const sinTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
export const normalizar = (t) => sinTildes(String(t ?? '').trim().toLowerCase());

/*
 * Code index. Walked in CSV order, keeping the FIRST occurrence, because three
 * codes live under more than one condition (N18, Z71, Z72) and the spreadsheet
 * resolves them by first match, the way a VLOOKUP does.
 * Changing this order changes a clinical result.
 */
const PORCODIGO = new Map();
for (const [codigo, n] of DATOS.codigos) {
  if (!PORCODIGO.has(codigo)) PORCODIGO.set(codigo, n);
}

const CONDICIONES = Object.entries(DATOS.condiciones)
  .map(([n, c]) => ({ n: Number(n), ...c, busqueda: normalizar(c.nombre) }))
  .sort((a, b) => a.n - b.n);

const salida = (n, codigo) => {
  const c = DATOS.condiciones[n];
  return { condicion: Number(n), patologia: c.nombre, puntaje: c.puntaje, codigo };
};

/** Range rule such as C00-C97: same letter, base number inside the interval. */
function porRegla(base) {
  const m = base.match(/^([A-Z])(\d{2})$/);
  if (!m) return null;
  for (const [desde, hasta, n] of DATOS.reglas) {
    if (desde[0] !== m[1]) continue;
    if (Number(m[2]) >= Number(desde.slice(1)) && Number(m[2]) <= Number(hasta.slice(1))) {
      return salida(n, base);
    }
  }
  return null;
}

/**
 * Resolves a single entry (a CIE-10 code or a pathology name).
 * Returns null when it is not in the ECICEP list — never a silent zero.
 */
export function resolver(entrada) {
  const crudo = String(entrada ?? '').trim();
  if (!crudo) return null;

  const codigo = crudo.toUpperCase().replace(/\s+/g, '');
  if (PORCODIGO.has(codigo)) return salida(PORCODIGO.get(codigo), codigo);

  // Subcodigo que sube a su maestro: E11.9 -> E11
  const base = codigo.split('.')[0];
  if (base !== codigo && PORCODIGO.has(base)) return salida(PORCODIGO.get(base), codigo);

  const regla = porRegla(base);
  if (regla) return { ...regla, codigo };

  // Busqueda por nombre, sin tildes, primera coincidencia por numero de condicion.
  const texto = normalizar(crudo);
  if (texto.length >= 3) {
    const exacta = CONDICIONES.find((c) => c.busqueda === texto);
    if (exacta) return salida(exacta.n, null);
    const parcial = CONDICIONES.find((c) => c.busqueda.includes(texto));
    if (parcial) return salida(parcial.n, null);
  }
  return null;
}

/**
 * Interprets ONE entry and says what to do with it.
 *
 * This exists because of a clinical-safety defect: typing "renal" matches both
 * Enfermedad renal cronica (1 pt) and Enfermedad renal cronica avanzada (2 pts).
 * Resolving by first match and carrying on silently changes the group at the
 * G1/G2 boundary — which is to say it changes how often the person is seen.
 * Faced with an ambiguous name the tool does NOT choose: it returns the options
 * and leaves the decision to the clinician.
 *
 * An exact code is never ambiguous, even when its name is.
 *
 * @returns {{tipo:'ok'|'ambiguo'|'desconocido'|'vacio'}} with `condicion`,
 *          `patologia`, `puntaje`, `codigo` when 'ok'; with `opciones` when 'ambiguo'.
 */
export function interpretar(entrada) {
  const crudo = String(entrada ?? '').trim();
  if (!crudo) return { tipo: 'vacio' };

  // Code path: exact, or subcode rolling up to its master, or a range rule.
  const codigo = crudo.toUpperCase().replace(/\s+/g, '');
  const base = codigo.split('.')[0];
  const esCodigo = PORCODIGO.has(codigo) || PORCODIGO.has(base) || porRegla(base) !== null;
  if (esCodigo) {
    const r = resolver(crudo);
    return r ? { tipo: 'ok', ...r } : { tipo: 'desconocido', entrada: crudo };
  }

  const halladas = buscar(crudo);
  if (halladas.length === 0) return { tipo: 'desconocido', entrada: crudo };
  if (halladas.length === 1) {
    const r = resolver(halladas[0].nombre);
    return r ? { tipo: 'ok', ...r } : { tipo: 'desconocido', entrada: crudo };
  }
  return { tipo: 'ambiguo', entrada: crudo, opciones: halladas };
}

/**
 * Evaluates a list of entries and returns the full detail plus the score.
 * Each pathology counts ONCE; a second appearance is marked `repetida`, and
 * anything outside the list is marked `desconocida`. No entry ever disappears
 * from the detail.
 */
export function evaluar(entradas = []) {
  const vistas = new Set();
  const items = [];

  for (const entrada of entradas) {
    const r = resolver(entrada);
    if (!r) {
      items.push({ entrada, estado: 'desconocida' });
    } else if (vistas.has(r.condicion)) {
      items.push({ entrada, estado: 'repetida', ...r });
    } else {
      vistas.add(r.condicion);
      items.push({ entrada, estado: 'ok', ...r });
    }
  }

  const puntaje = [...vistas].reduce((t, n) => t + DATOS.condiciones[n].puntaje, 0);
  const grupo = GRUPOS(puntaje);
  return { items, distintas: vistas.size, puntaje, grupo, etiqueta: ETIQUETAS[grupo] };
}

/**
 * Searches conditions by NAME or by CODE; both inputs are valid. With no text
 * it returns all 52, which is what fills the dropdown.
 *
 * `coincide` carries the code that produced the hit, or null when the match was
 * by name — the interface shows it so the reader can see WHY that row appeared.
 */
export function buscar(texto = '') {
  const t = normalizar(texto);
  if (!t) return listado().map((f) => ({ ...f, coincide: null }));

  const codigo = texto.trim().toUpperCase().replace(/\s+/g, '');
  const porNombre = [];
  const porCodigo = [];

  for (const f of listado()) {
    if (normalizar(f.nombre).includes(t)) { porNombre.push({ ...f, coincide: null }); continue; }
    const hit = f.codigos.find((c) => c.toUpperCase().startsWith(codigo));
    if (hit) porCodigo.push({ ...f, coincide: hit });
  }

  /* A fully written subcode (N18.4) is not in the master list, so resolve it
     through the engine and append it when it is not already present. */
  const exacto = resolver(texto);
  if (exacto && !porNombre.some((f) => f.n === exacto.condicion)
             && !porCodigo.some((f) => f.n === exacto.condicion)) {
    const f = listado().find((x) => x.n === exacto.condicion);
    if (f) porCodigo.unshift({ ...f, coincide: exacto.codigo ?? null });
  }
  return [...porNombre, ...porCodigo];
}

/**
 * Reference listing: the 52 conditions with their score and the codes worth
 * showing. Master codes are preferred (E10, E11...), which is how the
 * spreadsheet's own reference table writes them; a condition with no master of
 * its own falls back to its subcodes, and range-defined ones show the range.
 */
export function listado() {
  const porCondicion = new Map();
  for (const [codigo, n] of DATOS.codigos) {
    if (!porCondicion.has(n)) porCondicion.set(n, []);
    porCondicion.get(n).push(codigo);
  }
  for (const [desde, hasta, n] of DATOS.reglas) {
    if (!porCondicion.has(n)) porCondicion.set(n, []);
    porCondicion.get(n).push(`${desde}-${hasta}`);
  }
  return Object.entries(DATOS.condiciones).map(([n, c]) => {
    const todos = porCondicion.get(Number(n)) ?? [];
    const maestros = todos.filter((cod) => !cod.includes('.'));
    return {
      n: Number(n),
      nombre: c.nombre,
      puntaje: c.puntaje,
      codigos: maestros.length ? maestros : todos,
    };
  }).sort((a, b) => a.n - b.n);
}
