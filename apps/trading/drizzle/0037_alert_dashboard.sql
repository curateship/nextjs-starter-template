create table if not exists alert_rules (
  id varchar(36) primary key,
  user_id varchar(36) not null references users(id) on delete cascade,
  rule_slot integer not null,
  name varchar(100) not null,
  message text,
  coin varchar(64) not null,
  kind varchar(20) not null check (kind in ('price_level', 'price_move', 'volume_spike')),
  operator varchar(20),
  direction varchar(4),
  level numeric,
  percent numeric,
  multiplier numeric,
  time_window varchar(4),
  trigger_mode varchar(6) not null check (trigger_mode in ('once', 'repeat')),
  cooldown varchar(4),
  status varchar(10) not null check (status in ('active', 'paused', 'triggered')),
  last_evaluated_at timestamptz,
  last_triggered_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint alert_rules_slot_check check (rule_slot between 1 and 100),
  constraint alert_rules_user_slot_unique unique (user_id, rule_slot),
  constraint alert_rules_trigger_check check (
    (trigger_mode = 'once' and cooldown is null) or
    (trigger_mode = 'repeat' and cooldown in ('5m', '15m', '1h', '4h', '24h'))
  ),
  constraint alert_rules_condition_check check (
    (kind = 'price_level' and operator in ('crossing', 'crossing_up', 'crossing_down') and level > 0 and direction is null and percent is null and multiplier is null and time_window is null) or
    (kind = 'price_move' and operator is null and level is null and direction in ('up', 'down') and percent > 0 and percent <= 100 and multiplier is null and time_window in ('1m', '5m', '15m', '1h', '4h', '24h')) or
    (kind = 'volume_spike' and operator is null and level is null and direction is null and percent is null and multiplier > 1 and multiplier <= 100 and time_window in ('1m', '5m', '15m', '1h', '4h', '24h'))
  )
);

create index if not exists ix_alert_rules_user_updated
  on alert_rules (user_id, updated_at desc);
create index if not exists ix_alert_rules_active_coin
  on alert_rules (coin, status) where status = 'active';

create table if not exists alert_events (
  id varchar(36) primary key,
  user_id varchar(36) not null references users(id) on delete cascade,
  rule_id varchar(36) references alert_rules(id) on delete set null,
  event_key varchar(200) not null,
  alert_name varchar(100) not null,
  message text,
  coin varchar(64) not null,
  kind varchar(20) not null,
  operator varchar(20),
  direction varchar(4),
  level numeric,
  percent numeric,
  multiplier numeric,
  time_window varchar(4),
  trigger_mode varchar(6) not null,
  cooldown varchar(4),
  observed numeric not null,
  title text not null,
  body text,
  occurred_at timestamptz not null,
  read_at timestamptz,
  created_at timestamptz not null,
  constraint alert_events_user_event_unique unique (user_id, event_key),
  constraint alert_events_kind_check check (kind in ('price_level', 'price_move', 'volume_spike')),
  constraint alert_events_trigger_check check (
    (trigger_mode = 'once' and cooldown is null) or
    (trigger_mode = 'repeat' and cooldown in ('5m', '15m', '1h', '4h', '24h'))
  ),
  constraint alert_events_condition_check check (
    (kind = 'price_level' and operator in ('crossing', 'crossing_up', 'crossing_down') and level > 0 and direction is null and percent is null and multiplier is null and time_window is null) or
    (kind = 'price_move' and operator is null and level is null and direction in ('up', 'down') and percent > 0 and percent <= 100 and multiplier is null and time_window in ('1m', '5m', '15m', '1h', '4h', '24h')) or
    (kind = 'volume_spike' and operator is null and level is null and direction is null and percent is null and multiplier > 1 and multiplier <= 100 and time_window in ('1m', '5m', '15m', '1h', '4h', '24h'))
  )
);

create index if not exists ix_alert_events_user_occurred
  on alert_events (user_id, occurred_at desc, id desc);
create index if not exists ix_alert_events_user_unread
  on alert_events (user_id, read_at);

update workspaces
set settings = jsonb_set(
  settings,
  '{sections}',
  (
    select jsonb_agg(
      jsonb_set(
        section,
        '{entries}',
        coalesce(
          (
            select jsonb_agg(
              case
                when entry->>'href' = '/trade' or entry->>'id' = 'item-trade'
                then jsonb_set(
                  entry,
                  '{children}',
                  coalesce(
                    (
                      select jsonb_agg(child order by child_ord)
                      from jsonb_array_elements(coalesce(entry->'children', '[]'::jsonb))
                        with ordinality as children(child, child_ord)
                      where child->>'href' not in ('/alerts', '/alert-log')
                        and child->>'id' not in ('item-trade-alerts', 'item-trade-alert-log')
                    ),
                    '[]'::jsonb
                  ) || jsonb_build_array(
                    jsonb_build_object(
                      'id', 'item-trade-alerts',
                      'label', 'Alerts',
                      'href', '/alerts'
                    ),
                    jsonb_build_object(
                      'id', 'item-trade-alert-log',
                      'label', 'Alert Log',
                      'href', '/alert-log'
                    )
                  )
                )
                else entry
              end
              order by entry_ord
            )
            from jsonb_array_elements(coalesce(section->'entries', '[]'::jsonb))
              with ordinality as entries(entry, entry_ord)
          ),
          '[]'::jsonb
        )
      )
      order by section_ord
    )
    from jsonb_array_elements(settings->'sections')
      with ordinality as sections(section, section_ord)
  )
)
where jsonb_typeof(settings->'sections') = 'array';
