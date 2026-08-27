# The ECICEP engine — how it works and how it is maintained

This repository is the clinical engine and the data of the ECICEP risk calculator: it turns a list of
CIE-10 codes or pathology names into a weighted score and a risk group G0–G3, per Marco Operativo
ECICEP 2025. It carries no interface. It was split out of `aps-conecta-web` on 2026-08-27, which is
also the day its generators came under version control for the first time — until then they lived on
a personal sync share, outside git, on one machine.

Read this document to change the data, to regenerate it, or to understand why a score came out the
way it did. Everything below was measured against the files in this repository on 2026-08-27, not
recalled.

## Who writes what

One writer per datum. Where the honest answer to *"who writes this?"* is **nobody**, the table says
so — those rows are the ones that rot.

| Datum | Written by | Everyone else reads it |
|---|---|---|
| The 52 conditions: number, name, points, and the CIE-10 tokens under each | A person, by hand, into the `COND` table of `scripts/fuente/gen_codigos_ecicep.py`, transcribing Marco Operativo 2025, Anexo 4, pp. 94–101 | This is the origin of every clinical fact in the repository |
| The two range rules (`C00-C97`, `D00-D48`) | The `REGLA38` table in the same file | Condition 38 has no individual codes at all |
| Official CIE-10 Spanish titles | `scripts/fuente/parse_paho.py` → `scripts/fuente/paho_titles.json` | **Not runnable here.** Its input, the PAHO Vol.1 text dump, is not in this repository, and the script still writes to a hardcoded personal path. `paho_titles.json` is a committed artefact with no runnable writer — see *Known gaps* |
| Titles for the 13 codes the PAHO base lacks (`N18.1`–`N18.6`, `I48.0`–`I48.4`, `I48.9`, `K52.3`), plus a repaired one for `I23.2`, whose title the tabular list wraps mid-sentence | The hand-curated `MANUAL` table inside `scripts/fuente/gen_enriquecido.py` | Without it the six renal stages would ship with an empty title. `gen_enriquecido.py` prints `Sin nombre CIE-10: 0` when every code got one |
| The note that `I23.2` is probably a typo in the source document | The `NOTA_ESPECIAL` table in `gen_enriquecido.py` | The code is transcribed faithfully anyway. The document is the record; the disagreement is a note, not a correction |
| `datos/codigos_ecicep_estratificacion.csv` — 10 columns, 1003 data rows, CRLF | **`scripts/fuente/gen_enriquecido.py`**, which imports the table above and joins it against `paho_titles.json` | Not `gen_codigos_ecicep.py`. That one writes a 7-column TSV and is *imported by* the enriched generator |
| `ecicep-codigos.mjs` — 1001 codes, 2 rules, 52 conditions | `scripts/build-codigos.mjs` | **Generated.** Hand-editing it is caught by `--check`, which compares it byte-for-byte against a fresh build |
| The accented display names for 25 of the 52 conditions | The `CON_TILDES` table in `scripts/build-codigos.mjs` | Display only. It asserts that stripping the accents reproduces the CSV name exactly, so a typo fails the build instead of shipping |
| Cut-offs, dedup, first-match order, the refusal to guess on an ambiguous name | `motor.mjs` | No consumer decides anything clinical. An interface change cannot move a score |
| CSV columns `Grupo`, `Código maestro`, `Nombre maestro (CIE-10)`, `Nombre código (CIE-10)`, `Nota` | `gen_enriquecido.py` writes them | **Nobody in this repository reads them.** `build-codigos.mjs` requires and consumes five columns only: `N°`, `Patología`, `Puntaje`, `Código CIE-10`, `Tipo`. The other five exist for the human reader and for the spreadsheet |
| The copies of `motor.mjs` and `ecicep-codigos.mjs` in `aps-conecta-web`'s theme | **Nobody.** A person copies them across | They are byte-identical to this repository's today, and no script, test or gate in either repository checks that they stay so |
| CSV row order | `gen_codigos_ecicep.py`, implicitly: the token order is the PDF's order | Nobody may re-sort it — see *Row order is clinical* |

## Layers

