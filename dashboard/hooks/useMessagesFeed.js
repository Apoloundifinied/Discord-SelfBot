'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 2000;
const MAX_MESSAGES = 500;

/**
 * Faz polling em /api/messages para simular atualização em tempo real:
 * - Primeira carga: busca as últimas mensagens.
 * - Chamadas seguintes: busca só mensagens novas (id > último id visto) e
 *   as insere no topo da lista, mantendo um limite máximo em memória.
 */
export function useMessagesFeed() {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('connecting'); // connecting | live | error
  const lastIdRef = useRef(0);

  const mergeIncoming = useCallback(incoming => {
    if (!incoming.length) return;
    setMessages(prev => [...incoming].reverse().concat(prev).slice(0, MAX_MESSAGES));
    lastIdRef.current = incoming.reduce((max, m) => Math.max(max, m.id), lastIdRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function poll() {
      // Aba oculta: pausa o ciclo; o listener de visibilitychange retoma.
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const url = lastIdRef.current
          ? `/api/messages?after=${lastIdRef.current}&limit=200`
          : '/api/messages?limit=100';
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const { messages: incoming } = await res.json();
        if (cancelled) return;

        if (!lastIdRef.current) {
          setMessages(incoming.slice(0, MAX_MESSAGES));
          lastIdRef.current = incoming.reduce((max, m) => Math.max(max, m.id), 0);
        } else {
          mergeIncoming(incoming);
        }
        setStatus('live');
      } catch {
        if (!cancelled) setStatus('error');
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    function onVisibility() {
      // Ao voltar para a aba, coleta imediatamente em vez de esperar o próximo ciclo.
      if (typeof document !== 'undefined' && !document.hidden && !cancelled) poll();
    }

    poll();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [mergeIncoming]);

  return { messages, status };
}
