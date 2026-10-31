import { installSpellSort } from '../src/spell-sort.ts';

// Bundle with esbuild and run runSpellSortDomChecks() in a browser with Foundry globals.
export function runSpellSortDomChecks() {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const actorUuid = 'Actor.complete-spellbook-dom-test';
  const key = `pf2e-complete-spellbook.spell-sort.${game.user.id}.${actorUuid}`;
  const saved = localStorage.getItem(key);
  const fixture = () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="spellcasting"><nav class="sub-nav"></nav><div class="known-spells" data-tab="known-spells"><ol class="spellcastingEntry-list"></ol><button class="blue create-entry" data-action="spellcasting-create">Create</button></div></div>';
    const entries = root.querySelector('.spellcastingEntry-list');
    for (const [index, category, name] of [[0, 'prepared', 'Zeta'], [1, 'innate', 'Alpha'], [2, 'prepared', 'Beta'], [3, 'focus', 'Focus'], [4, 'prepared', 'Cantrip']]) {
      const entry = document.createElement('li'); entry.className = 'spellcasting-entry'; entry.id = `test-entry-${index}`;
      entry.dataset.itemId = entry.dataset.containerId = `entry${index}`; entry.dataset.containerType = 'spellcastingEntry';
      entry.innerHTML = `<div class="action-header"><input class="item-name-input" value="${category}"></div><ol class="spell-list" data-category="${category}" id="test-list-${index}"></ol>`;
      const list = entry.querySelector('.spell-list');
      for (const slot of [0, 1]) {
        const row = document.createElement('li'); row.className = 'spell';
        Object.assign(row.dataset, { itemId: 'repeated-spell', entryId: `entry${index}`, castRank: String(index === 4 ? 0 : index === 3 ? 4 : index === 0 && slot === 1 ? 2 : 1), groupId: index === 4 ? 'cantrips' : String(index === 3 ? 4 : index === 0 && slot === 1 ? 2 : 1), slotId: String(slot), itemType: 'spell' });
        row.innerHTML = `<div class="item-name"><h4 class="name"><a data-action="toggle-summary">${index === 2 && slot === 1 ? 'Delta' : name}</a></h4></div><button data-action="cast-spell">Cast</button>`;
        list.append(row);
      }
      const empty = document.createElement('li'); empty.className = 'spell'; empty.innerHTML = '<div class="item-name empty"></div>';
      list.append(empty); entries.append(entry);
    }
    return root;
  };
  let root;
  try {
    localStorage.removeItem(key);
    root = fixture();
    const rows = [...root.querySelectorAll('.spell')];
    const nativeList = root.querySelector('.spellcastingEntry-list');
    const createButton = root.querySelector('.create-entry'); createButton.hidden = true;
    const nativeHtml = nativeList.innerHTML;
    const parents = rows.map(row => row.parentElement);
    const datasets = rows.map(row => JSON.stringify(row.dataset));
    let clicks = 0;
    rows[0].querySelector('button').addEventListener('click', () => clicks++);
    installSpellSort(root, actorUuid); installSpellSort(root, actorUuid);
    assert(root.querySelectorAll('[data-cs-sort-toggle]').length === 1, 'mount is idempotent');
    const toggle = root.querySelector('[data-cs-sort-toggle]');
    for (let iteration = 0; iteration < 3; iteration++) {
      toggle.click();
      const sorted = root.querySelector('[data-cs-sorted]');
      assert(sorted.querySelectorAll('.spell').length === 10, 'every occurrence moves, empty slots stay native');
      assert(nativeList.hidden && createButton.hidden, 'native resources, empty slots and create entry stay hidden');
      assert(!root.querySelector('.cs-sort-resources') && !sorted.querySelector('.cs-sort-source'), 'no resource heading or repeated badges');
      assert(sorted.querySelectorAll('.cs-sort-entry').length === 6, 'one source header per contiguous source group');
      assert([...sorted.querySelectorAll('h3')].map(heading => heading.textContent).join(',') === ['CS.FocusSpells', 'CS.Cantrips', 'CS.RankLabels.1', 'CS.RankLabels.2'].map(key => game.i18n.localize(key)).join(','), 'focus first, then cantrips and ordinal ranks');
      assert([...sorted.querySelectorAll('.spellcasting-entry')].map(entry => [...entry.querySelectorAll('.name')].map(name => name.textContent).join('/')).join(',') === 'Focus/Focus,Cantrip/Cantrip,Alpha/Alpha,Zeta,Beta/Delta,Zeta', 'source shells stay contiguous and alphabetized internally');
      assert(sorted.querySelectorAll('[id]').length === 0, 'shells do not duplicate HTML IDs');
      rows[0].querySelector('button').click();
      assert(rows[0].closest('[data-container-id]').dataset.containerId === 'entry0', 'original entry context survives');
      const drag = new Event('dragstart', { bubbles: true, cancelable: true }); rows[0].dispatchEvent(drag);
      assert(drag.defaultPrevented, 'sorted drag is blocked');
      toggle.click();
      assert(sorted.hidden, 'default hides sorted collection');
      assert(!nativeList.hidden && createButton.hidden, 'native hidden states restored exactly');
      const restored = [...root.querySelectorAll('.spell')];
      assert(restored.every((row, index) => row === rows[index] && row.parentElement === parents[index]), 'native row identity and order restored');
      assert(restored.every((row, index) => JSON.stringify(row.dataset) === datasets[index]), 'native datasets unchanged');
      const nativeDrag = new Event('dragstart', { bubbles: true, cancelable: true }); rows[0].dispatchEvent(nativeDrag);
      assert(!nativeDrag.defaultPrevented, 'default drag remains available');
    }
    toggle.click(); createButton.hidden = false; toggle.click();
    assert(createButton.hidden, 'mount-time hidden state preserved after toggling');
    assert(nativeList.innerHTML.replace(/<!--complete-spellbook spell home-->/g, '') === nativeHtml, 'native resources and markup restore exactly');
    assert(clicks === 3, 'attached native listeners survive every move');
    toggle.click();
    const select = root.querySelector('[data-cs-sort-group]');
    select.value = 'name'; select.dispatchEvent(new Event('change', { bubbles: true }));
    assert([...root.querySelectorAll('[data-cs-sorted] .name')].map(name => name.textContent).join(',') === 'Alpha,Alpha,Beta,Cantrip,Cantrip,Delta,Focus,Focus,Zeta,Zeta', 'name sorting crosses entries without deduplication');
    const ranksVisible = () => [...root.querySelectorAll('[data-cs-sorted] .cs-sort-entry .item-name')].map(header => header.textContent);
    for (const rank of [1, 2]) assert(ranksVisible().includes(`prepared · ${game.i18n.localize(`CS.RankLabels.${rank}`)}`), 'name view keeps different cast ranks visible without row badges');
    select.value = 'category'; select.dispatchEvent(new Event('change', { bubbles: true }));
    assert([...root.querySelectorAll('[data-cs-sorted] > h3')].map(heading => heading.textContent).join(',') === ['prepared', 'innate', 'focus'].map(category => game.i18n.localize(`CS.CastingTypes.${category}`)).join(','), 'casting types retain expected order');
    for (const rank of [1, 2]) assert(ranksVisible().includes(`prepared · ${game.i18n.localize(`CS.RankLabels.${rank}`)}`), 'category view keeps different cast ranks visible without row badges');
    select.value = 'name'; select.dispatchEvent(new Event('change', { bubbles: true }));
    root.remove(); root = fixture(); installSpellSort(root, actorUuid);
    const freshToggle = root.querySelector('[data-cs-sort-toggle]'); freshToggle.click();
    assert(!root.querySelector('.create-entry').hidden, 'initially visible create entry restores visible'); freshToggle.click();
    assert(root.querySelector('[data-cs-sort-group]').value === 'name' && !root.querySelector('[data-cs-sorted]').hidden, 'fresh render restores the saved mode');
    root.remove(); root = fixture(); root.querySelector('.spellcastingEntry-list').hidden = true; installSpellSort(root, actorUuid);
    root.querySelector('[data-cs-sort-toggle]').click();
    assert(root.querySelector('.known-spells > .spellcastingEntry-list').hidden, 'initially hidden native list remains hidden in default view');
    root.remove(); localStorage.setItem(key, 'unsupported'); root = fixture(); installSpellSort(root, actorUuid);
    assert(root.querySelector('[data-cs-sorted]').hidden, 'corrupt preference uses the native view');
    root.remove();
    localStorage.removeItem(key); root = fixture();
    const repertoires = [...root.querySelectorAll('.spellcasting-entry')].slice(0, 2);
    for (const [index, entry] of repertoires.entries()) {
      entry.querySelector('input').value = index === 0 ? 'Mystic' : 'Witchwarper';
      entry.querySelector('.spell-list').dataset.category = 'spontaneous';
    }
    const repertoireRows = repertoires.flatMap(entry => [...entry.querySelectorAll('.spell[data-item-id]')]);
    const repertoireParents = repertoireRows.map(row => row.parentElement);
    const repertoireData = repertoireRows.map(row => JSON.stringify(row.dataset));
    installSpellSort(root, actorUuid); root.querySelector('[data-cs-sort-toggle]').click();
    assert(repertoireRows.every(row => root.querySelector('[data-cs-sorted]').contains(row)), 'SF2e repertoire rows move with their original native controls');
    root.querySelector('[data-cs-sort-toggle]').click();
    assert(repertoireRows.every((row, index) => row.parentElement === repertoireParents[index] && JSON.stringify(row.dataset) === repertoireData[index]), 'SF2e repertoire context restores without document changes');
    root.remove();
    root = fixture(); root.querySelector('.spell').removeAttribute('data-cast-rank');
    const before = root.innerHTML; installSpellSort(root, actorUuid);
    assert(root.innerHTML === before, 'malformed occurrence prevents all DOM mutation');
    return 'DOM checks passed';
  } finally {
    root?.remove();
    if (saved === null) localStorage.removeItem(key); else localStorage.setItem(key, saved);
  }
}
