# Documentation index — calculadora-ecicep

Where each document lives and which facts it is the authority for. When two documents seem to state
the same fact, the one named here as its authority wins and the other should link to it instead.

**In this repository the authority for a clinical fact is usually a file of code or data, not prose.**
The cut-offs are in `motor.mjs`, the codes and their points are in the CSV, and the row order of that
CSV is itself a clinical decision. A document that restates any of them is a copy that will drift; it
should quote and link instead. Prose owns the *why*, and the how-to.

Facts about how the calculator is *presented* to a clinician — its page, its panels, its accessibility
work, the source PDF in the media library — belong to the only consumer,
[`APS-Conecta/aps-conecta-web`](https://github.com/APS-Conecta/aps-conecta-web), and are documented
there. That repository **vendors** `motor.mjs` and `ecicep-codigos.mjs` into its theme by copy, pinned
by hash, so a change made here reaches nobody until it is re-vendored.

Organisation-wide facts are not here at all: they live in
[`APS-Conecta/gestion`](https://github.com/APS-Conecta/gestion) and are referenced by absolute URL,
never by a relative path — several repositories sit *inside* that one, so a relative path is right at
one depth and broken at another.

`CONTRIBUTING.md` and `SECURITY.md` are deliberately absent. GitHub serves both organisation-wide from
[`APS-Conecta/.github`](https://github.com/APS-Conecta/.github), and `.github/profiles/_base.json`
records exactly which four files can be inherited that way: those two, `PULL_REQUEST_TEMPLATE.md` and
`ISSUE_TEMPLATE`. `CODEOWNERS`, the workflow and the pre-commit hook cannot be inherited and are
carried here per repository. The decision is gestion's ADR-0012; whether the organisation defaults are
being served yet is a fact about that repository and is dated there, not here.

## Start here

| Document | Mode | It is the authority for |
|---|---|---|
| [`../motor.mjs`](../motor.mjs) | reference | **The clinical rules** — the cut-offs, the weighted score, the dedup rule, first-match resolution, and the exported surface a consumer may rely on |
| [`../datos/codigos_ecicep_estratificacion.csv`](../datos/codigos_ecicep_estratificacion.csv) | reference | **The clinical artifact of record** — which CIE-10 codes exist, which condition each belongs to, what each condition scores, and the row order that settles `N18`, `Z71` and `Z72` |
| [`../ecicep-codigos.mjs`](../ecicep-codigos.mjs) | reference | Nothing. It is **generated** from the CSV and is overwritten; it is listed here so no one edits it believing otherwise |
| [`../LICENSE`](../LICENSE) | reference | The licence in full: AGPL-3.0-or-later |

## Explanation — why it is built this way

| Document | It is the authority for |
|---|---|
| [`adr/`](adr/) | Decisions and the reasoning that was live when each was taken. Every ADR carries a `Status:` |
| [`adr/0001-la-planilla-es-la-especificacion.md`](adr/0001-la-planilla-es-la-especificacion.md) | **Why the spreadsheet outranks the MINSAL PDFs**, why a patient whose only condition is diabetes is `G2`, and why the CSV's row order and its CRLF line endings are clinical facts rather than formatting |

## How-to

| Document | It is the authority for |
|---|---|
| [`../scripts/build-codigos.mjs`](../scripts/build-codigos.mjs) | **How the shipped module is produced and verified.** There is no build step and no `package.json`, so `--check` is the only thing standing between a hand-edit of the generated file and a browser |
| [`../scripts/fuente/`](../scripts/fuente/) | **How the CSV itself is produced** — the PAHO title parse, the 52 conditions typed from Anexo 4, and the join that writes the ten columns. Which script writes which file is settled by reading these, and prose that contradicts them is wrong |
| [`../tests/`](../tests/) | **What the engine is held to.** `golden.fixture.json` carries the spreadsheet's own recorded outputs; `datos.test.mjs` the shape of the shipped table; `fuente.test.mjs` the data against Anexo 4 extracted by a route independent of the one that produced it |
| [`../.githooks/pre-commit`](../.githooks/pre-commit) | What may never be committed, and how to switch the guard on in a fresh clone |
| [`../.github/workflows/docs.yml`](../.github/workflows/docs.yml) | Which documentation rules run in CI, and why the ones needing organisation-scoped auth are skipped there |

## Status and history

| Document | It is the authority for |
|---|---|
| [`../CHANGELOG.md`](../CHANGELOG.md) | What changed, and when |

Dated entries in `adr/` and `CHANGELOG.md` are history. They are not rewritten when the world moves; a
dated correction is added instead.
