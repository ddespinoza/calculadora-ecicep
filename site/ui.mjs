/**
 * ECICEP risk calculator — interface.
 *
 * DOM adapter. It knows no clinical rule at all: every score, cut-off and
 * registration string comes from motor.mjs. If this file vanished, the clinical
 * result would still be reproducible from a single line of Node.
 *
 * Strings shown to the user stay in Spanish; the code around them is English.
 *
 * Ported from the Site (APS-Conecta/aps-conecta-web, mu-plugins/assets/calc/ui.mjs) when
 * the Calculator moved to GitHub Pages — ADR-0002. Deployed beside motor.mjs,
 * ecicep-codigos.mjs and ecicep-titulos.mjs by scripts/build-site.mjs, which is why the
 * imports are siblings.
 */
import { evaluar, resolver, listado, buscar, interpretar, normalizar, META, ETIQUETAS, ESTRATEGIAS } from './motor.mjs';
import { DATOS } from './ecicep-codigos.mjs';
import { TITULOS } from './ecicep-titulos.mjs';

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/*
 * The Código column for a row the user picked BY NAME.
 *
 * This used to be the first code the source lists for the condition, defended on the
 * grounds that the column "claims a code for the condition, not the master code".
 * Measured against the live table, that defence does not hold: 38 of the 52 conditions
 * have more than one master code, so on three rows in four the column named one code
 * and silently stood for several. «Diabetes mellitus → E10» is the case the audit
 * caught; «Anemia crónica → D50» hides twelve more, and «Hipertensión → I10» hides
 * three.
 *
 * Nothing may be dropped, so nothing is: the set is COMPRESSED rather than truncated.
 * Consecutive codes under the same letter collapse into one run, and every code sits
 * inside exactly one printed run — which is how a clinical code list is normally
 * written, and is lossless by construction:
 *
 *   Diabetes mellitus  E10 E11 E12 E13 E14        ->  E10–E14
 *   Hipertensión       I10 I11 I12 I13            ->  I10–I13
 *   Anemia crónica     D50 D51 D52 D55…D64        ->  D50–D52 · D55–D64
 *   Dificultades soc.  Z55…Z60 Z62 Z63 Z65        ->  Z55–Z60 · Z62–Z63 · Z65
 *
 * A condition can therefore show several ranges, several loose codes, or a mixture,
 * because that is what the Marco Operativo actually lists. The two range RULES the
 * source declares itself (C00-C97, D00-D48) arrive already collapsed from listado()
 * and are passed through untouched, only re-punctuated to the same dash so one column
 * reads as one column.
 *
 * `title` carries the uncompressed list, and the reference panel below the calculator
 * still prints every master code per condition — the compression is a display of the
 * same set, never a filter on it.
 */
const rangos = (codigos) => {
  const numerados = [];
  const sueltos = [];
  for (const c of codigos) {
    const m = c.match(/^([A-Z]+)(\d+)$/);
    if (m) numerados.push({ letra: m[1], n: Number(m[2]), txt: c });
    /* Source-declared ranges (C00-C97) and sub-codes (F33.2) are not runs; they are
       printed as they came. Re-punctuated so the column uses one dash throughout. */
    else sueltos.push(c.replace('-', '\u2013'));
  }
  numerados.sort((a, b) => a.letra.localeCompare(b.letra) || a.n - b.n);

  const corridas = [];
  for (const cod of numerados) {
    const ultima = corridas[corridas.length - 1];
    if (ultima && ultima.letra === cod.letra && cod.n === ultima.hasta + 1) {
      ultima.hasta = cod.n;
      ultima.hastaTxt = cod.txt;
    } else {
      corridas.push({ letra: cod.letra, desde: cod.n, hasta: cod.n, desdeTxt: cod.txt, hastaTxt: cod.txt });
    }
  }
  return [
    ...corridas.map((r) => (r.desde === r.hasta ? r.desdeTxt : `${r.desdeTxt}\u2013${r.hastaTxt}`)),
    ...sueltos,
  ].join(' \u00b7 ');
};

