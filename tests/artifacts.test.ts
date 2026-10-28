import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import Handlebars from 'handlebars';
import { Catalog, Spellbook } from '../src/runtime.ts';
import type { ActorDocument, Environment, ItemDocument } from '../src/runtime.ts';
import type { Preset } from '../src/core.ts';
import { record, slotShape } from '../src/core.ts';

const language = JSON.parse(await readFile('lang/en.json', 'utf8'));
function localize(key: string): string {
  let value: unknown = language;
  for (const part of key.split('.')) value = record(value)[part];
  assert.equal(typeof value, 'string', `Missing localization: ${key}`);
  return String(value);
}
const template = await readFile('templates/spellbook.hbs', 'utf8');
Handlebars.registerHelper('localize', localize);

test('template compiles, translates all labels, and escapes spell names', () => {
  const html = Handlebars.compile(template)({ rows: [{ name: '<script>attack()</script>', key: 'safe', entryId: 'main' }], entries: [] });
  assert.ok(html.includes('&lt;script&gt;attack()&lt;/script&gt;'));
  assert.ok(!html.includes('<script>attack()'));
  for (const match of template.matchAll(/localize '([^']+)'/g)) localize(match[1]!);
});

test('settings have translated names and hints and manifest paths are local', async () => {
  const { SETTINGS } = await import('../src/settings.ts');
  for (const key of Object.keys(SETTINGS)) { localize(`CS.Settings.${key}.Name`); localize(`CS.Settings.${key}.Hint`); }
  const manifest = JSON.parse(await readFile('module.json', 'utf8'));
  assert.equal(manifest.id, 'pf2e-complete-spellbook');
  assert.equal(manifest.compatibility.verified, undefined);
  assert.equal(manifest.manifest, undefined);
  assert.equal(manifest.version, JSON.parse(await readFile('package.json', 'utf8')).version);
});

