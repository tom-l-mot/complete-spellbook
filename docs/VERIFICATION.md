# Verification record

## Combined 0.2.0 scope

The combined version uses the existing browser, sorting, catalog, and document operations for both systems. Source inspection is pinned to upstream commit `675d2b7d613a80572b0330364ce84659068abe66`:

- [SF2e manifest](https://github.com/foundryvtt/pf2e/blob/675d2b7d613a80572b0330364ce84659068abe66/system.sf2e.json) defines the `spells` pack (`sf2e.spells`).
- [Build configuration](https://github.com/foundryvtt/pf2e/blob/675d2b7d613a80572b0330364ce84659068abe66/vite.config.ts) builds both systems from `src/pf2e.ts` with system identity injected.
- [Shared spellcasting template](https://github.com/foundryvtt/pf2e/blob/675d2b7d613a80572b0330364ce84659068abe66/static/templates/actors/character/tabs/spellcasting.hbs) retains the known-spells selectors and `PF2E` localization namespace used by sorting.
- [Item data](https://github.com/foundryvtt/pf2e/blob/675d2b7d613a80572b0330364ce84659068abe66/src/module/item/base/data/system.ts) and [item document](https://github.com/foundryvtt/pf2e/blob/675d2b7d613a80572b0330364ce84659068abe66/src/module/item/base/document.ts) store grant provenance under the active system namespace.
- [Spell collection](https://github.com/foundryvtt/pf2e/blob/675d2b7d613a80572b0330364ce84659068abe66/src/module/item/spellcasting-entry/collection.ts) retains `prepareSpell(spell, groupId, slotIndex)`.

Source inspection and the focused live checks below establish different parts of the evidence. The historical PF2e results later in this document apply to their stated versions. See [the combined manual matrix](MANUAL_TESTING.md#combined-020-acceptance) for the remaining full acceptance work.

## Combined 0.2.0 live checks, 2026-10-30

Used an isolated licensed Foundry 14.369 server with copied PF2e 8.6.1 and SF2e 1.6.1 installations. Each system had its own disposable world, a GM session, and only Complete Spellbook active. The existing Foundry server and campaign were not changed. The test server used Node 24.19.0.

| Check | Result |
| --- | --- |
| PF2e and SF2e startup | Passed. The module API and native sheet controls loaded, with the correct system-specific default spell pack. |
| SF2e Mystic and Witchwarper fixtures | Passed. Owned spells and favorites displayed, native sorting restored the original view, and unsupported repertoire imports, preparation, and access configuration were refused without actor changes. |
| SF2e copied Cleric prepared fixture | Passed. Required GM review before preparation. After approval, preparation, preset save/load, and spent-slot preservation worked. |
| PF2e Cleric and Sorcerer fixtures | Passed. Automatic Cleric tradition access and native Sorcerer restrictions remained intact. Preparation, presets, favorites, sorting, and spent-slot preservation worked. |
| Real PF2e and SF2e compendium imports | Passed in both systems. Imported one approved virtual spell, repeated the import without a duplicate, and preserved the expended preparation slot. SF2e's reviewed prepared list displayed real virtual spells from `sf2e.spells`. |
| Real unlearned repertoire spells | Passed in both systems. A real unowned common divine spell from the configured source pack was refused without actor changes. Synthetic tests additionally cover stale grants. |
| Reload in both systems | Passed. Owned spells, favorites, presets, prepared assignments, and expended states persisted. |
| Browser DOM checks in both systems | Passed. Ran the bundled `runSpellSortDomChecks()` including Mystic and Witchwarper row restoration. |
| Final captured browser error logs | Empty for both recorded system checks. This is not an exhaustive log audit. |

The live harness used native document APIs and the module's actual application/controller. Class fixtures contained minimal native class documents with the relevant slugs, not complete playable class builds. Browsing and sorting compared actor snapshots. Native casting and signature actions, non-GM sessions, simultaneous clients, all subclasses, and interactions with other modules remain outside this pass.

Automated verification used the exclusive local build mirror. `npm run check` passed strict TypeScript checks, 88 tests, bundling, and ZIP content validation with both Node 26.4.0 and Node 24.19.0. `node --test tests/settings.test.ts` also passed after its expected pack IDs were made literal. Initial fixture and tooling failures were corrected before the recorded successful runs. Local harness, JSON results, screenshots, and detailed notes are retained in the ignored `.audit` folder.

Independent Astra review of the implementation and settings assertions found no actionable correctness or security findings and independently passed 85 focused tests. No public release or Foundry listing change is implied by these checks.

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

## Automatic setup update, 2026-10-28

`npm run check` passed typechecking, all 69 tests, bundling, and ZIP validation in the local build mirror. Tests cover automatic access for six prepared classes, native handling for five spontaneous classes, ambiguous entries, archetypes, special entries, flexible preparation, Studious Spells, owner permissions, and protected-rank writes.

Live checks rendered all twelve current test actors across eleven classes, including the additional Cleric. A test environment with saved grants hidden verified fresh automatic recognition without changing world settings. Cleric ranked writes were refused until confirmation. The test Wizard has Unified Magical Theory, so its ordinary preparation is automatic. Separate regression checks protect all curriculum ranks, including cantrips. Native casting entries refused module preparation. Prepared entries passed unchanged preset previews. Every actor's data matched its pre-check snapshot. Existing saved approvals remained usable.

These checks do not establish that arbitrary custom entries are ordinary. PF2e lacks native per-slot restriction metadata, so mixed font and curriculum ranks remain a GM decision. Automatic recognition does not replace that missing information with slot-count guesses.

Independent review found two issues before publication: school Wizard cantrips were incorrectly considered ordinary, and saving rank checkboxes could replace the GM's spell-access choice with a class default. Both were fixed. Three focused regressions failed on the reviewed pre-fix candidate and passed after repair. Wizard ranks now require confirmation unless the character has School of Unified Magical Theory. [Arcane school rules](https://2e.aonprd.com/ArcaneSchools.aspx) document both curriculum cantrip restrictions and the unrestricted school's exception. Saving rank choices preserves existing access.

A follow-up review found that native flexible casting intentionally leaves ranked prepared arrays empty. Recognition now skips those unused arrays while still validating cantrips; flexible ranked preparation remains native. The real array shape and malformed cantrip shape are covered in the regression suite. All 69 checks passed again.
