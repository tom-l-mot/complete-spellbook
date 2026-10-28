# Architecture and decisions

## Usage

An owner opens Complete Spellbook from a character sheet, selects an entry or all entries, and searches existing and eligible virtual spells. Supported ordinary entries are recognized automatically. The GM checks ambiguous entries and uncertain whole ranks. A preparation action imports only the selected virtual spell. Casting remains on the native PF2e sheet.

```ts
const book = new Spellbook(actor, game, catalog);
const spells = await book.list(entryId);
await book.prepare(entryId, spells[0].key, 1, 0);
const preview = book.preview(entryId, preset);
await book.applyPreset(entryId, preset, preview.fingerprint);
```

## Ownership

`access.ts` recognizes supported class entries and identifies uncertainty. `core.ts` owns pure eligibility, slot validation, filters and assignment-only presets. Spell origins distinguish virtual compendium rows from actor-owned items. `runtime.ts` owns all document effects, the compendium cache and GM grants. `app.ts` owns display and dialogs. `main.ts` connects hooks and version guards; `settings.ts` registers configuration. UI actions cannot bypass runtime permission and policy checks.

This is an independent implementation. The narrow Foundry declarations describe the methods used; passing TypeScript checks is not proof that the actual runtime implements them. Source verification and manual runtime testing remain separate evidence.

## Synthesis decision

Two independent design sketches were compared. The Astra medium cross-judge scored candidate A 23/25 and B 21/25 and preferred A. Parent agreed. A's positive slot authorization and single-update preset application were retained. B contributed post-import location checks and known-spell data in preview fingerprints. The candidates converged on a dedicated application, pure core and one document adapter. Sequential preset writes were rejected because they write whole rank arrays repeatedly and can leave partial preparation.

Requested design runners were Astra medium and Sol medium. Effective runtime models and effort were not exposed. Designs are working artifacts under the parent workspace's `.audit/spellbook-research` directory.

## Contracts and reconciliation

- Source entitlement comes from conservative class/entry recognition or a GM-controlled world setting. Recognition requires one matching prepared entry with cantrips and rejects archetype, grant-parent, and special-entry ambiguity. Character class alone does not identify an entry.
- A grant binds current tradition, class slug and category. Preparation also binds the slot layout and a positive set of wholly ordinary rank groups. Manually approved new slot layouts require GM review. Automatic ordinary entries follow their current layout. Cleric and Wizard ranked slots and Magus Studious Spells require whole-rank confirmation because native PF2e has no per-slot restriction marker.
- No actor update is needed for browsing. Full compendium documents load only for details/import.
- Imports preserve owned documents. Canonical source UUID plus entry ID prevents repeated imports in the same module client. Importing the same source into a second legitimate entry is allowed.
- Preparation rechecks current ownership, slot shape, membership and rank. Focus, ritual and flexible ranked preparation use the native sheet.
- Presets store item IDs and slot coordinates, never expended/max/value. All assignments are validated before one entry update. Previous assignments are saved separately per entry before the update. No missing-spell recovery import is attempted when applying a preset; the user must repair the missing spell and save a new preset.
- A failure after importing can leave that valid owned spell available. The module never deletes it as rollback. Import retries discover existing items; bulk import stops on first failure and reports completed count.
- Queues serialize this module's local actor mutations. They do not lock another browser or native-sheet actions. Preview fingerprints detect observed changes but are not server transactions.
- Auto-import is a separate GM opt-in, off by default. Only the elected active GM runs it. Virtual refresh does not depend on this setting.

The GM configuration stores a positive list of whole ordinary ranks; mixed groups stay on the native sheet because PF2e compacts occupied slots. This follows the Model the Domain principle by representing approved rank groups explicitly. The dedicated application follows the Laziness Protocol by avoiding a second character sheet implementation. Exact tests and package inspection follow Prove It Works; live acceptance remains open.

## Current boundaries

No custom attunement engine, learning checks, spellbook market valuation, resource restoration, direct casting, staff integration, or flexible collection editor is included. Existing data is preserved and the native sheet handles these workflows. These are deliberate MVP limits, not completed phase-four features.
