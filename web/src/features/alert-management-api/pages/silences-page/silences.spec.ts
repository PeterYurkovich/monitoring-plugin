import { Silence, SilenceStates } from '@openshift-console/dynamic-plugin-sdk';

import {
  defaultSilenceColumns,
  filterSilences,
  matcherText,
  normalizeSilences,
  parseSilenceColumns,
  sortSilences,
} from '@/features/alert-management-api/pages/silences-page/silences';

export const makeSilence = (id: string, state = SilenceStates.Active): Silence => ({
  id,
  comment: '',
  createdBy: `user-${id}`,
  startsAt: '2026-01-01T00:00:00Z',
  endsAt: '2026-01-02T00:00:00Z',
  firingAlerts: [],
  matchers: [{ name: 'alertname', value: `Alert${id}`, isRegex: false, isEqual: true }],
  status: { state },
});
it('normalizes without rules and filters all three backend states and names', () => {
  const silences = normalizeSilences([
    makeSilence('1'),
    makeSilence('2', SilenceStates.Pending),
    makeSilence('3', SilenceStates.Expired),
  ]);
  expect(
    filterSilences(silences, { name: ' ALERT2 ', state: ['pending'] }).map(({ id }) => id),
  ).toEqual(['2']);
  expect(filterSilences(silences, { name: '', state: [] })).toHaveLength(3);
  expect(filterSilences(silences, { name: 'missing', state: [] })).toHaveLength(0);
});
it('formats every matcher operator including omitted equality', () => {
  const matcher = { name: 'namespace', value: 'test', isRegex: false };
  expect(matcherText(matcher)).toBe('namespace=test');
  expect(matcherText({ ...matcher, isEqual: false })).toBe('namespace!=test');
  expect(matcherText({ ...matcher, isRegex: true })).toBe('namespace=~test');
  expect(matcherText({ ...matcher, isRegex: true, isEqual: false })).toBe('namespace!~test');
});
it('sorts chronologically without mutating the source and validates columns', () => {
  const silences = [makeSilence('1'), { ...makeSilence('2'), startsAt: '2025-12-31T23:59:00Z' }];
  expect(sortSilences(silences, 'startsAt', 'asc').map(({ id }) => id)).toEqual(['2', '1']);
  expect(sortSilences(silences, 'createdBy', 'desc')[0].id).toBe('2');
  expect(silences[0].id).toBe('1');
  expect(parseSilenceColumns('invalid')).toEqual(defaultSilenceColumns);
  expect(parseSilenceColumns('["status"]')).toEqual(defaultSilenceColumns);
  expect(parseSilenceColumns('["name","name","unknown"]')).toEqual(defaultSilenceColumns);
  expect(parseSilenceColumns('["name","name"]')).toEqual(['name']);
  expect(parseSilenceColumns('["status","name"]')).toEqual(['status', 'name']);
});
