import { Checkbox } from '@patternfly/react-core';
import { Th, Thead, Tr } from '@patternfly/react-table';
import type { ThProps } from '@patternfly/react-table';
import { useTranslation } from 'react-i18next';

import {
  SilenceColumn,
  silenceColumnLabel,
  SilenceSort,
} from '@/features/alert-management-api/pages/silences-page/utils/silences';
import type { ManagedSilence } from '@/features/alert-management-api/types/types';

type SilencesTableHeaderProps = {
  silences: ManagedSilence[];
  columns: SilenceColumn[];
  sort: SilenceSort;
  onSort: (column: SilenceColumn, direction: SilenceSort['direction']) => void;
  selected: Set<string>;
  onSelect: (ids: string[], checked: boolean) => void;
  selectionColumn: ThProps;
  nameColumn: ThProps;
};

export function SilencesTableHeader({
  silences,
  columns,
  sort,
  onSort,
  selected,
  onSelect,
  selectionColumn,
  nameColumn,
}: SilencesTableHeaderProps) {
  const { t } = useTranslation(process.env.I18N_NAMESPACE);
  const ids = silences.flatMap(({ id }) => (id ? [id] : []));
  const selectedCount = ids.filter((id) => selected.has(id)).length;
  const sortBy = { index: columns.indexOf(sort.column), direction: sort.direction };

  return (
    <Thead>
      <Tr>
        <Th {...selectionColumn}>
          <Checkbox
            id="select-page-silences"
            aria-label={t('Select all silences on this page')}
            isDisabled={ids.length === 0}
            isChecked={selectedCount > 0 && selectedCount < ids.length ? null : selectedCount > 0}
            onChange={(_, checked) => onSelect(ids, checked)}
          />
        </Th>
        {columns.map((column, index) => (
          <Th
            key={column}
            {...(column === 'name' ? nameColumn : { modifier: 'wrap' as const })}
            sort={{
              sortBy,
              columnIndex: index,
              onSort: (_, _index, direction) => onSort(column, direction),
            }}
          >
            {silenceColumnLabel(column, t)}
          </Th>
        ))}
        <Th screenReaderText={t('Actions')} />
      </Tr>
    </Thead>
  );
}
