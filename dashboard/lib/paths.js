import path from 'node:path';

// process.cwd() do processo Next.js é sempre a raiz de dashboard/, tanto rodando
// `next dev`/`next start` de dentro da pasta quanto via `npm --prefix dashboard ...`.
const DASHBOARD_ROOT = process.cwd();
export const REPO_ROOT = path.join(DASHBOARD_ROOT, '..');

export const PATHS = {
  scraperEnv: path.join(REPO_ROOT, 'scraper', '.env'),
  scraperEntry: path.join(REPO_ROOT, 'scraper', 'index.js'),
  fleetEnv: path.join(REPO_ROOT, 'fleet', '.env'),
  fleetEntry: path.join(REPO_ROOT, 'fleet', 'manager.js'),
  fleetAccounts: path.join(REPO_ROOT, 'fleet', 'accounts.json'),
  dashboardEnvLocal: path.join(DASHBOARD_ROOT, '.env.local'),
  // Banco local (modo zero-config): arquivo SQLite dentro da aplicação.
  dataDir: path.join(REPO_ROOT, 'data'),
  localDbPath: path.join(REPO_ROOT, 'data', 'void.db'),
  // Licenciamento (dono): licencesDir contém o cofre cifrado + chave pública.
  licensesDir: path.join(REPO_ROOT, 'licenses'),
  licensePublicPem: path.join(REPO_ROOT, 'licenses', 'public.pem'),
  licenseStudio: path.join(REPO_ROOT, 'licenses', 'studio.js'),
  // Ativação local da instalação (máquina do cliente). Nunca é enviada para fora.
  licenseActivation: path.join(REPO_ROOT, 'licenses', 'activation.json'),
};
