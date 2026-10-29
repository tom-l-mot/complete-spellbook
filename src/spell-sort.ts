import { MODULE_ID } from './core.ts';

export type SortMode = 'default' | 'rank' | 'category' | 'name';
export type SpellOrder = { rank: number; category: string; name: string; index: number; entryName?: string; entryIndex?: number };
type Occurrence = SpellOrder & {
  row: HTMLElement; home: Comment; entry: HTMLElement; list: HTMLElement; entryName: string;
};
const mounted = new WeakMap<HTMLElement, { entries: HTMLElement; events: AbortController }>();
const modes = ['default', 'rank', 'category', 'name'] as const;
const castingTypes = ['prepared', 'spontaneous', 'innate', 'focus'];
const text = (key: string): string => game.i18n.localize(`CS.${key}`);

export function isSortMode(value: unknown): value is SortMode {
  return modes.some(mode => mode === value);
}

export function compareSpells(a: SpellOrder, b: SpellOrder, mode: Exclude<SortMode, 'default'>): number {
  const categoryOrder = (category: string): number => {
    const index = castingTypes.indexOf(category);
    return index < 0 ? castingTypes.length : index;
  };
  const groupOrder = mode === 'rank' ? (a.category === 'focus' ? -1 : a.rank) - (b.category === 'focus' ? -1 : b.rank) : mode === 'category'
    ? categoryOrder(a.category) - categoryOrder(b.category) || a.category.localeCompare(b.category) : 0;
  const sourceOrder = mode === 'name' ? 0 : (a.entryName ?? '').localeCompare(b.entryName ?? '') || (a.entryIndex ?? 0) - (b.entryIndex ?? 0);
  return groupOrder || sourceOrder || a.name.localeCompare(b.name) || a.index - b.index;
}

