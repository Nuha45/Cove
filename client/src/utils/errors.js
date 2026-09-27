export function getErrorMessage(error) {
  if (!error?.response) {
    return 'Couldn’t reach Cove. Check your connection and try again.';
  }

  const status = error.response.status;
  const serverMessage = error.response.data?.message;

  if (status === 401) {
    return serverMessage || 'Your session has expired. Please sign in again.';
  }
  if (status === 403) {
    return serverMessage || 'You don’t have permission to do that.';
  }
  if (status === 404) {
    return serverMessage || 'We couldn’t find what you were looking for.';
  }
  if (status === 409) {
    return serverMessage || 'That change couldn’t be saved because something already exists.';
  }
  if (status >= 500) {
    return serverMessage || 'Something went wrong on our side. Please try again in a moment.';
  }

  return serverMessage || 'Couldn’t complete that action. Please try again.';
}

export function getFieldErrors(error) {
  const list = error?.response?.data?.errors;
  if (!Array.isArray(list)) return {};
  return Object.fromEntries(list.map((item) => [item.field, item.message]));
}
