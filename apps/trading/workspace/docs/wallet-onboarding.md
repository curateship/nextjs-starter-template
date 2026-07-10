# Wallet Onboarding & Custody Model

How wallets get into the app, what the app can and cannot do with them, and
the checklist for going live. Written for the Wallets dashboard built July 2026
(task: `workspace/tasks/real-wallet-integration.md`).

## The three wallet types

| Type | What it is | How it's created |
|---|---|---|
| Paper | In-house simulation; orders fill against live market data, balances live only in this app | New Wallet → Paper wallet |
| Exchange (connected) | A real Hyperliquid account traded through an app-generated agent key | New Wallet → Connect real wallet |
| Exchange (imported) | Same, but you made and approved the agent key yourself on Hyperliquid | New Wallet → Import API wallet key |

## Custody model (what keys exist where)

- **Your master key never exists in this app.** The connect flow only asks your
  browser wallet (MetaMask etc.) for one EIP-712 *signature* — no transaction,
  no gas.
- **The agent (API) key is generated server-side** (`src/server/agent-onboarding.ts`),
  encrypted immediately with AES-256-GCM under `TRADING_MASTER_KEY`
  (`src/server/hyperliquid/keys.ts`), and never sent to the browser. The
  browser only ever sees the agent's *address*.
- **An agent key can trade but can never withdraw funds.** That is a
  Hyperliquid protocol guarantee, not an app promise. Revoke any agent at any
  time in Hyperliquid's API settings.
- `serializeWallet` (`src/server/wallets.ts`) is the single allowlist through
  which wallet rows reach the client; it never emits the encrypted key or the
  in-flight approval fields.

## The connect flow (who signs what)

1. **begin** — server generates the agent keypair, stores a `pending`
   (`is_active=false`, inert everywhere) wallet row, and returns the exact
   EIP-712 payload: domain `HyperliquidSignTransaction` v1 with the browser
   wallet's chain id, primary type `HyperliquidTransaction:ApproveAgent`,
   message `{ hyperliquidChain, agentAddress, agentName, nonce }`.
2. **sign** — the browser wallet signs via `eth_signTypedData_v4`.
3. **complete** — server recovers the signer and requires it to equal the
   stored master address (tamper check), relays
   `{ action, signature: {r,s,v}, nonce }` to Hyperliquid's `/exchange`,
   confirms the agent via `extraAgents`, stores `approval_valid_until`, and
   activates the row. Every attempt is written to the audit log
   (`agent.approve`).

Abandoned pending rows show "Awaiting approval" in the table (resume or delete
them there) and are swept automatically after 1 hour on the next begin.

**Renewal**: named approvals expire (~180 days — verify the real value on the
next E2E; `extraAgents.validUntil` is ground truth). The table warns under 14
days and offers Re-approve, which re-signs for the SAME agent address and key,
so running bots and nonce state are untouched.

## Mainnet gating

- `TRADING_ENABLE_MAINNET` (web AND worker) is the single hard gate; every
  signing path goes through `assertNetworkEnabled`
  (`src/server/hyperliquid/transport.ts`).
- UI additionally requires typing `MAINNET` to create/import a mainnet wallet
  or to create a live bot on a mainnet wallet.
- Go-live order: fund testnet → run the checklist below → set the flag →
  restart web + worker. Pause mainnet bots before ever flipping the flag off.

## Testnet live E2E checklist (before mainnet)

1. Fund a Hyperliquid testnet master account (faucet USDC); connect via
   MetaMask through New Wallet → Connect real wallet.
2. Confirm the agent appears under the master account's API wallets on
   app.hyperliquid-testnet.xyz with the expected name/expiry, and
   `approval_valid_until` in the DB matches `extraAgents`.
3. Manual trade with the generated agent: place a resting limit order, see it
   on the HL testnet UI, cancel it; audit rows populated, no key material in
   request/errorMessage.
4. Small live bot at tiny size: fills stream in; `kill -9` the worker mid-run,
   restart, verify the 5-minute reconciler converges against
   clearinghouseState/frontendOpenOrders.
5. Negative paths: reject the MetaMask signature (row stays pending, retry
   works); abandon at the sign step (pending row visible, resumable); import
   fallback still works.
6. Revoke the agent on the HL UI, run verify → the wallet is flagged inactive.
   Record the actual `validUntil` Hyperliquid assigned and the real named-agent
   slot limit in `workspace/tasks/real-wallet-integration.md`.
