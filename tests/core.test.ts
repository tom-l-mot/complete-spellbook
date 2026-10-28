import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligible, maximumRank, slotShape, preparationError, duplicate, parsePreset, planPreset, snapshot, validGrant, matches, comparePresets } from '../src/core.ts';
import type { Entry, Grant, Spell, Filters } from '../src/core.ts';

const policy = { virtual: true, uncommon: false, rare: false, legacy: false };
function entry(id = 'main', tradition = 'divine', max = 1): Entry {
  return { id, name: id, tradition, category: 'prepared', flexible: false,
    slots: Array.from({ length: max + 1 }, (_, rank) => ({ rank, max: 2, value: 1, prepared: [{ id: null, expended: true }, { id: null, expended: false }] })) };
}
function grant(e: Entry): Grant {
  return { actorUuid: 'Actor.test', classSlug: 'cleric', entryId: e.id, tradition: e.tradition, category: e.category,
    fullTradition: true, extra: [], preparation: true, slotShape: slotShape(e), allowedRanks: e.slots.map(s => s.rank) };
}
function spell(rank = 1, tradition = 'divine'): Spell {
  return { key: 'Compendium.pf2e.spells-srd.Item.a', name: 'Test light', rank, traditions: [tradition], traits: [], rarity: 'common',
    category: rank === 0 ? 'cantrip' : 'ranked', description: '<p>Healing beacon</p>', damage: ['vitality'], actions: '2', legacy: false,
    origin: { kind: 'virtual', uuid: 'Compendium.pf2e.spells-srd.Item.a', pack: 'pf2e.spells-srd', id: 'a' } };
}
function owned(e: Entry, id = 'owned'): Spell {
  return { ...spell(), key: id, origin: { kind: 'owned', id, entryId: e.id, source: spell().key, signature: false, castRank: 1 } };
}
for (const [name, tradition, rank] of [['Level 1 Cleric', 'divine', 1], ['Level 5 Cleric', 'divine', 3], ['Level 10 Druid', 'primal', 5]] as const) {
  test(`${name} discovers common tradition only up to available slot rank`, () => {
    const e = entry('main', tradition, rank); const g = grant(e);
    assert.equal(eligible(spell(rank, tradition), e, g, policy), true);
    assert.equal(eligible(spell(rank + 1, tradition), e, g, policy), false);
    assert.equal(eligible(spell(1, 'arcane'), e, g, policy), false);
    assert.equal(eligible(spell(0, tradition), e, g, policy), true);
  });
}
for (const name of ['Wizard', 'Witch', 'Magus', 'Sorcerer', 'Bard', 'Oracle', 'Psychic', 'Summoner']) {
  test(`${name} keeps its existing collection without a tradition grant`, () => {
    const e = entry(name, 'arcane', 3);
    if (['Sorcerer','Bard','Oracle','Psychic','Summoner'].includes(name)) e.category = 'spontaneous';
    assert.equal(eligible(spell(1, 'arcane'), e, undefined, policy), false);
    assert.equal(eligible(owned(e), e, undefined, policy), true);
  });
}
test('Animist prepared, apparition and vessel entries remain separate', () => {
  const e = entry('divine'); const apparition = { ...entry('apparitions'), category: 'spontaneous' as const };
  const vessel = { ...entry('vessel'), category: 'focus' as const };
  assert.equal(eligible(spell(), e, grant(e), policy), true);
  for (const special of [apparition, vessel]) {
    assert.equal(eligible(spell(), special, grant(special), policy), false);
    assert.equal(eligible(owned(special), special, undefined, policy), true);
    assert.equal(eligible(owned(special), e, grant(e), policy), false);
  }
});
test('archetype ranks and multiple entries are not inferred from character level', () => {
  const main = entry('main', 'divine', 5), archetype = entry('archetype', 'arcane', 1);
  assert.equal(maximumRank(archetype), 1);
  assert.equal(eligible(spell(2, 'arcane'), archetype, grant(archetype), policy), false);
  assert.equal(eligible(owned(main), archetype, grant(archetype), policy), false);
});
test('rarity, legacy, focus, rituals, revoked grants and explicit GM exceptions', () => {
  const e = entry(), g = grant(e);
  for (const s of [{ ...spell(), rarity: 'rare' as const }, { ...spell(), legacy: true }, { ...spell(), category: 'focus' as const }, { ...spell(), category: 'ritual' as const }]) assert.equal(eligible(s, e, g, policy), false);
  assert.equal(eligible({ ...spell(), rarity: 'rare' }, e, g, { ...policy, rare: true }), true);
  assert.equal(eligible(spell(), e, undefined, policy), false);
  g.extra = [spell().key];
  assert.equal(eligible({ ...spell(), rarity: 'uncommon', traditions: ['arcane'] }, e, g, policy), true);
  assert.equal(validGrant(g, 'Actor.other', 'cleric', e), false);
  assert.equal(validGrant(g, 'Actor.test', 'druid', e), false);
  assert.equal(validGrant(g, 'Actor.test', 'cleric', { ...e, tradition: 'primal' }), false);
});
test('preparation validates membership, target, heightening, special slots and layout changes', () => {
  const e = entry('main', 'divine', 3), g = grant(e), s = owned(e);
  assert.equal(preparationError(e, g, s, 3, 0), null);
  assert.ok(preparationError(e, g, s, 0, 0));
  assert.ok(preparationError(e, g, s, 1, 99));
  assert.ok(preparationError(e, g, owned(entry('other')), 1, 0));
  g.allowedRanks = g.allowedRanks.filter(rank => rank !== 1); assert.ok(preparationError(e, g, s, 1, 0));
  e.flexible = true; assert.ok(preparationError(e, g, s, 2, 0));
  e.flexible = false; e.slots[1]!.max = 3; assert.ok(preparationError(e, g, s, 2, 0));
});
test('duplicates use stable source identity within the exact entry', () => {
  const e = entry(); const s = owned(e);
  assert.equal(duplicate([s], e.id, spell().key), s);
  assert.equal(duplicate([s], 'another', spell().key), undefined);
});
test('presets round-trip assignment-only data and reject missing or cross-entry spells', () => {
  const e = entry(), g = grant(e), s = owned(e);
  e.slots[1]!.prepared[0]!.id = 'owned';
  const p = parsePreset(JSON.parse(JSON.stringify(snapshot(e, g, 'Combat', 'preset'))));
  assert.equal(JSON.stringify(p).includes('expended'), false);
  assert.equal(planPreset(e, g, p, [s]).length, 4);
  assert.throws(() => planPreset(e, g, p, []), /missing/);
  assert.throws(() => parsePreset({ ...p, assignments: [p.assignments[0], p.assignments[0]] }), /Duplicate/);
  assert.throws(() => planPreset(entry('other'), g, p, [s]), /different entry/);
  assert.equal(e.slots[1]!.prepared[0]!.expended, true);
});
test('level-up changes virtual availability without editing existing spells', () => {
  const e = entry(), g = grant(e), s = spell(2);
  assert.equal(eligible(s, e, g, policy), false);
  e.slots.push({ rank: 2, max: 2, value: 2, prepared: [{ id: null, expended: false }, { id: null, expended: false }] });
  assert.equal(eligible(s, e, g, policy), true);
  assert.ok(preparationError(e, g, null, 2, 0));
});
test('large catalog filtering returns exact matches including descriptions', () => {
  const filters: Filters = { search: 'beacon', rank: '1', tradition: 'divine', trait: '', rarity: 'common', actions: '2', damage: 'vitality', category: 'ranked', status: '', sort: 'name' };
  const catalog = Array.from({length: 10000}, (_, i) => ({ ...spell(), name: `Spell ${i}`, rank: i % 10 }));
  assert.equal(catalog.filter(s => matches(s, filters, new Set(), new Set(), new Set())).length, 1000);
});
test('two presets compare assignments without changing either preset', () => {
  const e = entry(), g = grant(e), left = snapshot(e, g, 'Combat', 'a'), right = structuredClone(left);
  right.assignments[0]!.spellId = 'different'; right.assignments.pop();
  const comparison = comparePresets(left, right);
  assert.deepEqual(comparison[0], { rank: 0, index: 0, before: null, after: 'different' });
  assert.equal(comparison.at(-1)?.after, undefined);
  assert.equal(left.assignments[0]?.spellId, null);
});
