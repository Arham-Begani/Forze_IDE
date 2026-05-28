import { z } from 'zod';

export const MutationActionSchema = z.enum(['INSERT', 'UPDATE', 'DELETE']);
export type MutationAction = z.infer<typeof MutationActionSchema>;

export const MutationLogSchema = z.object({
  id: z.string().min(1),
  table_name: z.string().min(1),
  row_id: z.string().min(1),
  action: MutationActionSchema,
  payload: z.string(),
  created_at: z.number().int().nonnegative(),
  synced: z.number().int().min(0).max(1).default(0).optional(),
});

export type MutationLog = z.infer<typeof MutationLogSchema>;

export const VentureSchema = z.object({
  id: z.string().uuid(),
  founder_id: z.string().min(1),
  name: z.string().min(1),
  brand_json: z.string().default('{}'),
  updated_at: z.number().int().nonnegative(),
});

export type Venture = z.infer<typeof VentureSchema>;

export const BuildSnapshotSchema = z.object({
  id: z.string().min(1),
  venture_id: z.string().uuid(),
  dom_snapshot: z.string(),
  survival_score: z.number().int().min(0).max(100).nullable().optional(),
  created_at: z.number().int().nonnegative(),
});

export type BuildSnapshot = z.infer<typeof BuildSnapshotSchema>;
