import { MODULE_ID } from './core.ts';
import { catalog, Spellbook } from './runtime.ts';
import type { ActorDocument } from './runtime.ts';
import type { SheetApplication, ItemHookDocument } from './foundry.d.ts';
import { CompleteSpellbook, openApps } from './app.ts';
import { registerSettings } from './settings.ts';
import { installSpellSort } from './spell-sort.ts';

export function open(actor: ActorDocument): CompleteSpellbook {
  const existing = [...openApps].find(app => app.book.actor.uuid === actor.uuid);
  const app = existing ?? new CompleteSpellbook(new Spellbook(actor, game, catalog));
  void app.render({ force: true }).catch(error => ui.notifications.error(String(error)));
  return app;
}
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingSync = new Set<string>();
function changed(actor: ActorDocument | undefined, sync = false): void {
  if (!actor || actor.type !== 'character') return;
  if (sync) pendingSync.add(actor.uuid);
  clearTimeout(timers.get(actor.uuid));
  timers.set(actor.uuid, setTimeout(() => {
    timers.delete(actor.uuid);
    const shouldSync = pendingSync.delete(actor.uuid);
    for (const app of openApps) if (app.book.actor.uuid === actor.uuid) void app.refresh();
    const electedGM = game.users.contents.filter(u => u.active && u.isGM).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (shouldSync && game.settings.get(MODULE_ID, 'autoSync') === true && electedGM?.id === game.user.id) {
      void (async () => {
        const book = new Spellbook(actor, game, catalog);
        for (const e of book.entries()) {
          if (!book.grant(e)?.fullTradition) continue;
          const keys = (await book.list(e.id)).filter(s => s.origin.kind === 'virtual').map(s => s.key);
          if (keys.length) { const outcome = await book.import(e.id, keys); if (outcome.stopped) ui.notifications.warn(outcome.stopped); }
        }
      })().catch(error => ui.notifications.error(String(error)));
    }
  }, 250));
}
Hooks.once('init', registerSettings);
Hooks.once('ready', () => {
  if (game.system.id !== 'pf2e') {
    ui.notifications.warn('PF2e Complete Spellbook requires the Pathfinder Second Edition system.'); return;
  }
  const module = game.modules.get(MODULE_ID); if (module) module.api = { open };
  Hooks.on('renderActorSheet', (sheet: SheetApplication, html: HTMLElement | { 0?: HTMLElement }) => {
    const actor = sheet.actor ?? sheet.document;
    if (!actor?.isOwner || actor.type !== 'character') return;
    const root = html instanceof HTMLElement ? html : html[0]; if (!root) return;
    installSpellSort(root, actor.uuid);
    if (root.querySelector('[data-complete-spellbook]')) return;
    const knownSpells = root.querySelector('.spellcasting .sub-nav [data-tab="known-spells"]'); if (!knownSpells) return;
    const button = document.createElement('button'); button.type = 'button'; button.dataset.completeSpellbook = 'true';
    button.className = 'cs-sheet-open'; button.title = game.i18n.localize('CS.Title'); button.setAttribute('aria-label', button.title);
    const icon = document.createElement('i'); icon.className = 'fa-solid fa-book-open'; icon.setAttribute('aria-hidden', 'true'); button.append(icon);
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); open(actor); }); knownSpells.before(button);
  });
  Hooks.on('updateActor', (actor: ActorDocument, changes: Record<string, unknown>) => changed(actor, JSON.stringify(changes).includes('system')));
  for (const event of ['createItem', 'updateItem', 'deleteItem']) Hooks.on(event, (item: ItemHookDocument) => {
    if (item.pack) catalog.invalidate();
    changed(item.actor, ['spellcastingEntry', 'class', 'feat', 'deity'].includes(item.type));
  });
  Hooks.on('updateCompendium', () => { catalog.invalidate(); for (const app of openApps) void app.refresh(); });
  Hooks.on('updateSetting', () => { catalog.invalidate(); for (const app of openApps) void app.refresh(); });
});
