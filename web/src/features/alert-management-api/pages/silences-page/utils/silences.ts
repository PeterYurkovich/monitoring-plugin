import { Silence, SilenceStates } from '@openshift-console/dynamic-plugin-sdk';
import type { TFunction } from 'i18next';

import type {
  AlertFilterOption,
  ManagedSilence,
  TableSort,
} from '@/features/alert-management-api/types/types';
import { parseTableColumns } from '@/features/alert-management-api/utils/table-columns';
import { getSilenceName, silenceMatcherEqualitySymbol } from '@/shared/utils/alerts/formatting';

export const silenceColumns = [
  { key: 'name', label: 'Silence name' },
  { key: 'matchers', label: 'Matchers' },
  { key: 'state', label: 'State' },
  { key: 'firingAlerts', label: 'Firing alerts' },
  { key: 'startsAt', label: 'Starts' },
  { key: 'endsAt', label: 'Ends' },
  { key: 'createdBy', label: 'Created by' },
] as const;

export type SilenceColumn = (typeof silenceColumns)[number]['key'];
export type SilenceSort = TableSort<SilenceColumn>;

export const defaultSilenceSort: SilenceSort = { column: 'name', direction: 'asc' };
export const defaultSilenceColumns: SilenceColumn[] = [
  'name',
  'matchers',
  'firingAlerts',
  'state',
  'createdBy',
];
export const requiredSilenceColumns: SilenceColumn[] = ['name'];
export const silenceStates = [SilenceStates.Active, SilenceStates.Pending, SilenceStates.Expired];

export type SilenceFilters = {
  name: string;
  namespace: string[];
  labels: string[];
  scope: string[];
  state: string[];
};
export const emptySilenceFilters: SilenceFilters = {
  name: '',
  namespace: [],
  labels: [],
  scope: [],
  state: [],
};
export const defaultSilenceFilters: SilenceFilters = {
  ...emptySilenceFilters,
  state: [SilenceStates.Active, SilenceStates.Pending],
};
export const silenceFilterKeys = ['namespace', 'labels', 'scope', 'state'] as const;
export type SilenceFilterKey = (typeof silenceFilterKeys)[number];
export const silenceFilterLabels: Record<SilenceFilterKey, string> = {
  namespace: 'Namespace',
  labels: 'Silence labels',
  scope: 'Silence scope',
  state: 'State',
};

export const matcherText = (matcher: Silence['matchers'][number]) => {
  const operator = silenceMatcherEqualitySymbol(matcher.isEqual ?? true, matcher.isRegex);
  return `${matcher.name}${operator}${matcher.value}`;
};

export const silenceColumnLabel = (column: SilenceColumn, t: TFunction) => {
  switch (column) {
    case 'name':
      return t('Silence name');
    case 'matchers':
      return t('Matchers');
    case 'state':
      return t('State');
    case 'firingAlerts':
      return t('Firing alerts');
    case 'startsAt':
      return t('Starts');
    case 'endsAt':
      return t('Ends');
    case 'createdBy':
      return t('Created by');
  }
};

export const silenceStateLabel = (state: string, t: TFunction) => {
  switch (state) {
    case SilenceStates.Active:
      return t('Active');
    case SilenceStates.Pending:
      return t('Pending');
    case SilenceStates.Expired:
      return t('Expired');
    default:
      return state;
  }
};

export function toManagedSilence(silence: Silence): ManagedSilence {
  const normalized = {
    ...silence,
    matchers: silence.matchers.map((matcher) => ({
      ...matcher,
      isEqual: matcher.isEqual ?? true,
    })),
  };
  return {
    ...normalized,
    name: getSilenceName(normalized),
    firingAlerts: silence.firingAlerts ?? [],
  };
}

export function parseSilenceColumns(value: string | null): SilenceColumn[] {
  return parseTableColumns(value, silenceColumns, defaultSilenceColumns, requiredSilenceColumns);
}

export function getSilenceFilterValues(silence: ManagedSilence, key: SilenceFilterKey): string[] {
  const namespaceMatchers = silence.matchers.filter(({ name }) => name === 'namespace');
  switch (key) {
    case 'namespace':
      return namespaceMatchers.map(({ value }) => value);
    case 'labels':
      return silence.matchers.map(matcherText);
    case 'scope':
      return [namespaceMatchers.length > 0 ? 'Namespace' : 'Cluster'];
    case 'state':
      return silence.status?.state ? [silence.status.state] : [];
  }
}

export function getSilenceFilterOptions(
  silences: ManagedSilence[],
  t: TFunction,
): Record<SilenceFilterKey, AlertFilterOption[]> {
  return Object.fromEntries(
    silenceFilterKeys.map((key) => {
      const counts = new Map<string, number>();
      silences.forEach((silence) => {
        const silenceFilterValues = getSilenceFilterValues(silence, key);
        new Set(silenceFilterValues).forEach((value) => {
          if (value) {
            const currentCount = counts.get(value) ?? 0;
            counts.set(value, currentCount + 1);
          }
        });
      });
      const values =
        key === 'state' ? silenceStates : [...counts.keys()].sort((a, b) => a.localeCompare(b));
      return [
        key,
        values.map((value) => ({
          value,
          label: key === 'state' ? silenceStateLabel(value, t) : value,
          count: counts.get(value) ?? 0,
        })),
      ];
    }),
  ) as Record<SilenceFilterKey, AlertFilterOption[]>;
}

export function filterSilences(silences: ManagedSilence[], filters: SilenceFilters) {
  const name = filters.name.trim().toLocaleLowerCase();
  return silences.filter((silence) => {
    if (!silence.name.toLocaleLowerCase().includes(name)) {
      return false;
    }
    return silenceFilterKeys.every((key) => {
      if (filters[key].length === 0) {
        return true;
      }
      const values = getSilenceFilterValues(silence, key);
      if (key === 'labels') {
        return filters.labels.every((label) => values.includes(label));
      }
      return filters[key].some((value) => values.includes(value));
    });
  });
}

export function sortSilences(
  silences: ManagedSilence[],
  { column, direction }: SilenceSort,
): ManagedSilence[] {
  return [...silences].sort((a, b) => {
    let comparison: number;
    switch (column) {
      case 'state':
        comparison = (a.status?.state ?? '').localeCompare(b.status?.state ?? '');
        break;
      case 'firingAlerts':
        comparison = (a.firingAlerts?.length ?? 0) - (b.firingAlerts?.length ?? 0);
        break;
      case 'matchers':
        comparison = a.matchers
          .map(matcherText)
          .join(', ')
          .localeCompare(b.matchers.map(matcherText).join(', '));
        break;
      case 'startsAt':
      case 'endsAt':
        comparison = (Date.parse(a[column]) || 0) - (Date.parse(b[column]) || 0);
        break;
      default:
        comparison = (a[column] ?? '').localeCompare(b[column] ?? '');
    }

    // Fall back to name and then ID when the selected column values match.
    comparison =
      comparison || a.name.localeCompare(b.name) || (a.id ?? '').localeCompare(b.id ?? '');

    return comparison * (direction === 'asc' ? 1 : -1);
  });
}
