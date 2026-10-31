import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SOURCES, isSupportedSystem, registerSettings } from '../src/settings.ts';

test('system defaults register without changing saved sources, including an empty choice', () => {
  assert.deepEqual(DEFAULT_SOURCES, { pf2e: 'pf2e.spells-srd', sf2e: 'sf2e.spells' });
  for (const [systemId, expected] of [['pf2e', 'pf2e.spells-srd'], ['sf2e', 'sf2e.spells']]) {
    for (const saved of [undefined, 'custom.spells', '']) {
      const registered = new Map<string, Record<string, unknown>>();
      const persisted = new Map(saved === undefined ? [] : [['sources', saved]]);
      Object.assign(globalThis, { game: { system: { id: systemId }, settings: {
        register: (_scope: string, key: string, options: Record<string, unknown>) => registered.set(key, options),
        get: (_scope: string, key: string) => persisted.has(key) ? persisted.get(key) : registered.get(key)?.default,
        set: () => assert.fail('Registration must not write persisted settings.')
      } } });
      registerSettings();
      assert.equal(registered.get('sources')?.default, expected);
      assert.equal(game.settings.get('', 'sources'), saved ?? expected);
      assert.equal(persisted.get('sources'), saved);
    }
  }
  for (const id of ['other', 'toString', '__proto__']) {
    assert.equal(isSupportedSystem(id), false);
    Object.assign(globalThis, { game: { system: { id }, settings: { register: () => assert.fail('Unsupported system registered settings.') } } });
    registerSettings();
  }
});
