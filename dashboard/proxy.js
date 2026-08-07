import { NextResponse } from 'next/server';

const AUTH_COOKIE = 'void_auth';

/**
 * Proxy de autenticação do painel local.
 *
 * O portão do produto é a LICENÇA (tela de desbloqueio) — NÃO existe tela de
 * login em nenhum modo. O launcher (modo dono) abre o navegador em
 * /api/auth/login com as credenciais na URL (void:senha@…); aquela rota troca
 * a senha por um cookie httpOnly e redireciona para a raiz SEM credenciais.
 *
 * Aqui valem: cookie emitido pela rota de login, OU header Basic (launcher,
 * curl, waitFor). Sem nenhum dos dois (modo dono): 401 simples — SEM o header
 * WWW-Authenticate (que abriria o modal nativo do navegador) e SEM redirect
 * para tela de login (ela não existe). No fluxo real ninguém vê isso: o
 * launcher sempre autentica antes de abrir o navegador.
 */
export function proxy(request) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    // SEM SENHA = modo cliente ou dev: o portão é a LICENÇA (tela de
    // desbloqueio), não a senha. O launcher do modo cliente sobe o painel
    // sem DASHBOARD_PASSWORD de propósito — pass-through total.
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;

  // Rota pública: troca as credenciais (URL do launcher) por cookie.
  if (pathname === '/api/auth/login') return NextResponse.next();

  // Cookie httpOnly emitido pela rota de login vale como autenticação.
  if (request.cookies.get(AUTH_COOKIE)?.value === password) return NextResponse.next();

  const header = request.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    try {
      const [, suppliedPassword] = atob(header.slice(6)).split(':');
      if (suppliedPassword === password) {
        // Autenticou por header: entrega o cookie na resposta para o navegador
        // não depender de credenciais na URL (que quebram fetch relativo).
        const res = NextResponse.next();
        res.cookies.set(AUTH_COOKIE, password, {
          httpOnly: true,
          sameSite: 'strict',
          path: '/',
        });
        return res;
      }
    } catch {
      /* cai no não-autenticado abaixo */
    }
  }

  // Sem sessão: 401 SEM WWW-Authenticate (nunca o modal nativo) e SEM tela de
  // login — o launcher sempre autentica antes de abrir o navegador.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  }
  return new NextResponse('401 — abra o painel pelo launcher (VOID).', {
    status: 401,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
