import { useCallback } from 'react';
import { createBackup } from '../storage/sanitize';
import { useFeedback } from '../state/feedback';
import { useStore } from '../state/store';
import { downloadText } from '../lib/download';

/** Download the whole app state as a JSON backup file. */
export function useExportBackup() {
  const { data } = useStore();
  const { toast } = useFeedback();
  return useCallback(() => {
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      downloadText(`pace-backup-${stamp}.json`, JSON.stringify(createBackup(data), null, 2), 'application/json');
      toast('Backup downloaded. Keep it somewhere safe.');
    } catch {
      toast('Could not create the backup file.', { kind: 'error' });
    }
  }, [data, toast]);
}
