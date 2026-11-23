/** @vitest-environment jsdom */
import { Silence, SilenceStates } from '@openshift-console/dynamic-plugin-sdk';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useMemo } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';

import { SilencesManagementPage } from '@/features/alert-management-api/pages/silences-page/SilencesManagementPage';
import {
  makeAlert,
  makeSilence,
} from '@/features/alert-management-api/tests/utils/object-factories';

const query = vi.hoisted(() => ({
  data: undefined as Silence[] | undefined,
  isLoading: false,
  isError: false,
  error: null as Error | null,
  dataUpdatedAt: 0,
}));

const managementQueries = vi.hoisted(() => ({
  rules: {
    data: {} as object | undefined,
    isLoading: false,
    isError: false,
    error: null as Error | null,
    dataUpdatedAt: 0,
  },
  alerts: {
    data: {} as object | undefined,
    isLoading: false,
    isError: false,
    error: null as Error | null,
    dataUpdatedAt: 0,
  },
}));
vi.mock('@/features/alert-management-api/hooks/useAlertManagementData', () => ({
  useAlertManagementData: () => {
    const { data: silences } = query;
    const { data: rules } = managementQueries.rules;
    const { data: alerts } = managementQueries.alerts;
    const data = useMemo(
      () => (rules && alerts && silences ? { rules: [], alerts: [], silences } : undefined),
      [silences, rules, alerts],
    );
    return {
      data,
      rulesQuery: managementQueries.rules,
      alertsQuery: managementQueries.alerts,
      silencesQuery: query,
    };
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      key.replace(/\{\{(\w+)\}\}/g, (_, name) => values?.[name] ?? name),
  }),
}));

vi.mock('@/shared/components/SilenceStateWithTimestamp', () => ({
  SilenceStateWithTimestamp: ({ silence }: { silence: Silence }) => (
    <span>{silence.status?.state}</span>
  ),
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
  for (const endpoint of Object.values(managementQueries)) {
    Object.assign(endpoint, {
      data: {},
      isLoading: false,
      isError: false,
      error: null,
      dataUpdatedAt: 0,
    });
  }
  query.isLoading = false;
  query.isError = false;
  query.error = null;
  query.dataUpdatedAt = 0;
});

describe('default silence states', () => {
  beforeEach(() => {
    query.data = [
      ...fixtures(),
      makeSilence({
        id: 'expired',
        matchers: [{ name: 'alertname', value: 'ExpiredAlert', isRegex: false }],
        status: { state: SilenceStates.Expired },
      }),
    ];
  });

  it('shows only active and pending silences by default and selects both state filters', async () => {
    mount();
    expect(tableNames()).toHaveLength(5);
    expect(screen.queryByText('ExpiredAlert')).toBeNull();
    openFilters();
    const panel = within(document.getElementById('silence-filters')!);
    await act(async () => fireEvent.click(panel.getByRole('button', { name: 'State (2)' })));
    for (const label of ['Active (4)', 'Pending (1)']) {
      expect((screen.getByRole('checkbox', { name: label }) as HTMLInputElement).checked).toBe(
        true,
      );
    }
    expect(
      (screen.getByRole('checkbox', { name: 'Expired (1)' }) as HTMLInputElement).checked,
    ).toBe(false);
  });

  it.each([
    { search: '?state=expired', count: 1 },
    { search: '?state=', count: 6 },
  ])('honors explicit URL state filters: $search', ({ search, count }) => {
    mount(search);
    expect(tableNames()).toHaveLength(count);
    expect(screen.getByText('ExpiredAlert')).toBeDefined();
  });

  it('preserves an all-states choice across filter changes and browser history', () => {
    mount();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove filter' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter' }));
    expect(tableNames()).toHaveLength(6);
    expect(currentParams().getAll('state')).toEqual(['']);

    act(() => navigate(-1));
    expect(tableNames()).toHaveLength(1);
    expect(tableNames()[0]).toContain('Alert1');
    act(() => navigate(1));
    expect(tableNames()).toHaveLength(6);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search by silence name' }), {
      target: { value: 'Alert' },
    });
    expect(tableNames()).toHaveLength(6);
    expect(currentParams().getAll('state')).toEqual(['']);
  });

  it.each(['Clear filters', 'Clear all filters'])(
    'shows all silence states after clicking %s',
    (buttonName) => {
      mount('?state=expired&name=Expired&refreshInterval=30000');
      if (buttonName === 'Clear all filters') {
        openFilters();
      }
      fireEvent.click(screen.getByRole('button', { name: buttonName }));
      expect(tableNames()).toHaveLength(6);
      expect(screen.getByText('ExpiredAlert')).toBeDefined();
      expect(currentParams().getAll('state')).toEqual(['']);
      expect(currentParams().has('name')).toBe(false);
      expect(currentParams().get('refreshInterval')).toBe('30000');
      expect(screen.queryByRole('button', { name: 'Remove filter' })).toBeNull();

      act(() => navigate(-1));
      expect(tableNames()).toHaveLength(1);
      expect(currentParams().getAll('state')).toEqual(['expired']);
    },
  );
});