```
PAHO CIE-10 Vol.1 (text dump — not in this repository)
        │  scripts/fuente/parse_paho.py            not runnable here: input missing
        ▼
scripts/fuente/paho_titles.json                    code → official Spanish title

Marco Operativo 2025, Anexo 4, pp. 94-101
        │  hand-typed
        ▼
COND + REGLA38 in scripts/fuente/gen_codigos_ecicep.py    52 conditions · points · code tokens
        │
        │  scripts/fuente/gen_enriquecido.py  (joins the titles + its own MANUAL table)
        ▼
datos/codigos_ecicep_estratificacion.csv           10 columns · 1003 data rows · CRLF
        │
        │  scripts/build-codigos.mjs
        ▼
ecicep-codigos.mjs                                 GENERATED · 1001 codes + 2 rules + 52 conditions
        │
        │  import
        ▼
motor.mjs                                          pure domain: no DOM, no I/O, no dependencies
        ├──────────────► tests/*.test.mjs          node --test, no browser, milliseconds
        └──────────────► aps-conecta-web           vendored copy inside its theme
```

`motor.mjs` imports exactly one thing, `ecicep-codigos.mjs`, and nothing else. That is what lets the
clinical rules be tested in Node without a browser, and what makes the engine importable by a plain
`<script type="module">` with no bundler.

## The public surface

The Site's `ui.mjs` destructures these. Renaming or removing one breaks the vendored copy silently,
because nothing checks the two repositories against each other:

`evaluar` · `resolver` · `interpretar` · `buscar` · `listado` · `META` · `ETIQUETAS` ·
`DESCRIPCIONES` · `ESTRATEGIAS`

`GRUPOS` is exported too and is used by the tests. `registro()` was removed on 2026-08-27 together
with the Ingreso/Control control it fed.

## How the score is computed

```
RESOLVE  one entry → one of 52 conditions, tried in this order:
         1. exact code, upper-cased with whitespace stripped        E11 → 14
         2. subcode rolls up to its master                          E11.9 → E11 → 14
         3. range rule: same letter, base number inside the range   C50 → C00-C97 → 38
         4. name, accent-insensitive, 3 characters or more:
            exact name first, then the first substring match by condition number
         Anything else returns null. Never a silent zero.

DEDUP    each condition counts ONCE. A second appearance is kept in the detail and
         marked `repetida`; an unresolvable entry is kept and marked `desconocida`.
         No entry ever disappears from the detail.

SCORE    sum of the points of the DISTINCT conditions.
         2 points for conditions {11, 13, 14, 17, 22, 23, 27, 29}, 1 for the other 44.

GROUP    0 → G0 · 1 → G1 · 2 to 4 → G2 · 5 or more → G3
```

Stratification runs on the **weighted score**, never on the count of distinct pathologies. One
double-weighted condition alone scores 2 and lands in G2.

The code index is built by walking the CSV in order and keeping the **first** occurrence of each
code, the way a `VLOOKUP` resolves. Three codes appear under more than one condition, so that
sentence is a clinical rule, not an implementation detail.

`interpretar()` exists because `resolver()` alone is unsafe at the keyboard: typing `renal` matches
both *Enfermedad renal crónica* (1 point) and *Enfermedad renal crónica avanzada* (2 points), and
taking the first silently moves the person across the G1/G2 boundary. Faced with an ambiguous name
`interpretar()` returns `tipo: 'ambiguo'` with the options and decides nothing. An exact code is
never ambiguous, even when its name is.

## Regenerating the code list

When MINSAL republishes Anexo 4, edit the `COND` table in `scripts/fuente/gen_codigos_ecicep.py` —
that is the only place the clinical facts are written — then run, from the repository root:

```bash
python3 scripts/fuente/gen_enriquecido.py    # rewrites datos/codigos_ecicep_estratificacion.csv
node scripts/build-codigos.mjs               # CSV → ecicep-codigos.mjs
node --test 'tests/*.test.mjs'               # 23 tests
node scripts/build-codigos.mjs --check       # the committed module matches the CSV
```

**Run `gen_enriquecido.py`, not `gen_codigos_ecicep.py`.** The Site's documentation named
the second one as the CSV's writer. It is not: it writes a 7-column TSV and exists to be imported by
the first, which joins it against `paho_titles.json` and its own `MANUAL` table and writes the
10-column CSV this repository ships. Running the wrong one does not corrupt the CSV — it writes a
TSV under the same base name — but it produces no new CSV either, so the build that follows would
silently rebuild the old data.

Both generators write to `datos/` by default and honour `ECICEP_OUT`. Use it to regenerate somewhere
harmless and compare before overwriting the artefact of record; `.repro/` is already gitignored for
exactly this:

