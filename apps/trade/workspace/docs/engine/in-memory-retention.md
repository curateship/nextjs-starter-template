# Engine memory retention

Temporary engine maps must have either an expiry or a fixed capacity.

- **Account and portfolio answers:** `engine-exchange-reads.ts` removes each
  answer after its existing five-second window, even if that wallet never
  returns. Age starts when the read begins, not when the exchange answers.
- **Waiting callers:** Removing the cache entry does not cancel its promise.
  A pass already awaiting that answer still receives its result.
- **Replacement safety:** Expiry and failure handlers remove only the exact
  promise they belong to. An older read cannot delete a newer answer.
- **Pacing timestamps:** `rememberEngineTimestamp` in `engine-memory.ts` holds
  at most 5,000 entries per map. Updating an existing wallet preserves the other
  entries. Adding a new wallet at capacity clears the map before remembering
  that wallet, following the existing remembered-trigger pattern.
- **Covered maps:** The fill sweep, engine sweep, watched-order chase and
  signal-order chase all use that same helper. Their keys and timing windows
  are unchanged. The helper stores the caller's time without reading a clock.
- **Effect of clearing:** A cleared pacing map can allow an early sweep or
  chase, like a process restart. Plans still retain their own chase timestamps.
  No orders, positions, fills or other permanent records are deleted.
- **Pattern for new maps:** Use age-based eviction for cached promises and
  identity-check each expiry or rejection. Use the shared capacity helper for
  disposable pacing timestamps. Do not size-evict account promises.

## Verification

The focused tests check capacity crossings, updates at capacity and caller-owned
time. Exchange-read tests observe the actual private maps: 100 accounts and
100 portfolios remain before expiry, then both maps reach zero without another
read. Tests also cover a slow pending read, an idle wallet returning, and an old
failure or expiry arriving after a replacement.

Run from Trade:

```sh
./node_modules/.bin/vitest run --config vitest.app.config.ts src/server/trade/engine-memory.test.ts src/server/trade/engine-exchange-reads.test.ts src/server/trade/live-smart-orders.test.ts src/server/trade/live-fills.test.ts src/server/trade/smart-watch.test.ts src/server/trade/smart-signals.test.ts
```

The operational follow-up is a one-hour heap comparison on a worker running
this change with several wallets. Record retained account/portfolio entries,
the four timestamp-map sizes, and heap bytes before and after the hour. Collect
both snapshots under comparable load. Heap snapshots can contain private
account data, so keep them private and do not commit them. A total heap increase
alone does not establish a leak in these maps.
