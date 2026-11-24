# The Calculator lives here, on GitHub Pages, and changes only on a release

- **Status:** accepted (2026-11-24)

## Context

Until now this repository was the Engine and nothing else. The Calculator people actually used (the
field, the suggestions, the pyramid, the result card, the listing) lived on the Site,
[`APS-Conecta/aps-conecta-web`](https://github.com/APS-Conecta/aps-conecta-web), as a WordPress
mu-plugin that vendored `motor.mjs` and `ecicep-codigos.mjs` by copy.

By 2026-11-24 the Site's calculator page no longer existed. The interface code was still in that
repository but served nobody, so the Engine had no working Consumer. The calculator still has to be
somewhere that many clinicians can open from any clinic machine or phone. They need the risk group,
and they also need to look up which CIE-10 codes count for which condition.

## Decision

1. **The Calculator moves into this repository, under `site/`,** and is published with GitHub
   Pages at <https://ddespinoza.github.io/calculadora-ecicep/>. The interface is the Site's, ported
   rather than rewritten. Its `ui.mjs` keeps its pure, tested helpers and its clinical-safety
   behaviour: an ambiguous name is never guessed, an unknown code is shown and scores nothing, and a
   repeated condition is marked. The WordPress copy is retired and removed from the Site.
2. **The Engine stays pure** (AGENTS.md rule 1). `site/` imports `motor.mjs`, `ecicep-codigos.mjs`
   and `ecicep-titulos.mjs` as siblings through three committed relative symlinks, so the tests, a
   local preview and the deployed page all load the same files by the same path. There is still no
   `package.json` and no bundler. `scripts/build-site.mjs` *copies* `site/` and the three modules
   into `_site/` and stamps the version. It verifies that the deployed engine is byte-identical to
   the committed one, and it decides nothing.
3. **The public page changes only when a GitHub Release is published.** `.github/workflows/pages.yml`
   runs the full gate (`scripts/check.sh`) and deploys only if it passes. Merging to `main` changes
   nothing a clinician sees. The release tag is printed in the page footer, and the three engine
   modules are attached to the release.
4. **CIE-10 titles ship as their own generated module, `ecicep-titulos.mjs`,** written by
   `scripts/build-codigos.mjs` from the CSV's `Nombre código (CIE-10)` column and held to the CSV by
   the same `--check`. Nothing clinical reads a title. Keeping them out of `DATOS` means adding the
   listing changed not one byte of `ecicep-codigos.mjs`.
5. **The page works offline** through a service worker whose cache is named after the release. An
   import map in `index.html` pins all three engine modules to the release (`?v=<tag>`) without
   changing their bytes. A page from one release therefore never loads another release's engine,
   neither from the cache nor during the switch to a new release. A new release installs a new
   cache and deletes the old one.
6. **Neutral presentation.** The page is called «Calculadora ECICEP», uses its own neutral palette with
   a dark scheme, loads no webfonts and has no analytics. Nothing a user types leaves the browser,
   which was the Site's ADR-0013 posture and is unchanged.

## Consequences

- This repository now has an interface. AGENTS.md rule 1 still governs `motor.mjs`, and a new rule
  governs `site/`: the interface decides nothing clinical, and what it *shows* must be what the Engine
  would do.
- That second clause caught a defect on the way in. The Site printed **N18** beside *Enfermedad renal
  crónica avanzada* when it was chosen by name, but `N18` typed alone resolves by First match to
  *Enfermedad renal crónica* (1 point). The listing and the Código column now show only codes that
  resolve to the condition they sit under (`N18.4 · N18.5 · N18.6`). A code listed under a condition
  it does not count for is shown with the condition it counts as. Scores were never affected.
- The Consumer of the exported names is now `site/ui.mjs`, in this repository. A rename breaks a test
  here, in the same pull request, instead of a vendored copy somewhere else.
- A release is now a real event with a version. `v1.0.0` (2026-08-27) tagged the Engine at the
  split. `v1.1.0` is the first release that publishes the Calculator.
- Two copies of the interface no longer exist, so they cannot drift.

## Alternatives considered

- **A separate repository for the page**, vendoring the Engine the way the Site did. Rejected
  because it recreates the exact drift this repository's README warned about: "nothing fixed here
  reaches anyone until someone copies it".
- **Deploy on every push to `main`.** Rejected for a clinical instrument. People read the answer at
  the point of care, and it should change on a named, dated, deliberate event.
- **Titles inside `DATOS`.** Rejected because it would change the bytes of the clinical module for a
  display-only need.
