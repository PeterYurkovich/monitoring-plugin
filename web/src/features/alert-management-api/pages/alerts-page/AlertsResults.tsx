import {
  ActionList,
  ActionListGroup,
  ActionListItem,
  Button,
  Divider,
  Flex,
  FlexItem,
  PanelMain,
  PanelMainBody,
  Switch,
} from '@patternfly/react-core';
import { BellSlashIcon, ColumnsIcon } from '@patternfly/react-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryParam } from 'use-query-params';

import { ManageColumnsModal } from '@/features/alert-management-api/components/ManageColumnsModal';
import { useAlertManagementSort } from '@/features/alert-management-api/hooks/useAlertManagementSort';
import { AlertsTable } from '@/features/alert-management-api/pages/alerts-page/alerts-table/AlertsTable';
import type { AlertsTableRef } from '@/features/alert-management-api/pages/alerts-page/alerts-table/AlertsTable';
import { ExportAlertsButton } from '@/features/alert-management-api/pages/alerts-page/components/ExportAlertsButton';
import { GroupByDropdown } from '@/features/alert-management-api/pages/alerts-page/components/GroupByDropdown';
import {
  defaultVisibleAlertColumns,
  OptionalAlertColumn,
} from '@/features/alert-management-api/pages/alerts-page/utils/alert-columns';
import { AlertGroupByParam } from '@/features/alert-management-api/pages/alerts-page/utils/alert-group-by-param';
import {
  groupAlerts,
  paginateAlertGroups,
} from '@/features/alert-management-api/pages/alerts-page/utils/group-alerts';
import type { AlertGroupBy } from '@/features/alert-management-api/pages/alerts-page/utils/group-alerts';
import { AlertFilters, ManagedAlert } from '@/features/alert-management-api/types/types';
import { filterAlerts, getAlertStableKey } from '@/features/alert-management-api/utils/alerts';
import { defaultAlertSort } from '@/features/alert-management-api/utils/sort-alerts';
import { useTablePagination } from '@/shared/components/table/hooks/useTablePagination';
import { TablePagination } from '@/shared/components/table/TablePagination';
import { DataTestIDs } from '@/shared/constants/data-test';
import { QueryParams } from '@/shared/constants/query-params';

type AlertsResultsProps = {
  alerts: ManagedAlert[];
  filters: AlertFilters;
};

