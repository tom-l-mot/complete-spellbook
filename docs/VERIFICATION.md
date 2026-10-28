# Verification record

This is a development MVP. The original automated record below is followed by live testing updates. Synthetic tests and live checks cover different parts of the module.

## Commands and results

Run on Windows with Node 26.4.0 and npm 11.17.0 on 2026-10-27 local time.

| Check | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Passed in the local build mirror. npm reported zero vulnerabilities. |
| `npm run check` | Passed. Strict TypeScript, 48 tests, ESM bundle and ZIP validation. |
| `node --test tests/core.test.ts tests/runtime.test.ts` | Passed, 44 tests after review fixes. |
| `node --test tests/hooks.test.ts` | Passed, one synchronization test. |
| `npm run package` with synthetic `GITHUB_REPOSITORY` | Passed. Assertions matched the versioned ZIP and latest manifest URLs. No network publication. Rebuilt with that variable removed for local delivery. |
| `git diff --cached --check` | Passed on the initial staged snapshot. Final snapshot is checked separately before handoff. |
| Synthetic HTML preview | Actual application context and Handlebars template rendered and inspected in a browser. This does not exercise Foundry event handlers or document persistence. |

Dependency extraction in the Google Drive workspace failed with `EBADF`, `UNKNOWN` and `EPERM`. The authoritative source remains in the project directory. Dependency-backed checks use `C:/Users/Tom/AppData/Local/Temp/pf2e-complete-spellbook-build`. Build artifacts are copied back for delivery.

## Independent review and fixes

The initial independent review inspected immutable Git tree `5df71b2fb903f1779fc376ad239a9afbd2ffb2e8`, using requested model `gpt-6-astra` at high effort. Effective model and effort were not exposed. That reviewer reproduced three defects.

- Fixed-position slot approval did not survive PF2e's occupied-slot compaction. Grants now approve whole rank groups only. A rank containing any restricted slot must remain on the native sheet. Tests include the pinned compaction behavior and reject legacy partial-slot grants.
- Virtual favorites disappeared after import. Favorites now use stable source identities; imports retain their favorite status and owned rows can toggle it.
- One entry overwrote another entry's previous preparation. Backups now persist separately by entry ID, with a two-entry restore test.

A separate parent check found that a later flag-only refresh could cancel a pending synchronization request. Coalesced refreshes now retain synchronization intent. Its hook test passes.

The initial source comment review found no comments or suppressions to remove. A second independent review of tree `8cc791593e8ec37f7d2a4ce60b20bb6e9e311200` confirmed the three fixes and independently passed all 48 tests. It found one additional issue: read-only preset comparison incorrectly required the preset to be loadable. Comparison now reads saved or current assignments without mutation validation; loading retains all validation and fingerprint checks. The actual application-method test covers missing spells and stale coordinates for both current and saved baselines. `npm run check` still passes all 48 tests. Final review of this correction is recorded in the decision trail and handoff.

## Boundaries at the original build checkpoint

- No live character was imported, changed, prepared, cast or rested. The existing Foundry join page showed an active user, so the campaign was left unchanged. Run every case in `MANUAL_TESTING.md` in a disposable test world.
- Real Animist attunement, flexible ranked selection, special-slot groups and casting remain native workflows. No direct compendium casting is claimed.
- Multiple simultaneous editing clients are not transactional. Use one editor during imports and preset loads.
- GitHub Actions, public manifest installation and PR bot review did not run. No remote repository or release was created.
- A local Git commit attempt failed because author identity was not configured. Immutable Git trees were used for review; no identity was invented or configured.

The requested full production acceptance is still open. The packaged code and automated evidence support testing this MVP, not a claim that every requested gameplay workflow is complete.

## Live testing and UI update, 2026-10-28

The module was installed and tested on Foundry 14.369 and PF2e 8.6.1. Eleven separate character fixtures covered Cleric, Druid, Animist, Wizard, Witch, Magus, Sorcerer, Bard, Oracle, Psychic, and Summoner. Class access boundaries, preparation presets, expended-slot preservation, and persistence after reload passed. These were focused test characters, not complete playable builds. Tests used a GM account.

The UI update replaced the sheet-header button with a round book icon beside Known Spells. Status labels now read Available, Added, and Prepared. Filtered select-all worked across pages, and a three-spell import added each spell once. Hover snippets displayed readable spell descriptions. A browser assertion also checked that scripts, styles, and secret sections were excluded and encoded markup remained text.

A preset failure was reproduced with crypto.randomUUID unavailable. Using Foundry's randomID fixed that failure. The regression failed before the fix and passed after it. Live save, load, restore, and reload checks preserved seven Cleric assignments and one expended slot. The user's original error text was unavailable, so the reproduced failure cannot be conclusively identified as their original error.

The updated npm run check passed strict TypeScript checks, all 49 tests, the bundle build, and ZIP validation in the local build mirror. Independent review found no actionable issues. Final captured browser error logs were empty. Local detailed reports and screenshots remain in the ignored .audit folder and are linked from the Game Vault project note. Campaign exports and raw logs are not published in this repository.

Player-only permissions, simultaneous editing clients, separate remote HTTP clients, and the full manual acceptance matrix remain untested. No public release or production-readiness claim follows from these checks.
