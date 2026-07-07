-- Run triage: a per-run workflow status (distinct from the execution `status`
-- column) plus a pinned flag. Both are group-level — set on every row of a run
-- group, read from the group's main row. Defaults keep existing runs in the
-- "review" bucket, unpinned.
alter table backtests
  add column if not exists review_status varchar(10) not null default 'review';
alter table backtests
  drop constraint if exists backtests_review_status_check;
alter table backtests
  add constraint backtests_review_status_check
  check (review_status in ('review', 'archived'));

alter table backtests
  add column if not exists pinned boolean not null default false;