it('restores pagination/sort and has no detail links', () => {
  mount('?perPage=2&page=2&sort=name&sortDirection=desc');
  expect(tableNames()[0]).toContain('Alert2');
  expect(tableNames()[1]).toContain('Alert1');
  expect(screen.queryByRole('link', { name: 'Alert2' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Create silence' }).getAttribute('aria-disabled')).toBe(
    'true',
  );
});

it('shows the bulk expire action beside table controls only when silences are selected', () => {
  mount();
  expect(screen.queryByRole('button', { name: /Expire selected silences/ })).toBeNull();

  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alert0' }));
  const tableControls = within(
    screen.getByRole('button', { name: 'Manage columns' }).closest<HTMLElement>('.pf-v6-l-flex')!,
  );
  const expireButton = tableControls.getByRole('button', { name: 'Expire selected silences (1)' });
  expect(expireButton.getAttribute('aria-disabled')).toBe('true');
  const filterToolbar = within(
    screen
      .getByRole('textbox', { name: 'Search by silence name' })
      .closest<HTMLElement>('.pf-v6-c-panel__main')!,
  );
  expect(filterToolbar.queryByRole('button', { name: /Expire selected silences/ })).toBeNull();
  expect(filterToolbar.getByRole('button', { name: 'Create silence' })).toBeDefined();

  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alert0' }));
  expect(screen.queryByRole('button', { name: /Expire selected silences/ })).toBeNull();
});

const openFilters = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Open silence filters' }));
};

const selectState = async (state: string) => {
  if (!screen.queryByRole('heading', { name: 'Filter silences' })) {
    openFilters();
  }
  const panel = within(document.getElementById('silence-filters')!);
  const toggle = panel.getByRole('button', {
    name: /^(State(?: \(\d+\))?|Active|Pending|Expired)$/,
  });
  await act(async () => fireEvent.click(toggle));
  for (const label of ['Active', 'Pending', 'Expired']) {
    const checkbox = screen.getByRole('checkbox', {
      name: new RegExp(`^${label} \\(`),
    }) as HTMLInputElement;
    if (checkbox.checked !== (label === state)) {
      fireEvent.click(checkbox);
    }
  }
  await act(async () => fireEvent.click(toggle));
};

it('filters pending and name, resets page and selection, and supports browser history', async () => {
  mount('?perPage=2&page=2');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alert2' }));
  expect(screen.getByRole('button', { name: /Expire selected silences/ }).textContent).toContain(
    '(1)',
  );
  await selectState('Pending');
  expect(tableNames()).toHaveLength(1);
  expect(tableNames()[0]).toContain('Alert1');
  expect(screen.queryByRole('button', { name: /Expire selected silences/ })).toBeNull();
  act(() => navigate(-1));
  expect(tableNames()[0]).toContain('Alert2');
  fireEvent.change(screen.getByRole('textbox', { name: 'Search by silence name' }), {
    target: { value: 'alert0' },
  });
  expect(tableNames()).toHaveLength(1);
  expect(tableNames()[0]).toContain('Alert0');
});

it('restores multiple valid URL states and ignores invalid states', async () => {
  mount('?state=invalid&state=pending&state=active');
  expect(tableNames()).toHaveLength(5);
  expect(screen.queryByText('invalid')).toBeNull();
  openFilters();
  const panel = within(document.getElementById('silence-filters')!);
  await act(async () => fireEvent.click(panel.getByRole('button', { name: 'State (2)' })));
  for (const label of ['Pending (1)', 'Active (4)']) {
    expect((screen.getByRole('checkbox', { name: label }) as HTMLInputElement).checked).toBe(true);
  }
});

it('shows State and Firing alerts by default while hiding Starts and Ends', () => {
  mount();
  expect(screen.getByRole('columnheader', { name: 'State' })).toBeDefined();
  expect(screen.getByRole('columnheader', { name: 'Firing alerts' })).toBeDefined();
  for (const name of ['Status', 'Starts', 'Ends']) {
    expect(screen.queryByRole('columnheader', { name })).toBeNull();
  }
});

it('uses the combined silence firing-alert counts without rematching and sorts by their total', () => {
  query.data![0].firingAlerts = [
    makeAlert({ labels: { alertname: 'DifferentName', severity: 'critical' } }),
    makeAlert({ labels: { alertname: 'DifferentName', severity: 'critical' } }),
  ];
  query.data![1].firingAlerts = [
    makeAlert({ labels: { alertname: 'AnotherName', severity: 'warning' } }),
  ];
  mount();
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
  const firingCell = (row: HTMLElement) => row.querySelector('[data-label="Firing alerts"]')!;
  expect(firingCell(rows[0]).textContent).toContain('2');
  expect(firingCell(rows[1]).textContent).toContain('1');
  expect(firingCell(rows[2]).textContent).toBe('-');
  fireEvent.click(screen.getByRole('button', { name: 'Firing alerts' }));
  expect(tableNames()[0]).toContain('Alert2');
  fireEvent.click(screen.getByRole('button', { name: 'Firing alerts' }));
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
  expect(screen.queryByRole('button', { name: /Expire selected silences/ })).toBeNull();
});

it('renders initial silence error and loading', () => {
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

it.each(['rules', 'alerts'] as const)('waits for %s without clamping pagination', (endpoint) => {
  managementQueries[endpoint].data = undefined;
  managementQueries[endpoint].isLoading = true;
  mount('?page=2&perPage=2');
  expect(screen.queryByRole('table')).toBeNull();
  expect(currentParams().get('page')).toBe('2');
});

it.each(['rules', 'alerts'] as const)(
  'surfaces initial %s errors instead of an empty table',
  (endpoint) => {
    Object.assign(managementQueries[endpoint], {
      data: undefined,
      isError: true,
      error: new Error(`${endpoint} unavailable`),
    });
    mount();
    expect(screen.getByText(`${endpoint} unavailable`)).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('No silences found')).toBeNull();
  },
);

it.each(['rules', 'alerts'] as const)('keeps combined data on a %s refresh error', (endpoint) => {
  Object.assign(managementQueries[endpoint], {
    isError: true,
    error: new Error(`${endpoint} refresh failed`),
  });
  mount();
  expect(screen.getByText('Silences could not be refreshed')).toBeDefined();
  expect(screen.getByText(`${endpoint} refresh failed`)).toBeDefined();
  expect(tableNames()).toHaveLength(5);
});

it.each(['rules', 'alerts'] as const)(
  'clears selection when %s refreshes without new silences',
  (endpoint) => {
    mount();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alert0' }));
    managementQueries[endpoint].dataUpdatedAt++;
    act(() => navigate('?refresh=1'));
    expect(checkedRows()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Expire selected silences/ })).toBeNull();
  },
);

