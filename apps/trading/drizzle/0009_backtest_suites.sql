-- Validation suites were replaced by multi-market run groups (one backtests
-- row per market sharing a group_id), so the suite table and the winner-run
-- link column are dropped. Never deployed to prod; this cleans up local DBs
-- that created them.
drop table if exists backtest_suites;
alter table backtests drop column if exists suite_id;
