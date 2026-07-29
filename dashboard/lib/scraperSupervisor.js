import { createProcessSupervisor } from '@/lib/processManager';
import { PATHS } from '@/lib/paths';

export const scraperSupervisor = createProcessSupervisor({
  name: 'scraper',
  scriptPath: PATHS.scraperEntry,
});
