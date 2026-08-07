import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from '@/lib/paths';

/**
 * Camada servidor do licenciamento.
 *
 * - A chave PÚBLICA (licenses/public.pem) é a única que viaja com o produto e
 *   é usada para verificar a assinatura de qualquer chave de licença.
 * - A ativação é um arquivo local (licenses/activation.json): cada instalação
 *   guarda a própria chave ativada + a máquina em que foi ativada. Não depende
 *   do Turso — o bloqueio funciona antes de qualquer configuração de banco.
 * - O painel de ADMINISTRAÇÃO do dono (emitir/revogar chaves) só fica
 *   disponível quando o cofre da chave privada (private.pem.enc) existe NA
 *   MÁQUINA e a senha-mestra está em LICENSE_MASTER_PASSPHRASE. Nenhuma dessas
 *   duas coisas é distribuída — por isso o campo é isolado por construção.
 */

let cachedPublicKey = null;

export function getLicensePublicKey() {
  if (cachedPublicKey) return cachedPublicKey;
  if (!fs.existsSync(PATHS.licensePublicPem)) return null;
  cachedPublicKey = fs.readFileSync(PATHS.licensePublicPem, 'utf8');
  return cachedPublicKey;
}

export function isLicenseEnforced() {
  return process.env.LICENSE_ENFORCE === 'true' || process.env.LICENSE_ENFORCE === '1';
}

/** O painel do dono está disponível? (cofre da chave privada + senha-mestra em env) */
export function isAdminAvailable() {
  return (
    Boolean(process.env.LICENSE_MASTER_PASSPHRASE) &&
    fs.existsSync(path.join(PATHS.licensesDir, 'private.pem.enc'))
  );
}

export function readActivation() {
  if (!fs.existsSync(PATHS.licenseActivation)) return null;
  try {
    return JSON.parse(fs.readFileSync(PATHS.licenseActivation, 'utf8'));
  } catch {
    return null;
  }
}

export function writeActivation(data) {
  fs.mkdirSync(PATHS.licensesDir, { recursive: true });
  fs.writeFileSync(PATHS.licenseActivation, JSON.stringify(data, null, 2), { mode: 0o600 });
}

/** Estados de licença normalizados para a UI. */
export const LICENSE_REASONS = {
  'chave-publica-ausente': 'Este build não inclui a chave pública de licença.',
  'sem-ativacao': 'Nenhuma chave ativada nesta instalação.',
  'formato-invalido': 'Formato de chave inválido.',
  'versao-desconhecida': 'Versão de chave não suportada.',
  'assinatura-invalida': 'Assinatura inválida — chave adulterada ou forjada.',
  'expirada': 'Esta chave expirou.',
  'maquina-diferente': 'Esta chave está vinculada a outra máquina.',
};
