# Calculadora ECICEP

This repository is the **Engine** and the **Data** of the ECICEP risk calculator: the clinical rules
that turn a list of chronic conditions into a risk group, and the code table those rules read. It
contains no interface and renders nothing. It was split out of the Site
(`APS-Conecta/aps-conecta-web`) on 2026-08-27; the interface stayed there.

The vocabulary below is the one the code already speaks. Identifiers are Spanish where the domain is
Spanish (`condicion`, `puntaje`, `resolver`), so each term names both forms — renaming an exported
symbol would break the only Consumer.

## Clinical model

**ECICEP**:
The MINSAL strategy this calculator serves. Two documents matter: the *Marco Operativo ECICEP 2025*,
whose Anexo 4 lists the conditions and their codes, and the founding strategy document, whose
§3.4.1.2 *Modelo poblacional de estratificación de condiciones crónicas* — an adaptation of the
Kaiser pyramid — is where the four levels and the strategy printed with each one come from.
_Avoid_: the programme, the model, the norm

**Condition**:
One of the 52 chronic conditions the stratification counts, numbered 1–52 exactly as Anexo 4 numbers
them. The Condition — not the Code, not the typed entry — is what scores and what de-duplicates: it
counts once however many of its Codes are entered. In code it is `condicion`, an integer key into
`DATOS.condiciones`; its display name is `patologia`.
_Avoid_: diagnosis, disease, comorbidity, item

**Score** (`puntaje`):
Both the weight of one Condition — 1 point, or 2 for the eight the Marco Operativo double-weights
(11, 13, 14, 17, 22, 23, 27, 29) — and the total, which sums those weights over the DISTINCT
conditions resolved. A count of entries is never a Score, and neither is a count of conditions.
_Avoid_: points, weight, severity, count

**Risk group** (`G0`–`G3`):
The result. `G0` sin riesgo · `G1` bajo · `G2` moderado · `G3` alto. Each carries three things an
interface may print but must never invent: a label (`ETIQUETAS`), a description stated in terms of
the Score (`DESCRIPCIONES`), and that level's principal strategy (`ESTRATEGIAS`).
_Avoid_: level, tier, stage, category, risk score

**Stratification**:
Assigning a Risk group from a Score: `0 → G0` · `1 → G1` · `2–4 → G2` · `5+ → G3`. It runs on the
weighted Score, never on the number of distinct conditions — a single double-weighted condition
scores 2 and lands in G2. The MINSAL documents are ambiguous at exactly that boundary; the
Spreadsheet is not.
_Avoid_: classification, triage, grading, scoring (scoring produces the number, stratification reads it)

**Spreadsheet** (*la planilla*):
The Google Sheet the calculator was before it was code, and the specification this Engine **ports**
rather than re-derives: points, cut-offs, de-duplication and first match were already resolved there.
Where a MINSAL document and the Spreadsheet disagree on how to compute, the Spreadsheet wins; the
documents remain the authority for which codes exist and what they score. The decision is the Site's
ADR-0013.
_Avoid_: the sheet, the original, the source, Excel

**Ambiguous entry**:
Text that matches more than one Condition — «renal» matches both *Enfermedad renal crónica* (1 point)
and *Enfermedad renal crónica avanzada* (2 points). `interpretar()` returns `ambiguo` with the
options instead of choosing, because quietly taking the first match moves a person across the G1/G2
boundary, which is to say it changes how often they are seen. An exact Code is never ambiguous, even
when its name is.
_Avoid_: partial match, fuzzy match, near miss

## Codes

**Code** (CIE-10):
A CIE-10 (ICD-10) identifier a clinician can type. 1001 of them are listed across the 52 conditions,
plus the two Range rules. After First match, every Code belongs to exactly one Condition. Anything
outside the list resolves to `null` — never to a silent zero.
_Avoid_: ICD, diagnosis code, key, id

