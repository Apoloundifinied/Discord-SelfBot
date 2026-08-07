import { createProcessSupervisor } from '@/lib/processManager';
import { PATHS } from '@/lib/paths';

// Singleton em nível de módulo: persiste entre requisições dentro do mesmo
// processo do servidor Next.js (igual ao padrão usado para clientes de DB).
export const fleetSupervisor = createProcessSupervisor({
  name: 'fleet',
  scriptPath: PATHS.fleetEntry,
});

const IDENTITY_TIMEOUT_MS = 45000;

/**
 * Pede à fleet para resolver a identidade de um usuário e aguarda o resultado.
 * Resolve com { ok: true, data } ou { ok: false, error } — nunca rejeita, para
 * a rota de API não precisar tratar exceções de timeout.
 */
const FLEET_DOWN_MSG =
  'Fleet não está rodando. Inicie a fleet na aba "Fleet" ou resolva via CLI: node fleet/resolve-identity.js <userId>';

export function resolveIdentity(userId) {
  return new Promise(resolve => {
    if (!fleetSupervisor.getState().running) {
      resolve({ ok: false, error: FLEET_DOWN_MSG });
      return;
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let unsubscribe = () => {};

    const timer = setTimeout(() => {
      unsubscribe();
      resolve({ ok: false, error: 'Tempo esgotado aguardando a fleet resolver a identidade.' });
    }, IDENTITY_TIMEOUT_MS);

    unsubscribe = fleetSupervisor.onMessage(msg => {
      if (msg?.requestId !== requestId) return;
      if (msg.type === 'identity-result') {
        clearTimeout(timer);
        unsubscribe();
        resolve({ ok: true, data: msg });
      } else if (msg.type === 'identity-error') {
        clearTimeout(timer);
        unsubscribe();
        resolve({ ok: false, error: msg.error || 'Falha ao resolver identidade.' });
      }
    });

    const sent = fleetSupervisor.send({ type: 'resolve-identity', userId, requestId });
    if (!sent) {
      // A fleet parou entre a checagem inicial e o envio — falha imediata,
      // sem deixar a promise pendurada até o timeout.
      clearTimeout(timer);
      unsubscribe();
      resolve({ ok: false, error: FLEET_DOWN_MSG });
    }
  });
}

/**
 * Pede à fleet para buscar mensagens de um autor (messages/search) e aguarda
 * o resultado. Mesmo contrato de resolveIdentity: resolve com { ok, data|error }.
 * A busca respeita rate limit internamente (pode demorar), por isso o timeout
 * é mais generoso.
 */
export function searchUserMessages(userId, opts = {}) {
  return new Promise(resolve => {
    if (!fleetSupervisor.getState().running) {
      resolve({
        ok: false,
        error:
          'Fleet não está rodando. Inicie a fleet na aba "Fleet" ou use a CLI: node fleet/search-messages.js <userId>',
      });
      return;
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let unsubscribe = () => {};

    // A busca pode percorrer várias guilds com delays — timeout maior que o de identidade.
    const timer = setTimeout(() => {
      unsubscribe();
      resolve({ ok: false, error: 'Tempo esgotado aguardando a fleet buscar mensagens.' });
    }, 120000);

    unsubscribe = fleetSupervisor.onMessage(msg => {
      if (msg?.requestId !== requestId) return;
      if (msg.type === 'search-result') {
        clearTimeout(timer);
        unsubscribe();
        resolve({ ok: true, data: msg });
      } else if (msg.type === 'search-error') {
        clearTimeout(timer);
        unsubscribe();
        resolve({ ok: false, error: msg.error || 'Falha ao buscar mensagens.' });
      }
    });

    const sent = fleetSupervisor.send({
      type: 'search-messages',
      userId,
      requestId,
      maxPagesPerGuild: opts.maxPagesPerGuild,
      maxGuilds: opts.maxGuilds,
    });
    if (!sent) {
      clearTimeout(timer);
      unsubscribe();
      resolve({ ok: false, error: FLEET_DOWN_MSG });
    }
  });
}

/**
 * Pede à fleet para coletar o snapshot completo da conta dona do token (self)
 * e aguarda o resultado. Mesmo contrato de resolveIdentity: resolve com
 * { ok, data|error }. A coleta percorre vários endpoints com delays (rate
 * limit), por isso o timeout é generoso.
 */
export function collectSelf() {
  return new Promise(resolve => {
    if (!fleetSupervisor.getState().running) {
      resolve({
        ok: false,
        error: 'Fleet não está rodando. Inicie a fleet na aba "Fleet" ou use a CLI: node fleet/self.js',
      });
      return;
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let unsubscribe = () => {};

    // A coleta pode levar ~20s pelos delays entre chamadas.
    const timer = setTimeout(() => {
      unsubscribe();
      resolve({ ok: false, error: 'Tempo esgotado aguardando a fleet coletar o self.' });
    }, 60000);

    unsubscribe = fleetSupervisor.onMessage(msg => {
      if (msg?.requestId !== requestId) return;
      if (msg.type === 'self-result') {
        clearTimeout(timer);
        unsubscribe();
        resolve({ ok: true, data: msg });
      } else if (msg.type === 'self-error') {
        clearTimeout(timer);
        unsubscribe();
        resolve({ ok: false, error: msg.error || 'Falha ao coletar o self.' });
      }
    });

    const sent = fleetSupervisor.send({ type: 'collect-self', requestId });
    if (!sent) {
      clearTimeout(timer);
      unsubscribe();
      resolve({ ok: false, error: FLEET_DOWN_MSG });
    }
  });
}
