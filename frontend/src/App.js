import React, { useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './App.css';
import AppErrorBoundary from './components/AppErrorBoundary';
import { SessionBootstrapPanel, TgcBootstrapPanel } from './components/layout/BootstrapPanels';
import SiteNavigation from './components/layout/SiteNavigation';
import Home from './pages/Home';
import Search from './pages/Search';
import Collection from './pages/Collection';
import Decks from './pages/Decks';
import Settings from './pages/Settings';
import SharedDeck from './pages/SharedDeck';
import { SessionProvider, useSession } from './context/SessionContext';
import { ToastProvider, useToast } from './context/ToastContext';
import useBrowserStorageState from './hooks/useBrowserStorageState';
import { buildTcgMap, DEFAULT_TCG_SLUG, GAME_CONFIGS, getGameConfig } from './tcgConfig';
import queryKeys from './queryKeys';
import { QUERY_STALE_TIMES } from './queryConfig';
import { getTgcCatalog } from './services/api';
import useInstallPrompt from './hooks/useInstallPrompt';

const THEME_MODE_STORAGE_KEY = 'tgc-theme-mode-v1';
const ACTIVE_TCG_STORAGE_KEY = 'activeTcgSlug';

const getPreferredThemeMode = () => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
};

const sanitizeTelemetryPayload = (event) => {
  if (!event?.url) {
    return event;
  }

  try {
    const parsedUrl = new URL(event.url);

    if (parsedUrl.pathname.startsWith('/shared-deck/')) {
      parsedUrl.pathname = '/shared-deck/[token]';
    }

    parsedUrl.search = '';

    return {
      ...event,
      url: parsedUrl.toString(),
    };
  } catch (_error) {
    return event;
  }
};

const buildAvailableGames = (tgcBySlug) => (
  Object.entries(tgcBySlug)
    .map(([slug, item]) => ({
      ...getGameConfig(slug),
      id: item.id,
    }))
    .filter((game) => game.available)
);

function ProtectedGameRoute({
  isAuthenticated,
  isBlocked,
  fallback,
  resetKey,
  children,
}) {
  if (!isAuthenticated) {
    return <Navigate to="/" />;
  }

  if (isBlocked) {
    return fallback;
  }

  return (
    <AppErrorBoundary resetKey={resetKey}>
      {children}
    </AppErrorBoundary>
  );
}

