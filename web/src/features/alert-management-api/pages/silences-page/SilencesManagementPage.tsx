import {
  Alert,
  Button,
  Divider,
  Flex,
  FlexItem,
  PageSection,
  Panel,
  PanelHeader,
  PanelMain,
  PanelMainBody,
  SearchInput,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import { RhUiFilterFillIcon } from '@patternfly/react-icons';
import { InnerScrollContainer } from '@patternfly/react-table';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { ManageColumnsButton } from '@/features/alert-management-api/components/ManageColumnsButton';
import { PageWithFilters } from '@/features/alert-management-api/components/PageWithFilters';
import { SelectedFilters } from '@/features/alert-management-api/components/SelectedFilters';
import { TableColumnsModal } from '@/features/alert-management-api/components/TableColumnsModal';
import { useAlertManagementData } from '@/features/alert-management-api/hooks/useAlertManagementData';
import { useAlertManagementSort } from '@/features/alert-management-api/hooks/useAlertManagementSort';
import { SilencesFilterPanel } from '@/features/alert-management-api/pages/silences-page/components/SilencesFilterPanel';
import { SilencesTable } from '@/features/alert-management-api/pages/silences-page/components/SilencesTable';
import {
  defaultSilenceColumns,
  defaultSilenceFilters,
  defaultSilenceSort,
  emptySilenceFilters,
  filterSilences,
  parseSilenceColumns,
  requiredSilenceColumns,
  silenceColumns,
  SilenceFilterKey,
  silenceFilterKeys,
  silenceFilterLabels,
  SilenceFilters,
  silenceStateLabel,
  silenceStates,
  sortSilences,
  toManagedSilence,
} from '@/features/alert-management-api/pages/silences-page/utils/silences';
import {
  parseFilterParams,
  serializeFilterParams,
} from '@/features/alert-management-api/utils/filter-params';
import { useTablePagination } from '@/shared/components/table/hooks/useTablePagination';
import { TablePagination } from '@/shared/components/table/TablePagination';
import { AccessDenied } from '@/shared/console/console-shared/src/components/empty-state/AccessDenied';
import { LoadingBox } from '@/shared/console/console-shared/src/components/loading/LoadingBox';
import { QueryParams } from '@/shared/constants/query-params';

const filtersId = 'silence-filters';

export function SilencesManagementPage() {
  const { t } = useTranslation(process.env.I18N_NAMESPACE);
  const { data, rulesQuery, alertsQuery, silencesQuery } = useAlertManagementData();
  const updatedAtMs = Math.max(
    rulesQuery.dataUpdatedAt,
    alertsQuery.dataUpdatedAt,
    silencesQuery.dataUpdatedAt,
  );
  const [params, setParams] = useSearchParams();
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selection, setSelection] = useState<{
    scope: string;
    data: typeof data;
    updatedAtMs: number;
    ids: Set<string>;
  }>();
  const pagination = useTablePagination({ perPage: 20 });
  const { page, perPage, setPage } = pagination;

  const filters = useMemo<SilenceFilters>(() => {
    const parsed = parseFilterParams(params, defaultSilenceFilters, silenceFilterKeys);
    return {
      ...parsed,
      state: params.has('state')
        ? parsed.state.filter((value) =>
            silenceStates.includes(value as (typeof silenceStates)[number]),
          )
        : defaultSilenceFilters.state,
      scope: parsed.scope.filter((value) => value === 'Cluster' || value === 'Namespace'),
    };
  }, [params]);

  const columns = parseSilenceColumns(params.get(QueryParams.Columns));

  const { sort, setSort } = useAlertManagementSort(columns, defaultSilenceSort);
  const { column, direction } = sort;

  const managedSilences = useMemo(
    () => (data?.silences ?? []).map(toManagedSilence),
    [data?.silences],
  );
  const filteredSilences = useMemo(
    () => sortSilences(filterSilences(managedSilences, filters), { column, direction }),
    [managedSilences, filters, column, direction],
  );

  const pageSilences = filteredSilences.slice((page - 1) * perPage, page * perPage);
  const filterScope = JSON.stringify(filters);

  // Selection belongs to this filter and data snapshot, never to hidden or refreshed rows.
  const selected =
    selection?.scope === filterScope &&
    selection.data === data &&
    selection.updatedAtMs === updatedAtMs
      ? selection.ids
      : new Set<string>();
  if (selection && selected !== selection.ids) {
    setSelection(undefined);
  }

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredSilences.length / perPage));
    if (data && page > lastPage) {
      setPage(lastPage, { replace: true });
    }
  }, [filteredSilences.length, perPage, page, setPage, data]);

  const setFilters = (next: SilenceFilters) => {
    setParams((current) => {
      const updated = serializeFilterParams(current, next, silenceFilterKeys);
      // Preserve an explicit all-states choice instead of restoring the default states.
      if (next.state.length === 0) {
        updated.set('state', '');
      }
      updated.set(QueryParams.Page, '1');
      return updated;
    });
  };

  const isLoading =
    (rulesQuery.isLoading && !rulesQuery.data) ||
    (alertsQuery.isLoading && !alertsQuery.data) ||
    (silencesQuery.isLoading && !silencesQuery.data);
  const error = silencesQuery.error ?? rulesQuery.error ?? alertsQuery.error;

  if (isLoading) {
    return <LoadingBox />;
  }

  if (
    (silencesQuery.isError && !silencesQuery.data) ||
    ((rulesQuery.isError || alertsQuery.isError) && !data)
  ) {
    return <AccessDenied message={error?.message ?? ''} />;
  }

  return (
    <PageSection hasBodyWrapper={false} isFilled>
      {(silencesQuery.isError || rulesQuery.isError || alertsQuery.isError) && (
        <Alert isInline variant="warning" title={t('Silences could not be refreshed')}>
          {error?.message}
        </Alert>
      )}
      <PageWithFilters
        filtersId={filtersId}
        filters={
          filtersOpen && (
            <SilencesFilterPanel
              silences={managedSilences}
              filters={filters}
              onChange={setFilters}
              onClose={() => setFiltersOpen(false)}
            />
          )
        }
      >
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
                <Button
                  variant="control"
                  icon={<RhUiFilterFillIcon />}
                  aria-expanded={filtersOpen}
                  aria-controls={filtersId}
                  aria-label={t('Open silence filters')}
                  onClick={() => setFiltersOpen((open) => !open)}
                >
                  {t('Filters')}
                </Button>
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
                  <Tooltip content={t('Silence creation is not available yet')}>
                    <Button variant="primary" isAriaDisabled>
                      {t('Create silence')}
                    </Button>
                  </Tooltip>
                </FlexItem>
              </Flex>
              <SelectedFilters<SilenceFilters, SilenceFilterKey>
                filters={filters}
                defaults={emptySilenceFilters}
                labels={silenceFilterLabels}
                formatLabelText={(key, value) => {
                  if (key === 'state') {
                    return silenceStateLabel(value, t);
                  }
                  return key === 'scope' ? t(value) : value;
                }}
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
                rightActions={
                  <Flex alignItems={{ default: 'alignItemsCenter' }}>
                    {selected.size > 0 && (
                      <FlexItem>
                        <Tooltip content={t('Expiring silences is not available yet')}>
                          <Button variant="secondary" isAriaDisabled>
                            {t('Expire selected silences')} ({selected.size})
                          </Button>
                        </Tooltip>
                      </FlexItem>
                    )}
                    <FlexItem>
                      <ManageColumnsButton onClick={() => setColumnsOpen(true)} />
                    </FlexItem>
                  </Flex>
                }
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
                        data,
                        updatedAtMs,
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
      </PageWithFilters>
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
