import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../apiClient';
import queryKeys from '../queryKeys';
import { getSessionProfile, logoutUser } from '../services/api';

const SESSION_QUERY_STALE_TIME_MS = 2 * 60 * 1000;
const PROTECTED_QUERY_ROOTS = new Set(['collection', 'decks', 'cards', 'settings']);

const SessionContext = createContext(null);

export const isUnauthorizedError = (error) => error?.response?.status === 401;

export function SessionProvider({ children }) {
  const queryClient = useQueryClient();

  const markSessionAsLoggedOut = useCallback(() => {
    queryClient.setQueryData(queryKeys.sessionProfile(), null);
  }, [queryClient]);

  const clearProtectedQueryData = useCallback(() => {
    queryClient.removeQueries({
      predicate: (query) => {
        const rootKey = Array.isArray(query.queryKey) ? query.queryKey[0] : null;
        return PROTECTED_QUERY_ROOTS.has(rootKey);
      },
    });
    markSessionAsLoggedOut();
  }, [markSessionAsLoggedOut, queryClient]);

  const refreshSession = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.sessionProfile() });
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch (_error) {
      // The local session still needs to be cleared even if the request fails.
    } finally {
      clearProtectedQueryData();
    }
  }, [clearProtectedQueryData]);

  useEffect(() => {
    const interceptor = apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (isUnauthorizedError(error)) {
          clearProtectedQueryData();
        }

        return Promise.reject(error);
      }
    );

    return () => {
      apiClient.interceptors.response.eject(interceptor);
    };
  }, [clearProtectedQueryData]);

  const sessionQuery = useQuery({
    queryKey: queryKeys.sessionProfile(),
    queryFn: getSessionProfile,
    staleTime: SESSION_QUERY_STALE_TIME_MS,
  });

  const value = useMemo(() => ({
    profile: sessionQuery.data || null,
    isAuthenticated: Boolean(sessionQuery.data),
    authReady: !sessionQuery.isPending,
    sessionError: sessionQuery.error || null,
    refreshSession,
    logout,
    clearProtectedQueryData,
    markSessionAsLoggedOut,
  }), [
    clearProtectedQueryData,
    logout,
    markSessionAsLoggedOut,
    refreshSession,
    sessionQuery.data,
    sessionQuery.error,
    sessionQuery.isPending,
  ]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return value;
}
