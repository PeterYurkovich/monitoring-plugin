/** @vitest-environment jsdom */
import { Table } from '@patternfly/react-table';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';

import { SilencesTableHeader } from '@/features/alert-management-api/pages/silences-page/components/SilencesTableHeader';
import {
  defaultSilenceColumns,
  defaultSilenceSort,
} from '@/features/alert-management-api/pages/silences-page/utils/silences';
import { makeManagedSilence } from '@/features/alert-management-api/tests/utils/object-factories';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const silences = [makeManagedSilence({ id: 'a' }), makeManagedSilence({ id: 'b' })];
function renderHeader(props: Partial<ComponentProps<typeof SilencesTableHeader>> = {}) {
  return render(
    <Table>
      <SilencesTableHeader
        silences={silences}
        columns={defaultSilenceColumns}
        sort={defaultSilenceSort}
        onSort={vi.fn()}
        selected={new Set()}
        onSelect={vi.fn()}
        selectionColumn={{}}
        nameColumn={{}}
        {...props}
      />
    </Table>,
  );
}

it('sorts the correct column after reordering and indicates the active direction', () => {
  const onSort = vi.fn();
  renderHeader({
    columns: ['state', 'name'],
    sort: { column: 'state', direction: 'desc' },
    onSort,
  });
  expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
    '',
    'State',
    'Silence name',
    'Actions',
  ]);
  expect(screen.getByRole('columnheader', { name: 'State' }).getAttribute('aria-sort')).toBe(
    'descending',
  );
  fireEvent.click(screen.getByRole('button', { name: 'State' }));
  expect(onSort).toHaveBeenCalledWith('state', 'asc');
  fireEvent.click(screen.getByRole('button', { name: 'Silence name' }));
  expect(onSort).toHaveBeenCalledWith('name', 'asc');
});

it('indicates partial selection and selects only selectable IDs on the supplied page', () => {
  const onSelect = vi.fn();
  renderHeader({
    silences: [...silences, makeManagedSilence({ id: undefined })],
    selected: new Set(['a', 'off-page']),
    onSelect,
  });
  const checkbox = screen.getByRole('checkbox', {
    name: 'Select all silences on this page',
  }) as HTMLInputElement;
  expect(checkbox.indeterminate).toBe(true);
  fireEvent.click(checkbox);
  expect(onSelect).toHaveBeenCalledWith(['a', 'b'], true);
});

it('deselects only the current page', () => {
  const onSelect = vi.fn();
  renderHeader({ selected: new Set(['a', 'b', 'off-page']), onSelect });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all silences on this page' }));
  expect(onSelect).toHaveBeenCalledWith(['a', 'b'], false);
});

it.each([{ silences: [] }, { silences: [makeManagedSilence({ id: undefined })] }])(
  'disables selection when no selectable IDs are present: $silences',
  ({ silences }) => {
    renderHeader({ silences });
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Select all silences on this page',
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
  },
);
