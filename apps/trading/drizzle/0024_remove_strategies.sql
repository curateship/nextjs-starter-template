-- The strategies system is removed: Automations are the only strategy source.
-- The signal engine is gone from the code, so signal bots can no longer run —
-- delete any (none exist at time of writing) and tighten the type check.
-- Retired types are named EXPLICITLY so this re-running cleanup can never
-- delete rows a future era creates.
delete from bots
where strategy_type in
  ('signal', 'grid', 'dca', 'momentum', 'qqe', 'vwap', 'copy');

alter table bots drop constraint if exists bots_strategy_type_check;
alter table bots add constraint bots_strategy_type_check
  check (strategy_type in ('automation'));

-- The display-only provenance link to the strategies table.
alter table bots drop column if exists strategy_id;

-- The strategies library tables (named templates + per-indicator defaults).
drop table if exists strategies;
drop table if exists strategy_settings;

-- Remove the retired "Strategies" entry from every saved workspace nav.
update workspaces
set settings = jsonb_set(
  settings,
  '{sections}',
  (
    select coalesce(
      jsonb_agg(
        case
          when jsonb_typeof(section -> 'entries') = 'array' then
            jsonb_set(
              section,
              '{entries}',
              (
                select coalesce(jsonb_agg(entry), '[]'::jsonb)
                from jsonb_array_elements(section -> 'entries') entry
                where entry ->> 'id' is distinct from 'item-strategies'
                  and entry ->> 'href' is distinct from '/strategies'
              )
            )
          else section
        end
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(settings -> 'sections') section
  )
)
where jsonb_typeof(settings -> 'sections') = 'array';
