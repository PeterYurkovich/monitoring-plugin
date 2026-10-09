/** @vitest-environment jsdom */

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { QueryParamProvider } from 'use-query-params';

import { AlertManagementAlertsPage } from '@/features/alert-management-api/pages/alerts-page/AlertsPage';
import { ManagedAlert } from '@/features/alert-management-api/types/types';
import { DataTestIDs } from '@/shared/constants/data-test';
import { ReactRouter7Adapter } from '@/shared/utils/react-router-7-adapter';

const alerts = ['info', 'warning', 'critical', undefined].map((severity, index) => ({
  activeAt: '2026-01-01T00:00:00Z',
  annotations: {},
  labels: { alertname: `Alert${index}`, severity, namespace: `namespace-${index}` },
  state: 'firing',
  rule: { id: `rule${index}`, name: `Alert${index}` },
  alertScope: 'Cluster',
  component: 'component',
  source: 'user',
})) as unknown as ManagedAlert[];

vi.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  AlertSeverity: { Critical: 'critical', Warning: 'warning', Info: 'info', None: 'none' },
  AlertStates: { Firing: 'firing', Pending: 'pending', Silenced: 'silenced' },
  DocumentTitle: () => null,
  Timestamp: () => null,
  ListPageHeader: ({ title, children }: { title: string; children?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {children}
    </header>
  ),
  ResourceIcon: ({ kind }: { kind: string }) => <span>{kind}</span>,
}));

vi.mock('@/features/alert-management-api/hooks/useAlertManagementData', () => ({
  useAlertManagementData: () => ({
    data: { alerts },
    rulesQuery: {
      data: {},
      isLoading: false,
      isError: false,
      isFetching: false,
      dataUpdatedAt: 0,
      refetch: vi.fn(),
    },
    silencesQuery: { isError: false, isFetching: false, dataUpdatedAt: 0, refetch: vi.fn() },
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (key === '{{group}}: {{value}} ({{count}} alerts)' && values?.count === 1) {
        key = '{{group}}: {{value}} ({{count}} alert)';
      }
      const text = key.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
        String(values?.[name] ?? name),
      );
      return values?.count && Number(values.count) !== 1
        ? text
            .replace(/ second$/, ' seconds')
            .replace(/ minute$/, ' minutes')
            .replace(/ hour$/, ' hours')
            .replace(/ day$/, ' days')
            .replace(/ week$/, ' weeks')
        : text;
    },
  }),
}));

const Query = () => {
  const { search } = useLocation();
  return <output data-testid={DataTestIDs.AlertManagementAPI.QueryOutput}>{search}</output>;
};

const queryParams = () =>
  new URLSearchParams(screen.getByTestId(DataTestIDs.AlertManagementAPI.QueryOutput).textContent);

const alertNames = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent?.match(/Alert\d/)?.[0]);

const AlertsPage = () => (
  <QueryParamProvider adapter={ReactRouter7Adapter}>
    <AlertManagementAlertsPage />
  </QueryParamProvider>
);

