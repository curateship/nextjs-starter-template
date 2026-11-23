alter table worker_controls
  drop constraint worker_controls_kind_check;

alter table worker_controls
  add constraint worker_controls_kind_check check (
    kind in ('bot', 'whale-scanner', 'market-scanner', 'alert', 'backtest')
  );

insert into worker_controls (kind, enabled, paused, updated_at)
values ('alert', true, false, now());
