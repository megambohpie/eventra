import { listIncidents, listPickLists, listReplacements } from '@eventra/api-client';
import type { Role } from '@eventra/shared';
import { api } from '@/api';
import { buildTasks, taskSourcesFor } from '@/lib/tasks';
import { useAsync } from './useAsync';

/** Daftar tugas lapangan sesuai peran (dipakai Beranda dan halaman Tugas). */
export function useTasks(role: Role) {
  return useAsync(async () => {
    const want = taskSourcesFor(role);
    const [pickLists, replacements, incidents] = await Promise.all([
      want.pickLists ? listPickLists(api, { pageSize: 100 }) : null,
      want.replacements ? listReplacements(api, { pageSize: 100 }) : null,
      want.incidents ? listIncidents(api, { pageSize: 100 }) : null,
    ]);
    return buildTasks(role, {
      pickLists: pickLists?.items,
      replacements: replacements?.items,
      incidents: incidents?.items,
    });
  }, role);
}
