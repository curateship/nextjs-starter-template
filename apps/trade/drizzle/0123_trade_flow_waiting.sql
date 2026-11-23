-- Why a switched-on flow has not placed a ladder on each of its coins.
--
-- A flow refusing every coin because the wallet has no free cash looked exactly
-- like a flow patiently waiting for the right price: both showed nothing
-- happening, and there was no way to tell them apart from outside. Every
-- refusal was thrown away the moment it was caught.
--
-- One entry per coin, replaced each time that coin is looked at and removed
-- when it finally gets a ladder:
--
--   { "hyperliquid:mainnet:ETH": { "code": "SMART_LADDER_NO_BASE", "at": 1755… } }
--
-- Only the app's own codes are ever stored here, never an exception's text — it
-- is written by a server and then drawn on a screen, and a message that carried
-- something secret would be kept forever.
ALTER TABLE "trade_flow_runs"
  ADD COLUMN IF NOT EXISTS "waiting" jsonb DEFAULT '{}'::jsonb NOT NULL;
