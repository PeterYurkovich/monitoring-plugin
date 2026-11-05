import {
  Alert,
  Button,
  Divider,
  Flex,
  FlexItem,
  FormSelect,
  FormSelectOption,
  PageSection,
  Panel,
  PanelHeader,
  PanelMain,
  PanelMainBody,
  SearchInput,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { ManageColumnsButton } from '@/features/alert-management-api/components/ManageColumnsButton';
import { SelectedFilters } from '@/features/alert-management-api/components/SelectedFilters';
import { TableColumnsModal } from '@/features/alert-management-api/components/TableColumnsModal';
import { useSilencesQuery } from '@/features/alert-management-api/hooks/useSilencesQuery';
import {
  defaultSilenceColumns,
  defaultSilenceFilters,
  filterSilences,
  normalizeSilences,
  parseSilenceColumns,
  SilenceColumn,
  silenceColumns,
  SilenceFilters,
  silenceStates,
  sortSilences,
  stateLabels,
} from '@/features/alert-management-api/pages/silences-page/silences';
import { SilencesTable } from '@/features/alert-management-api/pages/silences-page/SilencesTable';
import { useTablePagination } from '@/shared/components/table/hooks/useTablePagination';
import { TablePagination } from '@/shared/components/table/TablePagination';
import { AccessDenied } from '@/shared/console/console-shared/src/components/empty-state/AccessDenied';
import { LoadingBox } from '@/shared/console/console-shared/src/components/loading/LoadingBox';

export function SilencesManagementPage() {
  const { t } = useTranslation(process.env.I18N_NAMESPACE);
  // Do not gate this page on combined data: rules can be unavailable independently.
  const silencesQuery = useSilencesQuery();
  const [params, setParams] = useSearchParams();
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [selection, setSelection] = useState<{
    scope: string;
    data: typeof silencesQuery.data;
    updatedAt: number;
    ids: Set<string>;
  }>();
  const pagination = useTablePagination({ perPage: 20 });
  const { page, perPage, setPage } = pagination;
  const filters = useMemo<SilenceFilters>(
    () => ({
      name: params.get('name') ?? '',
      state: params
        .getAll('state')
        .filter((value) => silenceStates.includes(value as (typeof silenceStates)[number]))
        .slice(0, 1),
    }),
    [params],
  );
  const columns = parseSilenceColumns(params.get('columns'));
  const column = columns.find((key) => key === params.get('sort')) ?? 'name';
  const direction = params.get('sortDirection') === 'desc' ? 'desc' : 'asc';
  const silences = useMemo(() => normalizeSilences(silencesQuery.data ?? []), [silencesQuery.data]);
  const filtered = useMemo(
    () => sortSilences(filterSilences(silences, filters), column, direction),
    [silences, filters, column, direction],
  );
  const filterScope = JSON.stringify(filters);
  // Selection belongs to this filter and data snapshot, never to hidden or refreshed rows.
  const selected =
    selection?.scope === filterScope &&
    selection.data === silencesQuery.data &&
    selection.updatedAt === silencesQuery.dataUpdatedAt
      ? selection.ids
      : new Set<string>();
  if (selection && selected !== selection.ids) setSelection(undefined);
  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
    if (silencesQuery.data && page > lastPage) setPage(lastPage, { replace: true });
  }, [filtered.length, perPage, page, setPage, silencesQuery.data]);
  const setFilters = (next: SilenceFilters) =>
    setParams((current) => {
      const updated = new URLSearchParams(current);
      updated.delete('name');
      updated.delete('state');
      if (next.name) updated.set('name', next.name);
      next.state.forEach((state) => updated.append('state', state));
      updated.set('page', '1');
      return updated;
    });
  const onSort = (key: SilenceColumn, next: 'asc' | 'desc') =>
    setParams((current) => {
      const updated = new URLSearchParams(current);
      updated.set('sort', key);
      updated.set('sortDirection', next);
      updated.set('page', '1');
      return updated;
    });
  if (silencesQuery.isLoading && !silencesQuery.data) return <LoadingBox />;
  if (silencesQuery.isError && !silencesQuery.data)
    return <AccessDenied message={silencesQuery.error?.message ?? ''} />;
  return (
    <PageSection hasBodyWrapper={false} isFilled>
      {silencesQuery.isError && (
        <Alert isInline variant="warning" title={t('Silences could not be refreshed')}>
          {silencesQuery.error?.message}
        </Alert>
      )}
      <Panel variant="bordered">
        <PanelHeader>
          <Title headingLevel="h2" size="lg">
            {t('Silences')}
          </Title>
        </PanelHeader>
        <Divider />
        <PanelMain>
          <PanelMainBody style={{ paddingBlock: 'var(--pf-t--global--spacer--sm)' }}>
            <Flex alignItems={{ default: 'alignItemsCenter' }}>
              <FlexItem>
                <FormSelect
                  aria-label={t('Silence state')}
                  value={filters.state[0] ?? ''}
                  onChange={(_, state) => setFilters({ ...filters, state: state ? [state] : [] })}
                  style={{ width: 'auto' }}
                >
                  <FormSelectOption value="" label={t('All silence states')} />
                  {silenceStates.map((state) => (
                    <FormSelectOption key={state} value={state} label={t(stateLabels[state])} />
                  ))}
                </FormSelect>
              </FlexItem>
              <FlexItem grow={{ default: 'grow' }}>
                <SearchInput
                  aria-label={t('Search by silence name')}
                  placeholder={t('Search by silence name')}
                  value={filters.name}
                  onChange={(_, name) => setFilters({ ...filters, name })}
                  onClear={() => setFilters({ ...filters, name: '' })}
                />
              </FlexItem>
              <FlexItem>
                <Tooltip content={t('Expiring silences is not available yet')}>
                  <Button variant="secondary" isAriaDisabled>
                    {t('Expire selected silences')} ({selected.size})
                  </Button>
                </Tooltip>
              </FlexItem>
              <FlexItem>
                <Tooltip content={t('Silence creation is not available yet')}>
                  <Button variant="primary" isAriaDisabled>
                    {t('Create silence')}
                  </Button>
                </Tooltip>
              </FlexItem>
            </Flex>
            <SelectedFilters<SilenceFilters, 'state'>
              filters={filters}
              defaults={defaultSilenceFilters}
              labels={{ state: 'Status' }}
              formatLabelText={(_, value) => t(stateLabels[value] ?? value)}
              onChange={setFilters}
            />
          </PanelMainBody>
        </PanelMain>
        <Divider />
        <PanelMain>
          <PanelMainBody style={{ paddingBlock: 'var(--pf-t--global--spacer--sm)' }}>
            <TablePagination
              itemCount={filtered.length}
              {...pagination}
              variant="top"
              isCompact
              rightActions={<ManageColumnsButton onClick={() => setColumnsOpen(true)} />}
            />
            <Divider style={{ marginBlockStart: 'var(--pf-t--global--spacer--sm)' }} />
            <div style={{ overflowX: 'auto' }}>
              <SilencesTable
                silences={filtered.slice((page - 1) * perPage, page * perPage)}
                columns={columns}
                column={column}
                direction={direction}
                onSort={onSort}
                selected={selected}
                onSelect={(ids, checked) =>
                  setSelection(() => {
                    const next = new Set(selected);
                    ids.forEach((id) => {
                      if (checked) next.add(id);
                      else next.delete(id);
                    });
                    return {
                      scope: filterScope,
                      data: silencesQuery.data,
                      updatedAt: silencesQuery.dataUpdatedAt,
                      ids: next,
                    };
                  })
                }
              />
            </div>
            {filtered.length > 0 && (
              <TablePagination itemCount={filtered.length} {...pagination} variant="bottom" />
            )}
          </PanelMainBody>
        </PanelMain>
      </Panel>
      {columnsOpen && (
        <TableColumnsModal
          isOpen
          definitions={silenceColumns}
          columns={columns}
          defaults={defaultSilenceColumns}
          required={['name']}
          onClose={() => setColumnsOpen(false)}
          onSave={(next) => {
            setParams((current) => {
              const updated = new URLSearchParams(current);
              updated.set('columns', JSON.stringify(next));
              if (!next.includes(column)) {
                updated.delete('sort');
                updated.delete('sortDirection');
              }
              return updated;
            });
            setColumnsOpen(false);
          }}
        />
      )}
    </PageSection>
  );
}
