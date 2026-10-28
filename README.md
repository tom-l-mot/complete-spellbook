# PF2e Complete Spellbook

[![Foundry VTT 14](https://img.shields.io/badge/Foundry_VTT-14-orange)](#install-locally)
[![Tested with PF2e 8.6.1](https://img.shields.io/badge/Tested_with-PF2e_8.6.1-purple)](docs/VERIFICATION.md)
[![Development version](https://img.shields.io/badge/version-0.1.0_development-blue)](module.json)
[![Checks](https://github.com/tom-l-mot/pf2e-complete-spellbook/actions/workflows/validate.yml/badge.svg)](https://github.com/tom-l-mot/pf2e-complete-spellbook/actions/workflows/validate.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Support on Ko-fi](https://img.shields.io/badge/Support_on_Ko--fi-FF5E5B?style=flat&logo=kofi&logoColor=white)](https://ko-fi.com/tomlmot)

Browse your available spells, prepare them for the day, and save sets you can load again later. This free Foundry VTT module is built for Pathfinder Second Edition. It runs inside Foundry and does not need a separate account or subscription.

**Version 0.1.0 is an installable development MVP.** It targets Foundry **14.361–14.369** within generation 14 and PF2e **8.6.1**. Live checks passed on Foundry 14.369 with PF2e 8.6.1, using test characters for eleven spellcasting classes. Full multiplayer and player-permission testing remains open. Use a test world first. The manifest does not claim a verified runtime version.

## Install locally

1. Extract `build/pf2e-complete-spellbook.zip` into `<Foundry user data>/Data/modules/pf2e-complete-spellbook/`. `module.json` must sit directly in that folder.
2. Restart Foundry when no game is in progress, then enable **PF2e Complete Spellbook** in a PF2e test world's module settings.
3. Open a character sheet. On the **Spellcasting** tab, click the round book icon to the left of **Known Spells**. A script macro is also available:

   ```js
   const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
   if (actor) game.modules.get("pf2e-complete-spellbook").api.open(actor);
   ```

## Configure spell access

PF2e does not label which class owns each spellcasting entry or which slots are restricted. The GM must configure each applicable entry once.

1. Select the character's ordinary Cleric divine, Druid primal, or Animist prepared divine entry and choose **GM entry access**.
2. Enable full-tradition access only when its class feature permits it. Existing Wizard, Witch, Magus and spontaneous collections must remain known-only.
3. Enter any specifically granted spell compendium UUIDs, one per line. Deity grants do not need blanket uncommon access.
4. Confirm preparation and enter whole ordinary rank groups from the displayed list. For example, `0,1` approves all cantrip and rank-one slots. Approve a rank only if every slot in it is ordinary. If a group contains divine-font, curriculum or other restricted slots, leave that entire rank unapproved and manage it on the PF2e sheet. PF2e reorders occupied slots, so individual restricted slots cannot be safely isolated by position.

The character now browses all permitted common tradition spells up to its available slot rank without importing them. New ranks appear as actual entry slot capacity changes. Reconfirm preparation after a slot layout change. Players cannot edit the module's world-level access grants.

## Browse, import and prepare

- Search names and descriptions. Filter rank, tradition, traits or legacy schools, rarity, action cost, damage, category and status. Sort by name or rank. Lists show 100 rows per page.
- Choose **All entries** for a unified view. Every row retains its destination entry. Focus and innate entries display their existing spells; the category menu filters spell kinds.
- Hover over a spell's name to read a short description. Click its name for the full PF2e details. Stars store favorites per character using source identities that survive import. Recent status lists the last 20 spells prepared through this module, not casts from other sheets.
- **Prepare** lets you select an approved compatible slot, including a higher rank. An Available spell is added to the character when needed. Expended slots stay expended. **Clear** also preserves the expended state.
- **Import eligible spells** previews every missing eligible spell. **Import filtered ranks / results** applies current filters; **Import selected** uses checked rows. The checkbox beside **Select** selects all available spells matching your filters, across every page. Confirmation is required before import starts. **Stop import** stops between document writes. Completed imports remain intact and a retry skips them.
- Existing owned spell documents are never overwritten or deleted. Identical sources in different entries remain separate, because PF2e associates each owned spell with one entry.

## Preparation presets

Save the approved slots in the selected entry as a named preset, such as Combat or Exploration. Presets persist as character flags. Compare a preset against current preparation or another saved preset without changing slots. Loading also shows a comparison against the current preparation before confirmation.

Loading validates every target and spell, saves previous assignments separately per entry, then writes all affected ranks in one entry update while preserving expended flags. **Restore previous** offers the same preview and validation. A missing spell, changed entry or unapproved slot refuses the load. Presets do not perform daily rest or restore resources. Avoid simultaneous edits or casting from another client while applying a preset.

## Settings

The GM controls virtual discovery, allowed compendium IDs, uncommon/rare access, legacy inclusion, imports, presets, favorites, cache duration and debug logging. The default source is `pf2e.spells-srd`. Pack visibility still applies. The default rarity filter is a client display preference and cannot expand access.

**Automatically import missing eligible spells** is off by default. Enabling it allows the elected active GM to fill approved full-tradition entries after relevant character changes. It never deletes spells or changes slot capacity. Browsing automatically reflects changes even when physical synchronization is off.

## Build and verify

Use Node.js 22.18 or later. Node 24 is used in CI.

```sh
npm ci
npm run check
```

`check` runs strict TypeScript checks, automated tests, bundle creation and ZIP content validation. `npm test` runs the core and adapter tests with Node's test runner. `npm run package` writes `build/module.json` and `build/pf2e-complete-spellbook.zip`. Runtime dependencies are zero; build tools are development-only.

On filesystems that reject npm package extraction, copy the source to a normal local folder and run the same commands there. Keep the resulting lockfile and release artifacts with the project. This development run encountered Google Drive `EBADF` errors and used a temporary local copy for dependency-backed checks.

## Manifest URL distribution

The source is saved in [tom-l-mot/pf2e-complete-spellbook](https://github.com/tom-l-mot/pf2e-complete-spellbook). No installable GitHub release is published yet. The local manifest omits download URLs until release assets exist.

When this repository is published under an owner-approved GitHub repository, the supplied release workflow builds URLs from `GITHUB_REPOSITORY`, validates the version tag, and creates a **draft** release for `v0.1.0`. Publish the reviewed release and use its `module.json` asset URL in Foundry's **Install Module → Manifest URL** field. That manifest points to the versioned ZIP and a latest-release manifest for updates. Do not paste a guessed URL before those assets exist.

## Project structure

```text
src/
  core.ts          Eligibility, filters, slot rules, preset validation
  runtime.ts       Compendium cache, document adapter, imports, persistence
  app.ts           ApplicationV2 UI and dialogs
  main.ts          Sheet hooks, refresh and optional synchronization
  settings.ts      Settings registration
  foundry.d.ts     Narrow runtime API declarations
templates/         Handlebars application template
styles/            Scoped responsive styles
lang/              English localization
tests/             Core, adapter and artifact tests
scripts/           Build and ZIP validation
docs/              Architecture, manual testing and decision trail
.github/workflows/ Validation and draft release packaging
```

## Known limits and production readiness

- Full-tradition discovery and preparation need GM entry mapping. Slot-layout changes need preparation reapproval. This is conservative because the system does not encode enough class-specific restrictions.
- Animist prepared divine discovery works after approval. Existing apparition and vessel entries remain distinct. Attunement, dispersion, primary-apparition changes and gift synchronization require the PF2e sheet or existing tools.
- Flexible ranked collection selection, learning/repertoire edits, casting, focus/innate resources, rituals, staff/item casting and special slots remain native workflows. No direct compendium casting is claimed.
- Cross-client import races and concurrent native-sheet writes do not have a server transaction. Operate one character from one editing client during imports and preset application.
- This module respects Foundry permissions through its own operations. It cannot prevent an actor owner from using other Foundry features or arbitrary JavaScript to alter their actor.
- Run the [live test matrix](docs/MANUAL_TESTING.md), including player permissions, mixed casting entries, theme/keyboard behavior and disablement, before broad use. Publish release assets only after that validation. Wider PF2e version support requires rechecking the adapter.

Disabling the module leaves imported spells and preparation data in standard PF2e items. Its stored flags remain inert. No migration or cleanup deletion runs on disablement.

See [RESEARCH.md](RESEARCH.md) for source links and licenses and [architecture](docs/ARCHITECTURE.md) for policy and failure contracts. This project is unofficial and not endorsed by Paizo or Foundry Gaming.

## Spell status

**Available** means you can add the spell to this character. **Added** means it is already on the character. **Prepared** means it is assigned to a preparation slot. Import checkboxes appear only for Available spells. Wizard spellbooks show their existing learned spells, so Added and Prepared rows do not have import checkboxes.

## Support development

If you'd like to support development and maintenance, you can [buy me a coffee on Ko-fi](https://ko-fi.com/tomlmot). Thanks for your support!
