import type { Entry } from './core.ts';

export type Recognition =
  | { kind: 'native'; reason: 'NativeNotice' | 'SpecialEntry' }
  | { kind: 'review'; reason: 'UnclearEntry' }
  | { kind: 'automatic'; fullTradition: boolean; allowedRanks: number[]; reviewRanks: number[]; reason: 'Ready' | 'SpecialRanks' };

const classes: Record<string, { tradition: string; full: boolean }> = {
  cleric: { tradition: 'divine', full: true }, druid: { tradition: 'primal', full: true },
  animist: { tradition: 'divine', full: true }, wizard: { tradition: 'arcane', full: false },
  witch: { tradition: '', full: false }, magus: { tradition: 'arcane', full: false }
};

export function recognize(entry: Entry, entries: Entry[], classSlug: string, features: string[], ambiguous: boolean, special: boolean): Recognition {
  if (entry.category !== 'prepared') return { kind: 'native', reason: 'NativeNotice' };
  if (special) return { kind: 'native', reason: 'SpecialEntry' };
  const rule = classes[classSlug];
  const candidates = entries.filter(e => e.category === 'prepared' && (!rule?.tradition || e.tradition === rule.tradition) && e.slots.some(s => s.rank === 0 && s.max > 0));
  if (!rule || ambiguous || !['arcane', 'divine', 'occult', 'primal'].includes(entry.tradition) || candidates.length !== 1 || candidates[0]?.id !== entry.id) {
    return { kind: 'review', reason: 'UnclearEntry' };
  }
  if (entry.slots.some(s => s.max > 0 && s.prepared.length !== s.max)) return { kind: 'review', reason: 'UnclearEntry' };
  // PF2e has no per-slot restriction marker; counts cannot prove a font or curriculum rank is ordinary.
  const uncertainWizard = classSlug === 'wizard' && !features.includes('school-of-unified-magical-theory');
  const uncertainRanked = classSlug === 'cleric' || (classSlug === 'magus' && features.includes('studious-spells'));
  const ranks = entry.slots.filter(s => s.max > 0 && s.prepared.length === s.max).map(s => s.rank);
  const allowedRanks = ranks.filter(rank => !uncertainWizard && (rank === 0 || (!entry.flexible && !uncertainRanked)));
  const reviewRanks = ranks.filter(rank => (!entry.flexible || rank === 0) && !allowedRanks.includes(rank));
  return { kind: 'automatic', fullTradition: rule.full, allowedRanks, reviewRanks, reason: reviewRanks.length ? 'SpecialRanks' : 'Ready' };
}
