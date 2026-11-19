/** @vitest-environment jsdom */
import { Silence, SilenceStates } from '@openshift-console/dynamic-plugin-sdk';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';

import { SilencesManagementPage } from '@/features/alert-management-api/pages/silences-page/SilencesManagementPage';
import { makeSilence } from '@/features/alert-management-api/tests/utils/object-factories';

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
  return <output data-testid="query">{useLocation().search}</output>;
}
const fixtures = (): Silence[] =>
  Array.from({ length: 5 }, (_, index) =>
    makeSilence({
      id: String(index),
      name: 'ignored backend name',
      matchers: [{ name: 'alertname', value: `Alert${index}`, isEqual: true, isRegex: false }],
      status: { state: index === 1 ? SilenceStates.Pending : SilenceStates.Active },
    }),
  );
const mount = (search = '') =>
  render(
    <MemoryRouter initialEntries={['/silences' + search]}>
      <SilencesManagementPage />
      <History />
    </MemoryRouter>,
  );
const tableNames = () =>
  within(screen.getByRole('table'))
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
it('uses the first valid URL state to match the single-select control', () => {
  mount('?state=invalid&state=pending&state=active');
  expect((screen.getByRole('combobox', { name: 'Silence state' }) as HTMLSelectElement).value).toBe(
    'pending',
  );
  expect(tableNames()).toHaveLength(1);
  expect(tableNames()[0]).toContain('Alert1');
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
  expect(screen.queryByRole('table')).toBeNull();
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

const currentParams = () => new URLSearchParams(screen.getByTestId('query').textContent!);
const checkedRows = () =>
  within(screen.getByRole('table'))
    .getAllByRole('checkbox')
    .filter((checkbox) => (checkbox as HTMLInputElement).checked);

it('preserves refresh and filters when sorting and removes redundant default sort parameters', () => {
  mount('?state=active&refreshInterval=30000&perPage=2&page=2');
  fireEvent.click(screen.getByRole('button', { name: 'Silence name' }));
  expect(currentParams().get('sortDirection')).toBe('desc');
  expect(currentParams().get('page')).toBe('1');
  expect(currentParams().get('state')).toBe('active');
  expect(currentParams().get('refreshInterval')).toBe('30000');
  expect(tableNames()[0]).toContain('Alert4');

  fireEvent.click(screen.getByRole('button', { name: 'Silence name' }));
  expect(currentParams().has('sort')).toBe(false);
  expect(currentParams().has('sortDirection')).toBe(false);
  expect(tableNames()[0]).toContain('Alert0');
});

it.each(['?sort=unknown&sortDirection=sideways', '?columns=["name","status"]&sort=endsAt'])(
  'falls back to the default sort for invalid or hidden columns: %s',
  (search) => {
    mount(search);
    expect(tableNames()[0]).toContain('Alert0');
    expect(
      screen.getByRole('columnheader', { name: 'Silence name' }).getAttribute('aria-sort'),
    ).toBe('ascending');
  },
);

it('removes state chips and clears filters while preserving sorting and refresh settings', () => {
  mount('?state=pending&name=Alert&sort=name&sortDirection=desc&refreshInterval=30000');
  fireEvent.click(screen.getByRole('button', { name: 'Remove filter' }));
  expect(currentParams().has('state')).toBe(false);
  expect(currentParams().get('name')).toBe('Alert');
  expect(tableNames()).toHaveLength(5);

  fireEvent.change(screen.getByRole('combobox', { name: 'Silence state' }), {
    target: { value: 'active' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(currentParams().has('state')).toBe(false);
  expect(currentParams().has('name')).toBe(false);
  expect(currentParams().get('sortDirection')).toBe('desc');
  expect(currentParams().get('refreshInterval')).toBe('30000');
  expect(currentParams().get('page')).toBe('1');
});

it('preserves page selections across pagination and supports deselecting the current page', () => {
  mount('?perPage=2');
  const selectPage = () =>
    screen.getByRole('checkbox', { name: 'Select all silences on this page' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alert0' }));
  expect((selectPage() as HTMLInputElement).indeterminate).toBe(true);
  fireEvent.click(selectPage());
  expect(checkedRows()).toHaveLength(3);

  fireEvent.click(screen.getAllByRole('button', { name: 'Go to next page' })[0]);
  expect(checkedRows()).toHaveLength(0);
  fireEvent.click(selectPage());
  expect(checkedRows()).toHaveLength(3);
  expect(screen.getByRole('button', { name: /Expire selected silences/ }).textContent).toContain(
    '(4)',
  );
  fireEvent.click(selectPage());
  expect(checkedRows()).toHaveLength(0);
  expect(screen.getByRole('button', { name: /Expire selected silences/ }).textContent).toContain(
    '(2)',
  );

  fireEvent.click(screen.getAllByRole('button', { name: 'Go to previous page' })[0]);
  expect(checkedRows()).toHaveLength(3);
});

it('does not restore stale selection when navigating back to an earlier filter', () => {
  mount('?state=active');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alert0' }));
  act(() => navigate('?state=pending'));
  act(() => navigate(-1));
  expect(checkedRows()).toHaveLength(0);
});

it('clears selection when data changes even if its update timestamp is unchanged', () => {
  mount();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alert0' }));
  query.data = fixtures();
  act(() => navigate('?refresh=1'));
  expect(checkedRows()).toHaveLength(0);
});

it('keeps reordered headers, body cells, and sorting aligned without pinning a moved name column', () => {
  mount('?columns=["createdBy","name","status"]');
  expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
    '',
    'Created by',
    'Silence name',
    'Status',
    'Actions',
  ]);
  const row = within(screen.getByRole('table')).getAllByRole('row')[1];
  const cells = within(row).getAllByRole('cell');
  expect(cells[1].textContent).toBe('admin');
  expect(cells[2].textContent).toBe('Alert0');
  expect(cells[3].textContent).toBe('active');
  expect(cells[2].classList.contains('pf-v6-c-table__sticky-cell')).toBe(false);
  expect(
    screen
      .getByRole('columnheader', { name: 'Silence name' })
      .classList.contains('pf-v6-c-table__sticky-cell'),
  ).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Status' }));
  expect(currentParams().get('sort')).toBe('status');
  expect(screen.getByRole('columnheader', { name: 'Status' }).getAttribute('aria-sort')).toBe(
    'ascending',
  );
  expect(tableNames()[4]).toContain('pending');
});

it('saves column visibility, keeps the name required, and resets sorting when hiding its column', () => {
  mount('?sort=createdBy&sortDirection=desc&state=active&refreshInterval=30000');
  fireEvent.click(screen.getByRole('button', { name: 'Manage columns' }));
  const dialog = within(screen.getByRole('dialog'));
  const name = dialog.getByRole('checkbox', { name: 'Silence name' }) as HTMLInputElement;
  expect(name.disabled).toBe(true);
  expect(name.checked).toBe(true);
  fireEvent.click(dialog.getByRole('checkbox', { name: 'Created by' }));
  fireEvent.click(dialog.getByRole('checkbox', { name: 'Matchers' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('columnheader', { name: 'Created by' })).toBeNull();
  expect(screen.queryByRole('columnheader', { name: 'Matchers' })).toBeNull();
  expect(JSON.parse(currentParams().get('columns')!)).toEqual([
    'name',
    'status',
    'startsAt',
    'endsAt',
  ]);
  expect(currentParams().has('sort')).toBe(false);
  expect(currentParams().has('sortDirection')).toBe(false);
  expect(currentParams().get('state')).toBe('active');
  expect(currentParams().get('refreshInterval')).toBe('30000');
});

it('provides a focusable scroll region and matching sticky name and selection cells', () => {
  const name = 'LongSilenceNameThatMustRemainOnASingleLine';
  query.data = [
    makeSilence({ matchers: [{ name: 'alertname', value: name, isEqual: true, isRegex: false }] }),
  ];
  mount();
  const region = screen.getByRole('region', { name: 'Silences table scroll area' });
  expect(region.tabIndex).toBe(0);
  const table = within(region).getByRole('table');
  expect(table.classList.contains('pf-m-grid-md')).toBe(false);
  const nameHeader = screen.getByRole('columnheader', { name: 'Silence name' });
  const nameCell = screen.getByText(name).closest('td')!;
  for (const cell of [nameHeader, nameCell]) {
    expect(cell.classList.contains('pf-v6-c-table__sticky-cell')).toBe(true);
    expect(cell.classList.contains('pf-m-nowrap')).toBe(true);
    expect(cell.style.getPropertyValue('--pf-v6-c-table__sticky-cell--InsetInlineStart')).toBe(
      '2rem',
    );
  }
  const selectionHeader = screen
    .getByRole('checkbox', { name: 'Select all silences on this page' })
    .closest('th')!;
  const selectionCell = screen.getByRole('checkbox', { name: `Select ${name}` }).closest('td')!;
  for (const cell of [selectionHeader, selectionCell]) {
    expect(cell.classList.contains('pf-v6-c-table__sticky-cell')).toBe(true);
    expect(cell.style.getPropertyValue('--pf-v6-c-table__sticky-cell--InsetInlineStart')).toBe('0');
  }
});