/*
 * The codes a condition is SHOWN with: its master codes, but only those that resolve to
 * it. listado() lists by CSV row, so «Enfermedad renal crónica avanzada» carried N18 —
 * yet N18 typed alone resolves by first match to «Enfermedad renal crónica» (1 point).
 * The Site printed «N18» beside the 2-point condition, a code that would score the other
 * one. Filtering through resolver() makes the column say only what the engine would do;
 * a condition left with no master shows its subcodes (N18.4 · N18.5 · N18.6).
 */
export function codigosQueResuelven(n, codigos) {
  return codigos.filter((c) => c.includes('-') || resolver(c)?.condicion === n);
}

const CODIGOS = new Map();
for (const f of codigosPorCondicion()) {
  CODIGOS.set(f.n, { corto: rangos(f.visibles), todos: f.visibles.join(', ') });
}

/*
 * Pure input planning (org L6-10 — extracted so the adapter's contract is pinnable
 * without a DOM). The old agregarConCuidado loop hit an ambiguous part and RETURNED,
 * so on a multi-part entry («E11, renal») every unambiguous part already typed was
 * neither added nor left in the input — silent data loss on the exact keys the user
 * had confirmed. The plan splits FIRST: the parts before the ambiguous one add
 * immediately, the ambiguous one stays in the input for disambiguation, and nothing
 * typed is dropped.
 */
export const partirEntrada = (texto) => String(texto).split(',').map((t) => t.trim()).filter(Boolean);

/* Split a submission into what can be added without asking and what must stop for
 * disambiguation. `interpretarFn` is motor's interpretar, injected so this stays a
 * pure function of its arguments. */
export function planAgregar(texto, interpretarFn) {
  const partes = partirEntrada(texto);
  const inmediatas = [];
  for (const parte of partes) {
    if (interpretarFn(parte).tipo === 'ambiguo') {
      return { inmediatas, pendiente: parte };
    }
    inmediatas.push(parte);
  }
  return { inmediatas, pendiente: null };
}

/* esc() is exported (as escDe) for the attribute-safety pin: typed clinical text
 * must never reach the DOM as markup, and the pin proves the escaping. */

/*
 * Every code of every condition, for the listing. listado() deliberately shows master
 * codes only; a clinician looking for «which codes count» needs all 1001, so this walks
 * DATOS.codigos in CSV order. A code that sits under two conditions (N18, Z71, Z72)
 * RESOLVES by first match — so under the second condition it is shown with a note naming
 * the condition it actually counts as, rather than hidden or presented as counting here.
 * The engine decides which; this only asks resolver().
 */
export function codigosPorCondicion() {
  const extra = new Map();
  for (const [codigo, n] of DATOS.codigos) {
    if (!extra.has(n)) extra.set(n, []);
    const r = resolver(codigo);
    extra.get(n).push({
      codigo,
      titulo: TITULOS[codigo] ?? '',
      maestro: !codigo.includes('.'),
      otra: r && r.condicion !== n ? r.patologia : null,
    });
  }
  for (const [desde, hasta, n] of DATOS.reglas) {
    if (!extra.has(n)) extra.set(n, []);
    const codigo = `${desde}-${hasta}`;
    extra.get(n).push({ codigo, titulo: TITULOS[codigo] ?? '', maestro: true, otra: null });
  }
  return listado().map((f) => {
    const todos = extra.get(f.n) ?? [];
    let visibles = codigosQueResuelven(f.n, f.codigos);
    if (!visibles.length) visibles = todos.filter((c) => !c.otra).map((c) => c.codigo);
    return { ...f, todos, visibles };
  });
}

/* A typed code inside a range rule (C50, D05.1 inside C00-C97, D00-D48): the rule row has no
 * prefix to match, so without this a cancer code found nothing in the listing although it
 * scores. Same test as motor.mjs's porRegla: same letter, two-digit base inside the interval. */
function enRegla(cod, regla) {
  const r = regla.match(/^([A-Z])(\d{2})-([A-Z])(\d{2})$/);
  const c = cod.split('.')[0].match(/^([A-Z])(\d{2})$/);
  if (!r || !c || c[1] !== r[1]) return false;
  const n = Number(c[2]);
  return n >= Number(r[2]) && n <= Number(r[4]);
}

