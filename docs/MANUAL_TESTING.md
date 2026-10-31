# Live acceptance test procedure

## Combined 0.2.0 acceptance

Run these checks in each system. Record actual results in VERIFICATION.md; this matrix is a procedure, not a passed test report.

| System and fixture | Required result |
| --- | --- |
| New PF2e world | Default source is `pf2e.spells-srd`; existing PF2e preparation and sorting remain functional. |
| New SF2e world | Default source is `sf2e.spells`; browser button and native sorting use the shared sheet. |
| Either system with custom or empty sources | Reload preserves the exact saved value. |
| SF2e Mystic and Witchwarper | Browse owned repertoire, open native spell details, and sort rows. No virtual tradition spells, preparation, import, or preparation presets, including with stale grants. |
| SF2e Mystic connections | Exercise Akashic, Elemental, Healing, Rhythm, and Shadow. Preserve divine, occult, or primal repertoire and separate epiphany focus spells. Verify native casting and signature controls in the sorted view. |
| SF2e Witchwarper paradoxes | Exercise Analyst, Anomaly, Gap Influenced, and Precog. Preserve arcane or occult repertoire and separate warp focus spells. Verify native casting and signature controls in the sorted view. |
| SF2e Technomancer | Exercise DPS++, FORTRUN, Servoshell, and Viper. Require GM approval for ordinary prepared ranks with full-tradition access disabled. Preserve the owned spell database and separate Magic Hack focus spells. Test preparation, heightening, presets, spent slots, and native casting. Leave special high-level features unapproved unless separately verified. |
| SF2e Envoy, Mechanic, Operative, Solarian, and Soldier | With no spell entries, opening the module and native sheet adds no spells or casting entries. Test spells gained through other features separately. |
| SF2e custom prepared list or copied Cleric | Requires explicit GM review before virtual discovery or preparation. Confirm ordinary ranks only; verify spent slots survive preparation and preset restore. |
| SF2e granted prepared entry | Read active-system grant provenance; entry remains subject to GM review. |
| Unsupported system | No module API, sheet controls, hooks, or settings registration. |

Inspect both systems as GM and player owner. Test reload, disablement, permission loss, and unchanged native casting resources. Focused GM fixture checks for both systems are recorded in [VERIFICATION.md](VERIFICATION.md); they do not complete this full matrix.

Status: **FULL MATRIX INCOMPLETE**. Automated synthetic tests and focused GM fixtures are not substitutes for all these steps. The combined build was tested in isolated disposable worlds. The existing campaign was not modified.

