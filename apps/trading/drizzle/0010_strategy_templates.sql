-- Named parameter templates: multiple saved run configs per strategy, on top of
-- the single main default in strategy_defaults. `params` holds the same full
-- run-config jsonb (form seeds + interval/window/equity/costs) as
-- strategy_defaults.params; a template is picked when starting a New Run.
create table if not exists strategy_templates (
  id varchar(36) primary key,
  user_id varchar(36) not null references users (id) on delete cascade,
  strategy_type varchar(20) not null,
  name varchar(80) not null,
  params jsonb not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  constraint strategy_templates_strategy_type_check
    check (strategy_type in ('grid', 'dca', 'momentum', 'qqe', 'copy')),
  unique (user_id, strategy_type, name)
);

create index if not exists ix_strategy_templates_user_strategy
  on strategy_templates (user_id, strategy_type);

-- Fix: qqe was added to the app's strategies but never to this constraint, so
-- saving a QQE default would violate it. Widen to include qqe.
alter table strategy_defaults
  drop constraint if exists strategy_defaults_strategy_type_check;
alter table strategy_defaults
  add constraint strategy_defaults_strategy_type_check
  check (strategy_type in ('grid', 'dca', 'momentum', 'qqe', 'copy'));
