-- Runtime pause switch for the research scanner worker. Single row keyed
-- 'default'; the worker polls `paused` and stops/starts its subsystems.
create table if not exists scanner_control (
  id varchar(20) primary key,
  paused boolean not null default false,
  updated_at timestamp with time zone not null
);

insert into scanner_control (id, paused, updated_at)
values ('default', false, now())
on conflict (id) do nothing;
