import { QueryClient } from '@tanstack/react-query';
import { isAppError } from './errors';

/**
 * One cache for the whole app. Auth/permission failures are never retried;
 * transient network failures get a single retry so a flaky mobile connection
 * does not hammer Firestore.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (isAppError(error) && [401, 403, 404].includes(error.status)) return false;
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