/* Filter for the listing: by condition name, by code prefix, or by CIE-10 title. Returns
 * the matching rows with the set of codes that matched, so the row can open and mark them. */
export function filtrarListado(filas, texto) {
  const q = normalizar(texto);
  if (!q) return filas.map((fila) => ({ fila, aciertos: new Set(), porNombre: false }));
  const cod = String(texto).trim().toUpperCase().replace(/\s+/g, '');
  const salida = [];
  for (const fila of filas) {
    const porNombre = normalizar(fila.nombre).includes(q);
    const aciertos = new Set(fila.todos
      .filter((c) => c.codigo.startsWith(cod) || enRegla(cod, c.codigo)
        || (q.length >= 3 && normalizar(c.titulo).includes(q)))
      .map((c) => c.codigo));
    if (porNombre || aciertos.size) salida.push({ fila, aciertos, porNombre });
  }
  return salida;
}

/*
 * The quick-add buttons («Frecuentes en APS»): conditions common in primary care, by
 * their Anexo 4 number, with a short label. A button adds the condition by its EXACT
 * name, which resolver() matches before any partial match, so a button can never land on
 * a neighbour (tests/ui.test.mjs pins it). Approved by the owner on 2026-11-24.
 */
export const FRECUENTES = [
  [32, 'Hipertensión'], [14, 'Diabetes'], [16, 'Dislipidemia'], [41, 'Obesidad'],
  [7, 'Artrosis'], [12, 'Depresión leve/mod.'], [34, 'Tiroides'], [8, 'Asma'],
  [20, 'EPOC'], [2, 'Tabaquismo'], [47, 'Ansiedad'], [21, 'ERC'],
];

