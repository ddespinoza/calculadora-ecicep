# The spreadsheet is the specification, not the PDFs

- **Status:** accepted (2026-08-27)

This decision was first recorded as ADR-0013 in the Site's repository, back when the engine and the
interface lived together there:
[aps-conecta-web/docs/adr/0013-calculadora-corre-en-el-navegador.md](https://github.com/APS-Conecta/aps-conecta-web/blob/main/docs/adr/0013-calculadora-corre-en-el-navegador.md).
When the engine and its data were split out into this repository on 2026-08-27, this half of that
decision moved with them, because it is the reason `motor.mjs` and the CSV are shaped the way they
are — and the code it governs no longer lives in the Site. ADR-0013 is **not superseded**: it keeps
its other half, the browser-only privacy posture and the no-build-step choice, both of which are
still decisions about the Site. The prose below is reproduced verbatim from it; it is the clinical
record of why a diabetes-only patient is `G2`, and paraphrasing a clinical justification is how it
stops being true.

## The spreadsheet is the specification, not the PDFs

The calculator already existed as a Google Sheet whose points, cut-offs, dedup rule and messages are
resolved and deterministic. This implementation **ports** them; it does not re-derive them.

That distinction is load-bearing, because the MINSAL documents genuinely contradict each other at
one clinically important boundary. `G3` and `G2` are defined on a **weighted** count — *"5 o más
condiciones crónicas ponderado"*, *"2 a 4 … ponderado"* — while `G1` is written as plain *"1
condición crónica"*, with no "ponderado" (Marco Operativo 2025 p. 38; the older Marco Operativo
p. 34; the founding strategy p. 43). A patient whose only condition is diabetes therefore has *one*
chronic condition but *two* weighted points.

The spreadsheet resolves it: stratification runs on **puntaje**, so that patient is **G2**. We
implement that, and we do not get a vote. Where a document and the spreadsheet disagree, the
spreadsheet wins; the documents remain the authority for which codes exist and what they score.

A related consequence: three codes (`N18`, `Z71`, `Z72`) appear under more than one condition, and
the spreadsheet resolves them by first match, as a `VLOOKUP` does. The generated code list therefore
**preserves the CSV's row order on purpose**, and `motor.mjs` keeps the first entry it sees.
Re-sorting that file would silently change a clinical result. Only `N18` changes the score (1 vs 2);
`Z71` and `Z72` score 1 either way.

## Consequences

- `datos/codigos_ecicep_estratificacion.csv` is the clinical artifact of record, and its **row order
  is part of its meaning**, not formatting. Re-sorting it, or normalising its CRLF line endings, is
  a clinical change and has to be reviewed as one. In particular: never add a `.gitattributes` with
  `text=auto` — it would rewrite the bytes of that file for a cosmetic reason.
- `ecicep-codigos.mjs` is generated from that CSV by `scripts/build-codigos.mjs` and is never
  hand-edited, so the row order survives into the shipped code.
  `node scripts/build-codigos.mjs --check` reports whether the two agree, and prints
  `ecicep-codigos.mjs al dia (1001 codigos, 52 condiciones, 2 reglas)` when they do.
- The first-match resolution is pinned by tests rather than by comment: `tests/fuente.test.mjs`
  asserts that `resolver('N18')` lands on condition 21 and scores 1 while `N18.4` scores 2, and that
  `Z71` and `Z72` score 1 whichever condition they resolve to. A re-sort that changes a result fails
  the suite (`node --test 'tests/*.test.mjs'`, 23 tests).
- Stratification therefore reads the weighted score and not the number of distinct conditions: 0
  gives `G0`, 1 gives `G1`, 2 to 4 give `G2`, and 5 or more give `G3`. Eight of the 52 conditions
  score 2, so a single condition can put a patient in `G2` — that is the documented contradiction
  resolved, not a bug to report.
- The only consumer today, the Site, **vendors** `motor.mjs` and `ecicep-codigos.mjs` into its theme
  by copy, pinned by hash. A change to the data or to the resolution order does not reach clinicians
  until the Site re-vendors these files, and that copy step is where the blast radius of a breaking
  change is contained.
