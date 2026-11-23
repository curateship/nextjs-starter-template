-- A Solana wallet address is base58, up to 44 characters. The column was
-- sized for an Ethereum address (0x plus 40 hex, 42 characters), and Postgres
-- refused the first Solana wallet with "value too long". 64 is the cap the
-- wallet API already enforces on the way in.
ALTER TABLE "trade_wallets" ALTER COLUMN "address" TYPE varchar(64);
