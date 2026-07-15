create table market_scanner_runtime_control (
  id varchar(20) primary key check (id = 'default'),
  enabled boolean not null,
  updated_at timestamp with time zone not null
);

insert into market_scanner_runtime_control (id, enabled, updated_at)
values ('default', true, now());