```bash
ECICEP_OUT=.repro python3 scripts/fuente/gen_enriquecido.py
md5sum .repro/codigos_ecicep_estratificacion.csv datos/codigos_ecicep_estratificacion.csv
```

**The regeneration is reproducible byte-for-byte.** The committed CSV is
`md5 ade58f4a6cbb4efa2a71fe3bdf892a9f`. If a run reproduces that hash, nothing changed and the diff
you are looking at is an accident — line endings, a locale, an editor. If it does not, something in
the clinical data moved and the tests below are what tell you what.

Never hand-edit `ecicep-codigos.mjs`. `node scripts/build-codigos.mjs --check` prints
`ecicep-codigos.mjs al dia (1001 codigos, 52 condiciones, 2 reglas)` when the file matches, exits 1
when it does not, and `tests/datos.test.mjs` runs it as a test so a hand edit cannot pass the suite.

All of it is wrapped by `./scripts/check.sh`, which is also the only thing this repository's CI
runs. It has three tiers — the engine tests, the generated-file check, and a syntax check over
`scripts/fuente/*.py` — and no tier skips itself: a missing `node` or `python3` is a failure, because
a tier that skips is indistinguishable from a tier that checks nothing. The Site keeps its own
`check.sh`, which additionally checks PHP, JSON and the Open Graph card; none of those exist here.

## Row order is clinical

`N18`, `Z71` and `Z72` each appear under more than one condition in Anexo 4 itself, and resolve by
first match. Re-sorting the CSV changes a clinical result. Only `N18` changes the *score* — 1 point
as *Enfermedad renal crónica* (condition 21), 2 as *avanzada* (condition 22); `Z71` and `Z72` score
1 under either owner.

The CSV is CRLF, because Python's `csv.writer` terminates lines that way by default and the file is
written by it. **Never add a `.gitattributes` with `text=auto`**: normalising the line endings would
rewrite every byte of the clinical artefact of record and destroy the md5 above as a signal.

## Tests

```bash
node --test 'tests/*.test.mjs'     # 23 tests, 23 pass, ~160 ms
```

| Tier | What it proves |
|---|---|
| `tests/motor.test.mjs` + `tests/golden.fixture.json` | The engine against the **spreadsheet**. 11 resolution cases, 11 stratification cases and 2 that must not resolve; the cases marked `fuente: planilla` are copied from the spreadsheet's Tutorial tab, which records its own outputs. Also pins the cut-offs, the reference listing, `buscar()` by name and by code, and `interpretar()`'s refusal to guess |
| `tests/fuente.test.mjs` + `tests/anexo4-fuente.fixture.json` | The shipped data against the **MINSAL PDF**. The fixture was extracted from Anexo 4 with `pdftotext`, a different route from the one that produces the CSV, so the comparison crosses two independent extractions instead of one with itself. It asserts all 52 points, that every printed code resolves to a condition the document assigns it (over 900 checked), and that the only ambiguous codes are still exactly `N18`, `Z71`, `Z72` — a new one fails the suite instead of resolving quietly |
| `tests/datos.test.mjs` | The **shape** of the generated data: 52 conditions, 1003 rows, the eight double weights, every score 1 or 2, the `N18` split between conditions 21 and 22, per-condition code counts against the spreadsheet's ÍNDICE tab, and that the generated module still matches the CSV |

The first test in each file asserts the fixture is not empty. An empty fixture makes every assertion
below it pass while checking nothing.

## No build step

There is no `package.json` and no `Makefile`, deliberately: one `.mjs` file is importable by the
browser and by `node --test` with no bundler, no install and no lockfile. Adding either would also
switch on the documentation checker's command rules — every command documented in code voice for
one of those runners would then have to exist as a real target and be run by a gate — which are
inert today precisely because neither file is here.

## Debugging a disagreement

A disputed result reproduces with no browser and no site:

```bash
node -e "import('./motor.mjs').then(m=>console.log(m.evaluar(['E11','I10'])))"
```

The returned `items` carry, per entry, the condition it resolved to, the code that produced the
match, its points and its state (`ok`, `repetida`, `desconocida`) — which is enough to see where the
engine and the spreadsheet parted company.

## Known gaps

Stated here because a gap nobody wrote down is indistinguishable from a decision.

- **`tests/datos.test.mjs` checks per-condition code counts for conditions 1–44 only.** Its
  `INDICE_PLANILLA` table has 44 keys; conditions 45 to 52 have no count reference at all, so a
  regeneration that added or dropped codes under those eight would pass. The anti-vacuity guard in
  front of it asserts `>= 44`, which is exactly the coverage it has, so it will not notice either.
