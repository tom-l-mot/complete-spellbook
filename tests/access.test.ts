import assert from 'node:assert/strict';
import test from 'node:test';
import { recognize } from '../src/access.ts';
import type { Entry } from '../src/core.ts';

function entry(tradition = 'divine', category: Entry['category'] = 'prepared'): Entry {
  return { id: 'main', name: 'Spells', tradition, category, flexible: false,
    slots: [0, 1].map(rank => ({ rank, max: 2, value: 2, prepared: [{ id: null, expended: false }, { id: null, expended: true }] })) };
}

for (const [name, tradition, full, ranks] of [
  ['cleric', 'divine', true, [0]], ['druid', 'primal', true, [0, 1]], ['animist', 'divine', true, [0, 1]],
  ['wizard', 'arcane', false, []], ['witch', 'occult', false, [0, 1]], ['magus', 'arcane', false, [0, 1]]] as const) {
  test(`${name} is recognized without widening its spell access`, () => {
    const e = entry(tradition), result = recognize(e, [e], name, [], false, false);
    assert.equal(result.kind, 'automatic');
    if (result.kind !== 'automatic') return;
    assert.equal(result.fullTradition, full); assert.deepEqual(result.allowedRanks, ranks);
    assert.deepEqual(result.reviewRanks, name === 'wizard' ? [0, 1] : name === 'cleric' ? [1] : []);
  });
}
for (const name of ['sorcerer', 'bard', 'oracle', 'psychic', 'summoner']) {
  test(`${name} repertoire needs no setup and remains on the character sheet`, () => {
    const e = entry('occult', 'spontaneous');
    assert.equal(recognize(e, [e], name, [], false, false).kind, 'native');
  });
}
test('mixed entries, archetypes, unknown classes, and missing cantrips require review', () => {
  const e = entry();
  assert.equal(recognize(e, [e, { ...e, id: 'other' }], 'cleric', [], false, false).kind, 'review');
  assert.equal(recognize(e, [e], 'cleric', [], true, false).kind, 'review');
  assert.equal(recognize(e, [e], 'custom', [], false, false).kind, 'review');
  const noCantrips = { ...e, slots: e.slots.filter(s => s.rank > 0) };
  assert.equal(recognize(noCantrips, [noCantrips], 'cleric', [], false, false).kind, 'review');
});
test('special entries, focus spells, and apparition repertoires never become ordinary slots', () => {
  const e = entry();
  assert.equal(recognize(e, [e], 'cleric', [], false, true).kind, 'native');
  for (const mode of ['focus', 'spontaneous', 'innate', 'items'] as const) {
    const special = entry('divine', mode);
    assert.equal(recognize(special, [e, special], 'animist', [], false, false).kind, 'native');
  }
});
test('flexible and studious spell slots stay protected, regardless of ordinary-looking counts', () => {
  const e = entry('arcane');
  const studious = recognize(e, [e], 'magus', ['studious-spells'], false, false);
  assert.equal(studious.kind, 'automatic');
  if (studious.kind === 'automatic') assert.deepEqual(studious.allowedRanks, [0]);
  const flexible = { ...e, flexible: true };
  const result = recognize(flexible, [flexible], 'witch', [], false, false);
  assert.equal(result.kind, 'automatic');
  if (result.kind === 'automatic') { assert.deepEqual(result.allowedRanks, [0]); assert.deepEqual(result.reviewRanks, []); }
});
test('Wizard curriculum cantrips are protected and Unified Magical Theory needs no review', () => {
  const e = entry('arcane');
  e.slots[0] = { rank: 0, max: 6, value: 6, prepared: Array.from({ length: 6 }, () => ({ id: null, expended: false })) };
  const school = recognize(e, [e], 'wizard', ['school-of-battle-magic'], false, false);
  assert.equal(school.kind, 'automatic');
  if (school.kind === 'automatic') { assert.deepEqual(school.allowedRanks, []); assert.deepEqual(school.reviewRanks, [0, 1]); }
  const unified = recognize(e, [e], 'wizard', ['school-of-unified-magical-theory'], false, false);
  assert.equal(unified.kind, 'automatic');
  if (unified.kind === 'automatic') { assert.deepEqual(unified.allowedRanks, [0, 1]); assert.deepEqual(unified.reviewRanks, []); }
});
test('incomplete slot arrays never report automatic readiness', () => {
  const e = entry('primal'); e.slots[0]!.prepared = [];
  assert.equal(recognize(e, [e], 'druid', [], false, false).kind, 'review');
});