export function installSpellSort(root: HTMLElement, actorUuid: string): void {
  const panel = root.querySelector<HTMLElement>('.spellcasting .known-spells[data-tab="known-spells"]');
  const nav = root.querySelector<HTMLElement>('.spellcasting .sub-nav');
  if (!panel || !nav) return;
  const entries = panel.querySelector<HTMLElement>(':scope > ol.spellcastingEntry-list');
  if (!entries || mounted.get(root)?.entries === entries) return;
  const entryListClass = entries.className;
  const occurrences: Occurrence[] = [];
  for (const entry of entries.children) {
    if (!(entry instanceof HTMLElement) || !entry.matches('li.spellcasting-entry')) return;
    const lists = entry.querySelectorAll<HTMLElement>(':scope > ol.spell-list');
    if (entry.querySelectorAll('ol.spell-list').length !== lists.length) return;
    for (const list of lists) {
      const category = list.dataset.category;
      const entryId = entry.dataset.itemId;
      const nameInput = entry.querySelector<HTMLInputElement>(':scope > .action-header .item-name-input');
      if (!category || !entryId || entry.dataset.containerId !== entryId || !nameInput?.value.trim()) return;
      for (const row of list.children) {
        if (!(row instanceof HTMLElement)) return;
        if (row.matches('li.header-row')) continue;
        if (!row.matches('li.spell')) return;
        if (row.querySelector('.item-name.empty')) {
          if (row.querySelector('[data-action]')) return;
          continue;
        }
        const castRank = Number(row.dataset.castRank);
        const name = row.querySelector('.name [data-action="toggle-summary"]')?.textContent?.trim();
        if (!row.dataset.itemId || row.dataset.entryId !== entryId || !row.dataset.groupId || !name
          || !row.dataset.castRank || !Number.isInteger(castRank) || castRank < 0 || castRank > 10
          || !['spell', 'spell-slot-group'].includes(row.dataset.itemType ?? '')
          || (category === 'prepared' && !/^\d+$/.test(row.dataset.slotId ?? ''))) return;
        occurrences.push({ row, home: document.createComment('complete-spellbook spell home'), entry, list,
          entryName: nameInput.value, entryIndex: Array.from(entries.children).indexOf(entry), category, rank: row.dataset.groupId === 'cantrips' ? 0 : castRank,
          name, index: occurrences.length });
      }
    }
  }
  if (!occurrences.length || entries.querySelectorAll('li.spell:not(:has(.item-name.empty))').length !== occurrences.length) return;
  for (const occurrence of occurrences) occurrence.row.before(occurrence.home);
  mounted.get(root)?.events.abort();
  panel.querySelector('.cs-sort-toolbar')?.remove();
  for (const element of panel.querySelectorAll(':scope > .cs-sorted-spells, :scope > .cs-sort-resources')) element.remove();
  const events = new AbortController();
  mounted.set(root, { entries, events });
  const storageKey = `${MODULE_ID}.spell-sort.${game.user.id}.${actorUuid}`;
  let mode: SortMode = 'default';
  let selected: Exclude<SortMode, 'default'> = 'rank';
  const toolbar = document.createElement('span'); toolbar.className = 'cs-sort-toolbar';
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.dataset.csSortToggle = '';
  const label = document.createElement('label'); label.textContent = text('SortGroup');
  const select = document.createElement('select'); select.dataset.csSortGroup = '';
  for (const value of ['rank', 'category', 'name'] as const) {
    const option = document.createElement('option'); option.value = value;
    option.textContent = text(value === 'category' ? 'CastingType' : value === 'rank' ? 'Rank' : 'Name');
    select.append(option);
  }
  label.append(select); toolbar.append(toggle, label); panel.prepend(toolbar);
  toggle.className = 'blue'; toggle.title = text('SortHint');
  const sorted = document.createElement('section'); sorted.className = 'cs-sorted-spells'; sorted.dataset.csSorted = ''; sorted.hidden = true;
  entries.before(sorted);
  const nativeElements = [entries, ...panel.querySelectorAll<HTMLElement>(':scope > [data-action="spellcasting-create"]')]
    .map(element => ({ element, hidden: element.hidden }));

  function apply(next: SortMode): void {
    for (const occurrence of occurrences) occurrence.home.after(occurrence.row);
    sorted.replaceChildren();
    mode = next;
    sorted.hidden = mode === 'default';
    for (const { element, hidden } of nativeElements) element.hidden = mode === 'default' ? hidden : true;
    toggle.textContent = text(mode === 'default' ? 'SortSpells' : 'DefaultView');
    toggle.setAttribute('aria-pressed', String(mode !== 'default'));
    label.hidden = mode === 'default';
    if (mode === 'default') return;
    selected = mode; select.value = mode;
    let previousGroup: string | undefined;
    let groupList: HTMLOListElement | undefined;
    let previousEntry: HTMLElement | undefined;
    let previousList: HTMLElement | undefined;
    let previousRank: number | undefined;
    let listShell: Node | undefined;
    for (const occurrence of [...occurrences].sort((a, b) => compareSpells(a, b, selected))) {
      const group = mode === 'rank' ? occurrence.category === 'focus' ? 'focus' : String(occurrence.rank)
        : mode === 'category' ? occurrence.category : '';
      if (group !== previousGroup) {
        if (group) {
          const heading = document.createElement('h3'); heading.className = 'cs-sort-heading';
          heading.textContent = mode === 'rank' ? group === 'focus' ? text('FocusSpells') : occurrence.rank === 0 ? text('Cantrips')
            : text(`RankLabels.${group}`) : castingTypes.includes(group) ? text(`CastingTypes.${group}`) : group;
          sorted.append(heading);
        }
        groupList = document.createElement('ol'); groupList.className = entryListClass;
        sorted.append(groupList); previousGroup = group; previousEntry = previousList = undefined;
      }
      if (previousEntry !== occurrence.entry || previousList !== occurrence.list || (mode !== 'rank' && previousRank !== occurrence.rank)) {
        const entryShell = occurrence.entry.cloneNode(false);
        listShell = occurrence.list.cloneNode(false);
        for (const shell of [entryShell, listShell]) if (shell instanceof HTMLElement) {
          shell.removeAttribute('id'); shell.removeAttribute('data-foundry-list'); shell.hidden = false;
        }
        const header = document.createElement('li'); header.className = 'header-row cs-sort-entry';
        const source = document.createElement('div'); source.className = 'item-name';
        source.textContent = mode === 'rank' ? occurrence.entryName : `${occurrence.entryName} · ${occurrence.rank === 0 ? text('Cantrips') : text(`RankLabels.${occurrence.rank}`)}`;
        const defense = document.createElement('div'); defense.className = 'defense'; defense.textContent = text('Defense');
        const range = document.createElement('div'); range.className = occurrence.category === 'innate' ? 'uses' : 'range';
        range.textContent = text(occurrence.category === 'innate' ? 'Uses' : 'Range');
        const cast = document.createElement('button'); cast.type = 'button'; cast.className = 'cast-spell blue invisible';
        cast.textContent = game.i18n.localize('PF2E.Item.Spell.Cast.Verb'); cast.disabled = true; cast.tabIndex = -1;
        cast.setAttribute('aria-hidden', 'true');
        const controls = document.createElement('div'); controls.className = 'item-controls';
        header.append(source, defense, range, cast, controls);
        listShell.appendChild(header); entryShell.appendChild(listShell); groupList?.append(entryShell);
        previousEntry = occurrence.entry; previousList = occurrence.list; previousRank = occurrence.rank;
      }
      listShell?.appendChild(occurrence.row);
    }
  }
  function save(): void {
    try { localStorage.setItem(storageKey, mode); } catch { /* Client storage can be disabled. */ }
  }
  toggle.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation(); apply(mode === 'default' ? selected : 'default'); save();
  });
  select.addEventListener('change', event => {
    event.stopPropagation();
    if (isSortMode(select.value) && select.value !== 'default') { apply(select.value); save(); }
  });
  for (const eventName of ['dragstart', 'drop']) panel.addEventListener(eventName, event => {
    if (mode !== 'default') { event.preventDefault(); event.stopImmediatePropagation(); }
  }, { capture: true, signal: events.signal });
  let saved: unknown;
  try { saved = localStorage.getItem(storageKey); } catch { /* Default view remains available without storage. */ }
  apply(isSortMode(saved) ? saved : 'default');
}
