import { Silence } from '@openshift-console/dynamic-plugin-sdk';
import { Checkbox, DropdownItem, Label, LabelGroup, Tooltip } from '@patternfly/react-core';
import { Table, Tbody, Td, Tr } from '@patternfly/react-table';
import { useTranslation } from 'react-i18next';

import {
  matcherText,
  SilenceColumn,
  silenceColumnLabel,
  SilenceSort,
} from '@/features/alert-management-api/pages/silences-page/silences';
import { SilencesTableHeader } from '@/features/alert-management-api/pages/silences-page/SilencesTableHeader';
import KebabDropdown from '@/shared/components/KebabDropdown';
import { SilenceState } from '@/shared/components/SilenceState';
import { EmptyBox } from '@/shared/console/console-shared/src/components/empty-state/EmptyBox';

type SilencesTableProps = {
  silences: Silence[];
  columns: SilenceColumn[];
  sort: SilenceSort;
  onSort: (column: SilenceColumn, direction: SilenceSort['direction']) => void;
  selected: Set<string>;
  onSelect: (ids: string[], checked: boolean) => void;
};

export function SilencesTable({
  silences,
  columns,
  sort,
  onSort,
  selected,
  onSelect,
}: SilencesTableProps) {
  const { t } = useTranslation(process.env.I18N_NAMESPACE);
  const selectionColumn = {
    modifier: 'fitContent' as const,
    isStickyColumn: true,
    stickyMinWidth: '2rem',
    stickyLeftOffset: '0',
  };
  const nameColumn = {
    modifier: 'nowrap' as const,
    isStickyColumn: columns[0] === 'name',
    hasRightBorder: columns[0] === 'name',
    stickyMinWidth: '12rem',
    stickyLeftOffset: '2rem',
  };

  const cell = (silence: Silence, column: SilenceColumn) => {
    switch (column) {
      case 'status':
        return <SilenceState silence={silence} />;
      case 'matchers':
        return (
          <LabelGroup style={{ maxWidth: '24rem' }}>
            {silence.matchers.map((matcher, index) => (
              <Label key={index}>{matcherText(matcher)}</Label>
            ))}
          </LabelGroup>
        );
      case 'startsAt':
      case 'endsAt': {
        const timestampMs = Date.parse(silence[column]);
        return Number.isFinite(timestampMs) ? (
          <time dateTime={silence[column]}>{new Date(timestampMs).toLocaleString()}</time>
        ) : (
          '—'
        );
      }
      default:
        return silence[column] || '—';
    }
  };

  return (
    <Table role="table" aria-label={t('Silences table')} variant="compact" gridBreakPoint="">
      <SilencesTableHeader
        silences={silences}
        columns={columns}
        sort={sort}
        onSort={onSort}
        selected={selected}
        onSelect={onSelect}
        selectionColumn={selectionColumn}
        nameColumn={nameColumn}
      />
      <Tbody>
        {silences.map((silence, index) => (
          <Tr key={silence.id ?? index}>
            <Td {...selectionColumn}>
              <Checkbox
                id={`select-silence-${silence.id ?? index}`}
                aria-label={t('Select {{name}}', { name: silence.name })}
                isDisabled={!silence.id}
                isChecked={!!silence.id && selected.has(silence.id)}
                onChange={(_, checked) => onSelect(silence.id ? [silence.id] : [], checked)}
              />
            </Td>
            {columns.map((column) => (
              <Td
                key={column}
                dataLabel={silenceColumnLabel(column, t)}
                {...(column === 'name' ? nameColumn : {})}
                style={column === 'name' ? undefined : { overflowWrap: 'anywhere' }}
              >
                {cell(silence, column)}
              </Td>
            ))}
            <Td isActionCell>
              <KebabDropdown
                ariaLabel={t('Actions for {{name}}', { name: silence.name })}
                dropdownItems={[
                  <Tooltip key="edit" content={t('Silence editing is not available yet')}>
                    <DropdownItem isAriaDisabled>{t('Edit silence')}</DropdownItem>
                  </Tooltip>,
                  <Tooltip key="expire" content={t('Expiring silences is not available yet')}>
                    <DropdownItem isAriaDisabled>{t('Expire silence')}</DropdownItem>
                  </Tooltip>,
                ]}
              />
            </Td>
          </Tr>
        ))}
        {silences.length === 0 && (
          <Tr>
            <Td colSpan={columns.length + 2}>
              <EmptyBox customMessage={t('No silences found')} />
            </Td>
          </Tr>
        )}
      </Tbody>
    </Table>
  );
}
