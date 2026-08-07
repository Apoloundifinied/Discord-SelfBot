// Ponte única para os utilitários compartilhados em ../shared (raiz do projeto).
// Mantém esse "salto" para fora de dashboard/ concentrado em um só arquivo, para
// que o resto do dashboard só precise importar de "@/lib/shared".
export { createLogger } from '../../shared/logger';
export { parseEnvFile, updateEnvFile } from '../../shared/envFile';
// Licenciamento: verificação de chaves assinadas usa apenas node:crypto — nada
// de argon2 no lado do dashboard (dependência vive só no licenses/studio.js).
export { verifyLicenseKey, getMachineId } from '../../shared/license';
// Diagnóstico consolidado (CLI `npm run doctor` + GET /api/health).
export { readEnvConfig, runDiagnostics } from '../../shared/doctor';
