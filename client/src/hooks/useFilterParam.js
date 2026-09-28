import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Keeps a list filter in the URL (?key=value) so filtered views can be refreshed and shared.
 * Values outside `allowed` are treated as "no filter".
 */
export default function useFilterParam(key, allowed) {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(key) || '';
  const value = allowed.includes(raw) ? raw : '';

  const setValue = useCallback((next) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (next) params.set(key, next);
      else params.delete(key);
      return params;
    }, { replace: true });
  }, [key, setSearchParams]);

  return [value, setValue];
}
