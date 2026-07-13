alter table order_templates
  add column if not exists use_limit_order boolean not null default false;
