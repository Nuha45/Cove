export function getErrorMessage(error) {
  if (!error?.response) {
    return 'We could not reach the server. Make sure the API is running.';
  }
  return error.response.data?.message || 'Something went wrong. Please try again.';
}

export function getFieldErrors(error) {
  const list = error?.response?.data?.errors;
  if (!Array.isArray(list)) return {};
  return Object.fromEntries(list.map((item) => [item.field, item.message]));
}
