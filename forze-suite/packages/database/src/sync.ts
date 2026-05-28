import type { SupabaseClient } from '@supabase/supabase-js';
import { MutationLogSchema, type MutationLog } from './schema.js';

export interface SyncResult {
  applied: number;
  failed: number;
  errors: { id: string; message: string }[];
}

/**
 * Replays the offline mutation log against a remote Supabase instance in the
 * order the mutations were captured. Each row is upserted (or deleted) using
 * the table name and primary key recorded in the log entry.
 *
 * The function is intentionally tolerant — a single conflicting row should not
 * cancel the rest of the queue. Failures are collected and returned so the
 * caller can surface them in the IDE status bar.
 */
export async function synchronizeLocalMutations(
  localLogs: MutationLog[],
  supabaseClient: SupabaseClient,
): Promise<SyncResult> {
  const result: SyncResult = { applied: 0, failed: 0, errors: [] };

  const validated = localLogs.map((log) => MutationLogSchema.parse(log));
  const sorted = [...validated].sort((a, b) => a.created_at - b.created_at);

  for (const log of sorted) {
    try {
      const data = log.payload.length === 0 ? {} : JSON.parse(log.payload);

      if (log.action === 'INSERT' || log.action === 'UPDATE') {
        const { error } = await supabaseClient
          .from(log.table_name)
          .upsert({
            id: log.row_id,
            ...data,
            updated_at: new Date(log.created_at).toISOString(),
          });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabaseClient
          .from(log.table_name)
          .delete()
          .eq('id', log.row_id);
        if (error) throw new Error(error.message);
      }

      result.applied += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push({
        id: log.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