export function AlertsResults({ alerts, filters }: AlertsResultsProps) {
  const { t } = useTranslation(process.env.I18N_NAMESPACE);

  const [groupBy] = useQueryParam(QueryParams.GroupBy, AlertGroupByParam);
  const previousGroupBy = useRef(groupBy);

  const alertsTableRef = useRef<AlertsTableRef>(null);

  const [isAggregated, setAggregated] = useState(true);

  const [visibleColumns, setVisibleColumns] = useState<Set<OptionalAlertColumn>>(
    () => new Set(defaultVisibleAlertColumns),
  );
  const [isManageColumnsOpen, setManageColumnsOpen] = useState(false);

  const [selectedAlertKeys, setSelectedAlertKeys] = useState<Set<string>>(() => new Set());
  const selectedAlerts = alerts.filter((alert) => selectedAlertKeys.has(getAlertStableKey(alert)));

  const { sort, setSort } = useAlertManagementSort();
  const { column, direction } = sort;
  const pagination = useTablePagination({ perPage: 20 });
  const { page, perPage, onSetPage } = pagination;

  const filterKey = JSON.stringify(filters);
  const previousFilters = useRef(filterKey);

  const filteredAlerts = useMemo(() => filterAlerts(alerts, filters), [alerts, filters]);
  const groups = useMemo(
    () => groupAlerts(filteredAlerts, groupBy, isAggregated, { column, direction }),
    [filteredAlerts, groupBy, isAggregated, column, direction],
  );
  const aggregatedAlerts = groups.flatMap((group) => group.rows);
  const pageGroups = paginateAlertGroups(groups, page, perPage);
  const pageAlerts = pageGroups.flatMap((group) => group.rows);

  useEffect(() => {
    if (previousFilters.current !== filterKey || previousGroupBy.current !== groupBy) {
      previousFilters.current = filterKey;
      previousGroupBy.current = groupBy;
      onSetPage(undefined, 1);
    } else {
      const lastPage = Math.max(1, Math.ceil(aggregatedAlerts.length / perPage));
      if (page > lastPage) onSetPage(undefined, lastPage);
    }
  }, [filterKey, groupBy, aggregatedAlerts.length, page, perPage, onSetPage]);

  const saveColumns = (newColumns: Set<OptionalAlertColumn>) => {
    if (!newColumns.has(sort.column as OptionalAlertColumn)) {
      setSort(defaultAlertSort);
    }
    setVisibleColumns(newColumns);
  };

  return (
    <PanelMain>
      <PanelMainBody style={{ paddingBlock: 'var(--pf-t--global--spacer--sm)' }}>
        <TablePagination
          itemCount={aggregatedAlerts.length}
          page={page}
          perPage={perPage}
          onSetPage={pagination.onSetPage}
          onPerPageSelect={pagination.onPerPageSelect}
          variant="top"
          isCompact
          leftActions={
            <LayoutControls
              groupBy={groupBy}
              isAggregated={isAggregated}
              onExpandAllGroups={() => alertsTableRef.current?.expandAllGroups()}
              onCollapseAllGroups={() => alertsTableRef.current?.collapseAllGroups()}
              onAggregateChange={(checked) => {
                setAggregated(checked);
                pagination.onSetPage(undefined, 1);
                if (!checked && sort.column === 'total') setSort(defaultAlertSort);
              }}
            />
          }
          rightActions={
            <Flex alignItems={{ default: 'alignItemsCenter' }}>
              {selectedAlerts.length > 0 && (
                <FlexItem>
                  <Button
                    variant="secondary"
                    icon={<BellSlashIcon />}
                    onClick={() =>
                      // eslint-disable-next-line no-console
                      console.debug(
                        `silencing ${selectedAlerts.length} alerts: ${selectedAlerts
                          .map((alert) => alert.labels.alertname ?? alert.rule.name)
                          .join(', ')}`,
                      )
                    }
                  >
                    {t('Silence ({{selectedCount}})', {
                      selectedCount: selectedAlerts.length,
                    })}
                  </Button>
                </FlexItem>
              )}
              <FlexItem>
                <ActionList isIconList>
                  <ActionListItem>
                    <Button
                      variant="control"
                      icon={<ColumnsIcon />}
                      aria-label={t('Manage columns')}
                      title={t('Manage columns')}
                      onClick={() => setManageColumnsOpen(true)}
                    />
                  </ActionListItem>
                  <ActionListItem>
                    <ExportAlertsButton alerts={aggregatedAlerts} />
                  </ActionListItem>
                </ActionList>
              </FlexItem>
            </Flex>
          }
        />
        <Divider style={{ marginBlockStart: 'var(--pf-t--global--spacer--sm)' }} />
        <AlertsTable
          ref={alertsTableRef}
          alerts={pageAlerts}
          groups={pageGroups}
          groupBy={groupBy}
          isAggregated={isAggregated}
          visibleColumns={visibleColumns}
          sort={sort}
          selectedAlertKeys={selectedAlertKeys}
          onSelectionChange={setSelectedAlertKeys}
          onSort={(nextSort) => {
            setSort(nextSort);
            pagination.onSetPage(undefined, 1);
          }}
        />
        {aggregatedAlerts.length > 0 && (
          <TablePagination
            itemCount={aggregatedAlerts.length}
            page={page}
            perPage={perPage}
            onSetPage={pagination.onSetPage}
            onPerPageSelect={pagination.onPerPageSelect}
            variant="bottom"
          />
        )}
        <ManageColumnsModal
          isOpen={isManageColumnsOpen}
          isAggregated={isAggregated}
          columns={visibleColumns}
          onSave={(columns) => {
            saveColumns(columns);
            setManageColumnsOpen(false);
          }}
          onClose={() => setManageColumnsOpen(false)}
        />
      </PanelMainBody>
    </PanelMain>
  );
}

function LayoutControls({
  groupBy,
  isAggregated,
  onExpandAllGroups,
  onCollapseAllGroups,
  onAggregateChange,
}: {
  groupBy: AlertGroupBy;
  isAggregated: boolean;
  onExpandAllGroups: () => void;
  onCollapseAllGroups: () => void;
  onAggregateChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation(process.env.I18N_NAMESPACE);

  return (
    <Flex alignItems={{ default: 'alignItemsCenter' }}>
      <FlexItem>
        <strong>{t('Layout')}</strong>
      </FlexItem>
      <FlexItem>
        <GroupByDropdown />
      </FlexItem>
      {groupBy !== 'none' && (
        <FlexItem>
          <ActionList>
            <ActionListGroup>
              <ActionListItem>
                <Button
                  variant="link"
                  isInline
                  aria-label={t('Expand all groups on this page')}
                  onClick={onExpandAllGroups}
                >
                  {t('Expand all')}
                </Button>
              </ActionListItem>
              <ActionListItem>
                <Button
                  variant="link"
                  isInline
                  aria-label={t('Collapse all groups on this page')}
                  onClick={onCollapseAllGroups}
                >
                  {t('Collapse all')}
                </Button>
              </ActionListItem>
            </ActionListGroup>
          </ActionList>
        </FlexItem>
      )}
      <FlexItem>
        <Switch
          id={DataTestIDs.AlertManagementAPI.AggregateIdenticalAlertsSwitch}
          label={t('Aggregate identical alerts')}
          isChecked={isAggregated}
          onChange={(_event, checked) => onAggregateChange(checked)}
        />
      </FlexItem>
    </Flex>
  );
}
