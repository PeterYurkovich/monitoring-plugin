import { AlertSeverity, AlertStates } from '@openshift-console/dynamic-plugin-sdk';

import {
  aggregateAlerts,
  defaultAlertFilters,
  filterAlerts,
  toManagedAlert,
} from '@/features/alert-management-api/utils/alerts';
import { compareSeverities } from '@/features/alert-management-api/utils/sort-alerts';

const createAlert = (name: string, severity: AlertSeverity, state = AlertStates.Firing) =>
  toManagedAlert({
    activeAt: '2026-01-01T00:00:00Z',
    annotations: {},
    labels: { alertname: name, severity },
    rule: { name, id: name },
    state,
  } as never);

describe('alert management derivation', () => {
  it('derives namespace scope and aggregates matching alerts', () => {
    const alerts = [
      createAlert('HighCPU', AlertSeverity.Warning),
      createAlert('HighCPU', AlertSeverity.Warning),
    ];

    const aggregates = aggregateAlerts(alerts);

    expect(alerts[0]).toMatchObject({ alertScope: 'Namespace', component: 'component' });
    expect(aggregates).toHaveLength(1);
    expect(aggregates[0].alerts).toHaveLength(2);
  });

  it('filters by scope, component, severity, state, and source', () => {
    const alert = createAlert('HighCPU', AlertSeverity.Critical, AlertStates.Silenced);

    expect(
      filterAlerts([alert], {
        ...defaultAlertFilters,
        scope: ['Namespace'],
        component: ['component'],
        severity: [AlertSeverity.Critical],
        state: [AlertStates.Silenced],
        source: ['user'],
      }),
    ).toEqual([alert]);
  });

  it('filters by custom label values', () => {
    const alert = toManagedAlert({
      activeAt: '2026-01-01T00:00:00Z',
      annotations: {},
      labels: {
        alertname: 'HighCPU',
        namespace: 'payments',
        severity: AlertSeverity.Critical,
        team: 'payments',
      },
      rule: { id: 'cpu', name: 'HighCPU' },
      state: AlertStates.Firing,
    } as never);

    expect(
      filterAlerts([alert], {
        ...defaultAlertFilters,
        labels: ['team=payments'],
      }),
    ).toEqual([alert]);
    expect(
      filterAlerts([alert], {
        ...defaultAlertFilters,
        labels: ['team=platform'],
      }),
    ).toEqual([]);
  });

  it('sorts by severity, scope, component, then name', () => {
    const aggregates = aggregateAlerts([
      createAlert('Warning', AlertSeverity.Warning),
      createAlert('Critical', AlertSeverity.Critical),
    ]);

    expect(aggregates.map((alert) => alert.name)).toEqual(['Critical', 'Warning']);
  });

  it('orders known severities before unknown severities', () => {
    expect(
      ['generic', 'custom', 'none', 'info', 'warning', 'critical'].sort(compareSeverities),
    ).toEqual(['critical', 'warning', 'info', 'none', 'custom', 'generic']);
  });

  it('matches the None severity when the alert has no severity label', () => {
    const alert = createAlert('Watchdog', AlertSeverity.None);
    const unlabeled = { ...alert, labels: { alertname: 'Watchdog' } };

    expect(
      filterAlerts([unlabeled], { ...defaultAlertFilters, severity: [AlertSeverity.None] }),
    ).toEqual([unlabeled]);
  });

  it('filters firing time using a relative window with inclusive boundaries', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
      const inside = {
        ...createAlert('Inside', AlertSeverity.Warning),
        activeAt: '2026-09-29T11:55:00Z',
      };
      const before = { ...inside, activeAt: '2026-09-29T11:54:59Z' };
      const after = { ...inside, activeAt: '2026-09-29T12:00:01Z' };

      expect(
        filterAlerts([before, inside, after], { ...defaultAlertFilters, firingTime: '5m' }),
      ).toEqual([inside]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts dashboard-style week durations', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
      const alert = {
        ...createAlert('LastWeek', AlertSeverity.Warning),
        activeAt: '2026-09-23T12:00:00Z',
      };
      expect(filterAlerts([alert], { ...defaultAlertFilters, firingTime: '1w' })).toEqual([alert]);
      expect(filterAlerts([alert], { ...defaultAlertFilters, firingTime: '5m' })).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('filters by a custom firing time range', () => {
    const alert = {
      ...createAlert('Inside', AlertSeverity.Warning),
      activeAt: '2026-09-29T11:30:00Z',
    };
    const customRange = 'custom:2026-09-29T11:00:00.000Z,2026-09-29T12:00:00.000Z';

    expect(filterAlerts([alert], { ...defaultAlertFilters, firingTime: customRange })).toEqual([
      alert,
    ]);
    expect(
      filterAlerts([alert], {
        ...defaultAlertFilters,
        firingTime: 'custom:2026-09-29T11:31:00.000Z,2026-09-29T12:00:00.000Z',
      }),
    ).toEqual([]);
  });

  it('classifies kube and OpenShift namespaces as cluster alerts', () => {
    const clusterAlert = toManagedAlert({
      activeAt: '2026-01-01T00:00:00Z',
      annotations: {},
      labels: { alertname: 'Watchdog', namespace: 'openshift-monitoring' },
      rule: { id: 'watchdog', name: 'Watchdog' },
      state: AlertStates.Firing,
    } as never);

    expect(clusterAlert.alertScope).toBe('Cluster');
  });

  it('uses the shared rule source for platform and custom sources', () => {
    const alert = createAlert('HighCPU', AlertSeverity.Critical);

    expect(
      toManagedAlert({
        ...alert,
        rule: { ...alert.rule, labels: { prometheus: 'openshift-monitoring/k8s' } },
      }).source,
    ).toBe('platform');
    expect(
      toManagedAlert({
        ...alert,
        rule: { ...alert.rule, sourceId: 'custom-source' },
      }).source,
    ).toBe('custom-source');
  });
});