- **`scripts/build-codigos.mjs` has a dead branch.** It reads
  `Number(fila['Puntaje'] ?? fila[col['Puntaje']])`, but `fila` is an array — the CSV parser returns
  arrays of cells, not objects — so `fila['Puntaje']` is `undefined` on all 1003 rows and the
  fallback is always what runs. Harmless today; misleading to read, because it implies a
  column-keyed row that does not exist.
- **The misattribution survives in code.** `scripts/build-codigos.mjs`'s header comment and
  `tests/anexo4-fuente.fixture.json`'s `_procedencia` both still name `gen_codigos_ecicep.py` as the
  CSV's writer. The pipeline is right; those two sentences are not.
- **`parse_paho.py` cannot be run from this repository.** Its input is not committed and it still
  writes to a hardcoded personal path, so `paho_titles.json` — 634 KB that names every code in the
  CSV — is a committed artefact whose writer nobody can execute. It is provenance, not a step. If
  the PAHO base ever needs to change, that script needs its inputs and its output path fixed first.
- **Nothing keeps the vendored copies in step.** `aps-conecta-web` holds its own copies of
  `motor.mjs` and `ecicep-codigos.mjs` inside its theme, and its own copies of the tests. They are
  byte-identical to this repository's as of 2026-08-27, verified by hash, and staying that way
  depends on a person remembering.
- **Regenerating leaves an untracked file.** `gen_enriquecido.py` writes
  `codigos_ecicep_estratificacion.tsv` beside the CSV, and `.gitignore` does not cover it, so
  `git status` reports it after every run in place. Use `ECICEP_OUT` and it lands in the ignored
  directory instead.

## What nothing checks — found by mutation testing, 2026-08-27

The tests above are strong on points, codes and cut-offs: changing a condition's puntaje fails three
tests, adding a bogus code fails two, widening a range rule fails one. The gaps below were found by
deliberately corrupting each datum and confirming the suite stayed green. They are recorded because a
gap nobody has written down is indistinguishable from a datum nobody has broken yet.

**The 52 condition names have no oracle.** `tests/anexo4-fuente.fixture.json` — the independent
extraction from the MINSAL PDF — stores only `{n, puntaje, codigos}` for each condition. It carries no
names at all. Renaming condition 5 from «Trastornos alimentarios» to «Trastornos alimenticios» leaves
23/23 passing. This is not cosmetic: the name is what `buscar()` and `resolver()` match on and what
`interpretar()` disambiguates between, so it is data the engine resolves *on*, not just data it
prints.

**The 1001 CIE-10 title cells have no writer anyone can re-run.** `paho_titles.json` supplies the
official title of every code, and it is produced by `scripts/fuente/parse_paho.py` from a PAHO
ICD-10 Vol. 1 text extraction that is **not in this repository** — the source is a third-party
publication this project does not redistribute. So the JSON is a committed blob whose generator
cannot currently be executed here. Corrupting a title, either in the hand-curated `MANUAL` table or
in the JSON, ships it: the generator's `Sin nombre CIE-10: 0` line is a non-emptiness check, never a
correctness one. Fourteen titles are hand-typed and the rest machine-extracted; none is checked.

**`CON_TILDES` cannot detect the error it exists to prevent.** `scripts/build-codigos.mjs` asserts
`sinTildes(bonito) === nombre`, but `sinTildes` strips every combining diacritic, so any *misplaced*
accent within the same letter sequence passes: «Anemia cronicá» builds, checks and tests clean. The
guard catches letter typos and is blind to accent placement, which is the table's whole purpose. Of
the 25 keys, deleting 19 individually ships the accent-stripped name with nothing failing; only 6 are
covered by a test. Nothing is wrong today — the other 27 condition names need no accent — but nothing
writes or checks that judgement either.

**`DESCRIPCIONES` restates the cut-offs in prose, and nothing ties the two together.** `GRUPOS()` cuts
at 0 / 1 / 2–4 / 5+, and `DESCRIPCIONES` says so again in Spanish. Changing `G2` to read «7 a 9 puntos
ponderados» while `GRUPOS` still cuts at 2–4 leaves the suite green, and ships a clinician-facing
sentence that contradicts the number printed beside it. `ETIQUETAS` and `ESTRATEGIAS` are partly
pinned by tests; `DESCRIPCIONES` is not pinned at all.

