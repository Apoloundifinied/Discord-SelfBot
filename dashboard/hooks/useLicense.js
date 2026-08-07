'use client';

import { useCallback, useEffect, useState } from 'react';

const INITIAL = {
  loading: true,
  enforce: false,
  ready: false,
  activated: false,
  valid: false,
  reason: null,
  unreachable: false,
};

/**
 * Estado da licença da instalação, com polling suave (o status é re-verificado
 * no servidor a cada chamada — expiração/revogação refletem sozinhas).
 * Segue o padrão dos demais hooks: tick dentro do effect + pausa em aba oculta.
 */
export default function useLicense(intervalMs = 30000) {
  const [status, setStatus] = useState(INITIAL);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/license/status', { cache: 'no-store' });
      if (res.status === 401) {
        // Sem sessão válida (modo dono, cookie de sessão expirado). NÃO existe
        // tela de login — o fluxo é o launcher: reabra o painel pelo VOID que
        // ele reautentica sozinho. Aqui só marcamos a falha para o app não
        // renderizar um estado falso (fail-closed).
        setStatus(prev => ({ ...prev, loading: false, unreachable: true }));
        return;
      }
      const body = await res.json();
      setStatus({ ...INITIAL, ...body, loading: false });
    } catch {
      // Estado desconhecido (ex.: painel aberto com credenciais na URL, que
      // faz o navegador recusar fetch). Marca unreachable — o painel NÃO pode
      // renderizar sem saber o estado de licença (fail-closed). O próximo poll
      // limpa a flag quando a consulta voltar a funcionar.
      setStatus(prev => ({ ...prev, loading: false, unreachable: true }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // A primeira checagem roda SEMPRE (mesmo com a aba em background) — senão o
    // boot screen fica pendurado até o usuário focar a aba. Só os polls
    // periódicos pausam com a aba oculta (o listener de visibilitychange retoma).
    const initial = async () => {
      if (cancelled) return;
      await refresh();
    };
    initial();

    const tick = async () => {
      if (cancelled || (typeof document !== 'undefined' && document.hidden)) return;
      await refresh();
    };

    function onVisibility() {
      // Ao voltar para a aba, atualiza na hora em vez de esperar o próximo intervalo.
      if (!cancelled && typeof document !== 'undefined' && !document.hidden) refresh();
    }

    const timer = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh, intervalMs]);

  return { status, refresh };
}
