-- Connect-wallet onboarding: the app generates the agent key server-side and
-- the user's master wallet signs a Hyperliquid approveAgent action. A wallet
-- row now starts as `pending` (inert: is_active=false) until the approval is
-- confirmed on Hyperliquid via extraAgents.
-- 0018-0020 are reserved by the planned indicators/patterns/workflow tasks.

alter table wallets add column if not exists status varchar(10) not null default 'active';
alter table wallets add column if not exists created_via varchar(10) not null default 'imported';
alter table wallets add column if not exists agent_name varchar(64);
alter table wallets add column if not exists approval_valid_until timestamp with time zone;
-- In-flight approval fields ({ nonce, signatureChainId }); nulled on completion.
alter table wallets add column if not exists pending_action jsonb;

alter table wallets
  drop constraint if exists wallets_status_check;
alter table wallets
  add constraint wallets_status_check
  check (status in ('pending', 'active'));

alter table wallets
  drop constraint if exists wallets_created_via_check;
alter table wallets
  add constraint wallets_created_via_check
  check (created_via in ('imported', 'generated'));
