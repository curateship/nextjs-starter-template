-- Per-user overlay-indicator settings for the trade chart, replacing the
-- browser's localStorage copy so settings follow the account. One row per
-- customized indicator; indicators without a row use the app defaults.
create table if not exists indicator_settings (
  id varchar(36) primary key,
  user_id varchar(36) not null references users (id) on delete cascade,
  indicator_id varchar(40) not null,
  type varchar(20) not null,
  name varchar(80),
  enabled boolean not null,
  params jsonb not null,
  color varchar(20),
  session varchar(20),
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  unique (user_id, indicator_id)
);

create index if not exists ix_indicator_settings_user_id
  on indicator_settings (user_id);
