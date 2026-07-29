// Ponte única para os utilitários compartilhados em ../shared (raiz do projeto).
// Mantém esse "salto" para fora de dashboard/ concentrado em um só arquivo, para
// que o resto do dashboard só precise importar de "@/lib/shared".
export { createLogger } from '../../shared/logger';
export { parseEnvFile, updateEnvFile } from '../../shared/envFile';
