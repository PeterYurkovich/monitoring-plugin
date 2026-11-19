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
import { InnerScrollContainer } from '@patternfly/react-table';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { ManageColumnsButton } from '@/features/alert-management-api/components/ManageColumnsButton';
import { SelectedFilters } from '@/features/alert-management-api/components/SelectedFilters';
import { TableColumnsModal } from '@/features/alert-management-api/components/TableColumnsModal';
import { useAlertManagementSort } from '@/features/alert-management-api/hooks/useAlertManagementSort';
import { useSilencesQuery } from '@/features/alert-management-api/hooks/useSilencesQuery';
import {
  defaultSilenceColumns,
  defaultSilenceFilters,
  defaultSilenceSort,
  filterSilences,
  normalizeSilences,
  parseSilenceColumns,
  requiredSilenceColumns,
  silenceColumns,
  silenceFilterKeys,
  SilenceFilters,
  silenceStates,
  sortSilences,
  stateLabels,
} from '@/features/alert-management-api/pages/silences-page/silences';
import { SilencesTable } from '@/features/alert-management-api/pages/silences-page/SilencesTable';
import {
  parseFilterParams,
  serializeFilterParams,
} from '@/features/alert-management-api/utils/filter-params';
import { useTablePagination } from '@/shared/components/table/hooks/useTablePagination';
import { TablePagination } from '@/shared/components/table/TablePagination';
import { AccessDenied } from '@/shared/console/console-shared/src/components/empty-state/AccessDenied';
import { LoadingBox } from '@/shared/console/console-shared/src/components/loading/LoadingBox';
import { QueryParams } from '@/shared/constants/query-params';

export function SilencesManagementPage() {
  const { t } = useTranslation(process.env.I18N_NAMESPACE);
  // Do not gate this page on combined data: rules can be unavailable independently.
  const silencesQuery = useSilencesQuery();
  const [params, setParams] = useSearchParams();
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [selection, setSelection] = useState<{
    scope: string;
    data: typeof silencesQuery.data;
    updatedAtMs: number;
    ids: Set<string>;
  }>();
  const pagination = useTablePagination({ perPage: 20 });
  const { page, perPage, setPage } = pagination;
  const filters = useMemo<SilenceFilters>(() => {
    const parsed = parseFilterParams(params, defaultSilenceFilters, silenceFilterKeys);
    return {
      ...parsed,
      state: parsed.state
        .filter((value) => silenceStates.includes(value as (typeof silenceStates)[number]))
        .slice(0, 1),
    };
  }, [params]);
  const columns = parseSilenceColumns(params.get(QueryParams.Columns));
  const { sort, setSort } = useAlertManagementSort(columns, defaultSilenceSort);
  const { column, direction } = sort;
  const silences = useMemo(() => normalizeSilences(silencesQuery.data ?? []), [silencesQuery.data]);
  const filteredSilences = useMemo(
    () => sortSilences(filterSilences(silences, filters), { column, direction }),
    [silences, filters, column, direction],
  );
  const pageSilences = filteredSilences.slice((page - 1) * perPage, page * perPage);
  const filterScope = JSON.stringify(filters);
  // Selection belongs to this filter and data snapshot, never to hidden or refreshed rows.
  const selected =
    selection?.scope === filterScope &&
    selection.data === silencesQuery.data &&
    selection.updatedAtMs === silencesQuery.dataUpdatedAt
      ? selection.ids
      : new Set<string>();
  if (selection && selected !== selection.ids) {
    setSelection(undefined);
  }

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredSilences.length / perPage));
    if (silencesQuery.data && page > lastPage) {
      setPage(lastPage, { replace: true });
    }
  }, [filteredSilences.length, perPage, page, setPage, silencesQuery.data]);

  const setFilters = (next: SilenceFilters) => {
    setParams((current) => {
      const updated = serializeFilterParams(current, next, silenceFilterKeys);
      updated.set(QueryParams.Page, '1');
      return updated;
    });
  };

  if (silencesQuery.isLoading && !silencesQuery.data) {
    return <LoadingBox />;
  }
  if (silencesQuery.isError && !silencesQuery.data) {
    return <AccessDenied message={silencesQuery.error?.message ?? ''} />;
  }
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
              itemCount={filteredSilences.length}
              {...pagination}
              variant="top"
              isCompact
              rightActions={<ManageColumnsButton onClick={() => setColumnsOpen(true)} />}
            />
            <Divider style={{ marginBlockStart: 'var(--pf-t--global--spacer--sm)' }} />
            <InnerScrollContainer
              tabIndex={0}
              role="region"
              aria-label={t('Silences table scroll area')}
            >
              <SilencesTable
                silences={pageSilences}
                columns={columns}
                sort={sort}
                onSort={(column, direction) => setSort({ column, direction })}
                selected={selected}
                onSelect={(ids, checked) =>
                  setSelection(() => {
                    const next = new Set(selected);
                    ids.forEach((id) => {
                      if (checked) {
                        next.add(id);
                      } else {
                        next.delete(id);
                      }
                    });
                    return {
                      scope: filterScope,
                      data: silencesQuery.data,
                      updatedAtMs: silencesQuery.dataUpdatedAt,
                      ids: next,
                    };
                  })
                }
              />
            </InnerScrollContainer>
            {filteredSilences.length > 0 && (
              <TablePagination
                itemCount={filteredSilences.length}
                {...pagination}
                variant="bottom"
              />
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
          required={requiredSilenceColumns}
          onClose={() => setColumnsOpen(false)}
          onSave={(next) => {
            setParams((current) => {
              const updated = new URLSearchParams(current);
              updated.set(QueryParams.Columns, JSON.stringify(next));
              if (!next.includes(column)) {
                updated.delete(QueryParams.Sort);
                updated.delete(QueryParams.SortDirection);
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
