-- Forma storage: one row per top level state key, and one row per day of food (foods:YYYY-MM-DD)
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
