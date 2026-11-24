# AGENTS.md — Calculadora ECICEP (the Engine and the Calculator)

GitHub: `ddespinoza/calculadora-ecicep` (moved from `APS-Conecta`, which redirects). Default branch
`main`. Licence AGPL-3.0-or-later. Published at <https://ddespinoza.github.io/calculadora-ecicep/>.

This file holds the **project-specific** rules and is canonical for this repository. `CLAUDE.md` is a
thin `@AGENTS.md` pointer — don't duplicate rules there. The vocabulary is in
[`CONTEXT.md`](CONTEXT.md), and every term capitalised below is defined there. New decisions become
ADRs under [`docs/adr/`](docs/adr/), each with a `Status:` field, never renumbered.

This repository is the clinical engine and data of the ECICEP risk calculator, split out of the Site
(`APS-Conecta/aps-conecta-web`) on 2026-08-27, and, since 2026-11-24, the Calculator itself: the
static page in `site/`, published to GitHub Pages on each release
([ADR-0002](docs/adr/0002-the-calculator-lives-here-on-github-pages.md)). It has no server, no
dependency and no bundler.

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

The Consumer is `site/ui.mjs`, in this repository. It imports `evaluar`, `resolver`, `listado`,
`buscar`, `interpretar`, `normalizar`, `META`, `ETIQUETAS` and `ESTRATEGIAS` from `motor.mjs`, `DATOS`
from `ecicep-codigos.mjs` and `TITULOS` from `ecicep-titulos.mjs`. (`GRUPOS` and `DESCRIPCIONES` are
also exported.) The same modules are attached to every release for anyone who copies them. Adding
is safe; renaming, removing, or changing the shape a function returns is a breaking change and needs
the Consumer updated in the same pull request. `tests/ui.test.mjs` imports the real `ui.mjs`, so a
break shows up in the gate. Until 2026-11-24 the Consumer was the Site, which vendored the files by
copy. `registro()` was removed on 2026-08-27 along with the Ingreso/Control
control that fed it.

### 5. Run `./scripts/check.sh` before committing

It runs the tests (`node --test 'tests/*.test.mjs'`, which include the interface's pure helpers and
an assembly of the Pages site) and the generated-file check (`node scripts/build-codigos.mjs
--check`, covering both generated modules). Both must pass before a commit; CI is not the first place
a failure should appear, because there is no build step to catch a mistake later.

The gate never skips: if Node is absent it **fails**, because a tier that skips itself is
indistinguishable from a tier that checks nothing. Report what actually ran — never a check that was
skipped as one that passed.

### 6. The Calculator (`site/`) decides nothing, and shows only what the Engine would do

`site/ui.mjs` is a DOM adapter. Every score, cut-off, label and strategy comes from `motor.mjs`.
What the page *displays* is held to the same standard. A code printed beside a condition must
resolve to that condition, which is why the listing filters through `resolver()` and why the Site's
«N18 beside ERC avanzada» display did not survive the port (ADR-0002).

- `site/motor.mjs`, `site/ecicep-codigos.mjs` and `site/ecicep-titulos.mjs` are **relative symlinks**
  to the root files. Never replace them with copies. `scripts/build-site.mjs` refuses to assemble if
  the deployed bytes differ from the root's.
- The page changes for the public **only on a published GitHub Release** (`pages.yml`). Do not add a
  deploy on push.
- `_site/` is build output and is gitignored. Preview with `node scripts/build-site.mjs && python3 -m
  http.server -d _site 8000`. A preview build reuses its version name, so bump `--version` or clear
  the site's storage, or the service worker keeps serving the previous preview.
- User-facing text is Spanish; code and comments are English.

## Releasing

One-time settings, already applied on 2026-11-24. Pages has its source set to **GitHub Actions**.
The `github-pages` environment allows deployments from the `main` branch **and from tags matching
`v*`**. A release runs on its tag, and without that rule the deploy is refused. Check with `gh api
repos/ddespinoza/calculadora-ecicep/environments/github-pages/deployment-branch-policies`.

1. Merge to `main` with the gate green, and add the version's entry to `CHANGELOG.md`.
2. `gh release create vX.Y.Z --target main --title "vX.Y.Z" --notes-file <notes>`, using semver on
   the exported surface: a rename is major, an addition minor, a fix patch.
3. `pages.yml` runs the gate, deploys `_site/` and attaches the three engine modules. Check that the
   footer of the live page shows the new tag.

## Who writes what

| Fact | Written by | Nobody else touches it |
|---|---|---|
| CIE-10 titles | `scripts/fuente/parse_paho.py` — which **cannot be run here**: its source document is not redistributed. See [`docs/motor-ecicep.md`](docs/motor-ecicep.md) | → `scripts/fuente/paho_titles.json` |
| The 52 conditions, their points and their codes | `scripts/fuente/gen_codigos_ecicep.py`, hand-typed from Anexo 4 | → a 7-column TSV, consumed by the next step |
| The shipped CSV | `scripts/fuente/gen_enriquecido.py`, joining the two above plus a hand-curated `MANUAL` table that supplies `N18.1`–`N18.6` (absent from the PAHO base) | → `datos/codigos_ecicep_estratificacion.csv` |
| The importable table | `scripts/build-codigos.mjs` | → `ecicep-codigos.mjs` is **generated** and gets overwritten |
| CIE-10 titles for display | `scripts/build-codigos.mjs`, from the CSV's `Nombre código (CIE-10)` | → `ecicep-titulos.mjs` is **generated**; nothing clinical reads it |
| The page people use | `site/` (hand-written), assembled by `scripts/build-site.mjs` | → `_site/`, deployed only by `pages.yml` on a release |
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
