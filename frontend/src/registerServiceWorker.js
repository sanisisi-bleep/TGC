const isLocalhost = Boolean(
  window.location.hostname === 'localhost'
    || window.location.hostname === '[::1]'
    || /^127(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(window.location.hostname)
);

function registerValidServiceWorker() {
  return navigator.serviceWorker.register('/service-worker.js');
}

function validateServiceWorker() {
  fetch('/service-worker.js', {
    headers: { 'Service-Worker': 'script' },
  })
    .then((response) => {
      const contentType = response.headers.get('content-type') || '';

      if (response.status === 404 || !contentType.includes('javascript')) {
        navigator.serviceWorker.ready.then((registration) => registration.unregister());
        return;
      }

      registerValidServiceWorker();
    })
    .catch(() => {
      // Ignore offline validation errors. The existing worker can still serve the app shell.
    });
}

export default function registerServiceWorker() {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    if (isLocalhost) {
      validateServiceWorker();
      return;
    }

    registerValidServiceWorker();
  });
}
