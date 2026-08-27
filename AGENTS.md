# AGENTS.md — Calculadora ECICEP (the Engine)

GitHub: `APS-Conecta/calculadora-ecicep`. Default branch `main`. Licence AGPL-3.0-or-later.

This file holds the **project-specific** rules and is canonical for this repository. `CLAUDE.md` is a
thin `@AGENTS.md` pointer — don't duplicate rules there. The vocabulary is in
[`CONTEXT.md`](CONTEXT.md), and every term capitalised below is defined there. New decisions become
ADRs under [`docs/adr/`](docs/adr/), each with a `Status:` field, never renumbered.

This repository is the clinical engine and data of the ECICEP risk calculator, split out of the Site
(`APS-Conecta/aps-conecta-web`) on 2026-08-27. It has no interface, no server and no build.

**Language split:** code, comments, commits, issues and every document here are in **English**.
Spanish appears only where it is data or user-facing: condition names, the CSV's column headers, and
the strings the Engine exports for an interface to print (`ETIQUETAS`, `DESCRIPCIONES`,
`ESTRATEGIAS`). The existing Spanish identifiers (`evaluar`, `resolver`, `puntaje`, `condicion`) are
the public surface — see rule 4 — and are not translated.

## The rules that are specific to this repository

### 1. The Engine is pure, and stays pure

`motor.mjs` touches no DOM, performs no I/O and depends on nothing — no package, no polyfill, no
`package.json`. That is what makes the clinical rules testable in milliseconds and what stops an
interface change from ever moving a score.

There is **no build step**, by decision: one `.mjs` file is importable by the browser and by
`node --test` with no bundler and no dependency tree. Do not add a `package.json`; do not add a
`Makefile` either (besides being useless here, it switches on documentation rules that are inert
without one). A change that needs a dependency is the wrong change.

### 2. `ecicep-codigos.mjs` is generated — hand-editing it fails the gate

`scripts/build-codigos.mjs` writes it from the CSV and decides nothing: no score, no code, no
reordering. `node scripts/build-codigos.mjs --check` fails on any drift, and `tests/datos.test.mjs`
runs that check, so a hand edit does not survive the gate.

To change data, change the Data (or the pipeline that writes it) and regenerate. Never patch the
generated module to fix what the CSV says.

### 3. The CSV's row order is load-bearing

`datos/codigos_ecicep_estratificacion.csv` resolves by first match, the way a `VLOOKUP` does. `N18`,
`Z71` and `Z72` each appear under more than one Condition, and `N18` scores 1 under *Enfermedad renal
crónica* and 2 under *Enfermedad renal crónica avanzada*. **Re-sorting the file silently changes a
clinical result.**

So: never sort it, never re-serialise it through a tool that rewrites rows, and never add a
`.gitattributes` with `text=auto` — the file is CRLF, and normalising the line endings would rewrite
the bytes of the clinical artifact of record. Edit rows in place, and keep new rows where the
pipeline puts them.

### 4. The exported names are a contract

The Site **vendors** this engine: `motor.mjs` and `ecicep-codigos.mjs` are copied into its theme and
pinned by hash, not pulled as a submodule or a package. A rename here is a silent break there, and
that copy is the whole blast radius.

The names it destructures: `evaluar`, `resolver`, `listado`, `buscar`, `interpretar`, `META`,
`ETIQUETAS`, `DESCRIPCIONES`, `ESTRATEGIAS`. (`GRUPOS` is also exported.) Adding is safe; renaming,
removing, or changing the shape a function returns is a breaking change and needs the Consumer
updated in the same breath. `registro()` was removed on 2026-08-27 along with the Ingreso/Control
control that fed it.

### 5. Run `./scripts/check.sh` before committing

It runs the tests (`node --test 'tests/*.test.mjs'`) and the generated-file check
(`node scripts/build-codigos.mjs --check`). Both must pass before a commit; CI is not the first place
a failure should appear, because there is no build step to catch a mistake later.

The gate never skips: if Node is absent it **fails**, because a tier that skips itself is
indistinguishable from a tier that checks nothing. Report what actually ran — never a check that was
skipped as one that passed.

## Who writes what

| Fact | Written by | Nobody else touches it |
|---|---|---|
| CIE-10 titles | `scripts/fuente/parse_paho.py` — which **cannot be run here**: its source document is not redistributed. See [`docs/motor-ecicep.md`](docs/motor-ecicep.md) | → `scripts/fuente/paho_titles.json` |
| The 52 conditions, their points and their codes | `scripts/fuente/gen_codigos_ecicep.py`, hand-typed from Anexo 4 | → a 7-column TSV, consumed by the next step |
| The shipped CSV | `scripts/fuente/gen_enriquecido.py`, joining the two above plus a hand-curated `MANUAL` table that supplies `N18.1`–`N18.6` (absent from the PAHO base) | → `datos/codigos_ecicep_estratificacion.csv` |
| The importable table | `scripts/build-codigos.mjs` | → `ecicep-codigos.mjs` is **generated** and gets overwritten |
| Clinical rules — cut-offs, de-duplication, resolution order | `motor.mjs` | An interface decides nothing |

Two things worth knowing before you trust a sentence about this pipeline. The Site's documentation
named `gen_codigos_ecicep.py` as the CSV's writer from 2026-08-25 until 2026-08-27; it is not,
`gen_enriquecido.py` is.
And until 2026-08-27 these generators were under **no version control at all**, living on a personal
sync share — which is why regeneration is now a checked property: running the pipeline reproduces the
committed CSV byte for byte (md5 `ade58f4a6cbb4efa2a71fe3bdf892a9f`).

## Changing clinical data

A change to points, codes or conditions is a clinical change, not a data-entry change. It must name
the page of Anexo 4 it comes from, move through the pipeline rather than into the CSV by hand where
the generators can express it, and land with the gate green and `tests/fuente.test.mjs` still
agreeing with the document fixture. If a change makes the CSV disagree with Anexo 4, the change is
what is wrong.
