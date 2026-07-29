import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from '@/lib/paths';
import { fleetSupervisor } from '@/lib/fleetSupervisor';

export const dynamic = 'force-dynamic';

function readAccounts() {
  if (!fs.existsSync(PATHS.fleetAccounts)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(PATHS.fleetAccounts, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts) {
  fs.mkdirSync(path.dirname(PATHS.fleetAccounts), { recursive: true });
  fs.writeFileSync(PATHS.fleetAccounts, `${JSON.stringify(accounts, null, 2)}\n`, 'utf8');
}

function maskToken(token) {
  if (!token || token.length < 8) return '****';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function toPublic(accounts) {
  return accounts.map(a => ({ label: a.label, tokenPreview: maskToken(a.token) }));
}

export async function GET() {
  return NextResponse.json({ accounts: toPublic(readAccounts()) });
}

/** Body: { label, token }. Adiciona a conta e, se a fleet já estiver rodando, sobe a instância na hora. */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { label, token } = body;

  if (!label || !token) {
    return NextResponse.json({ error: 'label e token são obrigatórios.' }, { status: 400 });
  }

  const accounts = readAccounts();
  if (accounts.some(a => a.label === label)) {
    return NextResponse.json({ error: `Já existe uma conta com o label "${label}".` }, { status: 409 });
  }

  accounts.push({ label, token });
  writeAccounts(accounts);
  fleetSupervisor.send({ type: 'add-account', account: { label, token } });

  return NextResponse.json({ ok: true, accounts: toPublic(accounts) });
}

/** ?label=xxx — remove a conta e, se estiver rodando, encerra a instância. */
export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const label = searchParams.get('label');
  if (!label) {
    return NextResponse.json({ error: 'Parâmetro label é obrigatório.' }, { status: 400 });
  }

  const accounts = readAccounts().filter(a => a.label !== label);
  writeAccounts(accounts);
  fleetSupervisor.send({ type: 'remove-account', label });

  return NextResponse.json({ ok: true, accounts: toPublic(accounts) });
}
