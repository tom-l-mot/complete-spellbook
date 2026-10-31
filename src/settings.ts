import { MODULE_ID } from './core.ts';
export const DEFAULT_SOURCES = { pf2e: 'pf2e.spells-srd', sf2e: 'sf2e.spells' };
type SupportedSystem = keyof typeof DEFAULT_SOURCES;
export function isSupportedSystem(value: string): value is SupportedSystem {
  return Object.hasOwn(DEFAULT_SOURCES, value);
}
export const SETTINGS = {
  virtual: { type: Boolean, default: true },
  autoSync: { type: Boolean, default: false },
  legacy: { type: Boolean, default: false },
  uncommon: { type: Boolean, default: false },
  rare: { type: Boolean, default: false },
  presets: { type: Boolean, default: true },
  favorites: { type: Boolean, default: true },
  import: { type: Boolean, default: true },
  sources: { type: String, default: DEFAULT_SOURCES.pf2e },
  cacheMinutes: { type: Number, default: 5, choices: { 0: 'Disabled', 5: '5 minutes', 30: '30 minutes' } },
  debug: { type: Boolean, default: false },
  defaultRarity: { type: String, default: '', scope: 'client', choices: { '': 'All permitted', common: 'Common', uncommon: 'Uncommon', rare: 'Rare' } }
};
export function registerSettings(): void {
  const systemId = game.system.id;
  if (!isSupportedSystem(systemId)) return;
  for (const [key, value] of Object.entries(SETTINGS)) {
    game.settings.register(MODULE_ID, key, { scope: 'world', config: true, name: `CS.Settings.${key}.Name`, hint: `CS.Settings.${key}.Hint`, ...value, ...(key === 'sources' ? { default: DEFAULT_SOURCES[systemId] } : {}) });
  }
  game.settings.register(MODULE_ID, 'grants', { scope: 'world', config: false, type: Array, default: [] });
}
