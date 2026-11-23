import { SilenceStates } from '@openshift-console/dynamic-plugin-sdk';
import type { TFunction } from 'i18next';

import {
  defaultSilenceColumns,
  defaultSilenceFilters,
  filterSilences,
  getSilenceFilterOptions,
  getSilenceFilterValues,
  matcherText,
  parseSilenceColumns,
  sortSilences,
  toManagedSilence,
} from '@/features/alert-management-api/pages/silences-page/utils/silences';
import {
  makeAlert,
  makeManagedSilence,
  makeSilence,
} from '@/features/alert-management-api/tests/utils/object-factories';

it('filters managed silences by name and all three backend states', () => {
  const silences = [SilenceStates.Active, SilenceStates.Pending, SilenceStates.Expired].map(
    (state, index) =>
      makeManagedSilence({
        id: String(index),
        matchers: [{ name: 'alertname', value: `Alert${index}`, isRegex: false }],
        status: { state },
      }),
  );
  expect(
    filterSilences(silences, {
      ...defaultSilenceFilters,
      name: ' ALERT1 ',
      state: ['pending'],
    }).map(({ id }) => id),
  ).toEqual(['1']);
  const defaultStates = filterSilences(silences, defaultSilenceFilters).map(
    ({ status }) => status.state,
  );
  expect(defaultStates).toEqual([SilenceStates.Active, SilenceStates.Pending]);
  expect(filterSilences(silences, { ...defaultSilenceFilters, state: [] })).toHaveLength(3);
  expect(filterSilences(silences, { ...defaultSilenceFilters, name: 'missing' })).toHaveLength(0);
  for (const state of [SilenceStates.Active, SilenceStates.Pending, SilenceStates.Expired]) {
    expect(filterSilences(silences, { ...defaultSilenceFilters, state: [state] })).toHaveLength(1);
  }
});

it('filters namespaces and states with OR, labels with AND, and combines filter categories', () => {
  const silences = [
    makeManagedSilence({
      id: 'a',
      name: 'Alpha',
      matchers: [
        { name: 'namespace', value: 'payments', isRegex: false },
        { name: 'team', value: 'sre', isRegex: false },
        { name: 'env', value: 'dev', isRegex: false, isEqual: false },
      ],
    }),
    makeManagedSilence({
      id: 'b',
      name: 'Beta',
      status: { state: SilenceStates.Pending },
      matchers: [
        { name: 'namespace', value: 'logging', isRegex: false },
        { name: 'team', value: 'sre', isRegex: false },
      ],
    }),
    makeManagedSilence({ id: 'c', name: 'Cluster', matchers: [] }),
  ];
  const ids = (filters: Partial<typeof defaultSilenceFilters>) =>
    filterSilences(silences, { ...defaultSilenceFilters, ...filters }).map(({ id }) => id);
  expect(ids({ namespace: ['payments', 'logging'] })).toEqual(['a', 'b']);
  expect(ids({ state: ['active', 'pending'] })).toEqual(['a', 'b', 'c']);
  expect(ids({ labels: ['team=sre', 'env!=dev'] })).toEqual(['a']);
  expect(ids({ scope: ['Cluster'] })).toEqual(['c']);
  expect(ids({ scope: ['Namespace'] })).toEqual(['a', 'b']);
  expect(ids({ namespace: ['payments'], state: ['pending'] })).toEqual([]);
  expect(
    ids({
      namespace: ['payments'],
      labels: ['team=sre'],
      scope: ['Namespace'],
      state: ['active'],
      name: 'ALP',
    }),
  ).toEqual(['a']);
});

it.each([
  { value: 'payments', isRegex: false, isEqual: true },
  { value: 'prod.*', isRegex: true, isEqual: true },
  { value: 'dev', isRegex: false, isEqual: false },
  { value: 'test.*', isRegex: true, isEqual: false },
])('treats any namespace matcher as namespace scoped: %j', (matcher) => {
  const silence = makeManagedSilence({ matchers: [{ name: 'namespace', ...matcher }] });
  expect(getSilenceFilterValues(silence, 'scope')).toEqual(['Namespace']);
  expect(getSilenceFilterValues(silence, 'namespace')).toEqual([matcher.value]);
});

