import { NextResponse } from 'next/server';
import { verifyLicenseKey, getMachineId } from '@/lib/shared';
import { getLicensePublicKey, isLicenseEnforced, readActivation } from '@/lib/licenseServer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/license/status
 * Estado da licença desta instalação. A chave ativada é re-verificada a cada
 * chamada (assinatura + validade), então expiração/revogação refletem sozinhas.
 */
export async function GET() {
  const enforce = isLicenseEnforced();
  const publicKey = getLicensePublicKey();
  // ID desta máquina — SEMPRE exposto: é o que o cliente envia ao fornecedor
  // para receber uma chave vinculada (--machine <id> no npm run sell).
  const thisMachineId = getMachineId();

  if (!publicKey) {
    return NextResponse.json({ enforce, ready: false, activated: false, valid: false, reason: 'chave-publica-ausente', thisMachineId });
  }

  const activation = readActivation();
  if (!activation?.key) {
    return NextResponse.json({ enforce, ready: true, activated: false, valid: false, reason: 'sem-ativacao', thisMachineId });
  }

  const result = verifyLicenseKey({ publicKeyPem: publicKey, key: activation.key });
  if (!result.ok) {
    return NextResponse.json({
      enforce,
      ready: true,
      activated: true,
      valid: false,
      reason: result.reason,
      subject: activation.sub ?? null,
      thisMachineId,
    });
  }

  const payload = result.payload;
  // O vínculo de máquina só vale para chaves que o dono marcou com `--bind`.
  // Chaves livres seguem válidas mesmo que o ID heurístico de máquina mude
  // (hostname/CPU), evitando invalidar licenças sem motivo.
  const bound = Boolean(payload.mid);
  const machineMatch = !bound || activation.machineId === getMachineId();

  return NextResponse.json({
    enforce,
    ready: true,
    activated: true,
    valid: machineMatch,
    reason: machineMatch ? null : 'maquina-diferente',
    id: payload.i ?? null,
    subject: payload.sub ?? null,
    expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
    features: Array.isArray(payload.fe) ? payload.fe : [],
    machineBound: bound,
    machineId: bound ? (activation.machineId ?? null) : null,
    activatedAt: activation.activatedAt ?? null,
    thisMachineId,
  });
}
