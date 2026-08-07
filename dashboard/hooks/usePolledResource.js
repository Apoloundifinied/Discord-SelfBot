'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Faz polling simples de um endpoint JSON a cada `intervalMs`, substituindo o valor a cada resposta. */
export function usePolledResource(url, { intervalMs = 2500, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setData(body);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [url]);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    const tick = async () => {
      // Aba oculta: pula a requisição; o listener de visibilitychange retoma.
      if (cancelled || (typeof document !== 'undefined' && document.hidden)) return;
      await refresh();
    };

    function onVisibility() {
      // Ao voltar para a aba, atualiza na hora em vez de esperar o próximo intervalo.
      if (!cancelled && typeof document !== 'undefined' && !document.hidden) refresh();
    }

    tick();
    timerRef.current = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh, intervalMs, enabled]);

  return { data, error, refresh };
}
