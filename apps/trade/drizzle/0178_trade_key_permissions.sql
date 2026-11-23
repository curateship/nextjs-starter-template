ALTER TABLE trade_wallets ADD COLUMN key_permission varchar(16) CHECK (key_permission IN ('trade-only', 'can-withdraw', 'unknown'));
ALTER TABLE trade_wallets ADD COLUMN key_permission_checked_at timestamptz;