const RANGO = { G0: 0, G1: 1, G2: 2, G3: 3 };
const plural = (n, s, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;

/*
 * One screen (v1.2.0). Desktop shows three columns at once — the person's conditions,
 * the result, and the code browser — inside the viewport, each scrolling on its own.
 * Under 1120px the code browser becomes a panel; under 760px the page becomes four tabs
 * with the result kept in a strip at the top. The layout is CSS container queries on
 * .marco; this function only switches `data-vista` and paints.
 */
export function iniciar(app) {
  if (!app) return null;
  const entradas = [];
  const NOMBRE = Object.fromEntries(listado().map((f) => [f.n, f]));
  const FILAS = codigosPorCondicion();
  const inp = $('#inp', app);
  const sug = $('#sug', app);
  const amb = $('#amb', app);
  let marcada = -1;

  /* ---------- adding and removing ---------- */
  function agregar(texto) {
    /* planAgregar: parts before an ambiguous one are added; the ambiguous one waits. */
    const { inmediatas, pendiente } = planAgregar(texto, interpretar);
    entradas.push(...inmediatas);
    inp.value = pendiente ?? '';
    cerrarSug();
    if (pendiente) mostrarAmbiguo(pendiente); else amb.hidden = true;
    pintar();
  }
  function agregarUna(valor) {
    entradas.push(valor);
    inp.value = '';
    amb.hidden = true;
    cerrarSug();
    pintar();
  }
  /* An ambiguous name never picks for the clinician: the options become buttons. */
  function mostrarAmbiguo(parte) {
    const ops = interpretar(parte).opciones;
    amb.innerHTML = `«${esc(parte)}» coincide con ${ops.length} patologías. Elija cuál corresponde:
      <div class="amb__ops">${ops.map((o) => `<button type="button" class="chip" data-nombre="${esc(o.nombre)}">${esc(o.nombre)} <small>${plural(o.puntaje, 'pt')}</small></button>`).join('')}</div>`;
    amb.hidden = false;
  }
  /* Toggle a condition from a quick-add button or the code browser's +. */
  function alternar(n) {
    const r = evaluar(entradas);
    const quitar = r.items.map((it, i) => (it.condicion === n ? i : -1)).filter((i) => i >= 0);
    if (quitar.length) for (const i of quitar.reverse()) entradas.splice(i, 1);
    else entradas.push(NOMBRE[n].nombre);
    pintar();
  }

  /* ---------- suggestions while typing ---------- */
  function sugerir() {
    const t = inp.value.split(',').pop().trim();
    if (!t) { cerrarSug(); return; }
    const h = buscar(t).slice(0, 8);
    marcada = -1;
    /* coincide (the code that matched) is what gets added, so E11 stays E11 and is not
       re-resolved by name into the condition's first code. */
    sug.innerHTML = h.map((c, i) => `<li role="option" id="op-${i}" data-v="${esc(c.coincide || c.nombre)}" aria-selected="false">
      <span>${esc(c.nombre)}${c.coincide ? `<em>${esc(c.coincide)}</em>` : ''}</span><span class="pj">${plural(c.puntaje, 'pt')}</span></li>`).join('');
    sug.hidden = !h.length;
    inp.setAttribute('aria-expanded', String(h.length > 0));
  }
  function cerrarSug() {
    sug.hidden = true; sug.innerHTML = ''; marcada = -1;
    inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant');
  }
  function mover(paso) {
    const items = [...sug.children];
    if (!items.length) return;
    marcada = (marcada + paso + items.length) % items.length;
    items.forEach((li, i) => li.setAttribute('aria-selected', String(i === marcada)));
    inp.setAttribute('aria-activedescendant', items[marcada].id);
    items[marcada].scrollIntoView({ block: 'nearest' });
  }
  inp.addEventListener('input', sugerir);
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!sug.children.length) sugerir(); mover(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1); }
    else if (e.key === 'Escape' || e.key === 'Tab') cerrarSug();
    else if (e.key === 'Enter') {
      e.preventDefault();
      const items = [...sug.children];
      if (marcada >= 0 && items[marcada]) agregarUna(items[marcada].dataset.v);
      else if (inp.value.trim()) agregar(inp.value);
    }
  });
  sug.addEventListener('click', (e) => { const li = e.target.closest('li[data-v]'); if (li) { agregarUna(li.dataset.v); inp.focus(); } });
  $('#agregar', app).addEventListener('click', () => { if (inp.value.trim()) agregar(inp.value); inp.focus(); });
  amb.addEventListener('click', (e) => { const b = e.target.closest('[data-nombre]'); if (b) agregarUna(b.dataset.nombre); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.campo')) cerrarSug(); });

  /* ---------- painting ---------- */
  function pintar() {
    const r = evaluar(entradas);
    const vacio = r.items.length === 0;
    const activos = new Set(r.items.filter((i) => i.estado === 'ok').map((i) => i.condicion));

    $('#filas', app).innerHTML = vacio
      ? '<div class="vacio"><div><b>Agregue las condiciones de la persona</b>Escriba un diagnóstico confirmado o su código, o toque una frecuente.</div></div>'
      : r.items.map((it, i) => {
        const nombre = it.estado === 'desconocida' ? `${esc(it.entrada)} · no está en el listado ECICEP oficial` : esc(it.patologia);
        /* An exact code the user chose wins; a condition chosen by name shows the codes
           that resolve to it (codigosQueResuelven), never one that scores elsewhere. */
        const ficha = CODIGOS.get(it.condicion);
        const cod = it.estado === 'desconocida' ? '—' : esc(it.codigo ?? ficha?.corto ?? '—');
        const titulo = it.codigo || !ficha ? '' : ` title="${esc(ficha.todos)}"`;
        const p = it.estado === 'ok' ? it.puntaje : it.estado === 'repetida' ? 'repetida' : '—';
        return `<div class="fila fila--${it.estado}" role="listitem"><span class="fila__n">${nombre}</span><span class="fila__c"${titulo}>${cod}</span>
          <span class="fila__p">${p}</span><button type="button" class="x" data-q="${i}" aria-label="Quitar ${esc(it.patologia ?? it.entrada)}">×</button></div>`;
      }).join('');
    $('#lista', app).classList.toggle('lista--vacia', vacio);
    const tot = $('#total', app);
    tot.hidden = vacio;
    tot.innerHTML = `<span>Total</span><span>${plural(r.distintas, 'patología distinta', 'patologías distintas')}</span><span>${r.puntaje}</span><span></span>`;
    $('#limpiar', app).hidden = vacio;

    $('#chips', app).innerHTML = FRECUENTES.map(([n, etq]) => `<button type="button" class="chip" data-n="${n}" aria-pressed="${activos.has(n)}">${activos.has(n) ? '✓ ' : ''}${esc(etq)} <small>${NOMBRE[n].puntaje}</small></button>`).join('');

    $('#grupo', app).innerHTML = vacio
      ? '<span class="grupo__g grupo__g--vacio">—</span><div><p class="grupo__e">Sin calcular</p><p class="grupo__p">Agregue una patología confirmada.</p></div>'
      : `<span class="grupo__g grupo__g--${r.grupo}">${r.grupo}</span><div><p class="grupo__e">Riesgo ${r.etiqueta.toLowerCase()}</p><p class="grupo__p">${plural(r.puntaje, 'punto ponderado', 'puntos ponderados')} · ${plural(r.distintas, 'patología')}</p></div>`;
    $('#est', app).innerHTML = vacio ? '' : `<p class="est__t">Estrategia principal</p><p>${esc(ESTRATEGIAS[r.grupo])}</p>`;
    /* solid = this group · tint = below it, still applies (strategies are nested) · faint = not reached */
    for (const el of app.querySelectorAll('.pir [data-n], .ley [data-n]')) {
      const n = el.dataset.n;
      el.classList.toggle('activo', !vacio && n === r.grupo);
      el.classList.toggle('tinte', !vacio && RANGO[n] < RANGO[r.grupo]);
    }
    $('#pir-t', app).textContent = vacio ? 'Estratificación ECICEP: sin calcular'
      : `Estratificación ECICEP: ${r.grupo}, riesgo ${r.etiqueta.toLowerCase()}, ${plural(r.puntaje, 'punto')}`;

    $('#franja', app).innerHTML = vacio
      ? '<span class="franja__g franja__g--vacio">—</span><span class="franja__t"><b>Sin calcular</b>Agregue una patología</span>'
      : `<span class="franja__g franja__g--${r.grupo}">${r.grupo}</span><span class="franja__t"><b>Riesgo ${r.etiqueta.toLowerCase()}</b>${plural(r.puntaje, 'punto')} · ${plural(r.distintas, 'patología')}</span><span class="franja__v">${app.dataset.vista === 'resultado' ? '‹ Volver' : 'Ver estrategia ›'}</span>`;
    const tn = $('#tabn', app);
    tn.hidden = vacio;
    tn.textContent = r.distintas;
    pintarCodigos(activos);
  }
  $('#chips', app).addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) alternar(Number(b.dataset.n)); });
  $('#filas', app).addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) { entradas.splice(Number(b.dataset.q), 1); pintar(); } });

  /* Clearing a patient's whole entry: an undo beats a confirm dialog, which gets
     click-through-trained within a week. */
  let deshacer = null;
  $('#limpiar', app).addEventListener('click', () => {
    if (!entradas.length) return;
    const copia = [...entradas];
    entradas.length = 0;
    pintar();
    const t = $('#toast', app);
    t.innerHTML = `Se quitaron ${plural(copia.length, 'patología')}. <button type="button">Deshacer</button>`;
    t.hidden = false;
    clearTimeout(deshacer);
    deshacer = setTimeout(() => { t.hidden = true; }, 10000);
    t.querySelector('button').addEventListener('click', () => { entradas.push(...copia); t.hidden = true; pintar(); inp.focus(); });
  });

  /* ---------- code browser ---------- */
  function pintarCodigos(activos) {
    const vis = filtrarListado(FILAS, $('#filtro', app).value);
    $('#codl', app).innerHTML = vis.map(({ fila: f, aciertos, porNombre }) => {
      const abierto = aciertos.size > 0 && !porNombre;
      const esta = activos.has(f.n);
      return `<div class="cf"><div class="cf__r">
        <div><div class="cf__n">${esc(f.nombre)}</div><div class="cf__c">${esc(rangos(f.visibles))}</div></div>
        <span class="cf__p">${plural(f.puntaje, 'pt')}</span>
        <button type="button" class="mas" data-n="${f.n}" aria-pressed="${esta}" aria-label="${esta ? 'Quitar' : 'Agregar'} ${esc(f.nombre)}">${esta ? '✓' : '+'}</button></div>
        <details${abierto ? ' open' : ''}><summary>Ver ${plural(f.todos.length, 'código')}${abierto ? ` · ${aciertos.size} coincide${aciertos.size === 1 ? '' : 'n'}` : ''}</summary>
        <div class="cods">${f.todos.map((c) => `<div class="${c.maestro ? 'm' : ''}${aciertos.has(c.codigo) ? ' hit' : ''}"><b>${esc(c.codigo)}</b><span>${esc(c.titulo || '—')}${c.otra ? `<small>Este código cuenta como «${esc(c.otra)}»</small>` : ''}</span></div>`).join('')}</div></details></div>`;
    }).join('') || '<p class="vacio">Nada coincide con la búsqueda.</p>';
    $('#conteo', app).textContent = vis.length === FILAS.length
      ? `${FILAS.length} patologías · ${META.codigos} códigos · toque + para agregar`
      : `${vis.length} de ${FILAS.length} patologías`;
  }
  $('#filtro', app).addEventListener('input', () => pintar());
  $('#codl', app).addEventListener('click', (e) => { const b = e.target.closest('.mas'); if (b) alternar(Number(b.dataset.n)); });

  /* ---------- views: phone tabs, the mid-width panel, help ---------- */
  function vista(v) {
    app.dataset.vista = v;
    for (const t of app.querySelectorAll('.tab')) t.setAttribute('aria-current', String(t.dataset.vista === v));
    $('.main', app).scrollTop = 0;
    const flecha = $('.franja__v', app);
    if (flecha) flecha.textContent = v === 'resultado' ? '‹ Volver' : 'Ver estrategia ›';
  }
  $('.tabs', app).addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) vista(t.dataset.vista); });
  $('#franja', app).addEventListener('click', () => vista(app.dataset.vista === 'resultado' ? 'calcular' : 'resultado'));
  const ayuda = document.getElementById('tpl-ayuda').innerHTML;
  document.getElementById('dayuda').innerHTML = ayuda;
  $('#vayuda', app).innerHTML = `<h2 class="vista-ayuda__h">Cómo se usa</h2>${ayuda}`;
  $('#abrir-ayuda', app).addEventListener('click', () => document.getElementById('dlg-ayuda').showModal());
  $('#abrir-cod', app).addEventListener('click', () => { app.classList.add('cod-abierto'); $('#filtro', app).focus(); });
  $('#cerrar-cod', app).addEventListener('click', () => app.classList.remove('cod-abierto'));
  const dlg = document.getElementById('dlg-ayuda');
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  pintar();
  return { agregar, alternar, pintar, get entradas() { return [...entradas]; } };
}