The SF2e class matrix passed on 2026-10-30 across 49 actors, including all 13 shipped casting options. See [the class verification record](VERIFICATION.md#sf2e-class-matrix-2026-10-30) for exact checks, fixture fidelity, and remaining limits.

## Prepare an isolated world

1. Back up disposable PF2e and SF2e worlds. The installed reference versions are Foundry 14.369, PF2e 8.6.1, and SF2e 1.6.1. Record the versions actually tested and enabled modules.
2. Install the release ZIP using the README. Enable only this module for the first pass.
3. Create a GM and a player account. Assign owner access to test characters and observer/no access to separate characters. Keep a copy of each character's initial JSON export.
4. Open the browser console and record errors. Open Complete Spellbook from both legacy and current PF2e sheets, if both are available.
5. Configure each ordinary prepared entry as described below. Do not authorize a rank containing any special slot.

## Character matrix

| Character | Setup and expected result |
| --- | --- |
| Level 1 Cleric | Approve ordinary divine entry and slots. Compare available common divine cantrips/rank 1 to the system compendium. Rank 2+ and nondivine spells absent. Browse without adding actor items. |
| Level 5 Cleric | Give correct ordinary rank 1–3 slots. Common divine rank 3 visible, rank 4 absent. Leave any rank containing divine-font slots entirely unapproved. Prepare a rank-one spell at rank three. |
| Level 10 Druid | Approve ordinary primal entry with rank 1–5 slots. Compare eligible common primal list. Rank six absent. |
| Animist, two apparitions | Use separate prepared divine, spontaneous apparition and vessel focus entries. Approve only prepared divine full access. Existing apparition gifts, including off-tradition spells, remain in that repertoire. No gift/attunement mutation occurs. |
| Wizard | Limited spellbook, no full-tradition grant. Only owned entry spells visible. Approve only ordinary preparation slots. Leave any rank containing curriculum slots entirely unapproved. |
| Witch | Limited known spells. No entire-tradition access. Existing focus entry remains separate. |
| Magus | Correct bounded slot distribution. Owned spells remain visible even if their base rank has no slot. Prepare valid lower-rank spells in available higher-rank ordinary slots. |
| Sorcerer | Existing repertoire and signature spell metadata visible. No prepare/import entitlement and no additional repertoire spells. Cast through native PF2e sheet. |
| Multiple entries | Two ordinary prepared entries, innate and focus. Unified view labels the entry on every row. A source imported into one entry does not move or suppress the other entry's legitimate copy. |
| Archetype | High-level character with lower-rank archetype slots. Approved access, if class rules permit, must use those slots rather than actor level or entry.highestRank. |

Also exercise Bard, Oracle, Psychic, Summoner, flexible prepared casting, custom spells, granted deity spells, legacy spells and a character with no entries. Flexible ranked selection remains on the native PF2e sheet; ordinary cantrip slots may be approved here.

## Browse and resource checks

1. Search by name and a word appearing only in a spell description. Try every filter and both sorts, then clear them. Verify result counts against compendium metadata.
2. Test 100-row pagination, typing without focus loss, Tab navigation, Enter/Space on buttons, light/dark themes and window resizing at 1024×768 and 1440×900.
3. Favorite a virtual and an owned spell, close and reopen. Confirm flags persist. Prepare a spell and verify recent status. Recent tracks module preparation, not native casts.
4. Open details. Verify PF2e enriches the native description and spell links. Confirm virtual browsing/details alone create no actor items.
5. Check prepared, owned and virtual labels, signature indicators, rank limits, focus/innate categories and resource readouts against the native sheet.

## Import and permissions

1. Preview all eligible imports. Check count and names, cancel, and compare actor JSON for no changes.
2. Import a selected spell, then import it again and bulk-import its rank. Exactly one source copy should exist in that entry. Edit its description manually and repeat. The edit must survive.
3. Import into another legitimately approved entry. Confirm each entry has its own copy and the original location is unchanged.
4. Start a bulk import, stop between writes, then retry. Completed imports remain; retry adds only missing spells. Simulate a failing pack or revoked permission and verify the reported partial count.
5. As a player, attempt to open unowned actors, configure GM access, use an unapproved pack, import uncommon/rare spells without permission and submit a forged higher-rank target. All module mutations must refuse.
6. Revoke source pack permission and GM entry access while a source loads. Refresh and import must honor current access. Grant one explicit uncommon spell UUID without enabling all uncommon spells; only that exception becomes available.

## Preparation and presets

1. Mark one standard slot expended and another unexpended through PF2e. Prepare/replace/clear both through this module. Their expended flags must remain unchanged.
2. Save Exploration and Combat presets for each entry. Load Exploration, adjust slots, and use Save over on Exploration. Cancel once and verify no change, then confirm and verify its name/ID and other presets remain intact. Check the 50-preset limit allows overwriting but refuses a new preset. Close the browser and rejoin; verify persistence. Compare each against current preparation before loading. Confirm missing spell IDs refuse the entire load. Delete Exploration: cancel once and verify no change, then confirm and verify only Exploration disappears, including after reload. Current preparation, resources, Combat, and Restore previous must remain unchanged. Repeat deletion after removing slot approval; Delete remains available while Save over is disabled.
3. Apply a preset while some slots are expended. Compare all resource values and the number of expended slots before/after. PF2e may reorder occupied slots; expended flags must remain attached to their slot records through this normalization. Restore previous and repeat the comparison. Apply presets on two entries, then restore each entry independently.
4. Change a slot, spell or grant after preview but before confirmation. Application must refuse with a stale-preview message.
5. Add a new rank through actual level advancement. Browse should reflect it automatically. Preparation must request GM review of the changed layout. Existing spells remain intact. Changing class/tradition/category invalidates access.
6. Enable physical auto-sync as GM, advance a suitable character and confirm only missing eligible spells import once. Disable it and verify browsing still updates but no bulk import happens.
7. Test two clients deliberately. Concurrent native casts/edits are a known transaction limitation. Record any lost update and do not mark production-ready until this limitation is accepted or addressed.

## Disablement and compatibility

1. Export each character, disable the module and reload. All imported spells, assignments, expended states, signatures and other PF2e data must still work on the native sheet. Module flags can remain inert.
2. Compare original and final exports. No existing spell may have been overwritten or deleted. Only requested imports, preparation assignments, favorites/recents/presets and approved settings should differ.
3. Repeat the relevant checks with PF2e Leveler and other desired modules, using authorized installations. Do not install or inspect proprietary modules without access.
4. Publish a test GitHub release after authorization. Install into a clean test world through the real manifest URL. Confirm the ZIP URL, updates and all packaged paths work.

Record date, versions, character exports, actions, expected/actual outcomes, screenshots and console logs. Only after the matrix passes should the manifest gain a verified runtime version and wider distribution be considered.

## Native known spell sorting

Use a mixed-entry test character with prepared duplicate slots, a cantrip, heightened spontaneous rows, innate uses, and focus spells. Save the actor data before testing.

1. Click **Sort spells**. Check focus first, cantrips next, ordinal rank headings, source subheaders, alphabetic order inside each source, and repeated occurrences. Verify native resources, empty slots, configuration controls and the create-entry button are hidden. Switch to **Casting type** and **Name** and check global order.
2. Cast or intercept a cast in each entry type. Check the native entry ID, cast rank, and prepared slot index. Check summary expansion, signature toggles, expended toggles, innate resets, and focus spell casting. Resource configuration returns in Default view.
3. Switch to **Default view**, then sort again several times. Check that the same native rows, inputs, empty slots, and resource nodes return to their original positions and original hidden states.
4. Re-render the sheet and check the saved mode. Check two users and two actors independently. Disable client storage and check that sorting and restoration still work.
5. Try dragging and dropping while sorted. Check that both are blocked. Restore **Default view** and check native drag behavior.
6. Check narrow widths, keyboard controls, and both sheet themes. Compare actor data before and after view-only changes. Test a malformed spell row and check that the entire panel stays native.

Automated pure ordering tests run with `npm test`. Bundle `tests/spell-sort.dom.mjs` with esbuild and run its exported `runSpellSortDomChecks()` in a browser with Foundry globals to check native row restoration, malformed DOM, and duplicate mounting. Live native actions and appearance require these checks in Foundry.
