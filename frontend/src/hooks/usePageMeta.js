import { useEffect } from 'react';

const DEFAULT_TITLE = 'Multiverse TCG Manager';
const TITLE_SUFFIX = ' | Multiverse TCG Manager';
const DEFAULT_DESCRIPTION = 'Busca cartas, organiza tu coleccion y crea mazos para Gundam, One Piece, Digimon y Riftbound en una sola herramienta.';
const DEFAULT_IMAGE = '/mtm-tab-logo.png';

const getAbsoluteUrl = (value) => {
  if (typeof window === 'undefined') {
    return value;
  }

  try {
    return new URL(value || '/', window.location.origin).toString();
  } catch (_error) {
    return window.location.origin;
  }
};

const ensureMeta = (selector, attributes) => {
  if (typeof document === 'undefined') {
    return null;
  }

  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    document.head.appendChild(element);
  }
  return element;
};

const ensureCanonical = () => {
  if (typeof document === 'undefined') {
    return null;
  }

  let element = document.head.querySelector('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', 'canonical');
    document.head.appendChild(element);
  }
  return element;
};

const setMetaContent = (selector, attributes, content) => {
  const element = ensureMeta(selector, attributes);
  if (element) {
    element.setAttribute('content', content || '');
  }
};

export default function usePageMeta({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  canonicalPath,
  type = 'website',
} = {}) {
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const pageTitle = title
      ? (title.includes('Multiverse TCG Manager') ? title : `${title}${TITLE_SUFFIX}`)
      : DEFAULT_TITLE;
    const pageUrl = getAbsoluteUrl(canonicalPath || window.location.pathname);
    const imageUrl = getAbsoluteUrl(image || DEFAULT_IMAGE);

    document.title = pageTitle;
    setMetaContent('meta[name="description"]', { name: 'description' }, description);
    setMetaContent('meta[property="og:title"]', { property: 'og:title' }, pageTitle);
    setMetaContent('meta[property="og:description"]', { property: 'og:description' }, description);
    setMetaContent('meta[property="og:type"]', { property: 'og:type' }, type);
    setMetaContent('meta[property="og:url"]', { property: 'og:url' }, pageUrl);
    setMetaContent('meta[property="og:image"]', { property: 'og:image' }, imageUrl);
    setMetaContent('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary_large_image');
    setMetaContent('meta[name="twitter:title"]', { name: 'twitter:title' }, pageTitle);
    setMetaContent('meta[name="twitter:description"]', { name: 'twitter:description' }, description);
    setMetaContent('meta[name="twitter:image"]', { name: 'twitter:image' }, imageUrl);

    const canonical = ensureCanonical();
    if (canonical) {
      canonical.setAttribute('href', pageUrl);
    }
  }, [canonicalPath, description, image, title, type]);
}
