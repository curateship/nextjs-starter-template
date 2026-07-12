-- Categorize Automations by trading style (e.g. Day Trading, Swing Trading).
-- Free-form label so users can add their own categories, defaulting to
-- 'Uncategorized' for every existing row. No check constraint on purpose —
-- the preset list lives in the app and custom values are allowed.
alter table trading_automations
  add column if not exists type varchar(40) not null default 'Uncategorized';
