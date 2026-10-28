# Research findings

Research completed October 27, 2026 local time, October 28 UTC. Compatibility below distinguishes upstream declarations from this module's own testing. No source code or assets were copied from the comparison modules.

## Versions and licensing

| Project | Verified evidence | License and reuse decision |
| --- | --- | --- |
| [Foundry VTT](https://foundryvtt.com/releases/) | Latest stable release listed is 14.369, October 8, 2026. Local join page also reports build 369. | Proprietary application. Use documented APIs; distribute no core code. |
| [PF2e](https://github.com/foundryvtt/pf2e/releases/tag/pf2e-8.6.1) | Latest stable PF2e-specific release is 8.6.1, October 12. Pinned commit `28d9d156f252d084371d994dc359509b49eadf18`. [Current manifest](https://raw.githubusercontent.com/foundryvtt/pf2e/v14-dev/system.pf2e.json) requires 14.361, maximum 14, verified 14.369. The package listing still said verified 14.368. | [Apache-2.0 code license](https://github.com/foundryvtt/pf2e/blob/pf2e-8.6.1/LICENSE). Content has separate Paizo/ORC/OGL terms. No system code, spell text, icons or compendiums are bundled. |
| [PF2e Unified Spellbook](https://foundryvtt.com/packages/pf2e-unified-spellbook) | Listing shows 2.6.0, minimum Foundry 13, verified 14. | [GPL-3.0](https://github.com/Rowiz49/pf2e-unified-spellbook/blob/main/LICENSE). Reuse would require respecting GPL terms. This module uses independent implementation under MIT. |
| [Spellbook Manager](https://wayfindermodules.com/modules/pf2e-spellbook-manager/) | Public page shows 1.1.3, Foundry 13+, verified 14.368; PF2e 6.0.0+, verified 8.5.1. Requires Wayfinder Core and Traveler subscription. | Proprietary per project brief. Public feature descriptions only. No premium code, assets, manifest or implementation was obtained, inspected, decompiled or reused. |
| [PF2e Leveler](https://github.com/roileaf/pf2e-leveler) | Original URL redirects to roileaf. API returned release 3.12.10, published October 28 UTC. Manifest declares Foundry 13+, verified 14; PF2e minimum 7.0.0, verified 8.5.0. | Root listing has no LICENSE; API license is null; package.json has no license field. Public visibility alone is not permission. No code reused. |

The GitHub PF2e repository also publishes SF2e. `/releases/latest` returned `sf2e-1.6.1`, so this research filtered release tags for `pf2e-` without the anachronism packages.

## Existing experiences and opportunities

Unified Spellbook groups existing spells by rank across entries and supports prepared, spontaneous, innate, focus, item and staff spells. Its documented view allows resource adjustments, while adding/removing spells uses the native view. The opportunity here is to connect cross-entry browsing with discovery and preparation without replacing sheet templates.

Spellbook Manager publicly describes spellbook export, Learn a Spell checks and failure cooldowns, list imports, rescribing, and a GM failure manager. Those are documented product features, not independently exercised behavior. This project implements general discovery/import functionality independently. Export valuation, Learn a Spell automation and cooldown tracking are outside the current MVP.

Leveler's public README describes a creation wizard, build planning, spell choices and slot progression on level changes, plus GM content guidance. This module does not depend on Leveler or change class progression. It reacts to actual document changes, so a manual level-up or another module can cause the same refresh.

## PF2e data and API findings

Sources are pinned to PF2e 8.6.1.

- [Entry data](https://github.com/foundryvtt/pf2e/blob/pf2e-8.6.1/src/module/item/spellcasting-entry/data.ts) stores `system.prepared.value`, `prepared.flexible`, `tradition.value`, and `slots.slot0` through `slot10`. Each slot group has `max`, `value`, and a prepared array of `{id, expended}`. There is no class-ownership or restricted-slot field.
- [Entry implementation](https://github.com/foundryvtt/pf2e/blob/pf2e-8.6.1/src/module/item/spellcasting-entry/document.ts) exposes prepared/spontaneous/innate/focus categories. `attribute` is casting ability, not class. `canCast` is not an eligibility authorization check.
- [SpellCollection](https://github.com/foundryvtt/pf2e/blob/pf2e-8.6.1/src/module/item/spellcasting-entry/collection.ts) derives `highestRank` from existing spells and half actor level. It can overstate archetype slot access. The module derives maximum rank from positive slot maxima.
- `entry.spells.prepareSpell(spell, rank, index)` preserves the current expended flag. Use `"cantrips"` for rank zero. Clear with a null spell. This method does not validate class eligibility or entry membership. The module performs those checks first. Entry wrappers do not await all collection operations, so the collection method is used directly.
- The entry's `prepareBaseData()` sorts occupied prepared slots ahead of empty ones. Slot positions are not stable identifiers for special restrictions. Module preparation therefore requires GM approval of an entire ordinary rank group and refuses mixed restricted groups. Expended flags travel with the sorted slot records; their numeric positions can change.
- `addSpell` can move an owned spell between entries and does not deduplicate separate compendium imports. This module creates an embedded spell from a compendium document only, sets the destination location, and deduplicates by canonical source UUID within that entry. It never moves existing spells.
- [Item source identity](https://github.com/foundryvtt/pf2e/blob/pf2e-8.6.1/src/module/item/base/document.ts) uses `_stats.duplicateSource` and `_stats.compendiumSource`. The module retains a canonical provenance flag and considers current and legacy source identifiers.
- [Spell data](https://github.com/foundryvtt/pf2e/blob/pf2e-8.6.1/src/module/item/spell/data.ts) provides traits/traditions, rarity, time, damage, location/signature and heightened level. Cantrips are identified by trait, rather than assuming stored base rank zero.
- [Native preparation application](https://github.com/foundryvtt/pf2e/blob/pf2e-8.6.1/src/module/actor/creature/apps/spell-preparation/app.ts) already handles standard slots and flexible collections. It remains the fallback for unsupported special preparation.

### Virtual preparation and casting

Prepared slots refer to actor item IDs. Compendium UUIDs cannot simply be inserted into them. This module creates one owned spell on first preparation and then calls the native preparation method. It offers no direct virtual casting. Direct compendium casting has not been tested and is not claimed.

### Class and restricted access

[Cleric](https://github.com/foundryvtt/pf2e/blob/pf2e-8.6.1/packs/pf2e/classes/cleric.json) and [Druid](https://github.com/foundryvtt/pf2e/blob/pf2e-8.6.1/packs/pf2e/classes/druid.json) provide the basis for common divine/primal access. Main class plus tradition does not establish which entry owns that access. Dedications can create similar prepared entries. [Divine Font](https://github.com/foundryvtt/pf2e/blob/pf2e-8.6.1/packs/pf2e/class-features/divine-font.json) restricts additional slots without a structured slot restriction in the entry schema.

The chosen conservative solution is a GM-managed world setting keyed by actor UUID and entry ID. The GM verifies tradition access and explicitly approves whole rank groups containing only ordinary slots. A changed tradition, class, or category invalidates the grant. A changed slot layout disables module preparation until reviewed again. Browsing automatically reflects new slot ranks. Players cannot edit world grants through the module. Actor ownership in Foundry itself already permits broad actor edits; this client module does not claim to be an anti-cheat sandbox against arbitrary console actions.

Wizard, Witch, Magus and spontaneous entries display their current entry-owned spells. The module does not learn spells or add repertoire capacity. Existing granted and uncommon spells remain visible. GM extra UUIDs permit specific exceptions for an approved prepared entry.

### Animist and flexible preparation

[Animist casting](https://github.com/foundryvtt/pf2e/blob/pf2e-8.6.1/packs/pf2e/class-features/animist-apparition-spellcasting.json) separates prepared divine casting from spontaneous apparition casting. Slots are not interchangeable. [Attunement](https://github.com/foundryvtt/pf2e/blob/pf2e-8.6.1/packs/pf2e/class-features/apparition-attunement.json) and [an apparition record](https://github.com/foundryvtt/pf2e/blob/pf2e-8.6.1/packs/pf2e/class-features/custodian-of-groves-and-gardens.json) show that spell lists include description links rather than a complete structured attunement API. The module supports the existing apparition repertoire and vessel focus entries separately. It does not infer attunement, add/remove apparition gifts or select the primary apparition.

[Flexible preparation](https://github.com/foundryvtt/pf2e/blob/pf2e-8.6.1/packs/pf2e/class-features/flexible-spell-preparation.json) uses signature flags for a daily collection rather than ranked prepared arrays. This MVP delegates flexible ranked selection to the PF2e sheet. Approved cantrip slots work normally. Signature and heightened metadata remain intact.

## Foundry integration

Use a dedicated [ApplicationV2](https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html) with Handlebars, native form elements and theme variables. A header control opens it. This has less sheet-template coupling than replacing a tab. The native sheet remains usable.

[CompendiumCollection](https://foundryvtt.com/api/classes/foundry.documents.collections.CompendiumCollection.html) supplies `getIndex({fields})`, `getDocument`, and permission checks. Indexes include searchable descriptions, which costs more metadata bandwidth but avoids loading all documents for description search. Requests share cached promises. TTL and compendium hooks invalidate cache; permissions are checked again when reading and importing. Rendering is paginated to 100 rows.

World settings gate source packs and restricted rarities. Imports use standard document APIs. No socket broker, external service, paid dependency, or PF2e monkeypatch is needed. Local queues serialize module actions. Foundry provides no verified compare-and-swap with concurrent native-sheet writes; use a single editor during preset application.

## Verification status

Automated tests use synthetic character and document fixtures. They are not real PF2e character creation or licensed-runtime acceptance tests. A running Foundry 14.369 world was observed, but it had a connected user and was left unchanged. See [manual testing](docs/MANUAL_TESTING.md) for the complete acceptance matrix. This module intentionally has no `compatibility.verified` claim until live testing is complete.
