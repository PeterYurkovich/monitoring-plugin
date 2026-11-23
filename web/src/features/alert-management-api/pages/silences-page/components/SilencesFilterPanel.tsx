import { Button, Divider, Flex, Title } from '@patternfly/react-core';
import { RhUiFilterFillIcon, TimesIcon } from '@patternfly/react-icons';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertFilterSelect } from '@/features/alert-management-api/components/AlertFilterSelect';
import { NamespaceFilter } from '@/features/alert-management-api/components/NamespaceFilter';
import { ScopeFilter } from '@/features/alert-management-api/components/ScopeFilter';
import {
  emptySilenceFilters,
  getSilenceFilterOptions,
  SilenceFilters,
} from '@/features/alert-management-api/pages/silences-page/utils/silences';
import type { ManagedSilence } from '@/features/alert-management-api/types/types';

type SilencesFilterPanelProps = {
  silences: ManagedSilence[];
  filters: SilenceFilters;
  onChange: (filters: SilenceFilters) => void;
  onClose: () => void;
};

export function SilencesFilterPanel({
  silences,
  filters,
  onChange,
  onClose,
}: SilencesFilterPanelProps) {
  const { t } = useTranslation(process.env.I18N_NAMESPACE);
  const options = useMemo(() => getSilenceFilterOptions(silences, t), [silences, t]);

  return (
    <Flex
      direction={{ default: 'column' }}
      alignItems={{ default: 'alignItemsStretch' }}
      spaceItems={{ default: 'spaceItemsMd' }}
    >
      <Flex
        justifyContent={{ default: 'justifyContentSpaceBetween' }}
        alignItems={{ default: 'alignItemsCenter' }}
      >
        <Title headingLevel="h2" size="md">
          <RhUiFilterFillIcon aria-hidden /> {t('Filter silences')}
        </Title>
        <Button variant="plain" aria-label={t('Close')} icon={<TimesIcon />} onClick={onClose} />
      </Flex>
      <NamespaceFilter
        filterKey="silence-namespace"
        options={options.namespace}
        selected={filters.namespace}
        onChange={(namespace) => onChange({ ...filters, namespace })}
      />
      <Divider />
      <AlertFilterSelect
        filterKey="silence-labels"
        label={t('Silence labels')}
        icon={<RhUiFilterFillIcon aria-hidden />}
        placeholder="Select labels"
        emptyHint="Showing all labels"
        searchLabel={t('Search silence labels')}
        options={options.labels}
        selected={filters.labels}
        onChange={(labels) => onChange({ ...filters, labels })}
      />
      <Divider />
      <ScopeFilter
        label={t('Silence scope')}
        tooltip={t('Silence scope tooltip')}
        selected={filters.scope}
        onChange={(scope) => onChange({ ...filters, scope })}
      />
      <Divider />
      <AlertFilterSelect
        filterKey="silence-state"
        label="State"
        placeholder="State"
        options={options.state}
        selected={filters.state}
        onChange={(state) => onChange({ ...filters, state })}
      />
      <Divider />
      <Button variant="link" onClick={() => onChange(emptySilenceFilters)}>
        {t('Clear all filters')}
      </Button>
    </Flex>
  );
}
