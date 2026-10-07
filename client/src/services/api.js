import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

// Endpoints where a 401 response is a normal credential/guest response rather than an expired session
const AUTH_EXCLUDED_PATTERNS = [
  /\/auth\/login/i,
  /\/auth\/register/i,
  /\/auth\/forgot-password/i,
  /\/auth\/reset-password/i,
  /\/auth\/me/i,
  /\/store\//i,
];

let isRedirecting = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    const isExcluded = AUTH_EXCLUDED_PATTERNS.some((pattern) => pattern.test(url));

    if (status === 401 && !isExcluded) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cove:session-expired'));

        const currentPath = window.location.pathname;
        const isPublicPath =
          currentPath === '/login' ||
          currentPath === '/register' ||
          currentPath === '/forgot-password' ||
          currentPath.startsWith('/reset-password') ||
          currentPath.startsWith('/store/') ||
          currentPath === '/';

        if (!isPublicPath && !isRedirecting) {
          isRedirecting = true;
          window.location.assign('/login?session=expired');
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
