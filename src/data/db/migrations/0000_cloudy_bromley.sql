CREATE TABLE `discarded_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`source_app` text NOT NULL,
	`sender` text,
	`confidence` real NOT NULL,
	`reason` text NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learned_keywords` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phrase` text NOT NULL,
	`category` text NOT NULL,
	`language` text NOT NULL,
	`frequency` integer DEFAULT 0 NOT NULL,
	`weight` real DEFAULT 0.5 NOT NULL,
	`confirm_count` integer DEFAULT 0 NOT NULL,
	`delete_count` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`first_seen` integer NOT NULL,
	`last_used` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_phrase_lang` ON `learned_keywords` (`phrase`,`language`);--> statement-breakpoint
CREATE TABLE `monitored_apps` (
	`package_name` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`enabled` integer NOT NULL,
	`added_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `seed_keywords` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phrase` text NOT NULL,
	`category` text NOT NULL,
	`language` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sender_stats` (
	`sender_name` text NOT NULL,
	`source_app` text NOT NULL,
	`tasks_created` integer DEFAULT 0 NOT NULL,
	`tasks_confirmed` integer DEFAULT 0 NOT NULL,
	`tasks_deleted` integer DEFAULT 0 NOT NULL,
	`tasks_completed` integer DEFAULT 0 NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	PRIMARY KEY(`sender_name`, `source_app`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`raw_source_text` text NOT NULL,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`source_app` text NOT NULL,
	`source_app_display` text NOT NULL,
	`sender` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`deleted_at` integer,
	`due_at` integer,
	`trigger_keywords` text NOT NULL,
	`confidence` real NOT NULL,
	`rule_score` real NOT NULL,
	`model_score` real,
	`needs_confirmation` integer NOT NULL,
	`calendar_event_id` text,
	`language` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_created_at` ON `tasks` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_tasks_status` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_priority` ON `tasks` (`priority`);--> statement-breakpoint
CREATE TABLE `training_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`label` text NOT NULL,
	`source` text NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vip_contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