it('counts each silence once per option and preserves label matcher operators', () => {
  const options = getSilenceFilterOptions(
    [
      makeManagedSilence({
        matchers: [
          { name: 'namespace', value: 'payments', isRegex: false },
          { name: 'namespace', value: 'payments', isRegex: false },
          { name: 'env', value: 'prod.*', isRegex: true, isEqual: false },
        ],
      }),
      makeManagedSilence({ matchers: [{ name: 'namespace', value: 'logging', isRegex: false }] }),
      makeManagedSilence({ matchers: [] }),
    ],
    ((key: string) => `translated:${key}`) as TFunction,
  );
  expect(options.namespace).toEqual([
    { value: 'logging', label: 'logging', count: 1 },
    { value: 'payments', label: 'payments', count: 1 },
  ]);
  expect(options.labels).toContainEqual({ value: 'env!~prod.*', label: 'env!~prod.*', count: 1 });
  expect(options.scope).toContainEqual({ value: 'Namespace', label: 'Namespace', count: 2 });
  expect(options.state).toEqual([
    { value: 'active', label: 'translated:Active', count: 3 },
    { value: 'pending', label: 'translated:Pending', count: 0 },
    { value: 'expired', label: 'translated:Expired', count: 0 },
  ]);
});

it('normalizes missing equality without mutating API data or trusting backend names', () => {
  const silence = makeSilence({
    name: 'ignored',
    matchers: [{ name: 'alertname', value: 'Alert', isRegex: false }],
  });
  const managed = toManagedSilence(silence);
  expect(managed.name).toBe('Alert');
  expect(managed.matchers[0].isEqual).toBe(true);
  expect(silence.name).toBe('ignored');
  expect(silence.matchers[0].isEqual).toBeUndefined();
});

it.each([
  { matchers: [], name: '' },
  {
    matchers: [{ name: 'namespace', value: 'payments', isRegex: false }],
    name: 'namespace=payments',
  },
])('derives a name without an alertname matcher: $name', ({ matchers, name }) => {
  const silence = makeSilence({ matchers });
  expect(silence.name).toBeUndefined();
  expect(toManagedSilence(silence).name).toBe(name);
});

it.each([undefined, null])('normalizes missing firing alerts (%j) to an array', (firingAlerts) => {
  const silence = makeSilence({ firingAlerts });
  expect(toManagedSilence(silence).firingAlerts).toEqual([]);
  expect(silence.firingAlerts).toBe(firingAlerts);
});

it('formats every matcher operator including omitted equality', () => {
  const matcher = { name: 'namespace', value: 'test', isRegex: false };
  expect(matcherText(matcher)).toBe('namespace=test');
  expect(matcherText({ ...matcher, isEqual: false })).toBe('namespace!=test');
  expect(matcherText({ ...matcher, isRegex: true })).toBe('namespace=~test');
  expect(matcherText({ ...matcher, isRegex: true, isEqual: false })).toBe('namespace!~test');
});

it('sorts chronologically without mutating the source', () => {
  const silences = [
    makeManagedSilence({ id: '1' }),
    makeManagedSilence({ id: '2', startsAt: '2025-12-31T23:59:00Z' }),
  ];
  expect(
    sortSilences(silences, { column: 'startsAt', direction: 'asc' }).map(({ id }) => id),
  ).toEqual(['2', '1']);
  expect(
    sortSilences(silences, { column: 'startsAt', direction: 'desc' }).map(({ id }) => id),
  ).toEqual(['1', '2']);
  expect(silences[0].id).toBe('1');
});

