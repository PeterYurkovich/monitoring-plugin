import type { COOSetupOptions } from './operator-commands';
import {
  CLUSTER_LOGGING_OPERATOR,
  CLUSTER_MONITORING_OPERATOR,
  CLUSTER_OBSERVABILITY_OPERATOR,
  KUBEVIRT_HYPERCONVERGED_OPERATOR,
  LOKI_OPERATOR,
  OPENTELEMETRY_OPERATOR,
  TEMPO_OPERATOR,
} from '../operators';

const DASHBOARD_VALIDATION_FAILURE_PREFIX = 'Dashboard setup: ';

export function isDashboardValidationFailure(reason: string): boolean {
  return reason.startsWith(DASHBOARD_VALIDATION_FAILURE_PREFIX);
}

function hasMonitoringRoles(): Cypress.Chainable<string[]> {
  if (Cypress.env('LOGIN_USERNAME') === 'kubeadmin') {
    return cy.wrap([]);
  }

  const reasons: string[] = [];
  ['openshift-monitoring', 'default'].forEach((namespace) => {
    cy.adminCLI(`oc get rolebindings -n ${namespace} -o json`, {
      failOnNonZeroExit: false,
    }).then((result) => {
      if (result.code !== 0) {
        reasons.push(`Cannot read rolebindings in ${namespace}: ${result.stderr || result.stdout}`);
        return;
      }
      const bindings = JSON.parse(result.stdout).items as Array<{
        roleRef: { name: string };
        subjects?: Array<{ kind: string; name: string }>;
      }>;
      ['monitoring-edit', 'monitoring-alertmanager-edit', 'view'].forEach((role) => {
        if (
          !bindings.some(
            (binding) =>
              binding.roleRef.name === role &&
              binding.subjects?.some(
                (subject) =>
                  subject.kind === 'User' && subject.name === Cypress.env('LOGIN_USERNAME'),
              ),
          )
        ) {
          reasons.push(
            `Missing ${role} rolebinding for ${Cypress.env('LOGIN_USERNAME')} in ${namespace}`,
          );
        }
      });
    });
  });
  return cy.then(() => reasons);
}

export function validateMonitoringPlugin(): Cypress.Chainable<string[]> {
  const reasons: string[] = [];
  hasMonitoringRoles().then((roleReasons) => {
    reasons.push(...roleReasons);
  });
  cy.adminCLI(
    `oc get deployment monitoring-plugin -n ${CLUSTER_MONITORING_OPERATOR.namespace} -o json`,
    {
      failOnNonZeroExit: false,
    },
  ).then((result) => {
    if (result.code !== 0) {
      reasons.push(`Cannot read monitoring-plugin deployment: ${result.stderr || result.stdout}`);
      return;
    }
    const deployment = JSON.parse(result.stdout);
    if (!(Number(deployment.status?.availableReplicas) > 0)) {
      reasons.push('monitoring-plugin deployment has no available replicas');
    }
    const image = deployment.spec?.template?.spec?.containers?.[0]?.image;
    if (Cypress.env('MP_IMAGE') && image !== Cypress.env('MP_IMAGE')) {
      reasons.push(`monitoring-plugin image ${image || '(missing)'} does not match MP_IMAGE`);
    }
  });
  return cy.then(() => reasons);
}

function podReadinessReasons(
  pods: Array<{
    metadata: { name: string };
    status?: { containerStatuses?: Array<{ name: string; ready: boolean }> };
  }>,
  label: string,
): string[] {
  if (!pods.length) {
    return [`No ${label} pods found`];
  }
  return pods.flatMap((pod) => {
    if (!pod.status?.containerStatuses?.length) {
      return [`${label} pod ${pod.metadata.name} has no container statuses`];
    }
    return pod.status.containerStatuses
      .filter((container) => !container.ready)
      .map(
        (container) => `${label} pod ${pod.metadata.name} container ${container.name} is not ready`,
      );
  });
}

