# Live acceptance test procedure

Status: **NOT RUN**. Automated synthetic tests are not substitutes for these steps. A local Foundry 14.369 campaign was running with a connected user; this task did not install into, restart, or modify that world.

## Prepare an isolated world

1. Back up a disposable PF2e world. Use Foundry 14.369 and PF2e 8.6.1. Record exact versions and enabled modules.
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
2. Save Exploration and Combat presets for each entry. Close the browser and rejoin; verify persistence. Compare each against current preparation before loading. Confirm missing spell IDs refuse the entire load.
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
