-- Trading Automations persist an editable canvas draft and the last config
-- compiled successfully by the server. Invalid drafts remain editable while a
-- null compiled_config guarantees they cannot be run accidentally.

create table if not exists trading_automations (
  id varchar(36) primary key,
  user_id varchar(36) not null references users(id) on delete cascade,
  name varchar(80) not null,
  interval varchar(5) not null default '15m',
  graph jsonb not null default '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1},"protection":{}}'::jsonb,
  compiled_config jsonb,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  constraint trading_automations_user_id_name_unique unique (user_id, name),
  constraint trading_automations_interval_check
    check (interval in ('1m', '5m', '15m', '1h', '4h', '1d'))
);

create index if not exists ix_trading_automations_user_updated
  on trading_automations (user_id, updated_at);

-- Bots and backtests keep their compiled params as the runnable snapshot. The
-- nullable source link is display/provenance only and disappears safely if the
-- editable Automation is deleted.
alter table bots add column if not exists automation_id varchar(36)
  references trading_automations(id) on delete set null;
alter table backtests add column if not exists automation_id varchar(36)
  references trading_automations(id) on delete set null;

create index if not exists ix_bots_automation_id on bots (automation_id);
create index if not exists ix_backtests_automation_id on backtests (automation_id);

alter table bots drop constraint if exists bots_strategy_type_check;
alter table bots
  add constraint bots_strategy_type_check
  check (strategy_type in ('signal', 'automation'));
