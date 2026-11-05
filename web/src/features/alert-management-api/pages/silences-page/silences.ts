import { Silence, SilenceStates } from '@openshift-console/dynamic-plugin-sdk';

import { getSilenceName, silenceMatcherEqualitySymbol } from '@/shared/utils/alerts/formatting';

export const silenceColumns = [
  { key: 'name', label: 'Silence name' },
  { key: 'matchers', label: 'Matchers' },
  { key: 'status', label: 'Status' },
  { key: 'startsAt', label: 'Starts' },
  { key: 'endsAt', label: 'Ends' },
  { key: 'createdBy', label: 'Created by' },
] as const;
export type SilenceColumn = (typeof silenceColumns)[number]['key'];
export const defaultSilenceColumns: SilenceColumn[] = silenceColumns.map(({ key }) => key);
export const silenceStates = [SilenceStates.Active, SilenceStates.Pending, SilenceStates.Expired];
export const stateLabels = { active: 'Active', pending: 'Pending', expired: 'Expired' };
export type SilenceFilters = { name: string; state: string[] };
export const defaultSilenceFilters: SilenceFilters = { name: '', state: [] };
export const matcherText = (matcher: Silence['matchers'][number]) => {
  const operator = silenceMatcherEqualitySymbol(matcher.isEqual ?? true, matcher.isRegex);
  return `${matcher.name}${operator}${matcher.value}`;
};

// Literal calls keep table definitions available to the translation extractor.
export const silenceColumnLabel = (column: SilenceColumn, t: (key: string) => string) => {
  switch (column) {
    case 'name':
      return t('Silence name');
    case 'matchers':
      return t('Matchers');
    case 'status':
      return t('Status');
    case 'startsAt':
      return t('Starts');
    case 'endsAt':
      return t('Ends');
    case 'createdBy':
      return t('Created by');
  }
};
export const normalizeSilences = (silences: Silence[]) =>
  silences.map((silence) => {
    const normalized = {
      ...silence,
      matchers: silence.matchers.map((matcher) => ({
        ...matcher,
        isEqual: matcher.isEqual ?? true,
      })),
    };
    return { ...normalized, name: getSilenceName(normalized) };
  });
export function parseSilenceColumns(value: string | null): SilenceColumn[] {
  try {
    const parsed: unknown = JSON.parse(value ?? 'null');
    if (!Array.isArray(parsed)) return defaultSilenceColumns;
    const columns = [...new Set(parsed)].filter((column): column is SilenceColumn =>
      defaultSilenceColumns.includes(column as SilenceColumn),
    );
    return columns.includes('name') ? columns : defaultSilenceColumns;
  } catch {
    return defaultSilenceColumns;
  }
}
export function filterSilences(silences: Silence[], filters: SilenceFilters) {
  const name = filters.name.trim().toLocaleLowerCase();
  return silences.filter(
    (silence) =>
      (silence.name ?? '').toLocaleLowerCase().includes(name) &&
      (!filters.state.length || filters.state.includes(silence.status?.state ?? '')),
  );
}
export function sortSilences(
  silences: Silence[],
  column: SilenceColumn,
  direction: 'asc' | 'desc',
) {
  const value = (silence: Silence): string | number => {
    if (column === 'status') return silence.status?.state ?? '';
    if (column === 'matchers') return silence.matchers.map(matcherText).join(', ');
    if (column === 'startsAt' || column === 'endsAt') return Date.parse(silence[column]) || 0;
    return silence[column] ?? '';
  };
  return [...silences].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const comparison =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right), undefined, { sensitivity: 'base' });
    return (direction === 'asc' ? 1 : -1) * comparison || (a.id ?? '').localeCompare(b.id ?? '');
  });
}