it('keeps stale data visible with a refresh warning and handles empty data', () => {
  query.isError = true;
  query.error = new Error('refresh failed');
  mount();
  expect(screen.getByText('Silences could not be refreshed')).toBeDefined();
  expect(tableNames()).toHaveLength(5);
});

it('restores visible columns and keeps row mutations disabled', () => {
  mount('?columns=%5B%22name%22%2C%22state%22%5D');
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

it('opens and closes the filter sidebar without losing URL filters', () => {
  mount('?scope=Namespace');
  expect(screen.queryByRole('heading', { name: 'Filter silences' })).toBeNull();
  openFilters();
  expect(screen.getByRole('heading', { name: 'Filter silences' })).toBeDefined();
  expect(
    screen.getByRole('button', { name: 'Open silence filters' }).getAttribute('aria-expanded'),
  ).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('heading', { name: 'Filter silences' })).toBeNull();
  expect(currentParams().get('scope')).toBe('Namespace');
});

const scopedFixtures = () =>
  fixtures().map((silence, index) => ({
    ...silence,
    matchers: [
      ...silence.matchers,
      ...(index < 3
        ? [
            {
              name: 'namespace',
              value: index < 2 ? 'payments' : 'logging',
              isRegex: false,
              isEqual: true,
            },
          ]
        : []),
      {
        name: 'team',
        value: index === 2 || index === 4 ? 'ops' : 'sre',
        isRegex: false,
        isEqual: true,
      },
    ],
  }));

it('combines all sidebar filters, resets pagination and selection, and preserves URL settings', async () => {
  query.data = scopedFixtures();
  mount('?perPage=2&page=2&sort=name&sortDirection=desc&refreshInterval=30000');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alert2' }));
  openFilters();
  const panel = within(document.getElementById('silence-filters')!);
  fireEvent.click(panel.getByRole('button', { name: 'Namespace' }));
  expect(currentParams().get('page')).toBe('1');
  expect(checkedRows()).toHaveLength(0);

  const namespaceToggle = panel.getByRole('button', { name: 'Select namespaces' });
  await act(async () => fireEvent.click(namespaceToggle));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search namespaces' }), {
    target: { value: 'PAY' },
  });
  expect(screen.queryByRole('checkbox', { name: 'logging (1)' })).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: 'payments (2)' }));
  await act(async () => fireEvent.click(namespaceToggle));

  const labelsToggle = panel.getByRole('button', { name: 'Select labels' });
  await act(async () => fireEvent.click(labelsToggle));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search silence labels' }), {
    target: { value: 'TEAM=' },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: 'team=sre (3)' }));
  await act(async () => fireEvent.click(labelsToggle));
  await selectState('Pending');
  expect(tableNames()).toHaveLength(1);
  expect(tableNames()[0]).toContain('Alert1');
  expect(currentParams().getAll('namespace')).toEqual(['payments']);
  expect(currentParams().getAll('labels')).toEqual(['team=sre']);
  expect(currentParams().getAll('scope')).toEqual(['Namespace']);
  expect(currentParams().getAll('state')).toEqual(['pending']);
  expect(currentParams().get('sortDirection')).toBe('desc');
  expect(currentParams().get('refreshInterval')).toBe('30000');

  act(() => navigate(-1));
  expect(tableNames()).toHaveLength(2);
  fireEvent.click(panel.getByRole('button', { name: 'Clear all filters' }));
  for (const key of ['namespace', 'labels', 'scope']) {
    expect(currentParams().has(key)).toBe(false);
  }
  expect(currentParams().getAll('state')).toEqual(['']);
  expect(currentParams().get('sortDirection')).toBe('desc');
  expect(currentParams().get('refreshInterval')).toBe('30000');
});

