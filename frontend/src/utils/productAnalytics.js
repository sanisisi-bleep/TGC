import { track } from '@vercel/analytics';

const sanitizeAnalyticsValue = (value) => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  return String(value).slice(0, 120);
};

export const trackProductEvent = (eventName, properties = {}) => {
  if (!eventName) {
    return;
  }

  try {
    const safeProperties = Object.entries(properties).reduce((acc, [key, value]) => {
      const safeValue = sanitizeAnalyticsValue(value);
      if (safeValue !== undefined) {
        acc[key] = safeValue;
      }
      return acc;
    }, {});

    track(eventName, safeProperties);
  } catch (_error) {
    // Analytics should never break the product flow.
  }
};
