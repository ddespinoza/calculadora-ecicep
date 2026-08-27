# Changelog — calculadora ECICEP (engine and data)

This repository ships no package and has no build step: its only consumer copies `motor.mjs` and
`ecicep-codigos.mjs` into its own tree, pinned by hash. So there is nothing to tag, and what a reader
actually needs is the date a clinical rule or a code changed — and whether it has reached anyone yet.
This file records that, so a claim can be dated without reading the git log.

Format: [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).

## The engine and its data become a repository of their own — 2026-08-27

Split out of [`APS-Conecta/aps-conecta-web`](https://github.com/APS-Conecta/aps-conecta-web), where
the clinical engine had been living inside the Site's WordPress theme beside the DOM code that draws
it. What arrived here: `motor.mjs`, the generated `ecicep-codigos.mjs`, the CSV both derive from,
`scripts/build-codigos.mjs`, and the three test tiers that hold them to the spreadsheet and to the
MINSAL document. Import paths were rewritten; **nothing else about the engine changed**, and
`node --test 'tests/*.test.mjs'` gives 23 passes here, the same count it gave in the Site.

The exported surface is unchanged and is a contract, because the Site destructures it: `evaluar`,
`resolver`, `listado`, `buscar`, `interpretar`, `META`, `ETIQUETAS`, `DESCRIPCIONES` and
`ESTRATEGIAS`. `registro()` is not among them — it was removed from the Site the same day, together
with the Ingreso/Control control it fed.

**The generators were rescued, not moved.** `scripts/fuente/` holds the four files that actually
produce the shipped CIE-10 table: `parse_paho.py`, `gen_codigos_ecicep.py`, `gen_enriquecido.py` and
the `paho_titles.json` they build between them. Until this repository existed they lived in exactly
one place — a personal sync share — under no version control of any kind, while the calculator's own
documentation instructed a maintainer to run them. They were committed first and unmodified,
hardcoded output paths and all: every other file here is recoverable from the Site's git history,
and these were not.

Committing them also settled which script writes what, which the Site's documentation had recorded
wrongly from 2026-08-25, when that doc was written, until 2026-08-27. `gen_codigos_ecicep.py`
writes a **7-column TSV** and is imported *by*
`gen_enriquecido.py`, which joins that against `paho_titles.json` plus a hand-curated table — the one
that supplies `N18.1`–`N18.6`, absent from the PAHO base — and writes the **10-column CSV** this
repository ships. Naming the first script as the CSV's writer sent anyone regenerating the data to a
file that cannot produce it.

**The pipeline became runnable.** Both generators hardcoded one absolute output path into a cloud-sync
folder that exists on no machine here, which meant the pipeline could not be run by anyone, anywhere,
including on the server that ships its output. Output now defaults to this repository's `datos/` and
honours `ECICEP_OUT`. `gen_enriquecido.py`'s single `BASE` had been doing two different jobs —
reading `paho_titles.json` beside the script, and writing the CSV somewhere else entirely — so it is
split into `IN_DIR` and `OUT_DIR`.

**Regeneration is byte-identical, and that was measured rather than assumed.** Running the pipeline
reproduces `datos/codigos_ecicep_estratificacion.csv` byte for byte,
`md5 ade58f4a6cbb4efa2a71fe3bdf892a9f`. Checked twice: once with only the two output paths redirected,
before anything was edited, and again after parameterising them — so the change of path changed no
data. It is also the first evidence that the shipped clinical data is genuinely derived from these
scripts and is not a hand-edited artifact that merely resembles their output.

Two commands say whether the repository is consistent, and both are fast enough to run before every
commit:

```bash
node --test 'tests/*.test.mjs'         # 23 tests: the engine, the data, and the data against the PDF
node scripts/build-codigos.mjs --check # ecicep-codigos.mjs al dia (1001 codigos, 52 condiciones, 2 reglas)
```

**No `package.json` and no build step, deliberately.** One `.mjs` file is importable by a browser and
by `node --test` with nothing in between, and the moment a bundler stands between the CSV and the
clinician there is a build to trust as well as a rule to read.

The data carries one property that no tool will warn you about: **the CSV's row order is clinically
load-bearing.** `N18`, `Z71` and `Z72` each appear under more than one condition and resolve by first
match, the way a `VLOOKUP` does, so re-sorting the file silently changes a result — and the file must
stay CRLF, which is why no `.gitattributes` with `text=auto` may be added.
[ADR-0001](docs/adr/0001-la-planilla-es-la-especificacion.md) is the authority for that and for why a
patient whose only condition is diabetes is `G2`.

Licence: AGPL-3.0-or-later, the organisation's posture, unchanged by the split.
