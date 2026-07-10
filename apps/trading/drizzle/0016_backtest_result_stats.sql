-- List pages only need each run's headline stats, but extracting them from
-- `result` forces Postgres to decompress the full blob (equity curve + every
-- fill — ~0.5MB/row) for every row on every list load. Store the small stats
-- object in its own column instead; list queries read only this.
alter table backtests add column if not exists result_stats jsonb;

update backtests
set result_stats = (result -> 'stats')
  || jsonb_build_object(
    'firstEntryMs', result #> '{trades,0,entryTime}',
    'lastExitMs', result -> 'trades' -> -1 -> 'exitTime'
  )
where result is not null
  and result_stats is null;
