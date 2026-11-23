import { Alert, AlertSeverity } from '@openshift-console/dynamic-plugin-sdk';
import { Tooltip } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';

import { SeverityBadge } from '@/shared/components/SeverityBadge';

export function SeverityCounts({ alerts }: { alerts: Alert[] }) {
  const { t } = useTranslation(process.env.I18N_NAMESPACE);

  if (!alerts?.length) {
    return <>-</>;
  }

  const counts = {
    [AlertSeverity.Critical]: 0,
    [AlertSeverity.Warning]: 0,
    [AlertSeverity.Info]: 0,
  };

  for (const alert of alerts) {
    switch (alert?.labels?.severity) {
      case AlertSeverity.Critical:
        counts[AlertSeverity.Critical]++;
        break;
      case AlertSeverity.Warning:
        counts[AlertSeverity.Warning]++;
        break;
      default:
        counts[AlertSeverity.Info]++;
        break;
    }
  }

  const presentSeverities = [
    AlertSeverity.Critical,
    AlertSeverity.Warning,
    AlertSeverity.Info,
  ].filter((s) => counts[s] > 0);

  const tooltips = {
    [AlertSeverity.Critical]: t('{{count}} Critical Alert', {
      count: counts[AlertSeverity.Critical],
    }),
    [AlertSeverity.Warning]: t('{{count}} Warning Alert', {
      count: counts[AlertSeverity.Warning],
    }),
    [AlertSeverity.Info]: t('{{count}} Info Alert', {
      count: counts[AlertSeverity.Info],
    }),
  };

  return (
    <>
      {presentSeverities.map((s) => (
        <Tooltip key={s} content={tooltips[s]}>
          <SeverityBadge severity={s} count={counts[s]} />
        </Tooltip>
      ))}
    </>
  );
}
