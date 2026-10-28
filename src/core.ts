export const MODULE_ID = 'pf2e-complete-spellbook';
export type Tradition = 'arcane' | 'divine' | 'occult' | 'primal';
export type Category = 'prepared' | 'spontaneous' | 'innate' | 'focus' | 'items';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'unique';
export type Spell = {
  key: string; name: string; rank: number; traditions: string[]; traits: string[];
  rarity: Rarity; actions: string; damage: string[]; description: string; legacy: boolean;
  category: 'cantrip' | 'ranked' | 'focus' | 'ritual';
  origin: { kind: 'virtual'; uuid: string; pack: string; id: string } |
    { kind: 'owned'; id: string; entryId: string; source: string | null; signature: boolean; castRank: number };
};
export type SlotGroup = { rank: number; max: number; value: number; prepared: { id: string | null; expended: boolean }[] };
export type Entry = { id: string; name: string; tradition: string; category: Category; flexible: boolean; slots: SlotGroup[] };
export type Grant = {
  actorUuid: string; entryId: string; tradition: string; category: Category; classSlug: string;
  fullTradition: boolean; extra: string[]; preparation: boolean; slotShape: string; allowedRanks: number[];
};
export type Policy = { virtual: boolean; uncommon: boolean; rare: boolean; legacy: boolean };
export type Assignment = { rank: number; index: number; spellId: string | null };
export type Preset = { version: 1; id: string; name: string; entryId: string; assignments: Assignment[] };
export type Filters = { search: string; rank: string; tradition: string; trait: string; rarity: string;
  actions: string; damage: string; category: string; status: string; sort: string };

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
export function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
export function integer(value: unknown, min = 0, max = 1000): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;
}
export function category(value: unknown): Category | null {
  return value === 'prepared' || value === 'spontaneous' || value === 'innate' || value === 'focus' || value === 'items' ? value : null;
}
export function slotShape(entry: Entry): string { return JSON.stringify(entry.slots.map(s => [s.rank, s.max, s.prepared.length])); }
export function validGrant(grant: Grant | undefined, actorUuid: string, classSlug: string, entry: Entry): grant is Grant {
  return !!grant && grant.actorUuid === actorUuid && grant.entryId === entry.id && grant.tradition === entry.tradition &&
    grant.category === entry.category && grant.classSlug === classSlug;
}
export function maximumRank(entry: Entry): number {
  return Math.max(0, ...entry.slots.filter(s => s.max > 0).map(s => s.rank));
}
export function eligible(spell: Spell, entry: Entry, grant: Grant | undefined, policy: Policy): boolean {
  if (spell.origin.kind === 'owned') return spell.origin.entryId === entry.id;
  if (!policy.virtual || entry.category !== 'prepared' || !grant || grant.entryId !== entry.id ||
      grant.category !== entry.category || grant.tradition !== entry.tradition) return false;
  if (spell.category === 'focus' || spell.category === 'ritual' || (!policy.legacy && spell.legacy)) return false;
  if (spell.category === 'cantrip' ? !entry.slots.some(s => s.rank === 0 && s.max > 0) : spell.rank > maximumRank(entry)) return false;
  if (grant.extra.includes(spell.origin.uuid)) return true;
  const rarityAllowed = spell.rarity === 'common' || (spell.rarity === 'uncommon' && policy.uncommon) || (spell.rarity === 'rare' && policy.rare);
  return grant.fullTradition && rarityAllowed && spell.traditions.includes(entry.tradition);
}
export function preparationError(entry: Entry, grant: Grant | undefined, spell: Spell | null, rank: number, index: number): string | null {
  if (entry.category !== 'prepared' || (entry.flexible && rank !== 0)) return 'Use the PF2e sheet for this preparation type.';
  if (!grant?.preparation || grant.entryId !== entry.id || grant.tradition !== entry.tradition || grant.category !== entry.category || grant.slotShape !== slotShape(entry)) {
    return 'The GM must review this entry and its current slot layout before preparation.';
  }
  if (!grant.allowedRanks.includes(rank)) return 'This restricted or unconfirmed rank group is managed on the PF2e sheet.';
  const group = entry.slots.find(s => s.rank === rank);
  if (!Number.isInteger(index) || index < 0 || !group || group.prepared.length !== group.max || index >= group.max || !group.prepared[index]) return 'The preparation slot no longer exists.';
  if (!spell) return null;
  if (spell.category === 'focus' || spell.category === 'ritual' || (rank === 0) !== (spell.category === 'cantrip') || (rank > 0 && spell.rank > rank)) return 'The spell cannot be prepared at this rank.';
  if (spell.origin.kind !== 'owned' || spell.origin.entryId !== entry.id) return 'The spell must belong to this entry before preparation.';
  return null;
}
export function duplicate(spells: Spell[], entryId: string, uuid: string): Spell | undefined {
  return spells.find(s => s.origin.kind === 'owned' && s.origin.entryId === entryId && s.origin.source === uuid);
}
export function favoriteKey(spell: Spell): string {
  return spell.origin.kind === 'owned' ? spell.origin.source ?? spell.key : spell.key;
}
export function matches(spell: Spell, filters: Filters, prepared: Set<string>, favorites: Set<string>, recent: Set<string>): boolean {
  const query = filters.search.trim().toLocaleLowerCase();
  const haystack = `${spell.name} ${spell.description.replace(/<[^>]*>/g, ' ')}`.toLocaleLowerCase();
  return (!query || haystack.includes(query)) && (!filters.rank || spell.rank === Number(filters.rank)) &&
    (!filters.tradition || spell.traditions.includes(filters.tradition)) && (!filters.trait || spell.traits.includes(filters.trait)) &&
    (!filters.rarity || spell.rarity === filters.rarity) && (!filters.actions || spell.actions === filters.actions) &&
    (!filters.damage || spell.damage.includes(filters.damage)) && (!filters.category || spell.category === filters.category) &&
    (!filters.status || (filters.status === 'prepared' && prepared.has(spell.key)) || (filters.status === 'unprepared' && !prepared.has(spell.key)) ||
      (filters.status === 'virtual' && spell.origin.kind === 'virtual') || (filters.status === 'owned' && spell.origin.kind === 'owned') ||
      (filters.status === 'favorites' && favorites.has(favoriteKey(spell))) || (filters.status === 'recent' && recent.has(spell.key)));
}
export function parsePreset(value: unknown): Preset {
  const p = record(value);
  if (p.version !== 1 || !text(p.id) || !text(p.name) || !text(p.entryId) || !Array.isArray(p.assignments) || p.assignments.length > 1000) throw new Error('Invalid preparation preset.');
  const seen = new Set<string>();
  const assignments = p.assignments.map((value): Assignment => {
    const row = record(value); const rank = integer(row.rank, 0, 10); const index = integer(row.index);
    if (rank === null || index === null || (row.spellId !== null && !text(row.spellId))) throw new Error('Invalid preset slot.');
    const key = `${rank}:${index}`;
    if (seen.has(key)) throw new Error('Duplicate preset slot.');
    seen.add(key);
    return { rank, index, spellId: row.spellId === null ? null : text(row.spellId) };
  });
  return { version: 1, id: text(p.id), name: text(p.name).slice(0, 80), entryId: text(p.entryId), assignments };
}
export function planPreset(entry: Entry, grant: Grant | undefined, preset: Preset, spells: Spell[]): Assignment[] {
  if (preset.entryId !== entry.id) throw new Error('Preset belongs to a different entry.');
  for (const row of preset.assignments) {
    const spell = row.spellId === null ? null : spells.find(s => s.origin.kind === 'owned' && s.origin.id === row.spellId);
    if (spell === undefined) throw new Error('A preset spell is missing. No slots were changed.');
    const error = preparationError(entry, grant, spell, row.rank, row.index);
    if (error) throw new Error(error);
  }
  return preset.assignments;
}
export function snapshot(entry: Entry, grant: Grant | undefined, name: string, id: string): Preset {
  const assignments = entry.slots.flatMap(s => s.prepared.slice(0, s.max).flatMap((slot, index) =>
    preparationError(entry, grant, null, s.rank, index) ? [] : [{ rank: s.rank, index, spellId: slot.id }]));
  return { version: 1, id, name: name.slice(0, 80), entryId: entry.id, assignments };
}
export function comparePresets(left: Preset, right: Preset): { rank: number; index: number; before: string | null | undefined; after: string | null | undefined }[] {
  if (left.entryId !== right.entryId) throw new Error('Presets belong to different entries.');
  const coordinates = new Map([...left.assignments, ...right.assignments].map(a => [`${a.rank}:${a.index}`, a]));
  return [...coordinates.values()].map(({ rank, index }) => ({ rank, index,
    before: left.assignments.find(a => a.rank === rank && a.index === index)?.spellId,
    after: right.assignments.find(a => a.rank === rank && a.index === index)?.spellId }));
}
