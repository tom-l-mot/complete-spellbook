import assert from 'node:assert/strict';
import test from 'node:test';
import { compareSpells, isSortMode } from '../src/spell-sort.ts';
import type { SpellOrder } from '../src/spell-sort.ts';

const rows: SpellOrder[] = [
  { rank: 3, category: 'innate', name: 'Aid', index: 0 },
  { rank: 1, category: 'prepared', name: 'Heal', index: 1 },
  { rank: 0, category: 'focus', name: 'Light', index: 2 },
  { rank: 1, category: 'spontaneous', name: 'Aid', index: 3 },
  { rank: 1, category: 'prepared', name: 'Heal', index: 4 },
  { rank: 1, category: 'custom', name: 'Aid', index: 5 },
];
test('rank order puts cantrips first and retains repeated spell occurrences in render order', () => {
  assert.deepEqual([...rows].sort((a, b) => compareSpells(a, b, 'rank')).map(row => row.index), [2, 3, 5, 1, 4, 0]);
  assert.equal(rows[0]?.index, 0);
});
test('casting type groups known categories, preserving unknown native categories', () => {
  assert.deepEqual([...rows].sort((a, b) => compareSpells(a, b, 'category')).map(row => row.index), [1, 4, 3, 0, 2, 5]);
});
test('name order is global across entries and ranks with stable duplicate ties', () => {
  assert.deepEqual([...rows].sort((a, b) => compareSpells(a, b, 'name')).map(row => row.index), [0, 3, 5, 1, 4, 2]);
});
test('saved modes accept only supported plain values', () => {
  for (const value of ['default', 'rank', 'category', 'name']) assert.equal(isSortMode(value), true);
  for (const value of [null, undefined, '', 'Rank', '{}', {}, ['rank'], 1]) assert.equal(isSortMode(value), false);
});


test('rank view puts focus before cantrips and keeps source groups alphabetized internally', () => {
  const sourceRows: SpellOrder[] = [
    { rank: 1, category: 'prepared', entryName: 'Zeta', entryIndex: 0, name: 'Alpha', index: 0 },
    { rank: 1, category: 'prepared', entryName: 'Alpha', entryIndex: 1, name: 'Zeta', index: 1 },
    { rank: 1, category: 'prepared', entryName: 'Alpha', entryIndex: 1, name: 'Beta', index: 2 },
    { rank: 4, category: 'focus', entryName: 'Focus', name: 'Focus spell', index: 3 },
    { rank: 0, category: 'prepared', entryName: 'Cantrips', name: 'Cantrip', index: 4 }
  ];
  assert.deepEqual([...sourceRows].sort((a, b) => compareSpells(a, b, 'rank')).map(row => row.index), [3, 4, 2, 1, 0]);
  assert.deepEqual([...sourceRows].sort((a, b) => compareSpells(a, b, 'name')).map(row => row.index), [0, 2, 4, 3, 1]);
});