it('sorts from each column header and saves column and direction in the URL', () => {
  render(
    <MemoryRouter initialEntries={['/monitoring/v2/alerts?refreshInterval=30s']}>
      <AlertsPage />
      <Query />
    </MemoryRouter>,
  );

  expect(alertNames()).toEqual(['Alert2', 'Alert1', 'Alert0', 'Alert3']);
  for (const heading of [
    'Alert name',
    'Severity',
    'Total',
    'State',
    'Alert scope',
    'Affected component',
    'Source',
  ]) {
    expect(screen.getByRole('button', { name: heading })).toBeDefined();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Alert name' }));
  expect(alertNames()).toEqual(['Alert0', 'Alert1', 'Alert2', 'Alert3']);
  fireEvent.click(screen.getByRole('button', { name: 'Alert name' }));
  expect(alertNames()).toEqual(['Alert3', 'Alert2', 'Alert1', 'Alert0']);
  expect(screen.getByRole('columnheader', { name: 'Alert name' }).getAttribute('aria-sort')).toBe(
    'descending',
  );
  const params = queryParams();
  expect(params.get('sort')).toBe('name');
  expect(params.get('sortDirection')).toBe('desc');
  expect(params.get('refreshInterval')).toBe('30s');
  fireEvent.click(screen.getByRole('button', { name: 'Severity' }));
  expect(alertNames()).toEqual(['Alert2', 'Alert1', 'Alert0', 'Alert3']);
  expect(queryParams().has('sort')).toBe(false);
});

it('manages optional table columns while keeping alert name and severity visible', () => {
  render(
    <MemoryRouter initialEntries={['/monitoring/v2/alerts']}>
      <AlertsPage />
    </MemoryRouter>,
  );

  expect(screen.getByRole('button', { name: 'Export as CSV' })).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Manage columns' }));
  expect(screen.getByRole('heading', { name: 'Manage columns' })).toBeDefined();
  expect(
    (document.getElementById(DataTestIDs.AlertManagementAPI.ColumnNameCheckbox) as HTMLInputElement)
      .disabled,
  ).toBe(true);
  expect(
    (
      document.getElementById(
        DataTestIDs.AlertManagementAPI.ColumnSeverityCheckbox,
      ) as HTMLInputElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(
    document.getElementById(`${DataTestIDs.AlertManagementAPI.ColumnCheckboxPrefix}source`)!,
  );
  fireEvent.click(
    document.getElementById(`${DataTestIDs.AlertManagementAPI.ColumnCheckboxPrefix}description`)!,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(screen.getByRole('columnheader', { name: 'Alert name' })).toBeDefined();
  expect(screen.getByRole('columnheader', { name: 'Severity' })).toBeDefined();
  expect(screen.getByRole('columnheader', { name: 'Description (in alert)' })).toBeDefined();
  expect(screen.queryByRole('columnheader', { name: 'Source' })).toBeNull();
});

it('keeps column controls available when no alerts match', () => {
  render(
    <MemoryRouter initialEntries={['/monitoring/v2/alerts?name=missing']}>
      <AlertsPage />
    </MemoryRouter>,
  );

  expect(screen.getByText('No alerts found')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Manage columns' }));
  expect(screen.getByRole('heading', { name: 'Manage columns' })).toBeDefined();
});

it('restores sorting from the URL on load', () => {
  render(
    <MemoryRouter initialEntries={['/monitoring/v2/alerts?sort=name&sortDirection=desc']}>
      <AlertsPage />
    </MemoryRouter>,
  );

  expect(alertNames()).toEqual(['Alert3', 'Alert2', 'Alert1', 'Alert0']);
  expect(screen.getByRole('columnheader', { name: 'Alert name' }).getAttribute('aria-sort')).toBe(
    'descending',
  );
});

it('displays selected filter chips and clears them individually', () => {
  render(
    <MemoryRouter initialEntries={['/monitoring/v2/alerts']}>
      <AlertsPage />
      <Query />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Filter critical alerts' }));
  expect(
    within(screen.getByRole('list', { name: 'Severity' })).getByText('Critical'),
  ).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Remove filter' }));
  expect(screen.queryByRole('list', { name: 'Severity' })).toBeNull();
  expect(queryParams().has('severity')).toBe(false);
});

it('resets pagination when filters change without dropping other URL state', () => {
  render(
    <MemoryRouter initialEntries={['/monitoring/v2/alerts?page=2&perPage=2&refreshInterval=30s']}>
      <AlertsPage />
      <Query />
    </MemoryRouter>,
  );

  expect(alertNames()).toEqual(['Alert0', 'Alert3']);
  fireEvent.click(screen.getByRole('button', { name: 'Filter critical alerts' }));

  expect(alertNames()).toEqual(['Alert2']);
  expect(Object.fromEntries(queryParams())).toEqual({
    page: '1',
    perPage: '2',
    refreshInterval: '30s',
    severity: 'critical',
  });
});

it('clears selected filters and firing-time query state', () => {
  render(
    <MemoryRouter
      initialEntries={[
        '/monitoring/v2/alerts?severity=critical&name=Alert0&timeRange=3600000&endTime=1790000000000',
      ]}
    >
      <AlertsPage />
      <Query />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

  expect(queryParams().has('severity')).toBe(false);
  expect(queryParams().has('name')).toBe(false);
  expect(queryParams().has('timeRange')).toBe(false);
  expect(queryParams().has('endTime')).toBe(false);
});

it('selects alerts and logs the selected names when silencing', () => {
  const log = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  render(
    <MemoryRouter initialEntries={['/monitoring/v2/alerts']}>
      <AlertsPage />
    </MemoryRouter>,
  );

  expect(
    document.getElementById(DataTestIDs.AlertManagementAPI.SelectAllAlertsCheckbox),
  ).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Silence (1)' })).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alert0 alerts' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alert1 alerts' }));
  const silenceButton = screen.getByRole('button', { name: 'Silence (2)' });
  expect(silenceButton.classList.contains('pf-m-secondary')).toBe(true);
  expect(silenceButton.querySelector('svg')).not.toBeNull();
  fireEvent.click(silenceButton);

  expect(log).toHaveBeenCalledWith('silencing 2 alerts: Alert0, Alert1');
  log.mockRestore();
});

it('links expanded alert names to the current page and exposes individual actions', () => {
  const log = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  render(
    <MemoryRouter initialEntries={['/monitoring/v2/alerts']}>
      <AlertsPage />
    </MemoryRouter>,
  );

  const aggregateRow = screen.getByText('Alert2').closest('tr');
  if (!aggregateRow) throw new Error('Alert row not found');
  fireEvent.click(within(aggregateRow).getByRole('button'));

  const alertLink = screen.getByRole('link', { name: 'Alert2' });
  expect(alertLink.getAttribute('href')).toBe('/monitoring/v2/alerts');
  fireEvent.click(alertLink);
  expect(log).toHaveBeenCalledWith('Alert2, namespace: namespace-2');

  const detailRow = alertLink.closest('tr');
  if (!detailRow) throw new Error('Expanded alert row not found');
  fireEvent.click(within(detailRow).getByRole('button', { name: 'Actions for Alert2' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Acknowledge' }));
  expect(log).toHaveBeenCalledWith('Acknowledge: Alert2, namespace: namespace-2');
  log.mockRestore();
});

it.each([
  ['Severity', 'severity', 'Severity: Critical (1 alert)'],
  ['Alert scope', 'scope', 'Alert scope: Cluster (4 alerts)'],
  ['Component', 'component', 'Component: component (4 alerts)'],
])(
  'selects %s grouping and resets pagination without dropping other URL state',
  (label, value, summary) => {
    render(
      <MemoryRouter
        initialEntries={[
          '/monitoring/v2/alerts?page=2&perPage=2&refreshInterval=30s&state=firing&sort=name&sortDirection=desc',
        ]}
      >
        <AlertsPage />
        <Query />
      </MemoryRouter>,
    );

    expect(alertNames()).toEqual(['Alert1', 'Alert0']);
    expect(screen.getByText('Layout').tagName).toBe('STRONG');
    fireEvent.click(screen.getByRole('button', { name: 'Group by' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'None',
      'Severity',
      'Alert scope',
      'Component',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: label }));

    expect(screen.getByRole('button', { name: 'Group by' }).textContent).toContain(label);
    expect(screen.getByRole('cell', { name: summary })).toBeDefined();
    expect(screen.queryByRole('checkbox', { name: /^Select Alert\d alerts$/ })).toBeNull();
    screen.getAllByRole('button', { name: /^Toggle group:/ }).forEach((button) => {
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });
    expect(Object.fromEntries(queryParams())).toEqual({
      page: '1',
      perPage: '2',
      refreshInterval: '30s',
      state: 'firing',
      sort: 'name',
      sortDirection: 'desc',
      groupBy: value,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Group by' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'None' }));
    expect(queryParams().has('groupBy')).toBe(false);
    expect(queryParams().get('refreshInterval')).toBe('30s');
    expect(queryParams().get('state')).toBe('firing');
    expect(queryParams().get('sort')).toBe('name');
    expect(queryParams().get('sortDirection')).toBe('desc');
    expect(alertNames()).toEqual(['Alert3', 'Alert2']);
    expect(screen.queryByRole('button', { name: 'Collapse all groups on this page' })).toBeNull();
  },
);

it.each([
  ['severity', 'Severity', 'Severity: Critical (1 alert)'],
  ['scope', 'Alert scope', 'Alert scope: Cluster (4 alerts)'],
  ['component', 'Component', 'Component: component (4 alerts)'],
])(
  'restores %s grouping from the URL with groups closed and aggregates collapsed',
  (value, label, summary) => {
    render(
      <MemoryRouter initialEntries={[`/monitoring/v2/alerts?groupBy=${value}`]}>
        <AlertsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Group by' }).textContent).toContain(label);
    const groupRow = screen.getByRole('cell', { name: summary }).closest('tr')!;
    expect(within(groupRow).getByRole('button').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('checkbox', { name: /^Select Alert\d alerts$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand all groups on this page' }));
    expect(screen.getAllByRole('checkbox', { name: /^Select Alert\d alerts$/ })).toHaveLength(4);
    expect(screen.queryByRole('link', { name: /^Alert\d$/ })).toBeNull();
  },
);

it('falls back to a flat table for an invalid URL grouping', () => {
  render(
    <MemoryRouter
      initialEntries={['/monitoring/v2/alerts?groupBy=invalid&sort=name&sortDirection=desc']}
    >
      <AlertsPage />
    </MemoryRouter>,
  );

  expect(screen.getByRole('button', { name: 'Group by' }).textContent).toContain('None');
  expect(alertNames()).toEqual(['Alert3', 'Alert2', 'Alert1', 'Alert0']);
  expect(screen.queryByRole('button', { name: 'Expand all groups on this page' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Collapse all groups on this page' })).toBeNull();
});

it('collapses and expands groups without changing aggregate expansion or excluding hidden alerts from select-all', () => {
  render(
    <MemoryRouter initialEntries={['/monitoring/v2/alerts?groupBy=severity']}>
      <AlertsPage />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Expand all groups on this page' }));
  const aggregateRow = screen.getByText('Alert2').closest('tr')!;
  fireEvent.click(within(aggregateRow).getByRole('button', { name: 'Details' }));
  expect(screen.getByRole('link', { name: 'Alert2' })).toBeDefined();

  fireEvent.click(screen.getByRole('button', { name: 'Collapse all groups on this page' }));
  expect(screen.queryByRole('checkbox', { name: /^Select Alert\d alerts$/ })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Alert2' })).toBeNull();
  expect(screen.getAllByRole('button', { name: /^Toggle group:/ })).toHaveLength(4);
  screen.getAllByRole('button', { name: /^Toggle group:/ }).forEach((button) => {
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all alerts on this page' }));
  expect(screen.getByRole('button', { name: 'Silence (4)' })).toBeDefined();

  fireEvent.click(screen.getByRole('button', { name: 'Expand all groups on this page' }));
  expect(screen.getAllByRole('link', { name: /^Alert\d$/ })).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Alert2' })).toBeDefined();
  screen.getAllByRole('checkbox', { name: /^Select Alert\d alerts$/ }).forEach((checkbox) => {
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });
  expect(
    within(screen.getByText('Alert1').closest('tr')!)
      .getByRole('button', { name: 'Details' })
      .getAttribute('aria-expanded'),
  ).toBe('false');
});

it('limits group collapse and expansion to the current page', () => {
  render(
    <MemoryRouter initialEntries={['/monitoring/v2/alerts?groupBy=severity&perPage=2']}>
      <AlertsPage />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Expand all groups on this page' }));
  fireEvent.click(screen.getByRole('button', { name: 'Collapse all groups on this page' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Go to next page' })[0]);
  expect(screen.queryByRole('checkbox', { name: /^Select Alert\d alerts$/ })).toBeNull();
  screen.getAllByRole('button', { name: /^Toggle group:/ }).forEach((button) => {
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Expand all groups on this page' }));
  expect(screen.getByRole('checkbox', { name: 'Select Alert0 alerts' })).toBeDefined();
  expect(screen.getByRole('checkbox', { name: 'Select Alert3 alerts' })).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Collapse all groups on this page' }));
  fireEvent.click(screen.getByRole('button', { name: 'Expand all groups on this page' }));
  expect(screen.getByRole('checkbox', { name: 'Select Alert0 alerts' })).toBeDefined();

  fireEvent.click(screen.getAllByRole('button', { name: 'Go to previous page' })[0]);
  expect(screen.queryByRole('checkbox', { name: /^Select Alert\d alerts$/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Expand all groups on this page' }));
  expect(screen.getByRole('checkbox', { name: 'Select Alert2 alerts' })).toBeDefined();
  expect(screen.getByRole('checkbox', { name: 'Select Alert1 alerts' })).toBeDefined();
});

it('exports all filtered alerts across pages and collapsed groups without group summaries', async () => {
  const createObjectURL = vi.fn<(blob: Blob) => string>().mockReturnValue('blob:alerts');
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = vi.fn();
    },
  );
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  try {
    render(
      <MemoryRouter
        initialEntries={['/monitoring/v2/alerts?groupBy=severity&perPage=2&state=firing']}
      >
        <AlertsPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('button', { name: /^Toggle group:/ })).toHaveLength(2);
    screen.getAllByRole('button', { name: /^Toggle group:/ }).forEach((button) => {
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });
    expect(screen.queryByRole('checkbox', { name: /^Select Alert\d alerts$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Export as CSV' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('text/csv');
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    const rows = csv.trim().split('\n');
    expect(rows).toHaveLength(5);
    expect(
      rows
        .slice(1)
        .map((row) => row.split(',')[0])
        .sort(),
    ).toEqual(['"Alert0"', '"Alert1"', '"Alert2"', '"Alert3"']);
    expect(csv).not.toContain('Severity:');
    expect(csv).not.toMatch(/\(\d+ alerts?\)/);
  } finally {
    click.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('clears firing-time URL state and restores alerts when Any time is selected', async () => {
  render(
    <MemoryRouter initialEntries={['/monitoring/v2/alerts?refreshInterval=30s']}>
      <AlertsPage />
      <Query />
    </MemoryRouter>,
  );

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Any time' })));
  await act(async () => fireEvent.click(screen.getByRole('option', { name: 'Last 6 hours' })));
  expect(queryParams().get('timeRange')).toBe(String(6 * 60 * 60 * 1000));

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Last 6 hours' })));
  await act(async () => fireEvent.click(screen.getByRole('option', { name: 'Any time' })));
  expect(queryParams().has('timeRange')).toBe(false);
  expect(queryParams().has('endTime')).toBe(false);
  expect(alertNames()).toHaveLength(4);
});

it('resets pagination when the time range changes', async () => {
  render(
    <MemoryRouter initialEntries={['/monitoring/v2/alerts?page=2&perPage=2']}>
      <AlertsPage />
      <Query />
    </MemoryRouter>,
  );

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Any time' })));
  await act(async () => fireEvent.click(screen.getByRole('option', { name: 'Last 6 hours' })));

  expect(queryParams().get('page')).toBe('1');
  expect(queryParams().get('perPage')).toBe('2');
  expect(queryParams().get('timeRange')).toBe(String(6 * 60 * 60 * 1000));
});

it('selects a firing-time preset and a validated custom range from the toolbar', async () => {
  render(
    <MemoryRouter initialEntries={['/monitoring/v2/alerts?refreshInterval=30s']}>
      <AlertsPage />
      <Query />
    </MemoryRouter>,
  );

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Any time' })));
  await act(async () => fireEvent.click(screen.getByRole('option', { name: 'Last 6 hours' })));
  expect(queryParams().get('timeRange')).toBe(String(6 * 60 * 60 * 1000));

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Last 6 hours' })));
  await act(async () => fireEvent.click(screen.getByRole('option', { name: 'Custom time range' })));
  const from = document.getElementById(
    DataTestIDs.TimeRangeSelect.CustomRangeFromInput,
  ) as HTMLInputElement;
  const to = document.getElementById(
    DataTestIDs.TimeRangeSelect.CustomRangeToInput,
  ) as HTMLInputElement;
  fireEvent.change(from, { target: { value: '2026-09-29' } });
  fireEvent.change(to, { target: { value: '2026-09-28' } });
  expect(screen.getByRole('button', { name: 'Save' }).getAttribute('aria-disabled')).toBe('true');
  fireEvent.change(to, { target: { value: '2026-09-30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  const params = queryParams();
  expect(Number(params.get('timeRange'))).toBeGreaterThan(0);
  expect(Number(params.get('endTime'))).toBeGreaterThan(0);
  expect(params.has('firingTime')).toBe(false);
  expect(params.get('refreshInterval')).toBe('30s');
});
