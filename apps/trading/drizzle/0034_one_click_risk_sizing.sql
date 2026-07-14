alter table order_templates
  add column sizing_mode varchar(10) not null default 'wallet';

alter table order_templates
  add constraint order_templates_sizing_mode_check
  check (sizing_mode in ('wallet', 'risk'));
