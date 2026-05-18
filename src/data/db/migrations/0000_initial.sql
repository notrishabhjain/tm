CREATE TABLE IF NOT EXISTS `tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `body` text,
  `source_app` text NOT NULL,
  `sender` text,
  `priority` text NOT NULL,
  `status` text NOT NULL DEFAULT 'PENDING',
  `confidence` real NOT NULL,
  `rule_score` real NOT NULL DEFAULT 0,
  `model_score` real,
  `language` text NOT NULL DEFAULT 'EN',
  `matched_keywords` text NOT NULL DEFAULT '[]',
  `needs_confirmation` integer NOT NULL DEFAULT false,
  `calendar_event_id` text,
  `created_at` integer NOT NULL,
  `completed_at` integer,
  `deleted_at` integer
);

CREATE TABLE IF NOT EXISTS `vip_contacts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `identifier` text NOT NULL,
  `display_name` text NOT NULL,
  `source_app` text NOT NULL DEFAULT '*',
  `created_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `monitored_apps` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `package_name` text NOT NULL,
  `display_name` text NOT NULL,
  `is_active` integer NOT NULL DEFAULT true,
  `created_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `seed_keywords` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `keyword` text NOT NULL,
  `language` text NOT NULL,
  `priority_hint` text NOT NULL DEFAULT 'MEDIUM',
  `category` text NOT NULL DEFAULT 'IMPERATIVE',
  `weight` real NOT NULL DEFAULT 1.0,
  `created_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `learned_keywords` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `ngram` text NOT NULL,
  `weight` real NOT NULL DEFAULT 0.5,
  `language` text NOT NULL,
  `occurrence_count` integer NOT NULL DEFAULT 0,
  `status` text NOT NULL DEFAULT 'PENDING',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `sender_stats` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `sender_key` text NOT NULL,
  `confirm_count` integer NOT NULL DEFAULT 0,
  `reject_count` integer NOT NULL DEFAULT 0,
  `auto_accept_count` integer NOT NULL DEFAULT 0,
  `last_seen_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `training_log` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `task_id` text NOT NULL,
  `action` text NOT NULL,
  `ngrams_extracted` text NOT NULL DEFAULT '[]',
  `created_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `discarded_log` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `notification_id` text NOT NULL DEFAULT '',
  `source_app` text NOT NULL,
  `sender` text,
  `body_preview` text NOT NULL,
  `reason` text NOT NULL,
  `confidence` real NOT NULL,
  `created_at` integer NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS `idx_tasks_created_at` ON `tasks` (`created_at`);
CREATE INDEX IF NOT EXISTS `idx_tasks_status` ON `tasks` (`status`);
CREATE INDEX IF NOT EXISTS `idx_tasks_priority` ON `tasks` (`priority`);
CREATE INDEX IF NOT EXISTS `idx_tasks_needs_confirmation` ON `tasks` (`needs_confirmation`);
CREATE INDEX IF NOT EXISTS `idx_tasks_deleted_at` ON `tasks` (`deleted_at`);
CREATE UNIQUE INDEX IF NOT EXISTS `idx_seed_kw_lang` ON `seed_keywords` (`keyword`, `language`);
CREATE UNIQUE INDEX IF NOT EXISTS `idx_learned_ngram_lang` ON `learned_keywords` (`ngram`, `language`);
CREATE UNIQUE INDEX IF NOT EXISTS `idx_sender_stats_key` ON `sender_stats` (`sender_key`);
