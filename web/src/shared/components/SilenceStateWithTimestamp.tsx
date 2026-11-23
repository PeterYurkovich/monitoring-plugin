import { Silence, SilenceStates } from '@openshift-console/dynamic-plugin-sdk';
import { Stack, StackItem } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';

import { StateTimestamp } from '@/shared/components/AlertState';
import { SilenceState } from '@/shared/components/SilenceState';
import { silenceState } from '@/shared/utils/alerts/formatting';

export function SilenceStateWithTimestamp({ silence }: { silence: Silence }) {
  const { t } = useTranslation(process.env.I18N_NAMESPACE);

  return (
    <Stack>
      <StackItem>
        <SilenceState silence={silence} />
      </StackItem>
      <StackItem>
        {silenceState(silence) === SilenceStates.Pending && (
          <StateTimestamp text={t('Starts')} timestamp={silence.startsAt} />
        )}
        {silenceState(silence) === SilenceStates.Active && (
          <StateTimestamp text={t('Ends')} timestamp={silence.endsAt} />
        )}
        {silenceState(silence) === SilenceStates.Expired && (
          <StateTimestamp text={t('Expired')} timestamp={silence.endsAt} />
        )}
      </StackItem>
    </Stack>
  );
}
