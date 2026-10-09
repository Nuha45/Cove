export function mediaUrl(path) {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) return path;
  // Files in client/public/products ship with the frontend, not the API server.
  if (path.startsWith('/products/')) return path;
  const api = import.meta.env.VITE_API_URL || '';
  if (api.startsWith('http')) return new URL(path, api).href;
  return path;
}
