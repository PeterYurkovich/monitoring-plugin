import { consoleFetchJSON, Silence } from '@openshift-console/dynamic-plugin-sdk';
import { useQuery } from '@tanstack/react-query';

import { getMockSilencesResponse } from '@/features/alert-management-api/tests/fixtures/mock-responses';
import { useMonitoring } from '@/shared/hooks/useMonitoring';
import { getAlertmanagerSilencesUrl } from '@/shared/utils/utils';

const useMockResponses = process.env.NODE_ENV === 'development';

export const useSilencesQuery = (refreshIntervalMs: number | false = false) => {
  const { prometheus } = useMonitoring();
  const silencesUrl = getAlertmanagerSilencesUrl({ prometheus, useTenancyPath: false });

  return useQuery<Silence[], Error>({
    queryKey: ['alert-management-api', prometheus, 'silences'],
    queryFn: () =>
      useMockResponses
        ? Promise.resolve(getMockSilencesResponse())
        : (consoleFetchJSON(silencesUrl, 'GET') as Promise<Silence[]>),
    refetchInterval: refreshIntervalMs,
  });
};
