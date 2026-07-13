create table if not exists order_templates (
  id varchar(36) primary key,
  user_id varchar(36) not null references users (id) on delete cascade,
  name varchar(80) not null,
  order_size_pct numeric not null,
  leverage integer not null default 5,
  stop_loss_pct numeric not null,
  take_profit_pct numeric not null,
  is_default boolean not null default false,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  unique (user_id, name)
);

create index if not exists ix_order_templates_user_id
  on order_templates (user_id);

create unique index if not exists ux_order_templates_user_default
  on order_templates (user_id)
  where is_default;
