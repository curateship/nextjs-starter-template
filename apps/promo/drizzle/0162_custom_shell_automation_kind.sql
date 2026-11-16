-- A sequence is an automation drawn as a list of emails in the CRM's
-- Broadcasts section (Tyler, 16 Nov 2026: "create a tab for sequence"). The
-- column says which screen owns the row, so the Automations dashboard lists
-- flows only and the Sequence tab lists sequences only.
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "kind" varchar(20) NOT NULL DEFAULT 'flow';
ALTER TABLE "automations" DROP CONSTRAINT IF EXISTS "automations_kind_check";
ALTER TABLE "automations" ADD CONSTRAINT "automations_kind_check" CHECK ("kind" in ('flow', 'sequence'));
