import { QueryClient } from '@tanstack/react-query';

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
      staleTime: 60 * 1000,
      gcTime: 10 * 60 * 1000,
    },
    mutations: {
      retry: false,
    },
  },
});

export default queryClient;
