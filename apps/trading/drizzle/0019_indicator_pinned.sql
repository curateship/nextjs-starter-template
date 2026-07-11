-- Pinned indicators are the trade chart's working set: only pinned ones show
-- in the chart's Indicators dropdown (and draw). Backfill pinned = enabled so
-- indicators that were already on the chart stay there. The backfill must run
-- only when the column is first created — migrations re-run on every boot and
-- an unconditional update would undo later unpins.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'indicator_settings' and column_name = 'pinned'
  ) then
    alter table indicator_settings
      add column pinned boolean not null default false;
    update indicator_settings set pinned = enabled;
  end if;
end $$;
