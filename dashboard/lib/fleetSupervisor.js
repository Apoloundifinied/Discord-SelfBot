import { createProcessSupervisor } from '@/lib/processManager';
import { PATHS } from '@/lib/paths';

// Singleton em nível de módulo: persiste entre requisições dentro do mesmo
// processo do servidor Next.js (igual ao padrão usado para clientes de DB).
export const fleetSupervisor = createProcessSupervisor({
  name: 'fleet',
  scriptPath: PATHS.fleetEntry,
});
