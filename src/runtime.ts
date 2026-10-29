import { MODULE_ID, record, text, strings, integer, category, eligible, validGrant, duplicate, preparationError, slotShape, parsePreset, planPreset, snapshot, favoriteKey } from './core.ts';
import type { Entry, Spell, Grant, Policy, Preset, SlotGroup } from './core.ts';
import { recognize } from './access.ts';
import type { Recognition } from './access.ts';

export interface ItemDocument {
  id: string; uuid: string; type: string; name: string; system: unknown; sourceId?: string | null; flags?: unknown; _stats?: unknown;
  toObject(): Record<string, unknown>;
  sheet?: { render(options: { force: boolean }): unknown };
  update(changes: Record<string, unknown>): Promise<unknown>;
  spells?: { prepareSpell(spell: ItemDocument | null, rank: number | 'cantrips', slot: number): Promise<unknown> };
}
export interface ActorDocument {
  uuid: string; id: string; type: string; name: string; isOwner: boolean; class?: { slug: string | null };
  items: { contents: ItemDocument[]; get(id: string): ItemDocument | undefined };
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
  createEmbeddedDocuments(type: 'Item', data: Record<string, unknown>[]): Promise<ItemDocument[]>;
  sheet: { render(options: { force: boolean }): unknown };
}
export interface Pack {
  collection: string; documentName: string;
  testUserPermission(user: unknown, permission: string): boolean;
  getIndex(options: { fields: string[] }): Promise<Iterable<unknown>>;
  getDocument(id: string): Promise<ItemDocument | null>;
}
export interface Environment {
  user: { id: string; isGM: boolean };
  packs: Iterable<Pack>;
  settings: { get(scope: string, key: string): unknown; set(scope: string, key: string, value: unknown): Promise<unknown> };
}
export const INDEX_FIELDS = ['type', 'system.level.value', 'system.traits', 'system.time.value', 'system.damage', 'system.description.value', 'system.publication.remaster', 'system.ritual'];
export function parseEntry(item: ItemDocument): Entry | null {
  if (item.type !== 'spellcastingEntry') return null;
  const system = record(item.system), prep = record(system.prepared), mode = category(prep.value);
  if (!mode) return null;
  const slots = record(system.slots); const groups: SlotGroup[] = [];
  for (let rank = 0; rank <= 10; rank++) {
    const s = record(slots[`slot${rank}`]); const max = integer(s.max, 0, 100);
    if (max === null) continue;
    const prepared = Array.isArray(s.prepared) ? s.prepared.slice(0, 100).map(p => {
      const slot = record(p); return { id: text(slot.id) || null, expended: slot.expended === true };
    }) : [];
    groups.push({ rank, max, value: integer(s.value) ?? 0, prepared });
  }
  return { id: item.id, name: item.name, tradition: text(record(system.tradition).value), category: mode, flexible: prep.flexible === true, slots: groups };
}
export function parseSpell(data: unknown, origin: Spell['origin']): Spell | null {
  const d = record(data), s = record(d.system), traits = record(s.traits), traitList = strings(traits.value);
  const rank = integer(record(s.level).value, 0, 10);
  const rarity = traits.rarity;
  if (d.type !== 'spell' || !text(d.name) || rank === null || !['common', 'uncommon', 'rare', 'unique'].includes(text(rarity))) return null;
  const spellRarity = rarity === 'common' || rarity === 'uncommon' || rarity === 'rare' ? rarity : 'unique';
  return { key: origin.kind === 'virtual' ? origin.uuid : origin.id, name: text(d.name), rank: traitList.includes('cantrip') ? 0 : rank,
    category: s.ritual ? 'ritual' : traitList.includes('focus') ? 'focus' : traitList.includes('cantrip') ? 'cantrip' : 'ranked',
    traditions: strings(traits.traditions), traits: traitList, rarity: spellRarity, actions: text(record(s.time).value),
    damage: Object.values(record(s.damage)).map(d => text(record(d).type)).filter(Boolean),
    description: text(record(s.description).value), legacy: record(s.publication).remaster === false, origin };
}
export function ownedSpells(actor: ActorDocument): Spell[] {
  return actor.items.contents.flatMap(item => {
    if (item.type !== 'spell') return [];
    const location = record(record(item.system).location), flags = record(record(item.flags)[MODULE_ID]);
    const stats = record(item._stats);
    const source = text(flags.source) || text(stats.compendiumSource) || text(item.sourceId) || text(record(record(item.flags).core).sourceId) || null;
    const spell = parseSpell({ type: item.type, name: item.name, system: item.system }, {
      kind: 'owned', id: item.id, entryId: text(location.value), source, signature: location.signature === true,
      castRank: integer(location.heightenedLevel, 1, 10) ?? integer(record(record(item.system).level).value, 0, 10) ?? 0
    });
    return spell ? [spell] : [];
  });
}
export class Catalog {
  private cache = new Map<string, { at: number; promise: Promise<Spell[]> }>();
  invalidate(): void { this.cache.clear(); }
  async read(env: Environment): Promise<Spell[]> {
    const allowed = text(env.settings.get(MODULE_ID, 'sources')).split(',').map(s => s.trim()).filter(Boolean);
    const ttl = Number(env.settings.get(MODULE_ID, 'cacheMinutes')) * 60000;
    const packs = Array.from(env.packs).filter(p => p.documentName === 'Item' && allowed.includes(p.collection) && p.testUserPermission(env.user, 'OBSERVER'));
    const result = await Promise.all(packs.map(async pack => {
      let cached = this.cache.get(pack.collection);
      if (!cached || !(ttl > 0) || Date.now() - cached.at > ttl) {
        const promise = pack.getIndex({ fields: INDEX_FIELDS }).then(index => Array.from(index).flatMap(row => {
          const id = text(record(row)._id); if (!id) return [];
          const spell = parseSpell(row, { kind: 'virtual', id, pack: pack.collection, uuid: `Compendium.${pack.collection}.Item.${id}` });
          return spell ? [spell] : [];
        }));
        cached = { at: Date.now(), promise }; this.cache.set(pack.collection, cached);
      }
      try {
        const spells = await cached.promise;
        const stillAllowed = text(env.settings.get(MODULE_ID, 'sources')).split(',').map(s => s.trim()).includes(pack.collection);
        return stillAllowed && pack.testUserPermission(env.user, 'OBSERVER') ? spells : [];
      }
      catch (error) { this.cache.delete(pack.collection); throw new Error(`Cannot read ${pack.collection}: ${String(error)}`); }
    }));
    return result.flat();
  }
}
export const catalog = new Catalog();
const queues = new Map<string, Promise<unknown>>();
export class Spellbook {
  readonly actor: ActorDocument;
  readonly env: Environment;
  readonly catalog: Catalog;
  constructor(actor: ActorDocument, env: Environment, catalog: Catalog) { this.actor = actor; this.env = env; this.catalog = catalog; }
  private assertOwner(): void {
    if (this.actor.type !== 'character' || !this.actor.isOwner) throw new Error('Character ownership is required.');
  }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = (queues.get(this.actor.uuid) ?? Promise.resolve()).catch(() => undefined).then(() => { this.assertOwner(); return work(); });
    queues.set(this.actor.uuid, result);
    void result.finally(() => { if (queues.get(this.actor.uuid) === result) queues.delete(this.actor.uuid); }).catch(() => undefined);
    return result;
  }
  entries(): Entry[] { this.assertOwner(); return this.actor.items.contents.flatMap(i => { const e = parseEntry(i); return e ? [e] : []; }); }
  entry(id: string): Entry { const e = this.entries().find(e => e.id === id); if (!e) throw new Error('Spellcasting entry no longer exists.'); return e; }
  recognition(e: Entry): Recognition {
    const items = this.actor.items.contents;
    const features = items.filter(i => i.type === 'feat').map(i => text(record(i.system).slug));
    const ambiguous = items.some(i => i.type === 'feat' && strings(record(record(i.system).traits).value).some(t => t === 'archetype' || t === 'dedication')) ||
      items.filter(i => i.type === 'class').length > 1 || !!text(record(record(record(this.actor.items.get(e.id)?.flags).pf2e).grantedBy).id);
    const system = record(this.actor.items.get(e.id)?.system);
    const special = /\b(font|curriculum|apparition|studious|archetype|dedication)\b/i.test(e.name) ||
      !!record(system.prepared).validItems || (Array.isArray(system.rules) && system.rules.length > 0);
    return recognize(e, this.entries(), this.actor.class?.slug ?? '', features, ambiguous, special);
  }
  private savedGrant(e: Entry): Grant | undefined {
    const raw = this.env.settings.get(MODULE_ID, 'grants');
    if (!Array.isArray(raw)) return undefined;
    const candidate = raw.map(record).find(g => g.actorUuid === this.actor.uuid && g.entryId === e.id);
    if (!candidate) return undefined;
    const mode = category(candidate.category); if (!mode) return undefined;
    const g: Grant = { actorUuid: text(candidate.actorUuid), entryId: text(candidate.entryId), tradition: text(candidate.tradition), category: mode,
      classSlug: text(candidate.classSlug), fullTradition: candidate.fullTradition === true, extra: strings(candidate.extra), preparation: candidate.preparation === true,
      slotShape: text(candidate.slotShape), allowedRanks: Array.isArray(candidate.allowedRanks) ? candidate.allowedRanks.filter((r): r is number => integer(r, 0, 10) !== null) : [] };
    return validGrant(g, this.actor.uuid, this.actor.class?.slug ?? '', e) ? g : undefined;
  }
  grant(e: Entry): Grant | undefined {
    const recognition = this.recognition(e);
    if (recognition.kind === 'native') return undefined;
    const saved = this.savedGrant(e);
    if (saved) return saved;
    if (recognition.kind !== 'automatic') return undefined;
    return { actorUuid: this.actor.uuid, entryId: e.id, classSlug: this.actor.class?.slug ?? '', tradition: e.tradition,
      category: e.category, fullTradition: recognition.fullTradition, extra: [], preparation: true,
      slotShape: slotShape(e), allowedRanks: recognition.allowedRanks };
  }
  needsSetup(e: Entry): boolean {
    const recognition = this.recognition(e);
    if (recognition.kind === 'native') return false;
    const saved = this.savedGrant(e);
    if (saved && (!saved.preparation || saved.slotShape === slotShape(e))) return false;
    return recognition.kind === 'review' || recognition.reviewRanks.length > 0 || !!saved;
  }
  policy(): Policy {
    const get = (key: string) => this.env.settings.get(MODULE_ID, key) === true;
    return { virtual: get('virtual'), uncommon: get('uncommon'), rare: get('rare'), legacy: get('legacy') };
  }
  async list(entryId: string): Promise<Spell[]> {
    this.assertOwner(); const e = this.entry(entryId); const own = ownedSpells(this.actor).filter(s => eligible(s, e, undefined, this.policy()));
    if (!this.policy().virtual || !this.grant(e)) return own;
    const all = await this.catalog.read(this.env);
    this.assertOwner(); const live = this.entry(entryId), g = this.grant(live);
    const current = ownedSpells(this.actor).filter(s => eligible(s, live, undefined, this.policy()));
    return [...current, ...all.filter(s => eligible(s, live, g, this.policy()) && s.origin.kind === 'virtual' && !duplicate(current, entryId, s.origin.uuid))];
  }
  async details(entryId: string, key: string): Promise<void> {
    const spell = (await this.list(entryId)).find(s => s.key === key);
    if (!spell) throw new Error('Spell is no longer available.');
    const doc = spell.origin.kind === 'owned' ? this.actor.items.get(spell.origin.id) : await this.resolveSource(spell);
    this.assertOwner(); doc?.sheet?.render({ force: true });
  }
  private async resolveSource(spell: Spell): Promise<ItemDocument> {
    if (spell.origin.kind !== 'virtual') throw new Error('Expected a compendium spell.');
    const origin = spell.origin;
    const pack = Array.from(this.env.packs).find(p => p.collection === origin.pack);
    const allowed = text(this.env.settings.get(MODULE_ID, 'sources')).split(',').map(s => s.trim());
    if (!pack || !allowed.includes(pack.collection) || !pack.testUserPermission(this.env.user, 'OBSERVER')) throw new Error('Compendium access is not allowed.');
    const doc = await pack.getDocument(origin.id);
    this.assertOwner();
    if (!doc || doc.type !== 'spell' || !pack.testUserPermission(this.env.user, 'OBSERVER') ||
        !text(this.env.settings.get(MODULE_ID, 'sources')).split(',').map(s => s.trim()).includes(pack.collection)) throw new Error('Spell source is unavailable.');
    return doc;
  }
  private async ensureOwned(entryId: string, key: string): Promise<ItemDocument> {
    const listed = (await this.list(entryId)).find(s => s.key === key);
    if (!listed) {
      const existing = duplicate(ownedSpells(this.actor), entryId, key);
      if (existing?.origin.kind === 'owned') { const doc = this.actor.items.get(existing.origin.id); if (doc) return doc; }
      throw new Error('Spell is not eligible for this entry.');
    }
    if (listed.origin.kind === 'owned') {
      const doc = this.actor.items.get(listed.origin.id); if (!doc) throw new Error('Owned spell is missing.'); return doc;
    }
    if (this.env.settings.get(MODULE_ID, 'import') !== true) throw new Error('Spell import is disabled by the GM.');
    const origin = listed.origin, doc = await this.resolveSource(listed);
    const spell = parseSpell({ type: doc.type, name: doc.name, system: doc.system }, origin);
    const entry = this.entry(entryId);
    if (!spell || !eligible(spell, entry, this.grant(entry), this.policy()) || this.env.settings.get(MODULE_ID, 'import') !== true) throw new Error('Spell eligibility changed before import.');
    const existing = duplicate(ownedSpells(this.actor), entryId, origin.uuid);
    if (existing?.origin.kind === 'owned') { const item = this.actor.items.get(existing.origin.id); if (item) return item; }
    const source = doc.toObject(); delete source._id;
    source.system = { ...record(source.system), location: { value: entryId } };
    source.flags = { ...record(source.flags), [MODULE_ID]: { source: origin.uuid } };
    source._stats = { ...record(source._stats), compendiumSource: origin.uuid };
    this.assertOwner();
    const created = (await this.actor.createEmbeddedDocuments('Item', [source]))[0];
    if (!created || record(record(created.system).location).value !== entryId) throw new Error('Import could not be verified. Refresh before retrying.');
    return created;
  }
  import(entryId: string, keys: string[], signal?: AbortSignal): Promise<{ imported: number; stopped: string | null }> {
    return this.serial(async () => {
      let imported = 0;
      for (const key of new Set(keys)) {
        if (signal?.aborted) return { imported, stopped: 'Canceled. Completed imports were kept.' };
        try { const before = this.actor.items.contents.length; await this.ensureOwned(entryId, key); if (this.actor.items.contents.length > before) imported++; }
        catch (error) { return { imported, stopped: String(error) }; }
      }
      return { imported, stopped: null };
    });
  }
  prepare(entryId: string, key: string | null, rank: number, index: number): Promise<void> {
    return this.serial(async () => {
      let e = this.entry(entryId); let error = preparationError(e, this.grant(e), null, rank, index);
      if (error) throw new Error(error);
      if (key) {
        const listed = (await this.list(entryId)).find(s => s.key === key);
        if (!listed || listed.category === 'focus' || listed.category === 'ritual' || (rank === 0) !== (listed.category === 'cantrip') || (rank > 0 && listed.rank > rank)) throw new Error('Spell cannot use this slot.');
      }
      const item = key ? await this.ensureOwned(entryId, key) : null;
      e = this.entry(entryId);
      const spell = item ? ownedSpells(this.actor).find(s => s.key === item.id) : null;
      if (spell === undefined) throw new Error('Imported spell was not found.');
      error = preparationError(e, this.grant(e), spell, rank, index); if (error) throw new Error(error);
      const collection = this.actor.items.get(entryId)?.spells;
      if (!collection || typeof collection.prepareSpell !== 'function') throw new Error('Unsupported PF2e preparation API.');
      this.assertOwner(); const result = await collection.prepareSpell(item, rank === 0 ? 'cantrips' : rank, index);
      if (!result) throw new Error('PF2e refused the preparation. Any imported spell was kept.');
      if (item) await this.remember(item.id);
    });
  }
  presets(entryId: string): Preset[] {
    const raw = this.actor.getFlag(MODULE_ID, 'presets'); if (!Array.isArray(raw)) return [];
    return raw.flatMap(p => { try { const parsed = parsePreset(p); return parsed.entryId === entryId ? [parsed] : []; } catch { return []; } });
  }
  private assertPresets(): void { if (this.env.settings.get(MODULE_ID, 'presets') !== true) throw new Error('Preparation presets are disabled.'); }
  savePreset(entryId: string, name: string): Promise<void> {
    return this.serial(async () => {
      this.assertPresets(); if (!name.trim()) throw new Error('A preset name is required.');
      const e = this.entry(entryId), p = snapshot(e, this.grant(e), name.trim(), foundry.utils.randomID());
      if (!p.assignments.length) throw new Error('No approved standard preparation slots are available.');
      const raw = this.actor.getFlag(MODULE_ID, 'presets'); const all = Array.isArray(raw) ? raw : [];
      if (all.length >= 50) throw new Error('This character already has 50 presets.');
      await this.actor.setFlag(MODULE_ID, 'presets', [...all, p]);
    });
  }
  private presetTarget(entryId: string, expected: Preset) {
    const target = parsePreset(expected);
    if (target.entryId !== entryId) throw new Error('Preset belongs to a different entry.');
    const raw = this.actor.getFlag(MODULE_ID, 'presets');
    const all = Array.isArray(raw) ? raw : [];
    const matches = all.flatMap((value, index) => record(value).id === target.id ? [index] : []);
    const index = matches[0];
    if (matches.length !== 1 || index === undefined) throw new Error('Preset target is missing or ambiguous. Refresh and try again.');
    const current = parsePreset(all[index]);
    if (JSON.stringify(current) !== JSON.stringify(target)) throw new Error('Preset changed. Refresh and try again.');
    return { all, index, current };
  }
  overwritePreset(entryId: string, expected: Preset): Promise<void> {
    return this.serial(async () => {
      this.assertPresets();
      const { all, index, current } = this.presetTarget(entryId, expected);
      const e = this.entry(entryId), saved = snapshot(e, this.grant(e), current.name, current.id);
      if (!saved.assignments.length) throw new Error('No approved standard preparation slots are available.');
      await this.actor.setFlag(MODULE_ID, 'presets', all.map((value, position) => position === index
        ? { ...record(value), assignments: saved.assignments } : value));
    });
  }
  deletePreset(entryId: string, expected: Preset): Promise<void> {
    return this.serial(async () => {
      this.assertPresets(); this.entry(entryId);
      const { all, index } = this.presetTarget(entryId, expected);
      await this.actor.setFlag(MODULE_ID, 'presets', all.filter((_value, position) => position !== index));
    });
  }
  fingerprint(entryId: string): string {
    const e = this.entry(entryId);
    return JSON.stringify([e, this.grant(e), ownedSpells(this.actor).filter(s => s.origin.kind === 'owned' && s.origin.entryId === entryId)]);
  }
  preview(entryId: string, preset: Preset): { fingerprint: string; changes: { rank: number; index: number; before: string; after: string }[] } {
    this.assertOwner(); this.assertPresets(); const e = this.entry(entryId), spells = ownedSpells(this.actor);
    const assignments = planPreset(e, this.grant(e), parsePreset(preset), spells);
    const name = (id: string | null | undefined) => spells.find(s => s.key === id)?.name ?? 'Empty';
    return { fingerprint: this.fingerprint(entryId), changes: assignments.map(a => ({ rank: a.rank, index: a.index,
      before: name(e.slots.find(s => s.rank === a.rank)?.prepared[a.index]?.id), after: name(a.spellId) })) };
  }
  applyPreset(entryId: string, preset: Preset, expected: string): Promise<void> {
    return this.serial(async () => {
      this.assertPresets(); if (this.fingerprint(entryId) !== expected) throw new Error('Character changed. Preview the preset again.');
      const e = this.entry(entryId), g = this.grant(e), assignments = planPreset(e, g, parsePreset(preset), ownedSpells(this.actor));
      const previous = snapshot(e, g, 'Previous preparation', foundry.utils.randomID());
      await this.actor.setFlag(MODULE_ID, 'previousPreparations', { ...record(this.actor.getFlag(MODULE_ID, 'previousPreparations')), [entryId]: previous });
      this.assertOwner();
      if (this.fingerprint(entryId) !== expected) throw new Error('Character changed before applying the preset. No slots were changed.');
      const update: Record<string, unknown> = {};
      for (const group of e.slots) {
        const rows = assignments.filter(a => a.rank === group.rank); if (!rows.length) continue;
        const prepared = group.prepared.map(s => ({ ...s }));
        for (const row of rows) { const slot = prepared[row.index]; if (slot) slot.id = row.spellId; }
        update[`system.slots.slot${group.rank}.prepared`] = prepared;
      }
      const doc = this.actor.items.get(entryId); if (!doc) throw new Error('Entry is missing.');
      await doc.update(update);
    });
  }
  previous(entryId: string): Preset | undefined {
    const value = record(this.actor.getFlag(MODULE_ID, 'previousPreparations'))[entryId];
    return value ? parsePreset(value) : undefined;
  }
  favorites(): string[] {
    const owned = ownedSpells(this.actor);
    return strings(this.actor.getFlag(MODULE_ID, 'favorites')).map(key => {
      const spell = owned.find(s => s.key === key); return spell ? favoriteKey(spell) : key;
    });
  }
  recent(): string[] { return strings(this.actor.getFlag(MODULE_ID, 'recent')); }
  favorite(key: string): Promise<void> {
    return this.serial(async () => {
      if (this.env.settings.get(MODULE_ID, 'favorites') !== true) throw new Error('Favorites are disabled.');
      const spell = ownedSpells(this.actor).find(s => s.key === key);
      const identity = spell ? favoriteKey(spell) : key;
      const keys = new Set(this.favorites()); if (keys.has(identity)) keys.delete(identity); else keys.add(identity);
      await this.actor.setFlag(MODULE_ID, 'favorites', [...keys].slice(-500));
    });
  }
  private async remember(key: string): Promise<void> { await this.actor.setFlag(MODULE_ID, 'recent', [key, ...this.recent().filter(k => k !== key)].slice(0, 20)); }
  configure(entryId: string, options: { fullTradition: boolean; extra: string[]; preparation: boolean; allowedRanks: number[] }): Promise<void> {
    return this.serial(async () => {
      if (!this.env.user.isGM) throw new Error('Only the GM can authorize spell access.');
      const e = this.entry(entryId);
      if (this.recognition(e).kind === 'native') throw new Error('Use the character sheet for these special spells.');
      if (options.allowedRanks.some(rank => !e.slots.some(s => s.rank === rank && s.max > 0 && s.prepared.length === s.max))) throw new Error('Only complete existing rank groups may be approved.');
      if (options.fullTradition && (e.category !== 'prepared' || !['divine', 'primal', 'arcane', 'occult'].includes(e.tradition))) throw new Error('Full-tradition access requires a prepared entry with a tradition.');
      const g: Grant = { ...options, actorUuid: this.actor.uuid, entryId, classSlug: this.actor.class?.slug ?? '',
        tradition: e.tradition, category: e.category, slotShape: slotShape(e) };
      const raw = this.env.settings.get(MODULE_ID, 'grants');
      const all = Array.isArray(raw) ? raw.filter(v => { const r = record(v); return r.actorUuid !== this.actor.uuid || r.entryId !== entryId; }) : [];
      await this.env.settings.set(MODULE_ID, 'grants', [...all, g]);
    });
  }
}
