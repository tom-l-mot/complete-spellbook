import assert from 'node:assert/strict';
import test from 'node:test';
import type { ActorDocument, ItemDocument } from '../src/runtime.ts';

test('version numbers allow controls, other systems refuse them, and a flag refresh preserves opted-in synchronization', async () => {
  const callbacks = new Map<string, (...args: never[]) => void>();
  let indexReads = 0;
  const entry: ItemDocument = { id: 'entry', uuid: 'Item.entry', name: 'Divine', type: 'spellcastingEntry',
    system: { tradition: { value: 'divine' }, prepared: { value: 'prepared' }, slots: { slot1: { max: 1, value: 1, prepared: [{ id: null, expended: false }] } } },
    toObject: () => ({}), update: async () => undefined };
  const actor: ActorDocument = { id: 'a', uuid: 'Actor.a', name: 'Cleric', type: 'character', isOwner: true, class: { slug: 'cleric' },
    items: { contents: [entry], get: id => id === entry.id ? entry : undefined }, getFlag: () => undefined,
    setFlag: async () => undefined, createEmbeddedDocuments: async () => [], sheet: { render: () => undefined } };
  const settings = new Map<string, unknown>([['autoSync', true], ['virtual', true], ['sources', 'test.spells'], ['grants', [
    { actorUuid: actor.uuid, entryId: entry.id, classSlug: 'cleric', category: 'prepared', tradition: 'divine', fullTradition: true }
  ]]]);
  Object.assign(globalThis, {
    Hooks: { once: (name: string, fn: (...args: never[]) => void) => callbacks.set(name, fn), on: (name: string, fn: (...args: never[]) => void) => callbacks.set(name, fn) },
    foundry: { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (base: unknown) => base } } },
    ui: { notifications: { error: (value: unknown) => assert.fail(String(value)), warn: () => undefined } },
    game: { system: { id: 'other', version: '9.0.0' }, release: { generation: 15 }, user: { id: 'gm', isGM: true },
      users: { contents: [{ id: 'gm', active: true, isGM: true }] }, modules: new Map(),
      settings: { get: (_scope: string, key: string) => settings.get(key) },
      packs: [{ collection: 'test.spells', documentName: 'Item', testUserPermission: () => true,
        getIndex: async () => { indexReads++; return []; } }] }
  });
  await import('../src/main.ts');
  callbacks.get('ready')?.();
  assert.equal(callbacks.has('updateActor'), false);
  game.system.id = 'pf2e';
  callbacks.get('ready')?.();
  const changed = callbacks.get('updateActor'); assert.ok(changed);
  Reflect.apply(changed, null, [actor, { system: { details: { level: { value: 5 } } } }]);
  Reflect.apply(changed, null, [actor, { flags: { example: true } }]);
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(indexReads, 1);
});
