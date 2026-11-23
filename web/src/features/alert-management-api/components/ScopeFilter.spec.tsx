/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';

import { ScopeFilter } from '@/features/alert-management-api/components/ScopeFilter';

const { t } = vi.hoisted(() => ({
  t: vi.fn((key: string, values?: Record<string, string>) =>
    key.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => values?.[name] ?? name),
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t }),
}));

const scopeLabels = { label: 'Alert scope', tooltip: 'Alert scope tooltip' };

it('selects All when no scope filter is applied', () => {
  render(<ScopeFilter {...scopeLabels} selected={[]} onChange={vi.fn()} />);

  expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Cluster' }).getAttribute('aria-pressed')).toBe(
    'false',
  );
  expect(screen.getByRole('button', { name: 'Namespace' }).getAttribute('aria-pressed')).toBe(
    'false',
  );
});

it('replaces the current scope and clears it when All is selected', () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <ScopeFilter {...scopeLabels} selected={['Cluster']} onChange={onChange} />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Namespace' }));

  expect(onChange).toHaveBeenLastCalledWith(['Namespace']);

  rerender(<ScopeFilter {...scopeLabels} selected={['Namespace']} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'All' }));

  expect(onChange).toHaveBeenLastCalledWith([]);
});

it.each(['Cluster', 'Namespace'])('keeps %s selected when clicked again', (scope) => {
  const onChange = vi.fn();
  render(<ScopeFilter {...scopeLabels} selected={[scope]} onChange={onChange} />);

  fireEvent.click(screen.getByRole('button', { name: scope }));

  expect(onChange).toHaveBeenCalledWith([scope]);
  expect(screen.getByRole('button', { name: scope }).getAttribute('aria-pressed')).toBe('true');
});

it('shows restored scope selections', () => {
  render(<ScopeFilter {...scopeLabels} selected={['Cluster', 'Namespace']} onChange={vi.fn()} />);

  for (const scope of ['Cluster', 'Namespace']) {
    expect(screen.getByRole('button', { name: scope }).getAttribute('aria-pressed')).toBe('true');
  }
  expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('false');
});

it('provides help for the scope filter', async () => {
  render(<ScopeFilter {...scopeLabels} selected={[]} onChange={vi.fn()} />);

  fireEvent.mouseEnter(screen.getByRole('button', { name: 'Help for Alert scope' }));

  expect((await screen.findByRole('tooltip')).textContent).toBe('Alert scope tooltip');
  expect(screen.getByRole('group', { name: 'Alert scope' })).toBeDefined();
});
