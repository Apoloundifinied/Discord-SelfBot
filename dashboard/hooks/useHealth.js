'use client';

import { useEffect, useState } from 'react';

/**
 * useHealth — polling COMPARTILHADO de /api/health.
 *
 * WindowBar, SidebarStatus e HealthCard mostram fatias do mesmo endpoint.
 * Em vez de cada um abrir o próprio intervalo (no mount, 3 requisições
 * simultâneas poderiam disparar o teste de token no servidor — o custo que o
 * cache de ~10s existe para evitar), este hook mantém UM timer e deduplica a
 * requisição em voo para todos os consumidores do módulo.
 */
const URL = '/api/health';
const INTERVAL_MS = 10_000;

let data = null;
let error = null;
let inFlight = null;
let timer = null;
const listeners = new Set();

async function tick() {
  if (!inFlight) {
    inFlight = fetch(URL, { cache: 'no-store' })
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
        return body;
      })
      .then(body => {
        data = body;
        error = null;
        return body;
      })
      .catch(err => {
        error = err.message || String(err);
        return null;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

function emit() {
  listeners.forEach(fn => fn());
}

export function useHealth() {
  const [, force] = useState(0);

  useEffect(() => {
    const cb = () => force(x => x + 1);
    listeners.add(cb);
    if (!timer) timer = setInterval(() => tick().then(emit), INTERVAL_MS);
    // Primeira leitura imediata — se dois componentes montam juntos, a
    // segunda chamada reusa a promessa em voo (nenhuma requisição extra).
    tick().then(emit);

    return () => {
      listeners.delete(cb);
      if (listeners.size === 0) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);

  return {
    data,
    error,
    refresh: () => tick().then(emit),
  };
}
