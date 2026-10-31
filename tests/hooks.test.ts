import assert from 'node:assert/strict';
import test from 'node:test';
import type { ActorDocument, ItemDocument } from '../src/runtime.ts';
import { MODULE_ID, record } from '../src/core.ts';

test('version numbers allow controls, other systems refuse them, and a flag refresh preserves opted-in synchronization', async () => {
  const callbacks = new Map<string, (...args: never[]) => void>();
  let indexReads = 0;
  let registrations = 0;
  let writes = 0;
  const module: { api?: unknown } = {};
  const entry: ItemDocument = { id: 'entry', uuid: 'Item.entry', name: 'Divine', type: 'spellcastingEntry',
    system: { tradition: { value: 'divine' }, prepared: { value: 'prepared' }, slots: { slot1: { max: 1, value: 1, prepared: [{ id: null, expended: false }] } } },
    toObject: () => ({}), update: async () => undefined };
  const actor: ActorDocument = { id: 'a', uuid: 'Actor.a', name: 'Cleric', type: 'character', isOwner: true, class: { slug: 'cleric' },
    items: { contents: [entry], get: id => id === entry.id ? entry : undefined }, getFlag: () => undefined,
    setFlag: async () => { writes++; }, createEmbeddedDocuments: async () => { writes++; return []; }, sheet: { render: () => undefined } };
  const settings = new Map<string, unknown>([['autoSync', true], ['virtual', true], ['sources', 'test.spells'], ['grants', [
    { actorUuid: actor.uuid, entryId: entry.id, classSlug: 'cleric', category: 'prepared', tradition: 'divine', fullTradition: true }
  ]]]);
  Object.assign(globalThis, {
    Hooks: { once: (name: string, fn: (...args: never[]) => void) => callbacks.set(name, fn), on: (name: string, fn: (...args: never[]) => void) => callbacks.set(name, fn) },
    foundry: { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (base: unknown) => base } } },
    ui: { notifications: { error: (value: unknown) => assert.fail(String(value)), warn: () => undefined } },
    game: { system: { id: 'other', version: '9.0.0' }, release: { generation: 15 }, user: { id: 'gm', isGM: true },
      users: { contents: [{ id: 'gm', active: true, isGM: true }] }, modules: new Map([[MODULE_ID, module]]),
      settings: { get: (_scope: string, key: string) => settings.get(key), register: () => { registrations++; } },
      packs: [{ collection: 'test.spells', documentName: 'Item', testUserPermission: () => true,
        getIndex: async () => { indexReads++; return []; } }] }
  });
  await import('../src/main.ts');
  callbacks.get('init')?.();
  assert.equal(registrations, 0);
  callbacks.get('ready')?.();
  assert.equal(callbacks.has('updateActor'), false);
  assert.equal(module.api, undefined);
  game.system.id = 'pf2e';
  callbacks.get('init')?.();
  assert.ok(registrations > 0);
  callbacks.get('ready')?.();
  assert.equal(typeof record(module.api).open, 'function');
  const changed = callbacks.get('updateActor'); assert.ok(changed);
  Reflect.apply(changed, null, [actor, { system: { details: { level: { value: 5 } } } }]);
  Reflect.apply(changed, null, [actor, { flags: { example: true } }]);
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(indexReads, 1);
  registrations = 0;
  game.system.id = 'sf2e';
  delete module.api;
  callbacks.delete('updateActor');
  callbacks.get('init')?.();
  assert.ok(registrations > 0);
  callbacks.get('ready')?.();
  assert.equal(typeof record(module.api).open, 'function');
  const sfChanged = callbacks.get('updateActor'); assert.ok(sfChanged);
  for (const slug of ['mystic', 'witchwarper']) {
    actor.class = { slug };
    entry.system = { ...record(entry.system), prepared: { value: 'spontaneous' } };
    settings.set('grants', [{ actorUuid: actor.uuid, entryId: entry.id, classSlug: slug, category: 'spontaneous', tradition: 'divine', fullTradition: true }]);
    Reflect.apply(sfChanged, null, [actor, { system: { details: { level: { value: 5 } } } }]);
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  assert.equal(indexReads, 1);
  assert.equal(writes, 0);
});