**Master code** (`Maestro`, 166 rows):
A three-character Code: one letter and two digits, with no fourth character (`E11`, `N18`). The
Engine decides masterhood by shape — everything before the first dot — not by the CSV's `Código
maestro` column. `listado()` prefers masters when it shows a Condition's codes, which is how the
Spreadsheet's own reference table writes them.
_Avoid_: parent code, root, header code, category

**Subcode** (`Subcodigo`, 835 rows):
A Code with a fourth character after the dot (`E11.9`, `N18.4`). Two behaviours, both load-bearing:
a Subcode that is **not** listed rolls up to its Master and inherits that Condition (`E11.9 → E11`);
a Subcode that **is** listed resolves on its own and may sit under a different Condition than its
Master — `N18.4`, `N18.5` and `N18.6` are *Enfermedad renal crónica avanzada* (2 points) while `N18`
itself resolves to *Enfermedad renal crónica* (1 point).
_Avoid_: child code, variant, extension, detail code

**Range rule** (`Regla`, 2 rows):
A whole span of Codes mapped to one Condition without listing each one: `C00-C97` and `D00-D48`, both
Condition 38, 1 point. It is tried only after exact and Master lookup have failed, it matches on the
same letter and a two-digit number inside the interval, and it is the only way the Engine resolves a
Code that has no row of its own.
_Avoid_: wildcard, pattern, glob, prefix, chapter

**First match**:
The resolution order the Spreadsheet's `VLOOKUP` implies and the Engine reproduces: the code index is
built in CSV row order and keeps the first occurrence it sees. Three Codes appear under more than one
Condition — `N18`, `Z71`, `Z72` — and only `N18` changes the Score (1 as chronic kidney disease, 2 as
advanced); `Z71` and `Z72` score 1 under either. Row order is therefore a clinical fact: re-sorting
the CSV changes a result and nothing complains.
_Avoid_: precedence, priority, tie-break, dedup (de-duplication drops a repeated Condition from the
Score; First match decides which Condition a Code belongs to)

## Artifacts

**Anexo 4**:
Annex 4 of the Marco Operativo ECICEP 2025, pp. 94–101: the printed table of the 52 conditions with
their points and their codes. The authority for what the Data asserts, and what a reviewer checks a
data change against. It was hand-typed into `scripts/fuente/gen_codigos_ecicep.py`.
_Avoid_: the PDF, the annex, the guideline, the norm

**Data** (`datos/codigos_ecicep_estratificacion.csv`):
The 10-column CSV this repository ships — one row per Code or Range rule, 1003 rows under the header,
CRLF. It is the clinical artifact of record, the file a clinician could be shown, and it is
reproducible: the pipeline in `scripts/fuente/` regenerates it byte for byte. Its row order is
load-bearing (see First match), and so are its bytes, which is why nothing here normalises its line
endings.
_Avoid_: dataset, dump, export, fixture, table

**Generated module** (`ecicep-codigos.mjs`):
The Data normalised for `import`. `scripts/build-codigos.mjs` writes it and decides nothing — no
score, no code, no reordering. Its one addition is the accented display name of each Condition, which
validates itself: stripping the accents back must reproduce the CSV's own spelling. Hand-editing this
file is a defect, and `--check` is what catches it.
_Avoid_: build output, bundle, dist, cache, the JSON

**Engine** (`motor.mjs`):
The pure domain: no DOM, no I/O, no dependencies, plain ESM. Every clinical decision lives here and
nowhere else, which is what makes it testable in milliseconds and what stops an interface change from
ever moving a score. Its exported names are a contract with its Consumers.
_Avoid_: library, core, service, calculator

**Calculator**:
The product a clinician uses: an interface plus this Engine. This repository is **not** the
Calculator — nothing here opens in a browser on its own, and the Calculator lives on the Site, where
it is a Resource rather than an App.
_Avoid_: app, tool, widget, page

**Consumer**:
Anything that imports the Engine. Today there is exactly one: the Site, and it **vendors** the two
files — `motor.mjs` and `ecicep-codigos.mjs` are copied into its theme and pinned by hash, not pulled
as a submodule or a package. That copy is the blast radius of every breaking change made here, and
the reason the exported surface it destructures (`evaluar`, `resolver`, `listado`, `buscar`,
`interpretar`, `META`, `ETIQUETAS`, `DESCRIPCIONES`, `ESTRATEGIAS`) is a contract and not an
implementation detail.
_Avoid_: client, dependency, integration, user (a user is a person)
