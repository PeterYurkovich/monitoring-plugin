import { SilenceStates } from '@openshift-console/dynamic-plugin-sdk';

import {
  defaultSilenceColumns,
  filterSilences,
  matcherText,
  normalizeSilences,
  parseSilenceColumns,
  sortSilences,
} from '@/features/alert-management-api/pages/silences-page/silences';
import { makeSilence } from '@/features/alert-management-api/tests/utils/object-factories';

it('normalizes without rules and filters all three backend states and names', () => {
  const silences = normalizeSilences(
    [SilenceStates.Active, SilenceStates.Pending, SilenceStates.Expired].map((state, index) =>
      makeSilence({
        id: String(index),
        matchers: [{ name: 'alertname', value: `Alert${index}`, isRegex: false }],
        status: { state },
      }),
    ),
  );
  expect(
    filterSilences(silences, { name: ' ALERT1 ', state: ['pending'] }).map(({ id }) => id),
  ).toEqual(['1']);
  expect(filterSilences(silences, { name: '', state: [] })).toHaveLength(3);
  expect(filterSilences(silences, { name: 'missing', state: [] })).toHaveLength(0);
  for (const state of [SilenceStates.Active, SilenceStates.Pending, SilenceStates.Expired]) {
    expect(filterSilences(silences, { name: '', state: [state] })).toHaveLength(1);
  }
});

it('normalizes missing equality without mutating API data or trusting backend names', () => {
  const silence = makeSilence({
    name: 'ignored',
    matchers: [{ name: 'alertname', value: 'Alert', isRegex: false }],
  });
  const [normalized] = normalizeSilences([silence]);
  expect(normalized.name).toBe('Alert');
  expect(normalized.matchers[0].isEqual).toBe(true);
  expect(silence.name).toBe('ignored');
  expect(silence.matchers[0].isEqual).toBeUndefined();
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
    makeSilence({ id: '1' }),
    makeSilence({ id: '2', startsAt: '2025-12-31T23:59:00Z' }),
  ];
  expect(
    sortSilences(silences, { column: 'startsAt', direction: 'asc' }).map(({ id }) => id),
  ).toEqual(['2', '1']);
  expect(
    sortSilences(silences, { column: 'startsAt', direction: 'desc' }).map(({ id }) => id),
  ).toEqual(['1', '2']);
  expect(silences[0].id).toBe('1');
});

it.each(['name', 'createdBy', 'status', 'matchers', 'startsAt', 'endsAt'] as const)(
  'sorts %s in both directions',
  (column) => {
    const silences = [
      makeSilence({
        id: 'b',
        name: 'Zulu',
        createdBy: 'zulu',
        status: { state: SilenceStates.Pending },
        startsAt: '2026-01-02T00:00:00Z',
        endsAt: '2026-01-03T00:00:00Z',
        matchers: [{ name: 'alertname', value: 'Zulu', isRegex: false }],
      }),
      makeSilence({
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

it('uses stable IDs as a tie-breaker in either direction', () => {
  const silences = [makeSilence({ id: 'b', name: 'Same' }), makeSilence({ id: 'a', name: 'Same' })];
  for (const direction of ['asc', 'desc'] as const) {
    expect(sortSilences(silences, { column: 'name', direction }).map(({ id }) => id)).toEqual([
      'a',
      'b',
    ]);
  }
});

it.each([null, 'invalid', '{}', '[]', '["status"]', '["name","unknown"]'])(
  'restores default columns for invalid or incomplete input: %s',
  (value) => {
    expect(parseSilenceColumns(value)).toEqual(defaultSilenceColumns);
  },
);

it('preserves valid column order and removes duplicates', () => {
  expect(parseSilenceColumns('["name","name"]')).toEqual(['name']);
  expect(parseSilenceColumns('["status","name"]')).toEqual(['status', 'name']);
});
