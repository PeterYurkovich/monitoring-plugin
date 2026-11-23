/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react';

import { SilencesFilterPanel } from '@/features/alert-management-api/pages/silences-page/components/SilencesFilterPanel';
import { defaultSilenceFilters } from '@/features/alert-management-api/pages/silences-page/utils/silences';
import { makeManagedSilence } from '@/features/alert-management-api/tests/utils/object-factories';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values?.[name] ?? name),
  }),
}));

it('changes silence scope without replacing other filters and provides silence-specific help', async () => {
  const onChange = vi.fn();
  const filters = { ...defaultSilenceFilters, namespace: ['payments'] };
  render(
    <SilencesFilterPanel silences={[]} filters={filters} onChange={onChange} onClose={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Namespace' }));
  expect(onChange).toHaveBeenCalledWith({ ...filters, scope: ['Namespace'] });
  fireEvent.mouseEnter(screen.getByRole('button', { name: 'Help for Silence scope' }));
  expect((await screen.findByRole('tooltip')).textContent).toBe('Silence scope tooltip');
  expect(screen.queryByText('Alert scope')).toBeNull();
});

it('keeps states selectable with no silences and supports multiple selected states', async () => {
  const onChange = vi.fn();
  const filters = { ...defaultSilenceFilters, state: ['active'] };
  render(
    <SilencesFilterPanel silences={[]} filters={filters} onChange={onChange} onClose={vi.fn()} />,
  );
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Active' })));
  for (const state of ['Active', 'Pending', 'Expired']) {
    expect(screen.getByRole('checkbox', { name: `${state} (0)` })).toBeDefined();
  }
  fireEvent.click(screen.getByRole('checkbox', { name: 'Pending (0)' }));
  expect(onChange).toHaveBeenCalledWith({ ...filters, state: ['active', 'pending'] });
});

it('searches silence matcher expressions without changing their operators', async () => {
  const onChange = vi.fn();
  render(
    <SilencesFilterPanel
      silences={[
        makeManagedSilence({
          matchers: [{ name: 'namespace', value: 'prod.*', isRegex: true, isEqual: false }],
        }),
      ]}
      filters={defaultSilenceFilters}
      onChange={onChange}
      onClose={vi.fn()}
    />,
  );
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Select labels' })));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search silence labels' }), {
    target: { value: 'NAMESPACE!~' },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: 'namespace!~prod.* (1)' }));
  expect(onChange).toHaveBeenCalledWith({
    ...defaultSilenceFilters,
    labels: ['namespace!~prod.*'],
  });
});

it('clears all filters and closes the sidebar through callbacks', () => {
  const onChange = vi.fn();
  const onClose = vi.fn();
  render(
    <SilencesFilterPanel
      silences={[]}
      filters={{
        name: 'Example',
        namespace: ['payments'],
        labels: ['team=sre'],
        scope: ['Namespace'],
        state: ['active', 'pending'],
      }}
      onChange={onChange}
      onClose={onClose}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
  expect(onChange).toHaveBeenCalledWith({
    name: '',
    namespace: [],
    labels: [],
    scope: [],
    state: [],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
