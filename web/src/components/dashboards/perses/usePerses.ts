import { fetchPersesProjects, fetchPersesDashboardsMetadata } from './perses-client';
import { useQuery } from '@tanstack/react-query';

export const usePerses = () => {
  const {
    isLoading: projectsLoading,
    error: projectsError,
    data: projects,
  } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchPersesProjects,
    enabled: true,
  });

  const {
    isLoading: dashboardsLoading,
    error: dashboardsError,
    data: dashboards,
  } = useQuery({
    queryKey: ['dashboards'],
    queryFn: fetchPersesDashboardsMetadata,
    enabled: true,
  });

  return {
    dashboards,
    dashboardsError,
    dashboardsLoading,
    projectsLoading,
    projects,
    projectsError,
  };
};
