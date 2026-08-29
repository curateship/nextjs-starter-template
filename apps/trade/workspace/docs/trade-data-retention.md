# Trade data retention

Trade keeps account settings, current trading state and trading records for as
long as the account exists. The automatic sweep never deletes them.

The 30 trading tables follow these rules:

| Tables | Rule |
| --- | --- |
| `trade_market_favorites`, `trade_market_folders`, `trade_market_folder_items`, `trade_prefs`, `trade_chart_drawings`, `trade_liquidation_warnings` | Account settings. Keep while the account exists. |
| `trade_wallets`, `trade_paper_positions`, `trade_paper_orders`, `trade_paper_state`, `trade_worker_controls`, `trade_worker_heartbeats` | Current state. Keep while the account or worker exists. |
| `trade_live_journal`, `trade_live_fills`, `trade_live_triggers`, `trade_paper_journal`, `trade_smart_ladders`, `trade_backtest_groups`, `trade_backtests`, `trade_engine_outages`, `trade_flow_runs`, `trade_flow_run_orders`, `trade_wallet_nonces`, `trade_notice_links` | Trading and operating records. Keep while the account exists. |
| `trade_candles`, `trade_candle_coverage`, `trade_candle_gaps`, `trade_funding_rates`, `trade_funding_coverage`, `trade_funding_gaps` | Exchange caches. Keep ten years, then remove in capped batches. |

Candles, candle coverage, candle gaps, funding rates, funding coverage and
funding gaps are exchange caches. Trade keeps ten years, matching the longest
backtest window the app accepts. Once a day, the first dashboard request asks
the database to remove up to 10,000 old rows from each cache table. A large
backlog therefore shrinks over repeated days without one page request trying to
delete everything.

Coverage and gap rows are removed with the price or funding rows. If somebody
runs an older dated backtest later, Trade asks the exchange for that stretch
again instead of believing deleted rows are still present. A delisted market is
the exception. An exchange may no longer return its old history, so cached data
older than ten years can be lost. Trading and backtest result records remain.

The sweep does nothing while any backtest is waiting or running. The pause
keeps a backtest from losing rows between its coverage check and its data read.

The database first addressed through the shell host name `base` could not be
counted on 28 August 2026 because that name did not resolve. Migrations `0150`
and `0151` were later applied to the Trade database configured in `.env.local`
to restore the running app. No pre-migration table counts were captured, so no
before number exists and a local test-database estimate must not replace one.