function AppShell({
  activeTcgSlug,
  themeMode,
  toggleThemeMode,
  updateActiveTcgSlug,
}) {
  const {
    authReady,
    isAuthenticated,
    logout,
    refreshSession,
  } = useSession();
  const { showToast } = useToast();
  const installPrompt = useInstallPrompt();
  const canPromptInstall = installPrompt.canPrompt;
  const showIosHint = installPrompt.showIosHint;
  const showInstallAction = canPromptInstall || showIosHint;
  const installButtonLabel = showIosHint ? 'Anadir app' : 'Instalar app';
  const promptInstall = installPrompt.promptInstall;

  const handleLoginSuccess = useCallback(async () => {
    await refreshSession();
  }, [refreshSession]);

  const handleInstallApp = useCallback(async () => {
    if (canPromptInstall) {
      const choice = await promptInstall();

      if (choice?.outcome === 'accepted') {
        showToast({
          type: 'success',
          title: 'Instalacion iniciada',
          message: 'Si tu navegador la confirma, tendras Multiverse TCG Manager como app en el movil.',
        });
      }

      return;
    }

    if (showIosHint) {
      showToast({
        type: 'info',
        title: 'Anadir a pantalla de inicio',
        message: 'En Safari toca Compartir y luego "Anadir a pantalla de inicio" para instalarla como app.',
        duration: 5200,
      });
    }
  }, [canPromptInstall, promptInstall, showIosHint, showToast]);

  const tgcCatalogQuery = useQuery({
    queryKey: queryKeys.tgcCatalog(),
    queryFn: getTgcCatalog,
    staleTime: QUERY_STALE_TIMES.tgcCatalog,
  });
  const retryTgcLoad = useCallback(() => {
    tgcCatalogQuery.refetch();
  }, [tgcCatalogQuery]);

  const tgcBySlug = useMemo(
    () => buildTcgMap(tgcCatalogQuery.data || []),
    [tgcCatalogQuery.data]
  );

  useEffect(() => {
    if (tgcCatalogQuery.isPending || tgcBySlug[activeTcgSlug]) {
      return;
    }

    const fallbackSlug = Object.keys(tgcBySlug).find((slug) => GAME_CONFIGS[slug]?.available)
      || DEFAULT_TCG_SLUG;
    updateActiveTcgSlug(fallbackSlug);
  }, [activeTcgSlug, tgcBySlug, tgcCatalogQuery.isPending, updateActiveTcgSlug]);

  const activeGame = getGameConfig(activeTcgSlug);
  const activeTgc = tgcBySlug[activeTcgSlug] || null;
  const availableGames = useMemo(() => buildAvailableGames(tgcBySlug), [tgcBySlug]);
  const fallbackGames = useMemo(
    () => Object.values(GAME_CONFIGS).filter((game) => game.available),
    []
  );
  const navGames = availableGames.length > 0 ? availableGames : fallbackGames;
  const loadingTgcs = tgcCatalogQuery.isPending && !tgcCatalogQuery.data;
  const tgcLoadError = tgcCatalogQuery.error || null;
  const shouldBlockProtectedGameRoutes = isAuthenticated && (loadingTgcs || !activeTgc || Boolean(tgcLoadError));
  const protectedGameFallback = (
    <TgcBootstrapPanel
      activeGame={activeGame}
      error={tgcLoadError}
      onRetry={retryTgcLoad}
    />
  );

  return (
    <div className={`App ${activeGame.palette} ${themeMode === 'dark' ? 'theme-dark' : 'theme-light'}`}>
      {!authReady ? (
        <main className="main-content">
          <SessionBootstrapPanel />
        </main>
      ) : (
        <>
          <SiteNavigation
            isAuthenticated={isAuthenticated}
            navGames={navGames}
            activeTcgSlug={activeTcgSlug}
            themeMode={themeMode}
            showInstallAction={showInstallAction}
            installButtonLabel={installButtonLabel}
            onInstallApp={handleInstallApp}
            onSelectGame={updateActiveTcgSlug}
            onToggleTheme={toggleThemeMode}
            onLogout={logout}
          />

          <main className="main-content">
            <Routes>
              <Route
                path="/"
                element={
                  <Home
                    token={isAuthenticated ? 'cookie-session' : null}
                    onLoginSuccess={handleLoginSuccess}
                    activeTcgSlug={activeTcgSlug}
                    setActiveTcgSlug={updateActiveTcgSlug}
                    availableGames={navGames}
                  />
                }
              />
              <Route
                path="/search"
                element={
                  <ProtectedGameRoute
                    isAuthenticated={isAuthenticated}
                    isBlocked={shouldBlockProtectedGameRoutes}
                    fallback={protectedGameFallback}
                    resetKey={`search-${activeTcgSlug}-${activeTgc?.id || 'pending'}`}
                  >
                    <Search
                      key={`${activeTcgSlug}-${activeTgc?.id || 'pending'}`}
                      activeTcgSlug={activeTcgSlug}
                      activeTgc={activeTgc}
                    />
                  </ProtectedGameRoute>
                }
              />
              <Route
                path="/collection"
                element={
                  <ProtectedGameRoute
                    isAuthenticated={isAuthenticated}
                    isBlocked={shouldBlockProtectedGameRoutes}
                    fallback={protectedGameFallback}
                    resetKey={`collection-${activeTcgSlug}-${activeTgc?.id || 'pending'}`}
                  >
                    <Collection
                      key={`${activeTcgSlug}-${activeTgc?.id || 'pending'}`}
                      activeTcgSlug={activeTcgSlug}
                      activeTgc={activeTgc}
                    />
                  </ProtectedGameRoute>
                }
              />
              <Route
                path="/decks"
                element={
                  <ProtectedGameRoute
                    isAuthenticated={isAuthenticated}
                    isBlocked={shouldBlockProtectedGameRoutes}
                    fallback={protectedGameFallback}
                    resetKey={`decks-${activeTcgSlug}-${activeTgc?.id || 'pending'}`}
                  >
                    <Decks
                      key={`${activeTcgSlug}-${activeTgc?.id || 'pending'}`}
                      activeTcgSlug={activeTcgSlug}
                      activeTgc={activeTgc}
                    />
                  </ProtectedGameRoute>
                }
              />
              <Route path="/shared-deck/:shareToken" element={<SharedDeck />} />
              <Route path="/settings" element={isAuthenticated ? <Settings /> : <Navigate to="/" />} />
            </Routes>
          </main>
        </>
      )}
      <Analytics beforeSend={sanitizeTelemetryPayload} />
      <SpeedInsights beforeSend={sanitizeTelemetryPayload} />
    </div>
  );
}

function App() {
  const [themeMode, setThemeMode] = useBrowserStorageState(
    THEME_MODE_STORAGE_KEY,
    getPreferredThemeMode,
    {
      validate: (value, fallback) => (value === 'light' || value === 'dark' ? value : fallback),
    }
  );
  const [activeTcgSlug, setActiveTcgSlug] = useBrowserStorageState(
    ACTIVE_TCG_STORAGE_KEY,
    DEFAULT_TCG_SLUG,
    {
      validate: (value, fallback) => (typeof value === 'string' && value.trim() ? value.trim() : fallback),
    }
  );

  const updateActiveTcgSlug = useCallback((nextSlug) => {
    const normalizedSlug = (nextSlug || DEFAULT_TCG_SLUG).trim() || DEFAULT_TCG_SLUG;
    setActiveTcgSlug(normalizedSlug);
  }, [setActiveTcgSlug]);

  const toggleThemeMode = useCallback(() => {
    setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'));
  }, [setThemeMode]);

  useEffect(() => {
    document.body.classList.toggle('theme-dark', themeMode === 'dark');
    document.body.classList.toggle('theme-light', themeMode !== 'dark');
    document.documentElement.style.colorScheme = themeMode;
  }, [themeMode]);

  return (
    <Router>
      <ToastProvider>
        <SessionProvider>
          <AppShell
            activeTcgSlug={activeTcgSlug}
            themeMode={themeMode}
            toggleThemeMode={toggleThemeMode}
            updateActiveTcgSlug={updateActiveTcgSlug}
          />
        </SessionProvider>
      </ToastProvider>
    </Router>
  );
}

export default App;
