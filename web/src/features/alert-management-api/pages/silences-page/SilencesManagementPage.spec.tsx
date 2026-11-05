/** @vitest-environment jsdom */
import { Silence, SilenceStates } from '@openshift-console/dynamic-plugin-sdk';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';

import { SilencesManagementPage } from '@/features/alert-management-api/pages/silences-page/SilencesManagementPage';

const query = vi.hoisted(() => ({
  data: undefined as Silence[] | undefined,
  isLoading: false,
  isError: false,
  error: null as Error | null,
  dataUpdatedAt: 0,
}));
vi.mock('@/features/alert-management-api/hooks/useSilencesQuery', () => ({
  useSilencesQuery: () => query,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      key.replace(/\{\{(\w+)\}\}/g, (_, name) => values?.[name] ?? name),
  }),
}));
vi.mock('@/shared/components/SilenceState', () => ({
  SilenceState: ({ silence }: { silence: Silence }) => <span>{silence.status?.state}</span>,
}));
let navigate: ReturnType<typeof useNavigate>;
function History() {
  const nextNavigate = useNavigate();
  useEffect(() => {
    navigate = nextNavigate;
  }, [nextNavigate]);
  return <output>{useLocation().search}</output>;
}
const fixtures = (): Silence[] =>
  Array.from({ length: 5 }, (_, index) => ({
    id: String(index),
    name: 'ignored backend name',
    comment: '',
    createdBy: 'admin',
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: '2026-01-02T00:00:00Z',
    firingAlerts: [],
    matchers: [{ name: 'alertname', value: `Alert${index}`, isEqual: true, isRegex: false }],
    status: { state: index === 1 ? SilenceStates.Pending : SilenceStates.Active },
  }));
const mount = (search = '') =>
  render(
    <MemoryRouter initialEntries={['/silences' + search]}>
      <SilencesManagementPage />
      <History />
    </MemoryRouter>,
  );
const tableNames = () =>
  within(screen.getByRole('grid'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent);
beforeEach(() => {
  query.data = fixtures();
  query.isLoading = false;
  query.isError = false;
  query.error = null;
  query.dataUpdatedAt = 0;
});
it('loads silences despite unavailable rules, restores pagination/sort and has no detail links', () => {
  mount('?perPage=2&page=2&sort=name&sortDirection=desc');
  expect(tableNames()[0]).toContain('Alert2');
  expect(tableNames()[1]).toContain('Alert1');
  expect(screen.queryByRole('link', { name: 'Alert2' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Create silence' }).getAttribute('aria-disabled')).toBe(
    'true',
  );
});
it('filters pending and name, resets page and selection, and supports browser history', () => {
  mount('?perPage=2&page=2');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alert2' }));
  expect(screen.getByRole('button', { name: /Expire selected silences/ }).textContent).toContain(
    '(1)',
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Silence state' }), {
    target: { value: 'pending' },
  });
  expect(tableNames()).toHaveLength(1);
  expect(tableNames()[0]).toContain('Alert1');
  expect(screen.getByRole('button', { name: /Expire selected silences/ }).textContent).toContain(
    '(0)',
  );
  act(() => navigate(-1));
  expect(tableNames()[0]).toContain('Alert2');
  fireEvent.change(screen.getByRole('textbox', { name: 'Search by silence name' }), {
    target: { value: 'alert0' },
  });
  expect(tableNames()).toHaveLength(1);
  expect(tableNames()[0]).toContain('Alert0');
});
it('sorts with URL controls and clears selection on refreshed data', () => {
  mount('?perPage=2');
  fireEvent.click(screen.getByRole('button', { name: 'Silence name' }));
  expect(tableNames()[0]).toContain('Alert4');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all silences on this page' }));
  expect(screen.getByRole('button', { name: /Expire selected silences/ }).textContent).toContain(
    '(2)',
  );
  query.dataUpdatedAt++;
  act(() => navigate('?perPage=2&sort=name&sortDirection=desc&refresh=1'));
  expect(screen.getByRole('button', { name: /Expire selected silences/ }).textContent).toContain(
    '(0)',
  );
});
it('renders initial error and loading without requiring rules', () => {
  query.data = undefined;
  query.isError = true;
  query.error = new Error('silences unavailable');
  const view = mount();
  expect(screen.getByText('silences unavailable')).toBeDefined();
  query.isError = false;
  query.isLoading = true;
  view.rerender(
    <MemoryRouter>
      <SilencesManagementPage />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('grid')).toBeNull();
});
it('keeps stale data visible with a refresh warning and handles empty data', () => {
  query.isError = true;
  query.error = new Error('refresh failed');
  mount();
  expect(screen.getByText('Silences could not be refreshed')).toBeDefined();
  expect(tableNames()).toHaveLength(5);
});
it('restores visible columns and keeps row mutations disabled', () => {
  mount('?columns=%5B%22name%22%2C%22status%22%5D');
  expect(screen.queryByRole('columnheader', { name: 'Matchers' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Alert0' }));
  expect(screen.getByRole('menuitem', { name: 'Edit silence' }).getAttribute('aria-disabled')).toBe(
    'true',
  );
  expect(
    screen.getByRole('menuitem', { name: 'Expire silence' }).getAttribute('aria-disabled'),
  ).toBe('true');
});
it('shows empty state and clamps a stale page', () => {
  query.data = [];
  mount('?page=9');
  expect(screen.getByText('No silences found')).toBeDefined();
  expect(screen.getByText('?page=1&perPage=20')).toBeDefined();
});
