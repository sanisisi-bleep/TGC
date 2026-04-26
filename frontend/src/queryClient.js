import { QueryClient } from '@tanstack/react-query';
import { QUERY_GC_TIMES, QUERY_STALE_TIMES } from './queryConfig';

const shouldRetryQuery = (failureCount, error) => {
  if (error?.response?.status === 401) {
    return false;
  }

  return failureCount < 1;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
      staleTime: QUERY_STALE_TIMES.default,
      gcTime: QUERY_GC_TIMES.default,
    },
    mutations: {
      retry: false,
    },
  },
});

export default queryClient;
