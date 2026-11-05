import { Silence } from '@openshift-console/dynamic-plugin-sdk';
import { Checkbox, DropdownItem, Label, LabelGroup, Tooltip } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useTranslation } from 'react-i18next';

import {
  matcherText,
  SilenceColumn,
  silenceColumnLabel,
} from '@/features/alert-management-api/pages/silences-page/silences';
import KebabDropdown from '@/shared/components/KebabDropdown';
import { SilenceState } from '@/shared/components/SilenceState';
import { EmptyBox } from '@/shared/console/console-shared/src/components/empty-state/EmptyBox';

type Props = {
  silences: Silence[];
  columns: SilenceColumn[];
  column: SilenceColumn;
  direction: 'asc' | 'desc';
  onSort: (column: SilenceColumn, direction: 'asc' | 'desc') => void;
  selected: Set<string>;
  onSelect: (ids: string[], checked: boolean) => void;
};
export function SilencesTable({
  silences,
  columns,
  column,
  direction,
  onSort,
  selected,
  onSelect,
}: Props) {
  const { t } = useTranslation(process.env.I18N_NAMESPACE);
  const ids = silences.flatMap(({ id }) => (id ? [id] : []));
  const count = ids.filter((id) => selected.has(id)).length;
  const cell = (silence: Silence, key: SilenceColumn) => {
    if (key === 'status') return <SilenceState silence={silence} />;
    if (key === 'matchers')
      return (
        <LabelGroup style={{ maxWidth: '24rem' }}>
          {silence.matchers.map((matcher, index) => (
            <Label key={index}>{matcherText(matcher)}</Label>
          ))}
        </LabelGroup>
      );
    if (key === 'startsAt' || key === 'endsAt') {
      const timestampMs = Date.parse(silence[key]);
      return Number.isFinite(timestampMs) ? (
        <time dateTime={silence[key]}>{new Date(timestampMs).toLocaleString()}</time>
      ) : (
        '—'
      );
    }
    return silence[key] || '—';
  };
  return (
    <Table aria-label={t('Silences table')} variant="compact">
      <Thead>
        <Tr>
          <Th>
            <Checkbox
              id="select-page-silences"
              aria-label={t('Select all silences on this page')}
              isDisabled={!ids.length}
              isChecked={count > 0 && count < ids.length ? null : count > 0}
              onChange={(_, checked) => onSelect(ids, checked)}
            />
          </Th>
          {columns.map((key, index) => (
            <Th
              key={key}
              style={{ minWidth: key === 'name' ? '10rem' : '8rem', whiteSpace: 'nowrap' }}
              sort={{
                sortBy: { index: columns.indexOf(column), direction },
                columnIndex: index,
                onSort: (_, _index, next) => onSort(key, next),
              }}
            >
              {silenceColumnLabel(key, t)}
            </Th>
          ))}
          <Th screenReaderText={t('Actions')} />
        </Tr>
      </Thead>
      <Tbody>
        {silences.map((silence, index) => (
          <Tr key={silence.id ?? index}>
            <Td>
              <Checkbox
                id={`select-silence-${silence.id ?? index}`}
                aria-label={t('Select {{name}}', { name: silence.name })}
                isDisabled={!silence.id}
                isChecked={!!silence.id && selected.has(silence.id)}
                onChange={(_, checked) => onSelect(silence.id ? [silence.id] : [], checked)}
              />
            </Td>
            {columns.map((key) => (
              <Td
                key={key}
                dataLabel={silenceColumnLabel(key, t)}
                style={{ overflowWrap: 'anywhere' }}
              >
                {cell(silence, key)}
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
        {!silences.length && (
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