/* Auto-start — in the BROWSER only. Under node (tests/ui.test.mjs pins this
 * module's pure contract) there is no document, and the import must not explode
 * before the first test runs. If anything fails it is said on screen — never a
 * silent catch. */
if (typeof document !== 'undefined') {
  const app = document.getElementById('app');
  try {
    iniciar(app);
  } catch (error) {
    if (app) app.innerHTML = `<p class="amb" style="margin:16px">La calculadora no pudo iniciarse: ${esc(error.message)}</p>`;
    throw error;
  }
}

/* Offline: the service worker caches this exact release, so the Calculator keeps working
 * on a dropped clinic connection. Registration failing (file://, a private window) costs
 * only the offline copy, never the calculation — so it is reported, not thrown. */
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((error) => console.warn('[ecicep] sin modo sin conexión:', error));
}
if (typeof document !== 'undefined') {
  const red = document.getElementById('estado-red');
  const marcar = () => {
    if (!red) return;
    const fuera = navigator.onLine === false;
    red.hidden = !fuera;
    red.textContent = fuera ? 'Sin conexión · funciona igual' : '';
  };
  addEventListener('online', marcar);
  addEventListener('offline', marcar);
  marcar();
}

export { resolver, evaluar, ETIQUETAS, esc as escDe };
