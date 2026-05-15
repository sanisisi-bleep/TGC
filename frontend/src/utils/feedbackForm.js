export const FEEDBACK_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const FEEDBACK_ATTACHMENT_ACCEPT = 'image/*,video/*,audio/*';

export const formatFeedbackAttachmentSize = (size) => {
  if (!Number.isFinite(size) || size <= 0) {
    return '0 B';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};

export const isSupportedFeedbackAttachment = (file) => {
  const normalizedType = String(file?.type || '').toLowerCase();
  return (
    normalizedType.startsWith('image/') ||
    normalizedType.startsWith('video/') ||
    normalizedType.startsWith('audio/')
  );
};
