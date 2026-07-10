-- vwap is a backtestable strategy offered in New Run, but was never added to
-- these strategy-type check constraints (same gap qqe had in 0010). Saving a
-- vwap default/template — or renaming a vwap strategy — would violate them.
-- Widen both to include vwap so every backtestable strategy behaves the same.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'strategy_defaults_strategy_type_check'
  ) then
    alter table strategy_defaults
      add constraint strategy_defaults_strategy_type_check
      check (strategy_type in ('grid', 'dca', 'momentum', 'qqe', 'vwap', 'copy'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'strategy_templates_strategy_type_check'
  ) then
    alter table strategy_templates
      add constraint strategy_templates_strategy_type_check
      check (strategy_type in ('grid', 'dca', 'momentum', 'qqe', 'vwap', 'copy'));
  end if;
end $$;
