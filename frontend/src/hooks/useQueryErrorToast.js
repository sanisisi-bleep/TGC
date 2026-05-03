import { useEffect } from 'react';
import { isUnauthorizedError } from '../context/SessionContext';
import { getApiErrorMessage } from '../utils/apiMessages';

export default function useQueryErrorToast(errors, showToast, fallbackMessage) {
  useEffect(() => {
    const resolvedError = (Array.isArray(errors) ? errors : [errors]).find(Boolean);

    if (!resolvedError || isUnauthorizedError(resolvedError)) {
      return;
    }

    showToast({
      type: 'error',
      message: getApiErrorMessage(resolvedError, fallbackMessage),
    });
  }, [errors, fallbackMessage, showToast]);
}
