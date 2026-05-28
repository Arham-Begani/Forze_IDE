-- Forze IDE — local SQLite schema (offline-first cache)
-- Mirrors the central Supabase/Postgres workspace tables but keeps an
-- append-only mutation log so it can replay deterministically on reconnect.

CREATE TABLE IF NOT EXISTS local_mutation_log (
  id          TEXT PRIMARY KEY,
  table_name  TEXT NOT NULL,
  row_id      TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  payload     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  synced      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mutation_log_unsynced
  ON local_mutation_log (synced, created_at);

CREATE INDEX IF NOT EXISTS idx_mutation_log_target
  ON local_mutation_log (table_name, row_id);

-- Mirror of the venture context that drives Forge personas.
CREATE TABLE IF NOT EXISTS ventures (
  id          TEXT PRIMARY KEY,
  founder_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  brand_json  TEXT NOT NULL DEFAULT '{}',
  updated_at  INTEGER NOT NULL
);

-- Cached compiled artifacts so the Boardroom Sim can replay without rebuilding.
CREATE TABLE IF NOT EXISTS build_snapshots (
  id            TEXT PRIMARY KEY,
  venture_id    TEXT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  dom_snapshot  TEXT NOT NULL,
  survival_score INTEGER,
  created_at    INTEGER NOT NULL
);