it('restores namespace, label and scope chips and removes them without opening the sidebar', () => {
  query.data = scopedFixtures();
  mount('?namespace=payments&labels=team%3Dsre&scope=Namespace');
  expect(tableNames()).toHaveLength(2);
  const toolbar = within(
    screen
      .getByRole('textbox', { name: 'Search by silence name' })
      .closest<HTMLElement>('.pf-v6-c-panel__main')!,
  );
  expect(toolbar.getByText('payments')).toBeDefined();
  expect(toolbar.getByText('team=sre')).toBeDefined();
  fireEvent.click(screen.getAllByRole('button', { name: 'Remove filter' })[0]);
  expect(currentParams().has('namespace')).toBe(false);
  expect(currentParams().get('labels')).toBe('team=sre');
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(tableNames()).toHaveLength(5);
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

it.each(['?sort=unknown&sortDirection=sideways', '?columns=["name","state"]&sort=endsAt'])(
  'falls back to the default sort for invalid or hidden columns: %s',
  (search) => {
    mount(search);
    expect(tableNames()[0]).toContain('Alert0');
    expect(
      screen.getByRole('columnheader', { name: 'Silence name' }).getAttribute('aria-sort'),
    ).toBe('ascending');
  },
);

it('removes state chips and clears filters while preserving sorting and refresh settings', async () => {
  mount('?state=pending&name=Alert&sort=name&sortDirection=desc&refreshInterval=30000');
  fireEvent.click(screen.getByRole('button', { name: 'Remove filter' }));
  expect(currentParams().getAll('state')).toEqual(['']);
  expect(currentParams().get('name')).toBe('Alert');
  expect(tableNames()).toHaveLength(5);

  await selectState('Active');
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(currentParams().getAll('state')).toEqual(['']);
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
  mount('?columns=["createdBy","name","state"]');
  expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
    '',
    'Created by',
    'Silence name',
    'State',
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

  fireEvent.click(screen.getByRole('button', { name: 'State' }));
  expect(currentParams().get('sort')).toBe('state');
  expect(screen.getByRole('columnheader', { name: 'State' }).getAttribute('aria-sort')).toBe(
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
  for (const label of ['Starts', 'Ends']) {
    const checkbox = dialog.getByRole('checkbox', { name: label }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
  }
  fireEvent.click(dialog.getByRole('checkbox', { name: 'Created by' }));
  fireEvent.click(dialog.getByRole('checkbox', { name: 'Matchers' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('columnheader', { name: 'Created by' })).toBeNull();
  expect(screen.queryByRole('columnheader', { name: 'Matchers' })).toBeNull();
  expect(JSON.parse(currentParams().get('columns')!)).toEqual([
    'name',
    'firingAlerts',
    'state',
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
