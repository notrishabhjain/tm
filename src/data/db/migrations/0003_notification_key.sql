ALTER TABLE tasks ADD COLUMN notification_key TEXT;
-- Non-unique: messaging apps (WhatsApp/Signal) reuse one sbn.key per conversation,
-- so multiple distinct messages legitimately share the same notification_key.
CREATE INDEX IF NOT EXISTS idx_tasks_nk ON tasks(notification_key) WHERE notification_key IS NOT NULL;
ALTER TABLE discarded_log ADD COLUMN notification_key TEXT;