export function validateMonitoringConsolePlugin(
  opts: Required<COOSetupOptions>,
): Cypress.Chainable<string[]> {
  const namespace = CLUSTER_OBSERVABILITY_OPERATOR.namespace;
  const checks = [
    `oc get deployment observability-operator -n ${namespace} -o json`,
    'oc get uiplugin monitoring',
    `oc get pods -l app.kubernetes.io/instance=monitoring -n ${namespace} -o json`,
  ];
  if (Cypress.env('MP_IMAGE')) {
    checks.push(
      `oc get deployment monitoring-plugin -n ${CLUSTER_MONITORING_OPERATOR.namespace} -o json`,
    );
  }
  const dashboardChecks = [
    `oc get persesdashboard openshift-cluster-sample-dashboard -n ${namespace}`,
    'oc get persesdashboard perses-dashboard-sample prometheus-overview ' +
      'thanos-compact-overview -n perses-dev',
    'oc get persesdatasource thanos-querier-datasource -n perses-dev',
    `oc get pods -l app.kubernetes.io/instance=perses -n ${namespace} -o json`,
  ];
  if (opts.dashboards) checks.push(...dashboardChecks);
  if (opts.troubleshootingPanel) {
    checks.push(
      'oc get uiplugin troubleshooting-panel',
      `oc get pods -l app.kubernetes.io/instance=troubleshooting-panel -n ${namespace} -o json`,
      `oc get pods -l app.kubernetes.io/instance=korrel8r -n ${namespace} -o json`,
    );
  }
  if (opts.healthAnalyzer) {
    checks.push(
      `oc get pods -l app.kubernetes.io/instance=health-analyzer -n ${namespace} -o json`,
    );
  }

  const reasons: string[] = [];
  hasMonitoringRoles().then((roleReasons) => {
    reasons.push(...roleReasons);
  });
  checks.forEach((command) => {
    cy.adminCLI(command, { failOnNonZeroExit: false }).then((result) => {
      if (result.code !== 0) {
        const failurePrefix = dashboardChecks.includes(command)
          ? DASHBOARD_VALIDATION_FAILURE_PREFIX
          : '';
        reasons.push(
          `${failurePrefix}${command} failed: ` +
            `${result.stderr || result.stdout || `exit code ${result.code}`}`,
        );
      } else if (command.endsWith('-o json')) {
        const resource = JSON.parse(result.stdout);
        if (command.includes('get deployment')) {
          if (!(Number(resource.status?.availableReplicas) > 0)) {
            reasons.push(`${command}: no available replicas`);
          }
          if (command.includes('monitoring-plugin')) {
            if (resource.spec?.template?.spec?.containers?.[0]?.image !== Cypress.env('MP_IMAGE')) {
              reasons.push(`${command}: image does not match MP_IMAGE`);
            }
          } else if (
            Cypress.env('KONFLUX_COO_BUNDLE_IMAGE') ||
            Cypress.env('CUSTOM_COO_BUNDLE_IMAGE')
          ) {
            if (
              !resource.spec?.template?.spec?.containers?.[0]?.args?.includes(
                '--openshift.enabled=true',
              )
            ) {
              reasons.push(`${command}: missing --openshift.enabled=true`);
            }
          }
        } else {
          const failurePrefix = dashboardChecks.includes(command)
            ? DASHBOARD_VALIDATION_FAILURE_PREFIX
            : '';
          reasons.push(
            ...podReadinessReasons(resource.items || [], command).map(
              (reason) => `${failurePrefix}${reason}`,
            ),
          );
          const expectedImage = command.includes('health-analyzer')
            ? Cypress.env('CHA_IMAGE')
            : command.includes('instance=monitoring') && Cypress.env('MCP_CONSOLE_IMAGE');
          if (expectedImage) {
            resource.items?.forEach((pod) => {
              if (pod.spec?.containers?.[0]?.image !== expectedImage) {
                reasons.push(
                  `${failurePrefix}${command}: pod ${pod.metadata.name} image does not match ` +
                    'configured image',
                );
              }
            });
          }
        }
      }
    });
  });
  return cy.then(() => reasons);
}

