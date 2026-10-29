import { MODULE_ID, matches, preparationError, parsePreset, text, comparePresets, favoriteKey, slotShape } from './core.ts';
import type { Entry, Filters, Preset, Spell } from './core.ts';
import { Spellbook } from './runtime.ts';

export const openApps = new Set<CompleteSpellbook>();
const t = (key: string) => game.i18n.localize(`CS.${key}`);
export const escapeHTML = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const options = (values: string[], selected: string) => [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(value => ({ value, label: value, selected: value === selected }));

function snippet(description: string): string {
  const template = document.createElement('template');
  template.innerHTML = description;
  template.content.querySelectorAll('script, style, .secret').forEach(node => node.remove());
  const plain = (template.content.textContent ?? '').replace(/@\w+\[([^\]]+)\](?:\{([^}]+)\})?/g, (_match, data: string, label: string | undefined) => label ?? data)
    .replace(/\[\[([^\]]+)\]\](?:\{([^}]+)\})?/g, (_match, formula: string, label: string | undefined) => label ?? formula)
    .replace(/\s+/g, ' ').trim();
  return plain.length > 450 ? `${plain.slice(0, 447)}...` : plain;
}

export class CompleteSpellbook extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static override DEFAULT_OPTIONS = { id: 'pf2e-complete-spellbook-{id}', classes: ['pf2e-complete-spellbook'], window: { title: 'CS.Title', resizable: true }, position: { width: 1000, height: 760 } };
  static override PARTS = { content: { template: `modules/${MODULE_ID}/templates/spellbook.hbs` } };
  entryId: string;
  filters: Filters = { search: '', rank: '', tradition: '', trait: '', rarity: '', actions: '', damage: '', category: '', status: '', sort: 'name' };
  private page = 0;
  private busy = false;
  private listeners = new AbortController();
  private importing: AbortController | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private rows: { entryId: string; spell: Spell }[] = [];
  private selected = new Set<string>();
  private selectableKeys: string[] = [];
  readonly book: Spellbook;
  constructor(book: Spellbook) {
    super({ window: { title: `${t('Title')} · ${book.actor.name}` } });
    this.book = book;
    this.entryId = book.entries()[0]?.id ?? '';
    this.filters.rarity = text(game.settings.get(MODULE_ID, 'defaultRarity'));
    openApps.add(this);
  }
  protected override async _prepareContext(): Promise<Record<string, unknown>> {
    const entries = this.book.entries();
    if (this.entryId && !entries.some(e => e.id === this.entryId)) this.entryId = entries[0]?.id ?? '';
    const current = entries.find(e => e.id === this.entryId);
    const recognition = current ? this.book.recognition(current) : null;
    const scope = current ? [current] : entries;
    this.rows = (await Promise.all(scope.map(async e => (await this.book.list(e.id)).map(spell => ({ entryId: e.id, spell }))))).flat();
    const prepared = new Set(entries.flatMap(e => e.slots.flatMap(s => s.prepared.map(p => p.id).filter((id): id is string => !!id))));
    const favorites = new Set(this.book.favorites()), recent = new Set(this.book.recent());
    const filter = this.filters.category === 'innate' ? { ...this.filters, category: '' } : this.filters;
    const visible = this.rows.filter(row => matches(row.spell, filter, prepared, favorites, recent) &&
      (this.filters.category !== 'innate' || entries.find(e => e.id === row.entryId)?.category === 'innate'));
    visible.sort((a, b) => this.filters.sort === 'rank' ? a.spell.rank - b.spell.rank || a.spell.name.localeCompare(b.spell.name) : a.spell.name.localeCompare(b.spell.name));
    const canImport = !!current && game.settings.get(MODULE_ID, 'import') === true;
    this.selectableKeys = canImport ? visible.filter(r => r.spell.origin.kind === 'virtual').map(r => `${r.entryId}|${r.spell.key}`) : [];
    this.selected = new Set([...this.selected].filter(key => this.selectableKeys.includes(key)));
    this.page = Math.max(0, Math.min(this.page, Math.ceil(visible.length / 100) - 1));
    const slots = current?.slots.flatMap(group => group.prepared.slice(0, group.max).map((slot, index) => ({ rank: group.rank, index,
      name: this.book.actor.items.get(slot.id ?? '')?.name ?? t('Empty'), expended: slot.expended,
      editable: !preparationError(current, this.book.grant(current), null, group.rank, index) }))) ?? [];
    const all = this.rows.map(r => r.spell);
    const editableRanks = new Map(entries.map(e => [e.id, e.slots.filter(s => s.max > 0 && !preparationError(e, this.book.grant(e), null, s.rank, 0)).map(s => s.rank)]));
    return { actorName: this.book.actor.name, isGM: game.user.isGM, busy: this.busy, hasEntry: !!current, hasEntries: !!entries.length,
      entryName: current?.name, entryMode: current ? `${current.category}${current.flexible ? ' / flexible' : ''} · ${current.tradition}` : t('Unified'),
      access: current && this.book.grant(current)?.fullTradition ? t('TraditionAccess') : t('KnownAccess'),
      canConfigure: !!current && recognition?.kind !== 'native',
      setupMessage: recognition ? t(recognition.reason) : '',
      entries: entries.map(e => ({ ...e, selected: e.id === this.entryId })),
      rows: visible.slice(this.page * 100, this.page * 100 + 100).map(({ entryId, spell }) => ({ ...spell, entryId,
        entryName: entries.find(e => e.id === entryId)?.name, key: spell.key, virtual: spell.origin.kind === 'virtual',
        status: prepared.has(spell.key) ? t('Prepared') : spell.origin.kind === 'virtual' ? t('Virtual') : t('Owned'),
        snippet: escapeHTML(snippet(spell.description) || t('NoDescription')),
        selectable: canImport && spell.origin.kind === 'virtual',
        favorite: favorites.has(favoriteKey(spell)), checked: this.selected.has(`${entryId}|${spell.key}`),
        signature: spell.origin.kind === 'owned' && spell.origin.signature,
        canPrepare: spell.category !== 'focus' && spell.category !== 'ritual' && editableRanks.get(entryId)?.some(rank =>
          (rank === 0) === (spell.category === 'cantrip') && (rank === 0 || rank >= spell.rank)),
        canImport: spell.origin.kind === 'virtual' && game.settings.get(MODULE_ID, 'import') === true,
        showFavorite: game.settings.get(MODULE_ID, 'favorites') === true })),
      filters: this.filters, ranks: options(Array.from({ length: 11 }, (_, n) => String(n)), this.filters.rank),
      traditions: options(['arcane', 'divine', 'occult', 'primal'], this.filters.tradition),
      traits: options(all.flatMap(s => s.traits), this.filters.trait), rarities: options(['common', 'uncommon', 'rare', 'unique'], this.filters.rarity),
      actions: options(all.map(s => s.actions).filter(Boolean), this.filters.actions), damages: options(all.flatMap(s => s.damage), this.filters.damage),
      categories: options(['cantrip', 'ranked', 'focus', 'innate', 'ritual'], this.filters.category),
      statuses: options(['virtual', 'owned', 'prepared', 'unprepared', 'favorites', 'recent'], this.filters.status).map(option => ({ ...option,
        label: t(({ virtual: 'Virtual', owned: 'Owned', prepared: 'Prepared', unprepared: 'Unprepared', favorites: 'Favorites', recent: 'Recent' })[option.value] ?? option.value) })),
      sorts: options(['name', 'rank'], this.filters.sort),
      total: visible.length, page: this.page + 1, pages: Math.max(1, Math.ceil(visible.length / 100)), prevDisabled: this.page === 0, nextDisabled: (this.page + 1) * 100 >= visible.length,
      slots, filled: slots.filter(s => s.name !== t('Empty')).length, slotCount: slots.length,
      resources: current?.slots.filter(s => s.max > 0).map(s => ({ rank: s.rank, max: s.max,
        value: current.category === 'prepared' && (!current.flexible || s.rank === 0) ? s.prepared.slice(0, s.max).filter(p => !p.expended).length : s.value })) ?? [],
      presets: current ? this.book.presets(current.id) : [], showPresets: !!current && current.category === 'prepared' && game.settings.get(MODULE_ID, 'presets') === true,
      canSavePreset: slots.some(s => s.editable),
      showImport: canImport, selectionDisabled: !this.selectableKeys.length, noneSelected: !this.selected.size,
      allSelected: !!this.selectableKeys.length && this.selected.size === this.selectableKeys.length,
      showNativeNotice: !!current && (recognition?.kind === 'native' || current.flexible),
      needsReview: !!current && this.book.needsSetup(current)
    };
  }
  protected override _onRender(): void {
    this.listeners.abort(); this.listeners = new AbortController(); const signal = this.listeners.signal;
    const syncSelection = () => {
      const all = this.element.querySelector<HTMLInputElement>('input[name="selectAll"]');
      if (all) { all.checked = !!this.selectableKeys.length && this.selected.size === this.selectableKeys.length; all.indeterminate = this.selected.size > 0 && !all.checked; }
      this.element.querySelectorAll<HTMLInputElement>('input[name="selected"]').forEach(input => { input.checked = this.selected.has(input.value); });
      const button = this.element.querySelector<HTMLButtonElement>('button[data-command="importSelected"]');
      if (button) button.disabled = this.busy || !this.selected.size;
    };
    syncSelection();
    this.element.addEventListener('input', event => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.name === 'search') {
        this.filters.search = target.value; this.selected.clear(); this.page = 0; clearTimeout(this.searchTimer);
        const start = target.selectionStart;
        this.searchTimer = setTimeout(() => { void this.refresh().then(() => {
          const input = this.element.querySelector<HTMLInputElement>('input[name="search"]'); input?.focus(); if (start !== null) input?.setSelectionRange(start, start);
        }); }, 180);
      }
    }, { signal });
    this.element.addEventListener('change', event => {
      const target = event.target;
      if (target instanceof HTMLSelectElement) {
        if (target.name === 'entry') { this.entryId = target.value; this.selected.clear(); }
        else if (Object.hasOwn(this.filters, target.name)) Reflect.set(this.filters, target.name, target.value);
        this.page = 0; void this.refresh();
      }
      if (target instanceof HTMLInputElement && target.name === 'selected') {
        if (target.checked) this.selected.add(target.value); else this.selected.delete(target.value);
        syncSelection();
      }
      if (target instanceof HTMLInputElement && target.name === 'selectAll') {
        this.selected = new Set(target.checked ? this.selectableKeys : []); syncSelection();
      }
    }, { signal });
    this.element.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-command]') : null;
      if (!button) return; event.preventDefault();
      if (button.dataset.command === 'cancel') { this.importing?.abort(); return; }
      if (!this.busy) void this.run(() => this.command(button));
    }, { signal });
  }
  async refresh(): Promise<void> { try { if (this.rendered) await this.render({ force: true }); } catch (error) { ui.notifications.error(String(error)); } }
  private async run(work: () => Promise<void>): Promise<void> {
    this.busy = true;
    this.element.querySelectorAll<HTMLButtonElement>('button[data-command]').forEach(b => { if (b.dataset.command !== 'cancel') b.disabled = true; });
    try { await work(); } catch (error) { ui.notifications.error(String(error)); if (game.settings.get(MODULE_ID, 'debug')) console.error(MODULE_ID, error); }
    finally { this.busy = false; await this.refresh(); }
  }
  private async command(button: HTMLButtonElement): Promise<void> {
    const { command, key = '', entry = this.entryId } = button.dataset;
    if (command === 'native') { this.book.actor.sheet.render({ force: true }); return; }
    if (command === 'refresh') { this.book.catalog.invalidate(); return; }
    if (command === 'previousPage') { this.page--; return; }
    if (command === 'nextPage') { this.page++; return; }
    if (command === 'details') { await this.book.details(entry, key); return; }
    if (command === 'favorite') { await this.book.favorite(key); return; }
    if (command === 'configure') { await this.configure(); return; }
    if (command === 'clear') { await this.book.prepare(entry, null, Number(button.dataset.rank), Number(button.dataset.index)); return; }
    if (command === 'prepare') { await this.prepare(entry, key); return; }
    if (command === 'savePreset') {
      const result = await foundry.applications.api.DialogV2.input({ window: { title: t('SavePreset') }, content: `<label>${t('Name')}<input name="name" maxlength="80" required></label>` });
      if (result) { await this.book.savePreset(entry, text(result.name)); ui.notifications.info(t('PresetSaved')); } return;
    }
    if (command === 'overwritePreset' || command === 'deletePreset') {
      const targets = this.book.presets(entry).filter(p => p.id === key);
      const target = targets[0];
      if (targets.length !== 1 || !target) throw new Error(t('Unavailable'));
      const deleting = command === 'deletePreset';
      const confirmed = await foundry.applications.api.DialogV2.confirm({ window: { title: t(deleting ? 'DeletePreset' : 'SaveOver') }, rejectClose: false,
        content: `<p>${t(deleting ? 'DeletePresetWarning' : 'SaveOverWarning')} <strong>${escapeHTML(target.name)}</strong>?</p>${deleting ? `<p>${t('DeletePresetHelp')}</p>` : ''}` });
      if (confirmed) {
        if (deleting) await this.book.deletePreset(entry, target);
        else await this.book.overwritePreset(entry, target);
        ui.notifications.info(t(deleting ? 'PresetDeleted' : 'PresetSaved'));
      }
      return;
    }
    if (command === 'loadPreset' || command === 'comparePreset' || command === 'restore') {
      const raw = command === 'restore' ? this.book.previous(entry) : this.book.presets(entry).find(p => p.id === key);
      if (!raw) throw new Error(t('NoPrevious'));
      const preset = parsePreset(raw); await this.showPreset(entry, preset, command === 'comparePreset'); return;
    }
    if (command === 'importOne' || command === 'importAll' || command === 'importSelected' || command === 'importFiltered') {
      let rows = this.rows.filter(r => r.entryId === entry && r.spell.origin.kind === 'virtual');
      if (command === 'importOne') rows = rows.filter(r => r.spell.key === key);
      if (command === 'importSelected') rows = rows.filter(r => this.selected.has(`${entry}|${r.spell.key}`));
      if (command === 'importFiltered') rows = rows.filter(r => matches(r.spell, this.filters, new Set(), new Set(this.book.favorites()), new Set(this.book.recent())));
      if (!rows.length) { ui.notifications.info(t('NothingToImport')); return; }
      const confirmed = await foundry.applications.api.DialogV2.confirm({ window: { title: t('ImportPreview') }, rejectClose: false,
        content: `<p>${rows.length} ${t('ImportWarning')}</p><ol class="cs-preview">${rows.map(r => `<li>${escapeHTML(r.spell.name)} (${r.spell.rank})</li>`).join('')}</ol>` });
      if (!confirmed) return;
      this.importing = new AbortController();
      const outcome = await this.book.import(entry, rows.map(r => r.spell.key), this.importing.signal); this.importing = null;
      ui.notifications.info(`${outcome.imported} ${t('Imported')}`); if (outcome.stopped) ui.notifications.warn(outcome.stopped);
    }
  }
  private async prepare(entryId: string, key: string): Promise<void> {
    const entry = this.book.entry(entryId), spell = (await this.book.list(entryId)).find(s => s.key === key);
    if (!spell) throw new Error(t('Unavailable'));
    const slots = entry.slots.flatMap(s => s.prepared.slice(0, s.max).flatMap((p, i) => {
      if (preparationError(entry, this.book.grant(entry), null, s.rank, i) || (s.rank === 0) !== (spell.category === 'cantrip') || (s.rank > 0 && spell.rank > s.rank)) return [];
      return [{ value: `${s.rank}:${i}`, label: `${t('Rank')} ${s.rank} / ${i} · ${this.book.actor.items.get(p.id ?? '')?.name ?? t('Empty')}${p.expended ? ` · ${t('Expended')}` : ''}` }];
    }));
    if (!slots.length) throw new Error(t('NoSlots'));
    const result = await foundry.applications.api.DialogV2.input({ window: { title: `${t('Prepare')} ${spell.name}` },
      content: `<p>${t('PreparationWarning')}</p><label>${t('Slot')}<select name="slot">${slots.map(s => `<option value="${s.value}">${escapeHTML(s.label)}</option>`).join('')}</select></label>` });
    if (result) { const [rank, index] = text(result.slot).split(':').map(Number); if (rank !== undefined && index !== undefined) await this.book.prepare(entryId, key, rank, index); }
  }
  private async showPreset(entryId: string, preset: Preset, compareOnly: boolean): Promise<void> {
    const preview = compareOnly ? null : this.book.preview(entryId, preset);
    let changes = preview?.changes ?? [], beforeLabel = t('Current');
    if (compareOnly) {
      const alternatives = this.book.presets(entryId).filter(p => p.id !== preset.id);
      const choice = await foundry.applications.api.DialogV2.input({ window: { title: t('ComparePreset') },
        content: `<label>${t('CompareAgainst')}<select name="baseline"><option value="">${t('Current')}</option>${alternatives.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join('')}</select></label>` });
      if (!choice) return;
      const baseline = alternatives.find(p => p.id === choice.baseline) ?? {
        version: 1, id: 'current', name: t('Current'), entryId,
        assignments: this.book.entry(entryId).slots.flatMap(s => s.prepared.slice(0, s.max).map((slot, index) => ({ rank: s.rank, index, spellId: slot.id })))
      } satisfies Preset;
      const name = (id: string | null | undefined) => id === undefined ? t('Unspecified') : id === null ? t('Empty') : this.book.actor.items.get(id)?.name ?? t('Unavailable');
      beforeLabel = baseline.name;
      changes = comparePresets(baseline, preset).map(c => ({ ...c, before: name(c.before), after: name(c.after) }));
    }
    const content = `<p>${t('PresetWarning')}</p><table><thead><tr><th>${t('Slot')}</th><th>${escapeHTML(beforeLabel)}</th><th>${escapeHTML(preset.name)}</th></tr></thead><tbody>${changes.map(c => `<tr><td>${c.rank}:${c.index}</td><td>${escapeHTML(c.before)}</td><td>${escapeHTML(c.after)}</td></tr>`).join('')}</tbody></table>`;
    const apply = await foundry.applications.api.DialogV2.confirm({ window: { title: compareOnly ? t('ComparePreset') : t('LoadPreset') }, content, rejectClose: false });
    if (preview && apply) await this.book.applyPreset(entryId, preset, preview.fingerprint);
  }
  private async configure(): Promise<void> {
    if (!game.user.isGM) throw new Error(t('GMOnly'));
    const e = this.book.entry(this.entryId), g = this.book.grant(e), recognition = this.book.recognition(e);
    if (recognition.kind === 'native') return;
    const ranks = e.slots.filter(s => s.max > 0 && s.prepared.length === s.max && (!e.flexible || s.rank === 0)).map(s => s.rank);
    const full = g?.fullTradition ?? (recognition.kind === 'automatic' && recognition.fullTradition);
    const content = `<p><strong>${escapeHTML(e.name)}</strong></p><p>${t(this.book.needsSetup(e) ? recognition.reason : 'SetupConfirmed')}</p>` +
      (recognition.kind === 'review' ? `<label>${t('SpellAccess')}<select name="access"><option value="known" ${!full ? 'selected' : ''}>${t('KnownChoice')}</option><option value="tradition" ${full ? 'selected' : ''}>${t('TraditionChoice')}</option></select></label><p>${t('AccessHelp')}</p>` : `<p>${t(full ? 'TraditionAccess' : 'KnownAccess')}</p>`) +
      `<fieldset><legend>${t('SafeRanks')}</legend><p>${t('RankHelp')}</p>${ranks.map(rank => `<label style="display:flex;align-items:center;gap:0.5rem"><input type="checkbox" name="rank${rank}" ${g?.preparation && g.allowedRanks.includes(rank) && g.slotShape === slotShape(e) ? 'checked' : ''}>${rank === 0 ? t('Cantrips') : `${t('Rank')} ${rank}`}</label>`).join('')}</fieldset>`;
    const result = await foundry.applications.api.DialogV2.input({ window: { title: t('Configure') }, content:
      content });
    if (!result) return;
    const allowedRanks = ranks.filter(rank => result[`rank${rank}`] === true);
    await this.book.configure(e.id, { fullTradition: recognition.kind === 'automatic' ? full : result.access === 'tradition', extra: g?.extra ?? [], preparation: true, allowedRanks });
  }
  override async close(options?: Record<string, unknown>): Promise<this> {
    this.listeners.abort(); clearTimeout(this.searchTimer); this.importing?.abort(); openApps.delete(this); return super.close(options);
  }
}
