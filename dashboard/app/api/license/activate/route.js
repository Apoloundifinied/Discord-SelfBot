import { NextResponse } from 'next/server';
import { verifyLicenseKey, getMachineId } from '@/lib/shared';
import { getLicensePublicKey, writeActivation, LICENSE_REASONS } from '@/lib/licenseServer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/license/activate  Body: { key }
 * Verifica a assinatura da chave contra a chave pública embarcada, confere a
 * validade e o vínculo de máquina, e persiste a ativação LOCALMENTE.
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const key = typeof body?.key === 'string' ? body.key.trim() : '';

  if (!key) {
    return NextResponse.json({ ok: false, reason: 'sem-ativacao', error: 'Cole a chave de licença.' }, { status: 400 });
  }

  const publicKey = getLicensePublicKey();
  if (!publicKey) {
    return NextResponse.json(
      { ok: false, reason: 'chave-publica-ausente', error: LICENSE_REASONS['chave-publica-ausente'] },
      { status: 400 },
    );
  }

  const result = verifyLicenseKey({ publicKeyPem: publicKey, key });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason, error: LICENSE_REASONS[result.reason] ?? 'Chave rejeitada.' },
      { status: 400 },
    );
  }

  const machineId = getMachineId();
  if (result.payload.mid && result.payload.mid !== machineId) {
    return NextResponse.json(
      { ok: false, reason: 'maquina-diferente', error: LICENSE_REASONS['maquina-diferente'] },
      { status: 403 },
    );
  }

  writeActivation({
    key,
    machineId,
    activatedAt: new Date().toISOString(),
    sub: result.payload.sub ?? null,
  });

  return NextResponse.json({
    ok: true,
    id: result.payload.i ?? null,
    subject: result.payload.sub ?? null,
    expiresAt: result.payload.exp ? new Date(result.payload.exp * 1000).toISOString() : null,
    features: Array.isArray(result.payload.fe) ? result.payload.fe : [],
    machineBound: Boolean(result.payload.mid),
  });
}