function validateOperator(
  namespace: string,
  packageName: string,
  podName: string,
  selector?: string,
): Cypress.Chainable<string[]> {
  const reasons: string[] = [];
  hasMonitoringRoles().then((roleReasons) => {
    reasons.push(...roleReasons);
  });
  cy.adminCLI(`oc get csv -n ${namespace} -o json`, { failOnNonZeroExit: false }).then((result) => {
    if (result.code !== 0) {
      reasons.push(`Cannot read CSVs in ${namespace}: ${result.stderr || result.stdout}`);
      return;
    }
    const csvs = JSON.parse(result.stdout).items;
    if (
      !csvs.some(
        (csv) => csv.metadata.name.includes(packageName) && csv.status?.phase === 'Succeeded',
      )
    ) {
      reasons.push(`No Succeeded CSV for ${packageName} in ${namespace}`);
    }
  });
  cy.adminCLI(`oc get pods -n ${namespace} ${selector ? `-l ${selector}` : ''} -o json`, {
    failOnNonZeroExit: false,
  }).then((result) => {
    if (result.code !== 0) {
      reasons.push(
        `Cannot read ${packageName} pods in ${namespace}: ${result.stderr || result.stdout}`,
      );
      return;
    }
    const pods = JSON.parse(result.stdout).items.filter((pod) =>
      pod.metadata.name.includes(podName),
    );
    reasons.push(...podReadinessReasons(pods, `${packageName} in ${namespace}`));
  });
  return cy.then(() => reasons);
}

export function validateVirtualization(): Cypress.Chainable<string[]> {
  const reasons: string[] = [];
  validateOperator(
    KUBEVIRT_HYPERCONVERGED_OPERATOR.namespace,
    KUBEVIRT_HYPERCONVERGED_OPERATOR.packageName,
    '',
    'app=kubevirt-hyperconverged',
  ).then((operatorReasons) => {
    reasons.push(...operatorReasons);
  });
  cy.adminCLI(
    `oc get hyperconverged ${KUBEVIRT_HYPERCONVERGED_OPERATOR.config.name} ` +
      `-n ${KUBEVIRT_HYPERCONVERGED_OPERATOR.namespace}`,
    { failOnNonZeroExit: false },
  ).then((result) => {
    if (result.code !== 0) {
      reasons.push(
        `Cannot read HyperConverged ${KUBEVIRT_HYPERCONVERGED_OPERATOR.config.name}: ` +
          (result.stderr || result.stdout),
      );
    }
  });
  return cy.then(() => reasons);
}

export function validateOtel(): Cypress.Chainable<string[]> {
  return validateOperator(
    OPENTELEMETRY_OPERATOR.namespace,
    OPENTELEMETRY_OPERATOR.packageName,
    'opentelemetry',
  );
}

export function validateTempo(): Cypress.Chainable<string[]> {
  return validateOperator(TEMPO_OPERATOR.namespace, TEMPO_OPERATOR.packageName, 'tempo');
}

export function validateLoki(): Cypress.Chainable<string[]> {
  return validateOperator(LOKI_OPERATOR.namespace, LOKI_OPERATOR.packageName, 'loki');
}

export function validateLogging(): Cypress.Chainable<string[]> {
  return validateOperator(
    CLUSTER_LOGGING_OPERATOR.namespace,
    CLUSTER_LOGGING_OPERATOR.packageName,
    'logging',
  );
}

export function validateACM(): Cypress.Chainable<string[]> {
  const reasons: string[] = [];
  const namespace = 'open-cluster-management-observability';
  [
    `oc get multiclusterobservability observability -n ${namespace}`,
    `oc get configmap thanos-ruler-custom-rules -n ${namespace} -o json`,
    'oc get uiplugin monitoring -o json',
    'oc get pods -l alertmanager=observability,app=multicluster-observability-alertmanager ' +
      `-n ${namespace} -o json`,
  ].forEach((command) => {
    cy.adminCLI(command, { failOnNonZeroExit: false }).then((result) => {
      if (result.code !== 0) {
        reasons.push(
          `${command} failed: ${result.stderr || result.stdout || `exit code ${result.code}`}`,
        );
        return;
      }
      if (command.includes('uiplugin')) {
        if (JSON.parse(result.stdout).spec.monitoring?.acm?.enabled !== true) {
          reasons.push('monitoring UIPlugin has ACM disabled');
        }
      }
      if (command.includes('get configmap')) {
        const rules = JSON.parse(result.stdout).data?.['custom_rules.yaml'];
        ['Watchdog', 'Watchdog-spoke', 'ClusterCPUHealth-jb'].forEach((alert) => {
          if (!rules?.includes(`alert: ${alert}`)) {
            reasons.push(`ACM custom rules missing ${alert}`);
          }
        });
      }
      if (command.includes('get pods')) {
        const pods = JSON.parse(result.stdout).items;
        reasons.push(...podReadinessReasons(pods, 'ACM Alertmanager'));
      }
    });
  });
  return cy.then(() => reasons);
}
