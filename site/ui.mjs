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

export function iniciar(raiz) {
  if (!raiz) return null;
  const entradas = [];
  const depurar = new URLSearchParams(location.search).get('debug') === '1';

  const input       = $('.calc__input', raiz);
  const sugerencias = $('.aps-calc__sugerencias', raiz);
  const lista       = $('.pat', raiz);      // the whole table shell
  const filas       = $('.pat__l', raiz);               // its rows
  const total       = $('.pat__tot', raiz);
  const vacio       = $('.calc__vacio', raiz);
  const resultado   = $('.res', raiz);
  const traza       = $('.aps-calc__traza', raiz);
  const btnLimpiar  = $('[data-accion="limpiar"]', raiz);
  const aviso       = $('.calc__aviso', raiz);
  const piramide    = $('.pirB__svg', raiz);
  const riel        = $('.pirB__leyenda', raiz);
  const barra       = $('.calc__barra', raiz);
  let marcada = -1;

  /* The list is capped by the room actually under the field, not by a fixed number.
     A constant (300px, or 42vh) runs off the bottom on a short laptop, on a landscape
     phone, and on any phone once the on-screen keyboard takes half the window —
     visualViewport is what reports that, and it is the only thing that knows. */
  const ALTO_MINIMO = 150;
  function espacioBajoElCampo() {
    const vv = window.visualViewport;
    const alto = vv ? vv.height + vv.offsetTop : window.innerHeight;
    return alto - input.getBoundingClientRect().bottom - 16;
  }
  function ajustarAlto() {
    let bajo = espacioBajoElCampo();
    /* On a 320x568 screen the field lands exactly on the bottom edge: there is no room
       at all, and the whole list opens off-screen. Shrinking it does not help — bring
       the field up instead. Self-limiting: once there is room, this stops firing. */
    if (bajo < ALTO_MINIMO) {
      /* Clamped so the field itself never scrolls off the top. */
      const techo = 8;
      const holgura = Math.max(0, input.getBoundingClientRect().top - techo);
      window.scrollBy({ top: Math.min(ALTO_MINIMO - bajo, holgura), behavior: 'instant' });
      bajo = espacioBajoElCampo();
    }
    sugerencias.style.maxHeight = Math.max(120, Math.min(300, bajo)) + 'px';
  }
  window.visualViewport?.addEventListener('resize', ajustarAlto);
  window.addEventListener('resize', ajustarAlto);

  /* ---------- suggestions ---------- */
  function sugerir() {
    /* Focusing with no text drops the full 52: the list is browsable, not an
       autocomplete that makes you guess the name first. */
    const crudo = input.value.split(',').pop().trim();
    marcada = -1;
    const halladas = buscar(crudo).slice(0, 60);
    /* The option IS the <li>. It used to wrap a <button>, which is invalid ARIA
       (an option may not contain interactive descendants) and put 52 stops in
       the tab order. Ids exist so aria-activedescendant can point at one. */
    sugerencias.innerHTML = halladas.map((c, i) => `
      <li role="option" id="calc-op-${c.n}" data-nombre="${esc(c.nombre)}" data-codigo="${esc(c.coincide ?? '')}" aria-selected="${i === marcada}">
        <span>${esc(c.nombre)}${c.coincide ? ` <em class="aps-calc__match">${esc(c.coincide)}</em>` : ''}</span>
        <span class="aps-calc__pje">${c.puntaje} pt${c.puntaje > 1 ? 's' : ''}</span>
      </li>`).join('');
    ajustarAlto();
    input.setAttribute('aria-expanded', String(halladas.length > 0));
    input.removeAttribute('aria-activedescendant');
  }

  /*
   * What to send to the engine when an option is chosen.
   *
   * buscar() already reports WHICH code matched, as `coincide`, and the dropdown
   * has always shown it — type «E11» and the option reads «Diabetes mellitus E11».
   * Both selection paths then threw it away and sent the NAME, so evaluar() had to
   * re-resolve by name and returned codigo:null, and the results table fell back to
   * the first code of the group: «E10». E10 is type 1 diabetes and E11 is type 2.
   * The score was right and the code shown was one the user never chose.
   *
   * Sending the code is also the safer input: motor.mjs treats an exact code as
   * unambiguous, while an ambiguous NAME deliberately adds nothing and asks — the
   * clinical-safety fix of 2026-08-26. So this narrows what the engine has to guess.
   */
  const elegido = (li) => li.dataset.codigo || li.dataset.nombre;

  function mover(paso) {
    const items = [...sugerencias.querySelectorAll('li')];
    if (!items.length) return;
    marcada = (marcada + paso + items.length) % items.length;
    items.forEach((li, i) => li.setAttribute('aria-selected', String(i === marcada)));
    /* Without this a screen reader hears nothing as the arrows move. */
    input.setAttribute('aria-activedescendant', items[marcada].id);
    items[marcada].scrollIntoView({ block: 'nearest' });
  }

  /* ---------- state ---------- */
  function agregar(texto) {
    for (const parte of partirEntrada(texto)) {
      entradas.push(parte);
    }
    input.value = '';
    sugerencias.innerHTML = '';
    marcada = -1;
    input.setAttribute('aria-expanded', 'false');
    pintar();
  }

  /*
   * The bare-Enter path. It used to send raw text to resolver(), which returns
   * the first match: typing "renal" scored 1 point (ERC) even though the
   * dropdown was also offering ERC avanzada at 2. At the G1/G2 boundary that
   * changes the group. Now an ambiguous name adds nothing: the list stays open
   * and the reason is stated.
   */
  function agregarConCuidado(texto) {
    /* org L6-10: the plan, not a loop that returns mid-flight. Parts confirmed before
     * an ambiguous one ARE added; the ambiguous one alone waits in the input. */
    const { inmediatas, pendiente } = planAgregar(texto, interpretar);
    if (inmediatas.length) agregar(inmediatas.join(','));
    if (pendiente !== null) {
      input.value = pendiente;
      sugerir();
      avisoAmbiguo(pendiente);
      return;
    }
    limpiarAviso();
  }

  function avisoAmbiguo(parte) {
    const n = interpretar(parte).opciones.length;
    aviso.textContent = `«${parte}» coincide con ${n} patologías. Elija cuál corresponde.`;
    aviso.hidden = false;
  }
  function cerrarSugerencias() {
    sugerencias.innerHTML = '';
    marcada = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function limpiarAviso() {
    aviso.hidden = true;
    aviso.textContent = '';
    aviso.className = 'calc__aviso alert alert--warn';
  }

  function quitar(indice) { entradas.splice(indice, 1); pintar(); }

  /* ---------- render ---------- */
  function pintar() {
    const r = evaluar(entradas);

    /* One record, not two. It used to be chips *and* a sum table, which stated the
       same three facts twice: what it is, its code, what it is worth. */
    filas.innerHTML = r.items.map((item, i) => {
      const clase = item.estado === 'ok' ? '' : ` pat__r--${item.estado}`;
      const nombre = item.estado === 'desconocida'
        ? `${esc(item.entrada)} · no está en el listado ECICEP oficial`
        : esc(item.patologia);
      const ficha = CODIGOS.get(item.condicion);
      /* An exact code the user chose always wins over the condition's range: it is
         more specific and it is what they typed. */
      const codigo = item.estado === 'desconocida'
        ? '—'
        : esc(item.codigo ?? ficha?.corto ?? '—');
      const codigoTitulo = item.codigo || !ficha ? '' : ` title="${esc(ficha.todos)}"`;
      const pje = item.estado === 'ok' ? item.puntaje : (item.estado === 'repetida' ? 'repetida' : '—');
      return `<div class="pat__r${clase}" role="listitem">
        <span class="pat__n">${nombre}</span>
        <span class="pat__c"${codigoTitulo}>${codigo}</span>
        <span class="pat__p">${pje}</span>
        <button type="button" class="pat__x" data-quitar="${i}"
                aria-label="Quitar ${esc(item.patologia ?? item.entrada)}"><span class="pat__x-g" aria-hidden="true">×</span></button>
      </div>`;
    }).join('');

    total.innerHTML = `<span class="pat__n">Total</span>
      <span class="pat__c">${r.distintas} patología${r.distintas === 1 ? '' : 's'} distinta${r.distintas === 1 ? '' : 's'}</span>
      <span class="pat__p">${r.puntaje}</span><span></span>`;
    lista.hidden = r.items.length === 0;

    vacio.hidden = entradas.length > 0;
    /* A control that does nothing when pressed is worse than an absent one: it
       spends a tap and teaches the user the page is unresponsive. */
    if (btnLimpiar) btnLimpiar.hidden = entradas.length === 0;

    const sinCalcular = r.items.length === 0;
    const RANGO = { G0: 0, G1: 1, G2: 2, G3: 3 };

    /* Three states, not two. solid = you are here · tint = still applies to you ·
       outline = not reached. ECICEP's strategies are nested: G0's population-wide
       prevention still applies to a G3 patient, so ghosting the lower tiers would
       assert something clinically false. */
    for (const nodo of raiz.querySelectorAll('[data-nivel]')) {
      const g = nodo.dataset.nivel;
      const est = sinCalcular ? 'contorno'
        : g === r.grupo ? 'solido'
        : RANGO[g] < RANGO[r.grupo] ? 'tinte' : 'contorno';
      nodo.classList.remove('is-activo', 'is-tinte');
      if (est === 'solido') nodo.classList.add('is-activo');
      else if (est === 'tinte') nodo.classList.add('is-tinte');
      /* «este resultado» rides with the highlight: colour is never the only cue. */
      const etq = nodo.querySelector('[data-etiqueta]');
      if (etq) {
        const base = etq.dataset.base ?? (etq.dataset.base = etq.textContent.trim());
        etq.textContent = est === 'solido' ? `${base} · este resultado` : base;
      }
    }
    piramide?.querySelector('title')?.replaceChildren(document.createTextNode(
      sinCalcular ? 'Estratificación ECICEP: sin calcular'
            : `Estratificación ECICEP: ${r.grupo}, riesgo ${r.etiqueta.toLowerCase()}, ${r.puntaje} puntos`));

    if (sinCalcular) {
      resultado.classList.add('res--vacio');
      resultado.innerHTML =
        '<p class="res__sig">Sin calcular. Agregue una patología confirmada.</p>';
    } else {
      resultado.classList.remove('res--vacio');
      /* Group and what it means, nothing else. The score and the band used to be
         repeated here; the total row and the pyramid legend already state both, and
         three places saying the same number is noise, not emphasis. */
      resultado.innerHTML = `
        <p class="res__g"><span class="res__sw res__sw--${r.grupo}" aria-hidden="true"></span>Grupo <b>${r.grupo}</b></p>
        <p class="res__est">${esc(ESTRATEGIAS[r.grupo])}</p>`;
    }
    resultado.setAttribute('aria-busy', 'false');
    /* The phone bar repeats the answer for sight only (aria-hidden): the status card is
       what a screen reader hears, and hearing it twice is noise. */
    if (barra) {
      barra.hidden = sinCalcular;
      barra.querySelector('.calc__barra-p').textContent = `${r.puntaje} punto${r.puntaje === 1 ? '' : 's'} · riesgo ${r.etiqueta.toLowerCase()}`;
      const g = barra.querySelector('.calc__barra-g');
      g.textContent = r.grupo;
      g.className = `calc__barra-g calc__barra-g--${r.grupo}`;
    }

    if (depurar) {
      traza.hidden = false;
      traza.innerHTML = `<h3>Traza de resolución</h3>
        <div class="aps-calc__tabla"><table>
        <thead><tr><th>escrito</th><th>código</th><th>condición</th><th>patología</th><th>pje</th><th>estado</th></tr></thead>
        <tbody>${r.items.map((i) => `<tr>
          <td>${esc(i.entrada)}</td><td>${esc(i.codigo ?? '—')}</td><td>${i.condicion ?? '—'}</td>
          <td>${esc(i.patologia ?? '—')}</td><td>${i.puntaje ?? '—'}</td><td>${i.estado}</td></tr>`).join('')}
        </tbody></table></div>
        <p>${esc(META.fuente)} · ${CODIGOS.size} patologías</p>`;
    }
  }


  /* ---------- events ---------- */
  input.addEventListener('input', sugerir);
  /* Opens on click and on typing, but NOT on programmatic focus: returning focus
     after adding from the listing used to dump all 52 options over the page and
     cover the controls below the field. ArrowDown opens it from the keyboard. */
  input.addEventListener('click', sugerir);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!sugerencias.children.length) sugerir();
      mover(1);
    }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1); }
    else if (e.key === 'Escape' || e.key === 'Tab') {
      /* Tab dismisses the list. Without this, focus lands on the listbox — a
         scrollable region, which Chrome makes focusable — and the user is on a
         list they cannot act on. */
      cerrarSugerencias();
    }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const items = [...sugerencias.querySelectorAll('li')];
      if (marcada >= 0 && items[marcada]) { limpiarAviso(); agregar(elegido(items[marcada])); }
      else if (input.value.trim()) agregarConCuidado(input.value);
    }
  });

  sugerencias.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-nombre]');
    if (li) { limpiarAviso(); agregar(elegido(li)); input.focus(); }
  });

  lista.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-quitar]');
    if (b) { quitar(Number(b.dataset.quitar)); input.focus(); }
  });

  /* Clearing wipes a patient's whole entry and the array is only in memory, so
     an undo is cheaper than a confirm dialog and strictly better: confirms get
     click-through-trained within a week. */
  let deshacer = null;
  btnLimpiar?.addEventListener('click', () => {
    if (!entradas.length) return;
    const copia = [...entradas];
    entradas.length = 0;
    pintar();
    aviso.className = 'calc__aviso alert alert--info';
    aviso.innerHTML = `Se quitaron ${copia.length} patología${copia.length === 1 ? '' : 's'}. `
      + '<button type="button" class="aps-calc__deshacer">Deshacer</button>';
    aviso.hidden = false;
    clearTimeout(deshacer);
    deshacer = setTimeout(limpiarAviso, 10000);
    aviso.querySelector('.aps-calc__deshacer').addEventListener('click', () => {
      entradas.push(...copia);
      limpiarAviso();
      pintar();
      input.focus();
    });
  });

  /* The panels are native <dialog>: the browser already supplies the backdrop,
     the focus trap and Escape. Hand-rolling it would be more code and worse
     accessibility. */
  for (const boton of raiz.querySelectorAll('[data-abre]')) {
    boton.addEventListener('click', () => {
      const dlg = raiz.querySelector(`#${boton.dataset.abre}`);
      if (!dlg) return;
      if (boton.dataset.abre === 'dlg-listado') { if (filtro) filtro.value = ''; pintarListado(); }
      dlg.showModal();
    });
  }
  for (const dlg of raiz.querySelectorAll('dialog')) {
    // Clicking the backdrop closes, which is what people expect of an overlay.
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }

  document.addEventListener('click', (e) => {
    if (!raiz.contains(e.target)) cerrarSugerencias();
  });

  /* ---------- reference listing: every CIE-10 code, with its title ---------- */
  const FILAS = codigosPorCondicion();
  const cuerpoListado = $('.aps-calc__listado tbody', raiz);
  const filtro = $('.aps-calc__filtro', raiz);
  const conteo = $('.aps-calc__conteo', raiz);

  function pintarListado() {
    const crudo = filtro?.value ?? '';
    const visibles = filtrarListado(FILAS, crudo);
    /* The listing used to be a dead end: you looked a name up here, closed the
       panel and retyped it — into the field where an ambiguous name is exactly
       the hazard this listing helps avoid. Now the row adds it. */
    cuerpoListado.innerHTML = visibles.map(({ fila: f, aciertos, porNombre }) => {
      const abierto = aciertos.size > 0 && !porNombre;
      const cods = f.todos.map((c) => `<div class="lst__cod${c.maestro ? ' lst__cod--m' : ''}${aciertos.has(c.codigo) ? ' lst__cod--hit' : ''}">
          <b>${esc(c.codigo)}</b><span>${esc(c.titulo || '—')}${c.otra ? `<small>Este código cuenta como «${esc(c.otra)}»</small>` : ''}</span></div>`).join('');
      return `<tr>
      <td>${f.n}</td>
      <td><button type="button" class="aps-calc__anadir" data-nombre="${esc(f.nombre)}">${esc(f.nombre)}</button></td>
      <td><b>${f.puntaje}</b></td>
      <td class="aps-calc__codigos">${esc(rangos(f.visibles))}
        <details class="lst__mas"${abierto ? ' open' : ''}><summary>Ver ${f.todos.length} código${f.todos.length === 1 ? '' : 's'} CIE-10${aciertos.size && !porNombre ? ` · ${aciertos.size} coincide${aciertos.size === 1 ? '' : 'n'}` : ''}</summary>
          <div class="lst__cods">${cods}</div></details></td>
    </tr>`;
    }).join('');
    conteo.textContent = visibles.length === FILAS.length
      ? `${FILAS.length} patologías · ${META.codigos} códigos`
      : `${visibles.length} de ${FILAS.length} patologías`;
  }
  filtro?.addEventListener('input', pintarListado);
  cuerpoListado?.addEventListener('click', (e) => {
    const b = e.target.closest('.aps-calc__anadir');
    if (!b) return;
    limpiarAviso();
    agregar(b.dataset.nombre);
    raiz.querySelector('#dlg-listado')?.close();
    input.focus();
  });

  pintar();
  return { agregar, quitar, pintar, pintarListado, get entradas() { return [...entradas]; } };
}

/* Auto-start — in the BROWSER only. Under node (tests/ui.test.mjs pins this
 * module's pure contract) there is no document, and the import must not explode
 * before the first test runs. If anything fails it is said on screen — never a
 * silent catch. */
if (typeof document !== 'undefined') for (const raiz of document.querySelectorAll('[data-aps-calc]')) {
  try {
    iniciar(raiz);
  } catch (error) {
    raiz.innerHTML = `<p class="alert alert--warn">La calculadora no pudo iniciarse: ${esc(error.message)}</p>`;
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
    red.classList.toggle('is-on', fuera);
    red.textContent = fuera ? 'Sin conexión: funciona igual, con la versión guardada en este equipo.' : '';
  };
  addEventListener('online', marcar);
  addEventListener('offline', marcar);
  marcar();
}

export { resolver, evaluar, ETIQUETAS, esc as escDe };
