ALTER TABLE tasks ADD COLUMN notification_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_notification_key ON tasks(notification_key) WHERE notification_key IS NOT NULL;
ALTER TABLE discarded_log ADD COLUMN notification_key TEXT;
