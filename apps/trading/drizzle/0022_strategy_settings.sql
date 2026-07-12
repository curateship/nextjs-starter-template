-- One editable default config for each of the seven fixed strategies, per user.
-- Named configs remain in `strategies` and are treated as templates.
delete from strategies
where coalesce(config ->> 'kind', 'signal') <> 'signal';

create table if not exists strategy_settings (
  user_id varchar(36) not null references users(id) on delete cascade,
  strategy_type varchar(40) not null,
  config jsonb not null,
  pinned boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, strategy_type)
);

alter table strategy_settings
  add column if not exists pinned boolean not null default false;

create index if not exists ix_strategy_settings_user_id
  on strategy_settings (user_id);

-- Promote the old Backtest/Templates nav pair into the canonical
-- Strategies/Backtest pair. The old id disappears, so migration replay cannot
-- resurrect this item after a user later removes it.
update workspaces
set settings = jsonb_set(
  settings,
  '{sections}',
  (
    select jsonb_agg(
      case
        when section->>'id' = 'section-trading'
        then jsonb_set(
          section,
          '{entries}',
          (
            select jsonb_agg(
              case
                when entry->>'id' = 'item-backtest'
                then jsonb_build_object(
                  'id', 'item-strategies',
                  'href', '/strategies',
                  'icon', 'layers',
                  'type', 'item',
                  'label', 'Strategies',
                  'visible', true,
                  'children', jsonb_build_array(
                    jsonb_build_object(
                      'id', 'item-strategies-backtest',
                      'href', '/backtest',
                      'icon', 'flask-conical',
                      'label', 'Backtest'
                    )
                  )
                )
                else entry
              end
              order by entry_ord
            )
            from jsonb_array_elements(section->'entries')
              with ordinality as entries(entry, entry_ord)
          )
        )
        else section
      end
      order by section_ord
    )
    from jsonb_array_elements(settings->'sections')
      with ordinality as sections(section, section_ord)
  )
)
where jsonb_typeof(settings->'sections') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(settings->'sections') as section,
         jsonb_array_elements(section->'entries') as entry
    where entry->>'id' = 'item-backtest'
  );
