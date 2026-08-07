import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const AUTH_COOKIE = 'void_auth';

/**
 * GET /api/auth/login — usado pelo launcher (modo dono):
 * abre `http://void:SENHA@127.0.0.1:PORT/api/auth/login`. O proxy deixa esta
 * rota passar; o header Basic (que o navegador envia por causa das credenciais
 * na URL) é validado aqui, vira um cookie httpOnly e a resposta redireciona
 * para a raiz SEM credenciais — condição obrigatória para as fetches do app
 * (o navegador recusa Request com credenciais na URL).
 *
 * NÃO existe tela de login. Sem credenciais válidas: 401 JSON simples, sem o
 * header WWW-Authenticate (que abriria o modal nativo do navegador).
 */
export async function GET(request) {
  const password = process.env.DASHBOARD_PASSWORD;
  const header = request.headers.get('authorization') ?? '';
  const expected = `Basic ${Buffer.from(`void:${password ?? ''}`).toString('base64')}`;

  if (!password || header !== expected) {
    return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  }

  // Redireciona para a raiz SEM userinfo, preservando o HOST exato da
  // requisição (o request.nextUrl normaliza 127.0.0.1 -> localhost, e o
  // cookie é host-only — se o host mudasse, o navegador não enviaria o cookie
  // e o proxy responderia 401).
  const host = request.headers.get('host') ?? request.nextUrl.host;
  const root = `${request.nextUrl.protocol}//${host}/`;
  const res = NextResponse.redirect(root);
  res.cookies.set(AUTH_COOKIE, password, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
  });
  return res;
}
