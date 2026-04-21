export const isInteractiveElementTarget = (target) => (
  target instanceof Element
  && Boolean(target.closest('button, input, select, textarea, a, label, [data-ignore-card-open="true"]'))
);
