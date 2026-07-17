-- Per-line color overrides for multi-line indicators: the EMA settings card
-- gives each of its three lines its own color picker; picks live here as
-- {"fast": "#rrggbb", ...}. Null = palette defaults.
alter table indicator_settings add column colors jsonb;
