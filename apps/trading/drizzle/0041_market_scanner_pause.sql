create table if not exists market_scanner_control (
  user_id varchar(36) primary key references users(id) on delete cascade,
  paused boolean not null default false,
  updated_at timestamp with time zone not null
);
