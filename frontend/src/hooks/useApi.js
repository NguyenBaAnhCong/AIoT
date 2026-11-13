import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tải dữ liệu khi vào trang, có trạng thái loading/error và hàm reload.
 *   const { data, loading, error, reload } = useApi(() => api.get('/plots'), []);
 */
export function useApi(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ data: await fnRef.current(), loading: false, error: null });
    } catch (error) {
      setState({ data: null, loading: false, error });
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, deps);
  return { ...state, reload: load };
}