it.each(['name', 'createdBy', 'state', 'matchers', 'startsAt', 'endsAt'] as const)(
  'sorts %s in both directions',
  (column) => {
    const silences = [
      makeManagedSilence({
        id: 'b',
        name: 'Zulu',
        createdBy: 'zulu',
        status: { state: SilenceStates.Pending },
        startsAt: '2026-01-02T00:00:00Z',
        endsAt: '2026-01-03T00:00:00Z',
        matchers: [{ name: 'alertname', value: 'Zulu', isRegex: false }],
      }),
      makeManagedSilence({
        id: 'a',
        name: 'Alpha',
        createdBy: 'alpha',
        status: { state: SilenceStates.Active },
        matchers: [{ name: 'alertname', value: 'Alpha', isRegex: false }],
      }),
    ];
    expect(sortSilences(silences, { column, direction: 'asc' }).map(({ id }) => id)).toEqual([
      'a',
      'b',
    ]);
    expect(sortSilences(silences, { column, direction: 'desc' }).map(({ id }) => id)).toEqual([
      'b',
      'a',
    ]);
  },
);

it.each([
  { direction: 'asc' as const, expected: ['b', 'z', 'a'] },
  { direction: 'desc' as const, expected: ['a', 'z', 'b'] },
])('uses name and then ID as tie-breakers in $direction order', ({ direction, expected }) => {
  const silences = [
    makeManagedSilence({ id: 'z', name: 'Alpha' }),
    makeManagedSilence({ id: 'a', name: 'Zulu' }),
    makeManagedSilence({ id: 'b', name: 'Alpha' }),
  ];
  for (const column of ['name', 'state', 'firingAlerts'] as const) {
    expect(sortSilences(silences, { column, direction }).map(({ id }) => id)).toEqual(expected);
  }
});

it.each([null, 'invalid', '{}', '[]', '["state"]', '["name","unknown"]'])(
  'restores default columns for invalid or incomplete input: %s',
  (value) => {
    expect(parseSilenceColumns(value)).toEqual(defaultSilenceColumns);
  },
);

it('defaults to Firing alerts before State with Starts and Ends hidden but selectable', () => {
  expect(defaultSilenceColumns).toEqual(['name', 'matchers', 'firingAlerts', 'state', 'createdBy']);
  expect(parseSilenceColumns('["name","startsAt","endsAt"]')).toEqual([
    'name',
    'startsAt',
    'endsAt',
  ]);
});

it('preserves the combined hook firing alerts without matching them again', () => {
  const alerts = [makeAlert({ labels: { alertname: 'AnotherAlert' } })];
  const silence = makeSilence({ firingAlerts: alerts });
  const original = structuredClone(silence);

  const managed = toManagedSilence(silence);

  expect(managed.firingAlerts).toBe(alerts);
  expect(silence).toEqual(original);
  expect(toManagedSilence(makeSilence({ firingAlerts: undefined })).firingAlerts).toEqual([]);
});

it('sorts Firing alerts numerically, including empty arrays', () => {
  const alerts = Array.from({ length: 10 }, () => makeAlert());
  const silences = [
    makeManagedSilence({ id: 'ten', firingAlerts: alerts }),
    makeManagedSilence({ id: 'two', firingAlerts: alerts.slice(0, 2) }),
    makeManagedSilence({ id: 'none', firingAlerts: [] }),
  ];
  expect(
    sortSilences(silences, { column: 'firingAlerts', direction: 'asc' }).map(({ id }) => id),
  ).toEqual(['none', 'two', 'ten']);
  expect(
    sortSilences(silences, { column: 'firingAlerts', direction: 'desc' }).map(({ id }) => id),
  ).toEqual(['ten', 'two', 'none']);
});

it('preserves valid column order and removes duplicates', () => {
  expect(parseSilenceColumns('["name","name"]')).toEqual(['name']);
  expect(parseSilenceColumns('["state","name"]')).toEqual(['state', 'name']);
});
