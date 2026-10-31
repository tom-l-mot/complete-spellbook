import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { record, slotShape, favoriteKey, matches } from '../src/core.ts';
import type { Preset } from '../src/core.ts';
import { Catalog, INDEX_FIELDS, Spellbook, parseEntry } from '../src/runtime.ts';
import type { ActorDocument, Environment, ItemDocument, Pack } from '../src/runtime.ts';

Object.assign(globalThis, { foundry: { utils: { randomID: () => randomBytes(12).toString('hex') } } });

function deferred() {
  let release = () => {};
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

function spellSystem(entryId = '') {
  return { level: { value: 1 }, traits: { value: [], traditions: ['arcane'], rarity: 'common' },
    location: { value: entryId }, time: { value: '2' }, description: { value: 'Synthetic spell.' } };
}
function normalizePrepared(system: Record<string, unknown>) {
  for (const group of Object.values(record(system.slots))) {
    const rows = record(group).prepared;
    if (Array.isArray(rows)) rows.sort((a, b) => Number(record(a).id === null) - Number(record(b).id === null));
  }
}

class MemoryItem implements ItemDocument {
  id: string;
  type: string;
  name: string;
  system: Record<string, unknown>;
  uuid: string;
  flags: unknown = {};
  _stats: unknown = {};
  updates: Record<string, unknown>[] = [];
  sheet = { render: () => {} };
  spells?: ItemDocument['spells'];
  constructor(id: string, type: string, name: string, system: Record<string, unknown>) {
    this.id = id;
    this.type = type;
    this.name = name;
    this.system = system;
    this.uuid = `Item.${id}`;
  }
  toObject(): Record<string, unknown> {
    return structuredClone({ _id: this.id, type: this.type, name: this.name, system: this.system, flags: this.flags, _stats: this._stats });
  }
  async update(changes: Record<string, unknown>) {
    this.updates.push(structuredClone(changes));
    for (const [path, value] of Object.entries(changes)) {
      const parts = path.split('.');
      assert.equal(parts.shift(), 'system');
      const last = parts.pop();
      assert.ok(last);
      let target = this.system;
      for (const part of parts) target = record(target[part]);
      target[last] = structuredClone(value);
    }
    normalizePrepared(this.system);
    return this;
  }
}

let actorNumber = 0;
class MemoryActor implements ActorDocument {
  uuid = `Actor.synthetic-${++actorNumber}`;
  id = this.uuid;
  type = 'character';
  name = 'Synthetic character';
  isOwner = true;
  class = { slug: 'wizard' };
  flags = new Map<string, unknown>();
  created: Record<string, unknown>[] = [];
  failName: string | null = null;
  afterCreate: (() => void) | undefined;
  beforeFlag: (() => Promise<void>) | undefined;
  items: ActorDocument['items'] = { contents: [], get: (id: string) => this.items.contents.find(i => i.id === id) };
  sheet = { render: () => {} };
  getFlag(_scope: string, key: string) { return this.flags.get(key); }
  async setFlag(_scope: string, key: string, value: unknown) {
    await this.beforeFlag?.();
    this.flags.set(key, structuredClone(value));
  }
  async createEmbeddedDocuments(_type: 'Item', data: Record<string, unknown>[]) {
    const documents = data.map(source => {
      if (source.name === this.failName) throw new Error('Synthetic create failure.');
      assert.ok(typeof source.name === 'string');
      const item = new MemoryItem(`owned-${this.created.length + 1}`, 'spell', source.name, structuredClone(record(source.system)));
      item.flags = structuredClone(source.flags);
      item._stats = structuredClone(source._stats);
      this.created.push(structuredClone(source));
      this.items.contents.push(item);
      return item;
    });
    this.afterCreate?.();
    return documents;
  }
}

class MemoryPack implements Pack {
  collection = 'synthetic.spells';
  documentName = 'Item';
  allowed = true;
  indexReads = 0;
  documentReads = 0;
  beforeIndex: (() => Promise<void>) | undefined;
  beforeDocument: (() => Promise<void>) | undefined;
  fields: string[] = [];
  docs = ['alpha', 'beta', 'gamma'].map(id => new MemoryItem(id, 'spell', id, spellSystem()));
  testUserPermission() { return this.allowed; }
  async getIndex(options: { fields: string[] }) {
    this.indexReads++;
    this.fields = options.fields;
    await this.beforeIndex?.();
    return this.docs.map(doc => doc.toObject());
  }
  async getDocument(id: string) {
    this.documentReads++;
    await this.beforeDocument?.();
    return this.docs.find(doc => doc.id === id) ?? null;
  }
}

function addEntry(actor: MemoryActor, id = 'entry') {
  const item = new MemoryItem(id, 'spellcastingEntry', id, {
    tradition: { value: 'arcane' }, prepared: { value: 'prepared', flexible: false },
    slots: { slot1: { max: 3, value: 2, prepared: [
      { id: null, expended: true }, { id: null, expended: false }, { id: null, expended: true }
    ] } }
  });
  item.spells = { prepareSpell: async (spell, rank, index) => {
    const group = record(record(item.system.slots)[`slot${rank === 'cantrips' ? 0 : rank}`]);
    assert.ok(Array.isArray(group.prepared));
    const expended = record(group.prepared[index]).expended === true;
    group.prepared[index] = { id: spell?.id ?? null, expended };
    normalizePrepared(item.system);
    return item;
  } };
  actor.items.contents.push(item);
  return item;
}

function fixture() {
  const actor = new MemoryActor();
  const entry = addEntry(actor);
  const pack = new MemoryPack();
  const settings = new Map<string, unknown>([
    ['sources', pack.collection], ['cacheMinutes', 10], ['virtual', true], ['import', true],
    ['presets', true], ['favorites', true], ['uncommon', false], ['rare', false], ['legacy', false]
  ]);
  const env: Environment = { system: { id: 'pf2e' }, user: { id: 'synthetic-user', isGM: true }, packs: [pack], settings: {
    get: (_scope, key) => settings.get(key),
    set: async (_scope, key, value) => { settings.set(key, value); }
  } };
  const catalog = new Catalog();
  const book = new Spellbook(actor, env, catalog);
  function authorize(item = entry) {
    const parsed = parseEntry(item);
    assert.ok(parsed);
    const current = settings.get('grants');
    settings.set('grants', [...(Array.isArray(current) ? current : []), {
      actorUuid: actor.uuid, entryId: item.id, tradition: 'arcane', category: 'prepared', classSlug: 'wizard',
      fullTradition: true, extra: [], preparation: true, slotShape: slotShape(parsed), allowedRanks: [1]
    }]);
  }
  authorize();
  return { actor, entry, pack, settings, env, catalog, book, authorize };
}

const sourceKey = (id = 'alpha') => `Compendium.synthetic.spells.Item.${id}`;
test('SF2e prepared lists require review even for a copied PF2e class, then use explicit grants', async () => {
  const f = fixture(); f.env.system.id = 'sf2e'; f.actor.class.slug = 'cleric'; f.settings.delete('grants');
  record(f.entry.system.slots).slot0 = { max: 1, value: 1, prepared: [{ id: null, expended: false }] };
  f.entry.flags = { sf2e: { grantedBy: { id: 'granting-feature' } } };
  assert.deepEqual(f.book.recognition(f.book.entry('entry')), { kind: 'review', reason: 'UnclearEntry' });
  assert.equal(f.book.needsSetup(f.book.entry('entry')), true);
  assert.equal((await f.book.list('entry')).length, 0);
  await f.book.configure('entry', { fullTradition: true, extra: [], preparation: true, allowedRanks: [0, 1] });
  await f.book.prepare('entry', sourceKey(), 1, 0);
  assert.equal(f.actor.created.length, 1);
  const slots = prepared(f.entry); assert.ok(Array.isArray(slots));
  assert.equal(record(slots[0]).id, 'owned-1');
});

test('recognition reads grant provenance from the active system namespace', () => {
  const f = fixture(); f.settings.delete('grants'); f.actor.class.slug = 'druid';
  f.entry.system.tradition = { value: 'primal' };
  record(f.entry.system.slots).slot0 = { max: 1, value: 1, prepared: [{ id: null, expended: false }] };
  f.entry.flags = { sf2e: { grantedBy: { id: 'foreign-feature' } } };
  assert.equal(f.book.recognition(f.book.entry('entry')).kind, 'automatic');
  f.entry.flags = { pf2e: { grantedBy: { id: 'active-feature' } } };
  assert.equal(f.book.recognition(f.book.entry('entry')).kind, 'review');
  f.env.system.id = 'sf2e';
  let sfProvenanceReads = 0;
  f.entry.flags = { get sf2e() { sfProvenanceReads++; return { grantedBy: { id: 'active-feature' } }; },
    get pf2e() { return assert.fail('SF2e recognition read PF2e provenance.'); } };
  assert.equal(f.book.recognition(f.book.entry('entry')).kind, 'review');
  assert.equal(sfProvenanceReads, 1);
});

for (const slug of ['mystic', 'witchwarper']) test(`SF2e ${slug} browses owned repertoire and refuses writes despite stale grants`, async () => {
  const f = fixture();
  await f.book.prepare('entry', sourceKey(), 1, 0);
  await f.book.savePreset('entry', 'Before conversion');
  const preset = f.book.presets('entry')[0]; assert.ok(preset);
  f.env.system.id = 'sf2e'; f.actor.class.slug = slug;
  f.entry.system.prepared = { value: 'spontaneous' };
  f.settings.set('grants', [{ actorUuid: f.actor.uuid, entryId: f.entry.id, classSlug: slug, category: 'spontaneous', tradition: 'arcane', fullTradition: true,
    extra: [], preparation: true, slotShape: slotShape(f.book.entry('entry')), allowedRanks: [1] }]);
  const before = structuredClone({ created: f.actor.created, flags: [...f.actor.flags], system: f.entry.system, settings: [...f.settings] });
  const listed = await f.book.list('entry');
  assert.deepEqual(listed.map(s => s.name), ['alpha']);
  assert.equal(f.book.grant(f.book.entry('entry')), undefined);
  assert.equal(f.book.needsSetup(f.book.entry('entry')), false);
  const outcome = await f.book.import('entry', [sourceKey('beta')]);
  assert.equal(outcome.imported, 0); assert.match(outcome.stopped ?? '', /not eligible/);
  await assert.rejects(f.book.prepare('entry', 'owned-1', 1, 0), /character sheet/);
  await assert.rejects(f.book.configure('entry', { fullTradition: true, extra: [], preparation: true, allowedRanks: [1] }), /character sheet/);
  await assert.rejects(f.book.savePreset('entry', 'Unsafe'), /No approved/);
  assert.throws(() => f.book.preview('entry', preset));
  await assert.rejects(f.book.applyPreset('entry', preset, f.book.fingerprint('entry')));
  assert.deepEqual({ created: f.actor.created, flags: [...f.actor.flags], system: f.entry.system, settings: [...f.settings] }, before);
});
test('automatic Druid access works for an owner without writing GM settings and preserves spent slots', async () => {
  const f = fixture(); f.settings.delete('grants'); f.actor.class.slug = 'druid'; f.env.user.isGM = false;
  f.entry.system.tradition = { value: 'primal' };
  record(f.entry.system.slots).slot0 = { max: 1, value: 1, prepared: [{ id: null, expended: false }] };
  for (const doc of f.pack.docs) record(doc.system.traits).traditions = ['primal'];
  assert.equal(f.book.needsSetup(f.book.entry('entry')), false);
  assert.equal((await f.book.list('entry')).length, 3);
  await f.book.prepare('entry', sourceKey(), 1, 0);
  assert.equal(record((prepared(f.entry) as unknown[])[0]).expended, true);
  await f.book.savePreset('entry', 'Automatic');
  assert.equal(f.book.presets('entry')[0]?.assignments.length, 4);
  assert.equal(f.settings.has('grants'), false);
  await assert.rejects(f.book.configure('entry', { fullTradition: true, extra: [], preparation: true, allowedRanks: [1] }), /Only the GM/);
});
test('Cleric uncertainty blocks ranked writes until the GM confirms whole ranks', async () => {
  const f = fixture(); f.settings.delete('grants'); f.actor.class.slug = 'cleric';
  f.entry.system.tradition = { value: 'divine' };
  record(f.entry.system.slots).slot0 = { max: 1, value: 1, prepared: [{ id: null, expended: false }] };
  const before = structuredClone(f.entry.system);
  assert.equal(f.book.needsSetup(f.book.entry('entry')), true);
  await assert.rejects(f.book.prepare('entry', null, 1, 0), /restricted|unconfirmed/);
  assert.deepEqual(f.entry.system, before);
  await f.book.configure('entry', { fullTradition: true, extra: [], preparation: true, allowedRanks: [0] });
  assert.equal(f.book.needsSetup(f.book.entry('entry')), false);
  await assert.rejects(f.book.prepare('entry', null, 1, 0), /restricted|unconfirmed/);
  record(record(f.entry.system.slots).slot1).max = 4;
  assert.equal(f.book.needsSetup(f.book.entry('entry')), true);
  await assert.rejects(f.book.prepare('entry', null, 0, 0), /GM must review/);
});
test('known special entries override old approval and archetype traits prevent automatic access', async () => {
  const f = fixture(); f.entry.name = 'Divine Font';
  const before = structuredClone(f.entry.system);
  assert.equal(f.book.grant(f.book.entry('entry')), undefined);
  await assert.rejects(f.book.prepare('entry', null, 1, 0), /GM must review/);
  assert.deepEqual(f.entry.system, before);
  f.entry.name = 'Spells'; f.settings.delete('grants'); f.actor.class.slug = 'druid';
  f.entry.system.tradition = { value: 'primal' };
  record(f.entry.system.slots).slot0 = { max: 1, prepared: [{ id: null, expended: false }] };
  f.actor.items.contents.push(new MemoryItem('dedication', 'feat', 'Renamed feat', { slug: 'custom', traits: { value: ['archetype'] } }));
  assert.equal(f.book.recognition(f.book.entry('entry')).kind, 'review');
  assert.equal(f.book.grant(f.book.entry('entry')), undefined);
});
test('Wizard curriculum cantrips reject writes before changing a slot', async () => {
  const f = fixture(); f.settings.delete('grants');
  record(f.entry.system.slots).slot0 = { max: 6, value: 6, prepared: Array.from({ length: 6 }, () => ({ id: null, expended: false })) };
  const before = structuredClone(f.entry.system);
  await assert.rejects(f.book.prepare('entry', null, 0, 5), /restricted|unconfirmed/);
  assert.deepEqual(f.entry.system, before);
});
function prepared(item: MemoryItem) {
  return record(record(item.system.slots).slot1).prepared;
}
function preset(entryId = 'entry'): Preset {
  return { version: 1, id: 'synthetic-preset', name: 'Synthetic preparation', entryId,
    assignments: [{ rank: 1, index: 0, spellId: 'owned-1' }, { rank: 1, index: 1, spellId: null }] };
}

test('catalog coalesces concurrent indexes, caches, and invalidates explicitly', async () => {
  const f = fixture();
  const [first, second] = await Promise.all([f.catalog.read(f.env), f.catalog.read(f.env)]);
  assert.deepEqual(first.map(s => s.name), ['alpha', 'beta', 'gamma']);
  assert.deepEqual(second, first);
  assert.equal(f.pack.indexReads, 1);
  assert.deepEqual(f.pack.fields, INDEX_FIELDS);
  await f.catalog.read(f.env);
  assert.equal(f.pack.indexReads, 1);
  f.catalog.invalidate();
  await f.catalog.read(f.env);
  assert.equal(f.pack.indexReads, 2);
});

test('cached catalog respects revoked permissions and disabled sources', async () => {
  const f = fixture();
  assert.equal((await f.book.list('entry')).length, 3);
  f.pack.allowed = false;
  assert.deepEqual(await f.book.list('entry'), []);
  f.pack.allowed = true;
  f.settings.set('sources', '');
  assert.deepEqual(await f.book.list('entry'), []);
  assert.equal(f.pack.indexReads, 1);
});

for (const revoke of ['permission', 'source', 'grant'] as const) {
  test(`listing rechecks ${revoke} after awaiting the index`, async () => {
    const f = fixture(), entered = deferred(), continueRead = deferred();
    f.pack.beforeIndex = async () => { entered.release(); await continueRead.promise; };
    const listing = f.book.list('entry');
    await entered.promise;
    if (revoke === 'permission') f.pack.allowed = false;
    else if (revoke === 'source') f.settings.set('sources', '');
    else f.settings.set('grants', []);
    continueRead.release();
    assert.deepEqual(await listing, []);
  });
}

test('repeated and concurrent imports create one item without overwriting it', async () => {
  const f = fixture();
  const results = await Promise.all([f.book.import('entry', [sourceKey(), sourceKey()]), f.book.import('entry', [sourceKey()])]);
  assert.deepEqual(results, [{ imported: 1, stopped: null }, { imported: 0, stopped: null }]);
  const item = f.actor.items.get('owned-1');
  assert.ok(item);
  item.name = 'Player customization';
  record(record(item.system).location).signature = true;
  const saved = item.toObject();
  assert.deepEqual(await f.book.import('entry', [sourceKey()]), { imported: 0, stopped: null });
  assert.deepEqual(item.toObject(), saved);
  assert.equal(f.actor.created.length, 1);
  assert.equal(f.actor.created[0]?._id, undefined);
});

test('source deduplication is scoped to the entry and keeps both locations intact', async () => {
  const f = fixture(), other = addEntry(f.actor, 'other');
  f.authorize(other);
  await f.book.import('entry', [sourceKey()]);
  const first = f.actor.items.get('owned-1');
  assert.ok(first);
  const saved = first.toObject();
  assert.deepEqual(await f.book.import('other', [sourceKey()]), { imported: 1, stopped: null });
  assert.deepEqual(first.toObject(), saved);
  assert.equal(record(record(f.actor.items.get('owned-2')?.system).location).value, 'other');
  assert.deepEqual(await f.book.import('other', [sourceKey()]), { imported: 0, stopped: null });
  assert.equal(f.actor.created.length, 2);
});

test('nonowners cannot list, import, prepare, save presets, or change favorites', async () => {
  const f = fixture();
  const before = f.actor.items.contents.map(i => i.toObject());
  f.actor.isOwner = false;
  await assert.rejects(f.book.list('entry'), /ownership/);
  await assert.rejects(f.book.import('entry', [sourceKey()]), /ownership/);
  await assert.rejects(f.book.prepare('entry', null, 1, 0), /ownership/);
  await assert.rejects(f.book.savePreset('entry', 'Denied'), /ownership/);
  await assert.rejects(f.book.favorite(sourceKey()), /ownership/);
  assert.deepEqual(f.actor.items.contents.map(i => i.toObject()), before);
  assert.equal(f.actor.flags.size, 0);
});

for (const revoke of ['permission', 'source', 'grant', 'import', 'ownership'] as const) {
  test(`import rechecks ${revoke} after awaiting the source document`, async () => {
    const f = fixture(), entered = deferred(), continueRead = deferred();
    f.pack.beforeDocument = async () => { entered.release(); await continueRead.promise; };
    const importing = f.book.import('entry', [sourceKey()]);
    await entered.promise;
    if (revoke === 'permission') f.pack.allowed = false;
    else if (revoke === 'source') f.settings.set('sources', '');
    else if (revoke === 'grant') f.settings.set('grants', []);
    else if (revoke === 'import') f.settings.set('import', false);
    else f.actor.isOwner = false;
    continueRead.release();
    const result = await importing;
    assert.equal(result.imported, 0);
    assert.match(result.stopped ?? '', /unavailable|eligibility changed|ownership/);
    assert.equal(f.actor.created.length, 0);
  });
}

test('preparing and clearing a slot preserve every mixed expended flag', async () => {
  const f = fixture();
  await f.book.import('entry', [sourceKey()]);
  await f.book.prepare('entry', 'owned-1', 1, 0);
  assert.deepEqual(prepared(f.entry), [
    { id: 'owned-1', expended: true }, { id: null, expended: false }, { id: null, expended: true }
  ]);
  await f.book.prepare('entry', null, 1, 0);
  assert.deepEqual(prepared(f.entry), [
    { id: null, expended: true }, { id: null, expended: false }, { id: null, expended: true }
  ]);
});

test('preset load updates assignments in one batch and preserves expended flags', async () => {
  const f = fixture();
  await f.book.import('entry', [sourceKey()]);
  const p = preset(), preview = f.book.preview('entry', p);
  assert.deepEqual(preview.changes, [
    { rank: 1, index: 0, before: 'Empty', after: 'alpha' }, { rank: 1, index: 1, before: 'Empty', after: 'Empty' }
  ]);
  await f.book.applyPreset('entry', p, preview.fingerprint);
  const expected = [{ id: 'owned-1', expended: true }, { id: null, expended: false }, { id: null, expended: true }];
  assert.deepEqual(prepared(f.entry), expected);
  assert.deepEqual(f.entry.updates, [{ 'system.slots.slot1.prepared': expected }]);
  assert.deepEqual(f.book.previous('entry')?.assignments, [
    { rank: 1, index: 0, spellId: null }, { rank: 1, index: 1, spellId: null }, { rank: 1, index: 2, spellId: null }
  ]);
});

test('each entry retains its own previous preparation after another entry applies a preset', async () => {
  const f = fixture(), other = addEntry(f.actor, 'other');
  f.authorize(other);
  await f.book.import('entry', [sourceKey()]);
  await f.book.import('other', [sourceKey()]);
  const first = preset(), second = { ...preset('other'), assignments: [{ rank: 1, index: 0, spellId: 'owned-2' }] };
  await f.book.applyPreset('entry', first, f.book.preview('entry', first).fingerprint);
  await f.book.applyPreset('other', second, f.book.preview('other', second).fingerprint);
  const previous = f.book.previous('entry');
  assert.ok(previous); assert.equal(previous.entryId, 'entry');
  assert.equal(f.book.previous('other')?.entryId, 'other');
  await f.book.applyPreset('entry', previous, f.book.preview('entry', previous).fingerprint);
  assert.deepEqual(prepared(f.entry), [
    { id: null, expended: true }, { id: null, expended: false }, { id: null, expended: true }
  ]);
  assert.equal(record((prepared(other) as unknown[])[0]).id, 'owned-2');
});

test('virtual favorites survive import and can be toggled from the owned row', async () => {
  const f = fixture();
  await f.book.favorite(sourceKey());
  await f.book.import('entry', [sourceKey()]);
  const spell = (await f.book.list('entry')).find(s => s.key === 'owned-1');
  assert.ok(spell);
  assert.ok(f.book.favorites().includes(favoriteKey(spell)));
  assert.equal(matches(spell, { search: '', rank: '', tradition: '', trait: '', rarity: '', actions: '', damage: '', category: '', status: 'favorites', sort: 'name' }, new Set(), new Set(f.book.favorites()), new Set()), true);
  await f.book.favorite('owned-1');
  assert.deepEqual(f.book.favorites(), []);
});

test('legacy partial-slot approvals cannot modify mixed groups after PF2e compaction', async () => {
  const f = fixture();
  const grants = f.settings.get('grants'); assert.ok(Array.isArray(grants));
  const oldGrant = record(grants[0]); delete oldGrant.allowedRanks; oldGrant.allowedSlots = ['1:0'];
  const rows = prepared(f.entry); assert.ok(Array.isArray(rows));
  rows[0] = { id: null, expended: false }; rows[1] = { id: 'restricted', expended: true };
  rows.sort((a, b) => Number(record(a).id === null) - Number(record(b).id === null));
  const before = structuredClone(rows);
  await assert.rejects(f.book.prepare('entry', null, 1, 0), /unconfirmed rank/);
  assert.deepEqual(prepared(f.entry), before);
  assert.equal(f.entry.updates.length, 0);
});

test('approved whole ranks preserve expended states when occupied slots compact', async () => {
  const f = fixture();
  await f.book.prepare('entry', sourceKey(), 1, 2);
  assert.deepEqual(prepared(f.entry), [
    { id: 'owned-1', expended: true }, { id: null, expended: true }, { id: null, expended: false }
  ]);
  await f.book.prepare('entry', sourceKey('beta'), 1, 2);
  assert.deepEqual(prepared(f.entry), [
    { id: 'owned-1', expended: true }, { id: 'owned-2', expended: false }, { id: null, expended: true }
  ]);
});

test('stale preset previews reject without changing slots', async () => {
  const f = fixture();
  await f.book.import('entry', [sourceKey()]);
  const p = preset(), preview = f.book.preview('entry', p);
  const rows = prepared(f.entry);
  assert.ok(Array.isArray(rows));
  record(rows[2]).expended = false;
  const before = structuredClone(rows);
  await assert.rejects(f.book.applyPreset('entry', p, preview.fingerprint), /Preview the preset again/);
  assert.deepEqual(prepared(f.entry), before);
  assert.equal(f.entry.updates.length, 0);
});

test('preset apply rechecks changes made while saving previous preparation', async () => {
  const f = fixture();
  await f.book.import('entry', [sourceKey()]);
  const p = preset(), preview = f.book.preview('entry', p);
  f.actor.beforeFlag = async () => { f.settings.set('grants', []); };
  await assert.rejects(f.book.applyPreset('entry', p, preview.fingerprint), /No slots were changed/);
  assert.equal(f.entry.updates.length, 0);
});

test('partial failure keeps completed imports and retries only missing spells', async () => {
  const f = fixture();
  f.actor.failName = 'beta';
  const keys = ['alpha', 'beta', 'gamma'].map(sourceKey);
  const first = await f.book.import('entry', keys);
  assert.equal(first.imported, 1);
  assert.match(first.stopped ?? '', /Synthetic create failure/);
  assert.deepEqual(f.actor.items.contents.filter(i => i.type === 'spell').map(i => i.name), ['alpha']);
  f.actor.failName = null;
  assert.deepEqual(await f.book.import('entry', keys), { imported: 2, stopped: null });
  assert.deepEqual(f.actor.items.contents.filter(i => i.type === 'spell').map(i => i.name), ['alpha', 'beta', 'gamma']);
});

test('cancel retains completed imports and an already canceled request creates nothing', async () => {
  const f = fixture(), controller = new AbortController();
  f.actor.afterCreate = () => controller.abort();
  assert.deepEqual(await f.book.import('entry', [sourceKey(), sourceKey('beta')], controller.signal), {
    imported: 1, stopped: 'Canceled. Completed imports were kept.'
  });
  assert.deepEqual(f.actor.items.contents.filter(i => i.type === 'spell').map(i => i.name), ['alpha']);
  assert.deepEqual(await f.book.import('entry', [sourceKey('beta')], controller.signal), {
    imported: 0, stopped: 'Canceled. Completed imports were kept.'
  });
  assert.equal(f.actor.created.length, 1);
});

test('disabling virtual access and features retains owned spells, slots, and saved flags', async () => {
  const f = fixture();
  await f.book.import('entry', [sourceKey()]);
  await f.book.savePreset('entry', 'Saved preparation');
  await f.book.favorite('owned-1');
  const documents = f.actor.items.contents.map(i => i.toObject());
  const flags = structuredClone([...f.actor.flags]);
  for (const key of ['virtual', 'import', 'presets', 'favorites']) f.settings.set(key, false);
  f.settings.set('grants', []);
  assert.deepEqual((await f.book.list('entry')).map(s => s.key), ['owned-1']);
  const result = await f.book.import('entry', [sourceKey('beta')]);
  assert.equal(result.imported, 0);
  assert.match(result.stopped ?? '', /not eligible/);
  await assert.rejects(f.book.prepare('entry', 'owned-1', 1, 0), /GM must review/);
  await assert.rejects(f.book.savePreset('entry', 'Denied'), /disabled/);
  await assert.rejects(f.book.favorite('owned-1'), /disabled/);
  assert.deepEqual(f.actor.items.contents.map(i => i.toObject()), documents);
  assert.deepEqual([...f.actor.flags], flags);
});

test('saving and restoring presets works without secure-context randomUUID', async () => {
  const f = fixture();
  const original = crypto.randomUUID;
  Reflect.set(crypto, 'randomUUID', undefined);
  try {
    const before = structuredClone(prepared(f.entry));
    await f.book.savePreset('entry', 'HTTP preparation');
    const [saved] = f.book.presets('entry');
    assert.ok(saved);
    assert.equal(saved.name, 'HTTP preparation');
    await f.book.applyPreset('entry', saved, f.book.preview('entry', saved).fingerprint);
    const previous = f.book.previous('entry');
    assert.ok(previous);
    assert.notEqual(previous.id, saved.id);
    assert.deepEqual(prepared(f.entry), before);
    assert.deepEqual(previous.assignments, saved.assignments);
  } finally {
    Reflect.set(crypto, 'randomUUID', original);
  }
});


test('save over keeps preset identity and other raw entries at the 50 preset limit', async () => {
  const f = fixture();
  await f.book.savePreset('entry', 'Combat');
  const target = f.book.presets('entry')[0]; assert.ok(target);
  const other = { ...target, id: 'other', entryId: 'other-entry' };
  const malformed = { broken: ['keep', null] };
  const all = [target, other, malformed, ...Array.from({ length: 47 }, (_, i) => ({ malformed: i }))];
  f.actor.flags.set('presets', structuredClone(all));
  await f.book.prepare('entry', sourceKey(), 1, 0);
  const beforeSlots = structuredClone(f.entry.system.slots);
  await assert.rejects(f.book.savePreset('entry', 'Extra'), /50 presets/);
  await f.book.overwritePreset('entry', target);
  const saved = f.actor.flags.get('presets'); assert.ok(Array.isArray(saved));
  assert.equal(saved.length, 50);
  assert.deepEqual(saved.slice(1), all.slice(1));
  assert.deepEqual(saved[0], { ...target, assignments: [
    { rank: 1, index: 0, spellId: 'owned-1' }, { rank: 1, index: 1, spellId: null }, { rank: 1, index: 2, spellId: null }
  ] });
  assert.deepEqual(f.entry.system.slots, beforeSlots);
  assert.deepEqual(f.entry.updates, []);
});

test('save over rejects missing, stale, mismatched, malformed and ambiguous targets without writes', async () => {
  const f = fixture();
  await f.book.savePreset('entry', 'Exploration');
  const target = f.book.presets('entry')[0]; assert.ok(target);
  const cases = [
    { raw: [], expected: target, error: /missing/ },
    { raw: [{ ...target, name: 'Changed' }], expected: target, error: /changed/ },
    { raw: [target], expected: { ...target, entryId: 'another' }, error: /different entry/ },
    { raw: [{ ...target, assignments: 'broken' }], expected: target, error: /Invalid/ },
    { raw: [target, { id: target.id, broken: true }], expected: target, error: /ambiguous/ },
    { raw: [{ ...target, entryId: 'another' }], expected: target, error: /changed/ },
  ];
  let writes = 0; f.actor.beforeFlag = async () => { writes++; };
  for (const { raw, expected, error } of cases) {
    f.actor.flags.set('presets', structuredClone(raw));
    await assert.rejects(f.book.overwritePreset('entry', expected), error);
    assert.deepEqual(f.actor.flags.get('presets'), raw);
  }
  assert.equal(writes, 0);
});

test('save over rechecks ownership, settings and approved ranks before writing', async () => {
  const f = fixture();
  await f.book.savePreset('entry', 'Combat');
  const target = f.book.presets('entry')[0]; assert.ok(target);
  let writes = 0; f.actor.beforeFlag = async () => { writes++; };
  f.actor.isOwner = false;
  await assert.rejects(f.book.overwritePreset('entry', target), /ownership/);
  f.actor.isOwner = true; f.settings.set('presets', false);
  await assert.rejects(f.book.overwritePreset('entry', target), /disabled/);
  f.settings.set('presets', true); f.settings.set('grants', []);
  await assert.rejects(f.book.overwritePreset('entry', target), /No approved/);
  assert.equal(writes, 0);
  assert.deepEqual(f.book.presets('entry'), [target]);
});

test('queued save over rejects a target replaced by an earlier queued operation', async () => {
  const f = fixture();
  await f.book.savePreset('entry', 'Combat');
  const target = f.book.presets('entry')[0]; assert.ok(target);
  const preparing = f.book.prepare('entry', sourceKey(), 1, 0);
  const first = f.book.overwritePreset('entry', target);
  const second = f.book.overwritePreset('entry', target);
  await preparing; await first;
  await assert.rejects(second, /changed/);
  assert.equal(f.book.presets('entry')[0]?.assignments[0]?.spellId, 'owned-1');
});


test('delete removes only the saved target without approved slots or touching preparation and backups', async () => {
  const f = fixture();
  await f.book.savePreset('entry', 'Combat');
  const target = f.book.presets('entry')[0]; assert.ok(target);
  const others = [{ ...target, id: 'other', entryId: 'other-entry' }, { broken: ['keep', null] }, null];
  f.actor.flags.set('presets', [others[0], target, ...others.slice(1)]);
  f.actor.flags.set('previousPreparations', { entry: target, other: { keep: true } });
  f.actor.flags.set('favorites', ['keep']);
  const beforeFlags = structuredClone(f.actor.flags), beforeSystem = structuredClone(f.entry.system);
  f.settings.set('grants', []);
  let writes = 0; f.actor.beforeFlag = async () => { writes++; };
  await f.book.deletePreset('entry', target);
  assert.equal(writes, 1);
  beforeFlags.set('presets', others);
  assert.deepEqual(f.actor.flags, beforeFlags);
  assert.deepEqual(f.entry.system, beforeSystem);
  assert.deepEqual(f.entry.updates, []);
  assert.deepEqual(f.actor.created, []);
});

test('delete refuses missing, changed, mismatched, invalid and ambiguous targets without writes', async () => {
  const f = fixture();
  await f.book.savePreset('entry', 'Exploration');
  const target = f.book.presets('entry')[0]; assert.ok(target);
  const cases = [
    { raw: [], expected: target, error: /missing/ },
    { raw: [{ ...target, name: 'Changed' }], expected: target, error: /changed/ },
    { raw: [{ ...target, assignments: [] }], expected: target, error: /changed/ },
    { raw: [target], expected: { ...target, entryId: 'another' }, error: /different entry/ },
    { raw: [{ ...target, assignments: 'broken' }], expected: target, error: /Invalid/ },
    { raw: [target, { id: target.id, broken: true }], expected: target, error: /ambiguous/ },
    { raw: [{ ...target, entryId: 'another' }], expected: target, error: /changed/ },
  ];
  let writes = 0; f.actor.beforeFlag = async () => { writes++; };
  for (const { raw, expected, error } of cases) {
    f.actor.flags.set('presets', structuredClone(raw));
    await assert.rejects(f.book.deletePreset('entry', expected), error);
    assert.deepEqual(f.actor.flags.get('presets'), raw);
  }
  assert.equal(writes, 0);
});

test('delete rechecks ownership, settings and entry existence before writing', async () => {
  const f = fixture();
  await f.book.savePreset('entry', 'Combat');
  const target = f.book.presets('entry')[0]; assert.ok(target);
  let writes = 0; f.actor.beforeFlag = async () => { writes++; };
  f.actor.isOwner = false;
  await assert.rejects(f.book.deletePreset('entry', target), /ownership/);
  f.actor.isOwner = true; f.settings.set('presets', false);
  await assert.rejects(f.book.deletePreset('entry', target), /disabled/);
  f.settings.set('presets', true); f.actor.items.contents = [];
  await assert.rejects(f.book.deletePreset('entry', target), /no longer exists/);
  assert.equal(writes, 0);
  assert.deepEqual(f.actor.flags.get('presets'), [target]);
});

test('queued delete revalidates after earlier preset mutations and preserves a queued save', async () => {
  const f = fixture();
  await f.book.savePreset('entry', 'Combat');
  const target = f.book.presets('entry')[0]; assert.ok(target);
  const preparing = f.book.prepare('entry', sourceKey(), 1, 0);
  const overwrite = f.book.overwritePreset('entry', target);
  const staleDelete = f.book.deletePreset('entry', target);
  await preparing; await overwrite;
  await assert.rejects(staleDelete, /changed/);
  const current = f.book.presets('entry')[0]; assert.ok(current);
  const deleting = f.book.deletePreset('entry', current);
  const saving = f.book.savePreset('entry', 'Exploration');
  const repeated = f.book.deletePreset('entry', current);
  await deleting; await saving;
  await assert.rejects(repeated, /missing/);
  assert.equal(f.book.presets('entry').length, 1);
  assert.equal(f.book.presets('entry')[0]?.name, 'Exploration');
});
