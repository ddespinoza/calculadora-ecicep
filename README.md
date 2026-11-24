# calculadora-ecicep

The ECICEP risk calculator: its web page, its clinical **engine** and its **data**. That is 52 chronic conditions, their
weights, and the 1001 CIE-10 codes that reach them, taken from *Marco Operativo ECICEP 2025*,
Anexo 4, pp. 94-101.

[`motor.mjs`](motor.mjs) is pure domain — no DOM, no I/O, no dependencies, plain ESM. That is what
makes the clinical surface testable in Node in milliseconds, and what stops an interface change from
ever moving a score.

> **Status (2026-11-24): the Calculator is published from here since v1.1.0.**
> The engine was split out of [`APS-Conecta/aps-conecta-web`](https://github.com/APS-Conecta/aps-conecta-web)
> (the *Site*) on 2026-08-27 and tagged `v1.0.0`. The Site's calculator page no longer exists, so its
> interface was ported into [`site/`](site/index.html)
> ([ADR-0002](docs/adr/0002-the-calculator-lives-here-on-github-pages.md)). The public page changes
> **only when a GitHub Release is published**. `./scripts/check.sh` runs the whole gate: the engine,
> the data, the data against the MINSAL PDF, the interface's pure helpers and the assembled site.
> The data pipeline in `scripts/fuente/` reproduces the shipped CSV byte for byte. Dated history is
> in [`CHANGELOG.md`](CHANGELOG.md).

**Use it:** <https://ddespinoza.github.io/calculadora-ecicep/>. Type the patient's confirmed
conditions by name or CIE-10 code and read the risk group (G0–G3) and its strategy. Open «Listado de
patologías y códigos CIE-10» to browse all 52 conditions and their 1001 codes with titles. It runs
entirely in the browser, keeps working offline after the first visit, and sends nothing anywhere.

## Where things are

| | |
|---|---|
| [`motor.mjs`](motor.mjs) | The clinical rules: resolution, dedup, score, cut-offs. Hand-written |
| [`ecicep-codigos.mjs`](ecicep-codigos.mjs) | **Generated** by `scripts/build-codigos.mjs`. Never hand-edited — the check catches it |
| [`ecicep-titulos.mjs`](ecicep-titulos.mjs) | **Generated** beside it: the CIE-10 title of every code, for display only |
| [`site/`](site/index.html) | The Calculator: page, styles, `ui.mjs`, offline service worker. The three engine modules in it are symlinks to the root |
| [`scripts/build-site.mjs`](scripts/build-site.mjs) | `site/` + engine → `_site/`, version stamped. Copies; bundles nothing |
| [`.github/workflows/pages.yml`](.github/workflows/pages.yml) | Gate, then deploy to Pages, on a published Release only |
| [`datos/codigos_ecicep_estratificacion.csv`](datos/codigos_ecicep_estratificacion.csv) | The clinical artifact of record: 10 columns, 1003 rows, CRLF |
| [`scripts/build-codigos.mjs`](scripts/build-codigos.mjs) | CSV → ES module. Decides no score, corrects no code, reorders nothing |
| [`scripts/fuente/`](scripts/fuente/gen_enriquecido.py) | The generators that produce the CSV |
| [`tests/`](tests/motor.test.mjs) | The engine, the data, the data against the MINSAL PDF, the interface helpers, and the assembled site |
| [`CHANGELOG.md`](CHANGELOG.md) | What changed, when, and whether it has reached anyone |

## What this is, and what it is not

It is the part of the calculator a clinician's result actually depends on: which condition a code
resolves to, what it scores, and which group that adds up to. Everything here runs the same in a
browser and in Node, because it touches neither.

The interface lives here too, in `site/`, and is kept apart from the engine. `site/ui.mjs` draws
the field, the listing, the Kaiser pyramid and the result card, but every score, cut-off, label and
strategy it shows comes from `motor.mjs`. What it shows is held to what the engine would do: a code
printed beside a condition always resolves to that condition.

It is **not a general CIE-10 library** either. It knows only the codes Anexo 4 assigns to the 52
ECICEP conditions, plus two range rules (`C00-C97`, `D00-D48`). Anything outside that list resolves
to `null` and is reported as unknown — never as a silent zero.

And it decides no clinical policy of its own. The weights and the cut-offs are the source
spreadsheet's, which had already resolved them from the MINSAL documents; this code implements that
and nothing else.

## How the score is computed

```
RESOLVE   each entry → one of 52 conditions
          exact code → subcode rolls up to its master (E11.9 → E11)
          → range rule (C00-C97, D00-D48) → search by name
DEDUP     each condition counts once; a second appearance is marked «repetida»
SCORE     sum over DISTINCT conditions; 2 points for {11, 13, 14, 17, 22, 23, 27, 29}, 1 for the rest
GROUP     0 → G0 · 1 → G1 · 2-4 → G2 · 5+ → G3
```

Stratification runs on the **weighted score**, not on the count of distinct conditions — and that
distinction is not cosmetic at the G1/G2 boundary. The MINSAL documents define G3 and G2 on a
weighted count but write G1 as plain *"1 condición crónica"*. The spreadsheet resolves the boundary
on `puntaje`, so a patient whose only condition is diabetes mellitus scores 2 and is **G2**, not G1.
This engine follows the spreadsheet, because that is the artifact that recorded its own outputs and
can be tested against. You can see it in one line:

```bash
node -e "import('./motor.mjs').then(m => console.log(m.evaluar(['E11'])))"
# → distintas: 1, puntaje: 2, grupo: 'G2', etiqueta: 'Moderado'
```

Group cut-offs, labels, descriptions and the strategy text ship with the engine, so the guidance
travels with the number.

## Quickstart

Everything runs offline from the root of a checkout, with nothing installed.

1. `./scripts/check.sh` runs the whole gate and ends in `todo en orden`. Underneath it is
   `node --test 'tests/*.test.mjs'` (40 tests, `# fail 0`; anything else means a rule, a code or the
   page's contract moved) plus the generated-file check. Verified on Node v22 and v24.
2. `node scripts/build-codigos.mjs --check` prints
   `ecicep-codigos.mjs al dia (1001 codigos, 52 condiciones, 2 reglas)` and the same line for
   `ecicep-titulos.mjs`, then exits 0. A non-zero exit means a generated module and the CSV disagree,
   which is how a hand-edit gets caught.
3. `node -e "import('./motor.mjs').then(m => console.log(m.evaluar(['E11','I10'])))"` — scores a
   case without a browser. Diabetes plus hypertension prints `puntaje: 3`, `grupo: 'G2'`.

The test tiers answer different questions.
[`tests/motor.test.mjs`](tests/motor.test.mjs) checks the engine against
[`tests/golden.fixture.json`](tests/golden.fixture.json), whose cases marked `fuente: planilla` come
from the spreadsheet's own recorded outputs. [`tests/datos.test.mjs`](tests/datos.test.mjs) checks
the shipped data: 52 conditions, 1003 rows, the eight double weights, per-condition counts against
the spreadsheet's ÍNDICE tab, and that the generated module still matches the CSV.
[`tests/fuente.test.mjs`](tests/fuente.test.mjs) checks the data against the MINSAL PDF itself,
through [`tests/anexo4-fuente.fixture.json`](tests/anexo4-fuente.fixture.json), which was extracted
from Anexo 4 by a different route than the one that produces the CSV — so it compares two
independent extractions rather than one with itself. [`tests/ui.test.mjs`](tests/ui.test.mjs) holds
the page's pure helpers: input splitting, the refusal to guess on an ambiguous name, escaping, and
the rule that a listed code resolves to the condition it is listed under.
[`tests/sitio.test.mjs`](tests/sitio.test.mjs) assembles the Pages site and checks that it carries
the engine byte for byte, a title for every code, and every file the offline cache needs. The first
test in each file asserts its fixture is not empty, because an empty fixture makes everything below
it pass while checking nothing.

## Install — there is nothing to install

No `package.json`, no dependencies, no bundler, and nothing published to a registry. That is a
decision, not an omission: one `.mjs` file is importable by a browser and by `node --test` with
nothing in between, and a bundler standing between the CSV and the clinician would be one more thing
to trust.

People use the Calculator at its Pages address, so they need nothing installed. To embed the
engine elsewhere, take the files attached to a release and keep them **side by side**:

- [`motor.mjs`](motor.mjs)
- [`ecicep-codigos.mjs`](ecicep-codigos.mjs)
- [`ecicep-titulos.mjs`](ecicep-titulos.mjs), only if you show CIE-10 titles

`motor.mjs` imports `./ecicep-codigos.mjs` by relative path, so separating them breaks the import.
`datos/`, `scripts/` and `tests/` exist to produce and defend these files and are not deployed.

Requirements are whatever loads an ES module: any current browser, or Node — verified on v22.23.0.
`motor.mjs` itself calls no Node API at all; only the build script and the tests do.

## API

The public surface, one line each. The source is short and commented — read
[`motor.mjs`](motor.mjs) for the exact shapes rather than trusting a restatement here.

| Export | Signature | What it gives you |
|---|---|---|
| `evaluar` | `evaluar(entradas = []) → { items, distintas, puntaje, grupo, etiqueta }` | Scores a list. Every entry survives in `items`, marked `ok`, `repetida` or `desconocida` |
| `resolver` | `resolver(entrada) → { condicion, patologia, puntaje, codigo } \| null` | One code or name → one condition. `null` when it is outside the list |
| `interpretar` | `interpretar(entrada) → { tipo: 'ok' \| 'ambiguo' \| 'desconocido' \| 'vacio', … }` | Like `resolver`, but refuses to guess: an ambiguous name returns `opciones` for a human to choose from |
| `buscar` | `buscar(texto = '') → [{ n, nombre, puntaje, codigos, coincide }]` | Search by name or by code; empty text returns all 52. `coincide` carries the code that produced the hit |
| `listado` | `listado() → [{ n, nombre, puntaje, codigos }]` | The 52-condition reference table, master codes preferred |
| `GRUPOS` | `GRUPOS(puntaje) → 'G0' \| 'G1' \| 'G2' \| 'G3'` | The cut-offs alone |
| `META` | object | Source document, origin CSV, generator, and the counts of the shipped data |
| `ETIQUETAS` | `{ G0…G3 }` | Group labels, as the spreadsheet writes them |
| `DESCRIPCIONES` | `{ G0…G3 }` | What each group means, in terms of the score |
| `ESTRATEGIAS` | `{ G0…G3 }` | The principal strategy per level, from the founding ECICEP document |

[`ecicep-codigos.mjs`](ecicep-codigos.mjs) additionally exports `DATOS` — `meta`, `condiciones`,
`codigos` and `reglas`, and [`ecicep-titulos.mjs`](ecicep-titulos.mjs) exports `TITULOS`, a map
from each code to its CIE-10 title. `site/ui.mjs` reads both directly.

Values and user-facing strings are Spanish, because the people reading them are; the code and every
document around it is English.

`interpretar()` exists for a clinical-safety reason worth knowing before you skip it: typing
`renal` matches both *Enfermedad renal crónica* (1 point) and *Enfermedad renal crónica avanzada*
(2 points). Resolving by first match and carrying on silently changes the group at the G1/G2
boundary — which is to say it changes how often the person is seen. An exact code is never
ambiguous; an ambiguous name is returned to the caller undecided.

## Consumers and releases

The one Consumer is [`site/ui.mjs`](site/ui.mjs), in this repository. It imports `evaluar`,
`resolver`, `listado`, `buscar`, `interpretar`, `normalizar`, `META`, `ETIQUETAS` and `ESTRATEGIAS`,
plus `DATOS` and `TITULOS`. A rename breaks [`tests/ui.test.mjs`](tests/ui.test.mjs) in the same pull
request, instead of breaking a vendored copy somewhere else. Until 2026-11-24 the Consumer was the
Site, which copied the files into its theme. That copy was retired when the page moved here.

**A release is what changes the public page.** Publishing a GitHub Release runs
[`pages.yml`](.github/workflows/pages.yml): it runs the gate, assembles `_site/` with the tag
stamped into the footer and the offline cache name, deploys it to Pages, and attaches `motor.mjs`,
`ecicep-codigos.mjs` and `ecicep-titulos.mjs` to the release for anyone who copies them. Merging to
`main` changes nothing a clinician sees. The steps are in [`AGENTS.md`](AGENTS.md#releasing).

To preview locally:

```bash
node scripts/build-site.mjs && python3 -m http.server -d _site 8000   # http://localhost:8000
```

## Regenerating the data

The pipeline, in the order it actually runs — the middle script is not the CSV's writer, which the
Site's documentation got wrong from 2026-08-25 until 2026-08-27:

```
parse_paho.py           PAHO CIE-10 Vol.1 (Spanish) → paho_titles.json, the title table
gen_codigos_ecicep.py   the 52 conditions, hand-typed from Anexo 4 → a 7-column TSV
gen_enriquecido.py      imports the above, joins paho_titles.json plus a hand-curated table
                        (which supplies N18.1-N18.6, absent from the PAHO base) → the 10-column CSV
build-codigos.mjs       CSV → ecicep-codigos.mjs
```

When MINSAL republishes Anexo 4:

1. `python3 scripts/fuente/gen_enriquecido.py` — writes
   `datos/codigos_ecicep_estratificacion.csv` (and the intermediate TSV). Output defaults to this
   repository's `datos/`; set `ECICEP_OUT` to write elsewhere, which is the safe way to diff a
   regeneration before it lands on the shipped file.
2. `md5sum datos/codigos_ecicep_estratificacion.csv` — against unchanged inputs this reproduces
   `ade58f4a6cbb4efa2a71fe3bdf892a9f`, measured. If nothing in Anexo 4 moved and this hash moved, the
   pipeline changed the data rather than the document did.
3. `node scripts/build-codigos.mjs` — regenerates the module.
4. `node --test 'tests/*.test.mjs'` — the data tier fails if per-condition counts drifted from the
   spreadsheet's ÍNDICE, and the source tier fails if the shipped codes stopped matching the PDF.

[`scripts/fuente/parse_paho.py`](scripts/fuente/parse_paho.py) is **not** a step you run. It reads a
text extraction of the PAHO volume that this repository does not ship, and it still hardcodes the
path where that file used to live. Its output, [`paho_titles.json`](scripts/fuente/paho_titles.json),
is committed, so the runnable pipeline starts at step 1. The script is kept as the record of how the
title table was built.

⚠️ **The CSV's row order is clinically load-bearing.** `N18`, `Z71` and `Z72` each appear under more
than one condition and resolve by first match, the way a `VLOOKUP` does, so re-sorting the file
silently changes a clinical result. Only `N18` changes the score (1 as chronic kidney disease, 2 as
advanced); `Z71` and `Z72` score 1 either way. For the same reason the file must stay CRLF: no
`.gitattributes` with `text=auto` may be added here, because normalising line endings would rewrite
the bytes of the artifact of record.

Never hand-edit `ecicep-codigos.mjs`. It is generated, `--check` detects the edit, and the next
regeneration would overwrite it anyway.

## Licence

**AGPL-3.0-or-later** — see [`LICENSE`](LICENSE). The organisation is AGPL across every repository,
and the split changed nothing about that.

This repository vendors no third-party code and has no dependencies, so there is no notices document
to keep: everything under [`motor.mjs`](motor.mjs), [`scripts/`](scripts/build-codigos.mjs) and
[`tests/`](tests/datos.test.mjs) was written here.

The data is a different question from the code. It is derived from *Marco Operativo ECICEP 2025*
(MINSAL, Anexo 4, pp. 94-101) and from the CIE-10 Vol.1 title list published by PAHO. Those
documents belong to their publishers; what ships here is the extraction and the code that reads it.
