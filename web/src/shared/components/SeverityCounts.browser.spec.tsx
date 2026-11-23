import { Alert, AlertSeverity } from '@openshift-console/dynamic-plugin-sdk';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import translations from '@/../locales/en/plugin__monitoring-plugin.json';
import { SeverityCounts } from '@/shared/components/SeverityCounts';

vi.unmock('react-i18next');

const i18n = createInstance();
const namespace = process.env.I18N_NAMESPACE;

beforeAll(async () => {
  await i18n.init({
    lng: 'en',
    defaultNS: namespace,
    resources: { en: { [namespace]: translations } },
  });
});

const makeAlerts = (severities: (string | undefined)[]): Alert[] =>
  severities.map((severity) => ({ labels: { severity } }) as Alert);

const mountCounts = (alerts: Alert[]) =>
  render(
    <I18nextProvider i18n={i18n}>
      <SeverityCounts alerts={alerts} />
    </I18nextProvider>,
  );

describe('SeverityCounts', () => {
  it.each([
    { label: 'empty', alerts: [] },
    { label: 'undefined', alerts: undefined },
    { label: 'null', alerts: null },
  ])('renders a dash without badges for $label alerts', async ({ alerts }) => {
    const screen = await mountCounts(alerts);
    await expect.element(screen.getByText('-', { exact: true })).toBeVisible();
    expect(screen.container.querySelectorAll('.pf-v6-c-label')).toHaveLength(0);
  });

  it('groups alerts into badges ordered critical, warning, then info', async () => {
    const screen = await mountCounts(
      makeAlerts([
        AlertSeverity.Info,
        AlertSeverity.Warning,
        AlertSeverity.Critical,
        AlertSeverity.Info,
        AlertSeverity.Warning,
        AlertSeverity.Info,
      ]),
    );
    const badges = screen.container.querySelectorAll<HTMLElement>('.pf-v6-c-label');
    expect(badges).toHaveLength(3);
    for (const [index, { count, status }] of [
      { count: '1', status: 'danger' },
      { count: '2', status: 'warning' },
      { count: '3', status: 'info' },
    ].entries()) {
      await expect.element(badges[index]).toHaveTextContent(count);
      await expect.element(badges[index]).toHaveClass(`pf-m-${status}`);
    }
  });

  describe.each([
    { severity: AlertSeverity.Critical, label: 'Critical', status: 'danger' },
    { severity: AlertSeverity.Warning, label: 'Warning', status: 'warning' },
    { severity: AlertSeverity.Info, label: 'Info', status: 'info' },
  ])('$label alerts', ({ severity, label, status }) => {
    it.each([1, 2])(
      'renders only the nonzero badge with a tooltip for %i alerts',
      async (count) => {
        const screen = await mountCounts(makeAlerts(Array(count).fill(severity)));
        const badges = screen.container.querySelectorAll<HTMLElement>('.pf-v6-c-label');
        expect(badges).toHaveLength(1);
        await expect.element(badges[0]).toHaveTextContent(String(count));
        await expect.element(badges[0]).toHaveClass(`pf-m-${status}`);

        await page.elementLocator(badges[0]).hover();
        const expectedText = `${count} ${label} ${count === 1 ? 'Alert' : 'Alerts'}`;
        await expect.element(page.getByRole('tooltip')).toHaveTextContent(expectedText);
      },
    );
  });

  it.each([AlertSeverity.None, 'unknown', '', undefined])(
    'counts severity %j as info',
    async (severity) => {
      const screen = await mountCounts(makeAlerts([severity, AlertSeverity.Info]));
      const badges = screen.container.querySelectorAll<HTMLElement>('.pf-v6-c-label');
      expect(badges).toHaveLength(1);
      await expect.element(badges[0]).toHaveTextContent('2');
      await expect.element(badges[0]).toHaveClass('pf-m-info');

      await page.elementLocator(badges[0]).hover();
      await expect.element(page.getByRole('tooltip')).toHaveTextContent('2 Info Alerts');
    },
  );
});
