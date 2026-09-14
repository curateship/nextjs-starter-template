# Key permissions

Trade checks whether a saved trading key can withdraw money and warns without stopping trading.

- **Saving a key:** Adding or replacing a key checks permissions before storing the result. Credential verification still runs separately.
- **Withdrawal warning:** The wallet row and details show an amber warning asking for a trade-only replacement. The save dialog stays open with the warning and a Done button.
- **Trade-only:** The exchange must report trading permission and no withdrawal permission. A missing field never proves either permission.
- **Where the safe answer is said:** "Trade-only key" appears in the wallet windows only — the add, edit, details and key-permission dialogs. The account panel's wallet rows say nothing when a key is safe (Tyler, 13 Sep 2026), so a clean list stays clean. The withdrawal warning and the "could not check" notice still appear on those rows, because both ask for something to be done.
- **Unknown:** Unsupported, malformed, refused, or unavailable reads show "Could not check what this key may do". Unknown checks produce no repeated error toast.
- **Refresh:** Existing wallets get their first check on the next wallet list or panel read. Panel reads check only the selected protocol. Results refresh after five minutes on the next read.
- **Inactive wallets:** Their stored keys receive permission checks too. Balance reads and trading remain off.
- **Failed refresh:** A previously observed withdrawal permission keeps its warning when a later check fails. A successful permission read can update the result.
- **Replacement safety:** A check of an old encrypted credential cannot overwrite a replacement credential's result. A stale check also cannot overwrite a newer result from another process.
- **Record:** Each completed check writes only the normalized result to `trade_live_journal` with action `key-permissions`. The record contains no key, raw response, or exchange error. The trading Journal tab continues to show fills.
- **Storage:** Migration `0178_trade_key_permissions.sql` adds the permission result and check time to `trade_wallets`. Existing rows start unchecked.

## What each protocol exposes

- **Aster:** Signed `GET /fapi/v3/agent` returns agents and their permissions. Trade matches the credential's signer and reads `canWithdraw` and `canPerpTrade`. Aster leaves the request weight unspecified, so Trade reserves 30 request units, matching an account-settings read. See [Aster's agent API](https://asterdex.github.io/aster-api-website/asterCode/endpoints/).
- **KuCoin:** Signed `GET /api/v1/user/api-key` uses `api.kucoin.com`, including for Futures keys. Trade reads the comma-separated `permission` field. `Withdrawal` warns; `Futures` with only known non-withdrawal permissions reports trade-only. Unrecognized permissions remain unknown. See [KuCoin's key information API](https://www.kucoin.com/docs-new/rest/account-info/account-funding/get-apikey-info).
- **Hyperliquid:** An approved agent key cannot withdraw. Trade classifies the stored agent locally without a network call. A legacy key matching the main account warns instead. Saving a new main-account key remains refused by the existing credential verification. See [Hyperliquid's API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/api-wallets).
- **Phemex:** The published API documents withdrawal-enabled keys but no read of the current key's permission list. Trade reports unknown without guessing or attempting a withdrawal. See [Phemex's API reference](https://phemex-docs.github.io/).
- **Lighter:** The documented API-key lookup identifies registered keys but does not expose withdrawal permissions. Trade reports unknown. See [Lighter's key lookup](https://apidocs.lighter.xyz/reference/apikeys).
- **Solana and BNB Chain:** These credentials are wallet private keys rather than exchange permission lists. No permission reader is registered, so Trade reports unknown. A trade-only exchange key is not a replacement for a chain wallet private key.
- **Testnet:** The reader receives the wallet's saved network. Unsupported networks or refused permission endpoints remain unknown. No check submits an order, transfer, or withdrawal.

## Testing

- **Focused checks:** Run the permission tests under the Aster, KuCoin and Hyperliquid folders, `server/trade/wallets.test.ts`, and both wallet UI test files with `vitest run --config vitest.app.config.ts`.
- **Risky key:** Add an exchange test key whose permission answer includes withdrawals. Expect "Wallet saved", the withdrawal warning, and Done. Closing the dialog must leave the warning on the wallet row and details.
- **Replacement:** Replace the key with a verified trade-only key. Expect the old warning to clear, the wallet row to fall silent, and the wallet window to say "Trade-only key".
- **Unknown check:** Refuse the permission read while allowing credential verification and balance reads. Expect the wallet to save with the unknown message, without repeated toasts.
- **Existing wallet:** Open a protocol containing an unchecked wallet. Expect its result to persist and survive reloading.
- **Refresh:** Change permissions on the exchange. After five minutes, the next wallet read should update the stored result. A failed refresh must preserve a known withdrawal warning.
- **Privacy:** Permission journal rows must contain only the result. Keys and raw exchange responses must never appear.

## Validation and rollout

- **Automated checks:** 104 tests passed across ten focused files. The latest audit reran 78 tests across seven permission, wallet-store, UI, and signed-client files. Changed files pass ESLint and `git diff --check`.
- **Browser fixtures:** Playwright rendered the real add/edit dialogs and wallet rows using the running server's modules. Mocked save responses exercised withdrawal warnings, trade-only and unknown states, saving once, and keyboard dismissal.
- **Layout:** At 390 pixels, the warning uses 342 pixels and fits without horizontal scrolling. Desktop and both themes also passed. The final fixture run reported no page errors or failed requests.
- **Real wallet reads:** After migration, the authenticated local app returned 13 wallets without page errors. Ten real keys produced six trade-only results and four unknown results. A separate database connection confirmed those saved results and ten journal rows containing only the expected status text.
- **Limits:** Withdrawal-enabled key saves and replacements used controlled fixtures. No real withdrawal-enabled exchange key was added or changed.
- **Other checks:** Type checking reports errors in untouched chart and trading test files. The protocol-fence tests report existing protocol comparisons and BNB table imports outside this change.
- **Migration:** Tyler authorized migration 0178 on 13 September 2026. The standard migration runner applied only that pending file to the database shared by local and live configuration. Both nullable columns and the migration record were verified, and a wallet query returned all 14 rows.
- **Audit:** The migration blocker is resolved and real existing-key reads pass. The same-key race regression failed before the fix and passed after the fix. The unrelated type and protocol-fence failures listed above remain.
- **Current state:** The production database supports the new wallet fields. Application deployment remains pending.