test('actual application context paginates and filters synthetic spells; render preview', async () => {
  const entry: ItemDocument = { id: 'main', uuid: 'Item.main', name: 'Divine preparation', type: 'spellcastingEntry',
    system: { tradition: { value: 'divine' }, prepared: { value: 'prepared' }, slots: { slot1: { max: 2, value: 1, prepared: [{ id: 'spell0', expended: true }, { id: null, expended: false }] } } },
    toObject: () => ({}), update: async () => undefined };
  const items: ItemDocument[] = Array.from({ length: 205 }, (_, i) => ({
    id: `spell${i}`, uuid: `Item.spell${i}`, type: 'spell', name: `Synthetic spell ${String(i).padStart(3, '0')}`,
    system: { level: { value: 1 }, traits: { value: ['concentrate'], traditions: ['divine'], rarity: 'common' },
      location: { value: 'main' }, description: { value: i === 204 ? 'Unique description match' : 'Example healing light' }, time: { value: '2' } },
    toObject: () => ({}), update: async () => undefined
  }));
  const actor: ActorDocument = { id: 'test', uuid: 'Actor.test-ui', name: 'Synthetic Cleric', type: 'character', isOwner: true, class: { slug: 'cleric' },
    items: { contents: [entry, ...items], get: id => [entry, ...items].find(i => i.id === id) },
    getFlag: () => [], setFlag: async () => undefined, createEmbeddedDocuments: async () => [], sheet: { render: () => undefined } };
  const env: Environment = { user: { id: 'gm', isGM: true }, packs: [], settings: { get: (_scope, key) => ['presets', 'favorites', 'import'].includes(key), set: async () => undefined } };
  class Base {
    rendered = false;
    async render() { this.rendered = true; return this; }
    async close() { this.rendered = false; return this; }
  }
  Object.assign(globalThis, { game: { ...env, i18n: { localize } }, foundry: { applications: { api: { ApplicationV2: Base, HandlebarsApplicationMixin: (base: unknown) => base } } } });
  Object.assign(globalThis, { document: { createElement: (tag: string) => {
    assert.equal(tag, 'template');
    return { content: { textContent: '', querySelectorAll: () => [] }, set innerHTML(value: string) {
      assert.ok(!/[<>]/.test(value), 'This fixture supplies plain descriptions; HTML preview is verified in the browser.');
      this.content.textContent = value;
    } };
  } } });
  const { CompleteSpellbook } = await import('../src/app.ts');
  class TestApp extends CompleteSpellbook { context() { return this._prepareContext(); } }
  const app = new TestApp(new Spellbook(actor, env, new Catalog()));
  const context = await app.context();
  assert.equal(context.total, 205); assert.equal(context.pages, 3);
  assert.equal(Array.isArray(context.rows) && context.rows.length, 100);
  assert.equal(record((context.rows as unknown[])[0]).status, 'Prepared');
  assert.equal(record((context.rows as unknown[])[1]).status, 'Added');
  assert.equal(context.selectionDisabled, true);
  assert.equal(context.noneSelected, true);
  assert.equal(record((context.rows as unknown[])[1]).selectable, false);
  assert.equal(record((context.rows as unknown[])[1]).snippet, 'Example healing light');
  assert.ok(Array.isArray(context.statuses));
  assert.equal(context.statuses.map(record).find(s => s.value === 'virtual')?.label, 'Available');
  assert.equal(context.statuses.map(record).find(s => s.value === 'owned')?.label, 'Added');
  app.filters.search = 'Unique description';
  const filtered = await app.context();
  assert.equal(filtered.total, 1);
  assert.equal(record((filtered.rows as unknown[])[0]).name, 'Synthetic spell 204');
  app.filters.search = ''; app.entryId = '';
  assert.equal((await app.context()).hasEntry, false);
  const stale: Preset = { version: 1, id: 'stale', name: 'Old combat', entryId: 'main', assignments: [{ rank: 1, index: 4, spellId: 'deleted-spell' }] };
  const another: Preset = { ...stale, id: 'other', name: 'Old exploration', assignments: [{ rank: 1, index: 4, spellId: null }] };
  actor.getFlag = (_scope, key) => key === 'presets' ? [stale, another] : [];
  let dialogs = 0, selectedBaseline = '';
  Object.assign(foundry.applications.api, { DialogV2: {
    input: async () => { dialogs++; return { baseline: selectedBaseline }; },
    confirm: async ({ content }: { content: string }) => { dialogs++; assert.ok(content.includes(localize('CS.Unavailable'))); return true; }
  } });
  const showPreset = Reflect.get(app, 'showPreset'); assert.equal(typeof showPreset, 'function');
  await Reflect.apply(showPreset, app, ['main', stale, true]);
  selectedBaseline = 'other';
  await Reflect.apply(showPreset, app, ['main', stale, true]);
  assert.equal(dialogs, 4);
  await assert.rejects(Reflect.apply(showPreset, app, ['main', stale, false]), /GM must review|missing/);
  app.entryId = 'main';
  Object.assign(foundry.applications.api, { DialogV2: { input: async ({ content }: { content: string }) => {
    assert.ok(content.includes('name="rank1"'));
    assert.ok(content.includes('type="checkbox"'));
    assert.ok(!content.includes('UUID') && !content.includes('name="ranks"'));
    assert.ok(content.includes('name="access"'));
    return null;
  } } });
  const configure = Reflect.get(app, 'configure'); assert.equal(typeof configure, 'function');
  await Reflect.apply(configure, app, []);
  record(record(entry.system).slots).slot0 = { max: 1, prepared: [{ id: null, expended: false }] };
  const getSetting = env.settings.get;
  for (const [classSlug, fullTradition] of [['cleric', false], ['wizard', true]] as const) {
    actor.class = { slug: classSlug };
    const grant = { actorUuid: actor.uuid, entryId: entry.id, classSlug, category: 'prepared', tradition: 'divine',
      fullTradition, extra: [], preparation: true, allowedRanks: [0, 1], slotShape: slotShape(app.book.entry(entry.id)) };
    if (classSlug === 'wizard') { record(record(entry.system).tradition).value = 'arcane'; grant.tradition = 'arcane'; }
    env.settings.get = (scope, key) => key === 'grants' ? [grant] : getSetting(scope, key);
    let saved: unknown;
    env.settings.set = async (_scope, _key, value) => { saved = value; };
    Object.assign(foundry.applications.api, { DialogV2: { input: async () => ({ rank0: true, rank1: true }) } });
    await Reflect.apply(configure, app, []);
    assert.ok(Array.isArray(saved));
    assert.equal(record(saved[0]).fullTradition, fullTradition, 'Saving ranks must preserve the GM spell-access choice');
  }
  const css = await readFile('styles/spellbook.css', 'utf8');
  const html = Handlebars.compile(template)(context);
  await mkdir('.audit', { recursive: true });
  await writeFile('.audit/ui-preview.html', `<!doctype html><html lang="en"><meta charset="utf-8"><title>Complete Spellbook synthetic preview</title><style>
    :root{color-scheme:dark;--color-text-primary:#eee;--color-bg-option:#30313a;--color-border-light-primary:#666}*{box-sizing:border-box}body{margin:20px;background:#202127;font:14px system-ui;color:#eee}button,input,select{font:inherit;background:#34353d;color:inherit;border:1px solid #777;border-radius:4px;padding:5px}button{cursor:pointer}table{border-collapse:collapse}tr:nth-child(even){background:#ffffff08}.window-content{height:760px;max-height:calc(100vh - 90px);border:1px solid #777;border-radius:8px}h3{font-size:16px} ${css}</style><p>Synthetic UI preview. This is not a live Foundry runtime test.</p><main class="pf2e-complete-spellbook"><div class="window-content">${html}</div></main></html>`);
  await app.close();
});
