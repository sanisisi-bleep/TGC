import { useCallback, useEffect, useMemo, useState } from 'react';

const MOBILE_PLATFORM_REGEX = /Android|iPhone|iPad|iPod|Mobile/i;

const isStandaloneApp = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
};

const detectMobilePlatform = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return MOBILE_PLATFORM_REGEX.test(window.navigator.userAgent || '');
};

const detectIosPlatform = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return /iPhone|iPad|iPod/i.test(window.navigator.userAgent || '');
};

export default function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(isStandaloneApp);
  const [isMobile, setIsMobile] = useState(detectMobilePlatform);
  const [isIos, setIsIos] = useState(detectIosPlatform);
  const [hasInstalled, setHasInstalled] = useState(isStandaloneApp);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = () => {
      const nextStandalone = isStandaloneApp();
      setIsStandalone(nextStandalone);
      if (nextStandalone) {
        setHasInstalled(true);
      }
    };

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setIsMobile(detectMobilePlatform());
      setIsIos(detectIosPlatform());
    };

    const handleAppInstalled = () => {
      setHasInstalled(true);
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    handleDisplayModeChange();
    setIsMobile(detectMobilePlatform());
    setIsIos(detectIosPlatform());

    mediaQuery.addEventListener('change', handleDisplayModeChange);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return { outcome: null };
    }

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice;
  }, [deferredPrompt]);

  return useMemo(() => ({
    canPrompt: Boolean(deferredPrompt) && isMobile && !isStandalone,
    isIos,
    isMobile,
    isStandalone,
    hasInstalled,
    showIosHint: isIos && isMobile && !isStandalone,
    promptInstall,
  }), [deferredPrompt, hasInstalled, isIos, isMobile, isStandalone, promptInstall]);
}
