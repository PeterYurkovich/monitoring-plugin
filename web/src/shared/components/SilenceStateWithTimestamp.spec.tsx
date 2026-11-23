/** @vitest-environment jsdom */
import { SilenceStates } from '@openshift-console/dynamic-plugin-sdk';
import { render, screen } from '@testing-library/react';

import { SilenceStateWithTimestamp } from '@/shared/components/SilenceStateWithTimestamp';

vi.mock('@openshift-console/dynamic-plugin-sdk', async () => ({
  ...(await vi.importActual('@/shared/test-utils/sdk-const-enums')),
  GreenCheckCircleIcon: () => <svg data-testid="active-icon" />,
  Timestamp: ({ timestamp }: { timestamp: string }) => (
    <time dateTime={timestamp}>{timestamp}</time>
  ),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

it.each([
  { state: SilenceStates.Active, label: 'Active', description: 'Ends', field: 'endsAt' },
  { state: SilenceStates.Pending, label: 'Pending', description: 'Starts', field: 'startsAt' },
  { state: SilenceStates.Expired, label: 'Expired', description: 'Expired', field: 'endsAt' },
] as const)(
  'reuses the legacy $label state with its $description timestamp',
  ({ state, label, description, field }) => {
    const silence = {
      id: 'silence',
      comment: '',
      createdBy: 'admin',
      startsAt: '2026-01-01T00:00:00Z',
      endsAt: '2026-01-02T00:00:00Z',
      matchers: [],
      firingAlerts: [],
      status: { state },
    };
    const { container } = render(<SilenceStateWithTimestamp silence={silence} />);
    expect(screen.getAllByText(label, { exact: true })[0]).toBeDefined();
    const timestamp = container.querySelector('time')!;
    expect(timestamp.getAttribute('datetime')).toBe(silence[field]);
    expect(timestamp.parentElement?.textContent).toContain(description);
    expect(container.querySelector('svg')).not.toBeNull();
  },
);
